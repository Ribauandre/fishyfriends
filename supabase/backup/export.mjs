// The nightly backup: copies every row out of the database, seals the copy to the admin's
// backup key, and writes the sealed file for the workflow to keep (.github/workflows/backup.yml).
//
//   DATABASE_URL=postgresql://... node supabase/backup/export.mjs --out <folder>
//   DATABASE_URL=postgresql://... node supabase/backup/export.mjs --record <folder>/run.json
//
// The first makes <folder>/fishyfriends-backup-<date>.ffbk and <folder>/run.json; the second,
// run after the file has been kept, notes that in the database so the admin page can say
// when the last backup was. Until the admin has made a key (the admin page, "Backups") there
// is nothing to seal a copy to, and this says so and makes nothing.
//
// What is copied: every table in public and archive, the accounts (auth.users and
// auth.identities — without them the rows have nobody to belong to), and storage's list of
// files for reference. NOT the files themselves: photos and license documents live in
// storage, not in rows. The structure isn't copied either; it is the migrations in this
// repository. restore.mjs is the way back; drill.mjs proves it works.
//
// This log is public. It gets counts, sizes and the key's fingerprint (a public key's
// checksum) — never a row, a name or an address.

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { connectVerified } from '../db.mjs';
import { fingerprintOf, readPublicKey, seal, peek } from './format.mjs';

export const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
export const qualified = (table) => `${quote(table.schema)}.${quote(table.name)}`;

// Which tables a copy holds. "data" is what a restore puts back; "reference" is carried for
// information only (storage's rows describe files this copy does not contain).
const TABLES_SQL = `
  select n.nspname as schema, c.relname as name,
    case when n.nspname = 'storage' then 'reference' else 'data' end as kind,
    row_security_active(c.oid) as filtered
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and not c.relispartition
    and (n.nspname in ('public', 'archive')
      or (n.nspname = 'auth' and c.relname in ('users', 'identities'))
      or (n.nspname = 'storage' and c.relname in ('buckets', 'objects')))
  order by 1, 2`;

const COLUMNS_SQL = `
  select a.attname as name, format_type(a.atttypid, a.atttypmod) as type,
    a.attgenerated <> '' as generated, a.attidentity <> '' as identity
  from pg_attribute a
  where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped
  order by a.attnum`;

// A role that row-level security applies to is handed only the rows a policy lets it see —
// on most of these tables, none — and everything would look fine: "no key has been made",
// or a copy with every table in it and no rows. The deploy's role owns the tables or is
// exempt; if that ever stops being true, this says so instead of keeping a backup with
// holes in it.
function refuseIfFiltered(tables) {
  const filtered = tables.filter((table) => table.filtered);
  if (filtered.length === 0) return;
  throw new Error(`Row-level security would hide rows of ${filtered.map((table) => `${table.schema}.${table.name}`).join(', ')} from this job, so a copy would be incomplete. Nothing was copied or kept. Run the backup as the role that owns the tables (the one the deploy uses).`);
}

// One consistent picture of the whole database: every table is read inside a single
// read-only snapshot, so a catch logged halfway through is in all of it or none of it.
// Returns the plain (gzipped) copy and what it holds.
export async function takeCopy(client, { takenAt = new Date().toISOString() } = {}) {
  const gzip = zlib.createGzip({ level: 9 });
  const chunks = [];
  gzip.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => { gzip.on('end', resolve); gzip.on('error', reject); });
  const line = (value) => gzip.write(`${typeof value === 'string' ? value : JSON.stringify(value)}\n`);

  const summary = [];
  await client.query('begin transaction isolation level repeatable read read only');
  try {
    const { rows: tables } = await client.query(TABLES_SQL);
    refuseIfFiltered(tables);
    const { rows: [{ version }] } = await client.query('select current_setting(\'server_version\') as version');
    const applied = await client.query('select filename from public._migrations_applied order by 1').then((result) => result.rows.map((row) => row.filename), () => []);
    line({ format: 'fishyfriends-backup', version: 1, takenAt, server: version, migrations: applied, tables: tables.length });
    for (const table of tables) {
      const id = `${table.schema}.${table.name}`;
      const { rows: columns } = await client.query(COLUMNS_SQL, [qualified(table)]);
      line({ table: id, kind: table.kind, columns });
      // Each row leaves as the database's own JSON text and is never parsed here, so a number
      // keeps every digit and a timestamp its offset.
      await client.query(`declare backup_rows no scroll cursor for select row_to_json(t)::text as line from only ${qualified(table)} t`);
      let count = 0;
      for (;;) {
        const { rows } = await client.query('fetch 500 from backup_rows');
        if (rows.length === 0) break;
        for (const row of rows) line(row.line);
        count += rows.length;
      }
      await client.query('close backup_rows');
      line({ end: id, rows: count });
      summary.push({ table: id, schema: table.schema, kind: table.kind, rows: count });
    }
    line({ done: true, tables: summary.length, rows: summary.reduce((total, table) => total + table.rows, 0) });
  } finally {
    await client.query('rollback').catch(() => {});
  }
  gzip.end();
  await finished;
  return { plain: Buffer.concat(chunks), tables: summary, rows: summary.reduce((total, table) => total + table.rows, 0), takenAt };
}

// The key the copies are sealed to: the current row of backup_keys, checked against its own
// fingerprint and for strength before anything is encrypted to it. null when none is set.
export async function currentKey(client) {
  const { rows } = await client.query('select public_key, fingerprint from public.backup_keys where retired_at is null');
  if (rows.length === 0) return null;
  const key = readPublicKey(rows[0].public_key);
  const print = fingerprintOf(key);
  if (print !== rows[0].fingerprint) throw new Error('The backup key in the database does not match its own fingerprint. Nothing was copied; set the key again on the admin page.');
  return { key, fingerprint: print };
}

async function output(pairs) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(pairs).map(([name, value]) => `${name}=${value}\n`).join(''));
}

async function makeBackup(folder) {
  const client = await connectVerified(process.env.DATABASE_URL, { carrying: 'a backup request' });
  try {
    // Before anything is believed, the key table included: can this role see every row?
    refuseIfFiltered((await client.query(TABLES_SQL)).rows);
    const has = await client.query('select to_regclass(\'public.backup_keys\') is not null as there');
    const sealTo = has.rows[0].there ? await currentKey(client) : null;
    if (!sealTo) {
      console.log('No backup key has been made yet, so there is nothing to seal a copy to. Nothing was copied.');
      console.log('The club admin makes the key on the admin page (Club admin > Backups); the next run after that makes the first backup.');
      await output({ made: 'false' });
      return;
    }
    const copy = await takeCopy(client);
    const stamp = copy.takenAt.slice(0, 10);
    const { sealed, header } = seal(copy.plain, sealTo.key, { takenAt: copy.takenAt, note: { tables: copy.tables.length, rows: copy.rows } });

    // Read back what is about to be kept: the file says what it should, and the copy inside
    // has a line for every row that was counted.
    if (peek(sealed).header.fingerprint !== sealTo.fingerprint) throw new Error('The sealed file does not name the key it was sealed to. Nothing was kept.');
    const lines = zlib.gunzipSync(copy.plain).toString('utf8').split('\n').length - 1;
    const expected = 2 + copy.tables.length * 2 + copy.rows;
    if (lines !== expected) throw new Error(`The copy has ${lines} lines where ${expected} were written. Nothing was kept.`);

    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `fishyfriends-backup-${stamp}.ffbk`);
    await writeFile(file, sealed);
    await writeFile(path.join(folder, 'run.json'), JSON.stringify({ fingerprint: header.fingerprint, bytes: sealed.length, tables: copy.tables.length, rows: copy.rows, takenAt: copy.takenAt }));

    const bySchema = {};
    for (const table of copy.tables) bySchema[table.schema] = (bySchema[table.schema] || 0) + table.rows;
    console.log(`Copied ${copy.rows.toLocaleString('en-US')} rows from ${copy.tables.length} tables (${Object.entries(bySchema).map(([schema, rows]) => `${schema}: ${rows.toLocaleString('en-US')}`).join(', ')}).`);
    console.log(`Sealed to backup key ${header.fingerprint.slice(0, 16)}… — ${Math.ceil(sealed.length / 1024).toLocaleString('en-US')} KB. Only that key's private half, which is not on GitHub or in the database, opens it.`);
    console.log('Not in it: photos and license documents (files in storage, not rows).');
    await output({ made: 'true', stamp, file });
  } finally {
    await client.end();
  }
}

async function recordBackup(runFile) {
  const run = JSON.parse(await readFile(runFile, 'utf8'));
  const client = await connectVerified(process.env.DATABASE_URL, { carrying: 'a note that the backup was kept', quiet: true });
  try {
    await client.query('insert into public.backup_runs (fingerprint, bytes, table_count, row_count) values ($1, $2, $3, $4)', [run.fingerprint, run.bytes, run.tables, run.rows]);
    // The admin page only ever looks at the last month; a year is plenty of history.
    await client.query('delete from public.backup_runs where finished_at < now() - interval \'400 days\'');
    const { rows: [{ kept }] } = await client.query('select count(*)::int as kept from public.backup_runs where finished_at > now() - interval \'30 days\'');
    console.log(`Noted in the database: the admin page now shows this backup as the latest (${kept} kept in the last 30 days).`);
  } finally {
    await client.end();
  }
}

async function main() {
  const [mode, target] = process.argv.slice(2);
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the Postgres connection string (the session pooler one the deploy uses).');
  if (mode === '--out' && target) await makeBackup(target);
  else if (mode === '--record' && target) await recordBackup(target);
  else throw new Error('Usage: node supabase/backup/export.mjs --out <folder>   |   --record <folder>/run.json');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

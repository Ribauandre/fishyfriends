// The way back from a backup made by export.mjs. Needs the PRIVATE half of the backup key:
// the key file the club admin downloaded from the admin page when backups were set up.
// Nothing else opens a backup — not GitHub, not the database, not this repository.
//
//   node supabase/backup/restore.mjs open --key <key file> --in <backup.ffbk>
//       Opens the file, checks it against its key and its own checksum, and says what is in
//       it: when it was taken and how many rows each table has. Changes nothing anywhere.
//       Add --out <file.ndjson.gz> to keep the opened copy (it is the club's data in the
//       clear: delete it when you are done).
//
//   DATABASE_URL=postgresql://... node supabase/backup/restore.mjs load --key <key file> --in <backup.ffbk>
//       Makes that database's rows equal to the backup's. The database must already have
//       the tables: replay the migrations into it first (node supabase/run-migrations.mjs).
//       It REPLACES what is there — every account and every row in public and archive — so
//       it refuses a database that has accounts in it unless --overwrite is given.
//
// Two ways this gets used:
//   * the project is gone: make a new Supabase project, replay the migrations, `load`.
//     Accounts come back with their passwords; photos and license documents do not (they
//     are files in storage and were never in a backup).
//   * something was deleted or mangled in the live project: do NOT load over it — that would
//     throw away everything since the backup. Load into a scratch Postgres (stub.sql + the
//     migrations, as the attack tests do) and copy back the rows that are missing by hand.
//
// drill.mjs runs this whole path against a scratch database and compares every table.

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { connectVerified } from '../db.mjs';
import { open as openSealed } from './format.mjs';
import { quote } from './export.mjs';

const split = (id) => { const at = id.indexOf('.'); return { schema: id.slice(0, at), name: id.slice(at + 1) }; };
const qualifiedId = (id) => { const { schema, name } = split(id); return `${quote(schema)}.${quote(name)}`; };

// The opened copy as tables: [{ table, kind, columns, rows: [json text, ...] }], checked
// against the counts the export wrote as it went.
export function readCopy(plain) {
  const lines = zlib.gunzipSync(plain).toString('utf8').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const head = JSON.parse(lines[0] || '{}');
  if (head.format !== 'fishyfriends-backup' || head.version !== 1) throw new Error('That is not a copy this version can read.');
  const tables = [];
  let current = null;
  let done = null;
  for (let index = 1; index < lines.length; index += 1) {
    const text = lines[index];
    if (!current) {
      const marker = JSON.parse(text);
      if (marker.done) { done = marker; continue; }
      if (!marker.table || !Array.isArray(marker.columns)) throw new Error(`The copy is out of order at line ${index + 1}.`);
      current = { table: marker.table, kind: marker.kind || 'data', columns: marker.columns, rows: [] };
      continue;
    }
    // A row is an object with the table's columns; the end marker is the only line with
    // exactly these two keys, and no table has columns named just "end" and "rows".
    if (text.startsWith('{"end":')) {
      const marker = JSON.parse(text);
      if (Object.keys(marker).length === 2 && marker.end === current.table && typeof marker.rows === 'number') {
        if (marker.rows !== current.rows.length) throw new Error(`${current.table} should have ${marker.rows} rows and the copy has ${current.rows.length}.`);
        tables.push(current);
        current = null;
        continue;
      }
    }
    current.rows.push(text);
  }
  if (current || !done) throw new Error('The copy is cut short: it ends partway through.');
  const rows = tables.reduce((total, table) => total + table.rows.length, 0);
  if (done.tables !== tables.length || done.rows !== rows) throw new Error('The copy does not add up to its own totals.');
  return { takenAt: head.takenAt, server: head.server, migrations: head.migrations || [], tables, rows };
}

// Parents before children, by the target's own foreign keys, so a row's owner is there
// before the row. Ties keep the copy's order.
async function parentsFirst(client, ids) {
  const { rows } = await client.query(`
    select (cn.nspname || '.' || c.relname) as child, (pn.nspname || '.' || p.relname) as parent
    from pg_constraint k
      join pg_class c on c.oid = k.conrelid join pg_namespace cn on cn.oid = c.relnamespace
      join pg_class p on p.oid = k.confrelid join pg_namespace pn on pn.oid = p.relnamespace
    where k.contype = 'f' and k.conrelid <> k.confrelid`);
  const wanted = new Set(ids);
  const waitingOn = new Map(ids.map((id) => [id, new Set()]));
  for (const { child, parent } of rows) if (wanted.has(child) && wanted.has(parent)) waitingOn.get(child).add(parent);
  const ordered = [];
  while (ordered.length < ids.length) {
    const ready = ids.filter((id) => !ordered.includes(id) && [...waitingOn.get(id)].every((parent) => ordered.includes(parent)));
    if (ready.length === 0) return { ordered: ids, circular: true };
    ordered.push(...ready);
  }
  return { ordered, circular: false };
}

// Makes the database's rows equal to the copy's, in one transaction: all of it or none.
export async function loadCopy(client, copy, { overwrite = false, log = () => {} } = {}) {
  // The target's own bookkeeping stays the target's: which migrations IT has had.
  const wanted = copy.tables.filter((table) => table.kind === 'data' && table.table !== 'public._migrations_applied');
  const present = new Set((await client.query(`
    select n.nspname || '.' || c.relname as id from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname in ('public', 'archive', 'auth')`)).rows.map((row) => row.id));
  const missing = wanted.filter((table) => !present.has(table.table));
  if (missing.some((table) => table.rows.length > 0)) {
    throw new Error(`This database has no ${missing.filter((table) => table.rows.length > 0).map((table) => table.table).join(', ')}. Replay the migrations into it first (node supabase/run-migrations.mjs); nothing was changed.`);
  }
  const loading = wanted.filter((table) => present.has(table.table));

  const { rows: [{ accounts }] } = await client.query('select count(*)::int as accounts from auth.users');
  if (accounts > 0 && !overwrite) {
    throw new Error(`This database already has ${accounts} account(s). Loading REPLACES every account and every row in public and archive with the backup's. If that is what you mean, run it again with --overwrite; nothing was changed.`);
  }

  const { ordered, circular } = await parentsFirst(client, loading.map((table) => table.table));
  const byId = new Map(loading.map((table) => [table.table, table]));

  await client.query('begin');
  try {
    // Clear what is there, children first and with the database's own rules still on, so
    // that anything hanging off a deleted account (its sessions, rows in a table newer than
    // the backup) goes with it rather than being left pointing at nothing.
    const clearing = (await client.query(`
      select n.nspname || '.' || c.relname as id from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p') and not c.relispartition and n.nspname in ('public', 'archive') and c.relname <> '_migrations_applied'`)).rows.map((row) => row.id);
    const clearOrder = await parentsFirst(client, clearing);
    for (const id of [...clearOrder.ordered].reverse()) await client.query(`delete from ${qualifiedId(id)}`);
    if (present.has('auth.identities')) await client.query('delete from auth.identities');
    await client.query('delete from auth.users');

    // Rows go back exactly as they were copied: no trigger restamps a name, and a row may
    // arrive before the one it points to. Where this role may not switch that off, the
    // parents-first order and triggers that leave unsigned writes alone do the same job.
    let asCopied = true;
    await client.query('savepoint as_copied');
    try {
      await client.query('set local session_replication_role = replica');
    } catch (problem) {
      await client.query('rollback to savepoint as_copied');
      asCopied = false;
      if (circular) throw new Error('These tables point at each other in a circle, and this role may not load rows out of order. Load as a role that may set session_replication_role.');
    }

    let total = 0;
    for (const id of ordered) {
      const table = byId.get(id);
      const { rows: columns } = await client.query(`
        select a.attname as name, a.attgenerated <> '' as generated
        from pg_attribute a where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`, [qualifiedId(id)]);
      const copied = new Set(table.columns.map((column) => column.name));
      // A column the database works out for itself is never written; one that has appeared
      // since the backup takes its default; one that has gone is left behind.
      const list = columns.filter((column) => !column.generated && copied.has(column.name)).map((column) => quote(column.name)).join(', ');
      for (let start = 0; start < table.rows.length; start += 200) {
        const batch = `[${table.rows.slice(start, start + 200).join(',')}]`;
        await client.query(`insert into ${qualifiedId(id)} (${list}) overriding system value select ${list} from json_populate_recordset(null::${qualifiedId(id)}, $1::json)`, [batch]);
      }
      const { rows: [{ now }] } = await client.query(`select count(*)::int as now from only ${qualifiedId(id)}`);
      if (now !== table.rows.length) throw new Error(`${id} has ${now} rows after loading ${table.rows.length}. Nothing was kept.`);
      total += now;
      log(`  ${id}: ${now}`);
    }

    // A counter that hands out ids has to start past the ones that just came back.
    const { rows: counters } = await client.query(`
      select n.nspname || '.' || c.relname as id, a.attname as col, pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) as seq
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where a.attnum > 0 and not a.attisdropped and c.relkind in ('r', 'p') and n.nspname in ('public', 'archive', 'auth')
        and pg_get_serial_sequence(quote_ident(n.nspname) || '.' || quote_ident(c.relname), a.attname) is not null`);
    for (const counter of counters.filter((entry) => byId.has(entry.id))) {
      await client.query(`select setval($1::regclass, greatest((select coalesce(max(${quote(counter.col)}), 0) from ${qualifiedId(counter.id)}), 1), (select count(*) > 0 from ${qualifiedId(counter.id)}))`, [counter.seq]);
    }
    await client.query('commit');
    return { tables: ordered.length, rows: total, asCopied };
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}

function argument(name) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : null;
}

async function main() {
  const mode = process.argv[2];
  const keyFile = argument('--key');
  const input = argument('--in');
  if (!['open', 'load'].includes(mode) || !keyFile || !input) {
    throw new Error('Usage: node supabase/backup/restore.mjs open --key <key file> --in <backup.ffbk> [--out <file.ndjson.gz>]\n       DATABASE_URL=... node supabase/backup/restore.mjs load --key <key file> --in <backup.ffbk> [--overwrite]');
  }
  const { plain, header } = openSealed(await readFile(input), await readFile(keyFile, 'utf8'));
  const copy = readCopy(plain);
  console.log(`Opened: a backup taken ${copy.takenAt}, sealed to key ${header.fingerprint.slice(0, 16)}…, checksum good.`);
  console.log(`${copy.rows.toLocaleString('en-US')} rows in ${copy.tables.length} tables (database at migration ${copy.migrations[copy.migrations.length - 1] || 'unknown'}).`);

  if (mode === 'open') {
    for (const table of copy.tables) console.log(`  ${table.table}: ${table.rows.length}${table.kind === 'reference' ? ' (for reference; the files themselves are not in a backup)' : ''}`);
    const out = argument('--out');
    if (out) {
      await writeFile(out, plain);
      console.log(`Wrote the opened copy to ${out}. It is the club's data in the clear: delete it when you are done.`);
    }
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to the database to load into.');
  const client = await connectVerified(process.env.DATABASE_URL, { carrying: 'a restore' });
  try {
    const target = await client.query('select filename from public._migrations_applied order by 1').then((result) => result.rows.map((row) => row.filename), () => []);
    const ahead = copy.migrations.filter((name) => !target.includes(name));
    if (ahead.length) console.log(`Note: the backup was taken ${ahead.length} migration(s) ahead of this database (${ahead[0]} onward). Columns this database doesn't have are left behind.`);
    const result = await loadCopy(client, copy, { overwrite: process.argv.includes('--overwrite'), log: console.log });
    console.log(`Loaded ${result.rows.toLocaleString('en-US')} rows into ${result.tables} tables${result.asCopied ? '' : ' (this role could not switch triggers off; rows went in parents first instead)'}.`);
    console.log('Not restored: photos and license documents (files in storage were never in a backup).');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

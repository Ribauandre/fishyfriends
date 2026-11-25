// A restore drill: a backup nobody has restored from is a hope, not a backup. This makes
// one from a scratch database and proves the whole way back, end to end:
//
//   a key pair made by the admin page's own code (src/utils/backupKey.js)
//     -> saved through set_backup_key() as the admin, fingerprints compared three ways
//     -> export.mjs copies and seals
//     -> the sealed file refuses a wrong key, an edited header, a flipped byte, a cut-off end
//     -> restore.mjs opens it and loads it into a second, empty database
//     -> every table is compared, row for row, between the two.
//
// Both databases are scratch ones set up like the attack tests' (stub.sql + the migrations);
// the source should have data in it — run attack-tests.mjs against it first, which seeds
// people, catches, trips and maps:
//
//   for db in fishy_security fishy_drill; do createdb $db && psql $db -f supabase/security/stub.sql \
//     && DATABASE_URL=postgresql://…/$db node supabase/run-migrations.mjs; done
//   DATABASE_URL=postgresql://…/fishy_security node supabase/security/attack-tests.mjs
//   SOURCE_URL=postgresql://…/fishy_security RESTORE_URL=postgresql://…/fishy_drill node supabase/backup/drill.mjs
//
// NEVER point either at the live database: this writes a key, rows and a table of its own
// into the first and REPLACES everything in the second.

import crypto from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { isLocal } from '../db.mjs';
import { fingerprintOf, open, peek, readPublicKey, seal, MAGIC } from './format.mjs';
import { currentKey, takeCopy } from './export.mjs';
import { loadCopy, readCopy } from './restore.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceUrl = process.env.SOURCE_URL;
const restoreUrl = process.env.RESTORE_URL;
if (!sourceUrl || !restoreUrl || sourceUrl === restoreUrl) {
  console.error('Set SOURCE_URL (a scratch database with data in it) and RESTORE_URL (a second, empty one). See the top of this file.');
  process.exit(1);
}
if (!isLocal(sourceUrl) || !isLocal(restoreUrl)) {
  console.error('Both databases must be local scratch ones. This drill writes to the first and replaces everything in the second.');
  process.exit(1);
}

let failed = 0;
function check(name, passed, detail = '') {
  if (!passed) failed += 1;
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}
const refuses = (name, attempt, saying) => {
  try {
    attempt();
    check(name, false, 'it opened');
  } catch (error) {
    check(name, saying.test(error.message), saying.test(error.message) ? '' : error.message);
  }
};

// One table's contents as a count and a checksum that doesn't depend on row order.
async function contents(client, id) {
  const [schema, name] = [id.slice(0, id.indexOf('.')), id.slice(id.indexOf('.') + 1)];
  const { rows: [row] } = await client.query(`select count(*)::int as rows, md5(coalesce(string_agg(h, '' order by h), '')) as sum from (select md5(row_to_json(t)::text) as h from only "${schema}"."${name}" t) s`);
  return row;
}

async function main() {
  // The admin page's own key maker, loaded as it is written (an ES module with no imports;
  // copied beside a .mjs name because this repository's .js files are the app's).
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'fishy-drill-'));
  await copyFile(path.join(here, '..', '..', 'src', 'utils', 'backupKey.js'), path.join(scratch, 'backupKey.mjs'));
  const { makeBackupKey, keyFileText } = await import(pathToFileURL(path.join(scratch, 'backupKey.mjs')).href);

  const source = new pg.Client({ connectionString: sourceUrl });
  const target = new pg.Client({ connectionString: restoreUrl });
  await source.connect();
  await target.connect();
  try {
    // --- A key, the way the admin makes one ----------------------------------------------
    const mine = await makeBackupKey();
    const other = await makeBackupKey({ bits: 3072 });
    check('the browser\'s key is one the job accepts (RSA, 4096 bits)', readPublicKey(mine.publicKey).asymmetricKeyDetails.modulusLength === 4096);
    check('browser and job agree on its fingerprint', fingerprintOf(mine.publicKey) === mine.fingerprint);

    const { rows: [admin] } = await source.query('select user_id from public.club_members where is_admin and status = \'approved\' limit 1');
    if (!admin) throw new Error('The source database has no admin. Run supabase/security/attack-tests.mjs against it first: it seeds the people and the data this drill copies.');
    const asAdmin = async (sql, values) => {
      await source.query('begin');
      try {
        await source.query('select set_config(\'request.jwt.claims\', $1, true)', [JSON.stringify({ sub: admin.user_id, role: 'authenticated' })]);
        await source.query('set local role authenticated');
        const result = await source.query(sql, values);
        await source.query('commit');
        return result;
      } catch (error) {
        await source.query('rollback');
        throw error;
      }
    };
    const { rows: [{ print }] } = await asAdmin('select public.set_backup_key($1) as print', [mine.publicKey]);
    check('the database works out the same fingerprint when the key is saved', print === mine.fingerprint);
    const sealTo = await currentKey(source);
    check('the job reads that key back as the current one', sealTo.fingerprint === mine.fingerprint);

    // --- Things a real project has that the seed doesn't -----------------------------------
    // Sign-in identities (a column the database works out for itself), the archive schema,
    // a table with a counter, and awkward values: every digit of a number, a timestamp with
    // microseconds, text with quotes, line breaks and other alphabets, bytes, an array.
    await source.query(`
      insert into auth.identities (user_id, provider, identity_data)
        select u.id, 'email', jsonb_build_object('email', upper(u.email), 'sub', u.id) from auth.users u
        where not exists (select 1 from auth.identities i where i.user_id = u.id);
      create schema if not exists archive;
      drop table if exists archive.drill_values;
      create table archive.drill_values (
        id bigserial primary key, amount numeric, ratio double precision, at timestamptz, note text,
        raw bytea, tags text[], extra jsonb, doubled integer generated always as ((id * 2)::integer) stored
      );
      insert into archive.drill_values (amount, ratio, at, note, raw, tags, extra) values
        (12345678901234567890.123456789012345678, 0.1::float8 + 0.2::float8, '2026-11-25 23:59:59.123456+00', E'quotes " '' and \\\\ and\\na line break, tab\\t, ünïcödé, 釣り, 🎣', '\\x00ff10', array['a,b', 'c "d"', null, ''], '{"k": [1, 2.50, null, {"deep": true}], "end": "x"}'),
        (-0.000000000000000001, 'Infinity', 'infinity', '', '\\x', array[]::text[], '[]'),
        (null, null, null, null, null, null, null);
      insert into archive.drill_values (id, note) values (41, 'a gap in the counter');
    `);
    await target.query('create schema if not exists archive; drop table if exists archive.drill_values;');
    await target.query('create table archive.drill_values (id bigserial primary key, amount numeric, ratio double precision, at timestamptz, note text, raw bytea, tags text[], extra jsonb, doubled integer generated always as ((id * 2)::integer) stored)');

    // --- Copy and seal ---------------------------------------------------------------------
    const copy = await takeCopy(source);
    const { sealed, header } = seal(copy.plain, sealTo.key, { takenAt: copy.takenAt });
    check(`copied ${copy.rows} rows from ${copy.tables.length} tables`, copy.rows > 30 && copy.tables.some((table) => table.table === 'auth.users' && table.rows > 0));
    check('the sealed file carries the key\'s fingerprint and nothing readable', header.fingerprint === mine.fingerprint && !sealed.subarray(peek(sealed).bodyAt).includes(Buffer.from('example.test')));

    const keyFile = keyFileText({ privateKey: mine.privateKey, fingerprint: mine.fingerprint });
    const opened = open(sealed, keyFile);
    check('the admin\'s key file opens it, and the contents match their checksum', opened.plain.equals(copy.plain));
    check('and so does the key pasted with its line breaks flattened', open(sealed, mine.privateKey.replace(/\n/g, ' ')).plain.equals(copy.plain));

    refuses('a different key is told it is the wrong key', () => open(sealed, other.privateKey), /sealed to a different key/);
    const flipped = Buffer.from(sealed); flipped[flipped.length - 40] ^= 1;
    refuses('one flipped bit in the data is refused', () => open(flipped, mine.privateKey), /altered or damaged/);
    const retold = Buffer.concat([MAGIC, Buffer.from(`${JSON.stringify({ ...header, takenAt: '2020-01-01T00:00:00.000Z' })}\n`), sealed.subarray(peek(sealed).bodyAt)]);
    refuses('an edited header is refused', () => open(retold, mine.privateKey), /altered or damaged/);
    refuses('a file cut short is refused', () => open(sealed.subarray(0, sealed.length - 100), mine.privateKey), /altered or damaged|cut short/);
    refuses('something that is not a backup is refused', () => open(Buffer.from('hello'), mine.privateKey), /not a Fishy Friends backup/);
    const weak = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
    refuses('the job will not seal to a short key', () => readPublicKey(weak), /at least 3072/);
    refuses('or to something that is not a key', () => readPublicKey('-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----'), /could not be read/);

    // --- Load into the empty database, and compare ------------------------------------------
    const read = readCopy(opened.plain);
    const result = await loadCopy(target, read, { overwrite: true });
    check(`loaded ${result.rows} rows into ${result.tables} tables, exactly as copied`, result.asCopied && result.rows > 30);

    const compared = read.tables.filter((table) => table.kind === 'data' && table.table !== 'public._migrations_applied');
    let different = 0;
    for (const table of compared) {
      const [before, after] = [await contents(source, table.table), await contents(target, table.table)];
      if (before.rows !== after.rows || before.sum !== after.sum) {
        different += 1;
        check(`${table.table} is the same in both`, false, `${before.rows} rows before, ${after.rows} after`);
      }
    }
    check(`all ${compared.length} tables are identical, row for row`, different === 0);

    const { rows: [{ worked }] } = await target.query('select count(*)::int as worked from auth.identities where email like \'%@example.test\'');
    check('a column the database works out for itself was left to it', worked > 0);
    const { rows: [{ next }] } = await target.query('insert into archive.drill_values (note) values (\'after the restore\') returning id as next');
    check('a counter carries on past the rows that came back', Number(next) === 42, `next id ${next}`);
    await target.query('delete from archive.drill_values where note = \'after the restore\'');

    // --- The guard rails ---------------------------------------------------------------------
    await loadCopy(target, read, {}).then(
      () => check('a database that has accounts in it is not overwritten without being told to', false, 'it loaded'),
      (error) => check('a database that has accounts in it is not overwritten without being told to', /--overwrite/.test(error.message)),
    );
    const again = await loadCopy(target, read, { overwrite: true });
    check('loading twice leaves the same rows, not double', again.rows === result.rows);
    const broken = { ...read, tables: read.tables.map((table) => (table.table === 'public.profiles' ? { ...table, rows: [...table.rows, table.rows[0]] } : table)) };
    await loadCopy(target, broken, { overwrite: true }).then(
      () => check('a copy that fails partway changes nothing', false, 'it loaded'),
      async () => check('a copy that fails partway changes nothing', (await contents(target, 'public.profiles')).sum === (await contents(source, 'public.profiles')).sum),
    );
  } finally {
    await source.query('drop table if exists archive.drill_values').catch(() => {});
    await target.query('drop table if exists archive.drill_values').catch(() => {});
    await source.end();
    await target.end();
    await rm(scratch, { recursive: true, force: true });
  }
  console.log(failed === 0 ? '\nThe restore drill passed: a backup made here comes back whole.' : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

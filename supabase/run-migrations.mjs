// Applies any .sql files in supabase/migrations/ that haven't been run against this
// database yet, tracked in a public._migrations_applied table. Every file in that
// folder is written to be idempotent (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS
// before CREATE POLICY, etc.) as defense in depth, but the tracking table means a normal
// deploy only actually executes whatever is new.
//
// Requires a Postgres connection string (not the publishable/anon key the app uses) in
// DATABASE_URL — from the Supabase dashboard: Project Settings -> Database -> Connection
// string -> URI, using the "Session pooler" mode. GitHub Actions runners have no IPv6
// egress, and Supabase's direct connection (port 5432 on db.<project>.supabase.co) is
// IPv6-only, so it times out from CI; the session pooler is IPv4-reachable and, unlike
// the transaction pooler, keeps one session per connection, so this script's per-file
// BEGIN/COMMIT transactions work correctly.
//
// Usage: DATABASE_URL=postgresql://... node supabase/run-migrations.mjs

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Set DATABASE_URL to a direct Postgres connection string before running this script.');
    process.exit(1);
  }

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No migration files found in supabase/migrations/.');
    return;
  }

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query(`
      create table if not exists public._migrations_applied (
        filename text primary key,
        applied_at timestamptz not null default now()
      );
    `);

    const { rows } = await client.query('select filename from public._migrations_applied');
    const alreadyApplied = new Set(rows.map((row) => row.filename));

    let ranCount = 0;
    for (const file of files) {
      if (alreadyApplied.has(file)) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`apply ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into public._migrations_applied (filename) values ($1)', [file]);
        await client.query('commit');
        ranCount += 1;
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
    }

    console.log(ranCount === 0 ? 'Database already up to date.' : `Applied ${ranCount} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

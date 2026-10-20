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
      -- Bookkeeping for this script only: keep it out of the Data API. RLS with no policies
      -- shuts out anon and authenticated; this script connects as the table's owner, which
      -- RLS doesn't apply to.
      alter table public._migrations_applied enable row level security;
      do $$
      begin
        if exists (select 1 from pg_roles where rolname = 'anon') then
          revoke all on table public._migrations_applied from anon, authenticated;
        end if;
      end $$;
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

    // A table in public without row-level security can be read and written by anyone holding
    // the site's public key, and Supabase's security advisor flags it (rls_disabled_in_public).
    // Check the whole live schema on every deploy, not just what this run touched, and stop the
    // deploy rather than ship next to an open table.
    const { rows: openTables } = await client.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      order by c.relname
    `);
    if (openTables.length) {
      throw new Error(`Row-level security is off on public.${openTables.map((row) => row.relname).join(', public.')}. Enable it in a migration (and add policies) before deploying.`);
    }
    console.log('Row-level security is on for every table in public.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

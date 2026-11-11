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
  // A migration's own RAISE NOTICE lines (counts, what it skipped) belong in the deploy log;
  // Postgres's "already exists, skipping" notices from idempotent DDL don't (code 00000 is
  // a plain RAISE NOTICE).
  client.on('notice', (message) => { if (message.code === '00000') console.log(`  ${message.message}`); });

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

    await checkSecurityPosture(client);
  } finally {
    await client.end();
  }
}

// What the audit of November 2026 found was almost all drift: a storage policy made by hand
// in the dashboard that let anyone read and overwrite every file, select policies with no
// role on them, grants Supabase used to hand out by default. None of it was visible from
// the repository, and row-level security being "on" said nothing about any of it. So after
// every migration run the LIVE database is held to what the app is supposed to be:
//
//   * nobody signed out can touch a table or view in public, by any grant;
//   * every policy in public is for signed-in accounts (`to authenticated`), never for anon
//     or for everyone — who is a member is then the policy's own question (is_member());
//   * the functions that run with their owner's rights can't be called signed out, apart
//     from the ones listed here, and each pins its search_path;
//   * a view doesn't quietly read with its owner's rights;
//   * storage has exactly the policies the migrations made, row-level security on, and the
//     license bucket private.
//
// A failure stops the deploy and names the table, function or bucket — never a policy's
// name or text, which can hold someone's email (one did), and never data: this log is public.
// To change what is allowed, change the lists here in the same commit as the migration.
const ANON_MAY_CALL = ['club_stats'];
const STORAGE_POLICIES = [
  'Admin reads stored photos', 'Admin replaces stored photos',
  'Members delete their own files', 'Members read their own files',
  'Members replace their own files', 'Members upload into their own folder',
];

async function checkSecurityPosture(client) {
  const problems = [];
  const names = (rows, key = 'name') => rows.map((row) => row[key]).join(', ');

  const { rows: anonTables } = await client.query(`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and exists (select 1 from pg_roles where rolname = 'anon')
      and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
        or has_any_column_privilege('anon', c.oid, 'select, insert, update, references'))
    order by 1
  `);
  if (anonTables.length) problems.push(`Signed-out visitors (the anon role) hold a grant on public.${names(anonTables).replace(/, /g, ', public.')}. Revoke it: "revoke all on table … from anon".`);

  const { rows: openPolicies } = await client.query(`
    select c.relname as name, count(*)::int as policies
    from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (pol.polroles = '{0}' or exists (select 1 from pg_roles r where r.oid = any (pol.polroles) and r.rolname = 'anon'))
    group by 1 order by 1
  `);
  if (openPolicies.length) problems.push(`A policy applies to signed-out visitors or to everyone on public.${names(openPolicies).replace(/, /g, ', public.')}. Write every policy "to authenticated" and have it ask public.is_member().`);

  const { rows: openFunctions } = await client.query(`
    select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and exists (select 1 from pg_roles where rolname = 'anon')
      and has_function_privilege('anon', p.oid, 'execute')
      and not (p.proname = any ($1))
    order by 1
  `, [ANON_MAY_CALL]);
  if (openFunctions.length) problems.push(`Signed-out visitors can call owner-rights function(s) public.${names(openFunctions).replace(/, /g, ', public.')}. Revoke: "revoke all on function … from public, anon".`);

  const { rows: loosePaths } = await client.query(`
    select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) setting where setting like 'search_path=%')
    order by 1
  `);
  if (loosePaths.length) problems.push(`Owner-rights function(s) public.${names(loosePaths).replace(/, /g, ', public.')} don't pin search_path. Add "set search_path = ''" (and schema-qualify what they use).`);

  const { rows: ownerViews } = await client.query(`
    select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and not exists (select 1 from unnest(coalesce(c.reloptions, '{}')) option where option in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1'))
      and exists (select 1 from pg_roles where rolname = 'authenticated')
      and has_table_privilege('authenticated', c.oid, 'select')
    order by 1
  `);
  if (ownerViews.length) problems.push(`View(s) public.${names(ownerViews).replace(/, /g, ', public.')} are readable by any signed-in account and read with their owner's rights, past row-level security. Create them "with (security_invoker = true)", or revoke the grant.`);

  // Storage is Supabase's schema; a plain Postgres used for a local replay may not have it.
  const { rows: [{ has_storage: hasStorage }] } = await client.query("select to_regclass('storage.objects') is not null as has_storage");
  if (hasStorage) {
    const { rows: storageRls } = await client.query(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname in ('objects', 'buckets') and not c.relrowsecurity order by 1
    `);
    if (storageRls.length) problems.push(`Row-level security is off on storage.${names(storageRls).replace(/, /g, ', storage.')}.`);

    const { rows: storagePolicies } = await client.query(`
      select pol.polname as name, c.relname as tbl,
        (pol.polroles = '{0}' or exists (select 1 from pg_roles r where r.oid = any (pol.polroles) and r.rolname = 'anon')) as open
      from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname in ('objects', 'buckets')
    `);
    const unexpected = storagePolicies.filter((policy) => policy.tbl !== 'objects' || !STORAGE_POLICIES.includes(policy.name));
    const missing = STORAGE_POLICIES.filter((name) => !storagePolicies.some((policy) => policy.tbl === 'objects' && policy.name === name));
    const open = storagePolicies.filter((policy) => policy.open);
    if (unexpected.length) problems.push(`Storage has ${unexpected.length} policy/policies the migrations didn't make (${unexpected.filter((policy) => policy.tbl === 'buckets').length} of them on storage.buckets). One made by hand is how every file became readable and writable by anyone; remove them in the dashboard (Storage > Policies) or in a migration.`);
    if (missing.length) problems.push(`Storage is missing ${missing.length} of the policies the app needs (uploads or the admin's photo clean-up will be refused).`);
    if (open.length) problems.push(`${open.length} storage policy/policies apply to signed-out visitors or to everyone.`);

    const { rows: publicLicenses } = await client.query("select id from storage.buckets where id = 'fishing-licenses' and public");
    if (publicLicenses.length) problems.push('The fishing-licenses bucket is public. It holds people\'s license documents: set it private.');
  }

  if (problems.length) {
    throw new Error(`Security check failed — the live database is more open than the app expects:\n  - ${problems.join('\n  - ')}`);
  }
  console.log('Security checks passed: nothing in public is reachable signed out, every policy is for signed-in accounts, owner-rights functions are closed, and storage has only the policies the migrations made.');

  // Not a failure, but nobody could approve a sign-up: say so.
  const { rows: [{ has_members: hasMembers }] } = await client.query("select to_regclass('public.club_members') is not null as has_members");
  if (hasMembers) {
    const { rows: [counts] } = await client.query("select count(*) filter (where status = 'approved')::int as members, count(*) filter (where status = 'approved' and is_admin)::int as admins from public.club_members");
    if (counts.members > 0 && counts.admins === 0) console.log('WARNING: the club has members but no admin, so nobody can approve a sign-up.');
    else console.log(`Club: ${counts.members} member(s), ${counts.admins} admin(s).`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

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
import { connectVerified } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

// Two runs at once (two deploys close together, or a deploy and someone's laptop) would
// both read "not applied yet" and both run the same file. One holds this lock at a time.
const MIGRATION_LOCK = 4827431905;

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

  // Encrypted, and to a server that has proved it is Supabase's (db.mjs), before the password
  // or a migration is sent anywhere.
  const client = await connectVerified(connectionString, { carrying: 'a migration' });
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

    await takeMigrationLock(client);
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

// A session lock, so it is let go when this script disconnects, however it ends.
async function takeMigrationLock(client) {
  for (let waited = 0; ; waited += 5) {
    const { rows: [{ locked }] } = await client.query('select pg_try_advisory_lock($1::bigint) as locked', [MIGRATION_LOCK]);
    if (locked) return;
    if (waited === 0) console.log('Another migration run is in progress; waiting for it to finish.');
    if (waited >= 600) throw new Error('Another migration run has held the lock for ten minutes. Nothing was applied by this one.');
    await new Promise((resolve) => setTimeout(resolve, 5000));
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
  "Members view the crew's photos",
];
// What may listen and announce on the app's private live channels (migration 0045): members,
// on the topics the app uses. Anything else on realtime.messages is drift.
const REALTIME_POLICIES = ["Members listen on the club's channels", 'Members announce themselves on the dock'];
// The only policies that may name the license bucket: each is tied to the owner's own folder.
const LICENSE_POLICIES = [
  'Members delete their own files', 'Members read their own files',
  'Members replace their own files', 'Members upload into their own folder',
];

async function checkSecurityPosture(client) {
  const problems = [];
  let photoState = '';
  let liveState = '';
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

    // A policy that reaches the license bucket without being one of the own-folder four, or
    // one with no bucket named at all (it then covers every bucket, licenses included).
    const { rows: licenseReach } = await client.query(`
      select pol.polname as name from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'storage' and c.relname = 'objects'
        and (
          coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%fishing-licenses%'
          or coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') not like '%bucket_id%'
        )
    `);
    const reaching = licenseReach.filter((policy) => !LICENSE_POLICIES.includes(policy.name));
    if (reaching.length) problems.push(`${reaching.length} storage policy/policies reach the license bucket beyond a member's own folder.`);

    const { rows: [photoBuckets] } = await client.query(`
      select count(*)::int as total, count(*) filter (where not public)::int as private
      from storage.buckets where id in ('photos', 'avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches')
    `);
    photoState = photoBuckets.total === 0 ? '' : photoBuckets.private === photoBuckets.total
      ? 'Photos: private. They load only through signed links a member is handed.'
      : `Photos: ${photoBuckets.total - photoBuckets.private} of ${photoBuckets.total} photo buckets still open to anyone holding a photo's address (the admin page has the switch).`;
  }

  // Private live channels are authorised by policies on Realtime's own table. One nobody wrote
  // here, or one for signed-out visitors, would let strangers onto them; the two the app
  // needs being absent only means the app is still using open channels (it falls back), which
  // is said, not failed.
  const { rows: [{ has_realtime: hasRealtime }] } = await client.query("select to_regclass('realtime.messages') is not null as has_realtime");
  if (hasRealtime) {
    const { rows: realtimePolicies } = await client.query(`
      select pol.polname as name,
        (pol.polroles = '{0}' or exists (select 1 from pg_roles r where r.oid = any (pol.polroles) and r.rolname = 'anon')) as open
      from pg_policy pol where pol.polrelid = 'realtime.messages'::regclass
    `);
    const unexpectedLive = realtimePolicies.filter((policy) => !REALTIME_POLICIES.includes(policy.name));
    const openLive = realtimePolicies.filter((policy) => policy.open);
    const missingLive = REALTIME_POLICIES.filter((name) => !realtimePolicies.some((policy) => policy.name === name));
    if (unexpectedLive.length) problems.push(`Realtime has ${unexpectedLive.length} policy/policies on realtime.messages the migrations didn't make: private channels may be open to accounts that aren't members. Remove them in the dashboard (Realtime > Policies) or in a migration.`);
    if (openLive.length) problems.push(`${openLive.length} policy/policies on realtime.messages apply to signed-out visitors or to everyone.`);
    liveState = missingLive.length
      ? `Live channels: ${missingLive.length} of the ${REALTIME_POLICIES.length} members-only rules are missing, so the app is using open channels.`
      : 'Live channels: members-only rules in place. (Whether open channels are still allowed is a Realtime setting the admin page reports.)';
  }

  if (problems.length) {
    throw new Error(`Security check failed — the live database is more open than the app expects:\n  - ${problems.join('\n  - ')}`);
  }
  console.log('Security checks passed: nothing in public is reachable signed out, every policy is for signed-in accounts, owner-rights functions are closed, and storage has only the policies the migrations made.');
  if (photoState) console.log(photoState);
  if (liveState) console.log(liveState);
  await reportLimits(client);

  // Not a failure, but nobody could approve a sign-up: say so.
  const { rows: [{ has_members: hasMembers }] } = await client.query("select to_regclass('public.club_members') is not null as has_members");
  if (hasMembers) {
    const { rows: [counts] } = await client.query("select count(*) filter (where status = 'approved')::int as members, count(*) filter (where status = 'approved' and is_admin)::int as admins from public.club_members");
    if (counts.members > 0 && counts.admins === 0) console.log('WARNING: the club has members but no admin, so nobody can approve a sign-up.');
    else console.log(`Club: ${counts.members} member(s), ${counts.admins} admin(s).`);
  }
}

// The limits of migration 0047 are written to let a write through if their own counting
// ever fails, so that a surprise in this database can't stop the club posting or uploading.
// That makes "are they actually working here?" a question to ask on every deploy rather than
// assume. Neither answer fails the deploy; both are said.
async function reportLimits(client) {
  const { rows: [{ there }] } = await client.query("select to_regprocedure('public.storage_room()') is not null and to_regclass('public.write_counts') is not null as there");
  if (!there) return;

  // The upload ceiling says so itself when it couldn't work its answer out.
  let ceiling = 'could not be asked';
  try {
    const { rows: [{ room }] } = await client.query('select public.storage_room() as room');
    ceiling = room && room.unknown ? 'NOT working (it cannot read storage\'s tables here, so uploads are not held to it)' : 'working';
  } catch (error) {
    ceiling = `could not be asked (${error.code || 'error'})`;
  }

  // The daily count: add one row as a made-up account, look for its count, roll all of it
  // back. Nothing is left behind, and nothing outside this transaction ever sees the row.
  let counting = 'could not be tried';
  await client.query('begin');
  try {
    const { rows: [{ who }] } = await client.query('select gen_random_uuid() as who');
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: 'authenticated' })]);
    await client.query('insert into public.custom_species (name) values ($1)', [`limit check ${who}`]);
    const { rows } = await client.query("select n from public.write_counts where user_id = $1 and what = 'custom_species'", [who]);
    counting = rows.length === 1 && rows[0].n === 1 ? 'working' : 'NOT working (a row was added and not counted, so nothing is held to the daily limits)';
  } catch (error) {
    counting = `could not be tried (${error.code || 'error'})`;
  } finally {
    await client.query('rollback').catch(() => {});
  }
  console.log(`Limits: daily counts ${counting}; upload ceiling ${ceiling}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

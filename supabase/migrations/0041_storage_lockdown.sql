-- Storage: only the member who owns a file can list it, read it through the API, replace it
-- or delete it. Nobody signed out can list anything.
--
-- A signed-out visitor holding the site's public key (it ships in the bundle) could list
-- every bucket and every file in it, and download the files in the *private*
-- fishing-licenses bucket. Two causes:
--
--   1. Every photo bucket had an "Anyone can view …" select policy with no role on it. A
--      public bucket serves a file to whoever has its exact URL without consulting any
--      policy, so that policy was never what made the photos show — all it added was the
--      ability to list the bucket, which hands out every member's user id (the folder
--      names) and every file name.
--   2. The live project carries storage policies no migration made (the "photos" bucket and
--      its rules were set up by hand in the dashboard), and one of them let anyone read
--      objects whatever the bucket — including the license files.
--
-- So this drops every policy on storage.objects and storage.buckets, whoever made it, and
-- creates the only four the app needs. The app uploads to `{user id}/…`, replaces
-- (upsert), deletes and — for licenses — signs a URL, each of which needs the owner to be
-- able to select their own object. Photos in the public buckets still load by their URL;
-- those URLs are only handed out by tables.
--
-- What it reports is counts and shapes, never a policy's name or text: a hand-made policy
-- can have a member's email in it, and this log is public.

do $$
declare
  p record;
  mine constant text[] := array[
    'Anyone can view avatars', 'Members can upload their avatar', 'Members can update their avatar',
    'Anyone can view personal best photos', 'Members can upload their personal best photos',
    'Members can update their personal best photos', 'Members can delete their personal best photos',
    'Anyone can view fish year catch photos', 'Members can upload their fish year catch photos',
    'Members can delete their fish year catch photos',
    'Anyone can view tournament entry photos', 'Members can upload their tournament entry photos',
    'Members can delete their tournament entry photos',
    'Anglers view their own license photos', 'Anglers upload their own license photos',
    'Anglers update their own license photos', 'Anglers delete their own license photos',
    'Anyone can view trip catch photos', 'Anglers upload their own trip catch photos',
    'Anglers delete their own trip catch photos',
    'Members read their own files', 'Members upload into their own folder',
    'Members replace their own files', 'Members delete their own files'
  ];
  dropped integer := 0;
  foreign_made integer := 0;
  stuck integer := 0;
begin
  for p in
    select pol.polname as name, c.relname as tbl,
      case pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end as cmd,
      coalesce((select string_agg(r.rolname, ', ' order by r.rolname) from pg_roles r where r.oid = any (pol.polroles)), 'everyone') as roles,
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') as using_expr,
      coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as check_expr
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname in ('objects', 'buckets')
  loop
    if not (p.name = any (mine)) then
      foreign_made := foreign_made + 1;
      raise notice 'storage: a policy no migration made — % on storage.% for %; unconditional: %, names a bucket: %, checks who is asking: %',
        p.cmd, p.tbl, p.roles,
        (p.using_expr in ('', 'true') and p.check_expr in ('', 'true')),
        ((p.using_expr || p.check_expr) like '%bucket_id%'),
        ((p.using_expr || p.check_expr) ~ 'auth\.(uid|role|jwt|email)');
    end if;
    begin
      execute format('drop policy %I on storage.%I', p.name, p.tbl);
      dropped := dropped + 1;
    exception when insufficient_privilege then
      stuck := stuck + 1;
      raise notice 'storage: could not drop a % policy on storage.% (not permitted for this role)', p.cmd, p.tbl;
    end;
  end loop;
  raise notice 'storage: dropped % policies (% of them made outside the migrations), % could not be dropped', dropped, foreign_made, stuck;
  if exists (
    select 1 from pg_policy pol join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
  ) then
    raise exception 'storage.objects still has a policy this migration could not remove; remove it in the Supabase dashboard (Storage > Policies) and deploy again';
  end if;
end $$;

create policy "Members read their own files" on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Members upload into their own folder" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Members replace their own files" on storage.objects for update to authenticated
  using (
    bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Members delete their own files" on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Policies only count while row-level security is on. It is on by default and the project
-- owner can't normally turn it off, but this is the layer everything above rests on, so
-- look rather than assume.
do $$
declare
  t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname in ('objects', 'buckets') and not c.relrowsecurity
  loop
    begin
      execute format('alter table storage.%I enable row level security', t.relname);
      raise notice 'storage: row-level security was OFF on storage.% and has been turned on', t.relname;
    exception when insufficient_privilege then
      raise exception 'Row-level security is off on storage.% and this role may not turn it on. Turn it on in the Supabase dashboard before deploying.', t.relname;
    end;
  end loop;
end $$;

-- The license bucket stays private whatever the dashboard says.
update storage.buckets set public = false where id = 'fishing-licenses' and public;

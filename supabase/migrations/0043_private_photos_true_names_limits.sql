-- Second round after the November 2026 audit. Three things, none of which the first round
-- had to do to stop the bleeding:
--
--   1. A way to make the crew's photos private. A photo bucket is "public" in Supabase's
--      sense: whoever holds a photo's exact address can open it, signed in or not, for
--      good. Until 0041 those addresses were listable by anyone, and until 0042 the tables
--      holding them were readable signed out — so every address that existed then has to
--      be assumed copied. Private buckets end that: a photo then only loads through a
--      short-lived signed link, which only a member can get. This file adds what that
--      needs (members may read photo objects, which is what signing checks) and the
--      switch itself, which the admin flips from the admin page once the crew's phones
--      run the version of the app that asks for signed links — flipping it under an older
--      version would show them broken images. It can be flipped back.
--   2. Names that can't be faked. Catches, comments, expenses and notifications carry a
--      snapshot of the poster's name (and sometimes photo) that the CLIENT filled in, and
--      the policies only pinned the account id — so a member could post as "Kevin", or
--      send a notification that read as coming from the admin. A trigger now writes those
--      columns from the profile of the account the row names.
--   3. Limits on how much text a row can hold. Nothing capped it, so one account could
--      store megabytes in a bio or a comment and make a page everyone loads unusable.

-- ---------------------------------------------------------------------------
-- 1. Photos: members can be handed signed links, and the admin can close the buckets
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Members view the crew''s photos') then
    drop policy "Members view the crew's photos" on storage.objects;
  end if;
end $$;
-- Reading an object is what the Storage API checks before signing a link to it. Photos
-- only: the license bucket stays with its owner (0042's "Members read their own files").
create policy "Members view the crew's photos" on storage.objects for select to authenticated
  using (
    (select public.is_member())
    and bucket_id in ('photos', 'avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches')
  );

-- Are the photo buckets private? The app asks once after sign-in, to know whether to show a
-- photo by its stored address or to ask for a signed link first.
create or replace function public.photo_privacy()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(not b.public), false)
  from storage.buckets b
  where b.id in ('photos', 'avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches');
$$;

-- The switch. Admin only; true closes the photo buckets, false opens them again.
create or replace function public.set_photo_privacy(make_private boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the club admin can change how photos are served.' using errcode = '42501';
  end if;
  if make_private is null then
    raise exception 'Say true (private) or false (open by address).' using errcode = '22023';
  end if;
  update storage.buckets b set public = not make_private
  where b.id in ('photos', 'avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches');
  return make_private;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The name on a row is the name of the account on the row
-- ---------------------------------------------------------------------------
-- Arguments come in threes: the column holding an account id, the column holding that
-- account's name, and the column holding its photo ('' when the table has none). Whatever
-- the client sent for the name and photo is replaced with the profile's — 'Angler' where the
-- profile has no name, never what was sent, or blanking your own name would be the way
-- round. Rows written with no signed-in account behind them (a migration, the dashboard,
-- the service key) are left exactly as written. An id column that is null (an unclaimed
-- packing item) blanks its name.
create or replace function public.stamp_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i integer := 0;
  account uuid;
  profile_name text;
  profile_photo text;
  patch jsonb := '{}'::jsonb;
  photo_column text;
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  while i + 2 < tg_nargs loop
    account := nullif(to_jsonb(new) ->> tg_argv[i], '')::uuid;
    photo_column := nullif(tg_argv[i + 2], '');
    if account is null then
      patch := patch || jsonb_build_object(tg_argv[i + 1], '');
    else
      profile_name := null;
      profile_photo := null;
      select p.display_name, p.avatar_url into profile_name, profile_photo
      from public.profiles p where p.id = account;
      patch := patch || jsonb_build_object(tg_argv[i + 1], coalesce(nullif(btrim(profile_name), ''), 'Angler'));
      if photo_column is not null then
        patch := patch || jsonb_build_object(photo_column, coalesce(profile_photo, ''));
      end if;
    end if;
    i := i + 3;
  end loop;
  return jsonb_populate_record(new, patch);
end;
$$;

-- A pending invitation shows the map's name to someone who can't read the map yet, so that
-- name is a snapshot too — taken from the map, not from whoever sent the invitation.
create or replace function public.stamp_map_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  new.map_name := coalesce((select m.name from public.waypoint_maps m where m.id = new.map_id), new.map_name);
  return new;
end;
$$;

do $$
declare
  t record;
  stamped integer := 0;
begin
  for t in
    select * from (values
      ('fish_year_catches', 'insert', array['user_id', 'angler_name', 'angler_avatar_url']),
      ('tournament_entries', 'insert', array['user_id', 'angler_name', 'angler_avatar_url']),
      ('personal_best_comments', 'insert', array['user_id', 'author_name', '']),
      ('fish_year_catch_comments', 'insert', array['user_id', 'author_name', '']),
      ('tournament_entry_comments', 'insert', array['user_id', 'author_name', '']),
      ('notifications', 'insert', array['actor_id', 'actor_name', '']),
      ('tournaments', 'insert', array['created_by', 'created_by_name', '']),
      ('game_catches', 'insert', array['user_id', 'angler_name', '']),
      ('bug_reports', 'insert', array['user_id', 'angler_name', '']),
      ('waypoints', 'insert', array['created_by', 'created_by_name', '']),
      ('trips', 'insert or update', array['created_by', 'created_by_name', '']),
      ('trip_attendees', 'insert', array['user_id', 'angler_name', '']),
      ('trip_expenses', 'insert', array['paid_by', 'paid_by_name', '']),
      ('trip_settlements', 'insert', array['from_user', 'from_name', '', 'to_user', 'to_name', '']),
      ('trip_items', 'insert or update', array['claimed_by', 'claimed_by_name', '']),
      ('trip_catches', 'insert', array['user_id', 'angler_name', ''])
    ) as v(tbl, events, args)
  loop
    -- The stamp reads columns by name, and a table that has drifted from these files (a
    -- column renamed by hand) would have its names blanked instead of filled: leave such a
    -- table alone and say so.
    if exists (
      select 1 from unnest(t.args) as arg
      where arg <> '' and not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t.tbl and c.column_name = arg
      )
    ) then
      raise notice 'names: public.% does not have the columns the stamp expects and was left alone', t.tbl;
      continue;
    end if;
    execute format(
      'create or replace trigger stamp_names before %s on public.%I for each row execute function public.stamp_names(%s)',
      t.events, t.tbl, (select string_agg(quote_literal(arg), ', ') from unnest(t.args) as arg)
    );
    stamped := stamped + 1;
  end loop;
  create or replace trigger stamp_map_name before insert on public.waypoint_map_members
    for each row execute function public.stamp_map_name();
  raise notice 'names: % tables now take the poster''s name from their account', stamped + 1;
end $$;

-- New owner-rights functions: closed to signed-out visitors like the rest (the deploy check
-- insists). The two trigger functions are closed to everyone: a trigger fires whoever holds
-- what, and nothing should be calling them by name.
revoke all on function public.photo_privacy() from public, anon;
revoke all on function public.set_photo_privacy(boolean) from public, anon;
do $$
begin
  revoke all on function public.stamp_names() from public;
  revoke all on function public.stamp_map_name() from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.stamp_names() from anon, authenticated;
    revoke all on function public.stamp_map_name() from anon, authenticated;
  end if;
end $$;
grant execute on function public.photo_privacy() to authenticated, service_role;
grant execute on function public.set_photo_privacy(boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. How much a row can hold
-- ---------------------------------------------------------------------------
-- Far above anything the app's forms produce, so nobody meets one by accident. A limit is
-- only added where every existing row already fits: a check that existing rows fail would
-- block any later edit of those rows, so such a column is reported (a count) and left.
do $$
declare
  r record;
  constraint_name text;
  over bigint;
  added integer := 0;
  skipped integer := 0;
  missing integer := 0;
begin
  for r in
    select * from (values
      ('profiles', 'display_name', 80), ('profiles', 'home_water', 120), ('profiles', 'favorite_species', 80),
      ('profiles', 'bio', 2000), ('profiles', 'avatar_url', 600), ('profiles', 'venmo_handle', 64),
      ('personal_bests', 'species', 80), ('personal_bests', 'size_label', 80), ('personal_bests', 'photo_url', 600),
      ('personal_best_comments', 'author_name', 80), ('personal_best_comments', 'body', 4000),
      ('fish_year_catches', 'angler_name', 80), ('fish_year_catches', 'species', 80), ('fish_year_catches', 'month', 20),
      ('fish_year_catches', 'photo_url', 600), ('fish_year_catches', 'angler_avatar_url', 600),
      ('fish_year_catch_comments', 'author_name', 80), ('fish_year_catch_comments', 'body', 4000),
      ('custom_species', 'name', 80),
      ('notifications', 'actor_name', 80), ('notifications', 'preview', 600),
      ('bug_reports', 'angler_name', 80), ('bug_reports', 'body', 10000), ('bug_reports', 'page_url', 600),
      ('tournaments', 'name', 120), ('tournaments', 'rules', 8000), ('tournaments', 'created_by_name', 80),
      ('tournament_entries', 'angler_name', 80), ('tournament_entries', 'angler_avatar_url', 600),
      ('tournament_entries', 'species', 80), ('tournament_entries', 'photo_url', 600),
      ('tournament_entry_comments', 'author_name', 80), ('tournament_entry_comments', 'body', 4000),
      ('game_catches', 'angler_name', 80), ('game_catches', 'species', 80), ('game_catches', 'size_label', 80), ('game_catches', 'biome', 60),
      ('fishing_licenses', 'state', 60), ('fishing_licenses', 'license_number', 80), ('fishing_licenses', 'photo_path', 400),
      ('waypoint_maps', 'name', 120), ('waypoint_maps', 'description', 4000),
      ('waypoint_map_members', 'map_name', 120),
      ('waypoints', 'created_by_name', 80), ('waypoints', 'name', 200), ('waypoints', 'notes', 4000),
      ('trips', 'created_by_name', 80), ('trips', 'name', 120), ('trips', 'location', 200), ('trips', 'state', 60),
      ('trips', 'accommodation', 300), ('trips', 'accommodation_url', 600), ('trips', 'notes', 8000),
      ('trip_attendees', 'angler_name', 80),
      ('trip_expenses', 'paid_by_name', 80), ('trip_expenses', 'description', 300),
      ('trip_settlements', 'from_name', 80), ('trip_settlements', 'to_name', 80),
      ('trip_items', 'name', 200), ('trip_items', 'claimed_by_name', 80),
      ('trip_catches', 'angler_name', 80), ('trip_catches', 'species', 80), ('trip_catches', 'photo_url', 600),
      ('payment_contacts', 'zelle', 200), ('payment_contacts', 'apple_cash_phone', 20)
    ) as v(tbl, col, max_chars)
  loop
    constraint_name := r.tbl || '_' || r.col || '_len';
    if exists (
      select 1 from pg_constraint c
      join pg_class k on k.oid = c.conrelid
      join pg_namespace n on n.oid = k.relnamespace
      where n.nspname = 'public' and k.relname = r.tbl and c.conname = constraint_name
    ) then
      continue;
    end if;
    -- A column these files know and this database doesn't (drift, like the tables the audit
    -- found) is said and skipped rather than failing the whole deploy.
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      missing := missing + 1;
      raise notice 'limits: public.%.% is not a column here and was skipped', r.tbl, r.col;
      continue;
    end if;
    execute format('select count(*) from public.%I where char_length(%I) > %s', r.tbl, r.col, r.max_chars) into over;
    if over > 0 then
      skipped := skipped + 1;
      raise notice 'limits: public.%.% has % row(s) over % characters and was left without a limit', r.tbl, r.col, over, r.max_chars;
    else
      execute format('alter table public.%I add constraint %I check (char_length(%I) <= %s)', r.tbl, constraint_name, r.col, r.max_chars);
      added := added + 1;
    end if;
  end loop;

  -- The same idea for the columns that aren't plain text: lists, the game's JSON, amounts.
  for r in
    select * from (values
      ('trips', 'target_species', 'cardinality(target_species) <= 60'),
      ('game_profiles', 'records', 'length(records::text) <= 200000'),
      ('game_profiles', 'quests', 'length(quests::text) <= 200000'),
      ('game_profiles', 'look', 'length(look::text) <= 20000'),
      ('game_profiles', 'rebuilds', 'length(rebuilds::text) <= 20000'),
      ('game_profiles', 'tags', 'length(tags::text) <= 200000'),
      ('game_profiles', 'weekly', 'length(weekly::text) <= 20000'),
      ('game_profiles', 'bounties_claimed', 'cardinality(bounties_claimed) <= 5000'),
      ('game_profiles', 'owned_lures', 'cardinality(owned_lures) <= 500'),
      ('game_profiles', 'wardrobe', 'cardinality(wardrobe) <= 500'),
      ('game_profiles', 'derby_wins', 'cardinality(derby_wins) <= 2000'),
      ('game_profiles', 'junk_found', 'cardinality(junk_found) <= 500'),
      ('trip_expenses', 'amount_cents', 'amount_cents <= 100000000'),
      ('trip_settlements', 'amount_cents', 'amount_cents <= 100000000'),
      ('tournament_entries', 'size', 'size <= 100000')
    ) as v(tbl, col, rule)
  loop
    constraint_name := r.tbl || '_' || r.col || '_max';
    if exists (
      select 1 from pg_constraint c
      join pg_class k on k.oid = c.conrelid
      join pg_namespace n on n.oid = k.relnamespace
      where n.nspname = 'public' and k.relname = r.tbl and c.conname = constraint_name
    ) then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      missing := missing + 1;
      raise notice 'limits: public.%.% is not a column here and was skipped', r.tbl, r.col;
      continue;
    end if;
    execute format('select count(*) from public.%I where not (%s)', r.tbl, r.rule) into over;
    if over > 0 then
      skipped := skipped + 1;
      raise notice 'limits: public.%.% has % row(s) over its limit and was left without one', r.tbl, r.col, over;
    else
      execute format('alter table public.%I add constraint %I check (%s)', r.tbl, constraint_name, r.rule);
      added := added + 1;
    end if;
  end loop;
  raise notice 'limits: % added, % left off because existing rows are over them, % skipped for a column that is not here', added, skipped, missing;
end $$;

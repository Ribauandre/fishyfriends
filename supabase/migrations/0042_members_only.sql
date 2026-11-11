-- Members only — and you become a member when the club's admin lets you in.
--
-- What the audit of 11 November 2026 found, and what this file changes:
--
--   1. Signed out, with nothing but the site's public key (it ships in the bundle), anyone
--      could read every catch, personal best, comment, like, tournament entry and game
--      profile: each table's select policy was `using (true)` with no role on it, and the
--      anon role held the grants. Now every policy is `to authenticated` and asks
--      is_member(); anon holds no privilege on any table in public.
--   2. Sign-up was open, and an account was all it took to be "a member": read the roster
--      and Venmo names, join any trip, and so see the Zelle / Apple Cash phone numbers of
--      everyone on it. Now an account is only an account. public.club_members says who is
--      in; a new sign-up waits until the admin approves it and until then can read and
--      write nothing but its own profile row.
--   3. An invited angler could update ANY column of their waypoint_map_members row —
--      including map_id. Invite yourself to a map you own, point the row at somebody
--      else's map, set it accepted, and you could read that map. Someone removed from a
--      map could walk back in the same way. Now only `status` can be updated.
--   4. Likewise trip_items (anything on an unclaimed item, trip_id included) and
--      notifications (any column of one you received): each is down to the columns the
--      app writes.
--   5. The admin was whoever's sign-in email matched a literal in a policy and in the
--      bundle, which published the owner's address to every visitor. The admin is now a
--      row in club_members; nothing here or in the client names an address.
--   6. The helper functions policies call were callable by anyone through /rpc. Now only
--      signed-in accounts can execute them (club_stats, which returns counts, stays open).
--   7. Buckets took any file of any size. Now 5 MB, and images (plus PDF for licenses).
--
-- club_members is deliberately NOT granted to the API roles (like _migrations_applied):
-- row-level security on, no policies, no grants. Everything reads it through the
-- security definer functions below.

-- ---------------------------------------------------------------------------
-- 1. Who is a member
-- ---------------------------------------------------------------------------
create table if not exists public.club_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('approved', 'declined')),
  is_admin boolean not null default false,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now()
);
alter table public.club_members enable row level security;
revoke all on table public.club_members from public, anon, authenticated;
grant all on table public.club_members to service_role;

-- No row = waiting. 'approved' = in. 'declined' = turned down, or removed later.
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.user_id = (select auth.uid()) and m.status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.user_id = (select auth.uid()) and m.status = 'approved' and m.is_admin
  );
$$;

-- Is that account in the club? For the roster: a member sees members, not whoever signed up.
create or replace function public.is_club_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_members m
    where m.user_id = target and m.status = 'approved'
  );
$$;

-- What the app asks first after sign-in: am I in, waiting, or turned down?
create or replace function public.my_membership()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'status', coalesce(m.status, 'pending'),
    'is_admin', coalesce(m.is_admin and m.status = 'approved', false)
  )
  from (select (select auth.uid()) as uid) me
  left join public.club_members m on m.user_id = me.uid;
$$;

-- The admin's list: everyone with a confirmed email, with where they stand. The only place
-- an email address leaves auth.users, and only for the admin.
create or replace function public.list_club_accounts()
returns table (account_id uuid, display_name text, email text, signed_up_at timestamptz, status text, is_admin boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the club admin can see the member list.' using errcode = '42501';
  end if;
  return query
    select u.id,
      coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''), 'New angler'),
      u.email::text,
      u.created_at,
      coalesce(m.status, 'pending'),
      coalesce(m.is_admin, false)
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.club_members m on m.user_id = u.id
    where m.user_id is not null or u.email_confirmed_at is not null
    order by (m.user_id is null) desc, u.created_at desc;
end;
$$;

-- Approve someone waiting, turn them down, or remove a member (which is 'declined' too).
create or replace function public.set_club_membership(target uuid, new_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the club admin can change who is a member.' using errcode = '42501';
  end if;
  if new_status is null or new_status not in ('approved', 'declined') then
    raise exception 'Status has to be approved or declined.' using errcode = '22023';
  end if;
  if target is null or target = (select auth.uid()) then
    raise exception 'You can''t change your own membership.' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = target) then
    raise exception 'No such account.' using errcode = '22023';
  end if;
  if exists (select 1 from public.club_members m where m.user_id = target and m.is_admin) then
    raise exception 'An admin''s membership can''t be changed here.' using errcode = '22023';
  end if;
  insert into public.club_members as m (user_id, status, decided_by, decided_at)
  values (target, new_status, (select auth.uid()), now())
  on conflict (user_id) do update
    set status = excluded.status, decided_by = excluded.decided_by, decided_at = excluded.decided_at;
  return new_status;
end;
$$;

-- The sign-in page's totals count members, not sign-ups.
create or replace function public.club_stats()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'anglers', (select count(*) from public.club_members m where m.status = 'approved'),
    'fish', (select count(*) from public.fish_year_catches c where c.year = extract(year from now())::int),
    'year', extract(year from now())::int
  );
$$;

-- Everyone who had already signed in (has a profile) when the gate went up stays in, and
-- the owner's account becomes the admin. Both happen ONCE, while club_members is still
-- empty: run again later, this must not wave in whoever is waiting at the time. The
-- owner's account is found by a digest of its email so the address isn't written here.
do $$
declare
  admin_id uuid;
  kept integer := 0;
begin
  if exists (select 1 from public.club_members) then
    raise notice 'membership: already set up, nobody added';
    return;
  end if;
  insert into public.club_members (user_id, status)
  select p.id, 'approved' from public.profiles p
  on conflict (user_id) do nothing;
  get diagnostics kept = row_count;

  select u.id into admin_id from auth.users u
  where encode(sha256(convert_to(lower(u.email), 'UTF8')), 'hex') = '644ba2dad3b7c5a2e38f893a99e48d555907a434a1eb4067330d2805e336c7a0'
  limit 1;
  if admin_id is not null then
    insert into public.club_members (user_id, status, is_admin) values (admin_id, 'approved', true)
    on conflict (user_id) do update set status = 'approved', is_admin = true;
  elsif exists (select 1 from auth.users) then
    raise exception 'membership: the owner''s account was not found, so the club would have no admin. Nothing was changed.';
  end if;
  raise notice 'membership: % existing accounts kept as members; admin account found: %', kept, (admin_id is not null);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Every policy on every app table, replaced
-- ---------------------------------------------------------------------------
-- Dropped by lookup rather than by name so that a policy somebody made in the dashboard
-- goes too. What it reports is the table, the command and the roles — never a policy's
-- name or text, which can carry an email (the old admin policy did).
do $$
declare
  p record;
  app_tables constant text[] := array[
    'profiles', 'personal_bests', 'personal_best_comments', 'personal_best_likes',
    'fish_year_catches', 'fish_year_catch_comments', 'fish_year_catch_likes',
    'custom_species', 'notifications', 'bug_reports',
    'tournaments', 'tournament_entries', 'tournament_entry_comments', 'tournament_entry_likes',
    'game_profiles', 'game_catches', 'fishing_licenses',
    'waypoint_maps', 'waypoint_map_members', 'waypoints',
    'trips', 'trip_attendees', 'trip_expenses', 'trip_settlements', 'trip_items', 'trip_catches',
    'payment_contacts', 'club_members'
  ];
  known constant text[] := array[
    'Members can view profiles', 'Members can insert their profile',
    'Members can update their profile', 'Members can view personal bests',
    'Members can insert their personal bests', 'Members can update their personal bests',
    'Members can delete their personal bests', 'Members can view personal best comments',
    'Members can add personal best comments', 'Members can delete their own personal best comments',
    'Members can view fish year catches', 'Members can insert their fish year catches',
    'Members can delete their fish year catches', 'Members can view custom species',
    'Members can add custom species', 'Members can view personal best likes',
    'Members can like a personal best', 'Members can unlike their own like',
    'Members can view fish year catch likes', 'Members can like a fish year catch',
    'Members can unlike their own fish year catch like',
    'Members can view fish year catch comments', 'Members can add fish year catch comments',
    'Members can delete their own fish year catch comments', 'Members can view their notifications',
    'Members can create notifications for others', 'Members can update their notifications',
    'Members can view tournaments', 'Members can create tournaments',
    'Members can delete their tournaments', 'Members can view tournament entries',
    'Members can log their tournament entries', 'Members can delete their tournament entries',
    'Members can view tournament entry likes', 'Members can like a tournament entry',
    'Members can unlike their own tournament entry like',
    'Members can view tournament entry comments', 'Members can add tournament entry comments',
    'Members can delete their own tournament entry comments',
    'Members can view their own bug reports', 'Members can submit bug reports',
    'Members can view game profiles', 'Members can create their own game profile',
    'Members can update their own game profile', 'Members can view game catches',
    'Members can log their own game catches', 'Members can delete their own game catches',
    'Admin can view all bug reports', 'Anglers manage their own fishing licenses',
    'Owners and accepted collaborators can view a waypoint map',
    'Anglers can create their own waypoint maps', 'Owners can update their waypoint maps',
    'Owners can delete their waypoint maps',
    'Map members are visible to the map''s owner and collaborators',
    'Only the map owner can invite a collaborator',
    'An invited angler can accept their own invitation',
    'The map owner or the member themselves can remove a membership',
    'Owners and accepted collaborators can view waypoints',
    'Owners and accepted collaborators can add waypoints',
    'The waypoint''s own creator or the map owner can remove it',
    'Signed-in anglers can view trips', 'Anglers can create their own trips',
    'Creators can update their trips', 'Creators can delete their trips',
    'Signed-in anglers can see who is going', 'Anglers can opt themselves in',
    'Anglers can leave, and the creator can remove anyone',
    'People on the trip can see its expenses', 'People on the trip can add what they paid',
    'The payer or the trip creator can remove an expense',
    'People on the trip can see its settlements', 'Either party can record a payment',
    'Whoever recorded a payment, or the trip creator, can undo it',
    'People on the trip can see the packing list', 'People on the trip can add to the packing list',
    'People on the trip can claim an item',
    'Whoever added an item, or the trip creator, can remove it',
    'Signed-in anglers can see trip catches', 'Anglers on the trip can log their catches',
    'Anglers can remove their catch, and the creator any',
    'People on a trip with you can see how to pay you', 'Anglers add their own payment details',
    'Anglers update their own payment details', 'Anglers remove their own payment details',
    'Members see members; anyone sees their own profile',
    'Anyone signed in creates their own profile', 'Anyone signed in edits their own profile',
    'Members see personal bests', 'Members log their own personal bests',
    'Members edit their own personal bests', 'Members delete their own personal bests',
    'Members see personal best comments', 'Members comment on personal bests as themselves',
    'Members delete their own personal best comments', 'Members see personal best likes',
    'Members like personal bests as themselves', 'Members take back their own personal best likes',
    'Members see Fish Year catches', 'Members log their own Fish Year catches',
    'Members delete their own Fish Year catches', 'Members see Fish Year comments',
    'Members comment on Fish Year catches as themselves',
    'Members delete their own Fish Year comments', 'Members see Fish Year likes',
    'Members like Fish Year catches as themselves', 'Members take back their own Fish Year likes',
    'Members see custom species', 'Members add custom species',
    'Members see their own notifications', 'Members notify others as themselves',
    'Members mark their own notifications read', 'Reporters and the admin see bug reports',
    'Members report bugs as themselves', 'Members see tournaments',
    'Members start their own tournaments', 'Members delete the tournaments they started',
    'Members see tournament entries', 'Members enter tournaments as themselves',
    'Members delete their own tournament entries', 'Members see tournament entry comments',
    'Members comment on entries as themselves', 'Members delete their own entry comments',
    'Members see tournament entry likes', 'Members like entries as themselves',
    'Members take back their own entry likes', 'Members see game profiles',
    'Members create their own game profile', 'Members update their own game profile',
    'Members see game catches', 'Members log their own game catches',
    'Members delete their own game catches', 'Members see their own licenses',
    'Members add their own licenses', 'Members edit their own licenses',
    'Members delete their own licenses', 'Owners and accepted collaborators see a map',
    'Members create their own maps', 'Owners edit their maps', 'Owners delete their maps',
    'Invitees and collaborators see a map''s members',
    'Only a map''s owner invites, and invites start pending',
    'Invitees answer their own invitation', 'Owners and the member remove a membership',
    'Owners and accepted collaborators see waypoints',
    'Owners and accepted collaborators add waypoints',
    'A waypoint''s creator or the map owner removes it', 'Members see trips',
    'Members create their own trips', 'Creators edit their trips', 'Creators delete their trips',
    'Members see who is going', 'Members opt themselves in while RSVPs are open',
    'Members leave, and the creator removes anyone', 'People on the trip see its expenses',
    'People on the trip add what they paid', 'The payer or the trip creator removes an expense',
    'People on the trip see its settlements', 'Either party on the trip records a payment',
    'The recorder or the trip creator undoes a payment', 'People on the trip see the packing list',
    'People on the trip add to the packing list', 'People on the trip claim an item',
    'Whoever added an item or the creator removes it', 'Members see trip catches',
    'Anglers on the trip log their own catches', 'Anglers remove their catch, and the creator any',
    'People on a trip with you see how to pay you', 'Members add their own payment details',
    'Members edit their own payment details', 'Members remove their own payment details'
  ];
  dropped integer := 0;
  foreign_made integer := 0;
  t record;
begin
  for p in
    select pol.polname as name, c.relname as tbl,
      case pol.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update' when 'd' then 'delete' else 'all' end as cmd,
      coalesce((select string_agg(r.rolname, ', ' order by r.rolname) from pg_roles r where r.oid = any (pol.polroles)), 'everyone') as roles
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
  loop
    if not (p.name = any (known)) then
      foreign_made := foreign_made + 1;
      raise notice 'tables: a policy no migration made — % on public.% for %', p.cmd, p.tbl, p.roles;
    end if;
    execute format('drop policy %I on public.%I', p.name, p.tbl);
    dropped := dropped + 1;
  end loop;
  raise notice 'tables: dropped % policies (% of them made outside the migrations)', dropped, foreign_made;
  -- A table or view this app doesn't know (made by hand in the dashboard, like the old
  -- "entries" table) is closed to the API outright: no policies (dropped above) and no
  -- grants. Nothing in the app reads it; the dashboard and the service key still can.
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and not (c.relname = any (app_tables)) and c.relname <> '_migrations_applied'
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t.relname);
    raise notice 'tables: public.% is not one this app knows; it has been closed to the API, look at it in the dashboard', t.relname;
  end loop;
end $$;

-- profiles: a member sees the members; any signed-in account sees and edits its own row
-- (someone waiting needs one so the admin sees a name to approve).
create policy "Members see members; anyone sees their own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or ((select public.is_member()) and public.is_club_member(id)));
create policy "Anyone signed in creates their own profile" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "Anyone signed in edits their own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- personal bests
create policy "Members see personal bests" on public.personal_bests for select to authenticated
  using ((select public.is_member()));
create policy "Members log their own personal bests" on public.personal_bests for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members edit their own personal bests" on public.personal_bests for update to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()))
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members delete their own personal bests" on public.personal_bests for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

create policy "Members see personal best comments" on public.personal_best_comments for select to authenticated
  using ((select public.is_member()));
create policy "Members comment on personal bests as themselves" on public.personal_best_comments for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members delete their own personal best comments" on public.personal_best_comments for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

create policy "Members see personal best likes" on public.personal_best_likes for select to authenticated
  using ((select public.is_member()));
create policy "Members like personal bests as themselves" on public.personal_best_likes for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members take back their own personal best likes" on public.personal_best_likes for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

-- Fish Year
create policy "Members see Fish Year catches" on public.fish_year_catches for select to authenticated
  using ((select public.is_member()));
create policy "Members log their own Fish Year catches" on public.fish_year_catches for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members delete their own Fish Year catches" on public.fish_year_catches for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

create policy "Members see Fish Year comments" on public.fish_year_catch_comments for select to authenticated
  using ((select public.is_member()));
create policy "Members comment on Fish Year catches as themselves" on public.fish_year_catch_comments for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members delete their own Fish Year comments" on public.fish_year_catch_comments for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

create policy "Members see Fish Year likes" on public.fish_year_catch_likes for select to authenticated
  using ((select public.is_member()));
create policy "Members like Fish Year catches as themselves" on public.fish_year_catch_likes for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members take back their own Fish Year likes" on public.fish_year_catch_likes for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

-- the shared species list
create policy "Members see custom species" on public.custom_species for select to authenticated
  using ((select public.is_member()));
create policy "Members add custom species" on public.custom_species for insert to authenticated
  with check ((select public.is_member()));

-- notifications: yours to read and mark read; you send them as yourself, to someone else.
-- Never .select() an insert here: the sender can't read what they sent.
create policy "Members see their own notifications" on public.notifications for select to authenticated
  using ((select public.is_member()) and recipient_id = (select auth.uid()));
create policy "Members notify others as themselves" on public.notifications for insert to authenticated
  with check ((select public.is_member()) and actor_id = (select auth.uid()) and actor_id <> recipient_id);
create policy "Members mark their own notifications read" on public.notifications for update to authenticated
  using ((select public.is_member()) and recipient_id = (select auth.uid()))
  with check ((select public.is_member()) and recipient_id = (select auth.uid()));

-- bug reports: the reporter's own, and all of them for the admin
create policy "Reporters and the admin see bug reports" on public.bug_reports for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Members report bugs as themselves" on public.bug_reports for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));

-- tournaments
create policy "Members see tournaments" on public.tournaments for select to authenticated
  using ((select public.is_member()));
create policy "Members start their own tournaments" on public.tournaments for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy "Members delete the tournaments they started" on public.tournaments for delete to authenticated
  using ((select public.is_member()) and created_by = (select auth.uid()));

create policy "Members see tournament entries" on public.tournament_entries for select to authenticated
  using ((select public.is_member()));
create policy "Members enter tournaments as themselves" on public.tournament_entries for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members delete their own tournament entries" on public.tournament_entries for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

create policy "Members see tournament entry comments" on public.tournament_entry_comments for select to authenticated
  using ((select public.is_member()));
create policy "Members comment on entries as themselves" on public.tournament_entry_comments for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members delete their own entry comments" on public.tournament_entry_comments for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

create policy "Members see tournament entry likes" on public.tournament_entry_likes for select to authenticated
  using ((select public.is_member()));
create policy "Members like entries as themselves" on public.tournament_entry_likes for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members take back their own entry likes" on public.tournament_entry_likes for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

-- Cast & Catch
create policy "Members see game profiles" on public.game_profiles for select to authenticated
  using ((select public.is_member()));
create policy "Members create their own game profile" on public.game_profiles for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members update their own game profile" on public.game_profiles for update to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()))
  with check ((select public.is_member()) and user_id = (select auth.uid()));

create policy "Members see game catches" on public.game_catches for select to authenticated
  using ((select public.is_member()));
create policy "Members log their own game catches" on public.game_catches for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members delete their own game catches" on public.game_catches for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

-- fishing licenses: the owner's, nobody else's
create policy "Members see their own licenses" on public.fishing_licenses for select to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members add their own licenses" on public.fishing_licenses for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members edit their own licenses" on public.fishing_licenses for update to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()))
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members delete their own licenses" on public.fishing_licenses for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

-- waypoint maps: the owner, and anglers who accepted an invitation. Nobody else, ever.
-- (The owner check is on the row itself so .insert().select() passes; see 0026.)
create policy "Owners and accepted collaborators see a map" on public.waypoint_maps for select to authenticated
  using ((select public.is_member()) and (owner_id = (select auth.uid()) or public.is_waypoint_map_collaborator(id, (select auth.uid()))));
create policy "Members create their own maps" on public.waypoint_maps for insert to authenticated
  with check ((select public.is_member()) and owner_id = (select auth.uid()));
create policy "Owners edit their maps" on public.waypoint_maps for update to authenticated
  using ((select public.is_member()) and owner_id = (select auth.uid()))
  with check ((select public.is_member()) and owner_id = (select auth.uid()));
create policy "Owners delete their maps" on public.waypoint_maps for delete to authenticated
  using ((select public.is_member()) and owner_id = (select auth.uid()));

-- An invitation is made by the map's owner, starts pending, and the only thing its invitee
-- can ever change is its status (column grant below) — never which map it is for.
create policy "Invitees and collaborators see a map's members" on public.waypoint_map_members for select to authenticated
  using ((select public.is_member()) and (user_id = (select auth.uid()) or public.is_waypoint_map_collaborator(map_id, (select auth.uid()))));
create policy "Only a map's owner invites, and invites start pending" on public.waypoint_map_members for insert to authenticated
  with check (
    (select public.is_member())
    and invited_by = (select auth.uid())
    and status = 'pending'
    and exists (select 1 from public.waypoint_maps m where m.id = map_id and m.owner_id = (select auth.uid()))
  );
create policy "Invitees answer their own invitation" on public.waypoint_map_members for update to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()))
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Owners and the member remove a membership" on public.waypoint_map_members for delete to authenticated
  using (
    (select public.is_member())
    and (user_id = (select auth.uid()) or exists (select 1 from public.waypoint_maps m where m.id = map_id and m.owner_id = (select auth.uid())))
  );

create policy "Owners and accepted collaborators see waypoints" on public.waypoints for select to authenticated
  using ((select public.is_member()) and public.is_waypoint_map_collaborator(map_id, (select auth.uid())));
create policy "Owners and accepted collaborators add waypoints" on public.waypoints for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()) and public.is_waypoint_map_collaborator(map_id, (select auth.uid())));
create policy "A waypoint's creator or the map owner removes it" on public.waypoints for delete to authenticated
  using (
    (select public.is_member())
    and (created_by = (select auth.uid()) or exists (select 1 from public.waypoint_maps m where m.id = map_id and m.owner_id = (select auth.uid())))
  );

-- trips: the crew sees them and opts in; money and the packing list are for people on the trip
create policy "Members see trips" on public.trips for select to authenticated
  using ((select public.is_member()));
create policy "Members create their own trips" on public.trips for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy "Creators edit their trips" on public.trips for update to authenticated
  using ((select public.is_member()) and created_by = (select auth.uid()))
  with check ((select public.is_member()) and created_by = (select auth.uid()));
create policy "Creators delete their trips" on public.trips for delete to authenticated
  using ((select public.is_member()) and created_by = (select auth.uid()));

create policy "Members see who is going" on public.trip_attendees for select to authenticated
  using ((select public.is_member()));
create policy "Members opt themselves in while RSVPs are open" on public.trip_attendees for insert to authenticated
  with check (
    (select public.is_member())
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.trips t
      where t.id = trip_id
        and (t.created_by = (select auth.uid()) or t.rsvp_by is null or t.rsvp_by >= current_date - 1)
    )
  );
create policy "Members leave, and the creator removes anyone" on public.trip_attendees for delete to authenticated
  using (
    (select public.is_member())
    and (user_id = (select auth.uid()) or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = (select auth.uid())))
  );

create policy "People on the trip see its expenses" on public.trip_expenses for select to authenticated
  using ((select public.is_member()) and public.is_trip_member(trip_id, (select auth.uid())));
create policy "People on the trip add what they paid" on public.trip_expenses for insert to authenticated
  with check ((select public.is_member()) and paid_by = (select auth.uid()) and public.is_trip_member(trip_id, (select auth.uid())));
create policy "The payer or the trip creator removes an expense" on public.trip_expenses for delete to authenticated
  using (
    (select public.is_member())
    and (paid_by = (select auth.uid()) or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = (select auth.uid())))
  );

-- A payment is recorded by one of its two parties, and both have to be on the trip.
create policy "People on the trip see its settlements" on public.trip_settlements for select to authenticated
  using ((select public.is_member()) and public.is_trip_member(trip_id, (select auth.uid())));
create policy "Either party on the trip records a payment" on public.trip_settlements for insert to authenticated
  with check (
    (select public.is_member())
    and created_by = (select auth.uid())
    and (select auth.uid()) in (from_user, to_user)
    and public.is_trip_member(trip_id, from_user)
    and public.is_trip_member(trip_id, to_user)
  );
create policy "The recorder or the trip creator undoes a payment" on public.trip_settlements for delete to authenticated
  using (
    (select public.is_member())
    and (created_by = (select auth.uid()) or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = (select auth.uid())))
  );

-- Packing list: only the claim can be updated (column grant below), and only on an item
-- that is unclaimed or yours.
create policy "People on the trip see the packing list" on public.trip_items for select to authenticated
  using ((select public.is_member()) and public.is_trip_member(trip_id, (select auth.uid())));
create policy "People on the trip add to the packing list" on public.trip_items for insert to authenticated
  with check ((select public.is_member()) and created_by = (select auth.uid()) and claimed_by is null and public.is_trip_member(trip_id, (select auth.uid())));
create policy "People on the trip claim an item" on public.trip_items for update to authenticated
  using ((select public.is_member()) and public.is_trip_member(trip_id, (select auth.uid())) and (claimed_by is null or claimed_by = (select auth.uid())))
  with check ((select public.is_member()) and public.is_trip_member(trip_id, (select auth.uid())) and (claimed_by is null or claimed_by = (select auth.uid())));
create policy "Whoever added an item or the creator removes it" on public.trip_items for delete to authenticated
  using (
    (select public.is_member())
    and (created_by = (select auth.uid()) or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = (select auth.uid())))
  );

create policy "Members see trip catches" on public.trip_catches for select to authenticated
  using ((select public.is_member()));
create policy "Anglers on the trip log their own catches" on public.trip_catches for insert to authenticated
  with check (
    (select public.is_member())
    and user_id = (select auth.uid())
    and exists (select 1 from public.trip_attendees a where a.trip_id = trip_catches.trip_id and a.user_id = (select auth.uid()))
  );
create policy "Anglers remove their catch, and the creator any" on public.trip_catches for delete to authenticated
  using (
    (select public.is_member())
    and (user_id = (select auth.uid()) or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = (select auth.uid())))
  );

-- Zelle / Apple Cash details: yours, and people you share a trip with
create policy "People on a trip with you see how to pay you" on public.payment_contacts for select to authenticated
  using ((select public.is_member()) and public.shares_trip_with((select auth.uid()), user_id));
create policy "Members add their own payment details" on public.payment_contacts for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members edit their own payment details" on public.payment_contacts for update to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()))
  with check ((select public.is_member()) and user_id = (select auth.uid()));
create policy "Members remove their own payment details" on public.payment_contacts for delete to authenticated
  using ((select public.is_member()) and user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Grants: nothing for signed-out visitors, and no more than the app does for members
-- ---------------------------------------------------------------------------
-- Tables made before 30 October 2026 were handed to anon and authenticated wholesale
-- ("grant all") by Supabase's old defaults, so on the live project anon still held insert,
-- update, delete and truncate on them with only the policies in the way.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

revoke all on table
  public.profiles, public.personal_bests, public.personal_best_comments, public.personal_best_likes,
  public.fish_year_catches, public.fish_year_catch_comments, public.fish_year_catch_likes,
  public.custom_species, public.notifications, public.bug_reports,
  public.tournaments, public.tournament_entries, public.tournament_entry_comments, public.tournament_entry_likes,
  public.game_profiles, public.game_catches, public.fishing_licenses,
  public.waypoint_maps, public.waypoint_map_members, public.waypoints,
  public.trips, public.trip_attendees, public.trip_expenses, public.trip_settlements,
  public.trip_items, public.trip_catches, public.payment_contacts
from authenticated;

grant select on table
  public.profiles, public.personal_bests, public.personal_best_comments, public.personal_best_likes,
  public.fish_year_catches, public.fish_year_catch_comments, public.fish_year_catch_likes,
  public.custom_species, public.notifications, public.bug_reports,
  public.tournaments, public.tournament_entries, public.tournament_entry_comments, public.tournament_entry_likes,
  public.game_profiles, public.game_catches, public.fishing_licenses,
  public.waypoint_maps, public.waypoint_map_members, public.waypoints,
  public.trips, public.trip_attendees, public.trip_expenses, public.trip_settlements,
  public.trip_items, public.trip_catches, public.payment_contacts
to authenticated;

grant insert on table
  public.profiles, public.personal_bests, public.personal_best_comments, public.personal_best_likes,
  public.fish_year_catches, public.fish_year_catch_comments, public.fish_year_catch_likes,
  public.custom_species, public.notifications, public.bug_reports,
  public.tournaments, public.tournament_entries, public.tournament_entry_comments, public.tournament_entry_likes,
  public.game_profiles, public.game_catches, public.fishing_licenses,
  public.waypoint_maps, public.waypoint_map_members, public.waypoints,
  public.trips, public.trip_attendees, public.trip_expenses, public.trip_settlements,
  public.trip_items, public.trip_catches, public.payment_contacts
to authenticated;

-- Whole-row updates only where the app edits a row of your own.
grant update on table
  public.profiles, public.personal_bests, public.game_profiles, public.fishing_licenses,
  public.waypoint_maps, public.trips, public.payment_contacts
to authenticated;
-- One column each where a row is shared: answering an invitation, claiming an item,
-- marking a notification read.
grant update (status) on table public.waypoint_map_members to authenticated;
grant update (claimed_by, claimed_by_name) on table public.trip_items to authenticated;
grant update (read) on table public.notifications to authenticated;

grant delete on table
  public.personal_bests, public.personal_best_comments, public.personal_best_likes,
  public.fish_year_catches, public.fish_year_catch_comments, public.fish_year_catch_likes,
  public.tournaments, public.tournament_entries, public.tournament_entry_comments, public.tournament_entry_likes,
  public.game_catches, public.fishing_licenses,
  public.waypoint_maps, public.waypoint_map_members, public.waypoints,
  public.trips, public.trip_attendees, public.trip_expenses, public.trip_settlements,
  public.trip_items, public.trip_catches, public.payment_contacts
to authenticated;

grant all on table
  public.profiles, public.personal_bests, public.personal_best_comments, public.personal_best_likes,
  public.fish_year_catches, public.fish_year_catch_comments, public.fish_year_catch_likes,
  public.custom_species, public.notifications, public.bug_reports,
  public.tournaments, public.tournament_entries, public.tournament_entry_comments, public.tournament_entry_likes,
  public.game_profiles, public.game_catches, public.fishing_licenses,
  public.waypoint_maps, public.waypoint_map_members, public.waypoints,
  public.trips, public.trip_attendees, public.trip_expenses, public.trip_settlements,
  public.trip_items, public.trip_catches, public.payment_contacts
to service_role;

-- Functions that run with their owner's rights: nobody signed out may call them (through
-- /rest/v1/rpc they answered anyone), signed-in accounts may, because policies call them
-- as whoever is asking. club_stats alone stays open — it returns three counts. One this app
-- doesn't know is closed to signed-out visitors too, and is not opened to anyone it wasn't
-- already open to.
do $$
declare
  f record;
  app_functions constant text[] := array[
    'is_member', 'is_admin', 'is_club_member', 'my_membership', 'list_club_accounts', 'set_club_membership',
    'club_stats', 'is_waypoint_map_collaborator', 'is_trip_member', 'shares_trip_with'
  ];
begin
  for f in
    select p.oid::regprocedure as signature, p.proname as name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', f.signature);
    if f.name = any (app_functions) then
      execute format('grant execute on function %s to authenticated, service_role', f.signature);
    else
      raise notice 'functions: public.% runs with its owner''s rights and is not one this app knows; it has been closed to signed-out visitors, look at it in the dashboard', f.name;
    end if;
  end loop;
end $$;
grant execute on function public.club_stats() to anon;

-- ---------------------------------------------------------------------------
-- 4. Storage: your own folder, if you're a member; and what a bucket will take
-- ---------------------------------------------------------------------------
-- Same as 0041: every policy goes, whoever made it, and the ones the app needs come back.
do $$
declare
  p record;
  mine constant text[] := array[
    'Members read their own files', 'Members upload into their own folder',
    'Members replace their own files', 'Members delete their own files',
    'Admin reads stored photos', 'Admin replaces stored photos'
  ];
  foreign_made integer := 0;
begin
  for p in
    select pol.polname as name, c.relname as tbl
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname in ('objects', 'buckets')
  loop
    if not (p.name = any (mine)) then foreign_made := foreign_made + 1; end if;
    execute format('drop policy %I on storage.%I', p.name, p.tbl);
  end loop;
  if foreign_made > 0 then
    raise notice 'storage: removed % policies made outside the migrations since 0041', foreign_made;
  end if;
end $$;

create policy "Members read their own files" on storage.objects for select to authenticated
  using (
    (select public.is_member())
    and bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Members upload into their own folder" on storage.objects for insert to authenticated
  with check (
    (select public.is_member())
    and bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Members replace their own files" on storage.objects for update to authenticated
  using (
    (select public.is_member())
    and bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    (select public.is_member())
    and bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Members delete their own files" on storage.objects for delete to authenticated
  using (
    (select public.is_member())
    and bucket_id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches', 'fishing-licenses')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The admin can list the photo buckets and write a photo back over itself: that is how
-- the location data cameras stamp into a photo gets stripped from the ones already stored
-- (the admin page does it in the browser). Photos only — never the license bucket.
create policy "Admin reads stored photos" on storage.objects for select to authenticated
  using (
    (select public.is_admin())
    and bucket_id in ('photos', 'avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches')
  );
create policy "Admin replaces stored photos" on storage.objects for update to authenticated
  using (
    (select public.is_admin())
    and bucket_id in ('photos', 'avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches')
  )
  with check (
    (select public.is_admin())
    and bucket_id in ('photos', 'avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches')
  );

-- The app only ever sends a re-encoded JPEG (or a PNG / WebP with its metadata removed) of
-- at most 5 MB, and a license can be a PDF. Until now a bucket took anything.
update storage.buckets
  set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id in ('avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches');
update storage.buckets
  set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], public = false
  where id = 'fishing-licenses';

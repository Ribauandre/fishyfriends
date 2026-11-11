-- Four helper functions answer yes/no questions about OTHER accounts: is this one a member,
-- is this one on that trip, do these two share a trip, is this one on that map. The policies
-- that use them all ask is_member() first, so through a table nothing leaks. But the
-- functions themselves are callable by any signed-in account (a policy runs them as the
-- caller, so the grant has to be there), and an account is not a membership: someone who had
-- only signed up, and was still waiting to be let in, could call them directly and be told
-- who is in the club and which members go on trips together. The ids they'd need aren't
-- secret (they are the folder names in photo addresses, and the game's presence channel
-- carries them).
--
-- Now each answers "no" unless the caller is a member. A call with no signed-in account
-- behind it (a migration, the dashboard) is answered as before: that caller can read the
-- tables anyway. Three of them also get the empty search_path the newer functions have.

create or replace function public.is_club_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((select auth.uid()) is null or (select public.is_member()))
    and exists (
      select 1 from public.club_members m
      where m.user_id = target and m.status = 'approved'
    );
$$;

create or replace function public.is_trip_member(target_trip_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((select auth.uid()) is null or (select public.is_member()))
    and (
      exists (select 1 from public.trips t where t.id = target_trip_id and t.created_by = target_user_id)
      or exists (select 1 from public.trip_attendees a where a.trip_id = target_trip_id and a.user_id = target_user_id)
    );
$$;

create or replace function public.shares_trip_with(viewer uuid, owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((select auth.uid()) is null or (select public.is_member()))
    and (
      viewer = owner
      or exists (
        select 1 from public.trips t
        where (t.created_by = viewer or exists (select 1 from public.trip_attendees a where a.trip_id = t.id and a.user_id = viewer))
          and (t.created_by = owner or exists (select 1 from public.trip_attendees b where b.trip_id = t.id and b.user_id = owner))
      )
    );
$$;

create or replace function public.is_waypoint_map_collaborator(target_map_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select ((select auth.uid()) is null or (select public.is_member()))
    and (
      exists (select 1 from public.waypoint_maps m where m.id = target_map_id and m.owner_id = target_user_id)
      or exists (
        select 1 from public.waypoint_map_members mm
        where mm.map_id = target_map_id and mm.user_id = target_user_id and mm.status = 'accepted'
      )
    );
$$;

-- `create or replace` keeps who may call them; said again so this file stands on its own.
do $$
begin
  revoke all on function public.is_club_member(uuid) from public;
  revoke all on function public.is_trip_member(uuid, uuid) from public;
  revoke all on function public.shares_trip_with(uuid, uuid) from public;
  revoke all on function public.is_waypoint_map_collaborator(uuid, uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.is_club_member(uuid) from anon;
    revoke all on function public.is_trip_member(uuid, uuid) from anon;
    revoke all on function public.shares_trip_with(uuid, uuid) from anon;
    revoke all on function public.is_waypoint_map_collaborator(uuid, uuid) from anon;
    grant execute on function public.is_club_member(uuid) to authenticated, service_role;
    grant execute on function public.is_trip_member(uuid, uuid) to authenticated, service_role;
    grant execute on function public.shares_trip_with(uuid, uuid) to authenticated, service_role;
    grant execute on function public.is_waypoint_map_collaborator(uuid, uuid) to authenticated, service_role;
  end if;
end $$;

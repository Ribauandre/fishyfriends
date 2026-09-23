-- Waypoints: an angler creates a named map, imports/drops pins on it, and can invite other
-- anglers (by account, not email — everyone already has one in this crew) to collaborate on
-- it. Deliberately private by default and staying that way: unlike personal_bests/fish_year
-- catches, which the whole crew sees, a map is visible only to its owner and anglers who have
-- *accepted* an invitation to it — an invited-but-pending row grants nothing yet.
create table if not exists public.waypoint_maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.waypoint_map_members (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.waypoint_maps(id) on delete cascade,
  -- Snapshotted at invite time: a pending (not-yet-accepted) invitee isn't a collaborator yet,
  -- so RLS on waypoint_maps correctly hides the row from them — this is what lets their
  -- pending-invites list still show which map they were invited to.
  map_name text not null default '',
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (map_id, user_id)
);

create table if not exists public.waypoints (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.waypoint_maps(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text not null default 'Angler',
  name text not null default 'Waypoint',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  notes text not null default '',
  source text not null default 'manual' check (source in ('manual', 'gpx')),
  created_at timestamptz not null default now()
);

create index if not exists waypoint_map_members_map_idx on public.waypoint_map_members (map_id);
create index if not exists waypoint_map_members_user_idx on public.waypoint_map_members (user_id);
create index if not exists waypoints_map_idx on public.waypoints (map_id);

-- Owner-or-accepted-collaborator, in one place so every policy below (and the client) agrees
-- on what "can see this map" means. security definer so it can read waypoint_map_members
-- from inside a policy on a *different* table without that table's own RLS getting in the way.
create or replace function public.is_waypoint_map_collaborator(target_map_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.waypoint_maps m
    where m.id = target_map_id and m.owner_id = target_user_id
  ) or exists (
    select 1 from public.waypoint_map_members mm
    where mm.map_id = target_map_id and mm.user_id = target_user_id and mm.status = 'accepted'
  );
$$;

alter table public.waypoint_maps enable row level security;
drop policy if exists "Owners and accepted collaborators can view a waypoint map" on public.waypoint_maps;
create policy "Owners and accepted collaborators can view a waypoint map" on public.waypoint_maps for select
  using (public.is_waypoint_map_collaborator(id, auth.uid()));
drop policy if exists "Anglers can create their own waypoint maps" on public.waypoint_maps;
create policy "Anglers can create their own waypoint maps" on public.waypoint_maps for insert
  with check (auth.uid() = owner_id);
drop policy if exists "Owners can update their waypoint maps" on public.waypoint_maps;
create policy "Owners can update their waypoint maps" on public.waypoint_maps for update
  using (auth.uid() = owner_id);
drop policy if exists "Owners can delete their waypoint maps" on public.waypoint_maps;
create policy "Owners can delete their waypoint maps" on public.waypoint_maps for delete
  using (auth.uid() = owner_id);

alter table public.waypoint_map_members enable row level security;
-- A member row is visible to: the map's owner (to manage invites), the invited user
-- themselves (so a pending invite shows up for them before they've accepted), and any other
-- accepted collaborator (so the map's member list can be shown to the whole crew on it).
drop policy if exists "Map members are visible to the map's owner and collaborators" on public.waypoint_map_members;
create policy "Map members are visible to the map's owner and collaborators" on public.waypoint_map_members for select
  using (
    auth.uid() = user_id
    or public.is_waypoint_map_collaborator(map_id, auth.uid())
  );
drop policy if exists "Only the map owner can invite a collaborator" on public.waypoint_map_members;
create policy "Only the map owner can invite a collaborator" on public.waypoint_map_members for insert
  with check (
    auth.uid() = invited_by
    and exists (select 1 from public.waypoint_maps m where m.id = map_id and m.owner_id = auth.uid())
  );
drop policy if exists "An invited angler can accept their own invitation" on public.waypoint_map_members;
create policy "An invited angler can accept their own invitation" on public.waypoint_map_members for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "The map owner or the member themselves can remove a membership" on public.waypoint_map_members;
create policy "The map owner or the member themselves can remove a membership" on public.waypoint_map_members for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.waypoint_maps m where m.id = map_id and m.owner_id = auth.uid())
  );

alter table public.waypoints enable row level security;
drop policy if exists "Owners and accepted collaborators can view waypoints" on public.waypoints;
create policy "Owners and accepted collaborators can view waypoints" on public.waypoints for select
  using (public.is_waypoint_map_collaborator(map_id, auth.uid()));
drop policy if exists "Owners and accepted collaborators can add waypoints" on public.waypoints;
create policy "Owners and accepted collaborators can add waypoints" on public.waypoints for insert
  with check (auth.uid() = created_by and public.is_waypoint_map_collaborator(map_id, auth.uid()));
drop policy if exists "The waypoint's own creator or the map owner can remove it" on public.waypoints;
create policy "The waypoint's own creator or the map owner can remove it" on public.waypoints for delete
  using (
    auth.uid() = created_by
    or exists (select 1 from public.waypoint_maps m where m.id = map_id and m.owner_id = auth.uid())
  );

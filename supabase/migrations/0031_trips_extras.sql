-- Trips, round two: an RSVP deadline, a Venmo username to pay people back with, trip
-- notifications, a packing list people claim items from, and catches logged to a trip.

-- RSVP deadline. The app closes sign-ups the day after it, in the angler's own time; the
-- database only refuses once a further day has passed, so a UTC date can never close a trip
-- early for someone in the US. The creator can always (re)join their own trip.
alter table public.trips add column if not exists rsvp_by date;
alter table public.trips drop constraint if exists trips_rsvp_check;
alter table public.trips add constraint trips_rsvp_check check (rsvp_by is null or rsvp_by <= ends_on);

drop policy if exists "Anglers can opt themselves in" on public.trip_attendees;
create policy "Anglers can opt themselves in" on public.trip_attendees for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips t
      where t.id = trip_id
        and (t.created_by = auth.uid() or t.rsvp_by is null or t.rsvp_by >= current_date - 1)
    )
  );

-- Venmo username for pay-back links (no "@"). profiles is already crew-readable.
alter table public.profiles add column if not exists venmo_handle text not null default '';

-- Notifications can now say someone joined your trip or added a trip expense.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment', 'like', 'trip_join', 'trip_expense'));
alter table public.notifications drop constraint if exists notifications_target_type_check;
alter table public.notifications add constraint notifications_target_type_check
  check (target_type in ('personal_best', 'fish_year_catch', 'tournament_entry', 'trip'));

-- Packing list: anyone on the trip adds items and claims what they're bringing. A claimed
-- item can only be changed by whoever claimed it, so nobody can un-claim someone else.
create table if not exists public.trip_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists trip_items_trip_idx on public.trip_items (trip_id, created_at);

alter table public.trip_items enable row level security;
drop policy if exists "People on the trip can see the packing list" on public.trip_items;
create policy "People on the trip can see the packing list" on public.trip_items for select
  using (public.is_trip_member(trip_id, auth.uid()));
drop policy if exists "People on the trip can add to the packing list" on public.trip_items;
create policy "People on the trip can add to the packing list" on public.trip_items for insert
  with check (auth.uid() = created_by and claimed_by is null and public.is_trip_member(trip_id, auth.uid()));
drop policy if exists "People on the trip can claim an item" on public.trip_items;
create policy "People on the trip can claim an item" on public.trip_items for update
  using (public.is_trip_member(trip_id, auth.uid()) and (claimed_by is null or claimed_by = auth.uid()))
  with check (public.is_trip_member(trip_id, auth.uid()) and (claimed_by is null or claimed_by = auth.uid()));
drop policy if exists "Whoever added an item, or the trip creator, can remove it" on public.trip_items;
create policy "Whoever added an item, or the trip creator, can remove it" on public.trip_items for delete
  using (
    auth.uid() = created_by
    or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
  );

-- Catches logged to a trip, for its recap. Bragging rights, so the crew can see them like
-- tournament entries; only someone on the trip can log one.
create table if not exists public.trip_catches (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  angler_name text not null default 'Angler',
  species text not null,
  length_in numeric check (length_in is null or length_in > 0),
  caught_at date,
  photo_url text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists trip_catches_trip_idx on public.trip_catches (trip_id, created_at);

alter table public.trip_catches enable row level security;
drop policy if exists "Signed-in anglers can see trip catches" on public.trip_catches;
create policy "Signed-in anglers can see trip catches" on public.trip_catches for select
  using (auth.uid() is not null);
drop policy if exists "Anglers on the trip can log their catches" on public.trip_catches;
create policy "Anglers on the trip can log their catches" on public.trip_catches for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.trip_attendees a where a.trip_id = trip_catches.trip_id and a.user_id = auth.uid())
  );
drop policy if exists "Anglers can remove their catch, and the creator any" on public.trip_catches;
create policy "Anglers can remove their catch, and the creator any" on public.trip_catches for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
  );

insert into storage.buckets (id, name, public)
values ('trip-catches', 'trip-catches', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view trip catch photos" on storage.objects;
create policy "Anyone can view trip catch photos" on storage.objects for select
  using (bucket_id = 'trip-catches');
drop policy if exists "Anglers upload their own trip catch photos" on storage.objects;
create policy "Anglers upload their own trip catch photos" on storage.objects for insert
  with check (bucket_id = 'trip-catches' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Anglers delete their own trip catch photos" on storage.objects;
create policy "Anglers delete their own trip catch photos" on storage.objects for delete
  using (bucket_id = 'trip-catches' and (storage.foldername(name))[1] = auth.uid()::text);

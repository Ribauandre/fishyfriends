-- Fishing trips: anyone in the crew can start one, see it, and opt in; the creator can
-- edit it and remove people. Who's going versus on the waitlist is not stored — it's the
-- first max_spots attendees by join time — so someone leaving promotes the next person
-- without a trigger. Expenses split equally among whoever is going; settlements record
-- "I paid you back" so balances net out. Money is visible to people on the trip only.
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text not null default 'Angler',
  name text not null,
  location text not null default '',
  -- Full state name, matching fishing_licenses.state, so each angler can be warned about
  -- a missing or lapsing license for the trip. '' when it isn't in the US.
  state text not null default '',
  starts_on date not null,
  ends_on date not null,
  target_species text[] not null default '{}',
  accommodation text not null default '',
  accommodation_url text not null default '',
  notes text not null default '',
  max_spots integer check (max_spots is null or max_spots > 0),
  created_at timestamptz not null default now(),
  constraint trips_dates_check check (ends_on >= starts_on)
);

create table if not exists public.trip_attendees (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  angler_name text not null default 'Angler',
  created_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table if not exists public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  paid_by uuid not null references auth.users(id) on delete cascade,
  paid_by_name text not null default 'Angler',
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.trip_settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  from_name text not null default 'Angler',
  to_user uuid not null references auth.users(id) on delete cascade,
  to_name text not null default 'Angler',
  amount_cents integer not null check (amount_cents > 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint trip_settlements_parties_check check (from_user <> to_user)
);

create index if not exists trip_attendees_trip_idx on public.trip_attendees (trip_id, created_at);
create index if not exists trip_expenses_trip_idx on public.trip_expenses (trip_id);
create index if not exists trip_settlements_trip_idx on public.trip_settlements (trip_id);

-- On the trip = its creator or anyone with an attendee row (going or waitlisted).
-- security definer so the money tables' policies can read trips/trip_attendees directly.
create or replace function public.is_trip_member(target_trip_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.trips t where t.id = target_trip_id and t.created_by = target_user_id
  ) or exists (
    select 1 from public.trip_attendees a where a.trip_id = target_trip_id and a.user_id = target_user_id
  );
$$;

alter table public.trips enable row level security;
drop policy if exists "Signed-in anglers can view trips" on public.trips;
create policy "Signed-in anglers can view trips" on public.trips for select
  using (auth.uid() is not null);
drop policy if exists "Anglers can create their own trips" on public.trips;
create policy "Anglers can create their own trips" on public.trips for insert
  with check (auth.uid() = created_by);
drop policy if exists "Creators can update their trips" on public.trips;
create policy "Creators can update their trips" on public.trips for update
  using (auth.uid() = created_by) with check (auth.uid() = created_by);
drop policy if exists "Creators can delete their trips" on public.trips;
create policy "Creators can delete their trips" on public.trips for delete
  using (auth.uid() = created_by);

alter table public.trip_attendees enable row level security;
drop policy if exists "Signed-in anglers can see who is going" on public.trip_attendees;
create policy "Signed-in anglers can see who is going" on public.trip_attendees for select
  using (auth.uid() is not null);
drop policy if exists "Anglers can opt themselves in" on public.trip_attendees;
create policy "Anglers can opt themselves in" on public.trip_attendees for insert
  with check (auth.uid() = user_id);
drop policy if exists "Anglers can leave, and the creator can remove anyone" on public.trip_attendees;
create policy "Anglers can leave, and the creator can remove anyone" on public.trip_attendees for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
  );

alter table public.trip_expenses enable row level security;
drop policy if exists "People on the trip can see its expenses" on public.trip_expenses;
create policy "People on the trip can see its expenses" on public.trip_expenses for select
  using (public.is_trip_member(trip_id, auth.uid()));
drop policy if exists "People on the trip can add what they paid" on public.trip_expenses;
create policy "People on the trip can add what they paid" on public.trip_expenses for insert
  with check (auth.uid() = paid_by and public.is_trip_member(trip_id, auth.uid()));
drop policy if exists "The payer or the trip creator can remove an expense" on public.trip_expenses;
create policy "The payer or the trip creator can remove an expense" on public.trip_expenses for delete
  using (
    auth.uid() = paid_by
    or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
  );

alter table public.trip_settlements enable row level security;
drop policy if exists "People on the trip can see its settlements" on public.trip_settlements;
create policy "People on the trip can see its settlements" on public.trip_settlements for select
  using (public.is_trip_member(trip_id, auth.uid()));
drop policy if exists "Either party can record a payment" on public.trip_settlements;
create policy "Either party can record a payment" on public.trip_settlements for insert
  with check (
    auth.uid() = created_by
    and auth.uid() in (from_user, to_user)
    and public.is_trip_member(trip_id, auth.uid())
  );
drop policy if exists "Whoever recorded a payment, or the trip creator, can undo it" on public.trip_settlements;
create policy "Whoever recorded a payment, or the trip creator, can undo it" on public.trip_settlements for delete
  using (
    auth.uid() = created_by
    or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
  );

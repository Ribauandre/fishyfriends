-- River gauges: the club's shared list of USGS stream gauges, for the River gauges page
-- (Plan > Gauges). The readings themselves are never stored: the page asks USGS for them
-- each time (utils/riverGauges.js). This table only says WHICH gauges the club watches and
-- what to call them — "South Branch Raritan, near High Bridge" reads better on a card than
-- the survey's own "South Branch Raritan River near High Bridge NJ".
--
-- Any member can add a gauge and take back one they added; the admin can remove any. A row
-- can't be edited (no update grant): remove it and add it again. Where a gauge sits in the
-- list is the database's to say (`position` is not in the insert grant), so the starting
-- list keeps its order and what members add follows it, oldest first.
--
-- The thirteen it starts with are New Jersey trout water, as public as data gets: station
-- numbers and place names from the U.S. Geological Survey.

create table if not exists public.river_gauges (
  id uuid primary key default gen_random_uuid(),
  site_no text not null,
  river text not null,
  place text not null default '',
  state text not null,
  position integer not null default 1000,
  added_by uuid references auth.users(id) on delete set null,
  added_by_name text not null default '',
  created_at timestamptz not null default now(),
  constraint river_gauges_site_no_key unique (site_no),
  constraint river_gauges_site_no_form check (site_no ~ '^[0-9]{8,15}$'),
  constraint river_gauges_state_form check (state ~ '^[A-Z]{2}$'),
  constraint river_gauges_river_len check (char_length(river) between 1 and 80),
  constraint river_gauges_place_len check (char_length(place) <= 120),
  constraint river_gauges_added_by_name_len check (char_length(added_by_name) <= 80)
);

alter table public.river_gauges enable row level security;

do $$
begin
  revoke all on table public.river_gauges from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.river_gauges from anon, authenticated;
    grant select, delete on table public.river_gauges to authenticated;
    grant insert (site_no, river, place, state, added_by, added_by_name) on table public.river_gauges to authenticated;
    grant all on table public.river_gauges to service_role;
  end if;
end $$;

-- (Looked for before dropping: "drop policy if exists" puts a line in the deploy log for
-- each one that isn't there, which on a first run is all of them.)
do $$
declare
  old_policy text;
begin
  for old_policy in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'river_gauges'
  loop
    execute format('drop policy %I on public.river_gauges', old_policy);
  end loop;
end $$;

create policy "Members see the club's gauges" on public.river_gauges for select to authenticated
  using ((select public.is_member()));

create policy "Members add a gauge under their own name" on public.river_gauges for insert to authenticated
  with check ((select public.is_member()) and added_by = (select auth.uid()));

create policy "Members remove a gauge they added; the admin any" on public.river_gauges for delete to authenticated
  using ((select public.is_member()) and (added_by = (select auth.uid()) or (select public.is_admin())));

-- The name beside "added by" is the account's, written by the database like every other
-- name on a row (0043), and a member can only add so many in a day (0047).
create or replace trigger stamp_names before insert on public.river_gauges
  for each row execute function public.stamp_names('added_by', 'added_by_name', '');

do $$
begin
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.river_gauges'::regclass and t.tgname = 'count_writes' and not t.tgisinternal
  ) then
    drop trigger count_writes on public.river_gauges;
  end if;
  create trigger count_writes after insert on public.river_gauges
    referencing new table as added for each statement execute function public.count_writes('60', 'gauges');
end $$;

insert into public.river_gauges (site_no, river, place, state, position) values
  ('01396500', 'South Branch Raritan', 'near High Bridge',              'NJ', 1),
  ('01457000', 'Musconetcong River',   'near Bloomsbury',               'NJ', 2),
  ('01380450', 'Rockaway River',       'at Boonton',                    'NJ', 5),
  ('01443500', 'Paulins Kill',         'at Blairstown',                 'NJ', 6),
  ('01379845', 'Rockaway River',       'at Dover',                      'NJ', 7),
  ('01395000', 'Rahway River',         'at Rahway',                     'NJ', 8),
  ('01383500', 'Wanaque River',        'at Awosting',                   'NJ', 9),
  ('01387000', 'Wanaque River',        'at Wanaque',                    'NJ', 10),
  ('01390500', 'Saddle River',         'at Ridgewood',                  'NJ', 11),
  ('01391102', 'Saddle River',         'below Hohokus Brook, Paramus',  'NJ', 12),
  ('01400500', 'Raritan River',        'at Manville',                   'NJ', 13),
  ('01400000', 'North Branch Raritan', 'near Raritan',                  'NJ', 14),
  ('01398500', 'North Branch Raritan', 'near Far Hills',                'NJ', 15)
on conflict (site_no) do nothing;

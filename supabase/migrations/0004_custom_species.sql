-- Custom species: names anglers type into a species field that aren't already on the
-- built-in list (see src/utils/speciesOptions.js), so they become a suggested option for
-- everyone else too instead of staying a one-off typed value.
create table if not exists public.custom_species (
  name text primary key,
  created_at timestamptz default now()
);

alter table public.custom_species enable row level security;
drop policy if exists "Members can view custom species" on public.custom_species;
create policy "Members can view custom species" on public.custom_species for select using (true);
drop policy if exists "Members can add custom species" on public.custom_species;
create policy "Members can add custom species" on public.custom_species for insert with check (auth.uid() is not null);

-- Adds the shared custom-species list to a project that already has everything else in
-- schema.sql deployed (running the full file there fails on its first `create table` —
-- see migration-personal-bests.sql for that same situation). Safe to run more than
-- once — the table uses IF NOT EXISTS and policies are dropped before being recreated.

create table if not exists public.custom_species (
  name text primary key,
  created_at timestamptz default now()
);

alter table public.custom_species enable row level security;
drop policy if exists "Members can view custom species" on public.custom_species;
create policy "Members can view custom species" on public.custom_species for select using (true);
drop policy if exists "Members can add custom species" on public.custom_species;
create policy "Members can add custom species" on public.custom_species for insert with check (auth.uid() is not null);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New angler',
  home_water text default '',
  favorite_species text default '',
  bio text default '',
  avatar_url text default '',
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
drop policy if exists "Members can view profiles" on public.profiles;
create policy "Members can view profiles" on public.profiles for select using (true);
drop policy if exists "Members can insert their profile" on public.profiles;
create policy "Members can insert their profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Members can update their profile" on public.profiles;
create policy "Members can update their profile" on public.profiles for update using (auth.uid() = id);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view avatars" on storage.objects;
create policy "Anyone can view avatars" on storage.objects for select
using (bucket_id = 'avatars');
drop policy if exists "Members can upload their avatar" on storage.objects;
create policy "Members can upload their avatar" on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Members can update their avatar" on storage.objects;
create policy "Members can update their avatar" on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Personal bests: one angler can log a best fish per species, visible to the whole crew
-- (powers the angler lookup directory and the profile page's personal-best grid).
-- Already deployed profiles/avatars above and just need this part? Run
-- migration-personal-bests.sql instead — same statements, standalone.
create table if not exists public.personal_bests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  species text not null,
  size_label text default '',
  caught_at date,
  photo_url text default '',
  created_at timestamptz default now()
);

alter table public.personal_bests enable row level security;
drop policy if exists "Members can view personal bests" on public.personal_bests;
create policy "Members can view personal bests" on public.personal_bests for select using (true);
drop policy if exists "Members can insert their personal bests" on public.personal_bests;
create policy "Members can insert their personal bests" on public.personal_bests for insert with check (auth.uid() = user_id);
drop policy if exists "Members can update their personal bests" on public.personal_bests;
create policy "Members can update their personal bests" on public.personal_bests for update using (auth.uid() = user_id);
drop policy if exists "Members can delete their personal bests" on public.personal_bests;
create policy "Members can delete their personal bests" on public.personal_bests for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('personal-bests', 'personal-bests', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view personal best photos" on storage.objects;
create policy "Anyone can view personal best photos" on storage.objects for select
using (bucket_id = 'personal-bests');
drop policy if exists "Members can upload their personal best photos" on storage.objects;
create policy "Members can upload their personal best photos" on storage.objects for insert
with check (bucket_id = 'personal-bests' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Members can update their personal best photos" on storage.objects;
create policy "Members can update their personal best photos" on storage.objects for update
using (bucket_id = 'personal-bests' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Members can delete their personal best photos" on storage.objects;
create policy "Members can delete their personal best photos" on storage.objects for delete
using (bucket_id = 'personal-bests' and (storage.foldername(name))[1] = auth.uid()::text);

-- Comments on a personal best photo. author_name is snapshotted at post time so a comment
-- still reads correctly even if the commenter later renames themselves.
create table if not exists public.personal_best_comments (
  id uuid primary key default gen_random_uuid(),
  personal_best_id uuid not null references public.personal_bests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Angler',
  body text not null,
  created_at timestamptz default now()
);

alter table public.personal_best_comments enable row level security;
drop policy if exists "Members can view personal best comments" on public.personal_best_comments;
create policy "Members can view personal best comments" on public.personal_best_comments for select using (true);
drop policy if exists "Members can add personal best comments" on public.personal_best_comments;
create policy "Members can add personal best comments" on public.personal_best_comments for insert with check (auth.uid() = user_id);
drop policy if exists "Members can delete their own personal best comments" on public.personal_best_comments;
create policy "Members can delete their own personal best comments" on public.personal_best_comments for delete using (auth.uid() = user_id);

-- Fish Year catches: the monthly challenge log, one row per logged catch. angler_name is
-- snapshotted at post time (same convention as personal_best_comments.author_name) so the
-- board still reads correctly if someone later renames themselves.
-- Already deployed everything above and just need this part? Run
-- migration-fish-year-catches.sql instead — same statements, standalone.
create table if not exists public.fish_year_catches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  angler_name text not null default 'Angler',
  angler_avatar_url text default '',
  year int not null,
  month text not null,
  species text not null,
  caught_at date,
  photo_url text default '',
  created_at timestamptz default now()
);
alter table public.fish_year_catches add column if not exists angler_avatar_url text default '';

alter table public.fish_year_catches enable row level security;
drop policy if exists "Members can view fish year catches" on public.fish_year_catches;
create policy "Members can view fish year catches" on public.fish_year_catches for select using (true);
drop policy if exists "Members can insert their fish year catches" on public.fish_year_catches;
create policy "Members can insert their fish year catches" on public.fish_year_catches for insert with check (auth.uid() = user_id);
drop policy if exists "Members can delete their fish year catches" on public.fish_year_catches;
create policy "Members can delete their fish year catches" on public.fish_year_catches for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('fish-year-catches', 'fish-year-catches', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view fish year catch photos" on storage.objects;
create policy "Anyone can view fish year catch photos" on storage.objects for select
using (bucket_id = 'fish-year-catches');
drop policy if exists "Members can upload their fish year catch photos" on storage.objects;
create policy "Members can upload their fish year catch photos" on storage.objects for insert
with check (bucket_id = 'fish-year-catches' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Members can delete their fish year catch photos" on storage.objects;
create policy "Members can delete their fish year catch photos" on storage.objects for delete
using (bucket_id = 'fish-year-catches' and (storage.foldername(name))[1] = auth.uid()::text);

-- Custom species: names anglers type into a species field that aren't already on the
-- built-in list (see src/utils/speciesOptions.js), so they become a suggested option for
-- everyone else too instead of staying a one-off typed value.
-- Already deployed everything above and just need this part? Run
-- migration-custom-species.sql instead — same statements, standalone.
create table if not exists public.custom_species (
  name text primary key,
  created_at timestamptz default now()
);

alter table public.custom_species enable row level security;
drop policy if exists "Members can view custom species" on public.custom_species;
create policy "Members can view custom species" on public.custom_species for select using (true);
drop policy if exists "Members can add custom species" on public.custom_species;
create policy "Members can add custom species" on public.custom_species for insert with check (auth.uid() is not null);

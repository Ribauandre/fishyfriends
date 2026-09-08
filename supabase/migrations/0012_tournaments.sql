-- Real tournaments: anyone can start one (name, rules, a measurement unit, and a date
-- range) and anglers log entries against it. Same conventions as fish_year_catches /
-- personal_bests: angler_name is snapshotted at post time, entries carry their own photo,
-- and likes/comments get their own dedicated tables rather than a shared polymorphic one.
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rules text not null default '',
  unit text not null default 'in' check (unit in ('in', 'lb')),
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text not null default 'Angler',
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;
drop policy if exists "Members can view tournaments" on public.tournaments;
create policy "Members can view tournaments" on public.tournaments for select using (true);
drop policy if exists "Members can create tournaments" on public.tournaments;
create policy "Members can create tournaments" on public.tournaments for insert with check (auth.uid() = created_by);
drop policy if exists "Members can delete their tournaments" on public.tournaments;
create policy "Members can delete their tournaments" on public.tournaments for delete using (auth.uid() = created_by);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  angler_name text not null default 'Angler',
  angler_avatar_url text default '',
  species text not null,
  size numeric not null check (size > 0),
  caught_at date,
  photo_url text default '',
  created_at timestamptz not null default now()
);

create index if not exists tournament_entries_tournament_idx on public.tournament_entries (tournament_id);

alter table public.tournament_entries enable row level security;
drop policy if exists "Members can view tournament entries" on public.tournament_entries;
create policy "Members can view tournament entries" on public.tournament_entries for select using (true);
drop policy if exists "Members can log their tournament entries" on public.tournament_entries;
create policy "Members can log their tournament entries" on public.tournament_entries for insert with check (auth.uid() = user_id);
drop policy if exists "Members can delete their tournament entries" on public.tournament_entries;
create policy "Members can delete their tournament entries" on public.tournament_entries for delete using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('tournament-entries', 'tournament-entries', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can view tournament entry photos" on storage.objects;
create policy "Anyone can view tournament entry photos" on storage.objects for select
using (bucket_id = 'tournament-entries');
drop policy if exists "Members can upload their tournament entry photos" on storage.objects;
create policy "Members can upload their tournament entry photos" on storage.objects for insert
with check (bucket_id = 'tournament-entries' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Members can delete their tournament entry photos" on storage.objects;
create policy "Members can delete their tournament entry photos" on storage.objects for delete
using (bucket_id = 'tournament-entries' and (storage.foldername(name))[1] = auth.uid()::text);

-- Likes on a tournament entry, same shape as personal_best_likes / fish_year_catch_likes.
create table if not exists public.tournament_entry_likes (
  tournament_entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tournament_entry_id, user_id)
);

alter table public.tournament_entry_likes enable row level security;
drop policy if exists "Members can view tournament entry likes" on public.tournament_entry_likes;
create policy "Members can view tournament entry likes" on public.tournament_entry_likes for select using (true);
drop policy if exists "Members can like a tournament entry" on public.tournament_entry_likes;
create policy "Members can like a tournament entry" on public.tournament_entry_likes for insert with check (auth.uid() = user_id);
drop policy if exists "Members can unlike their own tournament entry like" on public.tournament_entry_likes;
create policy "Members can unlike their own tournament entry like" on public.tournament_entry_likes for delete using (auth.uid() = user_id);

-- Comments on a tournament entry, same shape as fish_year_catch_comments.
create table if not exists public.tournament_entry_comments (
  id uuid primary key default gen_random_uuid(),
  tournament_entry_id uuid not null references public.tournament_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Angler',
  body text not null,
  created_at timestamptz default now()
);

alter table public.tournament_entry_comments enable row level security;
drop policy if exists "Members can view tournament entry comments" on public.tournament_entry_comments;
create policy "Members can view tournament entry comments" on public.tournament_entry_comments for select using (true);
drop policy if exists "Members can add tournament entry comments" on public.tournament_entry_comments;
create policy "Members can add tournament entry comments" on public.tournament_entry_comments for insert with check (auth.uid() = user_id);
drop policy if exists "Members can delete their own tournament entry comments" on public.tournament_entry_comments;
create policy "Members can delete their own tournament entry comments" on public.tournament_entry_comments for delete using (auth.uid() = user_id);

-- Let notifications reference a liked/commented tournament entry too.
alter table public.notifications drop constraint if exists notifications_target_type_check;
alter table public.notifications add constraint notifications_target_type_check
  check (target_type in ('personal_best', 'fish_year_catch', 'tournament_entry'));

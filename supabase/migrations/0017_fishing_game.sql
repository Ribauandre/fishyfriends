-- "Cast & Catch" minigame: a self-contained arcade tab, deliberately not wired into Fish
-- Year or tournaments — catches here are for fun/bragging only. game_profiles holds each
-- angler's spendable tackle points and gear levels (rod/line/reel/bait, 1-5 each); those
-- levels make the minigame's cast/hookset/reel-in more forgiving, they never auto-win it.
-- game_catches is a pure trophy log, same snapshot-the-author-name convention as
-- fish_year_catches/tournament_entries.
create table if not exists public.game_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tackle_points integer not null default 0,
  rod_level integer not null default 1 check (rod_level between 1 and 5),
  line_level integer not null default 1 check (line_level between 1 and 5),
  reel_level integer not null default 1 check (reel_level between 1 and 5),
  bait_level integer not null default 1 check (bait_level between 1 and 5),
  updated_at timestamptz not null default now()
);

alter table public.game_profiles enable row level security;
drop policy if exists "Members can view game profiles" on public.game_profiles;
create policy "Members can view game profiles" on public.game_profiles for select using (true);
drop policy if exists "Members can create their own game profile" on public.game_profiles;
create policy "Members can create their own game profile" on public.game_profiles for insert with check (auth.uid() = user_id);
drop policy if exists "Members can update their own game profile" on public.game_profiles;
create policy "Members can update their own game profile" on public.game_profiles for update using (auth.uid() = user_id);

create table if not exists public.game_catches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  angler_name text not null default 'Angler',
  species text not null,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  size_label text not null default '',
  points_earned integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists game_catches_user_idx on public.game_catches (user_id);

alter table public.game_catches enable row level security;
drop policy if exists "Members can view game catches" on public.game_catches;
create policy "Members can view game catches" on public.game_catches for select using (true);
drop policy if exists "Members can log their own game catches" on public.game_catches;
create policy "Members can log their own game catches" on public.game_catches for insert with check (auth.uid() = user_id);
drop policy if exists "Members can delete their own game catches" on public.game_catches;
create policy "Members can delete their own game catches" on public.game_catches for delete using (auth.uid() = user_id);

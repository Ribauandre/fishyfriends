-- Likes on a personal best: one row per (personal best, angler) so a like can be toggled
-- by inserting/deleting, and the same angler can't like the same post twice.
create table if not exists public.personal_best_likes (
  personal_best_id uuid not null references public.personal_bests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (personal_best_id, user_id)
);

alter table public.personal_best_likes enable row level security;
drop policy if exists "Members can view personal best likes" on public.personal_best_likes;
create policy "Members can view personal best likes" on public.personal_best_likes for select using (true);
drop policy if exists "Members can like a personal best" on public.personal_best_likes;
create policy "Members can like a personal best" on public.personal_best_likes for insert with check (auth.uid() = user_id);
drop policy if exists "Members can unlike their own like" on public.personal_best_likes;
create policy "Members can unlike their own like" on public.personal_best_likes for delete using (auth.uid() = user_id);

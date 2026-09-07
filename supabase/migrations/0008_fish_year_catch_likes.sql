-- Likes on a Fish Year catch, same shape as personal_best_likes.
create table if not exists public.fish_year_catch_likes (
  catch_id uuid not null references public.fish_year_catches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (catch_id, user_id)
);

alter table public.fish_year_catch_likes enable row level security;
drop policy if exists "Members can view fish year catch likes" on public.fish_year_catch_likes;
create policy "Members can view fish year catch likes" on public.fish_year_catch_likes for select using (true);
drop policy if exists "Members can like a fish year catch" on public.fish_year_catch_likes;
create policy "Members can like a fish year catch" on public.fish_year_catch_likes for insert with check (auth.uid() = user_id);
drop policy if exists "Members can unlike their own fish year catch like" on public.fish_year_catch_likes;
create policy "Members can unlike their own fish year catch like" on public.fish_year_catch_likes for delete using (auth.uid() = user_id);

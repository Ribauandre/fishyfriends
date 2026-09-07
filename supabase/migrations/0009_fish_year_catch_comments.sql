-- Comments on a Fish Year catch, same shape and convention as personal_best_comments
-- (author_name snapshotted at post time so a comment still reads correctly even if the
-- commenter later renames themselves).
create table if not exists public.fish_year_catch_comments (
  id uuid primary key default gen_random_uuid(),
  catch_id uuid not null references public.fish_year_catches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Angler',
  body text not null,
  created_at timestamptz default now()
);

alter table public.fish_year_catch_comments enable row level security;
drop policy if exists "Members can view fish year catch comments" on public.fish_year_catch_comments;
create policy "Members can view fish year catch comments" on public.fish_year_catch_comments for select using (true);
drop policy if exists "Members can add fish year catch comments" on public.fish_year_catch_comments;
create policy "Members can add fish year catch comments" on public.fish_year_catch_comments for insert with check (auth.uid() = user_id);
drop policy if exists "Members can delete their own fish year catch comments" on public.fish_year_catch_comments;
create policy "Members can delete their own fish year catch comments" on public.fish_year_catch_comments for delete using (auth.uid() = user_id);

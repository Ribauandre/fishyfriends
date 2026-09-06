-- Personal bests: one angler can log a best fish per species, visible to the whole crew
-- (powers the angler lookup directory and the profile page's personal-best grid).
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

-- Fish Year catches: the monthly challenge log, one row per logged catch. angler_name is
-- snapshotted at post time (same convention as personal_best_comments.author_name) so the
-- board still reads correctly if someone later renames themselves.
create table if not exists public.fish_year_catches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  angler_name text not null default 'Angler',
  year int not null,
  month text not null,
  species text not null,
  caught_at date,
  photo_url text default '',
  created_at timestamptz default now()
);

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

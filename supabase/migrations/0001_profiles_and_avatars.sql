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

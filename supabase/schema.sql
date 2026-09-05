create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New angler',
  home_water text default '',
  favorite_species text default '',
  bio text default '',
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
create policy "Members can view profiles" on public.profiles for select using (true);
create policy "Members can insert their profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Members can update their profile" on public.profiles for update using (auth.uid() = id);
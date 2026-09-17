-- Fishing licenses: state licenses an angler wants on file so they can pull one up if a
-- game warden asks, and get an in-app heads-up before it lapses. Unlike the shared photo
-- tables elsewhere in this app, a license number is nobody else's business, so both the
-- table and its photo bucket are locked to the owner only (private bucket + signed URLs,
-- not the public bucket + permanent URL pattern the other photo features use).
create table if not exists public.fishing_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null,
  license_number text default '',
  issued_at date,
  expires_at date not null,
  photo_path text default '',
  created_at timestamptz default now()
);

create index if not exists fishing_licenses_user_expires_idx on public.fishing_licenses (user_id, expires_at);

alter table public.fishing_licenses enable row level security;
drop policy if exists "Anglers manage their own fishing licenses" on public.fishing_licenses;
create policy "Anglers manage their own fishing licenses" on public.fishing_licenses for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('fishing-licenses', 'fishing-licenses', false)
on conflict (id) do update set public = false;

drop policy if exists "Anglers view their own license photos" on storage.objects;
create policy "Anglers view their own license photos" on storage.objects for select
using (bucket_id = 'fishing-licenses' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Anglers upload their own license photos" on storage.objects;
create policy "Anglers upload their own license photos" on storage.objects for insert
with check (bucket_id = 'fishing-licenses' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Anglers update their own license photos" on storage.objects;
create policy "Anglers update their own license photos" on storage.objects for update
using (bucket_id = 'fishing-licenses' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Anglers delete their own license photos" on storage.objects;
create policy "Anglers delete their own license photos" on storage.objects for delete
using (bucket_id = 'fishing-licenses' and (storage.foldername(name))[1] = auth.uid()::text);

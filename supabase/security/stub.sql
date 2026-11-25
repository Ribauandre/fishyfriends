-- Just enough of Supabase for the migrations to replay on a plain Postgres, set up the way
-- the LIVE project is rather than the way a new one would be:
--
--   * tables made before 30 October 2026 were handed to anon / authenticated / service_role
--     wholesale ("grant all") by Supabase's old default privileges, functions too;
--   * storage carried policies made by hand in the dashboard (an unconditional "for all"
--     on storage.objects and storage.buckets), which is what migration 0041 found.
--
-- So a migration that only works because a fresh database is tidy fails here. Used by
-- attack-tests.mjs; see CLAUDE.md ("Security checks").
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
create table auth.users (
  id uuid primary key,
  email varchar(255),
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz default now(),
  created_at timestamptz default now()
);
-- As Supabase defines it, empty-string claims included: a connection that has carried a
-- signed-in request and then runs something of its own (the pooler's do) has '' here, not null.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', 'anon') $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
create policy "Public Access" on storage.objects for all using (true) with check (true);
create policy "Give anon users access to JPG images in folder 1oj01fe_0" on storage.objects for select to anon using (bucket_id = 'photos' and auth.role() = 'anon');
create policy "bucket admin" on storage.buckets for all using (true) with check (true);

create publication supabase_realtime;

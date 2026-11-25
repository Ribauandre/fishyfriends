-- Backups. The project is on Supabase's free plan, which keeps none: a bad migration, a
-- mistaken delete, or the project itself going away would take the club's records with it.
-- From this version a nightly job (.github/workflows/backup.yml, supabase/backup/) copies
-- every row out, and this file holds the two things that job needs from the database.
--
-- The copies are kept as build artifacts of a PUBLIC repository, where anyone with a GitHub
-- account can download them, so they are encrypted — and to a key the job itself cannot
-- read. The admin makes a key pair in the browser on the admin page: the private half is
-- downloaded and never leaves their hands; the public half is stored here. The job encrypts
-- each night's copy to the public half. Nothing on GitHub, and nothing in this database, can
-- open a backup; a compromise of the build cannot read old ones.
--
--   backup_keys   the public half (one current key; earlier ones are kept, retired, so that
--                 "which key opens this copy" can always be answered by its fingerprint).
--   backup_runs   one row per copy that was made AND kept, written by the job, so the admin
--                 page can say when the last one was — a job that silently stops is the usual
--                 way a backup turns out not to exist.
--
-- Like club_members, neither table is in the API: row-level security on, no policies, no
-- grants. backup_status() and set_backup_key() are the admin's only way in, and they ask
-- is_admin() themselves. The job connects as the owner.
--
-- What a backup is NOT: photos and license documents are files in storage, not rows, and are
-- not in it.

create table if not exists public.backup_keys (
  id uuid primary key default gen_random_uuid(),
  public_key text not null,
  fingerprint text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  constraint backup_keys_public_key_len check (char_length(public_key) between 200 and 2000),
  constraint backup_keys_fingerprint_hex check (fingerprint ~ '^[0-9a-f]{64}$')
);
-- One current key at a time.
create unique index if not exists backup_keys_one_current on public.backup_keys ((true)) where retired_at is null;

create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  finished_at timestamptz not null default now(),
  fingerprint text not null,
  bytes bigint not null,
  table_count integer not null,
  row_count bigint not null,
  constraint backup_runs_fingerprint_hex check (fingerprint ~ '^[0-9a-f]{64}$'),
  constraint backup_runs_counts check (bytes >= 0 and table_count >= 0 and row_count >= 0)
);
create index if not exists backup_runs_finished_at on public.backup_runs (finished_at desc);

alter table public.backup_keys enable row level security;
alter table public.backup_runs enable row level security;

-- What the admin page shows: the current key's fingerprint and age, the last copy that was
-- kept, and how many were kept in the last thirty days. Never the key itself: it is public,
-- but nothing in the app needs it.
create or replace function public.backup_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the club admin can see the backups.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'key', (
      select jsonb_build_object('fingerprint', k.fingerprint, 'created_at', k.created_at)
      from public.backup_keys k where k.retired_at is null
    ),
    'last_run', (
      select jsonb_build_object('finished_at', r.finished_at, 'fingerprint', r.fingerprint, 'bytes', r.bytes, 'tables', r.table_count, 'rows', r.row_count)
      from public.backup_runs r order by r.finished_at desc limit 1
    ),
    'runs_30d', (select count(*) from public.backup_runs r where r.finished_at > now() - interval '30 days')
  );
end;
$$;

-- Sets the key the nightly copies are encrypted to (the public half, as PEM). The one before
-- it is retired, not deleted. Returns the new key's fingerprint — SHA-256 of the key itself,
-- worked out here rather than taken from the caller, so that what the admin page shows, what
-- the job prints and what a backup file carries are the same sixty-four characters or
-- something is wrong.
create or replace function public.set_backup_key(new_public_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  pem text := btrim(coalesce(new_public_key, ''), E' \t\r\n');
  body text;
  der bytea;
  print text;
begin
  if not public.is_admin() then
    raise exception 'Only the club admin can set the backup key.' using errcode = '42501';
  end if;
  if char_length(pem) not between 200 and 2000
     or pem !~ '^-----BEGIN PUBLIC KEY-----[A-Za-z0-9+/=\s]+-----END PUBLIC KEY-----$' then
    raise exception 'That is not a public key.' using errcode = '22023';
  end if;
  body := regexp_replace(regexp_replace(pem, '-----(BEGIN|END) PUBLIC KEY-----', '', 'g'), '\s', '', 'g');
  begin
    der := decode(body, 'base64');
  exception when others then
    raise exception 'That is not a public key.' using errcode = '22023';
  end;
  -- A 3072-bit RSA key is 422 bytes in this form and a 4096-bit one 550; the job refuses
  -- anything it can't read as an RSA key of at least 3072 bits before it encrypts to it.
  if octet_length(der) < 400 then
    raise exception 'That key is too short to protect a backup.' using errcode = '22023';
  end if;
  print := encode(sha256(der), 'hex');

  update public.backup_keys set retired_at = now() where retired_at is null;
  insert into public.backup_keys (public_key, fingerprint, created_by) values (pem, print, (select auth.uid()));
  return print;
end;
$$;

do $$
begin
  revoke all on table public.backup_keys from public;
  revoke all on table public.backup_runs from public;
  revoke all on function public.backup_status() from public;
  revoke all on function public.set_backup_key(text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.backup_keys from anon, authenticated;
    revoke all on table public.backup_runs from anon, authenticated;
    revoke all on function public.backup_status() from anon;
    revoke all on function public.set_backup_key(text) from anon;
    grant execute on function public.backup_status() to authenticated, service_role;
    grant execute on function public.set_backup_key(text) to authenticated, service_role;
  end if;
end $$;

-- Retire public.entries: the original Fish Year catch log.
--
-- From March to June 2026 the Fish Year page wrote catches to "entries" (the angler's name
-- typed by hand, species, date, month, a photo in the "photos" bucket). When Fish Year moved
-- to fish_year_catches (0003, tied to real accounts), those rows were never carried over,
-- and the table sat open to the public key until 0035 closed it. This finishes the job:
--
-- 1. The whole table is copied to archive.fish_year_entries_v1 first, in a schema the Data
--    API never exposes, so no row is lost whatever happens below.
-- 2. Each row is copied into fish_year_catches for the angler whose display name matches
--    the name typed back then (case and spacing aside). A name two profiles share is not
--    guessed at; a catch already on the board (same angler, species and date) is not doubled.
--    The catch date is used as its posted time, so the old catches don't top the feed as new.
-- 3. public.entries is dropped.
--
-- What happened is reported as counts only (no names or data reach the deploy log). A row
-- with no matching profile stays in the archive, where it can still be placed by hand.
do $$
declare
  total int;
  copied int;
  already int;
  unplaced int;
  doubled int;
begin
  if to_regclass('public.entries') is null then
    return;
  end if;

  create schema if not exists archive;
  revoke all on schema archive from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema archive from anon, authenticated;
  end if;
  if to_regclass('archive.fish_year_entries_v1') is null then
    create table archive.fish_year_entries_v1 as table public.entries;
    alter table archive.fish_year_entries_v1 enable row level security;
  end if;

  create temporary table entry_moves on commit drop as
  select
    e.species,
    case when e.date::text ~ '^\d{4}-\d{2}-\d{2}' then left(e.date::text, 10)::date end as caught_at,
    coalesce(nullif(e.photo_url, ''), '') as photo_url,
    e.month as typed_month,
    (select p.id from public.profiles p where lower(regexp_replace(trim(p.display_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(e.name), '\s+', ' ', 'g')) limit 1) as user_id,
    (select count(*) from public.profiles p where lower(regexp_replace(trim(p.display_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(e.name), '\s+', ' ', 'g'))) as matches
  from public.entries e;

  select count(*) into total from entry_moves;
  select count(*) into unplaced from entry_moves where matches <> 1 or caught_at is null or coalesce(trim(species), '') = '';

  select count(*) into already from entry_moves m
  where m.matches = 1 and m.caught_at is not null and coalesce(trim(m.species), '') <> ''
    and exists (select 1 from public.fish_year_catches f where f.user_id = m.user_id and f.caught_at = m.caught_at and lower(trim(f.species)) = lower(trim(m.species)));

  insert into public.fish_year_catches (user_id, angler_name, angler_avatar_url, year, month, species, caught_at, photo_url, created_at)
  select distinct on (m.user_id, m.caught_at, lower(trim(m.species)))
    m.user_id, p.display_name, coalesce(p.avatar_url, ''), extract(year from m.caught_at)::int,
    case when m.typed_month in ('January','February','March','April','May','June','July','August','September','October','November','December')
      then m.typed_month else trim(to_char(m.caught_at, 'Month')) end,
    trim(m.species), m.caught_at, m.photo_url, m.caught_at::timestamptz + interval '12 hours'
  from entry_moves m join public.profiles p on p.id = m.user_id
  where m.matches = 1 and m.caught_at is not null and coalesce(trim(m.species), '') <> ''
    and not exists (select 1 from public.fish_year_catches f where f.user_id = m.user_id and f.caught_at = m.caught_at and lower(trim(f.species)) = lower(trim(m.species)));
  get diagnostics copied = row_count;
  doubled := total - unplaced - already - copied;

  raise notice 'entries: % rows; % copied to fish_year_catches, % already there, % repeats of another old row, % with no single matching profile or no valid date (kept in archive.fish_year_entries_v1)', total, copied, already, doubled, unplaced;

  drop table public.entries;
end $$;

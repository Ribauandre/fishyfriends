-- Place the archived Fish Year catches 0037 couldn't read a date for.
--
-- Every version of the old app wrote ISO dates, so the rows 0037 counted as "without a
-- usable date or species" were most likely typed into the table by hand: a date written
-- some other way, or just a month. Fish Year counts months, so this goes through the
-- archive once more:
--   * a date Postgres can read in any of its formats ("3/15/26", "March 15, 2026",
--     "2026-3-5"), kept only if it falls in 2025-2027;
--   * failing that, the month column alone: the catch goes in that month with no date. Its
--     year is the year the row was created (if the table kept a created_at), and a month
--     later in the year than that is the year before - a catch can't be logged before it
--     happened. With no created_at it is 2026, the year the old log ran.
-- People are matched with 0037's rules (strictest first, placed only when a rule finds
-- exactly one person), nothing already on the board is doubled - a month-only catch counts
-- as there if that person has the species anywhere in that month - and, as before, only
-- counts reach the deploy log: the repository and its logs are public.
create or replace function pg_temp.fy_norm(t text) returns text language sql immutable as $$
  select lower(regexp_replace(regexp_replace(trim(coalesce(t, '')), '[^A-Za-z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function pg_temp.fy_date(t text) returns date language plpgsql as $$
declare d date;
begin
  if t is null or trim(t) = '' then return null; end if;
  begin
    d := trim(t)::date;
  exception when others then
    return null;
  end;
  if extract(year from d) between 2025 and 2027 then return d; end if;
  return null;
end $$;

do $$
declare
  r record;
  rule text;
  hits uuid[];
  caught date;
  m text;
  yr int;
  made timestamptz;
  person uuid;
  months text[] := array['January','February','March','April','May','June','July','August','September','October','November','December'];
  rules text[] := array['exact', 'email', 'first', 'first+', 'initial', 'prefix'];
  dated int := 0; month_only int := 0; already int := 0; ambiguous int := 0; nobody int := 0;
  no_species int := 0; no_when int := 0; total int := 0;
begin
  if to_regclass('archive.fish_year_entries_v1') is null then
    return;
  end if;

  create temporary table fy_people on commit drop as
  select p.id, p.display_name, coalesce(p.avatar_url, '') as avatar_url, pg_temp.fy_norm(p.display_name) as n,
    lower(regexp_replace(split_part(coalesce(u.email, ''), '@', 1), '[^A-Za-z0-9]', '', 'g')) as mail
  from public.profiles p left join auth.users u on u.id = p.id
  where coalesce(trim(p.display_name), '') <> '';

  for r in select to_jsonb(a) as j from archive.fish_year_entries_v1 a loop
    total := total + 1;
    if coalesce(trim(r.j ->> 'species'), '') = '' then
      no_species := no_species + 1;
      continue;
    end if;

    caught := pg_temp.fy_date(r.j ->> 'date');
    m := (select x from unnest(months) x where lower(x) = lower(trim(coalesce(r.j ->> 'month', ''))) limit 1);
    if caught is not null then
      m := trim(to_char(caught, 'Month'));
      yr := extract(year from caught)::int;
    elsif m is not null then
      made := case when r.j ->> 'created_at' is not null then (r.j ->> 'created_at')::timestamptz end;
      yr := coalesce(extract(year from made)::int, 2026);
      if made is not null and array_position(months, m) > extract(month from made) then
        yr := yr - 1;
      end if;
    else
      no_when := no_when + 1;
      continue;
    end if;

    person := null;
    foreach rule in array rules loop
      select array_agg(id) into hits from fy_people p where case rule
        when 'exact' then p.n = pg_temp.fy_norm(r.j ->> 'name')
        when 'email' then p.mail <> '' and p.mail = replace(pg_temp.fy_norm(r.j ->> 'name'), ' ', '')
        when 'first' then position(' ' in pg_temp.fy_norm(r.j ->> 'name')) = 0 and split_part(p.n, ' ', 1) = pg_temp.fy_norm(r.j ->> 'name')
        when 'first+' then position(' ' in p.n) = 0 and split_part(pg_temp.fy_norm(r.j ->> 'name'), ' ', 1) = p.n
        when 'initial' then pg_temp.fy_norm(r.j ->> 'name') ~ '^\S+ \S$' and split_part(p.n, ' ', 1) = split_part(pg_temp.fy_norm(r.j ->> 'name'), ' ', 1) and left(split_part(p.n, ' ', 2), 1) = split_part(pg_temp.fy_norm(r.j ->> 'name'), ' ', 2)
        when 'prefix' then position(' ' in pg_temp.fy_norm(r.j ->> 'name')) = 0 and length(pg_temp.fy_norm(r.j ->> 'name')) >= 3 and split_part(p.n, ' ', 1) like pg_temp.fy_norm(r.j ->> 'name') || '%'
      end and pg_temp.fy_norm(r.j ->> 'name') <> '';
      exit when coalesce(array_length(hits, 1), 0) > 0;
    end loop;
    if coalesce(array_length(hits, 1), 0) = 1 then
      person := hits[1];
    end if;

    if person is null then
      if coalesce(array_length(hits, 1), 0) > 1 then ambiguous := ambiguous + 1; else nobody := nobody + 1; end if;
      continue;
    end if;

    if exists (
      select 1 from public.fish_year_catches f
      where f.user_id = person and lower(trim(f.species)) = lower(trim(r.j ->> 'species'))
        and (case when caught is not null then f.caught_at = caught else f.year = yr and f.month = m end)
    ) then
      already := already + 1;
      continue;
    end if;

    insert into public.fish_year_catches (user_id, angler_name, angler_avatar_url, year, month, species, caught_at, photo_url, created_at)
    select p.id, p.display_name, p.avatar_url, yr, m, trim(r.j ->> 'species'), caught, coalesce(nullif(r.j ->> 'photo_url', ''), ''),
      coalesce(caught::timestamptz, make_date(yr, array_position(months, m), 1)::timestamptz) + interval '12 hours'
    from fy_people p where p.id = person;
    if caught is not null then dated := dated + 1; else month_only := month_only + 1; end if;
  end loop;

  raise notice 'archived Fish Year log, second pass: % rows; % placed with a date, % placed by month only, % already on the board, % fit more than one person, % fit nobody, % with no species, % with neither a readable date nor a month', total, dated, month_only, already, ambiguous, nobody, no_species, no_when;
end $$;

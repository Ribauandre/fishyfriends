-- Place more of the original Fish Year log (archive.fish_year_entries_v1, kept by 0036) on
-- the board.
--
-- 0036 placed a catch only when the name typed back then was exactly a member's display
-- name; 27 of 36 weren't. The repository and its deploy logs are public, so names are never
-- printed or written here: this matches inside the database and reports counts only. Each
-- old name is tried against the profiles with these rules, strictest first, and a catch is
-- placed only when a rule finds exactly one person; a rule that finds two leaves the catch
-- where it is rather than falling through to a looser one:
--   exact       the same name, ignoring case, spacing and punctuation
--   email       the name is the person's email username ("kmsmith" -> kmsmith@...)
--   first       the name is a first name ("Kevin" -> "Kevin Smith")
--   first+      the name starts with someone's whole name ("Kevin S" -> "Kevin")
--   initial     a first name and an initial ("Kevin S" -> "Kevin Smith")
--   prefix      the start of a first name, three letters or more ("Rob" -> "Robert")
-- Dates typed US-style (MM/DD/YYYY) are read too. A catch already on the board for that
-- person, species and date is not doubled. Whatever stays unplaced stays in the archive.
do $$
declare
  r record;
  rule text;
  hits uuid[];
  caught date;
  person uuid;
  placed int := 0; already int := 0; ambiguous int := 0; nobody int := 0; undated int := 0; total int := 0;
  by_rule jsonb := '{}'::jsonb;
  rules text[] := array['exact', 'email', 'first', 'first+', 'initial', 'prefix'];
begin
  if to_regclass('archive.fish_year_entries_v1') is null then
    return;
  end if;

  create temporary table fy_people on commit drop as
  select p.id, p.display_name, coalesce(p.avatar_url, '') as avatar_url,
    lower(regexp_replace(regexp_replace(trim(p.display_name), '[^A-Za-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) as n,
    lower(regexp_replace(split_part(coalesce(u.email, ''), '@', 1), '[^A-Za-z0-9]', '', 'g')) as mail
  from public.profiles p left join auth.users u on u.id = p.id
  where coalesce(trim(p.display_name), '') <> '';

  for r in
    select a.*, lower(regexp_replace(regexp_replace(trim(coalesce(a.name, '')), '[^A-Za-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) as n
    from archive.fish_year_entries_v1 a
  loop
    total := total + 1;
    caught := case
      when r.date::text ~ '^\d{4}-\d{2}-\d{2}' then left(r.date::text, 10)::date
      when r.date::text ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(r.date::text, 'MM/DD/YYYY')
    end;
    if caught is null or coalesce(trim(r.species), '') = '' or r.n = '' then
      undated := undated + 1;
      continue;
    end if;

    person := null;
    foreach rule in array rules loop
      select array_agg(id) into hits from fy_people p where case rule
        when 'exact' then p.n = r.n
        when 'email' then p.mail <> '' and p.mail = replace(r.n, ' ', '')
        when 'first' then position(' ' in r.n) = 0 and split_part(p.n, ' ', 1) = r.n
        when 'first+' then position(' ' in p.n) = 0 and split_part(r.n, ' ', 1) = p.n
        when 'initial' then r.n ~ '^\S+ \S$' and split_part(p.n, ' ', 1) = split_part(r.n, ' ', 1) and left(split_part(p.n, ' ', 2), 1) = split_part(r.n, ' ', 2)
        when 'prefix' then position(' ' in r.n) = 0 and length(r.n) >= 3 and split_part(p.n, ' ', 1) like r.n || '%'
      end;
      if coalesce(array_length(hits, 1), 0) = 1 then
        person := hits[1];
        exit;
      elsif coalesce(array_length(hits, 1), 0) > 1 then
        exit;
      end if;
    end loop;

    if person is null then
      if coalesce(array_length(hits, 1), 0) > 1 then ambiguous := ambiguous + 1; else nobody := nobody + 1; end if;
      continue;
    end if;

    if exists (select 1 from public.fish_year_catches f where f.user_id = person and f.caught_at = caught and lower(trim(f.species)) = lower(trim(r.species))) then
      already := already + 1;
      continue;
    end if;

    insert into public.fish_year_catches (user_id, angler_name, angler_avatar_url, year, month, species, caught_at, photo_url, created_at)
    select p.id, p.display_name, p.avatar_url, extract(year from caught)::int,
      case when r.month in ('January','February','March','April','May','June','July','August','September','October','November','December')
        then r.month else trim(to_char(caught, 'Month')) end,
      trim(r.species), caught, coalesce(nullif(r.photo_url, ''), ''), caught::timestamptz + interval '12 hours'
    from fy_people p where p.id = person;
    placed := placed + 1;
    by_rule := jsonb_set(by_rule, array[rule], to_jsonb(coalesce((by_rule ->> rule)::int, 0) + 1));
  end loop;

  raise notice 'archived Fish Year log: % rows; % placed now (by rule: %), % already on the board, % fit more than one person, % fit nobody, % without a usable date or species', total, placed, by_rule, already, ambiguous, nobody, undated;
end $$;

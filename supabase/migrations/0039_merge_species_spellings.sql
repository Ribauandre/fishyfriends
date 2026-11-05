-- Merge the different spellings of one species across everything that names a fish.
--
-- The species box takes free text, so the same fish was saved as "Striper", "striped bass"
-- and "Stripped Bass" and counted as three species on the board, the Fish Year checklist and
-- personal bests. From now on every writer saves canonicalSpecies(name)
-- (src/utils/speciesNames.js); this applies the same rules to what was already logged:
--   * a species on the built-in list, matched ignoring case, spacing, punctuation and plurals;
--   * a common name that means exactly that fish (the alias table below: "striper" is
--     Striped Bass, "tog" Tautog, "dorado" Mahi Mahi);
--   * a small typo of either: one letter off from five letters, two from nine, nothing
--     shorter, and only when it is closest to exactly one species;
--   * anything else is kept, but its spellings that differ only in case, spacing,
--     punctuation or a plural are merged under the one used most.
-- The labels and aliases here must match SPECIES_OPTIONS and SPECIES_ALIASES; the test suite
-- checks that.
--
-- It renames the species on Fish Year catches, personal bests, tournament entries, trip
-- catches, trips' target lists and profiles' favourite species, and tidies the custom species
-- list. A personal best is the one exception: where renaming would give someone two bests for
-- the same fish, both are left as they are rather than either being deleted. The repository
-- and its deploy logs are public, so only counts are reported.
create or replace function pg_temp.sp_key(t text) returns text language sql immutable as $$
  select coalesce(string_agg(case when length(w) > 3 and w like '%s' and w not like '%ss' then left(w, -1) else w end, ' ' order by ord), '')
  from unnest(string_to_array(trim(regexp_replace(regexp_replace(lower(coalesce(t, '')), '&', ' and ', 'g'), '[^a-z0-9]+', ' ', 'g')), ' ')) with ordinality as x(w, ord)
  where w <> ''
$$;

create or replace function pg_temp.sp_lev(a text, b text) returns int language plpgsql immutable as $$
declare
  prev int[];
  cur int[];
  i int;
  j int;
begin
  if a = b then return 0; end if;
  prev := array(select generate_series(0, length(b)));
  for i in 1..length(a) loop
    cur := array[i];
    for j in 1..length(b) loop
      cur := cur || least(prev[j + 1] + 1, cur[j] + 1, prev[j] + case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end);
    end loop;
    prev := cur;
  end loop;
  return prev[length(b) + 1];
end $$;

create temporary table sp_labels (label text primary key) on commit drop;
insert into sp_labels (label) values
  ('Largemouth Bass'),
  ('Smallmouth Bass'),
  ('Striped Bass'),
  ('Weakfish'),
  ('Bluegill'),
  ('Yellow Perch'),
  ('Northern Pike'),
  ('Chain Pickerel'),
  ('Walleye'),
  ('Northern Snakehead'),
  ('Catfish'),
  ('Carp'),
  ('Brown Trout'),
  ('Rainbow Trout'),
  ('Brook Trout'),
  ('Lake Trout'),
  ('Steelhead'),
  ('Atlantic Salmon'),
  ('Coho Salmon'),
  ('Tuna'),
  ('Bluefish'),
  ('Mahi Mahi'),
  ('Shark'),
  ('Swordfish'),
  ('Fluke / Flounder'),
  ('Tautog'),
  ('Black Sea Bass'),
  ('Snook');

create temporary table sp_aliases (key text primary key, label text not null) on commit drop;
insert into sp_aliases (key, label) values
  ('striper', 'Striped Bass'),
  ('strip bass', 'Striped Bass'),
  ('linesider', 'Striped Bass'),
  ('largemouth', 'Largemouth Bass'),
  ('large mouth bass', 'Largemouth Bass'),
  ('large mouth', 'Largemouth Bass'),
  ('lmb', 'Largemouth Bass'),
  ('bucketmouth', 'Largemouth Bass'),
  ('smallmouth', 'Smallmouth Bass'),
  ('small mouth bass', 'Smallmouth Bass'),
  ('small mouth', 'Smallmouth Bass'),
  ('smallie', 'Smallmouth Bass'),
  ('smb', 'Smallmouth Bass'),
  ('bronzeback', 'Smallmouth Bass'),
  ('weakie', 'Weakfish'),
  ('squeteague', 'Weakfish'),
  ('blue gill', 'Bluegill'),
  ('pike', 'Northern Pike'),
  ('pickerel', 'Chain Pickerel'),
  ('snakehead', 'Northern Snakehead'),
  ('common carp', 'Carp'),
  ('brookie', 'Brook Trout'),
  ('laker', 'Lake Trout'),
  ('steelie', 'Steelhead'),
  ('steelhead trout', 'Steelhead'),
  ('coho', 'Coho Salmon'),
  ('silver salmon', 'Coho Salmon'),
  ('blue fish', 'Bluefish'),
  ('blue', 'Bluefish'),
  ('mahi', 'Mahi Mahi'),
  ('mahimahi', 'Mahi Mahi'),
  ('dorado', 'Mahi Mahi'),
  ('dolphinfish', 'Mahi Mahi'),
  ('dolphin fish', 'Mahi Mahi'),
  ('broadbill', 'Swordfish'),
  ('sword fish', 'Swordfish'),
  ('fluke', 'Fluke / Flounder'),
  ('flounder', 'Fluke / Flounder'),
  ('summer flounder', 'Fluke / Flounder'),
  ('tog', 'Tautog'),
  ('blackfish', 'Tautog'),
  ('sea bass', 'Black Sea Bass'),
  ('seabass', 'Black Sea Bass'),
  ('black seabass', 'Black Sea Bass'),
  ('bsb', 'Black Sea Bass');

create temporary table sp_targets on commit drop as
  select pg_temp.sp_key(label) as key, label from sp_labels
  union all
  select key, label from sp_aliases;

-- The canonical label for a name, or null if it isn't one of the listed species.
create or replace function pg_temp.sp_canon(t text) returns text language plpgsql as $$
declare
  k text := pg_temp.sp_key(t);
  allowance int;
  best int;
  labels text[];
  hit text;
begin
  if k = '' then return null; end if;
  select label into hit from sp_targets where key = k limit 1;
  if hit is not null then return hit; end if;
  allowance := case when length(k) >= 9 then 2 when length(k) >= 5 then 1 else 0 end;
  if allowance = 0 then return null; end if;
  select min(pg_temp.sp_lev(k, key)) into best from sp_targets where abs(length(key) - length(k)) <= allowance;
  if best is null or best > allowance then return null; end if;
  select array_agg(distinct label) into labels from sp_targets
    where abs(length(key) - length(k)) <= allowance and pg_temp.sp_lev(k, key) = best;
  if array_length(labels, 1) = 1 then return labels[1]; end if;
  return null;
end $$;

do $$
declare
  merged int;
  n_year int; n_best int; n_kept int; n_tourney int; n_trip int; n_targets int; n_fav int; n_custom int;
begin
  -- Every spelling in use, and how often.
  create temporary table sp_used on commit drop as
  select name, sum(uses)::int as uses from (
    select trim(species) as name, 1 as uses from public.fish_year_catches
    union all select trim(species), 1 from public.personal_bests
    union all select trim(species), 1 from public.tournament_entries
    union all select trim(species), 1 from public.trip_catches
    union all select trim(unnest(target_species)), 1 from public.trips
    union all select trim(favorite_species), 1 from public.profiles where coalesce(trim(favorite_species), '') <> ''
    union all select trim(name), 0 from public.custom_species
  ) all_names
  where coalesce(name, '') <> ''
  group by name;

  -- What each becomes: a listed species if it is one, else the most used spelling of the
  -- same name (one on the custom list first on a tie, then alphabetical).
  create temporary table sp_map on commit drop as
  with resolved as (
    select u.name, u.uses, pg_temp.sp_canon(u.name) as canon, pg_temp.sp_key(u.name) as key,
      exists (select 1 from public.custom_species c where c.name = u.name) as listed
    from sp_used u
  ), spelled as (
    select r.*, first_value(r.name) over (partition by r.key order by r.uses desc, r.listed desc, r.name) as usual
    from resolved r where r.canon is null
  )
  select name as old, canon as new from resolved where canon is not null and canon <> name
  union all
  select name, usual from spelled where usual <> name
  union all
  -- A name that only needs its spaces tidied.
  select name, regexp_replace(name, '\s+', ' ', 'g') from resolved
  where canon is null and name <> regexp_replace(name, '\s+', ' ', 'g')
    and not exists (select 1 from spelled s where s.name = resolved.name and s.usual <> s.name);

  select count(*) into merged from sp_map;

  update public.fish_year_catches f set species = m.new from sp_map m where trim(f.species) = m.old;
  get diagnostics n_year = row_count;
  update public.tournament_entries t set species = m.new from sp_map m where trim(t.species) = m.old;
  get diagnostics n_tourney = row_count;
  update public.trip_catches t set species = m.new from sp_map m where trim(t.species) = m.old;
  get diagnostics n_trip = row_count;
  update public.profiles p set favorite_species = m.new from sp_map m where trim(p.favorite_species) = m.old;
  get diagnostics n_fav = row_count;

  update public.trips t set target_species = (
    select coalesce(array_agg(x order by first_at), '{}') from (
      select coalesce(m.new, trim(s.x)) as x, min(s.ord) as first_at
      from unnest(t.target_species) with ordinality as s(x, ord) left join sp_map m on m.old = trim(s.x)
      group by 1
    ) renamed
  )
  where exists (select 1 from unnest(t.target_species) s(x) join sp_map m on m.old = trim(s.x));
  get diagnostics n_targets = row_count;

  -- Personal bests: rename unless that person already has a best under the new name, or
  -- another of theirs (the oldest wins) is being renamed to it too.
  update public.personal_bests b set species = m.new
  from sp_map m
  where trim(b.species) = m.old
    and not exists (select 1 from public.personal_bests o where o.user_id = b.user_id and o.id <> b.id and trim(o.species) = m.new)
    and not exists (
      select 1 from public.personal_bests o join sp_map m2 on m2.old = trim(o.species)
      where o.user_id = b.user_id and o.id <> b.id and m2.new = m.new and (o.created_at, o.id::text) < (b.created_at, b.id::text)
    );
  get diagnostics n_best = row_count;
  select count(*) into n_kept from public.personal_bests b join sp_map m on m.old = trim(b.species);

  -- The custom list keeps one spelling per fish and nothing that is on the built-in list.
  delete from public.custom_species c where c.name in (select old from sp_map) or exists (select 1 from sp_labels l where l.label = c.name);
  get diagnostics n_custom = row_count;
  insert into public.custom_species (name)
  select distinct m.new from sp_map m where not exists (select 1 from sp_labels l where l.label = m.new)
  on conflict (name) do nothing;

  raise notice 'species: % spellings merged; renamed % Fish Year catches, % personal bests, % tournament entries, % trip catches, % trips'' target lists, % favourite species; % custom species entries folded in; % personal bests left as they were (their owner already has a best under that name)', merged, n_year, n_best, n_tourney, n_trip, n_targets, n_fav, n_custom, n_kept;
end $$;

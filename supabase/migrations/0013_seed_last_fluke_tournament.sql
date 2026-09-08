-- Recreates last season's Fluke Tournament (previously a hardcoded page with fake likes and
-- a "You" commenter that reset on reload) as a real, completed tournament now that
-- tournaments are backed by actual data. Entries are attached to whichever of these anglers
-- already have a profile under that display name; skips gracefully (no error, nothing
-- created) if none of them match yet, and skips just the missing angler's entry otherwise —
-- there's no reliable way to know who's actually signed up from inside a migration file.
do $$
declare
  new_tournament_id uuid;
  andre_id uuid;
  andres_id uuid;
  kevin_id uuid;
begin
  if exists (select 1 from public.tournaments where name = 'Summer Fluke Classic') then
    return;
  end if;

  select id into andre_id from public.profiles where lower(trim(display_name)) = 'andre' limit 1;
  if andre_id is null then
    return;
  end if;

  select id into andres_id from public.profiles where lower(trim(display_name)) = 'andres' limit 1;
  select id into kevin_id from public.profiles where lower(trim(display_name)) = 'kevin' limit 1;

  insert into public.tournaments (name, rules, unit, starts_on, ends_on, created_by, created_by_name)
  values (
    'Summer Fluke Classic',
    'Photo must show the fluke AND the tape measure — Photoshop doesn''t count. Catch it during NJ''s open fluke season, May 4–Sept 25. The fish don''t care about your excuses.',
    'in', '2025-05-04', '2025-09-25', andre_id, 'Andre'
  )
  returning id into new_tournament_id;

  insert into public.tournament_entries (tournament_id, user_id, angler_name, species, size, caught_at)
  values (new_tournament_id, andre_id, 'Andre', 'Fluke', 20, '2025-07-16');

  if andres_id is not null then
    insert into public.tournament_entries (tournament_id, user_id, angler_name, species, size, caught_at)
    values (new_tournament_id, andres_id, 'Andres', 'Fluke', 19.5, '2025-07-16');
  end if;

  if kevin_id is not null then
    insert into public.tournament_entries (tournament_id, user_id, angler_name, species, size, caught_at)
    values (new_tournament_id, kevin_id, 'Kevin', 'Fluke', 18.25, '2025-08-02');
  end if;
end $$;

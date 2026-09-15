-- The trophy case hangs one fish per species — the biggest landed — read off
-- game_profiles.records (catch_id by species) rather than the catch log. records only
-- started being kept in 0019, so a player whose catches predate it would have an empty
-- wall: fill in any species missing from their records with their biggest logged catch of
-- it. Existing record entries win (jsonb || keeps the right-hand keys), so re-running this
-- changes nothing once it has applied. The catch log itself is untouched — the weekly derby
-- and the legendary feed still read every catch.
with best as (
  select distinct on (user_id, species) user_id, species, id, size_in, created_at
  from public.game_catches
  order by user_id, species, size_in desc, created_at asc
), per_user as (
  select user_id,
    jsonb_object_agg(species, jsonb_build_object('size_in', size_in, 'catch_id', id, 'at', created_at)) as recs
  from best
  group by user_id
)
update public.game_profiles as p
set records = per_user.recs || coalesce(p.records, '{}'::jsonb)
from per_user
where per_user.user_id = p.user_id;

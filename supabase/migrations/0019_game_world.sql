-- Cast & Catch grows into a world: species records, NPC quests, and real-life bounties on the
-- tackle profile; a numeric size and the ground it came from on each catch; and Realtime on
-- game_catches so a legendary landing shows up in Home's activity feed like any other post.
--
-- records:  { "<species>": { "size_in": 23.4, "catch_id": "...", "at": "..." } } — the almanac's
--           per-species best. Kept as JSON on the profile rather than derived from game_catches so
--           reading the almanac is one row, not a scan of every catch.
-- quests:   { "<quest key>": { "progress": 2, "done": false, "claimed": false } } — see
--           src/utils/gameQuests.js for the quest list; nothing here validates it.
-- bounties_claimed: fish_year_catches ids already cashed in for tackle points, so a real catch
--           pays out once.
alter table public.game_profiles add column if not exists records jsonb not null default '{}'::jsonb;
alter table public.game_profiles add column if not exists quests jsonb not null default '{}'::jsonb;
alter table public.game_profiles add column if not exists bounties_claimed text[] not null default '{}';

alter table public.game_catches add column if not exists size_in numeric(6,1) not null default 0;
alter table public.game_catches add column if not exists biome text not null default '';

-- Weekly derby leaderboards read everyone's catches of one species since the start of the
-- week; this keeps that query off a full scan as the table grows.
create index if not exists game_catches_species_created_idx on public.game_catches (species, created_at desc);

-- Realtime, same idempotent pattern as 0015 (ALTER PUBLICATION has no IF NOT EXISTS).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_catches'
  ) then
    alter publication supabase_realtime add table public.game_catches;
  end if;
end $$;

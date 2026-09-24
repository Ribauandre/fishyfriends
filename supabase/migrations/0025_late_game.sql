-- Cast & Catch's late game: what a player who has maxed every track keeps casting for.
--   rebuilds       — per tackle track, how many times it has been rebuilt from level 5 back to
--                    level 1 for a permanent bonus (utils/gameUpgrades.js: rebuildCost, rebuildBonus)
--   charter_member — the one-off club membership that makes every charter free
--   tags           — fish tags found: a landed fish that another member had caught before,
--                    {species, from, from_id, at, catch_id}, kept as a collection
--   junk_found     — which pieces of flotsam (utils/gameSpecies.js JUNK_ROSTER) have been landed
-- The dock decorations are wardrobe items in the existing look/wardrobe columns.
alter table public.game_profiles add column if not exists rebuilds jsonb not null default '{}'::jsonb;
alter table public.game_profiles add column if not exists charter_member boolean not null default false;
alter table public.game_profiles add column if not exists tags jsonb not null default '[]'::jsonb;
alter table public.game_profiles add column if not exists junk_found text[] not null default '{}';

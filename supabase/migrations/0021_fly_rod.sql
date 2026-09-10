-- The fly rod: bought once at Sal's, it opens the fly box (dry fly, nymph, streamer — those
-- are ordinary entries in owned_lures) on the river and the mountain lake. A flag rather than
-- an upgrade level because there's nothing to level: you either fish flies or you don't.
alter table public.game_profiles add column if not exists fly_rod boolean not null default false;

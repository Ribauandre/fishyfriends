-- Cap'n Ray's weekly bounties (utils/gameWeekly.js): three asks a week seeded from the ISO
-- week like the derby. `weekly` is this week's progress and claims ({key, progress, claimed})
-- and resets itself when the key moves on; `bounty_stamps` is every bounty ever turned in,
-- which the trophy case counts for good.
alter table public.game_profiles add column if not exists weekly jsonb not null default '{}'::jsonb;
alter table public.game_profiles add column if not exists bounty_stamps integer not null default 0;

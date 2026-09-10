-- The angler's look and wardrobe (Marina's Outfitters). look holds the chosen skin tone,
-- facial hair, hair colour and one item per slot (hat, rod, boots, waders); wardrobe lists the
-- item keys bought with tackle points. Both are validated in the app against
-- src/utils/anglerLook.js — an unknown or unowned choice just falls back to the free default.
alter table public.game_profiles add column if not exists look jsonb not null default '{}'::jsonb;
alter table public.game_profiles add column if not exists wardrobe text[] not null default '{}';

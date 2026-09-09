-- Cast & Catch lures: live bait is free for everyone, the others are one-time unlocks bought
-- with tackle points. Each owned lure key (see src/utils/gameLures.js) is stored here; the
-- currently selected lure is a per-session choice and isn't persisted.
alter table public.game_profiles add column if not exists owned_lures text[] not null default '{}';

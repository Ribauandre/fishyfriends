-- Adds a snapshotted avatar column to fish_year_catches (same convention as angler_name)
-- so the Fish Year board can show the poster's real profile photo next to a catch
-- instead of always falling back to their initial.
alter table public.fish_year_catches add column if not exists angler_avatar_url text default '';

-- Tracks whether an angler has already been walked through the feature tour. Stored on the
-- profile rather than in browser storage so the tour stays "once per person" rather than
-- "once per device" — signing in on a phone after seeing it on a laptop shouldn't replay it.
alter table public.profiles add column if not exists tour_completed_at timestamptz;

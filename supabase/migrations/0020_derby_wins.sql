-- The club derby pays a cosmetic: whoever tops the week's board flies the Golden Pennant from
-- their rod all the following week, and keeps a ribbon for it in the trophy case. derby_wins
-- lists the ISO week keys won (e.g. '2026-W37'); the species can be re-derived from the key
-- (utils/gameDerby.js), so nothing else needs storing. Awarded by claimDerbyWin in AuthContext
-- when the winner next opens the game — there is no server job, and a win can only ever be
-- written to the winner's own row.
alter table public.game_profiles add column if not exists derby_wins text[] not null default '{}';

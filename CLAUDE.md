# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Fishy Friends is a mobile-first fishing-club social app: auth, profiles/avatars, a "Fish Year" monthly catch challenge, a species checklist, tournaments with leaderboards, personal bests, likes/comments/notifications, and an activity feed. React (Create React App) + React Router, talking directly to Supabase (Auth, Postgres, Storage) from the browser — there is no custom backend server.

The site is statically hosted from the committed `docs/` directory (GitHub Pages) and rebuilt automatically by CI on every push to the `deploy` branch. See "Deployment and the `deploy` branch workflow" below — the branch/build/verify sequence there is not optional local convention, it's how this repo is actually shipped.

## Commands

Install:
```bash
npm ci
```

Dev server (`http://localhost:3000`):
```bash
npm start
```

Full test suite (CRA/Jest — always pass `--watchAll=false` outside of interactive use):
```bash
CI=true npx react-scripts test --watchAll=false
```

Single test file or pattern:
```bash
CI=true npx react-scripts test --watchAll=false --testPathPattern=FishYear
```

Production build:
```bash
npm run build
```

Build the GitHub Pages `docs/` output locally (requires real Supabase env vars — normally only CI does this):
```bash
npm run build:github
```

There is no separate lint script. ESLint (`react-app` config) runs as part of `npm start` / `npm run build` — check build output for warnings rather than looking for an `npm run lint` command.

If CRA reports a missing `node_modules/.cache/default-development/0.pack`: stop any running `npm start` first, then `rm -rf node_modules/.cache` and restart. Never delete that cache while the dev server is running.

## Architecture

### Everything flows through `AuthContext`

`src/context/AuthContext.js` is the single source of truth for all data-fetching and mutation — session/profile state, and one async function per read or write (`listAnglers`, `uploadPersonalBest`, `listFishYearCatches`, `logFishYearCatch`, `listTournaments`, `submitTournamentEntry`, `listLikes`/`likeTarget`/`unlikeTarget`, `listRecentActivity`, notifications, etc.). Pages and components consume it via `useAuth()` and never call `supabase` directly. When adding a feature that reads or writes data, add the function here first, then consume it from the page/component — don't reach for `src/lib/supabase.js` from a component.

The provider fails closed when Supabase isn't configured (`isSupabaseConfigured` false) — it never fabricates a local user. CRA env vars are compiled into the public bundle, so a fake-login fallback would mask real deployment misconfiguration.

The one exception to "fetch on demand" is `subscribeToActivity`, a Supabase Realtime `postgres_changes` subscription (`fish_year_catches`/`personal_bests`/`tournament_entries` INSERTs) that gives Home's activity feed a live "someone just posted" update instead of waiting for a refetch. It only works because those three tables were added to the `supabase_realtime` publication in migration `0015` — adding Realtime to another table needs the same publication step, not just a new `.on(...)` handler.

### Routing

`src/App.js`: `AuthProvider` → `Router` → `Navbar` + `AppTour` (mounted once, globally, so it can spotlight nav items from any route) → routed pages. `ProtectedRoute` reads `user`/`loading` from `useAuth()` and redirects to `/account` when signed out. Current routes: `/account` (public), `/home`, `/profile`, `/fish-year`, `/anglers`, `/tournaments`, `/tournaments/:tournamentId`. `/` and the legacy `/fluke-tournament` both redirect (`/fluke-tournament` → `/tournaments` — the tournament feature was renamed from a single hardcoded "Fluke Tournament" to a general, user-creatable Tournaments feature; don't reintroduce the old name).

### Data ownership

Everything is Supabase-backed now — profiles/avatars, personal bests + their likes/comments, Fish Year catches + their likes/comments, tournaments + entries + their likes/comments, custom species suggestions, and notifications. There is no local-only/unpersisted data left in the app; if you're tempted to stash something in component state instead of a table, that's a signal to check whether it should be a migration instead.

### Database migrations

`supabase/migrations/NNNN_description.sql` — ordered, and each file must be idempotent (`create table if not exists`, `drop policy if exists` before `create policy`, `add column if not exists`, etc.) because `supabase/run-migrations.mjs` tracks what's applied in `public._migrations_applied` but the files themselves should tolerate re-running. On every push to `deploy`, CI runs this script (needs the `SUPABASE_DB_URL` repo secret — a Postgres connection string via the **session pooler**, not the app's publishable/anon key) before building, so a normal deploy with no new migration is a no-op and a deploy that adds one applies just that file. `supabase/schema.sql` is a separate, full bootstrap reference for a brand-new project — it is not part of this automated path and isn't re-run against an already-deployed project.

To ship a schema change: add the next-numbered file to `supabase/migrations/`, write it idempotently, push to `deploy`. No manual SQL-editor step needed.

### Testing infrastructure

- `src/test-utils/supabaseMock.js` — chainable fake for the Supabase query builder (`select/eq/order/insert/update/delete/upsert/maybeSingle`, all awaitable) plus `auth`/`storage` fakes. Script a table's response with `setResponse(table, response)`. Also fakes `channel`/`removeChannel` for Realtime: `.on('postgres_changes', { table }, cb)` registrations are recorded by table, and a test triggers one with `await __mock.current.emitPostgresChange(table, newRow)`.
- `src/lib/__mocks__/supabase.js` — manual Jest mock for `src/lib/supabase.js`. A test that needs `isSupabaseConfigured: true` and a controllable client calls `jest.mock('../lib/supabase')` (path relative to the importing file), imports `{ supabase, isSupabaseConfigured, __mock }`, and calls `__mock.reset()` in `beforeEach` / `__mock.setResponse(...)` to script responses. A test file that does *not* mock the module gets the real one, which reads unset env vars and behaves like an unconfigured deployment — that's what covers "fails closed" guard clauses.
- `src/test-utils/renderWithProviders.js` — renders inside `MemoryRouter` + `AuthProvider`, for components calling `useAuth()`/router hooks directly.
- `setupTests.js` polyfills `Element.prototype.scrollIntoView` (unimplemented in jsdom; needed by the deep-link highlight effects in `Participants.tsx`/`Anglers.js`).

Most page-level components mock `useAuth()` wholesale (`jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }))`) with a `makeBaseAuth()` helper providing every function the component calls, rather than exercising the real provider — follow that pattern for new page tests. Add coverage for anything touching delete/ownership checks, species registration/dedupe, or EXIF date extraction — those have been the source of real regressions.

Expected, non-failing noise in test output: React Router v7 future-flag warnings, and React "not wrapped in act(...)" warnings from a few fire-and-forget state updates (e.g. `registerSpecies` isn't awaited by its caller). The tests that matter assert on flushed state via `waitFor`, not immediate synchronous reads. Build output may also show a Browserslist-database-age warning; it doesn't block anything.

### Visual system

Dark-mode-only, deliberately not a generic light SaaS look: near-black base, neon yellow-green (`--mint`) primary/active accent, vivid orange (`--coral`) for warnings/likes, halftone-dot textures (`--tex-halftone*`), hard offset "sticker" shadows (`--sticker-shadow`/`-lg`) rather than blurred ones, heavy keyline borders. Motion is sparse and interaction-driven (hover/entrance), not ambient looping — the one intentional exception is `shared-flash`, the pulse that marks a post reached via a share link. Don't reintroduce blurred shadows, painterly noise textures, or perpetual drift/chase animations; those were deliberately removed earlier.

`src/components/FishIllustration.js` renders a species PNG from `src/assets/fish/` as the fallback wherever a catch/personal best has no uploaded photo. Species without dedicated art fall back to `trout` (`fishDetails[species] || fishDetails.trout`) — adding a new species is adding an entry there plus the matching PNG, not drawing new SVG art.

`src/components/AppTour.js` is a first-run onboarding tour, once per **person** (`profiles.tour_completed_at` is the source of truth; `localStorage` only avoids a flash before the profile loads — never make it authoritative). Steps target real elements via `data-tour="..."` and most carry a `route`, so the tour navigates to the page that actually owns a feature before spotlighting it, rather than pointing at a nav link from the wrong page. When moving a `data-tour`-tagged element to a different page, update that step's `route` too.

Mobile gets fixed bottom nav with safe-area padding, single-column layouts, and full-width touch targets — don't add wide tables or hover-only actions without a touch-usable equivalent.

### Cast & Catch (the fishing minigame at `/fishing-game`)

`src/FishingGame.js` is one screen, literally: `.game-page` is a fixed frame between the nav and the viewport edges (nothing but the deck scrolls), the 2D stage (`components/game/GameScene.js`) takes the top with the HUD drawn on it as wooden signage, the dock panel below is styled as the deck itself (plank texture, plank signage, a pinned note; two columns on wide screens, Cast pinned at the bottom on phones), and the map / shop / almanac / trophy case are in-frame overlays. The stage measures its own aspect and positions everything in visible scene units (`viewW`), so it survives any crop; on stages wider than 16:9 the painting is fitted to the width, so painted x anchors (the angler's spot, the dock's end, where a cast lands) go through `paintX` (× `viewW/480`) while y stays in stage units. The world layer (`.scene-world`: backdrop, ambience, sprites, line, fish) is what the camera moves — `cameraFor` pushes in on the angler when Cast is pressed, then pans right while the line is out (waiting/hookset/reeling) so the fight fills the screen, keeping the angler and his tension meter just inside the left edge and his hat where it was at rest under the signage; the meters, callout, trophy and tap surface stay in screen space above it. Game rules live in pure modules under `src/utils/` (`gameSpecies`, `gameBiomes`, `gameLures`, `gameUpgrades`, `gameQuests`, `gameDerby`, `gameClock`, `reelPhysics`, `lurePhysics`, `sceneAmbience`) and the component only drives them with timers — test the rules there, not through the UI.

- **Ambient motion is allowed on the stage, and only there.** Clouds, gulls, dragonflies, the lamp, water sparkle and distant fish jumps (`SceneAmbience`) loop on purpose; it's a game world, not chrome. Everything loops off under `prefers-reduced-motion`. Don't extend this exception to the rest of the site.
- **Time of day follows the real clock** (`gameClock.periodFor`) and tints the backdrops; the roll leans toward `NOCTURNAL` species at night. `FishingGame` takes a `clock` prop — tests and the playtest harness must pass a fixed one or they'll change behaviour by the hour.
- **Sound is synthesized** (`gameAudio.js`, Web Audio) — no audio files. Mute is per-device in `localStorage`; every call is a no-op where `AudioContext` doesn't exist.
- **Persistence** is all on `game_profiles` (`records`, `quests`, `bounties_claimed` jsonb/array columns) and `game_catches` (`size_in`, `biome`) — migration `0019`. Legendary game catches are in the activity feed and the Realtime publication. The weekly derby needs no table: `gameDerby.derbyFor` picks the target from the ISO week.
- **Art pipeline:** `scripts/generateImage.mjs` (OpenAI Images, key from `OPENAI_API_KEY`, `--transparent` for sprites) produces raw renders; sprites get their alpha haze thresholded and sheets sliced in a Chromium canvas before landing in `src/assets/{props,ambient,scenes,fish}`. Match existing pieces: pixel-art backdrops/props, and the neon-outlined sticker style for anything in `assets/fish`. Plank and rope frames are `border-image` PNGs in `assets/props`.
- **Derby prize:** `claimDerbyWin` (AuthContext) checks last week's final board when the game opens and appends the ISO week key to `game_profiles.derby_wins` (migration `0020`) for the winner; `gameDerby.isChampion` decides who flies the Golden Pennant this week, and presence carries `champion` so the crew see it.
- **The fly rod** (`FLY_ROD` in `gameLures`, `fly_rod` on `game_profiles` — migration `0021`) opens the fly box on `flyWater` grounds (river, mountain lake). Flies are ordinary `owned_lures` with `rod: 'fly'`, an `interaction: 'drift'`, a `hatch` (the periods they match) and, for the streamer, `favors` (species that roll heavier via `rollSpecies`'s `favor` option). The cast becomes an accuracy cast — `rise` moves the meter band and draws the ring on the stage, `castAccuracy` seeds the drift — and the wait is the drift in `lurePhysics` (`stepDrift`/`mendLine`: mend in the band, drag at 100 spooks, the run ends at 100). Off trout water the chips disappear and live bait goes back on.
- **Presence** (`joinDock` in AuthContext) is Supabase Realtime Presence on one channel keyed by user id, carrying name/ground/phase — deliberately not a table, since it vanishes when the tab closes. Same-ground anglers render on the deck via `GameScene`'s `others` prop; the test mock fakes `track`/`presenceState` and `emitPresenceSync`.
- The sprite strips in `assets/angler` are stepped with `steps(n, jump-none)` and inline animation longhands (a `var()` inside the `animation` shorthand did not work).

## Deployment and the `deploy` branch workflow

The `deploy` branch is what ships: pushing to it triggers `.github/workflows/deploy-site.yml`, which installs, verifies the Supabase publishable key isn't a secret key, runs pending migrations, runs `npm run build:github` (builds then replaces `docs/` via `scripts/moveBuildToDocs.js`), and pushes a `Build deploy site` commit. Treat `docs/` as generated output — never hand-edit it; source changes belong in `src/`.

The established workflow for shipping a change in this repo:

1. `git fetch origin deploy`; confirm the previous deploy succeeded and fast-forward local `deploy` to `origin/deploy` (stash first if there are uncommitted changes to carry over) before branching, so you pick up the auto-build commit and don't diverge.
2. Branch off `deploy` for the change.
3. Commit, push the branch.
4. `git merge --no-ff` the branch into `deploy` (not `--ff-only` — keep the merge commit).
5. Re-run the full test suite and `npm run build` on the **merged `deploy` state** (not just the feature branch) to catch merge-induced regressions, then remove the local `build/` output.
6. Push `deploy`, then verify the resulting GitHub Actions run actually succeeds (`gh`/GitHub API) — the run-level status can report stale `in_progress` after the job has actually finished, so check job-level steps if the run status seems to be lagging.

Never force-push `deploy`. If a local push is rejected as non-fast-forward, fetch and rebase/fast-forward onto `origin/deploy` rather than forcing.

Required GitHub Actions config: `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (Variables take priority over same-named Secrets for the key) and, for automatic migrations, the `SUPABASE_DB_URL` secret. The workflow hard-rejects any key beginning with `sb_secret_` — never put a secret/service-role key in a browser-facing env var; only the publishable/anon key belongs there.

## Other maintenance notes

- Preserve exact filename casing — CI (Linux) is case-sensitive even when local dev (macOS) isn't.
- The public route at `/` must stay compatible with static hosting (no server-side redirect dependency).
- Keep fish illustrations as real art — no emoji or abstract glyphs as the primary fish visual.
- Run both the test suite and a production build after any shared CSS, auth, routing, or deployment change.

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

`src/FishingGame.js` is one screen, literally: `.game-page` is a fixed frame between the nav and the viewport edges (nothing but the deck scrolls), the 2D stage (`components/game/GameScene.js`) takes the top with the HUD drawn on it as wooden signage, the stage takes every pixel the deck doesn't need (it fills the frame on desktop; on phones it grows to the tallest crop the scene layout supports, about 10:9), and the dock panel below is styled as the deck itself (plank texture, plank signage) and kept to one row: the ground sign, three signposts (`.dock-icon` — the tackle tray, who's on the water, Cap'n Ray's notice board — each opening its own in-frame overlay, with a badge for what's waiting behind it), the captain's line and Cast. The lure chips, the crew roster and the quest list live in those overlays, not on the deck — don't put strips of controls back on it, and the map / shop / almanac / trophy case are in-frame overlays. Stage geometry lives in `src/utils/sceneLayout.js`: every anchor (the angler's feet, crew slots, where a cast can land, the fightable water, the cloud lanes, the lamp) is in 480×270 *painting units* per scene, read off the backdrop itself, and `frameFor(viewW, crop)` describes how the painting is cropped into the measured stage (`k` scale and `cropTop`; phones crop the right side, wide windows the top and bottom — the Canyon keeps its bottom). `stageX`/`stageY`/`stageLen` turn painting units into stage units and everything, ambience included, is drawn through them, so nothing swims under the dock or stands on a gunwale wall whatever the crop. On wide windows the frame stops growing at about 2.6:1 and centres. Sprites and the fish are sized in painting units too, so the angler stays to scale with the dock. The world layer (`.scene-world`: backdrop, ambience, sprites, line, fish) is what the camera moves — `cameraFor` pans to the water the moment Cast is pressed and holds there while the line is out (waiting/hookset/reeling): the world is pushed in until the angler sits just inside the left edge with the painting's right edge at the frame's, so the fishable water fills the frame, and his hat sits just under the top edge. The painting runs to `PAINT_W` however narrow the stage is — a phone crops it, it does not shorten it — so that, not the stage, is how far right the camera can go, and a phone pans across the part of the painting the deck view never shows. For that to be there to pan across, the backdrop and the tint are laid out on the stage in painting units (`paintBox` in `GameScene`) instead of being fitted by the browser, the stage's own overflow does the cropping, and the line's `<svg>` is `overflow: visible`. `castWindow(layout, frame)` is the painting that camera shows, and `waterSpan`/`landingX` clamp the fishable water to it rather than to the crop. The meters, callout, trophy and tap surface stay in screen space above it — the cast and tension meters stand past the angler's front foot, since there is no room at his back. Game rules live in pure modules under `src/utils/` (`gameSpecies`, `gameBiomes`, `gameLures`, `gameUpgrades`, `gameQuests`, `gameDerby`, `gameClock`, `reelPhysics`, `lurePhysics`, `sceneAmbience`) and the component only drives them with timers — test the rules there, not through the UI.

- **Ambient motion is allowed on the stage, and only there**, and **no two grounds move the same way**. `utils/sceneAmbience.js`'s `SCENES` gives each ground its own water: the river and the canyon run (`planCurrent`), the mountain lake rings and lies under mist (`planRings`, `mist`), the swamp hangs moss that sways and lights up with fireflies after dark (`planMoss`, `planFireflies`), the beach breaks (`planSurf`), and the bay and the charter grounds ride the swell (`swell` on the sparkle layer). Each also sets how much of the shimmer layer to run (`sparkle`): a river's broken surface catches little of it, a bay's swell a lot. On top of that come the things placed against the painting itself: clouds in its sky lanes, gulls over salt water and dragonflies over fresh, and the dock lamp. No fish is ever drawn on the water by the ambience — the only one out there is the one the player is fighting. Every planner is pure and deterministic, in painting units, so a ground always breathes the same way; `SceneAmbience` turns them into stage positions. Everything loops off under `prefers-reduced-motion`. Don't extend this exception to the rest of the site.
- **Time of day follows the real clock** (`gameClock.periodFor`) and tints the backdrops; the roll leans toward `NOCTURNAL` species at night. `FishingGame` takes a `clock` prop — tests and the playtest harness must pass a fixed one or they'll change behaviour by the hour.
- **Sound is synthesized** (`gameAudio.js`, Web Audio) — no audio files. Mute is per-device in `localStorage`; every call is a no-op where `AudioContext` doesn't exist.
- **Persistence** is all on `game_profiles` (`records`, `quests`, `bounties_claimed` jsonb/array columns) and `game_catches` (`size_in`, `biome`) — migration `0019`. Legendary game catches are in the activity feed and the Realtime publication. The weekly derby needs no table: `gameDerby.derbyFor` picks the target from the ISO week.
- **Art pipeline:** `scripts/generateImage.mjs` (OpenAI Images, key from `OPENAI_API_KEY`, `--transparent` for sprites) produces raw renders; sprites get their alpha haze thresholded and sheets sliced in a Chromium canvas before landing in `src/assets/{props,ambient,scenes,fish}`. Match existing pieces: pixel-art backdrops/props, and the neon-outlined sticker style for anything in `assets/fish`. Plank and rope frames are `border-image` PNGs in `assets/props`.
- **Derby prize:** `claimDerbyWin` (AuthContext) checks last week's final board when the game opens and appends the ISO week key to `game_profiles.derby_wins` (migration `0020`) for the winner; `gameDerby.isChampion` decides who flies the Golden Pennant this week, and presence carries `champion` so the crew see it.
- **The fly rod** (`FLY_ROD` in `gameLures`, `fly_rod` on `game_profiles` — migration `0021`) opens the fly box on `flyWater` grounds (river, mountain lake). Flies are ordinary `owned_lures` with `rod: 'fly'`, an `interaction: 'drift'`, a `hatch` (the periods they match) and, for the streamer, `favors` (species that roll heavier via `rollSpecies`'s `favor` option). The cast becomes an accuracy cast — `rise` moves the meter band and draws the ring on the stage, `castAccuracy` seeds the drift — and the wait is the drift in `lurePhysics` (`stepDrift`/`mendLine`: mend in the band, drag at 100 spooks, the run ends at 100). Off trout water the chips disappear and live bait goes back on.
- **Looks and Marina's Outfitters** (`utils/anglerLook.js`, `look`/`wardrobe` on `game_profiles` — migration `0022`): the angler is the ChatGPT-drawn sprite sheet `art/angler-sheet.png` — cap, full beard, olive jacket, khaki waders — as the strips in `assets/angler`; those strips predate the slicer now in `scripts/anglerSlice.mjs` (it does not reproduce them from that sheet, so treat the committed strips as the source), and they carry ten rows of headroom padded onto the sliced frames, masks and anchors alike, so a hat can rise above the crown. `strips.json` records the box. Each strip has a part mask in `assets/angler/masks` (red channel = part id: skin, beard, cap, cap panel, jacket, waders, boots, rod) and `utils/anglerAnchors.json` holds each frame's cap, beard and face boxes — from `scripts/anglerMasks.mjs`, whose previews are in `masks/*.preview.png`. The character is dressed at runtime by `utils/anglerPaint.js`, and nothing is pasted on from outside the art: parts that keep their shape are dyed (`tintPixel`, luminance-preserving — skin tone, the cap to a cap colour, waders, boots, rod, the beard to the hair colour), and the head is *sculpted* from the mask's own cap and beard pixels in every frame, from whichever angle the sheet drew it. The crown is read off the silhouette rather than out of the mask, which gets the cap badly wrong — from behind it calls the crown `rod`, the peak `jacket`, and the box it gives is a ring around the part it did recognise. So down each column of the head, from the first pixel there is, everything as far as the first skin or beard is the cap: the forehead ends it from the front, the neck from behind, and a peak jutting over open air ends at the air. Only columns whose top is up where the head's top is are walked (which leaves the hood and the shoulders out), a column has to gather a few pixels to count (which leaves out the rod crossing above), and the runs that come out are merged with any lying against them, since the art draws seams between the cap's panels. Its peak is the columns that do not reach the crown's top — the skull does, whichever way the head is turned — and is cut away for a bare head or another hat. What is left is painted as scalp or hair with a dome's shading (`domeShade`) and the art's line drawn back around it (`OUTLINE`); a beanie, bucket, straw or cowboy hat is that crown in its own colour with a band, brim or pompom added past the silhouette; a visor keeps the cap's own peak on the hairstyle's crown; long hair is a tapered fill of the open pixels down the back of the neck. The beard becomes a jaw in the skin's colour, keeping the chin for a goatee and the lip for a mustache (`frontness` says how far forward a column is, from the face box), dithered for stubble, and the pixels behind the ear are the hair at the nape whatever the style — skin when bald. `facingOf` reads front/left/right/back off the anchors. `paletteFor(look)` is the pure look → dye targets + `head` plan the painter and its tests share; `DEFAULT_LOOK` is the art as drawn, so the stock strips can show unpainted, and where there's no canvas (jsdom) they show anyway with previews carrying `data-painted="no"`. Skin tone, hair style/colour and facial hair are free; hats, rod colours, boots and waders are bought once (`purchaseApparel`) and worn via `saveLook`, which re-validates against what's owned. `AnglerPreview` frames `STILL_WINDOW` on the strip or the painted still so both come out the same size. A new hat is a `kind` the painter knows how to sculpt plus its colours in `WARDROBE`, not a drawing; a new base sheet from the ChatGPT app (the API's reproductions of it were not usable) means a new run through the slicer and mask tool. Presence carries `look` so the crew wear theirs.
- **Presence** (`joinDock` in AuthContext) is Supabase Realtime Presence on one channel keyed by user id, carrying name/ground/phase — deliberately not a table, since it vanishes when the tab closes. Same-ground anglers render on the deck via `GameScene`'s `others` prop; the test mock fakes `track`/`presenceState`/`getChannels` and `emitPresenceSync`. Two traps: the Realtime client returns the *existing* channel for a topic and subscribing to one that's still leaving is a silent no-op, so `joinDock` removes and awaits a stale channel before opening a fresh one; and `FishingGame` joins once per visit (keyed on `loading`, reading `joinDock` through a ref), because the provider hands out a new function every render and leave-and-rejoin on each one is what used to knock presence dark.
- The sprite strips (stock or rendered) are stepped with `steps(n, jump-none)` and inline animation longhands (a `var()` inside the `animation` shorthand did not work).

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

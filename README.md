# Fishy Friends

Fishy Friends is a mobile-first fishing-club clubhouse. It combines member authentication, profiles, avatar uploads, a Fish Year monthly catch challenge, a species checklist ("fish bingo"), an angler directory with personal bests, user-created Tournaments with leaderboards, a crew activity feed, a first-run onboarding tour, catch photos, likes/comments/notifications, and a dark tattoo-inspired fishing visual system.

This README is an implementation handoff for future developers and coding agents. It describes the current architecture, what is persisted, deployment rules, and the main maintenance risks. See `CLAUDE.md` for the condensed command/workflow reference used by coding agents.

## Product Surface

The current product has six authenticated surfaces and one public entry surface:

| Route | Access | Purpose |
| --- | --- | --- |
| `/account` | Public | Sign in and account creation with Supabase Auth. |
| `/home` | Authenticated | Dashboard: welcome banner and the crew activity feed. |
| `/profile` | Authenticated | Edit profile details, upload avatar, sign out, and report a bug. |
| `/fish-year` | Authenticated | Fish Year status board: crew-wide season recap, personal month board, catch logging, and the month-by-month participant board. |
| `/anglers` | Authenticated | Angler directory: log a personal best, the species checklist, and search/browse the roster. |
| `/tournaments` | Authenticated | Browse tournaments and start a new one. |
| `/tournaments/:tournamentId` | Authenticated | One tournament's leaderboard, entry submission, and (creator only) delete. |

`/` redirects to `/home`. `/fluke-tournament` — the old route for a single hardcoded tournament, before Tournaments became a general, user-creatable feature — redirects to `/tournaments`. Unauthenticated visits to protected routes redirect to `/account`.

The app is intentionally account-oriented: the navbar is hidden until a session exists, and all challenge activity is reached from the authenticated shell.

## Technology

- React 19
- Create React App / `react-scripts` 5
- React Router DOM 6
- Supabase JavaScript client
- Supabase Auth, Postgres, and Storage
- TypeScript only for the existing `Participants.tsx` board component
- CSS-first visual system in `src/App.css`

The project has no custom backend server. Browser code talks directly to Supabase using the public publishable/anon key.

## Source Structure

```text
src/
  App.js                       Router, auth provider, protected routes, onboarding tour mount
  App.css                      Global dark theme, responsive layout, sticker/fish illustration styling
  AuthPage.js                  Sign-in, sign-up, disabled configuration state, confirmation state
  Anglers.js                   Angler directory: personal-best form, species checklist, roster search
  FishYear.js                  Fish Year page: season recap, personal board, catch logging modal
  Home.js                      Authenticated dashboard: welcome banner + crew activity feed
  Profile.js                   Profile form and avatar upload UI
  Tournaments.js               Tournament list + create-tournament form
  TournamentDetail.js          One tournament's leaderboard, entry form, delete (creator only)
  constants.js                 Shared constants (the active Fish Year season year)
  context/AuthContext.js       Single source of truth for Supabase reads/writes and session/profile state
  lib/supabase.js              Supabase client and environment-key resolution
  lib/__mocks__/supabase.js    Manual Jest mock for the Supabase client
  components/
    ActivityFeed.js              Crew-wide recent-activity feed (catches, personal bests, tournament entries)
    AppTour.js                   First-run onboarding tour; spotlights real elements via data-tour
    BellIcon.js / ChatIcon.js    Small inline SVG icons (notifications / comments)
    CommentThread.js             Shared comment-thread UI, wired up by the three adapters below
    FishYearCatchComments.js     Comments adapter for Fish Year catches
    PersonalBestComments.js      Comments adapter for personal bests
    TournamentEntryComments.js   Comments adapter for tournament entries
    FishIllustration.js          Reusable species sticker illustration (PNG-backed)
    LikeButton.js                Persisted like toggle, shared across catches/bests/entries
    Navbar.js                    Responsive desktop/mobile authenticated navigation
    NotificationBell.js          Unread-count bell + dropdown for like/comment notifications
    Participants.tsx             Fish Year month-by-month participant board (real likes + comments)
    PersonalBestForm.js          Log-a-personal-best form (photo, date, species, size)
    PostMenu.js                  Share/delete overflow menu on a post
    SpeciesChecklist.js          "Fish bingo" checklist, credited from personal bests + Fish Year catches
    SpeciesSelect.js             Species autocomplete with custom-species support
    TournamentEntries.js         Tournament leaderboard rows + entry detail
  assets/fish/                 Species illustration PNGs used by FishIllustration.js
  utils/
    compressImage.js            Client-side image downscale/compression before upload
    photoDate.js                 EXIF date extraction for catch photos
    speciesOptions.js            Canonical species list + icon matching
    timeAgo.js                   Relative timestamp formatting for the activity feed
    tournamentStatus.js          Derives upcoming/active/ended from a tournament's date range
  test-utils/
    renderWithProviders.js       Renders a component inside MemoryRouter + AuthProvider
    supabaseMock.js              Chainable fake Supabase query builder

supabase/
  schema.sql                Full bootstrap schema for a brand-new Supabase project
  migrations/                Ordered, idempotent SQL files applied automatically on deploy
  run-migrations.mjs         Applies pending files in migrations/ to DATABASE_URL
  reset-crew-data.sql        Manual, one-off dev script: wipes profile/personal-best content (not auth.users)
  reset-storage.mjs          Manual, one-off dev script: empties the avatars/personal-bests Storage buckets
  confirmation-email.html    Branded Supabase signup confirmation template

scripts/
  moveBuildToDocs.js         Replaces docs/ with the current build/ output

.github/workflows/
  deploy-site.yml            Builds docs with Supabase config on deploy pushes
  keep-db-active.yml         Scheduled Supabase REST request
```

## Application Architecture

### Provider and routing

`src/index.js` renders `App` inside `React.StrictMode`.

`App.js` composes the application in this order:

```text
AuthProvider
  Router
    Navbar
    AppTour
    page wrapper
      Routes
```

`AppTour` is mounted once, globally, beside the navbar (not per-page) so a single tour instance can navigate between routes and spotlight nav items or page content from wherever it's currently pointed.

`ProtectedRoute` reads `user` and `loading` from `useAuth()`:

- While loading, it renders `Loading your dock...`.
- With a session, it renders the requested page.
- Without a session, it redirects to `/account`.

### Auth state and data access

`AuthContext.js` is the single source of truth for all data-fetching and mutation in the app — every page and component reads and writes through `useAuth()`, never through `src/lib/supabase.js` directly. It exposes:

- **Session/profile state**: `user`, `profile`, `personalBests`, `customSpecies`, `loading`, `notice`/`setNotice`, `shouldShowTour`/`completeTour`, `isSupabaseConfigured`.
- **Auth**: `signIn`, `signUp`, `signOut`, `updateProfile`, `uploadAvatar`.
- **Personal bests**: `uploadPersonalBest` (inserts or, matched by species, updates), `deletePersonalBest`, `listAnglers` (the whole roster with each angler's personal bests), `listComments`/`addComment`/`deleteComment`.
- **Fish Year**: `listFishYearCatches`, `logFishYearCatch`, `deleteFishYearCatch`, `listFishYearComments`/`addFishYearComment`/`deleteFishYearComment`.
- **Tournaments**: `listTournaments`, `getTournament`, `createTournament`, `deleteTournament`, `listTournamentEntries`, `getTournamentEntry`, `submitTournamentEntry`, `deleteTournamentEntry`, `listTournamentEntryComments`/`addTournamentEntryComment`/`deleteTournamentEntryComment`.
- **Likes** (shared across personal bests, Fish Year catches, and tournament entries): `listLikes`, `likeTarget`, `unlikeTarget`.
- **Notifications**: `listNotifications`, `markNotificationRead`, `markAllNotificationsRead` (fired automatically by `likeTarget`/`addComment` and friends when the target isn't your own).
- **Activity feed**: `listRecentActivity` — merges recent Fish Year catches, personal bests, and tournament entries into one feed, newest first. `subscribeToActivity` complements it with a live Supabase Realtime subscription on those same three tables, pushing new posts into Home's feed the instant they happen instead of waiting for a refetch — see "Realtime activity feed" below.
- **Bug reports**: `submitBugReport` — inserts into `bug_reports`, private to the reporter.

On startup, the provider calls `supabase.auth.getSession()`, then loads the matching row from `public.profiles`, and subscribes to `onAuthStateChange` so sign-in, confirmation, refresh, and sign-out update the UI.

The provider deliberately fails closed when Supabase is not configured. It does not create fake local users. This is important because CRA environment variables are compiled into the public bundle and a preview-only login would hide deployment configuration problems.

### Realtime activity feed

`Home.js` gets its "someone just posted" feel from `subscribeToActivity` in `AuthContext.js`, the app's one use of Supabase Realtime. It opens a single channel subscribed to `postgres_changes` INSERT events on `fish_year_catches`, `personal_bests`, and `tournament_entries`, and normalizes each incoming row into the exact same item shape `listRecentActivity` returns — `fish_year_catches` and `tournament_entries` snapshot the poster's name/avatar on the row itself so those two go straight through, but `personal_bests` doesn't, so that path does a follow-up `profiles` lookup, and a tournament entry needs a `tournaments` lookup for its parent's name/unit, mirroring the joins `listRecentActivity` already does.

`Home.js` merges live-pushed items with the initial `listRecentActivity()` fetch by deduping on `kind`+`id` and re-sorting/re-trimming to the newest 6 after every merge, so it doesn't matter which of the two resolves first — a catch that streams in before the initial fetch finishes isn't lost when that fetch's result lands.

Realtime only broadcasts changes for a table once it's added to the `supabase_realtime` publication (migration `0015`) — a plain `create table` isn't enough. Adding another table to the live feed later means adding it to that publication (a new migration, `alter publication supabase_realtime add table ...`) in addition to wiring up the `.on('postgres_changes', ...)` handler and item mapping in `subscribeToActivity`.

### Session persistence

`src/lib/supabase.js` creates the client with:

```js
auth: {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
}
```

This means Supabase stores a browser session, refreshes access tokens, and can consume the auth callback in the URL after email confirmation. Users should remain signed in when returning on the same device until the Supabase session expires or they explicitly sign out.

## Supabase Configuration

### Browser environment variables

Create `.env.local` for local development:

```bash
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your-publishable-or-anon-key
```

Accepted key fallbacks in `src/lib/supabase.js` are:

1. `REACT_APP_SUPABASE_ANON_KEY`
2. `REACT_APP_SUPABASE_PUBLISHABLE_KEY`
3. `REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
4. `FISHY_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

The deploy workflow prioritizes the exact production name `REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY`, then supports the anon/publishable alternatives.

Never use any of these in the browser:

- `sb_secret_...`
- a Supabase service-role key
- any server-only private key

The workflow rejects `sb_secret_` values before building the site. A browser bundle is public by definition.

### Profiles and Storage

For a brand-new Supabase project, run `supabase/schema.sql` once in the Supabase SQL editor. It creates:

- `public.profiles`
- `avatar_url` on each profile
- Row Level Security on profiles
- The public `avatars` Storage bucket
- Storage policies allowing public reads and user-owned writes

(This is the same schema the automated migrations below apply piece by piece to an existing project — see that section for how schema changes reach a project that's already deployed.)

Avatar upload behavior:

- Accepts image files only.
- Maximum size is 5 MB.
- Upload path is `{auth user id}/avatar.{extension}`.
- Upload uses `upsert: true`, so each user has one current avatar path per extension.
- The public URL is saved to `profiles.avatar_url` with a cache-busting query string.

### Automated database migrations

Schema changes are tracked as ordered SQL files in `supabase/migrations/` (currently `0001` through `0015`, covering profiles/avatars, personal bests and comments, Fish Year catches, custom species, likes on personal bests and Fish Year catches, Fish Year catch comments, notifications, the onboarding-tour completion flag, tournaments, bug reports, and enabling Realtime on the activity-feed tables). On every push to `deploy`, the GitHub Actions workflow (`.github/workflows/deploy-site.yml`) runs `supabase/run-migrations.mjs` before building the site. That script connects directly to Postgres, creates a `public._migrations_applied` tracking table if needed, and applies (in one transaction each) any migration file that isn't already recorded as applied — so a normal deploy with no new schema changes is a no-op, and a deploy that adds a new migration file applies just that file automatically.

This requires a repository secret named `SUPABASE_DB_URL`: a Postgres connection string (not the publishable/anon key the app uses in the browser). Get it from the Supabase dashboard: Project Settings -> Database -> Connection string -> URI, with the **Session pooler** mode selected, and the database password filled in. Add it in the GitHub repo under Settings -> Secrets and variables -> Actions -> New repository secret.

Use the session pooler, not Supabase's direct connection: GitHub Actions runners have no IPv6 egress, and the direct connection is IPv6-only, so it times out from CI. The session pooler is IPv4-reachable and, unlike the transaction pooler, keeps one session per connection, which this script's per-file transactions rely on.

If `SUPABASE_DB_URL` isn't set, the workflow logs a warning and skips the migration step rather than failing the deploy — useful for the first deploy after adding this feature, before the secret exists yet, but any schema change added afterward won't reach the database until the secret is added.

To make a future schema change:

1. Add a new file to `supabase/migrations/`, numbered one higher than the last (e.g. `0014_...sql`), containing the SQL to run.
2. Write it idempotently, following the existing files' style (`create table if not exists`, `drop policy if exists` before `create policy`, `alter table ... add column if not exists`, `on conflict do update/nothing`) — the migration should be safe to re-run even though the tracking table normally prevents that.
3. Push to `deploy`. The next build applies it automatically; no manual SQL editor step is needed.

`supabase/schema.sql` is not part of this automated path — it stays as the full bootstrap reference for setting up a brand-new project from scratch, and is not re-run against already-deployed projects.

`supabase/reset-crew-data.sql` and `supabase/reset-storage.mjs` are separate, manual one-off scripts (not run by CI) for wiping crew content — accounts/passwords are left intact. See the comments at the top of each file before running either; `reset-storage.mjs` requires the Supabase service-role key and should only ever be exported in a shell for the one command, never committed.

### Auth URL configuration

In Supabase Authentication URL Configuration:

- Site URL: `https://www.fishyfriends.club`
- Redirect URL: `https://www.fishyfriends.club/`

Signup passes `emailRedirectTo: window.location.origin + '/'`. The root route then redirects into the application. The root is used instead of `/account` because this site is deployed as static GitHub Pages content and direct deep-link behavior can vary.

### Confirmation email

Paste `supabase/confirmation-email.html` into Authentication -> Email Templates -> Confirm signup.

The template uses Supabase's `{{ .ConfirmationURL }}` placeholder and matches the site's dark, inked fishing aesthetic. Updating the file does not automatically update Supabase; the HTML must be pasted into the Supabase dashboard or managed separately through Supabase tooling.

## Data Ownership

Everything the app displays is persisted in Supabase — there is no local-only or unpersisted feature left:

- Auth users and sessions
- Profile fields, avatar files and avatar URLs
- Personal bests, their comments, and their likes (`personal_bests`, `personal_best_comments`, `personal_best_likes`)
- Fish Year catches, their comments, and their likes (`fish_year_catches`, `fish_year_catch_comments`, `fish_year_catch_likes`)
- Tournaments, entries, their comments, and their likes (`tournaments`, `tournament_entries`, `tournament_entry_comments`, `tournament_entry_likes`)
- Custom species suggestions (`custom_species`)
- Notifications for likes/comments on your own posts (`notifications`)
- Bug reports (`bug_reports`) — private to the reporter; there's no in-app UI to view them, they're meant to be triaged directly in the Supabase dashboard

Intentionally not persisted, because it's ephemeral UI state rather than data: which catch-photo lightbox is open, which month/tournament-entry row is expanded, search box text, in-progress form drafts.

## Visual System

The product is dark-mode-only and intentionally avoids a generic light SaaS look.

Core visual decisions:

- Near-black deep-water base with a grid texture.
- Neon yellow-green (`--mint`) ink accent for active states and primary actions, sampled from the sticker art's keyline.
- Vivid orange (`--coral`) accent for warnings, likes, and energetic states, sampled from the art's fin/spot colors.
- Heavy border, offset shadow, and double-line treatments inspired by tattoo flash sheets.
- Responsive bottom navigation on mobile.
- High-contrast large touch targets for phone use.
- Bold black outline and saturated fish sticker illustrations (see below).
- Reduced-motion support through `@media (prefers-reduced-motion: reduce)`.

### Textures and motion

Backgrounds use **halftone dot** textures (`--tex-halftone`, `--tex-halftone-faint`) — a screenprint/sticker-sheet cue that matches the crisp vector art. These replaced earlier `feTurbulence` noise textures (`--tex-vermiculation`, `--tex-camo`, `--tex-scales`), which read as painterly/organic and clashed with the sticker style; don't reintroduce them. Cards use `--sticker-shadow` / `--sticker-shadow-lg`: hard, blur-free offsets that read as a die-cut sticker sitting on the page.

Motion is deliberately sparse. The fish are stickers, not swimming animals, so the old perpetual `chase-front`/`chase-back`/`auth-shark-chase` drift loops and the `ripple-pulse` water rings were removed — the art now sits at fixed jaunty angles and only responds to hover. The one remaining ambient animation is `shared-flash`, the neon outline pulse that marks a post you arrived at from a share link. If you add motion, prefer interaction-driven transitions over infinite loops.

### Fish illustrations

`src/components/FishIllustration.js` renders a raster PNG (`src/assets/fish/`) as a fallback wherever a personal best or Fish Year catch has no uploaded photo. The current art is bold neon-outline sticker illustrations the user generated directly and provided as finished PNGs (not sourced/adapted by an agent), replacing two earlier approaches that didn't land: a hand-drawn SVG shape recolored per species (read as a generic cartoon), and, briefly, color-graded adaptations of real 19th-century natural history engravings (closer, but still not the specific style wanted).

Coverage as of this writing: every species in `SPECIES_OPTIONS` (`src/utils/speciesOptions.js`) has its own dedicated art, except three deliberate reuses of a close relative's illustration — Steelhead and Snook look enough like a plain trout/largemouth bass to share that art, and Coho Salmon shares the Atlantic Salmon art. Anything else (a custom, non-canonical species someone typed in) falls back to `trout`. `FishIllustration`'s fallback is `fishDetails[species] || fishDetails.trout`, so adding a new species is just adding an entry there plus the matching PNG in `src/assets/fish/`; do not reintroduce the SVG or engraving-adaptation approaches.

The site's accent colors (`--mint`, `--coral`, `--glow` in `src/App.css`) were retuned to match this art's palette (neon yellow-green outline, vivid orange) — keep new fish art and the site's accent palette in sync if either changes. Keep source images reasonably sized (current PNGs run roughly 50–600KB depending on detail) so mobile page weight stays low.

### First-run feature tour

`src/components/AppTour.js` walks a new angler through the app once: the Fish Year board, logging a catch, the Anglers directory, tournaments, notifications, and their profile. It mounts in `App.js` beside the navbar so it can point at nav items from any route.

Steps target real elements by `data-tour="..."` attribute rather than by position, so moving an element around doesn't silently break the tour — just update that step's `route` if the target moves to a different page. A step whose target is missing (not on the current route, or hidden at that breakpoint) still shows, just centred with no spotlight. The spotlight itself is a transparent box with a 9999px spread shadow, which dims everything except the target without cloning or clipping any DOM.

"Once" means once per **person**, not per browser: `profiles.tour_completed_at` (migration `0011`) is the source of truth so signing in on a phone after seeing it on a laptop doesn't replay it. `localStorage` mirrors it purely to avoid a flash of the tour in the moment before the profile loads — don't make localStorage the source of truth.

## Responsive Behavior

Desktop gets a fixed top navigation bar and multi-column layouts (e.g. the profile card + settings panel, the Fish Year month grid, the anglers roster grid).

Mobile gets a fixed bottom navigation bar with safe-area padding, a hidden desktop brand wordmark, single-column layouts for the dashboard/profile/roster, a reduced-column Fish Year month grid, and full-width touch-friendly buttons and form fields.

Do not add wide tables or hover-only actions without a mobile equivalent. Catch photos, likes, modal controls, and profile uploads should remain usable with touch.

## Deployment

The repository deploys the committed `docs/` directory. Do not manually commit a locally generated `docs/` build with empty Supabase variables when the deploy workflow is available.

The normal flow is:

```text
push to deploy
  -> GitHub Actions deploy-site.yml
  -> npm ci
  -> verify Supabase URL/key
  -> run pending DB migrations (supabase/run-migrations.mjs, needs SUPABASE_DB_URL secret)
  -> npm run build:github
  -> replace docs/ from build/
  -> commit generated docs
  -> push generated commit
```

The workflow requires these GitHub Actions values:

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

They may be configured as GitHub Variables or Secrets. The workflow prioritizes Variables for the publishable key so an outdated Secret with the same name does not override it.

The workflow rejects a value beginning with `sb_secret_`. If Push Protection blocks a generated bundle, do not bypass it. Replace the value with the public publishable/anon key and rotate any exposed secret key.

The scheduled `keep-db-active.yml` workflow uses the same publishable key naming to make a REST request. It is separate from site deployment.

### Git workflow

The active deployment branch is `deploy`. Never force-push it.

The established flow for shipping a change is: branch off `deploy` for the change, commit and push the branch, `git merge --no-ff` it into `deploy` (keeping the merge commit), re-run the full test suite and a production build on the **merged `deploy` state** (not just the feature branch, to catch merge-induced regressions), then push `deploy` and confirm the resulting GitHub Actions run actually succeeds — its run-level status can report stale `in_progress` after the job has actually finished, so check job-level steps if it seems to be lagging.

If a local push is rejected as non-fast-forward (the deploy workflow's own `Build deploy site` commit is a common cause):

```bash
git fetch origin deploy
git rebase origin/deploy
git push origin deploy
```

## Local Development

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm start
```

Open `http://localhost:3000`.

If CRA reports a missing `node_modules/.cache/default-development/0.pack`, stop any running React process first, then reset the generated cache:

```bash
rm -rf node_modules/.cache
npm start
```

Do not delete `node_modules/.cache` while `npm start` is running. The active webpack watcher can crash when its pack file disappears.

Run tests:

```bash
CI=true npx react-scripts test --watchAll=false
```

Run a single test file or pattern:

```bash
CI=true npx react-scripts test --watchAll=false --testPathPattern=FishYear
```

Run a production build:

```bash
npm run build
```

Build the GitHub Pages directory locally only when Supabase environment variables are available:

```bash
npm run build:github
```

There is no separate lint script — ESLint (`react-app` config) runs as part of `npm start`/`npm run build`; check that output for warnings.

## Testing and Known Warnings

The suite covers the app's actual business logic and user-facing behavior, not just a single smoke test. Run it before every deploy.

### Test infrastructure

- `src/test-utils/supabaseMock.js` — a chainable fake for the Supabase query builder (`select/eq/order/insert/update/delete/upsert/maybeSingle`, all awaitable), plus fakes for `auth` and `storage`. Configure what a table resolves to with `setResponse(table, response)`.
- `src/lib/__mocks__/supabase.js` — the manual Jest mock for `src/lib/supabase.js`. Any test file that needs `isSupabaseConfigured` to be `true` and a controllable client calls `jest.mock('../lib/supabase')` (adjust the relative path to the importing file), then imports `{ supabase, isSupabaseConfigured, __mock }` — call `__mock.reset()` in `beforeEach` and `__mock.setResponse(...)` to script responses. Test files that do *not* call `jest.mock` get the real module, which reads (unset) env vars and behaves like a deployment missing its Supabase config — that's what covers every "fails closed" guard clause.
- `src/test-utils/renderWithProviders.js` — renders a component inside `MemoryRouter` + `AuthProvider`, for components that call `useAuth()`/router hooks directly.
- `setupTests.js` polyfills `Element.prototype.scrollIntoView`, which jsdom doesn't implement at all and which the deep-link highlight effects (`Participants.tsx`, `Anglers.js`, `TournamentEntries.js`) call on mount.

Most page-level components mock `useAuth()` wholesale (`jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }))`) with a `makeBaseAuth()` helper supplying every function the component calls, rather than exercising the real provider — follow that pattern for new page tests.

### What's covered

- **Utilities**: `speciesOptions` (icon matching, case-insensitivity, canonical list integrity), `photoDate` (EXIF tag fallback order, graceful `null` on unsupported/missing metadata), `timeAgo` (relative-time formatting).
- **AuthContext**: every "fails closed when unconfigured" guard clause (`AuthContext.test.js`), plus, with the mock, the full happy paths — session/profile loading, sign in/up/out, profile updates, avatar upload, personal-best insert-vs-update-by-species matching, species registration and its dedupe logic, Fish Year catch logging, and every delete path (`AuthContext.configured.test.js`).
- **Components**: `SpeciesSelect` (autocomplete filtering, keyboard nav, free text, merging in shared custom species, plus a dedicated custom-species suite), `SpeciesChecklist` (credits a species from either a personal best or a Fish Year catch, dedupes repeats), `PostMenu` (share via the native share sheet or clipboard fallback, delete only when an owner handler is passed, click-outside-to-close), `CommentThread` (delete only visible on the viewer's own comment), `LikeButton`, `NotificationBell`, `FishIllustration` (species fallback, unique SVG filter ids), `AppTour` (step targeting and progression).
- **Pages**: `FishYear` (month derived from date, EXIF autofill, form validation/error display, the crew-wide season recap stats, `?catch=` deep-link highlighting), `Anglers` (search filtering by name/water/species, ownership-gated delete, the species checklist crediting Fish Year catches too, `?best=` deep-link highlighting), `Tournaments` and `TournamentDetail` (create/delete, entry submission, `?entry=` deep-link highlighting), `Home` (the activity feed's empty/loaded states), `App` (protected-route redirects for every authenticated route, root and legacy-route redirect chains).

Expected test output includes React Router v7 future-flag warnings and React "not wrapped in act(...)" warnings from a few fire-and-forget state updates (e.g. `registerSpecies` isn't awaited by its caller). Both are pre-existing noise, not failures — the tests that matter assert on flushed state via `waitFor`, not on immediate synchronous reads.

Build output may include the Browserslist database age warning. It does not currently block builds. Updating Browserslist should be a separate dependency-maintenance change.

When adding new behavior, add coverage for it using the existing mocks above rather than starting a new pattern — in particular, prioritize tests for anything touching delete/ownership checks, species registration, or EXIF date extraction, since those have been the source of real regressions in the past.

## Maintenance Guidance for Future Agents

1. Read this README (and `CLAUDE.md`) before changing auth or deployment.
2. Check `git status` before editing; user or workflow-generated changes may be present.
3. Keep Supabase browser configuration limited to public URL and publishable/anon key.
4. Treat `docs/` as generated output; source changes belong in `src/` and are rebuilt by Actions.
5. Preserve exact filename casing. Linux CI is case-sensitive even if macOS local development is not.
6. Keep the public route at `/` compatible with static hosting.
7. Every feature in the product is Supabase-backed and persisted (see Data Ownership) — there's no "local-only" carve-out left to preserve.
8. Preserve the mobile bottom navigation and large touch targets.
9. Keep fish illustrations original and readable; avoid emoji or ambiguous abstract glyphs as the primary fish visual.
10. Run both the production build and the test suite after shared CSS, auth, routing, or deployment changes.
11. When removing a feature or file, grep the whole `src` tree for anything it uniquely owned (CSS classes, `data-tour` targets, context functions) before deleting — dead code and dead styles should be cleaned up together, not left behind.

## Primary Files by Concern

| Concern | Files |
| --- | --- |
| Routing/protection | `src/App.js` |
| Auth/session/profile state and all data access | `src/context/AuthContext.js`, `src/lib/supabase.js` |
| Auth UI | `src/AuthPage.js` |
| Profile/avatar UI | `src/Profile.js`, `supabase/schema.sql` |
| Bug reports | `src/Profile.js`, `src/context/AuthContext.js` (`submitBugReport`), `supabase/migrations/0014_bug_reports.sql` |
| Dashboard / realtime activity feed | `src/Home.js`, `src/components/ActivityFeed.js`, `src/context/AuthContext.js` (`listRecentActivity`, `subscribeToActivity`), `supabase/migrations/0015_enable_activity_realtime.sql` |
| Fish Year | `src/FishYear.js`, `src/components/Participants.tsx` |
| Anglers / personal bests / species checklist | `src/Anglers.js`, `src/components/PersonalBestForm.js`, `src/components/SpeciesChecklist.js` |
| Tournaments | `src/Tournaments.js`, `src/TournamentDetail.js`, `src/components/TournamentEntries.js`, `supabase/migrations/0012_tournaments.sql` |
| Onboarding tour | `src/components/AppTour.js` |
| Navigation | `src/components/Navbar.js` |
| Likes | `src/components/LikeButton.js`, `supabase/migrations/0007_personal_best_likes.sql`, `supabase/migrations/0008_fish_year_catch_likes.sql` |
| Comments | `src/components/CommentThread.js` and its per-target adapters (`FishYearCatchComments.js`, `PersonalBestComments.js`, `TournamentEntryComments.js`) |
| Notifications | `src/components/NotificationBell.js`, `supabase/migrations/0010_notifications.sql` |
| Fish illustrations | `src/components/FishIllustration.js`, `src/App.css`, `src/assets/fish/` |
| Global responsive theme | `src/App.css`, `src/index.css` |
| Email template | `supabase/confirmation-email.html` |
| Deployment | `.github/workflows/deploy-site.yml`, `scripts/moveBuildToDocs.js` |

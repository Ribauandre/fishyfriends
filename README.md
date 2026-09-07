# Fishy Friends

Fishy Friends is a mobile-first fishing challenge clubhouse. It combines member authentication, profiles, avatar uploads, a Fish Year monthly challenge, a Fluke Tournament archive, leaderboards, catch photos, likes, and a dark tattoo-inspired fishing visual system.

This README is an implementation handoff for future developers and coding agents. It describes the current architecture, what is persisted, what is still static/local, deployment rules, and the main maintenance risks.

## Product Surface

The current product has four authenticated surfaces and one public entry surface:

| Route | Access | Purpose |
| --- | --- | --- |
| `/account` | Public | Sign in and account creation with Supabase Auth. |
| `/home` | Authenticated | Personalized clubhouse dashboard and links into challenges. |
| `/profile` | Authenticated | Edit profile details, upload avatar, and sign out. |
| `/fish-year` | Authenticated | Fish Year status board, catch logging form, monthly participant board. |
| `/fluke-tournament` | Authenticated | 2025 Fluke Tournament leaderboard and catch proof. |

`/` redirects to `/home`. Unauthenticated visits to protected routes redirect to `/account`.

The app is intentionally account-oriented: the navbar is hidden until a session exists, and all challenge activity is reached from the authenticated shell.

## Technology

- React 19
- Create React App / `react-scripts` 5
- React Router DOM 6
- Supabase JavaScript client
- Supabase Auth, Postgres, and Storage
- TypeScript only for the existing `.tsx` leaderboard/participant components
- CSS-first visual system in `src/App.css`
- MUI Joy and MUI icons remain installed for historical component compatibility, but the current redesigned leaderboard panels are mostly custom markup/CSS

The project has no custom backend server. Browser code talks directly to Supabase using the public publishable/anon key.

## Source Structure

```text
src/
  App.js                    Router, auth provider, protected routes, species deck
  App.css                   Global dark theme, responsive layout, fish illustration styling
  AuthPage.js               Sign-in, sign-up, disabled configuration state, confirmation state
  FishYear.js               Fish Year page and local catch logging interaction
  FlukeTournament.js        Tournament page wrapper
  Home.js                   Authenticated dashboard
  Profile.js                Profile form and avatar upload UI
  context/AuthContext.js    Supabase session/profile/auth state
  lib/supabase.js           Supabase client and environment-key resolution
  utils/supabase.js         Legacy helper; currently not imported by the active app
  components/
    FishIllustration.js     Reusable thick-line SVG fish illustration
    Leaderboard.tsx         Fluke leaderboard rows, image lightbox, local (unpersisted) likes/comments
    LikeButton.js           Persisted like toggle, used on personal bests and Fish Year catches
    Navbar.js               Responsive desktop/mobile authenticated navigation
    NotificationBell.js     Unread-count bell + dropdown for like/comment notifications
    Participants.tsx        Fish Year participant/month board with real likes and comments
  assets/                   Challenge photos and historical fishing media

supabase/
  schema.sql                Full bootstrap schema for a brand-new Supabase project
  migrations/               Ordered, idempotent SQL files applied automatically on deploy
  run-migrations.mjs        Applies pending files in migrations/ to DATABASE_URL
  confirmation-email.html   Branded Supabase signup confirmation template

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
    SpeciesDeck
    page wrapper
      Routes
```

`ProtectedRoute` reads `user` and `loading` from `useAuth()`:

- While loading, it renders `Loading your dock...`.
- With a session, it renders the requested page.
- Without a session, it redirects to `/account`.

The `SpeciesDeck` is decorative and globally visible. It renders original SVG line-art fish, not external image assets. It is `aria-hidden` because it is visual atmosphere rather than content.

### Auth state

`AuthContext.js` owns:

- `user`: Supabase Auth user or `null`
- `profile`: profile row merged with safe defaults
- `loading`: initial session/profile loading state
- `notice`: latest auth/profile message
- `signIn(email, password)`
- `signUp(email, password, displayName)`
- `signOut()`
- `updateProfile(profile)`
- `uploadAvatar(file)`
- `isSupabaseConfigured`

On startup, the provider calls `supabase.auth.getSession()`. It then loads the matching row from `public.profiles`. It also subscribes to `onAuthStateChange` so sign-in, confirmation, refresh, and sign-out update the UI.

The provider deliberately fails closed when Supabase is not configured. It does not create fake local users. This is important because CRA environment variables are compiled into the public bundle and a preview-only login would hide deployment configuration problems.

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

Schema changes are tracked as ordered SQL files in `supabase/migrations/` (e.g. `0007_add_something.sql`). On every push to `deploy`, the GitHub Actions workflow (`.github/workflows/deploy-site.yml`) runs `supabase/run-migrations.mjs` before building the site. That script connects directly to Postgres, creates a `public._migrations_applied` tracking table if needed, and applies (in one transaction each) any migration file that isn't already recorded as applied — so a normal deploy with no new schema changes is a no-op, and a deploy that adds a new migration file applies just that file automatically.

This requires a repository secret named `SUPABASE_DB_URL`: a Postgres connection string (not the publishable/anon key the app uses in the browser). Get it from the Supabase dashboard: Project Settings -> Database -> Connection string -> URI, with the **Session pooler** mode selected, and the database password filled in. Add it in the GitHub repo under Settings -> Secrets and variables -> Actions -> New repository secret.

Use the session pooler, not Supabase's direct connection: GitHub Actions runners have no IPv6 egress, and the direct connection is IPv6-only, so it times out from CI. The session pooler is IPv4-reachable and, unlike the transaction pooler, keeps one session per connection, which this script's per-file transactions rely on.

If `SUPABASE_DB_URL` isn't set, the workflow logs a warning and skips the migration step rather than failing the deploy — useful for the first deploy after adding this feature, before the secret exists yet, but any schema change added afterward won't reach the database until the secret is added.

To make a future schema change:

1. Add a new file to `supabase/migrations/`, numbered one higher than the last (e.g. `0007_...sql`), containing the SQL to run.
2. Write it idempotently, following the existing files' style (`create table if not exists`, `drop policy if exists` before `create policy`, `alter table ... add column if not exists`, `on conflict do update/nothing`) — the migration should be safe to re-run even though the tracking table normally prevents that.
3. Push to `deploy`. The next build applies it automatically; no manual SQL editor step is needed.

`supabase/schema.sql` is not part of this automated path — it stays as the full bootstrap reference for setting up a brand-new project from scratch, and is not re-run against already-deployed projects.

### Auth URL configuration

In Supabase Authentication URL Configuration:

- Site URL: `https://www.fishyfriends.club`
- Redirect URL: `https://www.fishyfriends.club/`

Signup passes `emailRedirectTo: window.location.origin + '/'`. The root route then redirects into the application. The root is used instead of `/account` because this site is deployed as static GitHub Pages content and direct deep-link behavior can vary.

### Confirmation email

Paste `supabase/confirmation-email.html` into Authentication -> Email Templates -> Confirm signup.

The template uses Supabase's `{{ .ConfirmationURL }}` placeholder and matches the site's dark, inked fishing aesthetic. Updating the file does not automatically update Supabase; the HTML must be pasted into the Supabase dashboard or managed separately through Supabase tooling.

## Data Ownership and Current Limitations

This distinction matters when extending the app:

### Supabase-backed

- Auth users and sessions
- Profile fields, avatar files and avatar URLs
- Personal bests, their comments, and their likes (`personal_bests`, `personal_best_comments`, `personal_best_likes`)
- Fish Year catches, their comments, and their likes (`fish_year_catches`, `fish_year_catch_comments`, `fish_year_catch_likes`)
- Custom species suggestions
- Notifications for likes/comments on your own personal bests and Fish Year catches (`notifications`)

### Static or local-only today

- Fluke Tournament rows, likes, and comments in `Leaderboard.tsx` — this board has no backing table at all yet; every like and comment there resets on reload.
- Catch image lightbox open/closed state (ephemeral UI state, not data worth persisting).

## Visual System

The product is dark-mode-only and intentionally avoids a generic light SaaS look.

Core visual decisions:

- Near-black deep-water base with grid/ripple texture.
- Green/chartreuse ink accent for active states and primary actions.
- Orange/coral accent for hooks, warnings, likes, and energetic states.
- Heavy border, offset shadow, and double-line treatments inspired by tattoo flash sheets.
- Responsive bottom navigation on mobile.
- High-contrast large touch targets for phone use.
- Bold black outline and saturated, color-graded fish illustrations (see below).
- Reduced-motion support through `@media (prefers-reduced-motion: reduce)`.

### Fish illustrations

`src/components/FishIllustration.js` renders one of seven raster PNGs (`src/assets/fish/`) as a fallback wherever a personal best or Fish Year catch has no uploaded photo. Earlier versions of this component were a hand-drawn SVG shape recolored per species; that read as a generic cartoon blob rather than a real fish, so it was replaced with color-graded (boosted saturation/contrast, dilated black outline) adaptations of real 19th-century natural history illustrations:

- Pike, Largemouth Bass, Atlantic Salmon, Brown Trout, and Walleye (used for the "perch" icon) are adapted from Sherman Foote Denton's watercolors in the 1896 *Annual Report of the Commissioners of Fish, Game, and Forests of the State of New York*, via Wikimedia Commons — all public domain (US, pre-1931 publication).
- Tuna is adapted from a public-domain 19th-century engraving ("FMIB 37332 Thon"), via the University of Washington Freshwater and Marine Image Bank on Wikimedia Commons.
- Shark is adapted from a hand-colored engraving of *Carcharhinus melanopterus* in Georges Cuvier's *Le Règne Animal* (plate 114), via Wikimedia Commons user Rvalette's scan, licensed **CC BY-SA 3.0** — this is the one asset here that is not public domain and requires attribution: **Georges Cuvier, digitized by Rvalette, via Wikimedia Commons, CC BY-SA 3.0**.

If replacing any of these with different art, verify licensing before committing the file, and keep the source image reasonably sized (`src/assets/fish/*.png` are resized to ~700px wide) so mobile page weight stays low.

## Responsive Behavior

Desktop:

- Fixed top navigation.
- Two-column dashboard feature cards.
- Two-column month board.
- Profile page uses a profile card plus settings panel.

Mobile:

- Fixed bottom navigation with safe-area padding.
- Hidden desktop brand wordmark in the nav.
- Single-column dashboard and profile layout.
- Three-column personal Fish Year month board.
- Full-width touch-friendly buttons and auth fields.
- Decorative fish deck is moved lower and reduced in opacity/scale.

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

The active deployment branch is `deploy`.

Recommended update flow:

```bash
git switch deploy
git pull --rebase origin deploy
# make focused changes
npm test -- --watchAll=false --runInBand
npm run build
git add <files>
git commit -m "Describe the change"
git push origin deploy
```

The deploy workflow may create a follow-up `Build deploy site` commit. If a local push is rejected as non-fast-forward:

```bash
git fetch origin deploy
git rebase origin/deploy
git push origin deploy
```

Do not use `git push --force` for this branch.

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
npm test -- --watchAll=false --runInBand
```

Run a production build:

```bash
npm run build
```

Build the GitHub Pages directory locally only when Supabase environment variables are available:

```bash
npm run build:github
```

## Testing and Known Warnings

The suite covers the app's actual business logic and user-facing behavior, not just a single smoke test. Run it before every deploy:

```bash
npm test -- --watchAll=false --runInBand
```

### Test infrastructure

- `src/test-utils/supabaseMock.js` — a chainable fake for the Supabase query builder (`select/eq/order/insert/update/delete/upsert/maybeSingle`, all awaitable), plus fakes for `auth` and `storage`. Configure what a table resolves to with `setResponse(table, response)`.
- `src/lib/__mocks__/supabase.js` — the manual Jest mock for `src/lib/supabase.js`. Any test file that needs `isSupabaseConfigured` to be `true` and a controllable client calls `jest.mock('../lib/supabase')` (adjust the relative path to the importing file), then imports `{ supabase, isSupabaseConfigured, __mock }` — call `__mock.reset()` in `beforeEach` and `__mock.setResponse(...)` to script responses. Test files that do *not* call `jest.mock` get the real module, which reads (unset) env vars and behaves like a deployment missing its Supabase config — that's what covers every "fails closed" guard clause.
- `src/test-utils/renderWithProviders.js` — renders a component inside `MemoryRouter` + `AuthProvider`, for components that call `useAuth()`/router hooks directly.
- `setupTests.js` polyfills `Element.prototype.scrollIntoView`, which jsdom doesn't implement at all and which the deep-link highlight effects (Participants.tsx, Anglers.js) call on mount.

### What's covered

- **Utilities**: `speciesOptions` (icon matching, case-insensitivity, canonical list integrity) and `photoDate` (EXIF tag fallback order, graceful `null` on unsupported/missing metadata).
- **AuthContext**: every "fails closed when unconfigured" guard clause, plus (with the mock) the full happy paths — session/profile loading, sign in/up/out, profile updates, avatar upload, personal-best insert-vs-update-by-species matching, species registration and its dedupe logic, Fish Year catch logging, and every delete path.
- **Components**: `SpeciesSelect` (autocomplete filtering, keyboard nav, free text, merging in shared custom species), `PostMenu` (Share via the native share sheet or clipboard fallback, Delete only when an owner handler is passed, click-outside-to-close), `CommentThread` (delete only visible on the viewer's own comment), `FishIllustration` (species fallback, unique SVG filter ids).
- **Pages**: `FishYear` (month derived from date, EXIF autofill, form validation/error display, `?catch=` deep-link highlighting), `Anglers` (search filtering by name/water/species, ownership-gated delete, `?best=` deep-link highlighting), `App` (protected-route redirects for every authenticated route, root redirect chain).

Expected test output includes React Router v7 future-flag warnings and React "not wrapped in act(...)" warnings from a few fire-and-forget state updates (e.g. `registerSpecies` isn't awaited by its caller). Both are pre-existing noise, not failures — the tests that matter assert on flushed state via `waitFor`, not on immediate synchronous reads.

Build output may include the Browserslist database age warning. It does not currently block builds. Updating Browserslist should be a separate dependency-maintenance change.

When adding new behavior, add coverage for it using the existing mocks above rather than starting a new pattern — in particular, prioritize tests for anything touching delete/ownership checks, species registration, or EXIF date extraction, since those have been the source of real regressions in the past.

## Maintenance Guidance for Future Agents

1. Read this README before changing auth or deployment.
2. Check `git status` before editing; user or workflow-generated changes may be present.
3. Keep Supabase browser configuration limited to public URL and publishable/anon key.
4. Treat `docs/` as generated output; source changes belong in `src/` and are rebuilt by Actions.
5. Preserve exact filename casing. Linux CI is case-sensitive even if macOS local development is not.
6. Keep the public route at `/` compatible with static hosting.
7. Fluke Tournament rows, likes, and comments in `Leaderboard.tsx` have no backing table — do not claim they persist. Personal bests and Fish Year catches (including their likes and comments) are real and persisted.
8. Preserve the mobile bottom navigation and large touch targets.
9. Keep fish illustrations original and readable; avoid emoji or ambiguous abstract glyphs as the primary fish visual.
10. Run both the production build and the test suite after shared CSS, auth, routing, or deployment changes.

## Primary Files by Concern

| Concern | Files |
| --- | --- |
| Routing/protection | `src/App.js` |
| Auth/session/profile state | `src/context/AuthContext.js`, `src/lib/supabase.js` |
| Auth UI | `src/AuthPage.js` |
| Profile/avatar UI | `src/Profile.js`, `supabase/schema.sql` |
| Dashboard | `src/Home.js` |
| Fish Year | `src/FishYear.js`, `src/components/Participants.tsx` |
| Fluke Tournament | `src/FlukeTournament.js`, `src/components/Leaderboard.tsx` |
| Navigation | `src/components/Navbar.js` |
| Likes | `src/components/LikeButton.js`, `supabase/migrations/0007_personal_best_likes.sql`, `supabase/migrations/0008_fish_year_catch_likes.sql` |
| Notifications | `src/components/NotificationBell.js`, `supabase/migrations/0010_notifications.sql` |
| Fish illustrations | `src/components/FishIllustration.js`, `src/App.css`, `src/App.js` |
| Global responsive theme | `src/App.css`, `src/index.css` |
| Email template | `supabase/confirmation-email.html` |
| Deployment | `.github/workflows/deploy-site.yml`, `scripts/moveBuildToDocs.js` |

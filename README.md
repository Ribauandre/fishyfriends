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
    Leaderboard.tsx         Fluke leaderboard rows, image lightbox, local likes
    Navbar.js               Responsive desktop/mobile authenticated navigation
    Participants.tsx        Fish Year participant/month board and local likes
  assets/                   Challenge photos and historical fishing media

supabase/
  schema.sql                Profiles table, RLS policies, avatar bucket/policies
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

Run `supabase/schema.sql` in the Supabase SQL editor. It creates:

- `public.profiles`
- `avatar_url` on each profile
- Row Level Security on profiles
- The public `avatars` Storage bucket
- Storage policies allowing public reads and user-owned writes

If the profiles table already exists, apply this migration before using avatars:

```sql
alter table public.profiles
add column if not exists avatar_url text default '';
```

Avatar upload behavior:

- Accepts image files only.
- Maximum size is 5 MB.
- Upload path is `{auth user id}/avatar.{extension}`.
- Upload uses `upsert: true`, so each user has one current avatar path per extension.
- The public URL is saved to `profiles.avatar_url` with a cache-busting query string.

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
- Profile fields
- Avatar files and avatar URLs

### Static or local-only today

- Fish Year historical participant data in `Participants.tsx`
- Fluke Tournament rows in `Leaderboard.tsx`
- Newly logged Fish Year catches
- Fish Year caught-month status
- Catch likes
- Catch image lightbox state

The Fish Year `Log a catch` form currently creates an in-memory entry and passes it into the participant board. It does not write to Supabase or survive a page reload. Likes are component-local React state and do not persist.

A future persistent catch system should introduce a table such as:

```sql
create table public.catches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge text not null,
  month text,
  species text not null,
  caught_at date not null,
  photo_url text default '',
  created_at timestamptz default now()
);
```

That work should also add RLS policies, photo storage rules, a query hook/provider, optimistic updates, and a separate likes table or RPC. Do not imply persistence in the UI until those pieces exist.

## Visual System

The product is dark-mode-only and intentionally avoids a generic light SaaS look.

Core visual decisions:

- Near-black deep-water base with grid/ripple texture.
- Green/chartreuse ink accent for active states and primary actions.
- Orange/coral accent for hooks, warnings, likes, and energetic states.
- Heavy border, offset shadow, and double-line treatments inspired by tattoo flash sheets.
- Responsive bottom navigation on mobile.
- High-contrast large touch targets for phone use.
- Original SVG fish illustrations with thick outlines and species-specific details.
- Reduced-motion support through `@media (prefers-reduced-motion: reduce)`.

Fish illustration intent:

- Pike: long ambush profile and pale spot marks.
- Bass: deep body and lateral stripe.
- Salmon: silver body, warm belly/gill accents, run-like movement.
- Shark: countershading, dorsal fin, and teeth.
- Trout, perch, and tuna: additional variety in the global deck.

The fish illustrations are original CSS/SVG constructions, not copied artwork. If replacing them with photographs or external art, verify licensing and keep asset sizes appropriate for mobile.

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

The current test suite is intentionally small. `src/App.test.js` verifies the unauthenticated account entry point and primary sign-in control.

Expected test output includes React Router v7 future-flag warnings. They are warnings from the installed Router version, not test failures.

Build output may include the Browserslist database age warning. It does not currently block builds. Updating Browserslist should be a separate dependency-maintenance change.

When adding behavior, prioritize tests for:

- Protected route redirects.
- Supabase sign-in/sign-up error handling.
- Email confirmation state.
- Profile/avatar persistence.
- Fish Year catch persistence once that feature is moved to Supabase.
- Mobile interaction states.

## Maintenance Guidance for Future Agents

1. Read this README before changing auth or deployment.
2. Check `git status` before editing; user or workflow-generated changes may be present.
3. Keep Supabase browser configuration limited to public URL and publishable/anon key.
4. Treat `docs/` as generated output; source changes belong in `src/` and are rebuilt by Actions.
5. Preserve exact filename casing. Linux CI is case-sensitive even if macOS local development is not.
6. Keep the public route at `/` compatible with static hosting.
7. Do not claim challenge catches or likes are persisted until a Supabase data model exists.
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
| Fish illustrations | `src/components/FishIllustration.js`, `src/App.css`, `src/App.js` |
| Global responsive theme | `src/App.css`, `src/index.css` |
| Email template | `supabase/confirmation-email.html` |
| Deployment | `.github/workflows/deploy-site.yml`, `scripts/moveBuildToDocs.js` |

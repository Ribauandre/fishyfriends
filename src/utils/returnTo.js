// Where to go once someone signs in: the link they opened while signed out (a shared trip, a
// catch, a tournament). Router state carries it straight through a sign-in on the same page;
// localStorage carries it across a sign-up, whose confirmation email opens the site afresh at
// its front door. Only in-app paths are kept, and an old one expires rather than surprising
// someone days later.
const KEY = 'fishy:returnTo';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  if (path === '/' || path.startsWith('/account')) return null;
  return path;
}

export function rememberReturnTo(path, now = Date.now()) {
  const safe = safePath(path);
  if (!safe) return;
  try { window.localStorage.setItem(KEY, JSON.stringify({ path: safe, at: now })); } catch (storageError) { /* private mode */ }
}

export function takeReturnTo(now = Date.now()) {
  let stored = null;
  try {
    stored = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    window.localStorage.removeItem(KEY);
  } catch (storageError) { return null; }
  if (!stored || now - stored.at > MAX_AGE_MS) return null;
  return safePath(stored.path);
}

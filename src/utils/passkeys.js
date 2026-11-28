// Passkeys: signing in with Face ID, Touch ID, a fingerprint, a screen lock or a security
// key instead of typing the password. The passkey itself lives on the member's device or in
// their password manager; Supabase Auth keeps its public half and checks each sign-in
// against it, and the club never sees a face or a fingerprint.
//
// Two things have to be true before any of it is offered: the project has passkeys switched
// on (its owner does that in the Supabase dashboard — Authentication > Passkeys — and the
// project's public settings say so), and this browser can do it. Until both are, the app
// looks exactly as it did without them.
//
// Everything here is plain logic: what the device can do, what is remembered on it, and
// what to say when something is refused. The calls themselves are AuthContext's.

export const PASSKEY_ANCHOR = 'passkeys';
// The longest name a passkey can be given (the server's own limit is 120).
export const PASSKEY_NAME_MAX = 80;

// --- What this browser can do -------------------------------------------------------------
// WebAuthn needs the API and a secure page (https, or localhost while developing).
export function browserCanUsePasskeys(scope = typeof window === 'undefined' ? undefined : window) {
  try {
    return Boolean(scope && scope.isSecureContext !== false && scope.PublicKeyCredential
      && typeof scope.navigator?.credentials?.get === 'function' && typeof scope.navigator?.credentials?.create === 'function');
  } catch (problem) {
    return false;
  }
}

// --- What is remembered on the device -----------------------------------------------------
// Neither is anything about an account: one is the club's switch as it was last heard (so
// the sign-in page doesn't grow a button a moment after it appears), the other that a
// passkey has been made or used in this browser (so the page can say "the one saved here").
const ON_KEY = 'fishyfriends:passkeys-on';
const HERE_KEY = 'fishyfriends:passkey-here';
const read = (key) => { try { return window.localStorage.getItem(key); } catch (problem) { return null; } };
const write = (key, value) => { try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value); } catch (problem) { /* not kept, then */ } };

export const recallPasskeysOn = () => read(ON_KEY) === '1';
export const rememberPasskeysOn = (on) => write(ON_KEY, on ? '1' : null);
export const passkeyUsedHere = () => read(HERE_KEY) === '1';
export const rememberPasskeyHere = (here) => write(HERE_KEY, here ? '1' : null);

// --- Saying what went wrong ---------------------------------------------------------------
// `doing` is 'signin', 'add', 'rename' or 'remove'. Comes back as { message, cancelled,
// switchedOff, gone }:
//   cancelled   — the member closed their device's prompt (or it timed out, or the browser
//                 wouldn't show it). Not a failure to be alarmed about: said quietly.
//   switchedOff — the project no longer has passkeys on; stop offering them.
//   gone        — the passkey that was offered isn't registered any more.
const REFUSALS = {
  passkey_disabled: 'Passkey sign-in isn\'t switched on for the club right now. Use your password.',
  webauthn_credential_not_found: 'That passkey isn\'t on your account any more. Sign in with your password, then add it again in your profile.',
  webauthn_challenge_expired: 'That took too long. Try again.',
  webauthn_challenge_not_found: 'That took too long. Try again.',
  webauthn_verification_failed: 'That passkey couldn\'t be checked. Try again, or use your password.',
  webauthn_credential_exists: 'That device or password manager already holds a passkey for your account.',
  too_many_passkeys: 'That\'s as many passkeys as one account can have. Remove one you don\'t use, then add this one.',
  email_not_confirmed: 'Confirm your email first: open the link we sent when you signed up.',
  phone_not_confirmed: 'Confirm your account first: open the link we sent when you signed up.',
  user_banned: 'This account can\'t sign in.',
  over_request_rate_limit: 'Too many tries. Give it a minute and try again.',
  session_not_found: 'You\'ve been signed out. Sign in again.',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'That device or password manager already holds a passkey for your account.',
  ERROR_INVALID_DOMAIN: 'Passkeys aren\'t set up for this address.',
  ERROR_INVALID_RP_ID: 'Passkeys aren\'t set up for this address.',
};
const QUIET = {
  signin: 'No passkey was used. Try again, or sign in with your password.',
  add: 'No passkey was added. Nothing has changed.',
};
const FALLBACK = {
  signin: 'That didn\'t work. Sign in with your password.',
  add: 'The passkey couldn\'t be added. Try again in a moment.',
  rename: 'The name couldn\'t be saved. Try again in a moment.',
  remove: 'The passkey couldn\'t be removed. Try again in a moment.',
  list: 'Your passkeys couldn\'t be read. Try again in a moment.',
};

export function passkeyProblem(error, doing = 'signin') {
  const code = String(error?.code || '');
  const name = String(error?.name || '');
  const said = String(error?.message || '');
  const result = { message: '', cancelled: false, switchedOff: code === 'passkey_disabled', gone: code === 'webauthn_credential_not_found' };
  if (REFUSALS[code]) return { ...result, message: REFUSALS[code] };
  // The member said no to their device (or it gave up waiting), or the browser refused to
  // show the prompt: the browser reports all three the same way.
  if (name === 'NotAllowedError' || name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') return { ...result, cancelled: true, message: QUIET[doing] || QUIET.add };
  if (/does not support WebAuthn/i.test(said) || name === 'NotSupportedError') return { ...result, message: 'This browser can\'t use passkeys.' };
  if (name === 'SecurityError') return { ...result, message: REFUSALS.ERROR_INVALID_RP_ID };
  if (name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(said)) return { ...result, message: 'Couldn\'t reach the club. Check your connection and try again.' };
  if (error?.status === 429) return { ...result, message: REFUSALS.over_request_rate_limit };
  return { ...result, message: FALLBACK[doing] || FALLBACK.signin };
}

// --- Showing one --------------------------------------------------------------------------
// The name is whatever the member gave it, else what Supabase made of the device that
// created it ("iCloud Keychain", "Google Password Manager"), else just "Passkey".
export const passkeyName = (passkey) => String(passkey?.friendly_name || '').trim() || 'Passkey';

const dayText = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// "Added Nov 28, 2026 · last used Nov 29, 2026", or "· never used" for one that hasn't been.
export function passkeyDates(passkey) {
  const added = dayText(passkey?.created_at);
  const used = passkey?.last_used_at ? dayText(passkey.last_used_at) : '';
  return [added ? `Added ${added}` : '', used ? `last used ${used}` : 'never used'].filter(Boolean).join(' · ');
}

// Newest first, as they come from the server in no promised order.
export const sortPasskeys = (passkeys) => [...(passkeys || [])].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

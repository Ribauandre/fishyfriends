import {
  PASSKEY_ANCHOR, PASSKEY_NAME_MAX, browserCanUsePasskeys, passkeyDates, passkeyName, passkeyProblem, passkeyUsedHere, recallPasskeysOn,
  rememberPasskeyHere, rememberPasskeysOn, sortPasskeys,
} from './passkeys';

beforeEach(() => { window.localStorage.clear(); });

describe('what a browser can do', () => {
  const capable = (more = {}) => ({ isSecureContext: true, PublicKeyCredential: function PublicKeyCredential() {}, navigator: { credentials: { get: () => {}, create: () => {} } }, ...more });

  test('one with the passkey API, on a secure page, can use passkeys', () => {
    expect(browserCanUsePasskeys(capable())).toBe(true);
    // A browser that doesn't say whether the page is secure is taken at its API's word.
    expect(browserCanUsePasskeys(capable({ isSecureContext: undefined }))).toBe(true);
  });

  test('one without the API, with half of it, or on a page that isn\'t secure, can\'t', () => {
    expect(browserCanUsePasskeys(capable({ PublicKeyCredential: undefined }))).toBe(false);
    expect(browserCanUsePasskeys(capable({ navigator: {} }))).toBe(false);
    expect(browserCanUsePasskeys(capable({ navigator: { credentials: { get: () => {} } } }))).toBe(false);
    expect(browserCanUsePasskeys(capable({ isSecureContext: false }))).toBe(false);
    expect(browserCanUsePasskeys(undefined)).toBe(false);
    expect(browserCanUsePasskeys(null)).toBe(false);
  });

  test('the browser the tests run in has no passkey API, so by default nothing is offered', () => {
    expect(browserCanUsePasskeys()).toBe(false);
  });

  test('a browser that throws when asked is a no, not a crash', () => {
    const touchy = { isSecureContext: true, PublicKeyCredential: function PublicKeyCredential() {}, get navigator() { throw new Error('blocked'); } };
    expect(browserCanUsePasskeys(touchy)).toBe(false);
  });
});

describe('what the device remembers', () => {
  test('the club\'s switch as it was last heard, off until it has been heard on', () => {
    expect(recallPasskeysOn()).toBe(false);
    rememberPasskeysOn(true);
    expect(recallPasskeysOn()).toBe(true);
    rememberPasskeysOn(false);
    expect(recallPasskeysOn()).toBe(false);
    expect(window.localStorage.getItem('fishyfriends:passkeys-on')).toBeNull();
  });

  test('that a passkey has been made or used in this browser', () => {
    expect(passkeyUsedHere()).toBe(false);
    rememberPasskeyHere(true);
    expect(passkeyUsedHere()).toBe(true);
    rememberPasskeyHere(false);
    expect(passkeyUsedHere()).toBe(false);
  });

  test('neither is anything about an account', () => {
    rememberPasskeysOn(true);
    rememberPasskeyHere(true);
    const kept = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).sort().map((key) => [key, window.localStorage.getItem(key)]);
    expect(kept).toEqual([['fishyfriends:passkey-here', '1'], ['fishyfriends:passkeys-on', '1']]);
  });

  test('storage that is switched off is lived with', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      expect(recallPasskeysOn()).toBe(false);
      expect(passkeyUsedHere()).toBe(false);
      expect(() => { rememberPasskeysOn(true); rememberPasskeyHere(true); }).not.toThrow();
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });
});

describe('what went wrong, in words a member can act on', () => {
  const refusal = (code, more = {}) => ({ name: 'AuthApiError', code, message: `server said ${code}`, status: 422, ...more });

  test('a prompt that was closed, timed out or never shown is not an alarm', () => {
    const closed = { name: 'NotAllowedError', code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'The operation either timed out or was not allowed.' };
    expect(passkeyProblem(closed, 'signin')).toEqual({ message: 'No passkey was used. Try again, or sign in with your password.', cancelled: true, switchedOff: false, gone: false });
    expect(passkeyProblem(closed, 'add')).toMatchObject({ message: 'No passkey was added. Nothing has changed.', cancelled: true });
    expect(passkeyProblem({ name: 'AbortError', code: 'ERROR_CEREMONY_ABORTED', message: 'aborted' }, 'signin').cancelled).toBe(true);
  });

  test('the project having passkeys switched off says so and stops them being offered', () => {
    expect(passkeyProblem(refusal('passkey_disabled'), 'signin')).toEqual({ message: 'Passkey sign-in isn\'t switched on for the club right now. Use your password.', cancelled: false, switchedOff: true, gone: false });
  });

  test('a passkey that is no longer on the account points back to the password', () => {
    expect(passkeyProblem(refusal('webauthn_credential_not_found'), 'signin')).toMatchObject({ gone: true, cancelled: false, message: expect.stringMatching(/isn't on your account any more.*password/) });
  });

  test('each of the server\'s other refusals has its own plain sentence', () => {
    const said = (code, doing = 'signin') => passkeyProblem(refusal(code), doing).message;
    expect(said('webauthn_challenge_expired')).toBe('That took too long. Try again.');
    expect(said('webauthn_challenge_not_found')).toBe('That took too long. Try again.');
    expect(said('webauthn_verification_failed')).toMatch(/couldn't be checked/);
    expect(said('webauthn_credential_exists', 'add')).toMatch(/already holds a passkey for your account/);
    expect(said('too_many_passkeys', 'add')).toMatch(/as many passkeys as one account can have/);
    expect(said('email_not_confirmed')).toMatch(/Confirm your email first/);
    expect(said('user_banned')).toBe('This account can\'t sign in.');
    expect(said('over_request_rate_limit')).toMatch(/Too many tries/);
    expect(said('session_not_found', 'add')).toMatch(/signed out/);
    // None of them is taken for a closed prompt, or for the project's switch.
    for (const code of ['webauthn_verification_failed', 'too_many_passkeys', 'user_banned']) expect(passkeyProblem(refusal(code))).toMatchObject({ cancelled: false, switchedOff: false, gone: false });
  });

  test('what the browser itself refuses', () => {
    expect(passkeyProblem({ name: 'InvalidStateError', code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', message: 'x' }, 'add').message).toMatch(/already holds a passkey/);
    expect(passkeyProblem({ name: 'SecurityError', code: 'ERROR_INVALID_RP_ID', message: 'x' }, 'signin').message).toBe('Passkeys aren\'t set up for this address.');
    expect(passkeyProblem({ name: 'SecurityError', code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'x' }, 'signin').message).toBe('Passkeys aren\'t set up for this address.');
    expect(passkeyProblem({ name: 'AuthUnknownError', message: 'Browser does not support WebAuthn' }, 'signin').message).toBe('This browser can\'t use passkeys.');
  });

  test('no connection, too many tries, and anything nobody planned for', () => {
    expect(passkeyProblem({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }, 'signin').message).toMatch(/Couldn't reach the club/);
    expect(passkeyProblem({ name: 'AuthApiError', message: 'slow down', status: 429 }, 'signin').message).toMatch(/Too many tries/);
    expect(passkeyProblem({ name: 'AuthApiError', code: 'unexpected_failure', message: 'pq: something internal', status: 500 }, 'signin').message).toBe('That didn\'t work. Sign in with your password.');
    expect(passkeyProblem({ name: 'AuthApiError', code: 'unexpected_failure', message: 'pq: something internal', status: 500 }, 'add').message).toBe('The passkey couldn\'t be added. Try again in a moment.');
    expect(passkeyProblem(new Error('x'), 'rename').message).toMatch(/name couldn't be saved/);
    expect(passkeyProblem(new Error('x'), 'remove').message).toMatch(/couldn't be removed/);
    expect(passkeyProblem(new Error('x'), 'list').message).toMatch(/couldn't be read/);
    // The server's own wording is never shown: it is written for a developer.
    expect(passkeyProblem({ name: 'AuthApiError', code: 'unexpected_failure', message: 'pq: something internal' }, 'signin').message).not.toMatch(/pq/);
    expect(passkeyProblem(null, 'signin')).toEqual({ message: 'That didn\'t work. Sign in with your password.', cancelled: false, switchedOff: false, gone: false });
  });
});

describe('showing one', () => {
  test('it is called what its owner called it, else what Supabase made of the device, else a passkey', () => {
    expect(passkeyName({ friendly_name: 'My iPhone' })).toBe('My iPhone');
    expect(passkeyName({ friendly_name: '  iCloud Keychain ' })).toBe('iCloud Keychain');
    expect(passkeyName({ friendly_name: '' })).toBe('Passkey');
    expect(passkeyName({})).toBe('Passkey');
    expect(passkeyName(null)).toBe('Passkey');
  });

  test('when it was added, and when it last signed someone in', () => {
    expect(passkeyDates({ created_at: '2026-11-28T12:00:00Z', last_used_at: '2026-11-29T12:00:00Z' })).toBe('Added Nov 28, 2026 · last used Nov 29, 2026');
    expect(passkeyDates({ created_at: '2026-11-28T12:00:00Z' })).toBe('Added Nov 28, 2026 · never used');
    expect(passkeyDates({ created_at: 'nonsense' })).toBe('never used');
    expect(passkeyDates(null)).toBe('never used');
  });

  test('newest first, without touching the list it was given', () => {
    const given = [{ id: 'a', created_at: '2026-01-05T00:00:00Z' }, { id: 'c', created_at: '2026-11-28T00:00:00Z' }, { id: 'b', created_at: '2026-06-01T00:00:00Z' }, { id: 'd' }];
    expect(sortPasskeys(given).map((passkey) => passkey.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(given.map((passkey) => passkey.id)).toEqual(['a', 'c', 'b', 'd']);
    expect(sortPasskeys(null)).toEqual([]);
  });

  test('where the section sits on the profile page, and how long a name may be', () => {
    expect(PASSKEY_ANCHOR).toBe('passkeys');
    expect(PASSKEY_NAME_MAX).toBe(80);
  });
});

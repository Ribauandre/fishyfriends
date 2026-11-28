// Manual Jest mock for src/lib/supabase.js. Activate with jest.mock('../lib/supabase')
// (adjust the relative path to match the importing file) in any test that needs
// isSupabaseConfigured to be true and a controllable fake client. Call __mock.reset()
// in beforeEach and __mock.setResponse(table, response) to script what a query resolves to.
import { createSupabaseMock } from '../../test-utils/supabaseMock';

let instance = createSupabaseMock();

export const isSupabaseConfigured = true;
// How the visit arrived (a password-reset link, a dead link). A test sets a field before it
// renders the provider and puts it back after.
export const arrivedBy = { recovery: false, problem: '' };
// A stored photo under the mock looks like
// https://project.example.test/storage/v1/object/public/<bucket>/<owner id>/<file>.
export const supabaseProjectUrl = 'https://project.example.test';
export const supabase = new Proxy({}, {
  get(_target, prop) { return instance[prop]; },
});
// The project's public sign-in settings. Passkeys are off, as on a project whose owner hasn't
// switched them on, until a test says __mock.setAuthSettings({ passkeys_enabled: true }) —
// or null, for settings that couldn't be read. Every call is noted in __mock.authSettingsAsked.
let authSettings = { passkeys_enabled: false };
let authSettingsAsked = 0;
export async function fetchAuthSettings() { authSettingsAsked += 1; return authSettings; }

export const __mock = {
  get current() { return instance; },
  reset() { instance = createSupabaseMock(); authSettings = { passkeys_enabled: false }; authSettingsAsked = 0; },
  setAuthSettings(next) { authSettings = next; },
  get authSettingsAsked() { return authSettingsAsked; },
  setResponse(table, response) { instance.setResponse(table, response); },
};

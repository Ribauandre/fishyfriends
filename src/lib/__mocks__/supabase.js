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

export const __mock = {
  get current() { return instance; },
  reset() { instance = createSupabaseMock(); },
  setResponse(table, response) { instance.setResponse(table, response); },
};

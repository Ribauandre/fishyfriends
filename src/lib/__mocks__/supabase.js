// Manual Jest mock for src/lib/supabase.js. Activate with jest.mock('../lib/supabase')
// (adjust the relative path to match the importing file) in any test that needs
// isSupabaseConfigured to be true and a controllable fake client. Call __mock.reset()
// in beforeEach and __mock.setResponse(table, response) to script what a query resolves to.
import { createSupabaseMock } from '../../test-utils/supabaseMock';

let instance = createSupabaseMock();

export const isSupabaseConfigured = true;
export const supabase = new Proxy({}, {
  get(_target, prop) { return instance[prop]; },
});

export const __mock = {
  get current() { return instance; },
  reset() { instance = createSupabaseMock(); },
  setResponse(table, response) { instance.setResponse(table, response); },
};

// A lightweight, chainable fake for the Supabase JS query builder, good enough to drive
// every call shape AuthContext.js actually makes (select/eq/order/insert/update/delete/
// upsert/maybeSingle/single, all eventually awaited). Configure what a table resolves to
// with setResponse(table, response); every method on the chain just returns the same
// builder, and awaiting it resolves to whatever was configured for that table.
export function createSupabaseMock() {
  const responses = new Map();
  const fromCalls = [];

  function resolveFor(table) {
    const configured = responses.get(table);
    if (configured === undefined) return { data: null, error: null };
    if (typeof configured === 'function') return configured();
    if (Array.isArray(configured)) return configured.length > 1 ? configured.shift() : configured[0];
    return configured;
  }

  function makeBuilder(table) {
    const builder = {};
    const chainMethods = ['select', 'eq', 'neq', 'order', 'limit', 'maybeSingle', 'single', 'insert', 'update', 'delete', 'upsert'];
    chainMethods.forEach((method) => { builder[method] = jest.fn(() => builder); });
    builder.then = (resolve, reject) => Promise.resolve(resolveFor(table)).then(resolve, reject);
    builder.catch = (reject) => Promise.resolve(resolveFor(table)).catch(reject);
    return builder;
  }

  const auth = {
    getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    signInWithPassword: jest.fn().mockResolvedValue({ error: null }),
    signUp: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  };

  const storageUpload = jest.fn().mockResolvedValue({ error: null });
  const storageGetPublicUrl = jest.fn(() => ({ data: { publicUrl: 'https://example.com/photo.jpg' } }));
  const storage = { from: jest.fn(() => ({ upload: storageUpload, getPublicUrl: storageGetPublicUrl })) };

  return {
    from: jest.fn((table) => { fromCalls.push(table); return makeBuilder(table); }),
    auth,
    storage,
    setResponse(table, response) { responses.set(table, response); },
    fromCalls,
    storageUpload,
    storageGetPublicUrl,
  };
}

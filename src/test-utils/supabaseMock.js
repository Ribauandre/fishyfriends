// A lightweight, chainable fake for the Supabase JS query builder, good enough to drive
// every call shape AuthContext.js actually makes (select/eq/neq/ilike/order/insert/update/
// delete/upsert/maybeSingle/single, all eventually awaited). Configure what a table resolves to
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
    const chainMethods = ['select', 'eq', 'neq', 'ilike', 'order', 'limit', 'maybeSingle', 'single', 'insert', 'update', 'delete', 'upsert'];
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

  // Fake Realtime channel: records the callback registered for each table's postgres_changes
  // subscription (keyed by table, since that's all AuthContext's subscribeToActivity needs)
  // so a test can trigger one directly with emitPostgresChange instead of needing a real
  // websocket connection.
  const channelHandlersByTable = new Map();
  const removeChannel = jest.fn();
  const channel = jest.fn(() => {
    const chan = {
      on: jest.fn((_event, filter, callback) => {
        if (filter?.table) channelHandlersByTable.set(filter.table, callback);
        return chan;
      }),
      subscribe: jest.fn(() => chan),
    };
    return chan;
  });

  return {
    from: jest.fn((table) => { fromCalls.push(table); return makeBuilder(table); }),
    auth,
    storage,
    channel,
    removeChannel,
    setResponse(table, response) { responses.set(table, response); },
    fromCalls,
    storageUpload,
    storageGetPublicUrl,
    async emitPostgresChange(table, newRow) {
      const callback = channelHandlersByTable.get(table);
      if (callback) await callback({ new: newRow });
    },
  };
}

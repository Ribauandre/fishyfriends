// A lightweight, chainable fake for the Supabase JS query builder, good enough to drive
// every call shape AuthContext.js actually makes (select/eq/neq/ilike/order/insert/update/
// delete/upsert/maybeSingle/single, all eventually awaited). Configure what a table resolves to
// with setResponse(table, response); every method on the chain just returns the same
// builder, and awaiting it resolves to whatever was configured for that table.
// A join the server answered with "no", as the Realtime client hands it to the subscribe
// callback: an Error whose cause is the server's reply.
export function joinRefusal(reason) {
  return Object.assign(new Error(reason), { cause: { reason } });
}

export function createSupabaseMock() {
  const responses = new Map();
  // Signed-in test users are club members unless a test says otherwise (a database function
  // is scripted like a table, under its name with an `rpc:` prefix).
  responses.set('rpc:my_membership', { data: { status: 'approved', is_admin: false }, error: null });
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
    const chainMethods = ['select', 'eq', 'neq', 'ilike', 'gte', 'lte', 'lt', 'gt', 'in', 'order', 'limit', 'maybeSingle', 'single', 'insert', 'update', 'delete', 'upsert'];
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
    resetPasswordForEmail: jest.fn().mockResolvedValue({ data: {}, error: null }),
    updateUser: jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    // Passkeys (utils/passkeys.js). A sign-in with one works, a new one is registered, and the
    // account holds none, unless a test scripts otherwise with mockResolvedValue.
    signInWithPasskey: jest.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } }, user: { id: 'user-1' } }, error: null }),
    registerPasskey: jest.fn().mockResolvedValue({ data: { id: 'passkey-new', friendly_name: 'iCloud Keychain', created_at: '2026-11-28T15:00:00Z' }, error: null }),
    passkey: {
      list: jest.fn().mockResolvedValue({ data: [], error: null }),
      update: jest.fn(async ({ passkeyId, friendlyName }) => ({ data: { id: passkeyId, friendly_name: friendlyName, created_at: '2026-11-28T15:00:00Z' }, error: null })),
      delete: jest.fn().mockResolvedValue({ data: null, error: null }),
    },
  };

  const storageUpload = jest.fn().mockResolvedValue({ error: null });
  const storageGetPublicUrl = jest.fn(() => ({ data: { publicUrl: 'https://example.com/photo.jpg' } }));
  const storageCreateSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: 'https://example.com/signed-photo.jpg' }, error: null });
  const storageRemove = jest.fn().mockResolvedValue({ error: null });
  // Signed links for stored photos (utils/photoLinks.js): every path asked for comes back
  // signed, at an address a test can recognise. Called with (bucket, paths, seconds).
  const storageCreateSignedUrls = jest.fn(async (bucket, paths) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://project.example.test/storage/v1/object/sign/${bucket}/${path}?token=signed`, error: null })),
    error: null,
  }));
  // list / download / update are scripted per test (the admin's photo clean-up is their only
  // caller): mockResolvedValue / mockImplementation them on the object this hands back.
  const storageList = jest.fn().mockResolvedValue({ data: [], error: null });
  const storageDownload = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
  const storageUpdate = jest.fn().mockResolvedValue({ error: null });
  const storage = { from: jest.fn((bucket) => ({
    upload: storageUpload, getPublicUrl: storageGetPublicUrl, createSignedUrl: storageCreateSignedUrl, remove: storageRemove,
    createSignedUrls: (...args) => storageCreateSignedUrls(bucket, ...args),
    list: (...args) => storageList(bucket, ...args), download: (...args) => storageDownload(bucket, ...args), update: (...args) => storageUpdate(bucket, ...args),
  })) };

  // Fake Realtime channel: records the callback registered for each table's postgres_changes
  // subscription (keyed by table, since that's all AuthContext's subscribeToActivity needs)
  // so a test can trigger one directly with emitPostgresChange instead of needing a real
  // websocket connection.
  const channelHandlersByTable = new Map();
  // Presence (Cast & Catch's dock): the channel also records presence handlers by event,
  // fakes track()/presenceState(), and calls subscribe's callback with 'SUBSCRIBED' so the
  // first track() fires. emitPresenceSync(state) replaces the state and runs the sync handler.
  const presenceHandlers = new Map();
  let presenceState = {};
  // `channels` is the creation log (tests index into it); getChannels() is what the real client
  // reports — the ones not yet removed — and removeChannel resolves like the real one does.
  const channels = [];
  // How the fake server answers a join. Everything is let in unless a test says otherwise with
  // setJoinAnswer(({ name, isPrivate }) => ...): return 'SUBSCRIBED', another status, or
  // [status, error] — joinRefusal(reason) makes the error a refused join arrives with.
  let answerJoin = () => 'SUBSCRIBED';
  const removeChannel = jest.fn(async (chan) => { if (chan) chan.removed = true; return 'ok'; });
  const getChannels = jest.fn(() => channels.filter((chan) => !chan.removed));
  const channel = jest.fn((name, options) => {
    const chan = {
      name,
      topic: `realtime:${name}`,
      options,
      on: jest.fn((event, filter, callback) => {
        if (event === 'presence') presenceHandlers.set(filter?.event || 'sync', callback);
        else if (filter?.table) channelHandlersByTable.set(filter.table, callback);
        return chan;
      }),
      subscribe: jest.fn((callback) => {
        if (callback) Promise.resolve().then(() => {
          const answer = answerJoin({ name, isPrivate: Boolean(options?.config?.private) });
          if (Array.isArray(answer)) callback(...answer); else if (answer) callback(answer);
        });
        return chan;
      }),
      // Like the real client: nothing can be sent on a channel whose join hasn't gone out.
      track: jest.fn(() => {
        if (chan.subscribe.mock.calls.length === 0) throw new Error(`tried to push 'presence' to 'realtime:${name}' before joining. Use channel.subscribe() before pushing events`);
        return Promise.resolve('ok');
      }),
      untrack: jest.fn().mockResolvedValue('ok'),
      presenceState: jest.fn(() => presenceState),
    };
    channels.push(chan);
    return chan;
  });

  return {
    from: jest.fn((table) => { fromCalls.push(table); return makeBuilder(table); }),
    // A database function: scripted like a table, under its name with an `rpc:` prefix.
    rpc: jest.fn((name) => Promise.resolve(resolveFor(`rpc:${name}`))),
    auth,
    storage,
    channel,
    removeChannel,
    getChannels,
    // The Realtime client itself: the app hands it the account's token before a members-only join.
    realtime: { setAuth: jest.fn().mockResolvedValue(undefined) },
    setJoinAnswer(answer) { answerJoin = answer; },
    setResponse(table, response) { responses.set(table, response); },
    fromCalls,
    storageUpload,
    storageGetPublicUrl,
    storageCreateSignedUrl,
    storageCreateSignedUrls,
    storageRemove,
    storageList,
    storageDownload,
    storageUpdate,
    async emitPostgresChange(table, newRow) {
      const callback = channelHandlersByTable.get(table);
      if (callback) await callback({ new: newRow });
    },
    channels,
    async emitPresenceSync(state) {
      presenceState = state;
      const callback = presenceHandlers.get('sync');
      if (callback) await callback();
    },
  };
}

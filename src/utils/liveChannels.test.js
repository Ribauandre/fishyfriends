import {
  openLiveChannel, tryJoin, testLiveChannels, liveChannelVerdict, refusalReason, refusedAsNotAllowed, refusedAsPrivateOnly,
  recallLiveVerdict, rememberLiveVerdict, DOCK_TOPIC, ACTIVITY_TOPIC, CHECK_TOPIC, OPEN_CHECK_TOPIC,
} from './liveChannels';

// The server's own words, as far as its source shows them. Nothing here may depend on more
// than the word "Unauthorized"/"permission" for one and "private" for the other.
const NOT_ALLOWED = 'Unauthorized: You do not have permissions to read from this Channel topic: cast-and-catch-dock';
const PRIVATE_ONLY = 'PrivateOnly: This project only allows private channels';
const STARTING_UP = 'InitializingProjectConnection: Realtime is initializing the project connection';
const TOKEN_RAN_OUT = 'InvalidJWTToken: Token has expired 3600 seconds ago';

// A refused join, a dropped socket and a transport failure, shaped the way realtime-js hands
// each to the subscribe callback (RealtimeChannel.subscribe / normalizeChannelError).
const refused = (reason) => Object.assign(new Error(reason), { cause: { reason } });
const socketClosed = () => Object.assign(new Error('socket closed: 1006'), { cause: { code: 1006, reason: '' } });
const transportFailed = () => Object.assign(new Error('channel error: transport failure'), { cause: { type: 'error' } });
const connectionLost = () => new Error('channel error: connection lost');

const flush = async (ticks = 8) => { for (let i = 0; i < ticks; i += 1) await Promise.resolve(); }; // eslint-disable-line no-await-in-loop

// A stand-in for the Supabase client: channels are recorded as they are made, a test answers
// each join by hand with chan.answer(status, error), and removal takes a tick like the real one.
function fakeClient({ setAuth } = {}) {
  const made = [];
  const client = {
    made,
    realtime: { setAuth: setAuth || jest.fn().mockResolvedValue(undefined) },
    removeChannel: jest.fn(async (chan) => { chan.removed = true; return 'ok'; }),
    getChannels: jest.fn(() => made.filter((chan) => !chan.removed)),
    channel: jest.fn((name, options) => {
      const chan = {
        name, options, topic: `realtime:${name}`, isPrivate: Boolean(options?.config?.private), removed: false, callback: null,
        on: jest.fn(() => chan),
        subscribe: jest.fn((callback) => { chan.callback = callback; return chan; }),
        track: jest.fn().mockResolvedValue('ok'),
        answer(status, error) { chan.callback(status, error); },
      };
      made.push(chan);
      return chan;
    }),
  };
  return client;
}

describe('telling a refusal from a dropped connection', () => {
  test('a reply from the server is a refusal, in its words', () => {
    expect(refusalReason(refused(NOT_ALLOWED))).toBe(NOT_ALLOWED);
    expect(refusalReason(Object.assign(new Error('x'), { cause: { message: 'nope', status: 'error' } }))).toBe('nope, error');
  });

  test('a closed socket, a transport failure and a lost connection are not', () => {
    expect(refusalReason(socketClosed())).toBe('');
    expect(refusalReason(transportFailed())).toBe('');
    expect(refusalReason(connectionLost())).toBe('');
    expect(refusalReason(undefined)).toBe('');
    expect(refusalReason(new Error('anything'))).toBe('');
  });

  test('only "you may not" and "private only" are about the kind of channel', () => {
    expect(refusedAsNotAllowed(NOT_ALLOWED)).toBe(true);
    expect(refusedAsNotAllowed('Unauthorised')).toBe(true);
    expect(refusedAsPrivateOnly(PRIVATE_ONLY)).toBe(true);
    // Asking again gets past these, so neither changes what is asked for.
    for (const passing of [STARTING_UP, TOKEN_RAN_OUT, 'ClientJoinRateLimitReached: Too many joins per second', 'Unauthorized: invalid JWT token', '']) {
      expect(refusedAsNotAllowed(passing)).toBe(false);
      expect(refusedAsPrivateOnly(passing)).toBe(false);
    }
    expect(refusedAsNotAllowed(PRIVATE_ONLY)).toBe(false);
    expect(refusedAsPrivateOnly(NOT_ALLOWED)).toBe(false);
  });
});

describe('openLiveChannel', () => {
  test('joins members-only, with the account\'s token in hand first, and keeps what it was configured with', async () => {
    const client = fakeClient();
    const bind = jest.fn();
    const onJoined = jest.fn();
    const live = openLiveChannel(client, DOCK_TOPIC, { config: { presence: { key: 'user-1' } }, bind, onJoined });

    // The channel exists, and is bound, at once; the join waits for the token.
    expect(client.made).toHaveLength(1);
    const [chan] = client.made;
    expect(chan.name).toBe('cast-and-catch-dock');
    expect(chan.options).toEqual({ config: { presence: { key: 'user-1' }, private: true } });
    expect(bind).toHaveBeenCalledWith(chan);
    expect(live.channel()).toBe(chan);
    expect(live.kind()).toBe('private');
    expect(chan.subscribe).not.toHaveBeenCalled();
    // Not joined yet: nothing may be sent on it (the client throws on a push before the join).
    expect(live.joined()).toBe(false);
    await flush();
    expect(live.joined()).toBe(false);
    expect(client.realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(chan.subscribe).toHaveBeenCalledTimes(1);
    expect(client.realtime.setAuth.mock.invocationCallOrder[0]).toBeLessThan(chan.subscribe.mock.invocationCallOrder[0]);

    chan.answer('SUBSCRIBED');
    expect(onJoined).toHaveBeenCalledWith(chan);
    expect(live.joined()).toBe(true);
    // A reconnect joins again, and says so again.
    chan.answer('SUBSCRIBED');
    expect(onJoined).toHaveBeenCalledTimes(2);
    expect(client.made).toHaveLength(1);
  });

  test('a token that can\'t be fetched doesn\'t stop the join being tried', async () => {
    const client = fakeClient({ setAuth: jest.fn().mockRejectedValue(new Error('offline')) });
    openLiveChannel(client, ACTIVITY_TOPIC);
    await flush();
    expect(client.made[0].subscribe).toHaveBeenCalledTimes(1);
  });

  test('refused as not allowed: opens the topic the old way, once, with the same listeners', async () => {
    const client = fakeClient();
    const bind = jest.fn();
    const onJoined = jest.fn();
    const live = openLiveChannel(client, DOCK_TOPIC, { config: { presence: { key: 'user-1' } }, bind, onJoined });
    await flush();
    const [first] = client.made;
    first.answer('CHANNEL_ERROR', refused(NOT_ALLOWED));
    expect(live.channel()).toBeNull();
    expect(live.joined()).toBe(false);
    await flush();
    // The open channel is in hand but has not been let in yet.
    expect(live.channel()).toBe(client.made[1]);
    expect(live.joined()).toBe(false);

    expect(client.removeChannel).toHaveBeenCalledWith(first);
    expect(client.made).toHaveLength(2);
    const second = client.made[1];
    expect(second.options).toEqual({ config: { presence: { key: 'user-1' } } });
    expect(bind).toHaveBeenLastCalledWith(second);
    expect(second.subscribe).toHaveBeenCalledTimes(1);
    expect(live.kind()).toBe('open');
    second.answer('SUBSCRIBED');
    expect(onJoined).toHaveBeenCalledWith(second);
    expect(live.joined()).toBe(true);

    // The refused channel is dead to this handle: a late answer on it changes nothing.
    first.answer('SUBSCRIBED');
    first.answer('CHANNEL_ERROR', refused(NOT_ALLOWED));
    await flush();
    expect(onJoined).toHaveBeenCalledTimes(1);
    expect(client.made).toHaveLength(2);
  });

  test('refused both ways: stops asking instead of knocking forever', async () => {
    const client = fakeClient();
    const live = openLiveChannel(client, DOCK_TOPIC);
    await flush();
    client.made[0].answer('CHANNEL_ERROR', refused(NOT_ALLOWED));
    await flush();
    client.made[1].answer('CHANNEL_ERROR', refused(PRIVATE_ONLY));
    await flush();
    expect(client.removeChannel).toHaveBeenCalledWith(client.made[1]);
    expect(client.made).toHaveLength(2);
    expect(live.channel()).toBeNull();
    expect(live.kind()).toBe('none');
  });

  test('a dropped connection, a timeout or a passing refusal never changes the kind of channel', async () => {
    const client = fakeClient();
    const live = openLiveChannel(client, DOCK_TOPIC);
    await flush();
    const [chan] = client.made;
    chan.answer('CHANNEL_ERROR', socketClosed());
    chan.answer('CHANNEL_ERROR', transportFailed());
    chan.answer('CHANNEL_ERROR', connectionLost());
    chan.answer('TIMED_OUT');
    chan.answer('CHANNEL_ERROR', refused(STARTING_UP));
    chan.answer('CHANNEL_ERROR', refused(TOKEN_RAN_OUT));
    chan.answer('CLOSED');
    await flush();
    expect(client.made).toHaveLength(1);
    expect(client.removeChannel).not.toHaveBeenCalled();
    expect(live.kind()).toBe('private');
  });

  test('once in, a later refusal is the client\'s to retry: the room is never swapped under a member', async () => {
    const client = fakeClient();
    const live = openLiveChannel(client, DOCK_TOPIC);
    await flush();
    const [chan] = client.made;
    chan.answer('SUBSCRIBED');
    // The phone slept, the token ran out, the rejoin is refused until it is renewed — or
    // (worse to act on) the server says "not allowed" for a moment.
    chan.answer('CHANNEL_ERROR', refused(TOKEN_RAN_OUT));
    chan.answer('CHANNEL_ERROR', refused(NOT_ALLOWED));
    await flush();
    expect(client.made).toHaveLength(1);
    expect(live.channel()).toBe(chan);
  });

  test('an open channel that is turned away for a passing reason is left to retry', async () => {
    const client = fakeClient();
    const live = openLiveChannel(client, DOCK_TOPIC);
    await flush();
    client.made[0].answer('CHANNEL_ERROR', refused(NOT_ALLOWED));
    await flush();
    client.made[1].answer('CHANNEL_ERROR', refused(STARTING_UP));
    client.made[1].answer('CHANNEL_ERROR', socketClosed());
    await flush();
    expect(live.channel()).toBe(client.made[1]);
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });

  test('leaving removes the channel, and a leave before the join means it is never sent', async () => {
    const client = fakeClient();
    const live = openLiveChannel(client, ACTIVITY_TOPIC);
    const [chan] = client.made;
    live.leave();
    expect(client.removeChannel).toHaveBeenCalledWith(chan);
    await flush();
    expect(chan.subscribe).not.toHaveBeenCalled();
    expect(live.channel()).toBeNull();
    expect(live.joined()).toBe(false);

    // And nothing is opened behind a handle that has left, whatever arrives afterwards.
    const second = fakeClient();
    const other = openLiveChannel(second, DOCK_TOPIC);
    await flush();
    other.leave();
    second.made[0].answer('CHANNEL_ERROR', refused(NOT_ALLOWED));
    await flush();
    expect(second.made).toHaveLength(1);
  });

  test('a channel still leaving on the same topic is removed, and waited for, before a fresh one is made', async () => {
    const client = fakeClient();
    const old = client.channel(DOCK_TOPIC, {});
    let finished;
    client.removeChannel.mockImplementationOnce((chan) => new Promise((resolve) => { finished = () => { chan.removed = true; resolve('ok'); }; }));
    const bind = jest.fn();
    openLiveChannel(client, DOCK_TOPIC, { bind });
    expect(client.removeChannel).toHaveBeenCalledWith(old);
    await flush();
    expect(client.made).toHaveLength(1);
    expect(bind).not.toHaveBeenCalled();

    finished();
    await flush();
    expect(client.made).toHaveLength(2);
    expect(client.made[1].isPrivate).toBe(true);
    expect(client.made[1].subscribe).toHaveBeenCalledTimes(1);
    // A channel on another topic is nobody's business here.
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
  });

  test('works with a client that has no token to hand over', async () => {
    const client = fakeClient();
    delete client.realtime;
    openLiveChannel(client, DOCK_TOPIC);
    await flush();
    expect(client.made[0].subscribe).toHaveBeenCalledTimes(1);
  });
});

describe('tryJoin', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  test('joined: says so and leaves again', async () => {
    const client = fakeClient();
    const asked = tryJoin(client, CHECK_TOPIC, true);
    await flush();
    const [chan] = client.made;
    expect(chan.options).toEqual({ config: { private: true } });
    chan.answer('SUBSCRIBED');
    await expect(asked).resolves.toEqual({ outcome: 'joined', reason: '' });
    expect(client.removeChannel).toHaveBeenCalledWith(chan);
  });

  test('an open join carries no private flag', async () => {
    const client = fakeClient();
    const asked = tryJoin(client, OPEN_CHECK_TOPIC, false);
    await flush();
    expect(client.made[0].options).toEqual({ config: {} });
    client.made[0].answer('CHANNEL_ERROR', refused(PRIVATE_ONLY));
    await expect(asked).resolves.toEqual({ outcome: 'refused', reason: PRIVATE_ONLY });
  });

  test('a refusal about the kind of channel is the answer at once', async () => {
    const client = fakeClient();
    const asked = tryJoin(client, CHECK_TOPIC, true);
    await flush();
    client.made[0].answer('CHANNEL_ERROR', refused(NOT_ALLOWED));
    await expect(asked).resolves.toEqual({ outcome: 'refused', reason: NOT_ALLOWED });
    expect(client.removeChannel).toHaveBeenCalledWith(client.made[0]);
  });

  test('a passing refusal is waited out; if it passes, the answer is joined', async () => {
    const client = fakeClient();
    const asked = tryJoin(client, CHECK_TOPIC, true);
    await flush();
    client.made[0].answer('CHANNEL_ERROR', refused(STARTING_UP));
    client.made[0].answer('CHANNEL_ERROR', socketClosed());
    client.made[0].answer('SUBSCRIBED');
    await expect(asked).resolves.toEqual({ outcome: 'joined', reason: '' });
  });

  test('if it never passes, the last thing the server said is the answer when time is up', async () => {
    const client = fakeClient();
    const asked = tryJoin(client, CHECK_TOPIC, true, { wait: 5000 });
    await flush();
    client.made[0].answer('CHANNEL_ERROR', refused(STARTING_UP));
    jest.advanceTimersByTime(5000);
    await expect(asked).resolves.toEqual({ outcome: 'refused', reason: STARTING_UP });
  });

  test('no answer at all is unreachable, not a refusal', async () => {
    const client = fakeClient();
    const asked = tryJoin(client, CHECK_TOPIC, true, { wait: 5000 });
    await flush();
    client.made[0].answer('CHANNEL_ERROR', socketClosed());
    client.made[0].answer('TIMED_OUT');
    jest.advanceTimersByTime(5000);
    await expect(asked).resolves.toEqual({ outcome: 'unreachable', reason: '' });
    expect(client.removeChannel).toHaveBeenCalledWith(client.made[0]);
  });

  test('a client that throws on the channel is unreachable', async () => {
    const client = fakeClient();
    client.channel.mockImplementation(() => { throw new Error('no socket'); });
    await expect(tryJoin(client, CHECK_TOPIC, true)).resolves.toEqual({ outcome: 'unreachable', reason: '' });
  });
});

describe('testLiveChannels', () => {
  // Answers every join as it is made, by what kind of channel it is.
  function answering(byKind) {
    const client = fakeClient();
    const make = client.channel.getMockImplementation();
    client.channel.mockImplementation((name, options) => {
      const chan = make(name, options);
      chan.subscribe.mockImplementation((callback) => {
        const answer = byKind[chan.isPrivate ? 'membersOnly' : 'open'];
        Promise.resolve().then(() => (answer === 'ok' ? callback('SUBSCRIBED') : callback('CHANNEL_ERROR', refused(answer))));
        return chan;
      });
      return chan;
    });
    return client;
  }

  test('asks members-only first, then open, each on its own topic, and never at once', async () => {
    const client = answering({ membersOnly: 'ok', open: 'ok' });
    const result = await testLiveChannels(client);
    expect(result).toEqual({ membersOnly: { outcome: 'joined', reason: '' }, open: { outcome: 'joined', reason: '' } });
    expect(client.made.map((chan) => [chan.name, chan.isPrivate])).toEqual([[CHECK_TOPIC, true], [OPEN_CHECK_TOPIC, false]]);
    expect(client.made.every((chan) => chan.removed)).toBe(true);
    expect(liveChannelVerdict(result)).toBe('open');
  });

  test('the four states a project can be in', async () => {
    expect(liveChannelVerdict(await testLiveChannels(answering({ membersOnly: 'ok', open: PRIVATE_ONLY })))).toBe('closed');
    expect(liveChannelVerdict(await testLiveChannels(answering({ membersOnly: 'ok', open: 'ok' })))).toBe('open');
    expect(liveChannelVerdict(await testLiveChannels(answering({ membersOnly: NOT_ALLOWED, open: 'ok' })))).toBe('not-ready');
    expect(liveChannelVerdict(await testLiveChannels(answering({ membersOnly: NOT_ALLOWED, open: PRIVATE_ONLY })))).toBe('broken');
  });

  test('anything it couldn\'t tell is unknown', () => {
    expect(liveChannelVerdict({ membersOnly: { outcome: 'unreachable' }, open: { outcome: 'joined' } })).toBe('unknown');
    expect(liveChannelVerdict({ membersOnly: { outcome: 'joined' }, open: { outcome: 'unreachable' } })).toBe('unknown');
    expect(liveChannelVerdict(null)).toBe('unknown');
    expect(liveChannelVerdict({})).toBe('unknown');
  });
});

describe('remembering the verdict for a day', () => {
  function fakeStorage() {
    const items = new Map();
    return { getItem: (key) => (items.has(key) ? items.get(key) : null), setItem: (key, value) => { items.set(key, String(value)); }, removeItem: (key) => { items.delete(key); }, items };
  }
  const NOW = 1_800_000_000_000;
  const HOUR = 60 * 60 * 1000;

  test('kept for a day, then asked again', () => {
    const storage = fakeStorage();
    expect(recallLiveVerdict(storage, NOW)).toBeNull();
    rememberLiveVerdict(storage, 'open', NOW);
    expect(recallLiveVerdict(storage, NOW + 23 * HOUR)).toBe('open');
    expect(recallLiveVerdict(storage, NOW + 25 * HOUR)).toBeNull();
    // A clock that went backwards doesn't make an answer last longer.
    expect(recallLiveVerdict(storage, NOW - HOUR)).toBeNull();
  });

  test('only the verdict is kept — no reason, no account', () => {
    const storage = fakeStorage();
    rememberLiveVerdict(storage, 'closed', NOW);
    expect(JSON.parse([...storage.items.values()][0])).toEqual({ verdict: 'closed', at: NOW });
  });

  test('"couldn\'t tell" is never kept, and clears what was', () => {
    const storage = fakeStorage();
    rememberLiveVerdict(storage, 'open', NOW);
    rememberLiveVerdict(storage, 'unknown', NOW);
    expect(recallLiveVerdict(storage, NOW)).toBeNull();
  });

  test('storage that throws or holds rubbish is just an unanswered question', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('denied'); } };
    expect(recallLiveVerdict(broken, NOW)).toBeNull();
    expect(() => rememberLiveVerdict(broken, 'open', NOW)).not.toThrow();
    const rubbish = fakeStorage();
    rubbish.setItem('fishyfriends:live-channels', '{not json');
    expect(recallLiveVerdict(rubbish, NOW)).toBeNull();
    rubbish.setItem('fishyfriends:live-channels', JSON.stringify({ verdict: 7, at: 'yesterday' }));
    expect(recallLiveVerdict(rubbish, NOW)).toBeNull();
  });
});

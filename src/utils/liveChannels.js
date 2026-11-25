// The app's live channels — who is on the dock in the game, and "someone just posted" on Home
// — joined as members-only ("private") Realtime channels.
//
// An open channel can be joined by anyone holding the site's public key, and that key is in
// the bundle: until November 2026 an outsider could sit on the dock's channel and watch which
// account ids were playing, when, and on which ground. A private channel is joined with the
// account's own token, and row-level security on realtime.messages (migration 0045) decides
// who gets in: members, on the topics named here, listening everywhere and announcing
// themselves on the dock only.
//
// That alone doesn't shut the open kind: whether a project still ACCEPTS open channels is a
// Supabase setting (Realtime > Settings > "Allow public access to channels") that only the
// owner can turn off, and should only once the crew's phones run a version that joins
// privately. Until then both kinds exist side by side, so this still sends nothing personal
// on a channel (see joinDock), and `testLiveChannels` is how the admin page tells the owner
// where things stand.
//
// Nothing here knows about React or the provider: it is handed the Supabase client.

export const DOCK_TOPIC = 'cast-and-catch-dock';
export const ACTIVITY_TOPIC = 'home-activity-feed';
// Joined by the admin page's check and by nothing else. The first is on 0045's list of topics
// a member may listen on; the second is deliberately on nobody's list, because an open channel
// asks no rule at all.
export const CHECK_TOPIC = 'club-channel-check';
export const OPEN_CHECK_TOPIC = 'club-open-channel-check';

// What the server said when it answered a join with "no" — or '' when the failure was the
// connection's (dropped, timed out, offline), which the client retries by itself and which
// says nothing about what this account is allowed. A refusal reaches the subscribe callback
// as an Error whose `cause` is the server's reply, an object carrying its reason; a failed
// socket's cause is an event instead (it has a `type`, or a close `code`).
export function refusalReason(error) {
  const cause = error && error.cause;
  if (!cause || typeof cause !== 'object' || typeof cause.code === 'number' || typeof cause.type === 'string') return '';
  const reason = typeof cause.reason === 'string' ? cause.reason : Object.values(cause).filter((value) => typeof value === 'string').join(', ');
  return reason.trim();
}

// The two refusals that are about the kind of channel rather than about the moment: "this
// account may not join that private channel", and "this project takes private channels only".
// Everything else the server refuses a join with (it is starting up, too many joins a second,
// a token that ran out while the phone slept) passes if the client just asks again, so none
// of it is a reason to change what kind of channel is being asked for.
export const refusedAsNotAllowed = (reason) => /unauthori[sz]ed|permission/i.test(reason) && !/token|jwt/i.test(reason);
export const refusedAsPrivateOnly = (reason) => /private/i.test(reason);

const staleOn = (client, topic) => (typeof client.getChannels === 'function' ? client.getChannels() : []).filter((existing) => existing.topic === `realtime:${topic}`);

// A private join is judged on the account's token, so the socket has to be holding the
// current one before the join goes out (the client otherwise picks it up a moment later,
// which is fine for an open channel and a refusal for a private one).
function withToken(client, then) {
  if (typeof client.realtime?.setAuth !== 'function') { then(); return; }
  Promise.resolve().then(() => client.realtime.setAuth()).then(then, then);
}

// Opens `topic` members-only and keeps it open until `leave()`.
//
//   bind(channel)      attaches the listeners; called for each channel this makes.
//   onJoined(channel)  every time the channel is joined — again after a reconnect.
//
// If the server refuses the members-only join outright — what a project does where 0045's
// rules could not be made — the topic is opened the old, open way instead, once, so the dock
// and the feed keep working there. If that is refused too because the project only takes
// private channels, there is nowhere left to go and this stops asking.
//
// The Realtime client hands back the *existing* channel for a topic, and subscribing to one
// that is still leaving is a silent no-op (no status, no track: presence just goes dark). A
// rejoin straight after a leave (StrictMode, a remount, a provider re-render) hits exactly
// that, so a stale channel on the topic is removed, and awaited, before a fresh one is made.
export function openLiveChannel(client, topic, { config = {}, bind = () => {}, onJoined = () => {} } = {}) {
  let channel = null;
  let kind = 'none';
  let closed = false;
  // Whether the channel in hand has been let in at least once. Until then nothing may be
  // sent on it: the client throws on a push to a channel whose join hasn't gone out, and the
  // join here waits for the token.
  let joined = false;

  function start(isPrivate) {
    const create = () => {
      if (closed) return;
      const next = client.channel(topic, { config: { ...config, ...(isPrivate ? { private: true } : {}) } });
      let joinedOnce = false;
      channel = next;
      kind = isPrivate ? 'private' : 'open';
      joined = false;
      bind(next);
      const join = () => {
        if (closed || channel !== next) return;
        next.subscribe((status, error) => {
          if (closed || channel !== next) return;
          if (status === 'SUBSCRIBED') { joinedOnce = true; joined = true; onJoined(next); return; }
          if (status !== 'CHANNEL_ERROR' || joinedOnce) return;
          const reason = refusalReason(error);
          const giveUpOnThisKind = isPrivate ? refusedAsNotAllowed(reason) : refusedAsPrivateOnly(reason);
          if (!giveUpOnThisKind) return;
          channel = null;
          kind = 'none';
          joined = false;
          const gone = Promise.resolve().then(() => client.removeChannel(next)).catch(() => {});
          if (isPrivate) gone.then(() => start(false));
        });
      };
      if (isPrivate) withToken(client, join); else join();
    };
    const stale = staleOn(client, topic);
    if (stale.length === 0) create();
    else Promise.all(stale.map((existing) => client.removeChannel(existing))).then(create, create);
  }

  start(true);
  return {
    channel: () => channel,
    // 'private', 'open', or 'none' while there is no channel (not made yet, refused, left).
    kind: () => kind,
    // True once the channel in hand has been joined: the earliest anything may be sent on it.
    joined: () => joined,
    leave() {
      closed = true;
      const last = channel;
      channel = null;
      kind = 'none';
      joined = false;
      if (last) client.removeChannel(last);
    },
  };
}

// Joins `topic` once and says how it went, then leaves again:
//   'joined'       the server let this account in;
//   'refused'      it answered no (`reason` is in its words);
//   'unreachable'  no answer either way within `wait` ms.
// A refusal that asking again would get past (see above) is waited out rather than reported,
// unless it is still the answer when the time is up.
export function tryJoin(client, topic, isPrivate, { wait = 12000 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let channel = null;
    let lastReason = '';
    let timer = null;
    const finish = (outcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const last = channel;
      channel = null;
      Promise.resolve().then(() => (last ? client.removeChannel(last) : null)).catch(() => {})
        .then(() => resolve({ outcome, reason: outcome === 'refused' ? lastReason : '' }));
    };
    timer = setTimeout(() => finish(lastReason ? 'refused' : 'unreachable'), wait);
    const create = () => {
      if (done) return;
      try {
        channel = client.channel(topic, { config: isPrivate ? { private: true } : {} });
      } catch (problem) {
        finish('unreachable');
        return;
      }
      const made = channel;
      withToken(client, () => {
        if (done || channel !== made) return;
        made.subscribe((status, error) => {
          if (status === 'SUBSCRIBED') { finish('joined'); return; }
          if (status !== 'CHANNEL_ERROR') return;
          const reason = refusalReason(error);
          if (!reason) return;
          lastReason = reason;
          if (refusedAsNotAllowed(reason) || refusedAsPrivateOnly(reason)) finish('refused');
        });
      });
    };
    const stale = staleOn(client, topic);
    if (stale.length === 0) create();
    else Promise.all(stale.map((existing) => client.removeChannel(existing))).then(create, create);
  });
}

// Where the club's live channels stand, as far as this device can tell: can a member join
// a members-only channel, and does the project still take open ones. One after the other,
// each on a topic of its own that nothing else uses.
export async function testLiveChannels(client, options) {
  const membersOnly = await tryJoin(client, CHECK_TOPIC, true, options);
  const open = await tryJoin(client, OPEN_CHECK_TOPIC, false, options);
  return { membersOnly, open };
}

// One word for the two answers together, for the admin page and Home's reminder:
//   'closed'    members-only works and open channels are refused — only members get in;
//   'open'      members-only works but open channels are still accepted: safe to turn them off;
//   'not-ready' members-only is refused here, so the app is leaning on open channels — do
//               NOT turn them off;
//   'broken'    both refused: nobody's live updates work until the rules are in place;
//   'unknown'   couldn't be told (no connection).
export function liveChannelVerdict(result) {
  const membersOnly = result?.membersOnly?.outcome;
  const open = result?.open?.outcome;
  if (membersOnly === 'joined' && open === 'refused') return 'closed';
  if (membersOnly === 'joined' && open === 'joined') return 'open';
  if (membersOnly === 'refused' && open === 'joined') return 'not-ready';
  if (membersOnly === 'refused' && open === 'refused') return 'broken';
  return 'unknown';
}

// Home reminds the admin while open channels are still accepted, and asking means two joins,
// so the answer is kept for a day on the device that asked. Only the verdict is kept.
const REMEMBER_KEY = 'fishyfriends:live-channels';
const REMEMBER_MS = 24 * 60 * 60 * 1000;

export function recallLiveVerdict(storage, now = Date.now()) {
  try {
    const saved = JSON.parse(storage.getItem(REMEMBER_KEY) || 'null');
    if (!saved || typeof saved.verdict !== 'string' || typeof saved.at !== 'number') return null;
    if (now - saved.at > REMEMBER_MS || saved.at > now) return null;
    return saved.verdict;
  } catch (problem) {
    return null;
  }
}

export function rememberLiveVerdict(storage, verdict, now = Date.now()) {
  try {
    // "Couldn't tell" is not worth a day's silence: it is asked again next time.
    if (verdict === 'unknown') storage.removeItem(REMEMBER_KEY);
    else storage.setItem(REMEMBER_KEY, JSON.stringify({ verdict, at: now }));
  } catch (problem) {
    // Storage that is full or refused: the question is just asked again next time.
  }
}

// Stored photos are shown through signed links, not through the address in the database.
//
// What the database holds for a photo is its "public" address:
//   https://<project>/storage/v1/object/public/<bucket>/<owner id>/<file>?v=<stamp>
// which opens for anyone who has it, signed in or not, for as long as the bucket is public —
// and until November 2026 every one of those addresses could be listed by anyone. A signed
// link is the same file behind a token that only a member can ask for and that runs out, so
// once the admin makes the photo buckets private (migration 0043's switch) the old addresses
// are dead and the photos still show. The app asks for signed links whether or not the
// buckets are private yet, so flipping the switch changes nothing on a phone running this
// version.
//
// A link is kept (in memory and in localStorage) and reused until its last day, rather than
// asked for on every visit: the browser can only reuse a photo it already downloaded if the
// address is the same one, and catch photos are megabytes each.

export const PHOTO_BUCKETS = ['photos', 'avatars', 'personal-bests', 'fish-year-catches', 'tournament-entries', 'trip-catches'];
export const PHOTO_LINK_SECONDS = 7 * 24 * 60 * 60;
const RENEW_WITHIN_MS = 24 * 60 * 60 * 1000;
const STORE_KEY = 'fishy-photo-links';
const KEEP_AT_MOST = 500;
const BATCH = 100;

// { bucket, path, version } for an address in one of this project's photo buckets, else null.
export function parseStoredPhoto(value, projectUrl) {
  if (typeof value !== 'string' || !value || !projectUrl) return null;
  let url;
  let project;
  try { url = new URL(value); project = new URL(projectUrl); } catch { return null; }
  if (url.origin !== project.origin) return null;
  const match = url.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match || !PHOTO_BUCKETS.includes(match[1])) return null;
  let path;
  try { path = decodeURIComponent(match[2]); } catch { return null; }
  if (path.split('/').some((part) => part === '' || part === '.' || part === '..')) return null;
  return { bucket: match[1], path, version: url.searchParams.get('v') || '' };
}

// 'stored': one of ours, shown through a signed link. 'plain': something the page itself made
// or ships (a preview of a file just chosen, bundled art) — shown as it is. 'foreign': an
// address somewhere else. Nothing the app writes is one, so it is somebody's attempt to make
// every member's browser call a server of their choosing, and it is never requested.
// The browser's own reading of the address decides, not a pattern: it trims spaces, treats a
// backslash as a slash and drops tabs and newlines out of a scheme, and each of those is a way
// past a check that only looked at how the text starts.
export function photoKind(value, projectUrl) {
  if (typeof value !== 'string' || !value) return 'plain';
  if (!projectUrl) return 'plain';
  if (parseStoredPhoto(value, projectUrl)) return 'stored';
  let url;
  try { url = new URL(value, window.location.href); } catch { return 'foreign'; }
  if (url.protocol === 'blob:') return 'plain';
  if (url.protocol === 'data:') return /^image\//i.test(url.pathname) ? 'plain' : 'foreign';
  return url.origin === window.location.origin ? 'plain' : 'foreign';
}

function browserStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

// `sign(bucket, paths)` resolves to [{ path, signedUrl }] (what supabase-js's createSignedUrls
// returns as `data`); anything it couldn't sign is simply missing or has no signedUrl.
export function createPhotoLinker({ projectUrl, sign, storage = browserStorage(), now = () => Date.now(), wait = 12 }) {
  const cache = new Map();
  const pending = new Map();
  let queue = [];
  let timer = null;
  // Whose links these are. What was saved belongs to whoever was signed in when it was
  // saved, and is dropped the moment the account at this browser is someone else (or nobody).
  let owner = null;

  try {
    const saved = JSON.parse(storage?.getItem(STORE_KEY) || 'null');
    if (saved && saved.project === projectUrl && typeof saved.owner === 'string' && Array.isArray(saved.links)) {
      owner = saved.owner;
      saved.links.forEach(([stored, url, until]) => {
        if (typeof stored === 'string' && typeof url === 'string' && until > now()) cache.set(stored, { url, until });
      });
    }
  } catch { /* a cache that can't be read is an empty cache */ }

  function save() {
    try {
      if (!owner) { storage?.removeItem(STORE_KEY); return; }
      const links = [...cache].map(([stored, { url, until }]) => [stored, url, until]).sort((a, b) => b[2] - a[2]).slice(0, KEEP_AT_MOST);
      storage?.setItem(STORE_KEY, JSON.stringify({ project: projectUrl, owner, links }));
    } catch { /* private mode or a full disk: the links still work for this visit */ }
  }

  function peek(stored) {
    const hit = cache.get(stored);
    return hit && hit.until - now() > RENEW_WITHIN_MS ? hit.url : null;
  }

  async function flush() {
    timer = null;
    const asked = queue;
    queue = [];
    const byBucket = new Map();
    asked.forEach((item) => {
      if (!byBucket.has(item.parsed.bucket)) byBucket.set(item.parsed.bucket, []);
      byBucket.get(item.parsed.bucket).push(item);
    });
    await Promise.all([...byBucket].map(async ([bucket, items]) => {
      const paths = [...new Set(items.map((item) => item.parsed.path))];
      const signed = new Map();
      for (let start = 0; start < paths.length; start += BATCH) {
        try {
          const rows = await sign(bucket, paths.slice(start, start + BATCH));
          (Array.isArray(rows) ? rows : []).forEach((row) => { if (row && row.path && row.signedUrl) signed.set(row.path, row.signedUrl); });
        } catch { /* these simply come back unsigned */ }
      }
      const answers = items.map(({ stored, parsed }) => {
        const link = signed.get(parsed.path);
        if (!link) return null;
        const url = parsed.version ? `${link}${link.includes('?') ? '&' : '?'}v=${encodeURIComponent(parsed.version)}` : link;
        cache.set(stored, { url, until: now() + PHOTO_LINK_SECONDS * 1000 });
        return url;
      });
      save();
      // Settled before anyone is told: whoever asks again in the same breath gets the cache
      // (or a fresh request), never this finished one.
      items.forEach(({ stored, done }, index) => { pending.delete(stored); done(answers[index]); });
    }));
  }

  // The signed link for a stored address, or null when it can't be signed (signed out, not a
  // member, the file is gone). Calls made in the same moment go out as one request a bucket.
  function resolve(stored) {
    const cached = peek(stored);
    if (cached) return Promise.resolve(cached);
    const parsed = parseStoredPhoto(stored, projectUrl);
    if (!parsed) return Promise.resolve(null);
    if (pending.has(stored)) return pending.get(stored);
    const promise = new Promise((done) => { queue.push({ stored, parsed, done }); });
    pending.set(stored, promise);
    if (!timer) timer = setTimeout(flush, wait);
    return promise;
  }

  return {
    kind: (value) => photoKind(value, projectUrl),
    peek,
    resolve,
    // A link that stopped working (run out early, or the file was replaced): ask again.
    forget(stored) { if (cache.delete(stored)) save(); },
    // Who is signed in now (null for nobody). Anyone but the account the links were made for
    // starts with none of them.
    belongTo(accountId) {
      const next = accountId || null;
      if (next === owner) return;
      cache.clear();
      owner = next;
      save();
    },
  };
}

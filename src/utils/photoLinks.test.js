import { createPhotoLinker, parseStoredPhoto, photoKind, PHOTO_LINK_SECONDS } from './photoLinks';

const PROJECT = 'https://abc.supabase.co';
const stored = (bucket, path, version = '') => `${PROJECT}/storage/v1/object/public/${bucket}/${path}${version ? `?v=${version}` : ''}`;
const DAY = 24 * 60 * 60 * 1000;

function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
    items,
  };
}

function makeLinker(options = {}) {
  let time = options.start || 1_000_000_000_000;
  const sign = options.sign || jest.fn(async (bucket, paths) => paths.map((path) => ({ path, signedUrl: `${PROJECT}/storage/v1/object/sign/${bucket}/${path}?token=t${sign.mock.calls.length}` })));
  const storage = options.storage || fakeStorage();
  const linker = createPhotoLinker({ projectUrl: PROJECT, sign, storage, now: () => time, wait: 0 });
  return { linker, sign, storage, advance: (ms) => { time += ms; } };
}

describe('parseStoredPhoto', () => {
  test('reads the bucket, the path and the cache stamp out of a stored address', () => {
    expect(parseStoredPhoto(stored('fish-year-catches', 'user-1/striped-bass-17.jpg', '1731'), PROJECT))
      .toEqual({ bucket: 'fish-year-catches', path: 'user-1/striped-bass-17.jpg', version: '1731' });
    expect(parseStoredPhoto(stored('avatars', 'user-1/avatar.png'), PROJECT)).toEqual({ bucket: 'avatars', path: 'user-1/avatar.png', version: '' });
  });

  test('decodes a path the way storage will be asked for it', () => {
    expect(parseStoredPhoto(stored('photos', 'old/summer%20trip.jpg'), PROJECT).path).toBe('old/summer trip.jpg');
  });

  test('is not fooled by another project, another bucket, or a path that climbs out', () => {
    expect(parseStoredPhoto('https://other.supabase.co/storage/v1/object/public/avatars/u/a.jpg', PROJECT)).toBeNull();
    expect(parseStoredPhoto(stored('fishing-licenses', 'user-2/license.pdf'), PROJECT)).toBeNull();
    expect(parseStoredPhoto(`${PROJECT}/storage/v1/object/public/avatars/%2E%2E/fishing-licenses/user-2/license.pdf`, PROJECT)).toBeNull();
    expect(parseStoredPhoto(`${PROJECT}/storage/v1/object/public/avatars//a.jpg`, PROJECT)).toBeNull();
    expect(parseStoredPhoto(`${PROJECT}/rest/v1/profiles`, PROJECT)).toBeNull();
    expect(parseStoredPhoto('not a url', PROJECT)).toBeNull();
    expect(parseStoredPhoto('', PROJECT)).toBeNull();
    expect(parseStoredPhoto(stored('avatars', 'u/a.jpg'), '')).toBeNull();
  });
});

describe('photoKind', () => {
  test('a stored photo is signed; a preview or bundled art is shown as it is', () => {
    expect(photoKind(stored('avatars', 'u/a.jpg'), PROJECT)).toBe('stored');
    expect(photoKind('blob:https://www.fishyfriends.club/1234', PROJECT)).toBe('plain');
    expect(photoKind('data:image/png;base64,AAAA', PROJECT)).toBe('plain');
    expect(photoKind('/static/media/trout.png', PROJECT)).toBe('plain');
    expect(photoKind('static/media/trout.png', PROJECT)).toBe('plain');
  });

  test('an address somewhere else is foreign, however it is dressed', () => {
    expect(photoKind('https://elsewhere.example/track.gif', PROJECT)).toBe('foreign');
    expect(photoKind('//elsewhere.example/track.gif', PROJECT)).toBe('foreign');
    expect(photoKind('http://elsewhere.example/a.jpg', PROJECT)).toBe('foreign');
    expect(photoKind('data:text/html,<script>1</script>', PROJECT)).toBe('foreign');
    expect(photoKind('javascript:alert(1)', PROJECT)).toBe('foreign');
    // The forms a check on "how the text starts" would wave through.
    expect(photoKind('  https://elsewhere.example/track.gif', PROJECT)).toBe('foreign');
    expect(photoKind('\\\\elsewhere.example\\track.gif', PROJECT)).toBe('foreign');
    expect(photoKind('ht\ntps://elsewhere.example/track.gif', PROJECT)).toBe('foreign');
    expect(photoKind('/\\elsewhere.example/track.gif', PROJECT)).toBe('foreign');
    // In the project, but not a photo bucket: never signed, never requested.
    expect(photoKind(stored('fishing-licenses', 'user-2/license.pdf'), PROJECT)).toBe('foreign');
  });

  test('with no project configured nothing is judged', () => {
    expect(photoKind('https://example.com/photo.jpg', '')).toBe('plain');
  });
});

describe('createPhotoLinker', () => {
  test('signs a stored address and hands the same link back until its last day', async () => {
    const { linker, sign, advance } = makeLinker();
    const address = stored('avatars', 'user-1/avatar.jpg');
    expect(linker.peek(address)).toBeNull();
    const first = await linker.resolve(address);
    expect(first).toBe(`${PROJECT}/storage/v1/object/sign/avatars/user-1/avatar.jpg?token=t1`);
    expect(sign).toHaveBeenCalledWith('avatars', ['user-1/avatar.jpg']);

    advance(5 * DAY);
    expect(linker.peek(address)).toBe(first);
    expect(await linker.resolve(address)).toBe(first);
    expect(sign).toHaveBeenCalledTimes(1);

    // Inside its last day the link is asked for again, before it can run out on screen.
    advance(1.5 * DAY);
    expect(linker.peek(address)).toBeNull();
    expect(await linker.resolve(address)).not.toBe(first);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(PHOTO_LINK_SECONDS).toBe(7 * 24 * 60 * 60);
  });

  test('a page of photos goes out as one request a bucket, each path once', async () => {
    const { linker, sign } = makeLinker();
    const results = await Promise.all([
      linker.resolve(stored('fish-year-catches', 'user-1/a.jpg')),
      linker.resolve(stored('fish-year-catches', 'user-2/b.jpg')),
      linker.resolve(stored('fish-year-catches', 'user-1/a.jpg')),
      linker.resolve(stored('avatars', 'user-2/avatar.jpg')),
    ]);
    expect(sign).toHaveBeenCalledTimes(2);
    expect(sign).toHaveBeenCalledWith('fish-year-catches', ['user-1/a.jpg', 'user-2/b.jpg']);
    expect(sign).toHaveBeenCalledWith('avatars', ['user-2/avatar.jpg']);
    expect(results[0]).toBe(results[2]);
    expect(results[3]).toContain('/object/sign/avatars/user-2/avatar.jpg');
  });

  test('keeps the cache stamp, so a replaced avatar is fetched fresh', async () => {
    const { linker, sign } = makeLinker();
    const before = await linker.resolve(stored('avatars', 'user-1/avatar.jpg', '100'));
    const after = await linker.resolve(stored('avatars', 'user-1/avatar.jpg', '200'));
    expect(before).toMatch(/\?token=t1&v=100$/);
    expect(after).toMatch(/\?token=t2&v=200$/);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  test('what could not be signed comes back null, and is not remembered as a link', async () => {
    const sign = jest.fn(async (bucket, paths) => paths.map((path) => ({ path, signedUrl: path.includes('gone') ? null : `${PROJECT}/storage/v1/object/sign/${bucket}/${path}?token=ok`, error: path.includes('gone') ? 'not found' : null })));
    const { linker } = makeLinker({ sign });
    const [gone, here] = await Promise.all([linker.resolve(stored('avatars', 'user-1/gone.jpg')), linker.resolve(stored('avatars', 'user-1/here.jpg'))]);
    expect(gone).toBeNull();
    expect(here).toContain('token=ok');
    expect(linker.peek(stored('avatars', 'user-1/gone.jpg'))).toBeNull();
  });

  test('a request that throws leaves every photo unsigned rather than hanging', async () => {
    const { linker } = makeLinker({ sign: jest.fn().mockRejectedValue(new Error('offline')) });
    expect(await linker.resolve(stored('avatars', 'user-1/avatar.jpg'))).toBeNull();
  });

  test('never signs what is not a stored photo', async () => {
    const { linker, sign } = makeLinker();
    expect(await linker.resolve('https://elsewhere.example/track.gif')).toBeNull();
    expect(await linker.resolve(stored('fishing-licenses', 'user-2/license.pdf'))).toBeNull();
    expect(sign).not.toHaveBeenCalled();
    expect(linker.kind('https://elsewhere.example/track.gif')).toBe('foreign');
  });

  test('forget drops a link that stopped working, so the next ask signs again', async () => {
    const { linker, sign } = makeLinker();
    const address = stored('avatars', 'user-1/avatar.jpg');
    const first = await linker.resolve(address);
    linker.forget(address);
    expect(linker.peek(address)).toBeNull();
    expect(await linker.resolve(address)).not.toBe(first);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  test('links are saved for the account they were made for and picked up on the next visit', async () => {
    const storage = fakeStorage();
    const first = makeLinker({ storage });
    first.linker.belongTo('user-1');
    const address = stored('avatars', 'user-2/avatar.jpg');
    const link = await first.linker.resolve(address);

    const second = makeLinker({ storage });
    second.linker.belongTo('user-1');
    expect(second.linker.peek(address)).toBe(link);
    expect(await second.linker.resolve(address)).toBe(link);
    expect(second.sign).not.toHaveBeenCalled();
  });

  test('a different account at the same browser, or nobody, starts with none of them', async () => {
    const storage = fakeStorage();
    const first = makeLinker({ storage });
    first.linker.belongTo('user-1');
    const address = stored('avatars', 'user-2/avatar.jpg');
    await first.linker.resolve(address);

    const other = makeLinker({ storage });
    other.linker.belongTo('user-9');
    expect(other.linker.peek(address)).toBeNull();

    const signedOut = makeLinker({ storage });
    signedOut.linker.belongTo(null);
    expect(signedOut.linker.peek(address)).toBeNull();
    expect([...storage.items.keys()]).toEqual([]);
  });

  test('signing out forgets the links held in memory too', async () => {
    const { linker } = makeLinker();
    linker.belongTo('user-1');
    const address = stored('avatars', 'user-2/avatar.jpg');
    await linker.resolve(address);
    linker.belongTo(null);
    expect(linker.peek(address)).toBeNull();
  });

  test('saved links that have run out, or were saved for another project, are not used', async () => {
    const storage = fakeStorage();
    const first = makeLinker({ storage });
    first.linker.belongTo('user-1');
    const address = stored('avatars', 'user-2/avatar.jpg');
    await first.linker.resolve(address);

    const later = makeLinker({ storage, start: 1_000_000_000_000 + 8 * DAY });
    later.linker.belongTo('user-1');
    expect(later.linker.peek(address)).toBeNull();

    const elsewhere = createPhotoLinker({ projectUrl: 'https://other.supabase.co', sign: jest.fn(), storage, now: () => 1_000_000_000_000, wait: 0 });
    elsewhere.belongTo('user-1');
    expect(elsewhere.peek(address)).toBeNull();
  });

  test('storage that throws or holds rubbish is an empty cache, not a crash', async () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('denied'); } };
    const { linker } = makeLinker({ storage: broken });
    linker.belongTo('user-1');
    expect(await linker.resolve(stored('avatars', 'user-1/avatar.jpg'))).toContain('/object/sign/');
    const rubbish = makeLinker({ storage: fakeStorage({ 'fishy-photo-links': '{not json' }) });
    expect(rubbish.linker.peek(stored('avatars', 'user-1/avatar.jpg'))).toBeNull();
  });
});

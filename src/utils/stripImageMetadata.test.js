import { stripImageMetadata, imageKind } from './stripImageMetadata';

// The package's default entry is an ES module Jest doesn't transform; this is the same library.
const exifr = require('exifr/dist/full.umd.js');

const ascii = (text) => Array.from(text, (character) => character.charCodeAt(0));
const u16le = (value) => [value & 0xff, (value >> 8) & 0xff];
const u32le = (value) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff];
const u32be = (value) => [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
const segment = (marker, payload) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];

// A real EXIF block: orientation 6 (portrait, stored sideways) and a GPS position.
function exifWithGps({ orientation = 6 } = {}) {
  const rational = (numerator, denominator = 1) => [...u32le(numerator), ...u32le(denominator)];
  const entry = (tag, type, count, value) => [...u16le(tag), ...u16le(type), ...u32le(count), ...value];
  const ifd0At = 8;
  const gpsAt = ifd0At + 2 + 2 * 12 + 4;
  const latAt = gpsAt + 2 + 4 * 12 + 4;
  const lngAt = latAt + 24;
  const tiff = [
    ...ascii('II'), ...u16le(42), ...u32le(ifd0At),
    ...u16le(2),
    ...entry(0x0112, 3, 1, [...u16le(orientation), 0, 0]),
    ...entry(0x8825, 4, 1, u32le(gpsAt)),
    ...u32le(0),
    ...u16le(4),
    ...entry(0x0001, 2, 2, [...ascii('N'), 0, 0, 0]),
    ...entry(0x0002, 5, 3, u32le(latAt)),
    ...entry(0x0003, 2, 2, [...ascii('W'), 0, 0, 0]),
    ...entry(0x0004, 5, 3, u32le(lngAt)),
    ...u32le(0),
    ...rational(40), ...rational(26), ...rational(46),
    ...rational(74), ...rational(0), ...rational(21),
  ];
  return segment(0xe1, [...ascii('Exif\0\0'), ...tiff]);
}

const JFIF = segment(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const XMP = segment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPSLatitude="40,26.7N"</x:xmpmeta>'));
const ICC = segment(0xe2, [...ascii('ICC_PROFILE\0'), 1, 1, 9, 9, 9]);
const MPF = segment(0xe2, ascii('MPF\0second image index'));
const IPTC = segment(0xed, ascii('Photoshop 3.0\x008BIM Somewhere Street 12'));
const COMMENT = segment(0xfe, ascii('shot at the secret spot'));
const ADOBE = segment(0xee, [...ascii('Adobe'), 0, 100, 0, 0, 0, 0, 1]);
const DQT = segment(0xdb, [0, ...Array.from({ length: 64 }, (_, index) => index + 1)]);
const SOF = segment(0xc0, [8, 0, 2, 0, 2, 1, 1, 0x11, 0]);
const DHT = segment(0xc4, [0, ...Array(16).fill(0)]);
const SOS = segment(0xda, [1, 1, 0, 0, 63, 0]);
// Entropy-coded data with a stuffed 0xFF, a restart marker and a 0xFF fill before the end.
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0x78];
const EOI = [0xff, 0xd9];
const TRAILER = ascii('ftypmp4 a motion-photo video with its own GPS atom');

function jpeg({ head = [JFIF, exifWithGps(), XMP, ICC, MPF, IPTC, COMMENT, ADOBE, DQT, SOF, DHT], trailer = TRAILER } = {}) {
  return new Uint8Array([0xff, 0xd8, ...head.flat(), ...SOS, ...SCAN, ...EOI, ...trailer]);
}

const includes = (bytes, text) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));

describe('JPEG', () => {
  test('the test photo really carries a position before it is stripped', async () => {
    const gps = await exifr.gps(jpeg());
    expect(gps.latitude).toBeCloseTo(40.446, 2);
    expect(gps.longitude).toBeCloseTo(-74.006, 2);
  });

  test('takes out GPS, XMP, IPTC, comments and anything appended after the image', async () => {
    const original = jpeg();
    const result = stripImageMetadata(original);
    expect(result.kind).toBe('jpeg');
    expect(result.changed).toBe(true);
    expect(await exifr.gps(result.bytes)).toBeUndefined();
    for (const leak of ['xmpmeta', 'GPSLatitude', 'Photoshop', 'Somewhere Street', 'secret spot', 'MPF', 'motion-photo']) {
      expect(includes(result.bytes, leak)).toBe(false);
    }
    expect(Array.from(result.bytes.slice(-2))).toEqual(EOI);
  });

  test('keeps the picture: tables, frame, colour profile and every byte of the scan', () => {
    const result = stripImageMetadata(jpeg());
    const contains = (part) => Buffer.from(result.bytes).includes(Buffer.from(part));
    for (const part of [JFIF, ICC, ADOBE, DQT, SOF, DHT, [...SOS, ...SCAN, ...EOI]]) expect(contains(part)).toBe(true);
  });

  test('keeps which way up it goes, and nothing else from the EXIF', async () => {
    const result = stripImageMetadata(jpeg());
    expect(await exifr.orientation(result.bytes)).toBe(6);
    const parsed = await exifr.parse(result.bytes, { tiff: true, exif: true, gps: true });
    expect(Object.keys(parsed)).toEqual(['Orientation']);
    // JFIF stays first, the orientation block right after it.
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    expect(Array.from(result.bytes.slice(2 + JFIF.length, 2 + JFIF.length + 2))).toEqual([0xff, 0xe1]);
  });

  test('an upright photo gets no EXIF block at all', async () => {
    const result = stripImageMetadata(jpeg({ head: [JFIF, exifWithGps({ orientation: 1 }), DQT, SOF, DHT] }));
    expect(includes(result.bytes, 'Exif')).toBe(false);
    expect(await exifr.parse(result.bytes)).toBeUndefined();
  });

  test('a photo with nothing to remove comes back byte for byte, marked unchanged', () => {
    const clean = jpeg({ head: [JFIF, DQT, SOF, DHT], trailer: [] });
    const result = stripImageMetadata(clean);
    expect(result.changed).toBe(false);
    expect(Array.from(result.bytes)).toEqual(Array.from(clean));
    expect(stripImageMetadata(stripImageMetadata(jpeg()).bytes).changed).toBe(false);
  });

  test('a progressive photo keeps the tables between its scans', () => {
    const progressive = new Uint8Array([0xff, 0xd8, ...JFIF, ...exifWithGps(), ...DQT, ...SOF, ...SOS, ...SCAN, ...DHT, ...SOS, ...SCAN, ...EOI, ...TRAILER]);
    const result = stripImageMetadata(progressive);
    expect(Buffer.from(result.bytes).includes(Buffer.from([...SOS, ...SCAN, ...DHT, ...SOS, ...SCAN, ...EOI]))).toBe(true);
    expect(includes(result.bytes, 'motion-photo')).toBe(false);
  });

  test('a broken or truncated file is refused rather than passed on', () => {
    expect(stripImageMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3, 4, 5, 6]))).toBeNull();
    expect(stripImageMetadata(new Uint8Array([0xff, 0xd8, ...JFIF, ...exifWithGps(), ...EOI]))).toBeNull();
    expect(stripImageMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11]))).toBeNull();
  });
});

describe('PNG', () => {
  const chunk = (type, data = []) => [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const IDAT = chunk('IDAT', [1, 2, 3, 4, 5]);
  const IEND = chunk('IEND');

  test('drops text, EXIF and timestamps and keeps the image and its colour', () => {
    const png = new Uint8Array([
      ...signature, ...IHDR, ...chunk('gAMA', [0, 1, 0x86, 0xa0]), ...chunk('eXIf', ascii('II*\0 GPS here')),
      ...chunk('tEXt', ascii('Location\0Secret cove')), ...chunk('iTXt', ascii('XML:com.adobe.xmp\0GPS')), ...chunk('tIME', [7, 234, 6, 1, 0, 0, 0]),
      ...chunk('prVt', ascii('unknown ancillary')), ...IDAT, ...IEND, ...ascii('appended junk'),
    ]);
    const result = stripImageMetadata(png);
    expect(result.kind).toBe('png');
    expect(result.changed).toBe(true);
    for (const leak of ['GPS', 'Secret cove', 'tIME', 'prVt', 'appended junk']) expect(includes(result.bytes, leak)).toBe(false);
    expect(Array.from(result.bytes)).toEqual([...signature, ...IHDR, ...chunk('gAMA', [0, 1, 0x86, 0xa0]), ...IDAT, ...IEND]);
  });

  test('refuses a PNG that never ends or whose chunk runs past the file', () => {
    expect(stripImageMetadata(new Uint8Array([...signature, ...IHDR, ...IDAT]))).toBeNull();
    expect(stripImageMetadata(new Uint8Array([...signature, ...u32be(9999), ...ascii('IDAT'), 1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe('WebP', () => {
  const chunk = (type, data) => [...ascii(type), ...u32le(data.length), ...data, ...(data.length % 2 ? [0] : [])];
  const riff = (chunks) => { const body = [...ascii('WEBP'), ...chunks.flat()]; return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body]); };
  const VP8X = (flags) => chunk('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const VP8 = chunk('VP8 ', [1, 2, 3, 4, 5]);

  test('drops EXIF and XMP chunks, clears their flags and fixes the size', () => {
    const webp = riff([VP8X(0x2c), chunk('ICCP', [9, 9]), VP8, chunk('EXIF', ascii('II*\0 GPS here')), chunk('XMP ', ascii('<x:xmpmeta/>'))]);
    const result = stripImageMetadata(webp);
    expect(result.kind).toBe('webp');
    expect(Array.from(result.bytes)).toEqual(Array.from(riff([VP8X(0x20), chunk('ICCP', [9, 9]), VP8])));
  });

  test('a plain WebP comes back unchanged', () => {
    const webp = riff([VP8]);
    const result = stripImageMetadata(webp);
    expect(result.changed).toBe(false);
    expect(Array.from(result.bytes)).toEqual(Array.from(webp));
  });
});

test('anything that is not a JPEG, PNG or WebP is not guessed at', () => {
  expect(imageKind(new Uint8Array(ascii('GIF89a plus some more bytes')))).toBeNull();
  expect(stripImageMetadata(new Uint8Array(ascii('%PDF-1.4 a license scan')))).toBeNull();
  expect(stripImageMetadata(new Uint8Array(ascii('bytes')))).toBeNull();
  expect(stripImageMetadata(new Uint8Array(0))).toBeNull();
});

// Takes the metadata out of a photo without touching a pixel.
//
// A phone stamps a photo with where it was taken (GPS, to a few metres), when, and on what;
// the file can also carry a thumbnail of the uncropped original. A catch photo in this app
// would otherwise hand any member the spot — or someone's front door. Re-encoding through a
// canvas (compressImage) drops all of that as a side effect, but the canvas isn't always
// used: when the re-encode comes out larger than the original, or the browser can't draw
// the file. This is what makes "no metadata leaves the device" true in those cases too, and
// what the admin's clean-up runs over photos stored before it existed.
//
// Lossless: segments and chunks are dropped or copied whole, the image data is never
// decoded. The one thing kept from a JPEG's EXIF is its orientation (a portrait photo is
// stored sideways with a "rotate me" flag), rewritten as a minimal EXIF block holding only
// that. Returns null for anything it doesn't recognise or that is malformed — the caller
// decides what an unreadable file means; this never guesses.

const ascii = (text) => Array.from(text, (character) => character.charCodeAt(0));
const startsWith = (bytes, offset, signature) => signature.every((value, index) => bytes[offset + index] === value);

const EXIF = ascii('Exif\0\0');
const ICC = ascii('ICC_PROFILE\0');
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');

export function imageKind(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (startsWith(bytes, 0, PNG_SIGNATURE)) return 'png';
  if (startsWith(bytes, 0, RIFF) && startsWith(bytes, 8, WEBP)) return 'webp';
  return null;
}

export const MIME_FOR_KIND = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function concat(parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

// The Orientation tag (0x0112) from an EXIF segment's payload, or null.
function exifOrientation(bytes, start, end) {
  const tiff = start + EXIF.length;
  if (tiff + 8 > end) return null;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  const big = bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d;
  if (!little && !big) return null;
  const u16 = (at) => (little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at) => (little
    ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
    : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0);
  if (u16(tiff + 2) !== 42) return null;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

// An EXIF segment that says one thing: which way up the picture goes.
function orientationSegment(orientation) {
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22, ...EXIF,
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF, first IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, x1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

function stripJpeg(bytes) {
  const length = bytes.length;
  const head = [];
  let orientation = null;
  let position = 2;
  let reachedScan = false;
  while (position + 4 <= length) {
    if (bytes[position] !== 0xff) return null;
    if (bytes[position + 1] === 0xff) { position += 1; continue; } // fill byte
    const marker = bytes[position + 1];
    if (marker === 0xda) { reachedScan = true; break; }
    if (marker === 0xd9) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { head.push(bytes.subarray(position, position + 2)); position += 2; continue; }
    const size = (bytes[position + 2] << 8) | bytes[position + 3];
    const next = position + 2 + size;
    if (size < 2 || next > length) return null;
    const payload = position + 4;
    const isApp = marker >= 0xe0 && marker <= 0xef;
    let keep = !isApp && marker !== 0xfe; // tables and frame headers stay; comments go
    if (marker === 0xe0 || marker === 0xee) keep = true; // JFIF, Adobe colour transform
    if (marker === 0xe2 && startsWith(bytes, payload, ICC)) keep = true; // colour profile
    if (marker === 0xe1 && startsWith(bytes, payload, EXIF) && orientation === null) orientation = exifOrientation(bytes, payload, next);
    if (keep) head.push(bytes.subarray(position, next));
    position = next;
  }
  if (!reachedScan) return null; // no image data: not something to pass on as a photo

  // The scans: copied whole, up to the end-of-image marker. Anything after it (a motion
  // photo's video, a depth map, a second image) is not the picture and can carry its own
  // location data, so it stops there.
  let cursor = position;
  let end = length;
  while (cursor + 1 < length) {
    if (bytes[cursor] !== 0xff) { cursor += 1; continue; }
    const marker = bytes[cursor + 1];
    if (marker === 0x00 || marker === 0xff || (marker >= 0xd0 && marker <= 0xd7)) { cursor += marker === 0xff ? 1 : 2; continue; }
    if (marker === 0xd9) { end = cursor + 2; break; }
    if (cursor + 4 > length) break;
    const size = (bytes[cursor + 2] << 8) | bytes[cursor + 3];
    if (size < 2) return null;
    cursor += 2 + size; // a scan header, or tables between the scans of a progressive JPEG
  }

  const parts = [bytes.subarray(0, 2)];
  // JFIF wants to be first; orientation goes straight after it (or first, without one).
  let lead = 0;
  while (lead < head.length && head[lead][1] === 0xe0) { parts.push(head[lead]); lead += 1; }
  if (orientation && orientation !== 1) parts.push(orientationSegment(orientation));
  for (let index = lead; index < head.length; index += 1) parts.push(head[index]);
  parts.push(bytes.subarray(position, end));
  return concat(parts);
}

// What a PNG needs to look the same. Text, EXIF and timestamps are not on the list, nor is
// any ancillary chunk this doesn't know; a critical chunk it doesn't know is kept, because
// dropping one of those breaks the picture.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs', 'sPLT', 'hIST', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCV', 'cLLI']);

function stripPng(bytes) {
  const parts = [bytes.subarray(0, 8)];
  let position = 8;
  let ended = false;
  while (position + 12 <= bytes.length) {
    const size = ((bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3]) >>> 0;
    const type = String.fromCharCode(bytes[position + 4], bytes[position + 5], bytes[position + 6], bytes[position + 7]);
    const next = position + 12 + size;
    if (next > bytes.length) return null;
    const critical = bytes[position + 4] >= 0x41 && bytes[position + 4] <= 0x5a;
    if (PNG_KEEP.has(type) || (critical && /^[A-Za-z]{4}$/.test(type))) parts.push(bytes.subarray(position, next));
    position = next;
    if (type === 'IEND') { ended = true; break; }
  }
  return ended ? concat(parts) : null;
}

const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);

function stripWebp(bytes) {
  const parts = [];
  let position = 12;
  while (position + 8 <= bytes.length) {
    const type = String.fromCharCode(bytes[position], bytes[position + 1], bytes[position + 2], bytes[position + 3]);
    const size = (bytes[position + 4] | (bytes[position + 5] << 8) | (bytes[position + 6] << 16) | (bytes[position + 7] << 24)) >>> 0;
    const next = position + 8 + size + (size % 2);
    if (position + 8 + size > bytes.length) return null;
    if (WEBP_KEEP.has(type)) {
      const chunk = bytes.slice(position, Math.min(next, bytes.length));
      // The header's "has EXIF" and "has XMP" flags have to go with the chunks.
      if (type === 'VP8X' && size >= 1) chunk[8] &= ~0x0c;
      parts.push(chunk.length % 2 ? concat([chunk, new Uint8Array(1)]) : chunk);
    }
    position = next;
  }
  if (!parts.length) return null;
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(RIFF, 0);
  const riffSize = body.length + 4;
  header[4] = riffSize & 0xff; header[5] = (riffSize >>> 8) & 0xff; header[6] = (riffSize >>> 16) & 0xff; header[7] = (riffSize >>> 24) & 0xff;
  header.set(WEBP, 8);
  return concat([header, body]);
}

// { kind, bytes, changed } for a JPEG, PNG or WebP; null for anything else or a broken file.
export function stripImageMetadata(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const kind = imageKind(bytes);
  if (!kind) return null;
  const stripped = kind === 'jpeg' ? stripJpeg(bytes) : kind === 'png' ? stripPng(bytes) : stripWebp(bytes);
  if (!stripped) return null;
  const changed = stripped.length !== bytes.length || stripped.some((value, index) => value !== bytes[index]);
  return { kind, bytes: stripped, changed };
}

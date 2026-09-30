// Reading the game's pixel art off disk in a test, with no image library: jsdom has no canvas, so
// the only way a test sees what a sprite actually looks like is to decode the PNG itself. This is
// the minimal decoder for what the art pipeline (scripts/pixelGrid.mjs, scripts/petSlice.mjs,
// scripts/png.mjs) writes — 8-bit RGBA or RGB, non-interlaced — and the measurements the one-pixel
// art direction is judged on: hard alpha, the world's keyline, the palette.
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

export const KEYLINE = [0x13, 0x0f, 0x0c];

export function readPng(file) {
  const buf = readFileSync(file);
  let pos = 8; const idat = []; let w = 0, h = 0, depth = 0, ct = 0;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (depth !== 8 || (ct !== 6 && ct !== 2)) throw new Error(`${file}: unsupported png depth=${depth} ct=${ct}`);
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const ft = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? line[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x += 1) {
      out[(y * w + x) * 4] = line[x * bpp]; out[(y * w + x) * 4 + 1] = line[x * bpp + 1]; out[(y * w + x) * 4 + 2] = line[x * bpp + 2];
      out[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width: w, height: h, data: out };
}

const hex = (d, i) => [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');

// What the art direction measures on one image (or one window of it).
export function measure(img, { x0 = 0, y0 = 0, w = img.width, h = img.height } = {}) {
  const { data, width } = img;
  const on = (x, y) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h && data[(y * width + x) * 4 + 3] > 0;
  const colors = new Map();
  let soft = 0, drawn = 0, edge = 0, edgeKey = 0, strayDark = 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -1, by1 = -1;
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) {
    const i = (y * width + x) * 4;
    const a = data[i + 3];
    if (a > 0 && a < 255) soft += 1;
    if (!a) continue;
    drawn += 1;
    bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
    const c = hex(data, i);
    colors.set(c, (colors.get(c) || 0) + 1);
    const isKey = c === '130f0c';
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (!isKey && lum < 30) strayDark += 1;
    if (!on(x + 1, y) || !on(x - 1, y) || !on(x, y + 1) || !on(x, y - 1)) { edge += 1; if (isKey) edgeKey += 1; }
  }
  return {
    drawn, soft, colors, strayDark,
    edgeKeyShare: edge ? edgeKey / edge : 1,
    box: drawn ? { x0: bx0 - x0, y0: by0 - y0, x1: bx1 - x0 + 1, y1: by1 - y0 + 1 } : null,
  };
}

// The most common drawn colour that is not the keyline.
export function mainColour(stats) {
  return [...stats.colors.entries()].filter(([c]) => c !== '130f0c').sort((a, b) => b[1] - a[1])[0][0];
}

// Mean HSV saturation of the drawn pixels that are not the keyline.
export function saturation(img) {
  let s = 0, n = 0;
  for (let i = 0; i < img.width * img.height; i += 1) {
    if (!img.data[i * 4 + 3]) continue;
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    if (r === 0x13 && g === 0x0f && b === 0x0c) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx) { s += (mx - mn) / mx; n += 1; }
  }
  return n ? s / n : 0;
}

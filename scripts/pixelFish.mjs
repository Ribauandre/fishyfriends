// The in-game pixel variant of every sticker in src/assets/fish, and of the game's logo.
//
// The stickers are 900-pixel smooth paintings with a neon die-cut border. Site-wide they stay
// that way, but on the stage everything else is pixel art on one grid — one art pixel is ART_PX
// (4/3) painting units, on the angler, the dog, the dock and the painting behind them — and a
// sticker revealed there read as a glossy decal pasted over the game, its detail five times
// finer than anything round it. So each sticker gets a pixel variant at the world's art pixel:
// fitted inside a 120 x 72 box (160 x 96 painting units, drawn one file pixel to one art pixel),
// in the same structure as the sticker, one art pixel each — the keyline, the neon ring
// (#e3fb14 exactly) and an outer keyline so it sits in the world the way the angler does — a
// flat palette of about twenty colours and hard alpha. What it does, in order:
//
//   - keeps the largest piece (all pieces with keepAll) at alpha >= 128
//   - strips the sticker's own border: a flood from the transparent ground through neon-ish
//     pixels (hue 38-100, any shade of the lime/olive/gold the waves drew) no deeper than the
//     border's measured thickness plus four, then its black keyline, as deep as the bands under
//     the border are mostly dark (at most seven pixels at 900 wide). What is left is the body;
//     the pixel keyline goes round that, which comes out the width of the sticker's own line
//   - smooths the body with a per-channel median about a quarter of an art pixel across, which
//     takes the engraving's hatching out and keeps a stripe or a spot
//   - lays the art grid over it at the phase where the body's edge falls on cell edges most,
//     averages each cell, and lets a cell that is darker or lighter than all four neighbours keep
//     its own darkest or lightest quarter (a spot, the end of a stripe), then a little unsharp on
//     lightness and a little more colour, as averaging dulls both
//   - quantises to eighteen colours by k-means in OKLab (farthest-first, so a rare colour — a
//     red gill, an orange eye — gets a centre) and smooths the labels, a pixel paying for each
//     neighbour it disagrees with, which flattens texture into blocks without eating lines
//   - draws the eye again (below): at this size the painted eye averages into its surroundings
//   - rings: the keyline round the body (four-neighbour, so every ring is one pixel and
//     eight-connected), then the neon, then the outer keyline; a thin part whose body the
//     stripped keyline took (a barbel, a bill's tip, a slime drip) stays as a keyline stroke
//
// The eye is a dark disc with something lighter all the way round it. Every centre in the front
// of the fish is tried at a range of sizes and scored by the ring's dimmest ray against the
// disc's median, times how round the dark is, how high on the head it sits, how far from the
// snout's tip, and how much the ring is a colour of its own (an iris) rather than the skin beyond
// it — a spot on the flank is a dark disc on skin, and the skin runs straight on past the ring.
// A socket drawn in rings can win as one big eye, so the pupil is the best good disc inside it.
// It is stamped at its own size: a round iris at least a pixel all round, lifted to at least
// 0.7 OKLab lightness so it reads on any head, a pupil in the keyline colour with a catchlight
// on one of two pixels or more, and a keyline round the iris (all the way round from four
// pixels up; smaller, only where the iris would run into what is round it). The rules find
// the eye on all but a handful; OVERRIDES carries those (eyeNear, a point read off the sticker;
// eyeAt, the eye itself, for two flatfish whose eyes are dark rings on dark skin) and the three
// that face left.
//
// `node scripts/pixelFish.mjs [key ...]` writes src/assets/fish/pixel/<key>.png for every
// sticker (or the ones named) and regenerates src/assets/fish/pixel/index.js, the manifest
// FishIllustration loads (each file and its native size), and sizes.json, the sizes alone,
// which it reads up front. `node scripts/pixelFish.mjs --logo`
// writes src/assets/props/logo_pixel.png from art/logo/logo.png, which is logo.webp decoded
// losslessly (this script is pure Node on png.mjs and reads no webp); its border fills the gaps
// between the letters, the fish and the plank, so there it is drawn as the neon ring itself
// (backing) rather than as a lime fill inside a keyline. PIXEL_OUT writes somewhere else to
// look at first. Deterministic: the same stickers give the same files.
import { readPng, writePng } from './png.mjs';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import zlib from 'node:zlib';

const ROOT = new URL('../', import.meta.url).pathname;
const FISH = `${ROOT}src/assets/fish/`;
const OUT = process.env.PIXEL_OUT || `${FISH}pixel/`;

// The world's keyline: the angler's own near-black (#130f0c, KEYLINE in anglerSprites once his
// strips are on the art grid), and the site's neon.
export const KEYLINE = [19, 15, 12];
export const NEON = [227, 251, 20];
export const BOX = [120, 72];
export const JUNK = ['stick', 'boot', 'plate', 'bottle'];

// Per-sticker settings the rules cannot find for themselves.
export const OVERRIDES = {
  blackdrum: { head: 'left' },
  roosterfish: { head: 'left' },
  yellowfintuna: { head: 'left' },
  // the rules take a spot, the mouth or a gill for these; the eye is near here
  barracuda: { eyeNear: [685, 110] },
  bowfin: { eyeNear: [802, 147] },
  crappie: { eyeNear: [757, 289] },
  giantseabass: { eyeNear: [744, 185] },
  lingcod: { eyeNear: [713, 128] },
  makoshark: { eyeNear: [732, 188] },
  pike: { eyeNear: [772, 148] },
  sailfish: { eyeNear: [588, 225] },
  sierra: { eyeNear: [777, 181] },
  yellowperch: { eyeNear: [780, 266] },
  // flatfish eyes drawn as dark rings on dark skin: measured off the sticker instead
  californiahalibut: { eyeAt: { cx: 802, cy: 257, rp: 8, ri: 14, iris: [200, 170, 110] } },
  winterflounder: { eyeAt: { cx: 792, cy: 267, rp: 8, ri: 14, iris: [190, 160, 110] } },
  // the posterized trout: its dense spots averaged into a speckle; drawn one pixel each instead
  // (and its yellow iris lost in a yellow head, so the eye is given a paler one)
  trout: { spots: {}, median: 3, lambda: 0.006, eyeAt: { cx: 773, cy: 121, rp: 6, ri: 11.5, iris: [252, 240, 180] } },
};
export const LOGO = { box: [150, 200], backing: true, eyeNear: [561, 365], K: 18 };

// ---------------------------------------------------------------- reading
// png.mjs reads 8-bit RGB/RGBA; trout.png is an 8-bit palette PNG, so that one case is decoded here.
export function readAnyPng(file) {
  try { return readPng(file); } catch (err) {
    if (!/unsupported/.test(String(err))) throw err;
  }
  const buf = readFileSync(file);
  let pos = 8; const idat = []; let w = 0, h = 0, depth = 0, ct = 0, plte = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; }
    else if (type === 'PLTE') plte = data; else if (type === 'tRNS') trns = data; else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  if (ct !== 3 || depth !== 8) throw new Error(`${file}: unsupported png depth=${depth} ct=${ct}`);
  const raw = zlib.inflateSync(Buffer.concat(idat)); const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(w);
  for (let y = 0; y < h; y += 1) {
    const ft = raw[y * (w + 1)]; const line = Buffer.from(raw.subarray(y * (w + 1) + 1, (y + 1) * (w + 1)));
    for (let i = 0; i < w; i += 1) {
      const a = i ? line[i - 1] : 0, b = prev[i], c = i ? prev[i - 1] : 0; let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x += 1) { const k = line[x]; const o = (y * w + x) * 4; out[o] = plte[k * 3]; out[o + 1] = plte[k * 3 + 1]; out[o + 2] = plte[k * 3 + 2]; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
    prev = line;
  }
  return { width: w, height: h, data: out };
}

// ---------------------------------------------------------------- colour
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const gam = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
export function toLab([r, g, b]) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function toRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255];
}
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// ---------------------------------------------------------------- masks
function components(mask, w, h) {
  const lab = new Int32Array(w * h); const sizes = [0]; const stack = [];
  for (let i = 0; i < w * h; i += 1) {
    if (!mask[i] || lab[i]) continue; const id = sizes.length; let n = 0; lab[i] = id; stack.push(i);
    while (stack.length) {
      const p = stack.pop(); n += 1; const px = p % w, py = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx; if (mask[q] && !lab[q]) { lab[q] = id; stack.push(q); }
      }
    }
    sizes.push(n);
  }
  return { lab, sizes };
}
// Chamfer distance, inside `mask`, to the nearest pixel outside it (the image edge is not "outside").
function distIn(mask, w, h) {
  const INF = 1e9, S = Math.SQRT2; const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) d[i] = mask[i] ? INF : 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x; if (!d[i]) continue; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 1);
    if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + S); if (x < w - 1) v = Math.min(v, d[i - w + 1] + S); }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y -= 1) for (let x = w - 1; x >= 0; x -= 1) {
    const i = y * w + x; if (!d[i]) continue; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
    if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + S); if (x > 0) v = Math.min(v, d[i + w - 1] + S); }
    d[i] = v;
  }
  return d;
}

// ---------------------------------------------------------------- the sticker's own border
const neonish = (r, g, b) => { const [h, s, v] = hsv(r, g, b); return h >= 38 && h <= 100 && s >= 0.35 && v >= 0.4; };

function stripBorder(img, on, opts = {}) {
  const { width: w, height: h, data } = img; const N = w * h;
  const d = distIn(on, w, h);
  // how thick the border runs: the distance band where the neon share first drops below a half
  const B = 40; const tot = new Array(B).fill(0), neon = new Array(B).fill(0);
  for (let i = 0; i < N; i += 1) {
    if (!on[i]) continue; const k = Math.min(B - 1, Math.floor(d[i] - 0.5)); tot[k] += 1;
    if (neonish(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) neon[k] += 1;
  }
  let t50 = 0; while (t50 < B && (neon[t50] / Math.max(1, tot[t50]) >= 0.5 || (t50 === 0 && neon[1] / Math.max(1, tot[1]) >= 0.5))) t50 += 1;
  const cap = t50 + 4;
  // flood from the transparent ground through neon (or soft-alpha) pixels, no deeper than cap
  const border = new Uint8Array(N); const stack = [];
  for (let i = 0; i < N; i += 1) if (on[i] && d[i] <= 1.5) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
    if (a < 250 || neonish(r, g, b) || t50 === 0) { border[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const p = stack.pop(); const px = p % w, py = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
      const q = qy * w + qx; if (!on[q] || border[q] || d[q] > cap) continue;
      const r = data[q * 4], g = data[q * 4 + 1], b = data[q * 4 + 2], a = data[q * 4 + 3];
      if (a < 250 || neonish(r, g, b)) { border[q] = 1; stack.push(q); }
    }
  }
  // backing (opts.backing): where a sticker's border fills the gaps between its pieces — the
  // logo's lime ground behind the letters, the fish and the plank — it runs on as far as its own
  // colour does, and is drawn as the neon ring itself, not as a lime fill inside a keyline
  const backing = new Uint8Array(N);
  if (opts.backing) {
    const m = [0, 0, 0]; let n = 0; for (let i = 0; i < N; i += 1) if (border[i] && data[i * 4 + 3] >= 250) { m[0] += data[i * 4]; m[1] += data[i * 4 + 1]; m[2] += data[i * 4 + 2]; n += 1; }
    const mean = toLab(m.map((c) => c / Math.max(1, n)));
    const st = []; for (let i = 0; i < N; i += 1) if (border[i]) st.push(i);
    while (st.length) {
      const p = st.pop(); const px = p % w, py = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const qx = px + dx, qy = py + dy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx; if (!on[q] || border[q] || backing[q]) continue;
        if (d2(toLab([data[q * 4], data[q * 4 + 1], data[q * 4 + 2]]), mean) < 0.06 ** 2) { backing[q] = 1; st.push(q); }
      }
    }
  }
  const s0 = new Uint8Array(N); for (let i = 0; i < N; i += 1) s0[i] = on[i] && !border[i] && !backing[i] ? 1 : 0;
  // the black keyline inside it: bands (from the new edge) that are mostly dark, at most 7 px at 900
  const d0 = distIn(s0, w, h); const dk = new Array(B).fill(0), tk = new Array(B).fill(0);
  for (let i = 0; i < N; i += 1) {
    if (!s0[i]) continue; const k = Math.min(B - 1, Math.floor(d0[i] - 0.5)); tk[k] += 1;
    if (Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 70) dk[k] += 1;
  }
  let kw = 0; while (kw < B && dk[kw] / Math.max(1, tk[kw]) >= 0.5) kw += 1;
  kw = Math.min(kw, Math.round(7 * w / 900));
  return { s0, d0, t50, kw, backing };
}

// ---------------------------------------------------------------- the eye
// An eye is a dark disc with something lighter all the way round it (the iris, or the skin
// round a shark's black eye). Stripes and spots do not pass that: a stripe carries its dark
// on through two sides of the ring. So every centre in the front of the fish is tried at a
// range of sizes, and scored by the ring's darkest eighth minus the disc's median.
const ANGLES = 16;
function findEye(img, body, box, opts) {
  const { width: w, height: h, data } = img; const [bx0, by0, bx1, by1] = box; const L = bx1 - bx0;
  const head = opts.head || 'right';
  const V = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) V[i] = body[i] ? Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255 : -1;
  const at = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= w || yi >= h) return -1; return V[yi * w + xi]; };
  const pix = (x, y) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= w || yi >= h) return null; const i = yi * w + xi; if (!body[i]) return null; return [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]; };
  const [f0, f1] = opts.eyeSpan || (head === 'right' ? [0.55, 1] : [0, 0.45]);
  const xa = bx0 + L * f0, xb = bx0 + L * f1;
  const rmin = Math.max(3, L * 0.0065), rmax = L * (opts.eyeMax || 0.06);
  const radii = []; for (let r = rmin; r <= rmax; r *= 1.12) radii.push(r);
  const cos = [...Array(ANGLES).keys()].map((k) => Math.cos(2 * Math.PI * k / ANGLES)), sin = cos.map((_, k) => Math.sin(2 * Math.PI * k / ANGLES));
  let best = null; const cands = [];
  const step = Math.max(1, Math.round(rmin / 2));
  const near = opts.eyeNear; // [x, y] from a look at the sticker, when the rules pick a spot or the mouth
  const ys = near ? [near[1] - 30, near[1] + 30] : [by0, by1], xs = near ? [near[0] - 30, near[0] + 30] : [xa, xb];
  for (let y = Math.max(0, ys[0]); y <= Math.min(h - 1, ys[1]); y += step) for (let x = Math.max(0, Math.floor(xs[0])); x <= Math.min(w - 1, xs[1]); x += step) {
    if (V[y * w + x] < 0 || V[y * w + x] > 0.45) continue;
    for (const r of radii) {
      // the disc: centre and two inner circles
      const inner = [at(x, y)]; let out = false;
      for (let k = 0; k < ANGLES; k += 2) for (const t of [0.22, 0.42]) { const v = at(x + cos[k] * r * t, y + sin[k] * r * t); if (v < 0) out = true; inner.push(v); }
      if (out) continue; inner.sort((p, q) => p - q); const med = inner[inner.length >> 1]; if (med > 0.4) continue;
      // the ring: along every ray, the brightest point between half the radius and the radius
      // (an iris can be a thin bright line round a big pupil), and the ring is its dimmest ray
      const peaks = []; const ringPts = []; let bad = false;
      for (let k = 0; k < ANGLES && !bad; k += 1) {
        let bv = -1, bt = 0; for (let t = 0.5; t <= 1.001; t += 0.05) { const v = at(x + cos[k] * r * t, y + sin[k] * r * t); if (v < 0) { bad = true; break; } if (v > bv) { bv = v; bt = t; } }
        peaks.push(bv); ringPts.push(bt);
      }
      if (bad) continue;
      const ringMin = Math.min(...peaks); const score = ringMin - med;
      if (score < (near ? 0.1 : 0.22)) continue;
      // round: the dark ends at the same distance every way
      const mid = (med + ringMin) / 2; const ends = [];
      for (let k = 0; k < ANGLES; k += 1) { let t = 0; for (let u = 0; u < r * 0.95; u += 0.5) if (at(x + cos[k] * u, y + sin[k] * u) < mid) t = u; ends.push(t); }
      const em = ends.reduce((a, b) => a + b, 0) / ANGLES; const es = Math.sqrt(ends.reduce((a, b) => a + (b - em) ** 2, 0) / ANGLES);
      const round = em > 0 ? Math.max(0, 1 - es / em / 0.35) : 0; if (round <= 0) continue;
      // high on the head: where the centre sits between the body's top and bottom in this column
      let yt = y, yb = y; while (yt > 0 && body[(yt - 1) * w + x]) yt -= 1; while (yb < h - 1 && body[(yb + 1) * w + x]) yb += 1;
      const rel = (y - yt) / Math.max(1, yb - yt); const high = rel <= 0.5 ? 1 : Math.max(0, 1 - (rel - 0.5) / 0.25);
      // not the snout's tip
      const tip = head === 'right' ? (bx1 - x) / L : (x - bx0) / L; const snout = Math.min(1, tip / 0.035);
      const front = head === 'right' ? (x - bx0) / L : (bx1 - x) / L;
      // an iris: the ring is a colour of its own, not the skin beyond it (a spot on the flank is
      // a dark disc on skin, and the skin runs straight on past the ring)
      const ring = [0, 0, 0], skin = [0, 0, 0]; let nr = 0, ns = 0;
      for (let k = 0; k < ANGLES; k += 1) {
        { const t = ringPts[k]; const q = pix(x + cos[k] * r * t, y + sin[k] * r * t); if (q) { ring[0] += q[0]; ring[1] += q[1]; ring[2] += q[2]; nr += 1; } }
        for (const t of [1.25, 1.5]) { const q = pix(x + cos[k] * r * t, y + sin[k] * r * t); if (q) { skin[0] += q[0]; skin[1] += q[1]; skin[2] += q[2]; ns += 1; } }
      }
      const distinct = nr && ns ? Math.sqrt(d2(toLab(ring.map((c) => c / nr)), toLab(skin.map((c) => c / ns)))) : 0;
      const iris = 0.5 + Math.min(1, distinct / 0.1);
      const s = score * round * (near ? 1 : high * snout) * iris * (0.4 + front) ** 2 * (0.8 + 0.2 * Math.min(1, r / (L * 0.02)));
      if (s <= 0) continue;
      const c = { cx: x, cy: y, r, med, ringMin, score: s };
      if (!best || s > best.score) best = c;
      cands.push(c);
    }
  }
  if (opts.cands) { cands.sort((p, q) => q.score - p.score); const keep = []; for (const c of cands) { if (keep.every((k) => Math.hypot(k.cx - c.cx, k.cy - c.cy) > k.r)) keep.push(c); if (keep.length >= 6) break; } opts.cands.push(...keep); }
  if (!best) return null;
  // an eye socket drawn in rings can win as one big eye; the pupil is the smallest good disc inside it
  { const top = best; let inner = null; for (const c of cands) if (Math.hypot(c.cx - top.cx, c.cy - top.cy) + c.r <= top.r && c.r <= top.r * 0.7 && c.score >= top.score * 0.6 && (!inner || c.score > inner.score)) inner = c; if (inner) best = inner; }
  // refine, circle by circle: the pupil ends where under half of a circle is dark (a catchlight
  // takes a slice of a circle, not the whole of it), the iris where over half is dark again
  // (the eye's outline) or the circle leaves the fish; a black eye straight on skin, with no
  // outline, stops at a little under twice its pupil
  const mid = (best.med + best.ringMin) / 2;
  const tDark = Math.min(mid, best.med + 0.18);
  // centre on the pupil: the dark pixels joined to the candidate's centre, no further out than its ring
  let cx = best.cx, cy = best.cy;
  {
    let seed = [best.cx, best.cy], sd = Infinity;
    for (let y = Math.round(best.cy - best.r * 0.7); y <= best.cy + best.r * 0.7; y += 1) for (let x = Math.round(best.cx - best.r * 0.7); x <= best.cx + best.r * 0.7; x += 1) {
      const v = at(x, y); if (v < 0 || v >= tDark) continue; const dd = Math.hypot(x - best.cx, y - best.cy); if (dd < sd) { sd = dd; seed = [x, y]; }
    }
    const seen = new Set(); const st = [seed]; let sx = 0, sy = 0, n = 0;
    while (st.length) {
      const [x, y] = st.pop(); const k = y * w + x; if (seen.has(k)) continue; seen.add(k);
      if (Math.hypot(x - best.cx, y - best.cy) > best.r || at(x, y) < 0 || at(x, y) >= tDark) continue;
      sx += x; sy += y; n += 1; st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    if (n > 3) { cx = sx / n; cy = sy / n; }
  }
  // "dark" here is the pupil's own dark, not the hatching in an iris; a near-white sample is a
  // catchlight and does not count either way
  const darkShare = (rr) => {
    let n = 0, dk = 0, out = 0;
    for (let a = 0; a < 32; a += 1) {
      const x = cx + rr * Math.cos(a * Math.PI / 16), y = cy + rr * Math.sin(a * Math.PI / 16); const v = at(x, y);
      if (v < 0) { out += 1; continue; }
      const q = pix(x, y); if (q && v > 0.85 && Math.max(...q) - Math.min(...q) < 40) continue;
      n += 1; if (v < tDark) dk += 1;
    }
    return { dark: n ? dk / n : 1, out: out / 32 };
  };
  let rp = 1; while (rp < best.r * 1.5 && darkShare(rp).dark >= 0.5) rp += 0.5;
  let ri = rp + 0.5; while (ri < rp * 1.8 + 1.5) { const d = darkShare(ri); if (d.dark > 0.5 || d.out > 0.25) break; ri += 0.5; }
  const irisCol = [0, 0, 0]; let ic = 0;
  for (let rr = rp + 0.5; rr < ri; rr += 0.5) for (let a = 0; a < 32; a += 1) { const xi = Math.round(cx + rr * Math.cos(a * Math.PI / 16)), yi = Math.round(cy + rr * Math.sin(a * Math.PI / 16)); if (at(xi, yi) < tDark) continue; const i = (yi * w + xi) * 4; irisCol[0] += data[i]; irisCol[1] += data[i + 1]; irisCol[2] += data[i + 2]; ic += 1; }
  return { cx, cy, rp: Math.max(1, rp), ri: Math.max(rp + 1, ri), iris: irisCol.map((c) => Math.round(c / Math.max(1, ic))), score: best.score };
}

export function debugMasks(img, opts = {}) {
  const { width: w, height: h, data } = img; const N = w * h;
  const on = new Uint8Array(N); for (let i = 0; i < N; i += 1) on[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  const { s0, d0, t50, kw } = stripBorder(img, on);
  const body = new Uint8Array(N); for (let i = 0; i < N; i += 1) body[i] = s0[i] && d0[i] > kw ? 1 : 0;
  // the silhouette's box (a bill or a barbel runs on past the body as keyline strokes)
  let sx0 = w, sy0 = h, sx1 = 0, sy1 = 0;
  for (let i = 0; i < N; i += 1) if (s0[i]) { const x = i % w, y = (i / w) | 0; if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
  let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
  for (let i = 0; i < N; i += 1) if (body[i]) { const x = i % w, y = (i / w) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
  const cands = []; const eye = findEye(img, body, [bx0, by0, bx1, by1], { ...opts, cands });
  cands.sort((a, b) => b.score - a.score);
  return { on, s0, body, cands: cands.slice(0, 6), meta: { t50, kw, eye } };
}

// ---------------------------------------------------------------- k-means in OKLab
function kmeans(points, K, iters = 24) {
  const cent = []; const n = points.length; if (!n) return cent;
  // farthest-first from the point nearest the mean, so rare but distinct colours get a centre
  const mean = [0, 0, 0]; points.forEach((p) => { mean[0] += p[0] / n; mean[1] += p[1] / n; mean[2] += p[2] / n; });
  let first = points[0], fd = Infinity; for (const p of points) { const dd = d2(p, mean); if (dd < fd) { fd = dd; first = p; } }
  cent.push(first.slice()); const md = points.map((p) => d2(p, first));
  while (cent.length < K) {
    let bi = -1, bd = 0; for (let i = 0; i < n; i += 1) if (md[i] > bd) { bd = md[i]; bi = i; }
    if (bi < 0 || bd < 1e-5) break; cent.push(points[bi].slice());
    for (let i = 0; i < n; i += 1) md[i] = Math.min(md[i], d2(points[i], points[bi]));
  }
  const assign = new Int32Array(n);
  for (let it = 0; it < iters; it += 1) {
    const acc = cent.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i += 1) { let bk = 0, bd = Infinity; for (let k = 0; k < cent.length; k += 1) { const dd = d2(points[i], cent[k]); if (dd < bd) { bd = dd; bk = k; } } assign[i] = bk; const a = acc[bk]; a[0] += points[i][0]; a[1] += points[i][1]; a[2] += points[i][2]; a[3] += 1; }
    acc.forEach((a, k) => { if (a[3]) cent[k] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  return cent;
}

// ---------------------------------------------------------------- the pipeline
export function pixelize(img, opts = {}) {
  const { width: w, height: h, data } = img; const N = w * h;
  const box = opts.box || BOX;
  let on = new Uint8Array(N); for (let i = 0; i < N; i += 1) on[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  const { lab, sizes } = components(on, w, h);
  let main = 1; for (let k = 2; k < sizes.length; k += 1) if (sizes[k] > sizes[main]) main = k;
  for (let i = 0; i < N; i += 1) on[i] = lab[i] && (lab[i] === main || (opts.keepAll && sizes[lab[i]] >= sizes[main] * 0.002)) ? 1 : 0;
  const { s0, d0, t50, kw, backing } = stripBorder(img, on, opts);
  const body = new Uint8Array(N); for (let i = 0; i < N; i += 1) body[i] = s0[i] && d0[i] > kw ? 1 : 0;
  // the silhouette's box (a bill or a barbel runs on past the body as keyline strokes)
  let sx0 = w, sy0 = h, sx1 = 0, sy1 = 0;
  for (let i = 0; i < N; i += 1) if (s0[i]) { const x = i % w, y = (i / w) | 0; if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
  let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
  for (let i = 0; i < N; i += 1) if (body[i]) { const x = i % w, y = (i / w) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }

  // pre-smooth: a per-channel median over the body, radius about a quarter of an art pixel
  let f = Math.max((Math.max(bx1, sx1) - Math.min(bx0, sx0) + 1 - 2 * kw) / (box[0] - 6), (Math.max(by1, sy1) - Math.min(by0, sy0) + 1 - 2 * kw) / (box[1] - 6));
  const R = opts.median ?? Math.max(1, Math.round(f / 4));
  const sm = new Float32Array(N * 3); const win = [[], [], []];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x; if (!body[i]) continue;
    win[0].length = 0; win[1].length = 0; win[2].length = 0;
    for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (!body[j]) continue;
      win[0].push(data[j * 4]); win[1].push(data[j * 4 + 1]); win[2].push(data[j * 4 + 2]);
    }
    for (let c = 0; c < 3; c += 1) { win[c].sort((a, b) => a - b); sm[i * 3 + c] = win[c][win[c].length >> 1]; }
  }
  const eye = opts.eye === false ? null : (opts.eyeAt || findEye(img, body, [bx0, by0, bx1, by1], opts));

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const res = render(f);
    if (res.width <= box[0] && res.height <= box[1]) return { ...res, meta: { f, t50, kw, eye } };
    f *= 1 + 1 / Math.max(res.width, res.height);
  }
  throw new Error('could not fit the box');

  function render(fx) {
    // grid: phase chosen so the body's edge falls on cell edges as much as it can
    const PAD = 4; let best = null;
    for (let py = 0; py < 4; py += 1) for (let px = 0; px < 4; px += 1) {
      const ox = bx0 - (px / 4) * fx, oy = by0 - (py / 4) * fx;
      const gw = Math.ceil((bx1 - ox + 1) / fx), gh = Math.ceil((by1 - oy + 1) / fx);
      const cnt = new Float32Array(gw * gh);
      for (let y = by0; y <= by1; y += 1) for (let x = bx0; x <= bx1; x += 1) if (body[y * w + x]) cnt[Math.floor((y - oy) / fx) * gw + Math.floor((x - ox) / fx)] += 1;
      let score = 0; const A = fx * fx; for (let j = 0; j < gw * gh; j += 1) { const c = Math.min(1, cnt[j] / A); score += Math.min(c, 1 - c); }
      if (!best || score < best.score) best = { score, ox, oy };
    }
    const ox = best.ox - (PAD + Math.ceil((bx0 - sx0) / fx)) * fx, oy = best.oy - (PAD + Math.ceil((by0 - sy0) / fx)) * fx;
    const gw = Math.ceil((Math.max(bx1, sx1) - ox + 1) / fx) + PAD, gh = Math.ceil((Math.max(by1, sy1) - oy + 1) / fx) + PAD; const G = gw * gh;
    const cov = new Float32Array(G), covS = new Float32Array(G), covB = new Float32Array(G), acc = new Float32Array(G * 3);
    const cells = Array.from({ length: G }, () => null);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (backing[i]) { const cx = Math.floor((x - ox) / fx), cy = Math.floor((y - oy) / fx); if (cx >= 0 && cy >= 0 && cx < gw && cy < gh) covB[cy * gw + cx] += 1; }
      if (!s0[i]) continue;
      const cx = Math.floor((x - ox) / fx), cy = Math.floor((y - oy) / fx); if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
      const j = cy * gw + cx; covS[j] += 1; if (!body[i]) continue;
      cov[j] += 1; acc[j * 3] += sm[i * 3]; acc[j * 3 + 1] += sm[i * 3 + 1]; acc[j * 3 + 2] += sm[i * 3 + 2];
      (cells[j] ||= []).push(luma(sm[i * 3], sm[i * 3 + 1], sm[i * 3 + 2]), sm[i * 3], sm[i * 3 + 1], sm[i * 3 + 2]);
    }
    const A = fx * fx; const inside = new Uint8Array(G); const col = Array.from({ length: G }, () => null); const lum = new Float32Array(G).fill(-1);
    const th = opts.coverage ?? 0.45;
    for (let j = 0; j < G; j += 1) if (cov[j] / A >= th) { inside[j] = 1; const n = cov[j]; col[j] = [acc[j * 3] / n, acc[j * 3 + 1] / n, acc[j * 3 + 2] / n]; lum[j] = luma(...col[j]); }
    // spots (opts.spots): small dark marks on a lighter ground — a trout's — each drawn as one
    // pixel of its own colour on a clean ground, where averaging them in made a speckle of
    // in-between colours
    const spotAt = new Map();
    if (opts.spots) {
      const cellOf = (i) => Math.floor((((i / w) | 0) - oy) / fx) * gw + Math.floor((i % w - ox) / fx);
      const ground = new Float32Array(G);
      for (let j = 0; j < G; j += 1) if (cells[j]) { const ls = []; for (let t = 0; t < cells[j].length; t += 4) ls.push(cells[j][t]); ls.sort((a, b) => a - b); ground[j] = ls[Math.floor(ls.length * 0.75)]; }
      const mark = new Uint8Array(N);
      for (let i = 0; i < N; i += 1) if (body[i]) { const j = cellOf(i); if (luma(sm[i * 3], sm[i * 3 + 1], sm[i * 3 + 2]) < ground[j] - (opts.spots.delta || 55)) mark[i] = 1; }
      const { lab: sl, sizes: ss } = components(mark, w, h);
      const amin = (fx * 0.3) ** 2, amax = (fx * 1.3) ** 2;
      const acc2 = ss.map(() => [0, 0, 0, 0, 0, 0]);
      for (let i = 0; i < N; i += 1) { const k = sl[i]; if (!k) continue; const a = acc2[k]; a[0] += i % w; a[1] += (i / w) | 0; a[2] += sm[i * 3]; a[3] += sm[i * 3 + 1]; a[4] += sm[i * 3 + 2]; a[5] += 1; }
      const isSpot = ss.map((n) => n >= amin && n <= amax);
      // the ground under them, without them
      const g2 = new Float32Array(G * 4);
      for (let i = 0; i < N; i += 1) { if (!body[i] || (sl[i] && isSpot[sl[i]])) continue; const j = cellOf(i); g2[j * 4] += sm[i * 3]; g2[j * 4 + 1] += sm[i * 3 + 1]; g2[j * 4 + 2] += sm[i * 3 + 2]; g2[j * 4 + 3] += 1; }
      for (let j = 0; j < G; j += 1) if (inside[j] && g2[j * 4 + 3] >= cov[j] * 0.3) { const n = g2[j * 4 + 3]; col[j] = [g2[j * 4] / n, g2[j * 4 + 1] / n, g2[j * 4 + 2] / n]; lum[j] = luma(...col[j]); }
      for (let k = 1; k < ss.length; k += 1) {
        if (!isSpot[k]) continue; const a = acc2[k]; const n = a[5];
        const j = Math.floor((a[1] / n - oy) / fx) * gw + Math.floor((a[0] / n - ox) / fx); if (!inside[j] || spotAt.has(j)) continue;
        spotAt.set(j, [a[2] / n, a[3] / n, a[4] / n]);
      }
    }
    // detail: a cell that is darker (or lighter) than all four neighbours takes its own darkest (lightest) quarter
    const TH = opts.extreme ?? 26;
    const col2 = col.map((c) => c && c.slice());
    for (let j = 0; j < G; j += 1) {
      if (!inside[j]) continue; const nb = [j - 1, j + 1, j - gw, j + gw].filter((q) => inside[q]).map((q) => lum[q]); if (nb.length < 3) continue;
      const mn = Math.min(...nb), mx = Math.max(...nb); const pts = cells[j]; const n = pts.length / 4;
      const ord = [...Array(n).keys()].sort((a, b) => pts[a * 4] - pts[b * 4]); const k = Math.max(1, Math.round(n * 0.25));
      const pick = (from) => { const c = [0, 0, 0]; for (let t = 0; t < k; t += 1) { const q = from ? ord[n - 1 - t] : ord[t]; c[0] += pts[q * 4 + 1] / k; c[1] += pts[q * 4 + 2] / k; c[2] += pts[q * 4 + 3] / k; } return c; };
      if (lum[j] < mn - TH) col2[j] = pick(false); else if (lum[j] > mx + TH) col2[j] = pick(true);
      else if (opts.lines !== false) {
        // a dark line one cell thick (a striped bass's stripes, a perch's bars): darker than the
        // cells either side of it across the line. Light lines are left alone: taken the same
        // way, the sheen on the scales came out as white scratches
        const L = (q) => (inside[q] ? lum[q] : null); const pairs = [[L(j - 1), L(j + 1)], [L(j - gw), L(j + gw)]].filter(([a, b]) => a != null && b != null);
        if (pairs.some(([a, b]) => lum[j] < Math.min(a, b) - TH)) col2[j] = pick(false);
      }
    }
    // to OKLab, a little unsharp on lightness and a little more colour
    const labc = col2.map((c) => c && toLab(c));
    const out = labc.map((c) => c && c.slice());
    const US = opts.unsharp ?? 0.5, SAT = opts.sat ?? 1.12;
    for (let j = 0; j < G; j += 1) {
      if (!inside[j]) continue; let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) { const q = j + dy * gw + dx; if (inside[q]) { s += labc[q][0]; n += 1; } }
      out[j][0] = labc[j][0] + US * (labc[j][0] - s / n); out[j][1] *= SAT; out[j][2] *= SAT;
    }
    // quantise
    const idxs = []; for (let j = 0; j < G; j += 1) if (inside[j]) idxs.push(j);
    const spotLab = new Map([...spotAt].map(([j, c]) => [j, toLab(c)]));
    const K = opts.K ?? 16; const cent = kmeans([...idxs.map((j) => out[j]), ...spotLab.values()], K);
    const label = new Int16Array(G).fill(-1);
    for (const j of idxs) { let bk = 0, bd = Infinity; cent.forEach((c, k) => { const dd = d2(out[j], c); if (dd < bd) { bd = dd; bk = k; } }); label[j] = bk; }
    // smooth the labels a little: a pixel pays for each neighbour it disagrees with
    const LAMBDA = opts.lambda ?? 0.007;
    for (let it = 0; it < 3; it += 1) {
      const prev = Int16Array.from(label);
      for (const j of idxs) {
        let bk = prev[j], bc = Infinity;
        for (let k = 0; k < cent.length; k += 1) {
          let c = d2(out[j], cent[k]); for (const q of [j - 1, j + 1, j - gw, j + gw]) if (prev[q] >= 0 && prev[q] !== k) c += LAMBDA;
          if (c < bc) { bc = c; bk = k; }
        }
        label[j] = bk;
      }
    }
    for (const [j, c] of spotLab) { let bk = 0, bd = Infinity; cent.forEach((q, k) => { const dd = d2(c, q); if (dd < bd) { bd = dd; bk = k; } }); label[j] = bk; }
    const palette = cent.map((c) => toRgb(c));
    const rgb = Array.from({ length: G }, () => null);
    for (const j of idxs) rgb[j] = palette[label[j]];
    // a fleck of the old border left in a notch of the edge: a lone neon-ish pixel on the rim
    // takes the colour round it, so the only neon on the edge is the ring
    for (const j of idxs) {
      const [r, g, b] = rgb[j]; if (!neonish(r, g, b) || hsv(r, g, b)[1] < 0.6) continue;
      if (![j - 1, j + 1, j - gw, j + gw].some((q) => !inside[q])) continue;
      const nb = [j - 1, j + 1, j - gw, j + gw, j - gw - 1, j - gw + 1, j + gw - 1, j + gw + 1].filter((q) => inside[q]);
      if (nb.some((q) => label[q] === label[j])) continue;
      const count = new Map(); nb.forEach((q) => count.set(label[q], (count.get(label[q]) || 0) + 1));
      const top = [...count].sort((p, q) => q[1] - p[1])[0]; if (top) { label[j] = top[0]; rgb[j] = palette[top[0]]; }
    }
    // the eye, stamped at its own size
    if (eye) stampEye(eye, fx, ox, oy, gw, gh, inside, rgb);
    // rings: our keyline, the neon, an outer keyline
    const dil = (set, sq) => { const r = new Uint8Array(G); for (let y = 0; y < gh; y += 1) for (let x = 0; x < gw; x += 1) { const j = y * gw + x; if (set[j]) continue; let hit = false; for (let dy = -1; dy <= 1 && !hit; dy += 1) for (let dx = -1; dx <= 1; dx += 1) { if (!dx && !dy) continue; if (!sq && dx && dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue; if (set[yy * gw + xx]) { hit = true; break; } } if (hit) r[j] = 1; } return r; };
    const SQ = opts.square ?? false;
    const k1 = dil(inside, SQ);
    // thin parts that lost their body to the stripped keyline stay as a keyline stroke
    for (let j = 0; j < G; j += 1) if (!inside[j] && covS[j] / A >= 0.5) k1[j] = 1;
    const u1 = new Uint8Array(G); for (let j = 0; j < G; j += 1) u1[j] = inside[j] || k1[j];
    const n1 = dil(u1, SQ); for (let j = 0; j < G; j += 1) if (!u1[j] && covB[j] / A >= 0.5) n1[j] = 1;
    const u2 = new Uint8Array(G); for (let j = 0; j < G; j += 1) u2[j] = u1[j] || n1[j];
    const o1 = dil(u2, false);
    // crop
    let x0 = gw, y0 = gh, x1 = 0, y1 = 0;
    for (let y = 0; y < gh; y += 1) for (let x = 0; x < gw; x += 1) { const j = y * gw + x; if (u2[j] || o1[j]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    const W = x1 - x0 + 1, H = y1 - y0 + 1; const px = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const j = (y + y0) * gw + x + x0; let c = null;
      if (inside[j]) c = rgb[j]; else if (k1[j] || o1[j]) c = KEYLINE; else if (n1[j]) c = NEON;
      if (c) { const o = (y * W + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; }
    }
    return { width: W, height: H, data: px };
  }
}

// The eye, drawn again at its own size: a round iris (at least a pixel all round) about a
// pupil in the keyline colour, a catchlight on a pupil of two pixels or more, and a keyline
// round the iris wherever what is there is too close to the iris to hold it apart.
export const CATCHLIGHT = [246, 246, 236];
function stampEye(eye, fx, ox, oy, gw, gh, inside, rgb) {
  const ax = (eye.cx - ox) / fx, ay = (eye.cy - oy) / fx;
  const pd = Math.max(1, Math.min(6, Math.round(2 * eye.rp / fx)));
  let ed = Math.max(pd + 2, Math.round(2 * eye.ri / fx)); if ((ed - pd) % 2) ed += ed > pd + 2 ? -1 : 1;
  const tx = Math.round(ax - ed / 2), ty = Math.round(ay - ed / 2);
  let iris = eye.iris; const L = toLab(iris); if (L[0] < 0.7) iris = toRgb([0.7, L[1], L[2]]);
  const irisLab = toLab(iris);
  const c = (ed - 1) / 2, po = (ed - pd) / 2, pc = (pd - 1) / 2;
  const disc = (i, j, cc, d) => (i - cc) ** 2 + (j - cc) ** 2 <= (d / 2) ** 2 - (d === 3 ? 0.3 : 0);
  const stamp = new Map();
  for (let j = 0; j < ed; j += 1) for (let i = 0; i < ed; i += 1) {
    if (!disc(i, j, c, ed)) continue;
    const pi = i - po, pj = j - po;
    const inP = pi >= 0 && pj >= 0 && pi < pd && pj < pd && (pd < 3 || disc(pi, pj, pc, pd));
    stamp.set(`${tx + i},${ty + j}`, inP ? 'P' : 'I');
  }
  if (pd >= 2) { let best = null; for (const [k, v] of stamp) { if (v !== 'P') continue; const [x, y] = k.split(',').map(Number); if (!best || y < best[1] || (y === best[1] && x < best[0])) best = [x, y]; } if (best) stamp.set(`${best[0]},${best[1]}`, 'C'); }
  const ring = [];
  for (const k of stamp.keys()) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = `${x + dx},${y + dy}`; if (!stamp.has(kk)) ring.push([x + dx, y + dy]); } }
  for (const [k, v] of stamp) { const [x, y] = k.split(',').map(Number); if (x < 0 || y < 0 || x >= gw || y >= gh) continue; const q = y * gw + x; if (!inside[q]) continue; rgb[q] = v === 'P' ? KEYLINE : v === 'C' ? CATCHLIGHT : iris; }
  // an eye of four pixels or more gets its whole keyline, as the stickers draw it; a smaller one
  // only where the iris would otherwise run into what is round it
  for (const [x, y] of ring) { if (x < 0 || y < 0 || x >= gw || y >= gh) continue; const q = y * gw + x; if (!inside[q] || rgb[q] === KEYLINE) continue; if (ed >= 4 || Math.sqrt(d2(toLab(rgb[q]), irisLab)) < 0.2) rgb[q] = KEYLINE; }
}

// ---------------------------------------------------------------- CLI
const colours = (res) => { const c = new Set(); for (let i = 0; i < res.width * res.height; i += 1) if (res.data[i * 4 + 3]) c.add(res.data.readUInt32BE(i * 4)); return c.size; };
// A PNG's size is the first two fields of its IHDR.
const sizeOf = (file) => { const b = readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

function writeIndex(dir) {
  const keys = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();
  const lines = [
    '// Generated by scripts/pixelFish.mjs from the stickers in src/assets/fish; do not edit.',
    "// Each entry is a sticker's pixel variant and its native size in art pixels: drawn one file",
    '// pixel to one art pixel, it is w x ART_PX by h x ART_PX painting units.',
    ...keys.map((k) => `import ${k} from './${k}.png';`),
    '',
    'export const PIXEL_FISH = {',
    ...keys.map((k) => { const [w, h] = sizeOf(`${dir}${k}.png`); return `  ${k}: { src: ${k}, w: ${w}, h: ${h} },`; }),
    '};',
    '',
  ];
  writeFileSync(`${dir}index.js`, lines.join('\n'));
  // the sizes alone, which FishIllustration reads up front (the art loads as a chunk of its own)
  const sizes = keys.map((k) => { const [w, h] = sizeOf(`${dir}${k}.png`); return `  "${k}": [${w}, ${h}]`; });
  writeFileSync(`${dir}sizes.json`, `{\n${sizes.join(',\n')}\n}\n`);
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const extra = process.env.PIXEL_OPTS ? JSON.parse(process.env.PIXEL_OPTS) : {};
  if (args[0] === '--logo') {
    const res = pixelize(readAnyPng(`${ROOT}art/logo/logo.png`), { ...LOGO, ...extra });
    const out = process.env.PIXEL_OUT ? `${OUT}logo_pixel.png` : `${ROOT}src/assets/props/logo_pixel.png`;
    writePng(out, res);
    console.log('logo', `${res.width}x${res.height}`, 'colours', colours(res));
  } else {
    mkdirSync(OUT, { recursive: true });
    const keys = readdirSync(FISH).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).filter((k) => !args.length || args.includes(k)).sort();
    for (const key of keys) {
      const res = pixelize(readAnyPng(`${FISH}${key}.png`), { eye: JUNK.includes(key) ? false : undefined, ...OVERRIDES[key], ...extra });
      writePng(`${OUT}${key}.png`, res);
      const e = res.meta.eye;
      console.log(key.padEnd(18), `${res.width}x${res.height}`.padEnd(7), 'colours', colours(res), 'eye', e ? `${Math.round(e.cx)},${Math.round(e.cy)} pupil ${e.rp.toFixed(1)} iris ${e.ri.toFixed(1)}` : '-');
    }
    writeIndex(OUT);
  }
}

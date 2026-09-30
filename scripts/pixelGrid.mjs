// Put a raster on the world's one art pixel.
//
// Every raster on the Cast & Catch stage is stored at its native art resolution — one file pixel
// is one art pixel — and drawn at rows x ART_PX painting units (sceneLayout's ART_PX, 4/3 of a
// unit), pixelated, so a pixel on a cooler, a gull or a dog is the size of a pixel on the angler
// and on the painting behind them. Most of the game's sprites and icons were rendered at a few
// source pixels to their own art pixel, each at its own pitch, with its own outline colour and an
// anti-aliased edge; this takes one of those renders and writes it at a chosen size on the grid:
//
//   node scripts/pixelGrid.mjs <in.png> <out.png> --rows 24 [options]
//   node scripts/pixelGrid.mjs --batch art/props/grid.json [--only name,name]
//
// How a cell gets its colour. The source is first reduced to a palette (k-means in OKLab, so
// "near" means near to the eye, seeded deterministically — the same input always gives the same
// output), with every near-black taken out of the vote as the keyline. Then each output cell is
// a vote of the source pixels it covers, weighted by how much of each it covers: it is opaque if
// at least `alpha` of it is drawn (hard alpha — 0 or 255, never between), it is the keyline if
// the keyline covers at least `keyShare` of what is drawn in it, and otherwise it is the palette
// colour that covers the most of it. Never an average: an average is the soft ring between two
// blocks, which is exactly what pixel art does not have.
//
// After the vote, the outline:
//   - `outline: force` makes every opaque pixel on the silhouette's edge the keyline, so the line
//     round a sprite is closed and exactly one art pixel wide whatever the render did at its edge
//   - a line the vote drew two pixels thick at the edge (a source line that straddled two cells)
//     loses its inner pixel to the fill behind it, unless that pixel is where a line inside the
//     sprite meets the outline — so the outline stays one pixel and no inner line comes loose
//   - `outline: keep` leaves the voted keyline as it is, `none` recolours no edge (clouds, which
//     have no outline in this world, only a shaded rim)
// The keyline is one colour for the whole game: the angler's own near-black, #130f0c.
//
// Options (CLI flags, or keys of a batch job):
//   rows / cols     output size in art pixels (cols defaults to the aspect of the cropped source)
//   fit             the longer side in art pixels instead (an icon's content inside its box)
//   pitch           source pixels per art pixel, instead of rows (the render's own grid; pitchX /
//                   pitchY for a non-square one, phaseX / phaseY its offset, so an exact pitch
//                   lands every cell on one block)
//   colors          palette size, not counting the keyline (default 12)
//   palette         ["rrggbb", ...] a fixed palette instead of k-means
//   keyline         hex, default 130f0c
//   keyLum          source pixels darker than this (0-255 luma) and greyer than keyChroma are
//                   keyline (default 56; keyChroma 0.09 in OKLab)
//   keyShare        how much of a cell's drawn area the keyline needs to win it (default 0.34)
//   on              how opaque a source pixel must be to count as drawn (default 128; nearly 255
//                   leaves out a baked translucent ground shadow)
//   alpha           how much of a cell has to be drawn for it to be opaque (default 0.5)
//   ditherLo        a cell drawn at least this much but under `alpha` is on a checkerboard
//   outline         force | keep | none (default force)
//   ditherEdge      true: the outer ring kept on a checkerboard (a shadow's soft edge, hard alpha)
//   tones           [lit, body, shade, rim]: a cloud's four flat tones, with no keyline
//   box             WxH: centre the result on a transparent canvas of this size (icons)
//   anchor          where in the box: center (default) or bottom
//   frames          the source is a strip of this many equal frames; each is gridded on its own
//                   with the same cell size and palette, and written as a strip
//   recolor         { "#rrggbb": "#rrggbb" } applied to the palette after k-means
//   pin             ["#rrggbb", ...] palette colours kept exactly (k-means only fills the rest)
//   crop            false to keep the source's own canvas instead of cropping to its alpha
//   despeckle       true: a lone pixel unlike all eight neighbours takes their majority colour
//   draw            a hand-drawn text source instead of a render (parseDrawing, below); `frame`
//                   picks one of its frames
//
// Pure Node on scripts/png.mjs, deterministic, no canvas. Paths in a batch are relative to the
// working directory (run it from the repo root). The batches that made the game's art are
// art/props/grid.json and art/ambient/grid.json; the pets go through scripts/petSlice.mjs.
import { readPng, writePng } from './png.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const KEYLINE_HEX = '130f0c';

export const hexToRgb = (hex) => { const h = String(hex).replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
export const rgbToHex = ([r, g, b]) => [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
export const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// sRGB <-> OKLab (Björn Ottosson's), for palette distances that match the eye.
const toLinear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (v) => { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
export function oklab([r, g, b]) {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function fromOklab([L, a, bb]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  return [toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
const dist2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
export const chroma = ([, a, b]) => Math.hypot(a, b);

export function crop(img, box) {
  const { x0, y0, x1, y1 } = box;
  const w = x1 - x0, h = y1 - y0;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) img.data.copy(data, y * w * 4, ((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x1) * 4);
  return { width: w, height: h, data };
}

export function alphaBox(img, on = 128) {
  let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    if (img.data[(y * img.width + x) * 4 + 3] < on) continue;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  return x1 > x0 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}

// The render's own grid along one axis: the pitch at which the positions of colour steps line up
// best (vector strength of their phase), taking the largest pitch that lines up nearly as well as
// the best — a grid of p also lines up at p/2 and p/3.
export function detectPitch(img, axis = 'x', { min = 1.5, max = 24, step = 0.01, jump = 48 } = {}) {
  const { width: W, height: H, data } = img;
  const edges = [];
  const px = (x, y) => (y * W + x) * 4;
  const along = axis === 'x' ? W : H, across = axis === 'x' ? H : W;
  for (let j = 0; j < across; j += 1) for (let i = 1; i < along; i += 1) {
    const a = axis === 'x' ? px(i - 1, j) : px(j, i - 1), b = axis === 'x' ? px(i, j) : px(j, i);
    const aOn = data[a + 3] >= 128, bOn = data[b + 3] >= 128;
    const d = aOn !== bOn ? 999 : aOn ? Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) : 0;
    if (d >= jump) edges.push(i);
  }
  if (!edges.length) return { pitch: 0, phase: 0, coherence: 0 };
  const scan = [];
  for (let p = min; p <= max; p += step) {
    let c = 0, s = 0;
    for (const e of edges) { const t = (2 * Math.PI * e) / p; c += Math.cos(t); s += Math.sin(t); }
    scan.push({ p, r: Math.hypot(c, s) / edges.length, ang: Math.atan2(s, c) });
  }
  const best = Math.max(...scan.map((v) => v.r));
  const pick = scan.filter((v) => v.r >= best * 0.8).sort((a, b) => b.p - a.p)[0];
  // An edge sits between pixel i-1 and i, at i: the grid's cell boundaries are at phase + k*p.
  const phase = ((((pick.ang / (2 * Math.PI)) * pick.p) % pick.p) + pick.p) % pick.p;
  return { pitch: Math.round(pick.p * 100) / 100, phase: Math.round(phase * 100) / 100, coherence: Math.round(pick.r * 1000) / 1000 };
}

// k-means in OKLab over a weighted colour list, deterministic farthest-point seeding from the
// heaviest colour. `pinned` entries are fixed centres that are never moved.
export function kmeans(colors, k, pinned = []) {
  const pts = colors.map((c) => ({ lab: oklab(c.rgb), w: c.w }));
  const centres = pinned.map((rgb) => ({ lab: oklab(rgb), fixed: true }));
  const heavy = [...pts].sort((a, b) => b.w - a.w);
  if (!centres.length && heavy.length) centres.push({ lab: heavy[0].lab });
  while (centres.length < k + pinned.length && centres.length < pts.length) {
    let far = null, farD = -1;
    for (const p of heavy) {
      const d = Math.min(...centres.map((c) => dist2(p.lab, c.lab))) * Math.sqrt(p.w);
      if (d > farD) { farD = d; far = p; }
    }
    if (!far || farD <= 0) break;
    centres.push({ lab: far.lab });
  }
  for (let it = 0; it < 30; it += 1) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      centres.forEach((c, i) => { const d = dist2(p.lab, c.lab); if (d < bd) { bd = d; bi = i; } });
      const s = sums[bi]; s[0] += p.lab[0] * p.w; s[1] += p.lab[1] * p.w; s[2] += p.lab[2] * p.w; s[3] += p.w;
    }
    let moved = 0;
    centres.forEach((c, i) => {
      if (c.fixed || !sums[i][3]) return;
      const next = [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]];
      moved += dist2(next, c.lab); c.lab = next;
    });
    if (moved < 1e-9) break;
  }
  return centres.map((c) => (c.fixed ? pinned[centres.indexOf(c)] : fromOklab(c.lab)));
}

// The source's colours as a weighted list (5-bit bins, so k-means runs on hundreds of points,
// not hundreds of thousands), and a per-pixel class: -1 transparent, 0 keyline, 1.. palette.
export function classify(img, opts) {
  const { width: W, height: H, data } = img;
  const key = hexToRgb(opts.keyline || KEYLINE_HEX);
  const keyLum = opts.keyLum ?? 56, keyChroma = opts.keyChroma ?? 0.09;
  // `on`: how opaque a source pixel has to be to count as drawn (a baked translucent ground shadow
  // is left out by asking for nearly opaque).
  const ON = opts.on ?? 128;
  const isKey = (rgb) => luma(rgb) < keyLum && chroma(oklab(rgb)) < keyChroma;
  const bins = new Map();
  for (let i = 0; i < W * H; i += 1) {
    if (data[i * 4 + 3] < ON) continue;
    const rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    if (isKey(rgb)) continue;
    const b = ((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3);
    const e = bins.get(b) || { s: [0, 0, 0], w: 0 };
    e.s[0] += rgb[0]; e.s[1] += rgb[1]; e.s[2] += rgb[2]; e.w += 1; bins.set(b, e);
  }
  const colors = [...bins.values()].map((e) => ({ rgb: e.s.map((v) => v / e.w), w: e.w }));
  let palette = opts.palette ? opts.palette.map(hexToRgb) : kmeans(colors, opts.colors ?? 12, (opts.pin || []).map(hexToRgb));
  const labs = palette.map(oklab);
  const cls = new Int16Array(W * H).fill(-1);
  for (let i = 0; i < W * H; i += 1) {
    if (data[i * 4 + 3] < ON) continue;
    const rgb = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    if (isKey(rgb)) { cls[i] = 0; continue; }
    const lab = oklab(rgb);
    let bi = 0, bd = Infinity;
    labs.forEach((l, j) => { const d = dist2(lab, l); if (d < bd) { bd = d; bi = j; } });
    cls[i] = bi + 1;
  }
  if (opts.recolor) {
    const map = Object.fromEntries(Object.entries(opts.recolor).map(([a, b]) => [a.replace('#', '').toLowerCase(), hexToRgb(b)]));
    palette = palette.map((rgb) => map[rgbToHex(rgb)] || rgb);
  }
  return { cls, palette: [key, ...palette] };
}

// One vote per output cell over the source pixels it covers (area weighted).
export function vote(img, cls, palette, { cols, rows, cellX, cellY, originX = 0, originY = 0, alpha = 0.5, keyShare = 0.34, ditherLo = null }) {
  const { width: W, height: H } = img;
  const out = { width: cols, height: rows, cls: new Int16Array(cols * rows).fill(-1), palette };
  const votes = new Float64Array(palette.length);
  for (let cy = 0; cy < rows; cy += 1) for (let cx = 0; cx < cols; cx += 1) {
    const sx0 = originX + cx * cellX, sx1 = sx0 + cellX, sy0 = originY + cy * cellY, sy1 = sy0 + cellY;
    votes.fill(0);
    let drawn = 0;
    for (let y = Math.max(0, Math.floor(sy0)); y < Math.min(H, Math.ceil(sy1)); y += 1) {
      const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
      if (wy <= 0) continue;
      for (let x = Math.max(0, Math.floor(sx0)); x < Math.min(W, Math.ceil(sx1)); x += 1) {
        const wx = Math.min(x + 1, sx1) - Math.max(x, sx0);
        if (wx <= 0) continue;
        const c = cls[y * W + x];
        if (c < 0) continue;
        votes[c] += wx * wy; drawn += wx * wy;
      }
    }
    // A cell drawn less than `alpha` is empty — or, with `ditherLo`, one of a checkerboard where
    // it is drawn at least that much: a soft edge becomes a dithered one, never a partial alpha.
    if (drawn < alpha * cellX * cellY && !(ditherLo !== null && drawn >= ditherLo * cellX * cellY && (cx + cy) % 2 === 0)) continue;
    let pick = 0;
    if (votes[0] < keyShare * drawn) {
      let best = -1;
      for (let c = 1; c < votes.length; c += 1) if (votes[c] > best) { best = votes[c]; pick = c; }
      if (best <= 0) pick = 0;
    }
    out.cls[cy * cols + cx] = pick;
  }
  return out;
}

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function outline(art, mode = 'force') {
  const { width: W, height: H, cls } = art;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : cls[y * W + x]);
  const edge = (x, y) => at(x, y) >= 0 && N4.some(([dx, dy]) => at(x + dx, y + dy) < 0);
  if (mode === 'none') return art;
  if (mode === 'force') for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (edge(x, y)) cls[y * W + x] = 0;
  // A line two pixels thick at the edge loses its inner pixel to the fill behind it: an inner
  // keyline pixel with the outline on one side and fill straight across from it on the other is
  // doubling the outline. A keyline pixel with more keyline across from the outline is where a
  // line inside the sprite meets it, and stays.
  const next = Int16Array.from(cls);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (at(x, y) !== 0 || edge(x, y)) continue;
    const doubling = N4.find(([dx, dy]) => at(x + dx, y + dy) === 0 && edge(x + dx, y + dy) && at(x - dx, y - dy) > 0);
    if (!doubling) continue;
    next[y * W + x] = at(x - doubling[0], y - doubling[1]);
  }
  art.cls = next;
  return art;
}

export function despeckle(art) {
  const { width: W, height: H, cls } = art;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : cls[y * W + x]);
  const next = Int16Array.from(cls);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const c = at(x, y);
    if (c <= 0) continue;
    const nb = N8.map(([dx, dy]) => at(x + dx, y + dy));
    if (nb.some((n) => n === c || n < 0)) continue;
    const count = new Map();
    nb.forEach((n) => { if (n > 0) count.set(n, (count.get(n) || 0) + 1); });
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 5) next[y * W + x] = top[0];
  }
  art.cls = next;
  return art;
}

// A soft thing with no outline in this world — a cloud — is four flat tones, `tones` = [lit, body,
// shade, rim]: inside, the render's own shading voted into three bands by brightness (the
// brightest palette colour lit, the next body, the rest shade, so the grey between two puffs
// stays), and at the edge the silhouette decides — the pixel on the bottom edge (or the lower
// right) is the rim, and one with open sky above or to its left (the light comes from the top
// left) is lit unless the render had it in shade.
export function cloudTones(art, tones) {
  const { width: W, height: H, cls } = art;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cls[y * W + x] >= 0;
  const palette = [art.palette[0], ...tones.map(hexToRgb)];
  const rank = art.palette.map((rgb, i) => ({ i, l: luma(rgb) })).slice(1).sort((a, b) => b.l - a.l);
  const band = new Map(rank.map((e, r) => [e.i, Math.min(3, r + 1)]));
  const next = Int16Array.from(cls);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!on(x, y)) continue;
    let tone = band.get(cls[y * W + x]) || 2;
    if (!on(x, y + 1) || (!on(x + 1, y) && !on(x + 1, y + 1))) tone = 4;
    else if (!on(x, y + 2)) tone = Math.max(tone, 3);
    else if ((!on(x, y - 1) || !on(x - 1, y)) && tone < 3) tone = 1;
    next[y * W + x] = tone;
  }
  art.cls = next;
  art.palette = palette;
  return art;
}

// A shadow's edge in pixel art: the outer ring of the silhouette kept only on a checkerboard, so it
// reads soft while every pixel is fully on or off.
export function ditherEdge(art) {
  const { width: W, height: H, cls } = art;
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && cls[y * W + x] >= 0;
  const next = Int16Array.from(cls);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (on(x, y) && N4.some(([dx, dy]) => !on(x + dx, y + dy)) && (x + y) % 2) next[y * W + x] = -1;
  }
  art.cls = next;
  return art;
}

export function toImage(art) {
  const { width: W, height: H, cls, palette } = art;
  const data = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i += 1) {
    if (cls[i] < 0) continue;
    const [r, g, b] = palette[cls[i]];
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data };
}

// Place an image on a transparent canvas of w x h (centred, or standing on the bottom).
export function place(img, w, h, anchor = 'center') {
  const out = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  const ox = Math.floor((w - img.width) / 2), oy = anchor === 'bottom' ? h - img.height : Math.floor((h - img.height) / 2);
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    const tx = x + ox, ty = y + oy;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
    img.data.copy(out.data, (ty * w + tx) * 4, (y * img.width + x) * 4, (y * img.width + x) * 4 + 4);
  }
  return out;
}

export function strip(frames) {
  const w = frames[0].width, h = frames[0].height;
  const out = { width: w * frames.length, height: h, data: Buffer.alloc(w * frames.length * h * 4) };
  frames.forEach((f, i) => { for (let y = 0; y < h; y += 1) f.data.copy(out.data, (y * out.width + i * w) * 4, y * w * 4, (y + 1) * w * 4); });
  return out;
}

export function splitFrames(img, n) {
  const fw = img.width / n;
  return Array.from({ length: n }, (_, i) => crop(img, { x0: Math.round(i * fw), y0: 0, x1: Math.round((i + 1) * fw), y1: img.height }));
}

// Grid one image (no frames) with the options above; returns { image, art, cellX, cellY }.
export function gridImage(src, opts = {}, shared = null) {
  const box = opts.crop === false ? { x0: 0, y0: 0, x1: src.width, y1: src.height } : alphaBox(src, opts.on ?? 128);
  const img = crop(src, box);
  const { cls, palette } = shared || classify(img, opts);
  const clsImg = shared ? classify(img, { ...opts, palette: shared.palette.slice(1).map(rgbToHex) }).cls : cls;
  let cellX, cellY, rows, cols;
  if (opts.pitch) {
    cellX = opts.pitchX || opts.pitch; cellY = opts.pitchY || opts.pitch;
    rows = opts.rows || Math.round(img.height / cellY); cols = opts.cols || Math.round(img.width / cellX);
  } else if (opts.fit) {
    // The longer side becomes `fit` art pixels (an icon's content inside its box).
    cellX = cellY = Math.max(img.width, img.height) / opts.fit;
    rows = Math.max(1, Math.round(img.height / cellY)); cols = Math.max(1, Math.round(img.width / cellX));
  } else {
    rows = opts.rows; cellY = img.height / rows; cellX = opts.cols ? img.width / opts.cols : cellY;
    cols = opts.cols || Math.max(1, Math.round(img.width / cellX));
  }
  // Centre the grid on the cropped source (or on the grid's own phase when it is known).
  const originX = opts.phaseX !== undefined ? opts.phaseX - box.x0 - Math.ceil((opts.phaseX - box.x0) / cellX) * cellX : (img.width - cols * cellX) / 2;
  const originY = opts.phaseY !== undefined ? opts.phaseY - box.y0 - Math.ceil((opts.phaseY - box.y0) / cellY) * cellY : (img.height - rows * cellY) / 2;
  const art = vote(img, clsImg, palette, { cols, rows, cellX, cellY, originX, originY, alpha: opts.alpha ?? 0.5, keyShare: opts.keyShare ?? 0.34, ditherLo: opts.ditherLo ?? null });
  if (opts.despeckle) despeckle(art);
  if (opts.tones) cloudTones(art, opts.tones);
  if (opts.ditherEdge) ditherEdge(art);
  outline(art, opts.outline || 'force');
  let image = toImage(art);
  if (opts.trim !== false) { const b = alphaBox(image); if (b.x1 > b.x0) image = crop(image, b); }
  return { image, art, cellX, cellY, palette };
}

// A hand-drawn piece: a text file of palette lines ("K #130f0c", one letter to a colour; K is
// always the keyline) and then the rows of the picture, '.' for transparent, frames separated by
// a line of '---'. The smallest things in the world — a dragonfly ten pixels long, a gull's three
// wing beats, a treble hook — are drawn here pixel by pixel, because no downscale of a render
// decides a one-pixel wing well; the text is the source and diffs like one.
export function parseDrawing(text) {
  const palette = { K: hexToRgb(KEYLINE_HEX) };
  const frames = [[]];
  let inMap = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('#') && !inMap) continue;
    if (!inMap) {
      const m = line.match(/^(\S)\s+#?([0-9a-fA-F]{6})\b/);
      if (m) { if (m[1] !== 'K') palette[m[1]] = hexToRgb(m[2]); continue; }
      if (!line.trim()) continue;
      inMap = true;
    }
    if (line.trim() === '---') { frames.push([]); continue; }
    if (!line.trim() && inMap) continue;
    frames[frames.length - 1].push(line.trim());
  }
  const images = frames.filter((f) => f.length).map((rows) => {
    const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
    const data = Buffer.alloc(w * h * 4);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const rgb = palette[ch];
      if (!rgb) throw new Error(`unknown colour '${ch}' at ${x},${y}`);
      const i = (y * w + x) * 4; data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }));
    return { width: w, height: h, data };
  });
  const w = images[0].width, h = images[0].height;
  images.forEach((img, i) => { if (img.width !== w || img.height !== h) throw new Error(`frame ${i} is ${img.width}x${img.height}, frame 0 is ${w}x${h}`); });
  return images;
}

export function runJob(job) {
  if (job.draw) {
    // `frame` picks one frame of a drawing (a still of an animated piece).
    const drawn = parseDrawing(readFileSync(job.draw, 'utf8'));
    const images = job.frame !== undefined ? [drawn[job.frame]] : drawn;
    let out = images.length > 1 ? strip(images) : images[0];
    if (job.box && images.length === 1) { const [bw, bh] = String(job.box).split('x').map(Number); out = place(out, bw, bh, job.anchor || 'center'); }
    mkdirSync(dirname(job.out), { recursive: true });
    writePng(job.out, out);
    return { out: job.out, width: out.width, height: out.height, frames: images.length, drawn: true };
  }
  const src = readPng(job.in);
  const frames = job.frames ? splitFrames(src, job.frames) : [src];
  const shared = job.frames ? classify(crop(src, alphaBox(src, job.on ?? 128)), job) : null;
  const done = frames.map((f) => gridImage(f, { ...job, trim: job.frames ? true : job.trim }, shared));
  let images = done.map((d) => d.image);
  if (job.frames) {
    const fw = job.frameW || Math.max(...images.map((i) => i.width)), fh = job.frameH || Math.max(...images.map((i) => i.height));
    images = images.map((i) => place(i, fw, fh, job.anchor || 'bottom'));
  } else if (job.box) {
    const [bw, bh] = String(job.box).split('x').map(Number);
    images = images.map((i) => place(i, bw, bh, job.anchor || 'center'));
  }
  const out = job.frames ? strip(images) : images[0];
  mkdirSync(dirname(job.out), { recursive: true });
  writePng(job.out, out);
  return { out: job.out, width: out.width, height: out.height, cell: [done[0].cellX, done[0].cellY].map((v) => Math.round(v * 100) / 100), colors: done[0].palette.length };
}

// Run as a script (not imported by a test or by petSlice.mjs).
const isMain = /pixelGrid\.mjs$/.test(process.argv[1] || '');
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args[i + 1]; };
  const num = (name) => (opt(name) === undefined ? undefined : Number(opt(name)));
  if (opt('batch')) {
    const jobs = JSON.parse(readFileSync(opt('batch'), 'utf8'));
    const only = opt('only') ? opt('only').split(',') : null;
    for (const job of jobs) {
      if (only && !only.includes(job.name)) continue;
      console.log(job.name || job.out, runJob(job));
    }
  } else {
    const [input, output] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
    if (!input || !output) { console.error('usage: pixelGrid.mjs <in.png> <out.png> --rows N | --pitch P [--colors K] [--keyline hex] [--outline force|keep|none] [--box WxH] [--frames N]\n       pixelGrid.mjs --batch jobs.json [--only a,b]'); process.exit(1); }
    if (args.includes('--detect')) {
      const img = readPng(input);
      console.log('x', detectPitch(img, 'x'), 'y', detectPitch(img, 'y'));
    } else {
      console.log(runJob({
        in: input, out: output, draw: input.endsWith('.txt') ? input : undefined, rows: num('rows'), cols: num('cols'), pitch: num('pitch'), colors: num('colors'), keyline: opt('keyline'),
        keyLum: num('key-lum'), keyShare: num('key-share'), alpha: num('alpha'), outline: opt('outline'), box: opt('box'), frames: num('frames'), fit: num('fit'),
      }));
    }
  }
}

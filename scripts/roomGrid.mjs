// Puts the game's chrome paintings on a pixel grid: the three interiors behind the overlays
// (Sal's shop, Marina's outfitters, the trophy wall), the fishing-grounds map, and the plank deck
// the dock panel is drawn on. Like the ground paintings (scripts/backdropGrid.mjs), every one is
// stored at its native art resolution, one file pixel per art pixel, as lossless WebP, so the
// page can draw it `image-rendering: pixelated` at a whole number of CSS px per art pixel.
//
//   node scripts/roomGrid.mjs                    # every job
//   node scripts/roomGrid.mjs shop deck          # just these
//   node scripts/roomGrid.mjs --png DIR ...      # also write each result as a PNG in DIR
//   node scripts/roomGrid.mjs --measure shop     # print the source's pitch per axis
//
// Sources are kept in art/rooms (never the script's own output): the interiors as they shipped
// (lossy WebP, 960 wide, drawn on a coarse ~4-5 px block of their own that is not square on the
// outfitter), and the map's 1536 x 1024 render (see THE MAP below). The deck is not a source at
// all: it is drawn here, from a seed, in the painted docks' own wood (see DECK). Deterministic:
// the same sources give the same files. Needs Playwright's Chromium for WebP (PLAYWRIGHT_MODULE
// and CHROMIUM_PATH override where it is).
//
// Native sizes (one file pixel = one art pixel): shop 254 x 164, outfitter 236 x 120, trophy wall
// 196 x 130, map 396 x 264, deck 192 x 72 (a tile; drawn at 2 CSS px per art px, the chrome's own
// pixel, that is background-size 384px 144px).
//
// THE MAP. The fishing-grounds map (BiomeMap) was an HD illustration in another style, with its
// own painted signposts and a seven-entry legend under the HTML labels, and five of the eleven
// grounds on unpainted terrain. It was redrawn with scripts/generateImage.mjs through the edits
// endpoint, 1536 x 1024, quality high, with three ground paintings on the art grid (river, pier,
// flats, 360 x 203 scaled x4 nearest) attached for the pixel style. The old map attached as a
// reference won every time: the render copied its layout and its painted "TACKLE SHOP" and left
// out the far grounds, so the composition came from a layout sketch instead
// (art/rooms/map_layout.webp: flat regions, tree dots and a coastline where each of the eleven
// grounds goes, laid out so the labels stand in three columns — north the lake, river and swamp;
// the middle the town, beach, pier, bay, salt-marsh creek and charter boat; along the bottom
// Baja's desert, the Flats and the Canyon's deep water), repainted with a prompt that names what
// each sketch region becomes and forbids any text, legend, compass or frame; that render was
// patched where it went wrong (sea painted over a stray strip of trees, land over a corner of sea
// under the mountains) and repainted once more as a whole. The one render kept had a thin olive
// strip left in the open sea south of the pier, cloned over with the sea above it; that is
// art/rooms/map.webp (lossy, q 0.95). Its own block is 3.88 px, so the map is 396 x 264.
//
// What happens to a painting:
//  1. The grid. The source's own blocks set it: per axis, a dynamic programme picks the cell
//     boundaries, each cell floor(pitch) or ceil(pitch) source px (one more either way at the
//     frame's edges), that sit on the strongest colour edges while staying within GRID_SLACK of
//     k * pitch. The pitch is the source's own, measured per axis (--measure; the outfitter's
//     blocks are 4.08 x 4.48 px), so one art pixel is one of its blocks; the file is then
//     cols x rows, and drawn with square pixels.
//  2. The palette: `colours` entries by k-means in OKLab over the source's colours, weighted by
//     count^0.6 so a lamp is not out-voted by the wall, then grown (to `maxColours`) while the
//     cells of smooth regions sit too far from every entry, so a lamp's glow gets the shades it
//     needs and flat wood gets none. Every entry is a colour that occurs in the source.
//  3. The cell rule. A cell takes the palette colour that covers most of it (its inner pixels
//     count more than its rim, where a lossy source smears one block into the next), unless the
//     colour nearest its mean is a close neighbour of that one (a gradient), where the mean's is
//     steadier; a cell carrying enough dark keyline (a third, or an eighth where it is the darker
//     of two cells a thin line straddles) is keyline.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writePng } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENES = path.join(ROOT, 'src/assets/scenes');
const SOURCES = path.join(ROOT, 'art/rooms');

const GRID_SLACK = 1.5; // how far (source px) a cell boundary may move off k * pitch
const GRID_PULL = 0.05; // cost per squared source px of that move, against normalised edge strength
const SMOOTH = 0.02;
const GRADIENT_ERR = 0.018;
const GRADIENT_SHARE = 0.03;
const NEIGHBOUR = 0.06;

// The jobs. pitch: source px per art pixel, per axis (measured with --measure, then fixed here so
// a re-run cannot drift); colours / maxColours: the palette (see step 2).
export const JOBS = {
  shop: { src: 'shop.webp', out: 'shop.webp', pitch: [3.78, 3.9], colours: 40, maxColours: 64 },
  outfitter: { src: 'outfitter.webp', out: 'outfitter.webp', pitch: [4.07, 4.5], colours: 36, maxColours: 56 },
  trophywall: { src: 'trophywall.webp', out: 'trophywall.webp', pitch: [4.9, 4.92], colours: 28, maxColours: 44 },
  map: { src: 'map.webp', out: 'map.webp', pitch: [3.88, 3.88], colours: 56, maxColours: 80 },
  deck: { draw: 'deck', out: 'deck.webp' },
};

// ---------------------------------------------------------------- colour
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i += 1) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export function oklab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- grid
// Boundary strength between source px b-1 and b along one axis (summed colour difference),
// normalised to a mean of 1.
export function edgeProfile({ width: W, height: H, data }, axis) {
  const n = axis === 'x' ? W : H; const g = new Float64Array(n + 2);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const b = axis === 'x' ? x : y; if (b === 0) continue;
    const i = (y * W + x) * 4, j = axis === 'x' ? i - 4 : i - W * 4;
    g[b] += Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
  }
  let mean = 0; for (let b = 1; b < n; b += 1) mean += g[b]; mean /= n - 1;
  for (let b = 0; b < g.length; b += 1) g[b] /= mean || 1;
  return g;
}
// Cell boundaries b[0..cells] along an axis of `end` source px: b[0] = 0, b[cells] = end, each
// boundary within GRID_SLACK of k * pitch (pitch = end / cells), maximising the edge strength the
// boundaries sit on less GRID_PULL per squared px of drift.
export function gridAxis(g, cells, end) {
  const pitch = end / cells; const lo0 = Math.max(1, Math.floor(pitch - 0.5)), hi0 = Math.ceil(pitch + 0.5);
  let prev = new Map([[0, { s: 0, from: null }]]); const back = [prev];
  for (let k = 1; k <= cells; k += 1) {
    const cur = new Map();
    const lo = k === cells ? end : Math.max(1, Math.ceil(k * pitch - GRID_SLACK));
    const hi = k === cells ? end : Math.floor(k * pitch + GRID_SLACK);
    const wLo = k === 1 || k === cells ? 1 : lo0, wHi = k === 1 || k === cells ? hi0 + 1 : hi0;
    for (let b = lo; b <= hi; b += 1) {
      let best = -Infinity, from = null;
      for (let w = wLo; w <= wHi; w += 1) { const p = prev.get(b - w); if (p && p.s > best) { best = p.s; from = b - w; } }
      if (best === -Infinity) continue;
      cur.set(b, { s: best + (k === cells ? 0 : (g[b] || 0) - GRID_PULL * (b - k * pitch) ** 2), from });
    }
    back.push(cur); prev = cur;
  }
  const out = new Array(cells + 1); out[cells] = end;
  for (let k = cells; k > 0; k -= 1) out[k - 1] = back[k].get(out[k]).from;
  return out;
}
// The pitch of a source along one axis: the period whose DP grid lands its boundaries on the
// strongest edges (mean normalised edge strength at the boundaries), over lo..hi.
export function measurePitch(img, axis, lo = 3, hi = 6.5, step = 0.02) {
  const g = edgeProfile(img, axis); const n = axis === 'x' ? img.width : img.height; const res = [];
  for (let p = lo; p <= hi + 1e-9; p += step) {
    const cells = Math.round(n / p); const b = gridAxis(g, cells, n);
    let s = 0; for (let k = 1; k < cells; k += 1) s += g[b[k]]; res.push([n / cells, s / (cells - 1)]);
  }
  return res.sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------- keyline
// A source px is keyline when it is much darker than its 9x9 surroundings, in proportion to the
// painting's own brightness.
function keylineMap({ width: W, height: H, data }) {
  const L = new Float64Array(W * H); let mean = 0;
  for (let i = 0; i < W * H; i += 1) { L[i] = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); mean += L[i]; }
  mean /= W * H;
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y += 1) { let row = 0; for (let x = 0; x < W; x += 1) { row += L[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const minContrast = Math.max(4, 0.25 * mean), maxLum = Math.min(60, Math.max(14, 0.7 * mean));
  const K = new Uint8Array(W * H); const R = 4;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const x0 = Math.max(0, x - R), x1 = Math.min(W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(H, y + R + 1);
    const local = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    const v = L[y * W + x];
    if (v <= maxLum && v <= 0.55 * local && local - v >= minContrast) K[y * W + x] = 1;
  }
  return K;
}

// ---------------------------------------------------------------- palette
function kmeans(points, weights, k, seed) {
  const n = points.length; const rnd = mulberry32(seed);
  const C = []; const dist = new Float64Array(n).fill(Infinity);
  let total = 0; for (let i = 0; i < n; i += 1) total += weights[i];
  let r = rnd() * total, first = 0; for (; first < n - 1 && r > weights[first]; first += 1) r -= weights[first];
  C.push([...points[first]]);
  while (C.length < Math.min(k, n)) {
    const c = C[C.length - 1]; let sum = 0;
    for (let i = 0; i < n; i += 1) { const d = d2(points[i], c); if (d < dist[i]) dist[i] = d; sum += dist[i] * weights[i]; }
    let t = rnd() * sum, pick = 0; for (; pick < n - 1 && t > dist[pick] * weights[pick]; pick += 1) t -= dist[pick] * weights[pick];
    C.push([...points[pick]]);
  }
  for (let it = 0; it < 30; it += 1) {
    const S = C.map(() => [0, 0, 0, 0]); let moved = 0; const lab = new Int32Array(n);
    for (let i = 0; i < n; i += 1) {
      let best = 0, bd = Infinity; for (let c = 0; c < C.length; c += 1) { const d = d2(points[i], C[c]); if (d < bd) { bd = d; best = c; } }
      if (lab[i] !== best) moved += 1; lab[i] = best; const s = S[best], w = weights[i]; s[0] += points[i][0] * w; s[1] += points[i][1] * w; s[2] += points[i][2] * w; s[3] += w;
    }
    for (let c = 0; c < C.length; c += 1) if (S[c][3] > 0) C[c] = [S[c][0] / S[c][3], S[c][1] / S[c][3], S[c][2] / S[c][3]];
    if (!moved) break;
  }
  return C;
}

// ---------------------------------------------------------------- the grid pass
export function regrid(img, { pitch, colours, maxColours, seed = 7 }) {
  const { width: W, height: H, data } = img;
  const cols = Math.round(W / pitch[0]), rows = Math.round(H / pitch[1]);
  const bx = gridAxis(edgeProfile(img, 'x'), cols, W), by = gridAxis(edgeProfile(img, 'y'), rows, H);
  const key = keylineMap(img);
  const N = cols * rows;
  // Source colours, and the palette over them.
  const bins = new Map();
  for (let i = 0; i < W * H; i += 1) { const c = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2]; bins.set(c, (bins.get(c) || 0) + 1); }
  const codes = [...bins.keys()]; const pts = codes.map((c) => oklab(c >> 16, (c >> 8) & 255, c & 255));
  const labOf = new Map(); codes.forEach((c, i) => labOf.set(c, pts[i]));
  const codeAt = (x, y) => { const i = (y * W + x) * 4; return (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]; };
  // Per cell: weighted mean (inner px weight 1, rim px RIM), keyline share, smoothness.
  const RIM = 0.35;
  const cellMean = new Array(N), keyMean = new Array(N), D = new Float64Array(N), smooth = new Uint8Array(N);
  for (let j = 0; j < rows; j += 1) for (let i = 0; i < cols; i += 1) {
    const c = j * cols + i; const m = [0, 0, 0]; const km = [0, 0, 0]; let wsum = 0, nk = 0, n = 0; const labs = [];
    for (let y = by[j]; y < by[j + 1]; y += 1) for (let x = bx[i]; x < bx[i + 1]; x += 1) {
      const lab = labOf.get(codeAt(x, y)); const rim = x === bx[i] || x === bx[i + 1] - 1 || y === by[j] || y === by[j + 1] - 1;
      const w = rim ? RIM : 1; m[0] += lab[0] * w; m[1] += lab[1] * w; m[2] += lab[2] * w; wsum += w; n += 1; labs.push(lab);
      if (key[y * W + x]) { km[0] += lab[0]; km[1] += lab[1]; km[2] += lab[2]; nk += 1; }
    }
    const mean = m.map((v) => v / wsum); let v = 0; for (const lab of labs) v += d2(lab, mean);
    cellMean[c] = mean; keyMean[c] = nk ? km.map((q) => q / nk) : null; D[c] = nk / n; smooth[c] = Math.sqrt(v / n) < SMOOTH ? 1 : 0;
  }
  const wts = codes.map((c) => bins.get(c) ** 0.6);
  const C = kmeans(pts, wts, colours, seed);
  const nearestCode = (lab) => { let best = 0, bd = Infinity; for (let i = 0; i < pts.length; i += 1) { const d = d2(pts[i], lab); if (d < bd) { bd = d; best = i; } } return codes[best]; };
  const pal = [...new Set(C.map(nearestCode))];
  const palLab = pal.map((c) => oklab(c >> 16, (c >> 8) & 255, c & 255));
  const nearest = (lab) => { let best = 0, bd = Infinity; for (let c = 0; c < palLab.length; c += 1) { const d = d2(lab, palLab[c]); if (d < bd) { bd = d; best = c; } } return best; };
  // Grow the palette where smooth regions would band.
  const rnd = mulberry32(seed + 1);
  const smoothCells = []; for (let c = 0; c < N; c += 1) if (smooth[c]) smoothCells.push(c);
  const probe = smoothCells.filter(() => rnd() < Math.min(1, 6000 / (smoothCells.length || 1))).map((c) => cellMean[c]);
  const err = probe.map((m) => Math.sqrt(d2(m, palLab[nearest(m)])));
  let added = 0;
  while (pal.length < maxColours) {
    const bad = []; for (let i = 0; i < probe.length; i += 1) if (err[i] > GRADIENT_ERR) bad.push(i);
    if (bad.length < probe.length * GRADIENT_SHARE) break;
    let best = null, bestGain = 0;
    for (let t = 0; t < 200; t += 1) {
      const cand = probe[bad[Math.floor(rnd() * bad.length)]]; let gain = 0;
      for (const i of bad) { const d = Math.sqrt(d2(probe[i], cand)); if (d < err[i]) gain += err[i] - d; }
      if (gain > bestGain) { bestGain = gain; best = cand; }
    }
    if (!best) break;
    const code = nearestCode(best); if (pal.includes(code)) break;
    pal.push(code); palLab.push(oklab(code >> 16, (code >> 8) & 255, code & 255)); added += 1;
    for (let i = 0; i < probe.length; i += 1) err[i] = Math.min(err[i], Math.sqrt(d2(probe[i], palLab[palLab.length - 1])));
  }
  const nearCache = new Map(); codes.forEach((c, i) => nearCache.set(c, nearest(pts[i])));
  // Cells.
  const out = new Int32Array(N); const keyCol = new Int32Array(N);
  for (let j = 0; j < rows; j += 1) for (let i = 0; i < cols; i += 1) {
    const c = j * cols + i; const hist = new Float64Array(pal.length);
    for (let y = by[j]; y < by[j + 1]; y += 1) for (let x = bx[i]; x < bx[i + 1]; x += 1) {
      const rim = x === bx[i] || x === bx[i + 1] - 1 || y === by[j] || y === by[j + 1] - 1;
      hist[nearCache.get(codeAt(x, y))] += rim ? RIM : 1;
    }
    let dom = 0; for (let k = 1; k < hist.length; k += 1) if (hist[k] > hist[dom]) dom = k;
    const m = nearest(cellMean[c]);
    out[c] = m !== dom && d2(palLab[m], palLab[dom]) < NEIGHBOUR ** 2 ? m : dom;
    keyCol[c] = keyMean[c] ? nearest(keyMean[c]) : -1;
  }
  let keyCells = 0;
  for (let j = 0; j < rows; j += 1) for (let i = 0; i < cols; i += 1) {
    const c = j * cols + i, v = D[c]; if (v < 0.125) continue;
    const L = i > 0 ? D[c - 1] : 0, R = i < cols - 1 ? D[c + 1] : 0, U = j > 0 ? D[c - cols] : 0, Dn = j < rows - 1 ? D[c + cols] : 0;
    if (v >= 1 / 3 || (v >= L && v > R) || (v >= U && v > Dn)) { out[c] = keyCol[c]; keyCells += 1; }
  }
  const rgba = Buffer.alloc(N * 4); const used = new Set(); let lumSum = 0;
  for (let c = 0; c < N; c += 1) { const col = pal[out[c]]; used.add(col); rgba[c * 4] = col >> 16; rgba[c * 4 + 1] = (col >> 8) & 255; rgba[c * 4 + 2] = col & 255; rgba[c * 4 + 3] = 255; lumSum += luma(col >> 16, (col >> 8) & 255, col & 255); }
  return { width: cols, height: rows, data: rgba, colours: used.size, added, meanLum: lumSum / N, keyCells };
}

// ---------------------------------------------------------------- the deck
// The dock panel's floor: horizontal boards seen from above, in the painted docks' own wood (the
// river dock's planks, grain and lit edges, read off its painting on the art grid, with the plank
// signage's keyline and nail greys), one art pixel = one file pixel. It tiles both ways:
// DECK.boards boards of DECK.board rows each (a keyline gap, a lit top edge broken into streaks
// the way the painted planks catch the light, the face, a shade row and a deep shade row), over
// DECK.w columns with DECK.joists joists under them. The nails sit over the joists, two to a
// board, and a board only ever ends over a joist (a butt joint: the keyline, the lit end grain
// after it, the shaded end before it, a pair of nails either side), never over the same joist as
// the boards either side of it. Each board has its own face tone; the grain is streaks along it
// and a knot now and then; everything is placed modulo the tile, so nothing meets a seam. Mean
// luminance 87 and saturation 0.67, the painted docks' 86-101 and 0.70, drawn at the chrome's
// 2 CSS px per art px (background-size 384px 144px, pixelated).
export const DECK = {
  w: 192, board: 12, boards: 6, joists: 3, seed: 5,
  joints: [0, 2, 1, -1, 0, 2], // which joist each board ends over (-1: it runs the whole tile)
  pal: {
    K: '130f0c', // the keyline (the angler's own near-black)
    e: '452815', // deep shade under a board
    d: '573218', // shade row, knot eye, the shaded end of a board
    c: '7a451e', // dark grain, knot ring
    g: '885225', // the darker boards' face, soft grain
    b: '955d2e', // face
    B: '9d6330', // the lighter boards' face
    a: 'a56a33', // light grain
    l: 'b7783b', // lit edge
    h: 'db9b56', // the brightest glint on a lit edge, sparingly
    O: '5d6468', // nail
    o: '8e979c', // nail, lit
  },
};
export function drawDeck({ w, board, boards, joists, joints, seed, pal } = DECK) {
  const h = board * boards; const rnd = mulberry32(seed); const grid = Array.from({ length: h }, () => new Array(w).fill('b'));
  const wrap = (x, y) => [((y % h) + h) % h, ((x % w) + w) % w];
  const set = (x, y, ch) => { const [r, c] = wrap(x, y); grid[r][c] = ch; };
  const get = (x, y) => { const [r, c] = wrap(x, y); return grid[r][c]; };
  const joistX = Array.from({ length: joists }, (_, k) => Math.round((k + 0.5) * w / joists));
  const faces = ['B', 'b', 'g', 'B', 'b', 'B'];
  for (let n = 0; n < boards; n += 1) {
    const y0 = n * board; const face = faces[n % faces.length];
    const darker = { B: 'b', b: 'g', g: 'c' }[face], lighter = { B: 'a', b: 'a', g: 'b' }[face];
    for (let y = y0; y < y0 + board; y += 1) for (let x = 0; x < w; x += 1) set(x, y, face);
    for (let x = 0; x < w; x += 1) { set(x, y0, 'K'); set(x, y0 + board - 2, 'd'); set(x, y0 + board - 1, 'e'); }
    // The lit top edge: streaks of light with gaps of face between them, a glint here and there.
    for (let x = 0; x < w;) {
      const run = 6 + Math.floor(rnd() * 22), gap = 1 + Math.floor(rnd() * 5);
      for (let k = 0; k < run; k += 1) set(x + k, y0 + 1, 'l');
      if (rnd() < 0.45) { const at = x + 1 + Math.floor(rnd() * Math.max(1, run - 4)); for (let k = 0; k < 2 + Math.floor(rnd() * 3); k += 1) set(at + k, y0 + 1, 'h'); }
      x += run + gap;
    }
    // Grain: streaks along the board in the face rows, darker ones long, lighter ones short.
    const streaks = Math.round(w * 0.12);
    for (let s = 0; s < streaks; s += 1) {
      const y = y0 + 2 + Math.floor(rnd() * (board - 4)); const x = Math.floor(rnd() * w); const r = rnd();
      const ch = r < 0.55 ? darker : r < 0.8 ? 'c' : lighter;
      const len = ch === lighter ? 3 + Math.floor(rnd() * 7) : 5 + Math.floor(rnd() * 16);
      for (let k = 0; k < len; k += 1) set(x + k, y, ch);
    }
    // A knot on most boards: a dark eye with the grain parted round it.
    if (rnd() < 0.8) {
      const kx = Math.floor(rnd() * w), ky = y0 + 4 + Math.floor(rnd() * (board - 8));
      for (let k = -1; k <= 2; k += 1) { set(kx + k, ky - 1, 'c'); set(kx + k, ky + 2, 'c'); }
      for (const k of [-4, -3, -2]) { set(kx + k, ky - 1, darker); set(kx + k + 7, ky + 2, darker); }
      set(kx - 2, ky, 'c'); set(kx - 2, ky + 1, 'c'); set(kx + 3, ky, 'c'); set(kx + 3, ky + 1, 'c');
      set(kx - 1, ky, 'd'); set(kx, ky, 'd'); set(kx + 1, ky, 'd'); set(kx + 2, ky, 'c');
      set(kx - 1, ky + 1, 'c'); set(kx, ky + 1, 'd'); set(kx + 1, ky + 1, 'e'); set(kx + 2, ky + 1, 'd');
    }
    // The butt joint, over a joist.
    const joint = joints[n % joints.length];
    joistX.forEach((jx, k) => {
      if (k === joint) {
        for (let y = y0 + 1; y < y0 + board; y += 1) {
          set(jx, y, 'K');
          if (y < y0 + board - 2) { set(jx + 1, y, y === y0 + 1 ? 'h' : 'l'); set(jx - 1, y, 'd'); }
        }
      }
      const at = k === joint ? [jx - 4, jx + 3] : [jx];
      for (const nx of at) for (const ny of [y0 + 3, y0 + board - 5]) { set(nx, ny, 'o'); set(nx + 1, ny, 'O'); set(nx, ny + 1, 'O'); set(nx + 1, ny + 1, 'd'); }
    });
  }
  const rgb = Object.fromEntries(Object.entries(pal).map(([k, v]) => [k, [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]]));
  const data = Buffer.alloc(w * h * 4); let lumSum = 0; const used = new Set();
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const [r, g, b] = rgb[get(x, y)]; const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255; lumSum += luma(r, g, b); used.add(get(x, y));
  }
  return { width: w, height: h, data, colours: used.size, added: 0, meanLum: lumSum / (w * h), keyCells: 0 };
}

// ---------------------------------------------------------------- WebP through Chromium
async function withBrowser(fn) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  try { const page = await browser.newPage(); return await fn(page); } finally { await browser.close(); }
}
async function decodeImage(page, file) {
  if (file.endsWith('.png')) return readPng(file);
  const r = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/webp;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let s = '';
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, b: btoa(s) };
  }, readFileSync(file).toString('base64'));
  return { width: r.w, height: r.h, data: Buffer.from(r.b, 'base64') };
}
// Chromium wraps its lossless bitstream in a VP8X header with an sRGB ICC profile; the file keeps
// only the VP8L chunk, and is decoded again and compared pixel for pixel before it is written.
function vp8lOnly(webp) {
  for (let p = 12; p + 8 <= webp.length;) {
    const type = webp.toString('ascii', p, p + 4), n = webp.readUInt32LE(p + 4);
    if (type === 'VP8L') {
      const chunk = webp.subarray(p, p + 8 + n + (n & 1)); const head = Buffer.alloc(12);
      head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(4 + chunk.length, 4); head.write('WEBP', 8, 'ascii');
      return Buffer.concat([head, chunk]);
    }
    p += 8 + n + (n & 1);
  }
  throw new Error('the encoder did not write a lossless (VP8L) WebP');
}
async function encodeWebp(page, { width, height, data }) {
  const url = await page.evaluate(({ width, height, b64 }) => {
    const bin = atob(b64); const px = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i += 1) px[i] = bin.charCodeAt(i);
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    c.getContext('2d').putImageData(new ImageData(px, width, height), 0, 0);
    return c.toDataURL('image/webp', 1.0);
  }, { width, height, b64: data.toString('base64') });
  const webp = vp8lOnly(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  const diff = await page.evaluate(async ({ width, height, b64, want }) => {
    const img = new Image(); img.src = `data:image/webp;base64,${b64}`; await img.decode();
    if (img.width !== width || img.height !== height) return -1;
    const d = document.createElement('canvas'); d.width = width; d.height = height; const h = d.getContext('2d'); h.drawImage(img, 0, 0);
    const back = h.getImageData(0, 0, width, height).data; const bin = atob(want); let n = 0;
    for (let i = 0; i < back.length; i += 1) if (back[i] !== bin.charCodeAt(i)) n += 1;
    return n;
  }, { width, height, b64: webp.toString('base64'), want: data.toString('base64') });
  if (diff) throw new Error(`WebP round trip changed ${diff} values`);
  return webp;
}

// ---------------------------------------------------------------- main
async function main(argv) {
  const args = [...argv]; let pngDir = null;
  const at = args.indexOf('--png'); if (at >= 0) { pngDir = args[at + 1]; args.splice(at, 2); mkdirSync(pngDir, { recursive: true }); }
  const m = args.indexOf('--measure');
  if (m >= 0) {
    const name = args[m + 1]; const job = JOBS[name]; if (!job?.src) throw new Error(`--measure takes a painting job (${Object.keys(JOBS).filter((k) => JOBS[k].src).join(', ')})`);
    await withBrowser(async (page) => {
      const img = await decodeImage(page, path.join(SOURCES, job.src));
      for (const axis of ['x', 'y']) console.log(`${name} ${axis}: ${measurePitch(img, axis).slice(0, 5).map(([p, s]) => `${p.toFixed(3)} (${s.toFixed(2)})`).join('  ')}`);
    });
    return;
  }
  const names = args.length ? args : Object.keys(JOBS);
  for (const n of names) if (!JOBS[n]) throw new Error(`unknown job ${n} (one of ${Object.keys(JOBS).join(', ')})`);
  await withBrowser(async (page) => {
    for (const name of names) {
      const job = JOBS[name];
      let res;
      if (job.draw) res = drawDeck();
      else {
        const src = await decodeImage(page, path.join(SOURCES, job.src));
        res = regrid(src, job);
      }
      const webp = await encodeWebp(page, res);
      writeFileSync(path.join(SCENES, job.out), webp);
      if (pngDir) writePng(path.join(pngDir, `${name}.png`), res);
      console.log(`${name.padEnd(11)} ${res.width}x${res.height} colours ${String(res.colours).padStart(3)}${res.added ? ` (+${res.added} for gradients)` : ''}  mean lum ${res.meanLum.toFixed(1).padStart(5)}  keyline cells ${res.keyCells}  ${webp.length} B`);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}

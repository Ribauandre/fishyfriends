// Puts the ground paintings on the world's art grid. Every raster on the Cast & Catch stage is
// stored at its native art resolution, one file pixel per art pixel, and drawn at
// rows x ART_PX painting units, pixelated (src/utils/sceneLayout.js: ART_PX = 4/3, WORLD_COLS =
// 360). A painting is 480 x 270 painting units, so it is 360 x 203 art pixels: GameScene draws it
// 203 * ART_PX = 270.67 units tall from the painting's top and the last 0.67 falls outside.
//
//   node scripts/backdropGrid.mjs                     # every ground, day and night
//   node scripts/backdropGrid.mjs river bay_night     # just these
//   node scripts/backdropGrid.mjs --png DIR ...       # also write each result as a PNG in DIR
//   node scripts/backdropGrid.mjs --fit bay           # fit bay_night to bay (prints NIGHT_FIT
//                                                     # candidates; slow, about a minute)
//
// Reads the 960 x 540 paintings kept in art/scenes/<name>.webp (never its own output) and writes
// src/assets/scenes/<name>.webp as lossless WebP (Chromium's canvas encoder at quality 1.0 is
// lossless; the script decodes what it wrote and checks it pixel for pixel). Deterministic: the
// palette is k-means from a seeded start, so the same sources give the same files. Needs
// Playwright's Chromium for WebP (PLAYWRIGHT_MODULE and CHROMIUM_PATH override where it is).
//
// What it does to a painting:
//  1. The grid. The later paintings are already flat pixel art on a ~2.67 source-px grid that
//     wanders a little across the frame, so the cell boundaries are not a fixed lattice: per
//     axis, a dynamic programme picks the column (row) boundaries, each cell 2 or 3 source px,
//     that sit on the strongest colour edges while staying within GRID_SLACK source px of the
//     ideal k * 8/3. On those paintings an art pixel is then one of the painting's own blocks;
//     on the early painterly ones the boundaries fall on the strongest edges.
//  2. The palette: 64 entries by k-means in OKLab over the painting's colours, weighted by
//     count^0.6 so a lamp or the moon is not out-voted by the sky, then grown (to 112 at most)
//     while the cells of smooth regions sit too far from every entry — a sky that would band
//     gets the in-between shades it needs, and a painting of flat blocks gets none. Every entry
//     is a colour that occurs in the source, so nothing new is introduced.
//  3. The cell rule. A cell takes the palette colour that covers most of it, so a flat block
//     stays that block and an edge stays hard — unless the palette colour nearest the cell's
//     mean is a close neighbour of that one (a smooth gradient), where the mean's is steadier.
//     A cell carrying enough dark keyline (source pixels much darker than their surroundings)
//     is keyline (the palette colour nearest the mean of its dark pixels): a third of the cell,
//     or an eighth where it is the darker of the two cells a thin line straddles, so a
//     one-source-px line survives as one art pixel instead of vanishing between two cells.
//  4. Night. The night paintings were repainted from the day ones and came back squashed and
//     shifted (0.85-0.99 of the day painting's height), with black letterbox bars baked in (up
//     to 38 rows). NIGHT_FIT[name]
//     maps a day source px to the night source px that shows the same thing, fitted (--fit) by
//     maximising the correlation of the two paintings' blurred edge maps; the night painting is
//     sampled through it on the day painting's own grid, so the dock, the horizon and the water
//     box are where they are by day, a day/night swap does not move a block, and the bars fall
//     outside the frame. Where the fit still lands outside the night content (the bay's bottom
//     edge, a strip down the canyon's and the pier's left) the day painting fills in under a
//     night grade (see barGrade). The moon is kept round (see findMoon). Then a power curve
//     keeps mean luminance in NIGHT_LUM (the moonlit band), leaving black and white where they
//     are, and no output row may be a bar.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePng } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'art/scenes');
const OUT_DIR = path.join(ROOT, 'src/assets/scenes');
const SRC_W = 960;
const SRC_H = 540;
export const COLS = 360; // WORLD_COLS
export const ROWS = 203; // ceil(270 / ART_PX)
const PITCH = SRC_W / COLS; // 8/3 source px per art pixel
const GRID_SLACK = 2.5; // how far (source px) a cell boundary may move off k * PITCH
const GRID_PULL = 0.04; // cost per squared source px of that move, against normalised edge strength

export const GROUNDS = ['river', 'mountainlake', 'swamp', 'bay', 'shoreline', 'offshore', 'canyon', 'flats', 'pier', 'creek', 'baja', 'mountainlake_winter'];
export const NAMES = GROUNDS.flatMap((g) => [g, `${g}_night`]);

// The palette: K_MEANS entries from k-means, then up to MAX_COLOURS as smooth regions need
// (see step 2 above). A smooth cell is one whose samples lie within SMOOTH (OKLab) of their
// mean; the palette grows while more than GRADIENT_SHARE of them sit further than GRADIENT_ERR
// from every entry. In a cell, the colour nearest the mean beats the dominant one only when the
// two are within NEIGHBOUR of each other.
const K_MEANS = 64;
const MAX_COLOURS = 112;
const SMOOTH = 0.02;
const GRADIENT_ERR = 0.016;
const GRADIENT_SHARE = 0.03;
const NEIGHBOUR = 0.06;

// Night source px = f(day source px), fitted per painting (see the header, step 4):
//   [a0, a1, a2, b0, b1, b2, b3]: x' = a0 + a1 x + a2 y, y' = b0 + b1 y + b2 x + b3 (y/540)^2 540
//     (b3 is 0 where a straight affine map fits as well);
//   { x: [a0, a1, a2], y: [[y, y'], ...] }: the same x', and y' piecewise linear through those
//     rows with no dependence on x — for the flats, whose night painting moved the horizon down
//     20 units but not the skiff, where an affine map could only meet both by tilting the sea
//     (its knots sit on the day horizon, row 118, and the top is pinned so no bar is exposed);
//   { pairs: [[dayX, dayY, nightX, nightY], ...], smooth }: a thin-plate spline through point
//     pairs read off the two paintings (thinPlate) — for the shoreline, whose repaint moved the
//     lamp against its own post and the dock's two ends different ways, which no one map of the
//     whole painting meets (see its entry for how the pairs were read).
// Each was chosen from --fit's affine and quadratic candidates (the quadratic where it scored
// clearly higher) and then checked on the stage with the layout's anchors drawn: the angler on
// the deck, the water box on water, the horizon level and where it is by day. The search is
// multi-start and can settle a few px from these on a re-run, so these, not a re-fit, are what
// the art was checked against.
export const NIGHT_FIT = {
  river: [2.563, 0.98603, -0.00431, 18.625, 0.89526, -0.00263, 0],
  mountainlake: [2.125, 0.99528, -0.00956, 7.375, 1.04927, -0.00825, -0.171],
  swamp: [9.875, 0.94694, 0.00225, 12.875, 0.949, -0.00975, -0.04838],
  bay: [8.375, 1.00041, -0.02812, 9.188, 0.96265, -0.00056, 0],
  // The shoreline's night painting is not one map of its day painting: the repaint moved the
  // lamp 16 units right of its post, the post 6 right, the dock's middle a little left and its
  // end a little right, lifted the deck, lowered the horizon and drew the beach's foot higher.
  // The edge-correlation fit ([14.613, 0.92775, ...]) settled on a map that met none of them —
  // the dock end 12 units right of day, the surf 20-35 units low and a second lamp in empty sky
  // beside the glow. So it is a thin-plate spline through points read off the two paintings by
  // eye at 3-4x: the lamp's glass, the post, the barrel and the posts, the deck's edges, the
  // horizon and the lighthouse, the foam lines, the stones on the sand, and the bars' edges.
  shoreline: {
    smooth: 0.02,
    pairs: [
      // the top edge, below the bar
      [0, 0, 0, 6], [240, 0, 240, 6], [480, 0, 480, 6], [720, 0, 720, 6], [960, 0, 960, 6],
      // the lamp's glass and its post
      [71, 86, 104, 85], [30, 50, 42, 50], [30, 150, 43, 150], [30, 230, 44, 230],
      // the left edge
      [0, 200, 8, 200], [0, 300, 10, 298], [0, 400, 2, 395],
      // the barrel, the posts and the deck
      [74, 215, 81, 215], [29, 300, 41, 298], [193, 212, 187, 212], [230, 262, 226, 250], [230, 330, 226, 325],
      [330, 228, 330, 222], [330, 278, 330, 267], [330, 302, 330, 299],
      [444, 230, 449, 230], [475, 230, 487, 230], [520, 230, 525, 230], [450, 246, 453, 246], [450, 300, 453, 297],
      // the horizon, the lighthouse and the right edge
      [150, 118, 150, 124], [400, 118, 400, 124], [650, 118, 650, 124], [780, 120, 780, 126], [905, 85, 908, 92],
      [960, 120, 960, 125], [960, 250, 960, 248],
      // the foam lines
      [40, 480, 40, 466], [120, 518, 120, 505], [220, 503, 220, 493], [380, 452, 380, 458], [500, 436, 500, 435],
      [560, 475, 560, 468], [590, 420, 590, 425], [800, 375, 800, 369], [866, 367, 870, 361], [920, 338, 915, 322],
      // the stones on the sand, and the bottom edge above the bar
      [500, 520, 500, 498], [610, 522, 610, 496], [740, 512, 740, 493],
      [0, 540, 0, 515], [240, 540, 240, 515], [480, 540, 480, 515], [720, 540, 720, 515], [960, 540, 960, 515],
    ],
  },
  offshore: [-4.887, 0.97506, 0, 11.813, 0.94397, -0.00356, 0],
  canyon: [-14.075, 1.01725, -0.04875, 1.188, 0.92759, 0.00444, 0],
  flats: { x: [50.825, 0.88947, -0.03969], y: [[0, 0], [118, 158.2], [260, 269.5], [400, 399.2], [540, 532.8]] },
  pier: [-36.563, 1.02691, 0.018, 17.625, 0.95387, -0.00056, 0],
  creek: [18.113, 0.99791, -0.06731, 28.875, 0.88978, 0.00075, 0.02044],
  baja: [9.688, 0.93869, -0.00356, 1.313, 0.98163, 0.00938, 0],
  mountainlake_winter: [6.875, 1.00759, -0.03656, 8.5, 0.96734, -0.00056, -0.04219],
};

// Mean luminance (Rec. 709 weights on the sRGB values) a night painting is kept inside.
const NIGHT_LUM = [11, 16];

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
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- grid
// Boundary strength between source px b-1 and b along one axis (summed colour difference).
export function edgeProfile(data, axis) {
  const n = axis === 'x' ? SRC_W : SRC_H;
  const g = new Float64Array(n + 2);
  for (let y = 0; y < SRC_H; y += 1) for (let x = 0; x < SRC_W; x += 1) {
    const b = axis === 'x' ? x : y; if (b === 0) continue;
    const i = (y * SRC_W + x) * 4, j = axis === 'x' ? i - 4 : i - SRC_W * 4;
    g[b] += Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
  }
  let mean = 0; for (let b = 1; b < n; b += 1) mean += g[b]; mean /= n - 1;
  for (let b = 0; b < g.length; b += 1) g[b] /= mean || 1;
  return g;
}
// Cell boundaries b[0..cells] along one axis: b[0] = 0, b[cells] = end, inner cells 2 or 3 px
// (the two edge cells 1-4), each boundary within GRID_SLACK of k * PITCH, maximising the edge
// strength they sit on less GRID_PULL per squared px of drift.
export function gridAxis(g, cells, end) {
  const NEG = -Infinity;
  let prev = new Map([[0, { s: 0, from: null }]]);
  const back = [prev];
  for (let k = 1; k <= cells; k += 1) {
    const cur = new Map();
    const lo = k === cells ? end : Math.max(1, Math.ceil(k * PITCH - GRID_SLACK));
    const hi = k === cells ? end : Math.floor(k * PITCH + GRID_SLACK);
    const widths = k === 1 || k === cells ? [1, 2, 3, 4] : [2, 3];
    for (let b = lo; b <= hi; b += 1) {
      let best = NEG, from = null;
      for (const w of widths) { const p = prev.get(b - w); if (p && p.s > best) { best = p.s; from = b - w; } }
      if (best === NEG) continue;
      const gain = k === cells ? 0 : (g[b] || 0) - GRID_PULL * (b - k * PITCH) ** 2;
      cur.set(b, { s: best + gain, from });
    }
    back.push(cur); prev = cur;
  }
  const out = new Array(cells + 1); out[cells] = end;
  for (let k = cells; k > 0; k -= 1) out[k - 1] = back[k].get(out[k]).from;
  return out;
}

// ---------------------------------------------------------------- night
// Rows of the night source that are content: bars (every pixel at luminance 6 or under) are
// cut, and so are up to three rows of the ramp into them.
export function contentRows(data) {
  const rowStat = (y) => { let s = 0, m = 0; for (let x = 0; x < SRC_W; x += 1) { const i = (y * SRC_W + x) * 4; const L = luma(data[i], data[i + 1], data[i + 2]); s += L; m = Math.max(m, L); } return [s / SRC_W, m]; };
  const stats = Array.from({ length: SRC_H }, (_, y) => rowStat(y));
  let top = 0; while (top < SRC_H && stats[top][1] <= 6) top += 1;
  let bot = SRC_H; while (bot > 0 && stats[bot - 1][1] <= 6) bot -= 1;
  const bars = [top, SRC_H - bot];
  const ref = (a, b) => { let s = 0; for (let y = a; y < b; y += 1) s += stats[y][0]; return s / (b - a); };
  for (let k = 0; k < 3 && top > 0 && stats[top][0] < 0.6 * ref(top + 1, top + 11); k += 1) top += 1;
  for (let k = 0; k < 3 && bot < SRC_H && stats[bot - 1][0] < 0.6 * ref(bot - 11, bot - 1); k += 1) bot -= 1;
  return { top, bot, bars };
}
function piecewise(knots, y) {
  let k = 0; while (k < knots.length - 2 && y > knots[k + 1][0]) k += 1;
  const [[y0, v0], [y1, v1]] = [knots[k], knots[k + 1]]; return v0 + ((y - y0) / (y1 - y0)) * (v1 - v0);
}
// A thin-plate spline through point pairs [dayX, dayY, nightX, nightY] (source px), smoothed by
// `smooth` (0 interpolates the pairs exactly). Solved once per fit and kept.
const TPS = new WeakMap();
const tpsU = (r2) => (r2 > 1e-9 ? r2 * Math.log(r2) : 0);
export function thinPlate(pairs, smooth = 0) {
  const n = pairs.length, m = n + 3; const S = 1 / 100; // work in hundreds of px, so the system is well scaled
  const A = Array.from({ length: m }, () => new Float64Array(m)); const bx = new Float64Array(m), by = new Float64Array(m);
  for (let i = 0; i < n; i += 1) {
    const [xi, yi, ui, vi] = pairs[i];
    for (let j = 0; j < n; j += 1) A[i][j] = tpsU(((xi - pairs[j][0]) * S) ** 2 + ((yi - pairs[j][1]) * S) ** 2) + (i === j ? smooth : 0);
    A[i][n] = 1; A[i][n + 1] = xi * S; A[i][n + 2] = yi * S; A[n][i] = 1; A[n + 1][i] = xi * S; A[n + 2][i] = yi * S;
    bx[i] = ui - xi; by[i] = vi - yi;
  }
  // Gaussian elimination with partial pivoting, both right-hand sides at once
  const M = A.map((row, i) => [...row, bx[i], by[i]]);
  for (let c = 0; c < m; c += 1) {
    let p = c; for (let r = c + 1; r < m; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < m; r += 1) { if (r === c) continue; const t = M[r][c] / M[c][c]; if (!t) continue; for (let k = c; k < m + 2; k += 1) M[r][k] -= t * M[c][k]; }
  }
  const wx = M.map((row, i) => row[m] / row[i]), wy = M.map((row, i) => row[m + 1] / row[i]);
  return (x, y) => {
    let dx = wx[n] + wx[n + 1] * x * S + wx[n + 2] * y * S, dy = wy[n] + wy[n + 1] * x * S + wy[n + 2] * y * S;
    for (let i = 0; i < n; i += 1) { const u = tpsU(((x - pairs[i][0]) * S) ** 2 + ((y - pairs[i][1]) * S) ** 2); dx += wx[i] * u; dy += wy[i] * u; }
    return [x + dx, y + dy];
  };
}
export function mapNight(f, x, y) {
  if (f.pairs) { if (!TPS.has(f)) TPS.set(f, thinPlate(f.pairs, f.smooth || 0)); return TPS.get(f)(x, y); }
  if (!Array.isArray(f)) return [f.x[0] + f.x[1] * x + f.x[2] * y, piecewise(f.y, y)];
  return [f[0] + f[1] * x + f[2] * y, f[3] + f[4] * y + f[5] * x + (f[6] || 0) * (y / SRC_H) ** 2 * SRC_H];
}

// The moon. The fitted map scales the two axes differently (a night painting came back squashed
// more in height than in width), which would draw the moon as an egg — on the flats, whose sky
// the piecewise map compresses to three quarters, as a lozenge. So the moon is found in the
// night painting (the biggest round blob of bright pixels in its upper half) and, within a
// radius of it, the map is replaced by a uniform scale at the map's horizontal scale, easing
// back into the fitted map over a ring as wide again so the glow round it has no seam.
export function findMoon(data, rows) {
  const y0 = rows.top, y1 = Math.floor(rows.top + (rows.bot - rows.top) * 0.5);
  const on = (x, y) => { const i = (y * SRC_W + x) * 4; return luma(data[i], data[i + 1], data[i + 2]) >= 150; };
  const seen = new Uint8Array(SRC_W * SRC_H); let best = null;
  for (let y = y0; y < y1; y += 1) for (let x = 0; x < SRC_W; x += 1) {
    if (seen[y * SRC_W + x] || !on(x, y)) continue;
    const stack = [[x, y]]; seen[y * SRC_W + x] = 1; let n = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y;
    while (stack.length) {
      const [px, py] = stack.pop(); n += 1; sx += px; sy += py; minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (const [qx, qy] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) if (qx >= 0 && qx < SRC_W && qy >= y0 && qy < y1 && !seen[qy * SRC_W + qx] && on(qx, qy)) { seen[qy * SRC_W + qx] = 1; stack.push([qx, qy]); }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1, r = Math.max(w, h) / 2;
    if (n >= 120 && w / h > 0.75 && w / h < 1.33 && n / (Math.PI * r * r) > 0.55 && (!best || n > best.n)) best = { n, cx: (minX + maxX + 1) / 2, cy: (minY + maxY + 1) / 2, r };
  }
  return best;
}
function unmap(fit, tx, ty) { // the day px the fitted map sends to (tx, ty), by Newton's method
  let x = tx, y = ty;
  for (let it = 0; it < 30; it += 1) {
    const [fx, fy] = mapNight(fit, x, y), [ax, ay] = mapNight(fit, x + 1, y), [bx, by] = mapNight(fit, x, y + 1);
    const j = [[ax - fx, bx - fx], [ay - fy, by - fy]], det = j[0][0] * j[1][1] - j[0][1] * j[1][0], ex = tx - fx, ey = ty - fy;
    x += (j[1][1] * ex - j[0][1] * ey) / det; y += (-j[1][0] * ex + j[0][0] * ey) / det;
  }
  return [x, y];
}
function moonMap(fit, moon) {
  if (!moon) return (x, y) => mapNight(fit, x, y);
  const scale = mapNight(fit, 1, 0)[0] - mapNight(fit, 0, 0)[0];
  const [dx, dy] = unmap(fit, moon.cx, moon.cy); const inner = (moon.r * 1.15 + 3) / scale, outer = 2 * inner;
  return (x, y) => {
    const warp = mapNight(fit, x, y), d = Math.hypot(x - dx, y - dy); if (d >= outer) return warp;
    const round = [moon.cx + (x - dx) * scale, moon.cy + (y - dy) * scale]; if (d <= inner) return round;
    const t = (outer - d) / (outer - inner), w = t * t * (3 - 2 * t);
    return [w * round[0] + (1 - w) * warp[0], w * round[1] + (1 - w) * warp[1]];
  };
}

// ---------------------------------------------------------------- keyline
// A source pixel is keyline when it is much darker than its 9x9 surroundings, in proportion to
// the painting's own brightness (so the rule means the same thing on a day and a night painting).
function keylineMap(data) {
  const L = new Float64Array(SRC_W * SRC_H); let mean = 0;
  for (let i = 0; i < SRC_W * SRC_H; i += 1) { L[i] = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]); mean += L[i]; }
  mean /= SRC_W * SRC_H;
  const I = new Float64Array((SRC_W + 1) * (SRC_H + 1));
  for (let y = 0; y < SRC_H; y += 1) { let row = 0; for (let x = 0; x < SRC_W; x += 1) { row += L[y * SRC_W + x]; I[(y + 1) * (SRC_W + 1) + x + 1] = I[y * (SRC_W + 1) + x + 1] + row; } }
  const minContrast = Math.max(4, 0.25 * mean), maxLum = Math.min(70, Math.max(16, 0.75 * mean));
  const K = new Uint8Array(SRC_W * SRC_H); const R = 4;
  for (let y = 0; y < SRC_H; y += 1) for (let x = 0; x < SRC_W; x += 1) {
    const x0 = Math.max(0, x - R), x1 = Math.min(SRC_W, x + R + 1), y0 = Math.max(0, y - R), y1 = Math.min(SRC_H, y + R + 1);
    const local = (I[y1 * (SRC_W + 1) + x1] - I[y0 * (SRC_W + 1) + x1] - I[y1 * (SRC_W + 1) + x0] + I[y0 * (SRC_W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
    const v = L[y * SRC_W + x];
    if (v <= maxLum && v <= 0.55 * local && local - v >= minContrast) K[y * SRC_W + x] = 1;
  }
  return K;
}

// ---------------------------------------------------------------- palette
// Weighted k-means (k-means++ start from a seeded generator, so it is deterministic).
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
  const lab = new Int32Array(n);
  for (let it = 0; it < 30; it += 1) {
    const S = C.map(() => [0, 0, 0, 0]); let moved = 0;
    for (let i = 0; i < n; i += 1) {
      let best = 0, bd = Infinity; for (let c = 0; c < C.length; c += 1) { const d = d2(points[i], C[c]); if (d < bd) { bd = d; best = c; } }
      if (lab[i] !== best) moved += 1; lab[i] = best; const s = S[best], w = weights[i]; s[0] += points[i][0] * w; s[1] += points[i][1] * w; s[2] += points[i][2] * w; s[3] += w;
    }
    for (let c = 0; c < C.length; c += 1) if (S[c][3] > 0) C[c] = [S[c][0] / S[c][3], S[c][1] / S[c][3], S[c][2] / S[c][3]];
    if (moved === 0 && it > 0) break;
  }
  return { C, lab };
}

// ---------------------------------------------------------------- bar fill
// Where the fit still lands outside the night painting's content — in a bar, or past its left or
// right edge (the night painting never had that strip of the scene) — the sample is the day
// painting's own pixel under a night grade learned from the band of content just inside that
// side: the day pixel's brightness is ranked among the day pixels that land in the band, and it
// takes the mean colour of the night pixels at the same rank there (by rank, so the grade is
// monotone and needs no pixel-exact pairs; by brightness, not per channel, so a white cloud does
// not come out a colour the night never had). Null where the band is too thin to learn from,
// and the sample is clamped to the nearest content instead.
const SIDES = ['top', 'bot', 'left', 'right'];
function sideOf(nx, ny, rows) {
  if (ny < rows.top) return 'top';
  if (ny >= rows.bot) return 'bot';
  if (nx < 0) return 'left';
  if (nx >= SRC_W) return 'right';
  return null;
}
function barGrade(src, day, fit, rows, side) {
  const hd = new Float64Array(256); const night = []; let n = 0;
  const inBand = {
    top: (nx, ny) => ny >= rows.top + 2 && ny < rows.top + 36,
    bot: (nx, ny) => ny >= rows.bot - 36 && ny < rows.bot - 2,
    left: (nx) => nx >= 2 && nx < 36,
    right: (nx) => nx >= SRC_W - 36 && nx < SRC_W - 2,
  }[side];
  for (let y = 0; y < SRC_H; y += 1) for (let x = 0; x < SRC_W; x += 1) {
    const [nx, ny] = mapNight(fit, x + 0.5, y + 0.5); if (sideOf(nx, ny, rows) || !inBand(nx, ny)) continue;
    const d = (y * SRC_W + x) * 4, q = (Math.floor(ny) * SRC_W + Math.floor(nx)) * 4;
    hd[Math.round(luma(day[d], day[d + 1], day[d + 2]))] += 1; night.push([luma(src[q], src[q + 1], src[q + 2]), src[q], src[q + 1], src[q + 2]]); n += 1;
  }
  if (n < 2000) return null;
  night.sort((a, b) => a[0] - b[0]);
  const Q = 64; const bins = Array.from({ length: Q }, (_, k) => {
    const part = night.slice(Math.floor((k * n) / Q), Math.max(Math.floor((k * n) / Q) + 1, Math.floor(((k + 1) * n) / Q)));
    return [1, 2, 3].map((c) => Math.round(part.reduce((a, v) => a + v[c], 0) / part.length));
  });
  const lut = new Array(256); let below = 0;
  for (let v = 0; v < 256; v += 1) { const t = (below + hd[v] / 2) / n; below += hd[v]; lut[v] = bins[Math.min(Q - 1, Math.floor(t * Q))]; }
  return lut;
}

// ---------------------------------------------------------------- the grid pass
// src: RGBA 960x540 of the painting to grid; day: the day painting (it sets the grid, and fills
// what a night painting lacks); fit: the night map, or null for a day painting.
export function regrid(src, { day = src, fit = null, colours = K_MEANS, maxColours = MAX_COLOURS, lum = null, seed = 1 } = {}) {
  const bx = gridAxis(edgeProfile(day, 'x'), COLS, SRC_W);
  const by = gridAxis(edgeProfile(day, 'y'), ROWS, SRC_H + 1); // the last cell runs 1-2 px past the edge
  const rows = fit ? contentRows(src) : { top: 0, bot: SRC_H, bars: [0, 0] };
  const key = keylineMap(src); const dayKey = fit ? keylineMap(day) : null;
  const grade = fit ? Object.fromEntries(SIDES.map((side) => [side, barGrade(src, day, fit, rows, side)])) : null;
  const moon = fit ? findMoon(src, rows) : null; const toNight = fit ? moonMap(fit, moon) : null;
  // Samples: every source px of a cell (half-px steps at night, since the map resamples), as a
  // colour and whether it is keyline; start[c] .. start[c + 1] are cell c's.
  const step = fit ? 0.5 : 1;
  const start = new Int32Array(COLS * ROWS + 1); const R = [], G = [], B = [], K = [];
  let filledRows = 0; const filledSamples = Object.fromEntries(SIDES.map((side) => [side, 0]));
  for (let j = 0; j < ROWS; j += 1) {
    let filled = 0, total = 0;
    for (let i = 0; i < COLS; i += 1) {
      start[j * COLS + i] = R.length;
      for (let y = by[j] + step / 2; y < by[j + 1]; y += step) for (let x = bx[i] + step / 2; x < bx[i + 1]; x += step) {
        let sx = x, sy = Math.min(SRC_H - 0.5, y);
        if (fit) {
          const [nx, ny] = toNight(sx, sy); total += 1;
          const side = sideOf(nx, ny, rows); const out = side && grade[side];
          if (side) { filled += 1; filledSamples[side] += 1; }
          if (out) { const d = Math.floor(sy) * SRC_W + Math.min(SRC_W - 1, Math.floor(sx)); const [r, g, b] = out[Math.round(luma(day[d * 4], day[d * 4 + 1], day[d * 4 + 2]))]; R.push(r); G.push(g); B.push(b); K.push(dayKey[d]); continue; }
          sx = nx; sy = ny;
        }
        const px = Math.min(SRC_W - 1, Math.max(0, Math.floor(sx))), py = Math.min(rows.bot - 1, Math.max(rows.top, Math.floor(sy)));
        const p = py * SRC_W + px; R.push(src[p * 4]); G.push(src[p * 4 + 1]); B.push(src[p * 4 + 2]); K.push(key[p]);
      }
    }
    if (fit && filled / total > 0.5) filledRows += 1;
  }
  start[COLS * ROWS] = R.length;
  const N = R.length;
  // Night light: a power curve on each channel that brings mean luminance into lum.
  let gamma = 1;
  if (lum) {
    const meanWith = (gm) => { const t = new Float64Array(256); for (let i = 0; i < 256; i += 1) t[i] = 255 * (i / 255) ** gm; let s = 0; for (let k = 0; k < N; k += 1) s += luma(t[R[k]], t[G[k]], t[B[k]]); return s / N; };
    const m0 = meanWith(1); const target = Math.min(lum[1], Math.max(lum[0], m0));
    if (Math.abs(target - m0) > 0.05) { let lo = 0.3, hi = 3; for (let it = 0; it < 40; it += 1) { const mid = (lo + hi) / 2; if (meanWith(mid) > target) lo = mid; else hi = mid; } gamma = (lo + hi) / 2; }
  }
  const lut = new Uint8Array(256).map((_, i) => Math.round(255 * (i / 255) ** gamma));
  const code = new Int32Array(N); for (let k = 0; k < N; k += 1) code[k] = (lut[R[k]] << 16) | (lut[G[k]] << 8) | lut[B[k]];
  // Palette from every sample's colour.
  const bins = new Map(); for (let k = 0; k < N; k += 1) bins.set(code[k], (bins.get(code[k]) || 0) + 1);
  const codes = [...bins.keys()];
  const pts = codes.map((c) => oklab(c >> 16, (c >> 8) & 255, c & 255));
  const labCache = new Map(); codes.forEach((c, i) => labCache.set(c, pts[i]));
  // Each cell's mean, the mean of its keyline samples, and whether it is smooth (a gradient,
  // not an edge or texture: its samples all lie close to their mean).
  const cellMean = new Array(COLS * ROWS), keyMean = new Array(COLS * ROWS), D = new Float64Array(COLS * ROWS), smooth = new Uint8Array(COLS * ROWS);
  for (let c = 0; c < COLS * ROWS; c += 1) {
    const a = start[c], b = start[c + 1], n = b - a; const mean = [0, 0, 0]; const km = [0, 0, 0]; let nk = 0;
    for (let k = a; k < b; k += 1) { const lab = labCache.get(code[k]); mean[0] += lab[0]; mean[1] += lab[1]; mean[2] += lab[2]; if (K[k]) { km[0] += lab[0]; km[1] += lab[1]; km[2] += lab[2]; nk += 1; } }
    const m = mean.map((v) => v / n); let v = 0; for (let k = a; k < b; k += 1) v += d2(labCache.get(code[k]), m);
    cellMean[c] = m; keyMean[c] = nk ? km.map((x) => x / nk) : null; D[c] = nk / n; smooth[c] = Math.sqrt(v / n) < SMOOTH ? 1 : 0;
  }
  // Palette: k-means over the painting's colours, each entry the source colour nearest its
  // centroid; then, while a smooth region's cells sit further than GRADIENT_ERR from every
  // entry (a sky would band) and there is room, the source colour that closes the most of that
  // error is added.
  const wts = codes.map((c) => bins.get(c) ** 0.6);
  const { C } = kmeans(pts, wts, colours, seed);
  const nearestCode = (lab) => { let best = 0, bd = Infinity; for (let i = 0; i < pts.length; i += 1) { const d = d2(pts[i], lab); if (d < bd) { bd = d; best = i; } } return codes[best]; };
  const pal = [...new Set(C.map(nearestCode))];
  const palLab = pal.map((c) => oklab(c >> 16, (c >> 8) & 255, c & 255));
  const nearest = (lab) => { let best = 0, bd = Infinity; for (let c = 0; c < palLab.length; c += 1) { const d = d2(lab, palLab[c]); if (d < bd) { bd = d; best = c; } } return best; };
  const rnd = mulberry32(seed + 1);
  const smoothCells = []; for (let c = 0; c < COLS * ROWS; c += 1) if (smooth[c]) smoothCells.push(c);
  const probe = smoothCells.filter(() => rnd() < Math.min(1, 8000 / (smoothCells.length || 1))).map((c) => cellMean[c]);
  const err = probe.map((m) => Math.sqrt(d2(m, palLab[nearest(m)])));
  let added = 0;
  while (pal.length < maxColours) {
    const bad = []; for (let i = 0; i < probe.length; i += 1) if (err[i] > GRADIENT_ERR) bad.push(i);
    if (bad.length < probe.length * GRADIENT_SHARE) break;
    let best = null, bestGain = 0;
    for (let t = 0; t < 300; t += 1) {
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
  const TAU2 = NEIGHBOUR ** 2;
  const out = new Int32Array(COLS * ROWS); const keyCol = new Int32Array(COLS * ROWS);
  for (let c = 0; c < COLS * ROWS; c += 1) {
    const hist = new Float64Array(pal.length); for (let k = start[c]; k < start[c + 1]; k += 1) hist[nearCache.get(code[k])] += 1;
    let dom = 0; for (let k = 1; k < hist.length; k += 1) if (hist[k] > hist[dom]) dom = k;
    const m = nearest(cellMean[c]);
    out[c] = m !== dom && d2(palLab[m], palLab[dom]) < TAU2 ? m : dom;
    keyCol[c] = keyMean[c] ? nearest(keyMean[c]) : -1;
  }
  let keyCells = 0;
  for (let j = 0; j < ROWS; j += 1) for (let i = 0; i < COLS; i += 1) {
    const c = j * COLS + i, v = D[c]; if (v < 0.125) continue;
    const L = i > 0 ? D[c - 1] : 0, R = i < COLS - 1 ? D[c + 1] : 0, U = j > 0 ? D[c - COLS] : 0, Dn = j < ROWS - 1 ? D[c + COLS] : 0;
    if (v >= 1 / 3 || (v >= L && v > R) || (v >= U && v > Dn)) { out[c] = keyCol[c]; keyCells += 1; }
  }
  const rgba = Buffer.alloc(COLS * ROWS * 4); const used = new Set(); let lumSum = 0;
  for (let c = 0; c < COLS * ROWS; c += 1) { const col = pal[out[c]]; used.add(col); rgba[c * 4] = col >> 16; rgba[c * 4 + 1] = (col >> 8) & 255; rgba[c * 4 + 2] = col & 255; rgba[c * 4 + 3] = 255; lumSum += luma(col >> 16, (col >> 8) & 255, col & 255); }
  return { rgba, colours: used.size, meanLum: lumSum / (COLS * ROWS), gamma, keyCells, filledRows, filled: fit ? Object.fromEntries(SIDES.filter((side) => filledSamples[side]).map((side) => [side, `${(100 * filledSamples[side] / N).toFixed(2)}%${grade[side] ? '' : ' (clamped)'}`])) : null, palette: pal.length, added, moon, bars: rows.bars, content: [rows.top, rows.bot], grid: { x: bx, y: by } };
}

// ---------------------------------------------------------------- fitting a night painting
// The correlation of the day painting's edge map with the night painting's sampled through a
// map, over the day frame where the map lands on night content. Edges of log-luminance, blurred,
// at 1/f resolution — the night painting is a repaint, so only the big shapes (a dock, a
// horizon, a hull) line up, and the blur is what lets them vote.
export function edgeMap(data, f, sigma) {
  const w = Math.floor(SRC_W / f), h = Math.floor(SRC_H / f); const L = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { let s = 0; for (let yy = 0; yy < f; yy += 1) for (let xx = 0; xx < f; xx += 1) { const i = ((y * f + yy) * SRC_W + x * f + xx) * 4; s += Math.log(3 + luma(data[i], data[i + 1], data[i + 2])); } L[y * w + x] = s / f / f; }
  const blur = (A, sd) => { const r = Math.ceil(3 * sd); const k = []; let ks = 0; for (let i = -r; i <= r; i += 1) { const v = Math.exp(-i * i / 2 / sd / sd); k.push(v); ks += v; } const t = new Float32Array(w * h), o = new Float32Array(w * h); for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { let a = 0; for (let i = -r; i <= r; i += 1) a += k[i + r] * A[y * w + Math.min(w - 1, Math.max(0, x + i))]; t[y * w + x] = a / ks; } for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { let a = 0; for (let i = -r; i <= r; i += 1) a += k[i + r] * t[Math.min(h - 1, Math.max(0, y + i)) * w + x]; o[y * w + x] = a / ks; } return o; };
  const S = blur(L, 0.7); const E = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) E[y * w + x] = Math.hypot(S[y * w + x + 1] - S[y * w + x - 1], S[(y + 1) * w + x] - S[(y - 1) * w + x]);
  return { E: blur(E, sigma), w, h, f };
}
export function fitScore(A, B, f, rows) {
  const { w, h } = A; let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = 2; y < h - 2; y += 1) for (let x = 2; x < w - 2; x += 1) {
    const [nx, ny] = mapNight(f, (x + 0.5) * A.f, (y + 0.5) * A.f);
    if (ny < rows.top || ny >= rows.bot || nx < 0 || nx >= SRC_W) continue;
    const bx = nx / A.f - 0.5, by = ny / A.f - 0.5; const x0 = Math.floor(bx), y0 = Math.floor(by); if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) continue;
    const fx = bx - x0, fy = by - y0, i = y0 * w + x0;
    const b = B.E[i] * (1 - fx) * (1 - fy) + B.E[i + 1] * fx * (1 - fy) + B.E[i + w] * (1 - fx) * fy + B.E[i + w + 1] * fx * fy, a = A.E[y * w + x];
    n += 1; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
  }
  if (n < w * h * 0.6) return -1;
  return (sab / n - (sa / n) * (sb / n)) / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2) + 1e-12);
}
function patternSearch(A, B, rows, p0, steps, iters = 400) {
  let p = [...p0], best = fitScore(A, B, p, rows), st = [...steps];
  for (let it = 0; it < iters; it += 1) {
    let improved = false;
    for (let k = 0; k < p.length; k += 1) for (const sgn of [1, -1]) { const q = [...p]; q[k] += sgn * st[k]; const s = fitScore(A, B, q, rows); if (s > best) { best = s; p = q; improved = true; } }
    if (!improved) { st = st.map((v) => v / 2); if (st[1] < 1e-4 && st[0] < 0.05) break; }
  }
  return { p, s: best };
}
// Multi-start pattern search, coarse to fine: an affine map, then the same with the quadratic
// term. Prints both; which goes into NIGHT_FIT is judged on the stage with the anchors drawn (a
// higher score can still tilt a horizon to meet a hull — the flats needed the piecewise form).
export function fitNight(day, night) {
  const rows = contentRows(night);
  const lvl = (f, sd) => [edgeMap(day, f, sd), edgeMap(night, f, sd)];
  const [A4, B4] = lvl(4, 1.5), [A2, B2] = lvl(2, 1.5), [A1, B1] = lvl(1, 2);
  const seeds = [[0, 1, 0, 0, 1, 0], [0, 1, 0, rows.top, (rows.bot - rows.top) / SRC_H, 0]];
  for (const sy of [0.86, 0.9, 0.94, 0.98, 1]) for (const ty of [-10, 0, 15, 30, 50, 70]) for (const sx of [0.94, 1]) seeds.push([(1 - sx) * 480, sx, 0, ty, sy, 0]);
  let best = { s: -9 };
  for (const { p } of seeds.map((q) => ({ p: q, s: fitScore(A4, B4, q, rows) })).sort((a, b) => b.s - a.s).slice(0, 6)) {
    const r = patternSearch(A4, B4, rows, p, [4, 0.01, 0.01, 4, 0.01, 0.01]); if (r.s > best.s) best = r;
  }
  let aff = patternSearch(A2, B2, rows, best.p, [1, 0.003, 0.003, 1, 0.003, 0.003]);
  aff = patternSearch(A1, B1, rows, aff.p, [0.5, 0.0015, 0.0015, 0.5, 0.0015, 0.0015], 200);
  let quad = patternSearch(A2, B2, rows, [...aff.p, 0], [1, 0.003, 0.003, 1, 0.003, 0.003, 0.003]);
  quad = patternSearch(A1, B1, rows, quad.p, [0.5, 0.0015, 0.0015, 0.5, 0.0015, 0.0015, 0.0015], 200);
  return { identity: fitScore(A1, B1, [0, 1, 0, 0, 1, 0], rows), affine: aff, quadratic: quad, rows };
}

// ---------------------------------------------------------------- WebP through Chromium
async function withBrowser(fn) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  try { const page = await browser.newPage(); return await fn(page); } finally { await browser.close(); }
}
async function decodeWebp(page, file) {
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
// only the VP8L chunk (sRGB is what a browser assumes anyway), and is decoded again and compared
// pixel for pixel before it is written.
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
  const fitAt = args.indexOf('--fit');
  if (fitAt >= 0) {
    const ground = args[fitAt + 1]; if (!GROUNDS.includes(ground)) throw new Error(`--fit takes a ground (one of ${GROUNDS.join(', ')})`);
    await withBrowser(async (page) => {
      const day = await decodeWebp(page, path.join(SRC_DIR, `${ground}.webp`)), night = await decodeWebp(page, path.join(SRC_DIR, `${ground}_night.webp`));
      const r = fitNight(day.data, night.data); const fmt = (p) => `[${p.map((v, i) => +v.toFixed([0, 3].includes(i) ? 3 : 5)).join(', ')}${p.length === 6 ? ', 0' : ''}]`;
      console.log(`${ground}: night content rows ${r.rows.top}-${r.rows.bot}, score as painted ${r.identity.toFixed(3)}`);
      console.log(`  affine    ${r.affine.s.toFixed(3)}  ${ground}: ${fmt(r.affine.p)},`);
      console.log(`  quadratic ${r.quadratic.s.toFixed(3)}  ${ground}: ${fmt(r.quadratic.p)},`);
    });
    return;
  }
  const names = args.length ? args : NAMES;
  for (const n of names) if (!NAMES.includes(n)) throw new Error(`unknown painting ${n} (one of ${NAMES.join(', ')})`);
  await withBrowser(async (page) => {
    const cache = new Map();
    const load = async (n) => { if (!cache.has(n)) cache.set(n, await decodeWebp(page, path.join(SRC_DIR, `${n}.webp`))); return cache.get(n); };
    for (const name of names) {
      const night = name.endsWith('_night'); const ground = night ? name.slice(0, -6) : name;
      const src = await load(name);
      if (src.width !== SRC_W || src.height !== SRC_H) throw new Error(`${name}: expected ${SRC_W}x${SRC_H}, got ${src.width}x${src.height}`);
      const fit = night ? NIGHT_FIT[ground] : null;
      if (night && !fit) throw new Error(`${name}: no NIGHT_FIT for ${ground}`);
      const res = regrid(src.data, { day: night ? (await load(ground)).data : src.data, fit, lum: night ? NIGHT_LUM : null, seed: 7 });
      // Guard: no black bar row may survive.
      for (let j = 0; j < ROWS; j += 1) { let m = 0; for (let i = 0; i < COLS; i += 1) { const k = (j * COLS + i) * 4; m = Math.max(m, luma(res.rgba[k], res.rgba[k + 1], res.rgba[k + 2])); } if (m <= 6) throw new Error(`${name}: output row ${j} is a black bar`); }
      const webp = await encodeWebp(page, { width: COLS, height: ROWS, data: res.rgba });
      writeFileSync(path.join(OUT_DIR, `${name}.webp`), webp);
      if (pngDir) writePng(path.join(pngDir, `${name}.png`), { width: COLS, height: ROWS, data: res.rgba });
      console.log(`${name.padEnd(28)} ${COLS}x${ROWS} colours ${String(res.colours).padStart(3)} (+${res.added} for gradients)  mean lum ${res.meanLum.toFixed(1).padStart(5)}  ${String(webp.length).padStart(6)} B  keyline cells ${res.keyCells}${night ? `  bars ${res.bars.join('/')} -> content rows ${res.content.join('-')}  gamma ${res.gamma.toFixed(3)}  moon ${res.moon ? `r ${res.moon.r.toFixed(0)} at (${res.moon.cx.toFixed(0)}, ${res.moon.cy.toFixed(0)})` : 'none'}  art rows filled from the day painting ${res.filledRows} ${JSON.stringify(res.filled)}` : ''}`);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}

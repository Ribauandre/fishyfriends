// Re-grid the angler onto the world's one art pixel.
//
// Every raster on the stage is stored at its native art resolution and drawn at rows x ART_PX
// painting units, pixelated (sceneLayout's ART_PX, 4/3 of a painting unit), so a pixel on the
// angler is the size of a pixel on the dock he stands on. He is drawn 92 painting units tall, so
// his frame is 92 / ART_PX = 69 art rows. The sheet he was cut from is pixel art at about four
// source pixels to its own art pixel, but a soft and irregular four — every block edge is a
// two-pixel ramp, and the block pitch wanders between three and five — so he came out the
// blurriest thing on the deck, drawn smoothed at 0.68x. This takes the hi-res strips and masks
// that anglerPixelSlice.mjs and anglerPixelMasks.mjs write into art/angler/ (which are kept, and
// are what every rule about his parts is written against) and puts both, in lock-step, onto the
// art grid:
//
//   - the frame is 69 rows of 269 / 69 = 3.9 source pixels, the last ending on the soles, and as
//     many columns of the same size as hold the box, with a column edge on the feet anchor — so
//     the soles stand on a cell edge and the feet anchor is a grid point
//   - every art pixel is one flat palette colour, chosen from what its cell covers, never a mix:
//     the keyline wins a cell it covers most of, a fill wins a cell the keyline barely touches,
//     and a cell between the two is the keyline unless the line it spills from is already drawn
//     in the cell next to it on that side, when it is the fill — which is how a five-pixel line
//     comes out one art pixel wide and the rod keeps its brown core between two lines of keyline;
//     the softened ring between blocks counts for less in the vote than the blocks either side
//   - the small marks inside him (pupils, a mouth, a squint) are drawn again at their own size
//   - where the line round him still comes out two pixels thick, one of the two goes, and the
//     line is closed where the vote left a gap
//   - the fish he holds up, a soft painting where he is flat blocks, gets a few shades of its own
//   - each part is drawn in its own few shades: an in-between colour left in a part becomes the
//     shade it lies nearest, or between
//   - every mask pixel is the part of the source pixels that gave its colour, every keyline pixel
//     is the outline (which the painter never dyes), and the labels the hi-res masks scatter —
//     a fleck of rod in a vest pocket, the reel as jeans, the fish as vest, his teeth as cap —
//     are tidied, since at this size a fleck is a whole art pixel of the wrong dye
//
// It writes src/assets/angler/{action}.png, masks/{action}.png (and masks/preview.png),
// strips.json (the box, the feet, each frame's bounds and rod tip) and paint.json (each part's
// dye base, shades and his skin ramp, measured off the art-res pixels, which are what gets
// painted). ANGLER_OUT writes them somewhere else, to look at before replacing the game's.
// Run anglerPixelSlice.mjs, anglerPixelMasks.mjs, then this; all three are pure Node and
// deterministic.
import { readPng, writePng } from './png.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../art/angler/', import.meta.url).pathname;
const OUT = process.env.ANGLER_OUT || new URL('../src/assets/angler/', import.meta.url).pathname;
const ACTIONS = ['idle', 'walk', 'cast', 'reel', 'celebrate'];
export const PART = { outline: 1, skin: 2, cap: 3, hair: 4, shirt: 5, vest: 6, jeans: 7, boots: 8, rod: 9 };
const NAME = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));

// 92 painting units / ART_PX.
const ROWS = 69;
// The world's keyline: his own near-black, measured off the strips (#130f0c). Every keyline pixel
// on him is this one colour, and every outlined sprite, prop and icon in the game uses it too.
export const KEYLINE = [19, 15, 12];

const hi = JSON.parse(readFileSync(`${SRC}strips.json`, 'utf8'));
const { w: BW, h: BH, feetX: FEET_X } = hi[ACTIONS[0]];
ACTIONS.forEach((a) => { if (hi[a].w !== BW || hi[a].h !== BH || hi[a].feetX !== FEET_X) throw new Error(`${a}: every hi-res strip must share one box`); });
const F = BH / ROWS;

const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

const images = Object.fromEntries(ACTIONS.map((a) => [a, readPng(`${SRC}${a}.png`)]));
const masks = Object.fromEntries(ACTIONS.map((a) => [a, readPng(`${SRC}masks/${a}.png`)]));
ACTIONS.forEach((a) => { if (images[a].width !== masks[a].width || images[a].height !== masks[a].height) throw new Error(`${a}: the hi-res mask does not cover its strip`); });

// The palette, read off the hi-res strips as the mask script reads it — colours within MERGE of
// one another merged, and the rare ones (the softened ring between blocks) snapped to the nearest
// common one — but keeping colours down to PALETTE_SHARE, rarer than the mask script keeps: the
// pink inside his open mouth is only in the celebrate frames, and snapped away it was skin.
const MERGE = 24;
const counts = new Map();
ACTIONS.forEach((a) => {
  const { data } = images[a];
  for (let p = 0; p < data.length / 4; p += 1) {
    if (!data[p * 4 + 3]) continue;
    const k = `${data[p * 4]},${data[p * 4 + 1]},${data[p * 4 + 2]}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
});
const merged = [];
[...counts].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
  const c = k.split(',').map(Number);
  const near = merged.find((e) => dist(e.c, c) <= MERGE);
  if (near) near.n += n; else merged.push({ c, n });
});
const total = merged.reduce((s, e) => s + e.n, 0);
const PALETTE_SHARE = 0.0002;
const palette = merged.filter((e) => e.n / total >= PALETTE_SHARE);
// The near-blacks are the keyline wherever they are (the mask script's `key` family): his pupils
// and the lines drawn inside a part are the same black as the line round him, and the painter
// holds them as drawn.
palette.forEach((e) => { const [r, g, b] = e.c; e.key = lum(e.c) < 40 && Math.max(r, g, b) - Math.min(r, g, b) < 24; });
const snapCache = new Map();
function snap(r, g, b) {
  const k = (r << 16) | (g << 8) | b;
  if (!snapCache.has(k)) {
    let best = 0; let d = Infinity;
    palette.forEach((e, i) => { const dd = dist(e.c, [r, g, b]); if (dd < d) { d = dd; best = i; } });
    snapCache.set(k, best);
  }
  return snapCache.get(k);
}

const NONE = -1; const KEY = -2;

// The columns: an edge on the feet anchor, and as many cells either side as hold the box.
const LEFT = Math.ceil(FEET_X / F); const RIGHT = Math.ceil((BW - FEET_X) / F);
const COLS = LEFT + RIGHT; const X0 = FEET_X - LEFT * F;

// Tuning, in shares of a cell's lit area.
const KEY_STRONG = 0.62; // the keyline covers this much: it is the keyline
const KEY_WEAK = 0.3; // it covers less than this: it is the fill
const OFF_CENTRE = 0.1; // how far off the cell's middle the keyline has to sit to be spilling from one side
const LIT = 0.5; // how much of a cell has to be drawn for it to be drawn

// One hi-res frame → classes: KEY where the mask says outline or the colour is a near-black, else
// the palette entry — and how much each pixel counts in the fill vote. A pixel of a block counts
// in full: it sits in a solid three-by-three of its own colour, or next to one. The softened ring between two blocks does
// not — it is a band a pixel or two wide of an in-between colour with no solid core anywhere
// near — and counts for RING_WEIGHT, so it cannot take a cell from the blocks either side and
// scatter in-between colours along every edge.
const RING_WEIGHT = 0.3;
const SIMILAR = 40;
function classesOf(action, f) {
  const img = images[action]; const mask = masks[action];
  const cls = new Int16Array(BW * BH).fill(NONE); const part = new Uint8Array(BW * BH);
  for (let y = 0; y < BH; y += 1) for (let x = 0; x < BW; x += 1) {
    const i = (y * img.width + f * BW + x) * 4;
    if (!img.data[i + 3]) continue;
    part[y * BW + x] = mask.data[i];
    const k = snap(img.data[i], img.data[i + 1], img.data[i + 2]);
    cls[y * BW + x] = mask.data[i] === PART.outline || palette[k].key ? KEY : k;
  }
  const like = (a, b) => a >= 0 && b >= 0 && (a === b || dist(palette[a].c, palette[b].c) <= SIMILAR);
  const at = (x, y) => (x < 0 || y < 0 || x >= BW || y >= BH ? NONE : cls[y * BW + x]);
  const solid = new Uint8Array(BW * BH);
  for (let y = 0; y < BH; y += 1) for (let x = 0; x < BW; x += 1) {
    const k = cls[y * BW + x];
    if (k < 0) continue;
    let ok = true;
    for (let oy = -1; oy <= 1 && ok; oy += 1) for (let ox = -1; ox <= 1; ox += 1) if (!like(k, at(x + ox, y + oy))) { ok = false; break; }
    if (ok) solid[y * BW + x] = 1;
  }
  const weight = new Float32Array(BW * BH);
  for (let y = 0; y < BH; y += 1) for (let x = 0; x < BW; x += 1) {
    const k = cls[y * BW + x];
    if (k === NONE) continue;
    if (k === KEY || solid[y * BW + x]) { weight[y * BW + x] = 1; continue; }
    let near = false;
    for (let oy = -1; oy <= 1 && !near; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      const nx = x + ox; const ny = y + oy;
      if (nx >= 0 && ny >= 0 && nx < BW && ny < BH && solid[ny * BW + nx] && like(k, cls[ny * BW + nx])) { near = true; break; }
    }
    weight[y * BW + x] = near ? 1 : RING_WEIGHT;
  }
  return { cls, part, weight };
}

// The cells of one frame: what each covers.
function cellsOf({ cls, part, weight: pw }) {
  const cells = [];
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    const sy0 = r * F; const sy1 = sy0 + F; const sx0 = X0 + c * F; const sx1 = sx0 + F;
    const weight = new Map(); const parts = new Map(); let lit = 0; let area = 0; let keyArea = 0; let kx = 0; let ky = 0;
    for (let y = Math.floor(sy0); y < Math.ceil(sy1); y += 1) for (let x = Math.floor(sx0); x < Math.ceil(sx1); x += 1) {
      const wt = (Math.min(sx1, x + 1) - Math.max(sx0, x)) * (Math.min(sy1, y + 1) - Math.max(sy0, y));
      if (wt <= 0) continue;
      area += wt;
      if (x < 0 || x >= BW || y < 0 || y >= BH) continue;
      const k = cls[y * BW + x];
      if (k === NONE) continue;
      lit += wt;
      const vote = k === KEY ? wt : wt * pw[y * BW + x];
      weight.set(k, (weight.get(k) || 0) + vote);
      const pk = `${k}:${part[y * BW + x]}`; parts.set(pk, (parts.get(pk) || 0) + vote);
      if (k === KEY) { keyArea += wt; kx += wt * ((x + 0.5 - sx0) / F - 0.5); ky += wt * ((y + 0.5 - sy0) / F - 0.5); }
    }
    const keyW = keyArea;
    let fill = NONE; let fillW = -1;
    weight.forEach((v, k) => { if (k !== KEY && v > fillW) { fillW = v; fill = k; } });
    cells.push({ r, c, lit: lit / area, K: lit ? keyW / lit : 0, keyArea, kx: keyW ? kx / keyW : 0, ky: keyW ? ky / keyW : 0, fill, parts });
  }
  return cells;
}

// Small drawn marks — his pupils, a nostril, the line of his mouth, a squint, the fish's eye — are
// pieces of keyline standing apart from the line round him. The vote draws them as whatever the
// cells they straddle came to, which at this size is an eye two pixels high in one frame and a
// one-pixel smudge joined to his brow in the next. So each is taken out of the vote's result
// (the cells it gave the keyline go back to their fill) and drawn again on its own: a solid mark
// as a block its own size in art pixels, rounded a little down (MARK_ROUND) and never less than
// one, centred where it is; a mark that is a stroke (a brow, a squint, a grin's line — under
// MARK_SOLID of its box drawn) cell by cell, where it covers MARK_COVER of the cell.
const MARK_MAX = 160; const MARK_ROUND = 0.15; const MARK_SOLID = 0.55; const MARK_COVER = 0.3;
function drawMarks({ cls }, cells, out) {
  const all = pieces(BW, BH, (i) => cls[i] === KEY);
  all.slice(1).forEach((g) => {
    if (g.length > MARK_MAX) return;
    let x0 = BW; let x1 = -1; let y0 = BH; let y1 = -1; let mx = 0; let my = 0;
    g.forEach((i) => { const x = i % BW; const y = (i / BW) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); mx += x + 0.5; my += y + 0.5; });
    mx /= g.length; my /= g.length;
    // How much of each cell the mark covers.
    const cover = new Map();
    g.forEach((i) => {
      const x = i % BW; const y = (i / BW) | 0;
      for (let r = Math.floor(y / F); r <= Math.floor((y + 1) / F) && r < ROWS; r += 1) for (let c = Math.floor((x - X0) / F); c <= Math.floor((x + 1 - X0) / F) && c < COLS; c += 1) {
        if (r < 0 || c < 0) continue;
        const wt = (Math.min((c + 1) * F + X0, x + 1) - Math.max(c * F + X0, x)) * (Math.min((r + 1) * F, y + 1) - Math.max(r * F, y));
        if (wt > 0) cover.set(r * COLS + c, (cover.get(r * COLS + c) || 0) + wt);
      }
    });
    const lit = (i) => out[i] !== NONE;
    cover.forEach((a, i) => { const e = cells[i]; if (out[i] === KEY && e.fill !== NONE && a >= e.keyArea * 0.6) out[i] = e.fill; });
    const bw = x1 - x0 + 1; const bh = y1 - y0 + 1;
    if (g.length >= bw * bh * MARK_SOLID) {
      const cw = Math.max(1, Math.round(bw / F - MARK_ROUND)); const ch = Math.max(1, Math.round(bh / F - MARK_ROUND));
      const c0 = Math.round((mx - X0) / F - cw / 2); const r0 = Math.round(my / F - ch / 2);
      for (let r = r0; r < r0 + ch; r += 1) for (let c = c0; c < c0 + cw; c += 1) if (r >= 0 && c >= 0 && r < ROWS && c < COLS && lit(r * COLS + c)) out[r * COLS + c] = KEY;
    } else {
      cover.forEach((a, i) => { if (lit(i) && a >= F * F * MARK_COVER) out[i] = KEY; });
    }
  });
}

// The line round him is five or six source pixels thick, a little over one art pixel, so where
// the grid falls across it the vote draws it two pixels thick, and a third of his silhouette came
// out with a heavy double line. Where it is two thick — a keyline pixel on the silhouette with
// another inside it and then his colours — one of the two goes: the outer one where its cell was
// mostly outside him anyway (OUTER_LIT), which keeps a rod or a finger its own width, and
// otherwise the inner one, which takes the colour it covered. And a pixel on the silhouette that
// is not keyline, where its cell holds some of the line (EDGE_KEY), is the keyline, so the line
// round him is closed.
const OUTER_LIT = 0.75; const EDGE_KEY = 0.15;
function thinOutline(cells, out) {
  const at = (c, r) => (c < 0 || r < 0 || c >= COLS || r >= ROWS ? NONE : out[r * COLS + c]);
  const outside = (c, r) => at(c, r) === NONE;
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    const i = r * COLS + c;
    if (out[i] !== KEY) continue;
    STEPS.forEach(([dx, dy]) => {
      if (out[i] !== KEY || !outside(c - dx, r - dy)) return;
      if (at(c + dx, r + dy) !== KEY) return;
      const beyond = at(c + 2 * dx, r + 2 * dy);
      if (beyond === KEY || beyond === NONE) return;
      const inner = (r + dy) * COLS + c + dx;
      if (cells[i].lit < OUTER_LIT) out[i] = NONE;
      else if (cells[inner].fill !== NONE) out[inner] = cells[inner].fill;
    });
  }
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    const i = r * COLS + c;
    if (out[i] === NONE || out[i] === KEY) continue;
    if (!STEPS.some(([dx, dy]) => outside(c + dx, r + dy))) continue;
    if (cells[i].K * cells[i].lit >= EDGE_KEY) out[i] = KEY;
  }
}

function gridFrame(action, f) {
  const src = classesOf(action, f);
  const cells = cellsOf(src);
  const out = new Int16Array(COLS * ROWS).fill(NONE);
  const between = [];
  cells.forEach((e) => {
    const i = e.r * COLS + e.c;
    if (e.lit < LIT) return;
    if (e.fill === NONE || e.K >= KEY_STRONG) out[i] = KEY;
    else if (e.K < KEY_WEAK) out[i] = e.fill;
    else between.push(e);
  });
  // The cells between: the most keyline first, so the cell that holds most of a line takes it
  // and the one beside it, holding the rest, sees it there and takes the fill.
  between.sort((p, q) => q.K - p.K);
  between.forEach((e) => {
    const sx = e.kx > OFF_CENTRE ? 1 : e.kx < -OFF_CENTRE ? -1 : 0;
    const sy = e.ky > OFF_CENTRE ? 1 : e.ky < -OFF_CENTRE ? -1 : 0;
    const toward = [];
    if (sx) toward.push([sx, 0]);
    if (sy) toward.push([0, sy]);
    if (sx && sy) toward.push([sx, sy]);
    const keyAt = ([dx, dy]) => { const c = e.c + dx; const r = e.r + dy; return c >= 0 && r >= 0 && c < COLS && r < ROWS && out[r * COLS + c] === KEY; };
    out[e.r * COLS + e.c] = toward.some(keyAt) ? e.fill : KEY;
  });
  drawMarks(src, cells, out);
  thinOutline(cells, out);
  thinOutline(cells, out);
  // The part of each art pixel: the part of the source pixels that gave it its colour.
  const part = new Uint8Array(COLS * ROWS);
  cells.forEach((e) => {
    const i = e.r * COLS + e.c; const k = out[i];
    if (k === NONE) return;
    if (k === KEY) { part[i] = PART.outline; return; }
    let best = 0; let bestW = -1;
    e.parts.forEach((v, pk) => { const [kk, p] = pk.split(':').map(Number); if (kk === k && v > bestW) { bestW = v; best = p; } });
    part[i] = best;
  });
  tidyLabels(part, out.map((k) => (k === NONE ? 0 : 1)), COLS, ROWS);
  const rgb = Array.from(out, (k) => (k === NONE ? null : k === KEY ? KEYLINE : palette[k].c));
  return { cls: out, part, rgb, cells };
}

// Connected pieces of the pixels passing `test`, eight-connected, or bridging gaps up to `reach`.
function pieces(w, h, test, reach = 1) {
  const seen = new Uint8Array(w * h); const out = [];
  for (let s = 0; s < w * h; s += 1) {
    if (seen[s] || !test(s)) continue;
    const run = [s]; seen[s] = 1; const g = [];
    while (run.length) {
      const i = run.pop(); g.push(i);
      const x = i % w; const y = (i / w) | 0;
      for (let oy = -reach; oy <= reach; oy += 1) for (let ox = -reach; ox <= reach; ox += 1) {
        const nx = x + ox; const ny = y + oy;
        if ((!ox && !oy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (seen[n] || !test(n)) continue;
        seen[n] = 1; run.push(n);
      }
    }
    out.push(g);
  }
  return out.sort((a, b) => b.length - a.length);
}

// At the art pixel, a label the hi-res masks scattered a few pixels of becomes a fleck the size
// of a real feature, so what the lock-step grid carried over is tidied the way the mask script
// tidies its own:
//   - the reel is no part: the hi-res masks call it jeans in the frames where he holds it out
//     (blue below his chin, big enough there to pass for a leg), with its highlight as shirt, so a
//     piece of jeans that is not standing on a boot is put back to none, and the cream beside it
//   - a fleck of gear (ISLAND pixels or fewer) inside something else — rod-brown in a vest pocket,
//     the cap's logo read as vest, rod-brown in the fish he holds up — takes the label round it,
//     none included, where most of what is round it (the keyline aside) agrees; the rod is never
//     made skin or hair, since his hand splits it into short pieces that are all rod
// Skin is relabelled only where it is a boot's, and hair only out on his clothes: a sliver of
// cheek between strands of beard is skin however small, and a skin tone that missed it left an
// orange fleck in a deep face.
const ISLAND = 3; const ROD_PIECE = 8; const LEG_REACH = 6; const CAP_GAP = 3;
const GEAR = [PART.cap, PART.shirt, PART.vest, PART.jeans, PART.boots, PART.rod];
function tidyLabels(part, lit, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : part[y * w + x]);
  // The legs are what stands on the boots: a piece of jeans with a boot within LEG_REACH of it
  // (or joined to one that has). The reel is the rest.
  const within = (g, test, reach) => g.some((i) => {
    const x = i % w; const y = (i / w) | 0;
    for (let oy = -reach; oy <= reach; oy += 1) for (let ox = -reach; ox <= reach; ox += 1) { const nx = x + ox; const ny = y + oy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && test(ny * w + nx)) return true; }
    return false;
  });
  const legs = pieces(w, h, (i) => part[i] === PART.jeans);
  const standing = new Set();
  legs.forEach((g) => { if (within(g, (i) => part[i] === PART.boots, LEG_REACH)) g.forEach((i) => standing.add(i)); });
  legs.forEach((g) => {
    if (standing.has(g[0]) || within(g, (i) => standing.has(i), 2)) return;
    const reel = new Set(g);
    g.forEach((i) => { part[i] = 0; });
    for (let i = 0; i < w * h; i += 1) {
      if (part[i] !== PART.shirt) continue;
      const x = i % w; const y = (i / w) | 0;
      let by = false;
      for (let oy = -1; oy <= 1 && !by; oy += 1) for (let ox = -1; ox <= 1; ox += 1) if (reel.has((y + oy) * w + x + ox)) { by = true; break; }
      if (by) part[i] = 0;
    }
  });
  // What is round a piece: a tally of the labels on its eight-neighbourhood, and how many of
  // those were the keyline.
  const around = (g, label) => {
    const mine = new Set(g); const votes = new Map(); let n = 0; let keyline = 0;
    g.forEach((i) => {
      const x = i % w; const y = (i / w) | 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        const j = (y + oy) * w + x + ox; const q = at(x + ox, y + oy);
        if ((!ox && !oy) || mine.has(j) || q === label) continue;
        if (q === PART.outline) { keyline += 1; continue; }
        if (q < 0) continue;
        votes.set(q, (votes.get(q) || 0) + 1); n += 1;
      }
    });
    return { votes, n, keyline };
  };
  // The fish he holds up is no part, but the hi-res masks read its olive back as vest and its
  // pale belly as shirt (olive is vest wherever it is, and cream joined to the vest is shirt),
  // so a vest-coloured fish went rust under a rust vest. The fish is the one place where what is
  // no part, vest and shirt make one piece together with much of it no part — his torso's vest
  // and shirt touch nothing that is no part but the reel, which is a sliver of the whole — so
  // such a piece is all no part.
  pieces(w, h, (i) => lit[i] && (part[i] === 0 || part[i] === PART.vest || part[i] === PART.shirt)).forEach((g) => {
    const none = g.filter((i) => part[i] === 0).length;
    if (none * 100 >= g.length * 35 && none < g.length) g.forEach((i) => { part[i] = 0; });
  });
  // The rod is one long thing, split into long pieces where his hands cross it. Brown the hi-res
  // masks called rod anywhere else — the shading in a vest pocket, the edge of a fist, his belt
  // in one frame out of four — is a few pixels standing apart from every long piece, and went red
  // under a red rod. Such a fleck takes the label most of what is round it carries (the keyline
  // aside), or no part.
  {
    const rod = pieces(w, h, (i) => part[i] === PART.rod);
    const long = rod.filter((g) => g.length >= ROD_PIECE);
    const nearLong = new Uint8Array(w * h);
    long.forEach((g) => g.forEach((i) => {
      const x = i % w; const y = (i / w) | 0;
      for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) { const nx = x + ox; const ny = y + oy; if (nx >= 0 && ny >= 0 && nx < w && ny < h) nearLong[ny * w + nx] = 1; }
    }));
    // A rod is a line, a pixel or two wide and long; a piece of it apart from the longest, against
    // his hair, that is a blob — a pixel of it with more of it on all four sides, and about as
    // wide as it is tall — is the hair at the back of his head, which the hi-res masks gave the
    // rod in a walk frame.
    const set = new Set(); rod.forEach((g) => g.forEach((i) => set.add(i)));
    rod.slice(1).forEach((g) => {
      const blob = g.some((i) => { const x = i % w; const y = (i / w) | 0; return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([ox, oy]) => set.has((y + oy) * w + x + ox) && x + ox >= 0 && x + ox < w); });
      const xs = g.map((i) => i % w); const ys = g.map((i) => (i / w) | 0);
      const bw = Math.max(...xs) - Math.min(...xs) + 1; const bh = Math.max(...ys) - Math.min(...ys) + 1;
      if (blob && Math.max(bw, bh) < 2 * Math.min(bw, bh) && within(g, (i) => part[i] === PART.hair, 1)) g.forEach((i) => { part[i] = PART.hair; });
    });
    rod.forEach((g) => {
      if (part[g[0]] !== PART.rod) return;
      if (g.length >= ROD_PIECE || g.some((i) => nearLong[i])) return;
      const { votes } = around(g, PART.rod);
      const to = votes.size ? [...votes].sort((a, b) => b[1] - a[1])[0][0] : 0;
      g.forEach((i) => { part[i] = to; });
    });
  }
  GEAR.forEach((label) => {
    pieces(w, h, (i) => part[i] === label).forEach((g) => {
      const { votes, n, keyline } = around(g, label);
      if (!n) return;
      const [to, count] = [...votes].sort((a, b) => b[1] - a[1])[0];
      // The dark lines between the fingers of a fist are a brown the hi-res masks called rod.
      // A little rod inside skin all round is his hand's; a rod butt showing past his fist is
      // skin at one end and keyline everywhere else, and stays rod.
      if (label === PART.rod && to === PART.skin && g.length <= 6 && count >= (n + keyline) * 0.7) { g.forEach((i) => { part[i] = PART.skin; }); return; }
      // And the line along the fish's flank is a brown too: rod that lies inside what is no
      // part — more of it round it than keyline, where a rod is drawn between two keylines —
      // is the fish's.
      if (label === PART.rod && to === 0 && n > keyline && count >= n * 0.9) { g.forEach((i) => { part[i] = 0; }); return; }
      if (g.length > ISLAND || count < n * 0.6) return;
      if (label === PART.rod && (to === PART.skin || to === PART.hair)) return;
      g.forEach((i) => { part[i] = to; });
    });
  });
  // His teeth are no part, but in the frames where he grits them the hi-res masks called their
  // cream the cap's, and a navy cap turned his grin navy; so did the glint on the reel in his
  // hands. The cap is its biggest piece and the pieces within CAP_GAP of it (crown, panel and brim
  // are a keyline apart); cream the masks gave the cap anywhere else — in his beard, on the reel —
  // is no part.
  {
    const caps = pieces(w, h, (i) => part[i] === PART.cap);
    if (caps.length > 1) {
      const onHead = new Set(caps[0]);
      let grew = true;
      while (grew) {
        grew = false;
        caps.slice(1).forEach((g) => {
          if (onHead.has(g[0]) || !within(g, (i) => onHead.has(i), CAP_GAP)) return;
          g.forEach((i) => onHead.add(i)); grew = true;
        });
      }
      caps.slice(1).forEach((g) => { if (!onHead.has(g[0])) g.forEach((i) => { part[i] = 0; }); });
    }
  }
  // The lit toe of a boot is a tan that reads as skin, and in a walk frame the hi-res masks gave
  // the whole toe of his front boot to his skin, so a deep tone left him a bare brown toe. Skin
  // that lies against the boot and nothing else of him is the boot's.
  pieces(w, h, (i) => part[i] === PART.skin).forEach((g) => {
    const { votes, n } = around(g, PART.skin);
    if (n && (votes.get(PART.boots) || 0) >= n * 0.6) g.forEach((i) => { part[i] = PART.boots; });
  });
  // A fleck of hair is left alone on his face — a strand of eyebrow is hair — but one out on his
  // clothes, inside a vest, is the garment's.
  pieces(w, h, (i) => part[i] === PART.hair).forEach((g) => {
    if (g.length > ISLAND) return;
    const { votes, n } = around(g, PART.hair);
    if (!n) return;
    const [to, count] = [...votes].sort((a, b) => b[1] - a[1])[0];
    if (GEAR.includes(to) && count >= n * 0.6) g.forEach((i) => { part[i] = to; });
  });
}

// Where the line leaves the rod in a frame: the rod's tip. Each piece of the rod (his hands split
// it) is a line with two ends — found as the two pixels furthest apart along it — and the tip is
// the end furthest from his feet. Not simply the rod pixel furthest from his feet: in the cast
// wind-up the rod bends back over his head and its elbow is further from his feet than its tip.
// A frame he holds no rod in — the last celebrate frame, the fish held up by the tail — has a few
// pixels of brown the masks call rod where the fish meets his fist and nothing more (under
// ROD_MIN), so they are the fish's, no part, and the frame's point is the top of the hand he holds
// up (the skin pixel furthest from his feet), marked `hand`, so the stage can tell a rod tip from
// a raised fist. Points are pixel centres.
const ROD_MIN = 12;
function rodTip(part, w, h, feetX, feetY) {
  const centre = (i) => ({ x: i % w + 0.5, y: ((i / w) | 0) + 0.5 });
  const fromFeet = (i) => { const { x, y } = centre(i); return Math.hypot(x - feetX, y - feetY); };
  const rod = pieces(w, h, (i) => part[i] === PART.rod, 2).filter((g) => g.length >= 3);
  const size = rod.reduce((n, g) => n + g.length, 0);
  if (size >= ROD_MIN) {
    // The furthest pixel along a piece from `start`, stepping as the pieces were found.
    const farthest = (set, start) => {
      const dist = new Map([[start, 0]]); const queue = [start]; let last = start;
      while (queue.length) {
        const i = queue.shift(); last = dist.get(i) >= dist.get(last) ? i : last;
        const x = i % w; const y = (i / w) | 0;
        for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) {
          const n = (y + oy) * w + x + ox;
          if ((!ox && !oy) || x + ox < 0 || x + ox >= w || !set.has(n) || dist.has(n)) continue;
          dist.set(n, dist.get(i) + 1); queue.push(n);
        }
      }
      return last;
    };
    const ends = rod.flatMap((g) => { const set = new Set(g); const a = farthest(set, g[0]); return [a, farthest(set, a)]; });
    const tip = ends.reduce((best, i) => (fromFeet(i) > fromFeet(best) ? i : best));
    return { tip: centre(tip), size };
  }
  for (let i = 0; i < w * h; i += 1) if (part[i] === PART.rod) part[i] = 0;
  let hand = -1;
  for (let i = 0; i < w * h; i += 1) if (part[i] === PART.skin && (hand < 0 || fromFeet(i) > fromFeet(hand))) hand = i;
  return { tip: { ...centre(hand), hand: true }, size: 0 };
}

// ---- Run ----
const frames = Object.fromEntries(ACTIONS.map((a) => [a, Array.from({ length: hi[a].frames }, (_, f) => gridFrame(a, f))]));

// The fish he holds up in the celebrate frames is not drawn like him: it is a soft painting, a
// gradient from its dark back to its pale belly with a silver head, and its pixels snap to a
// scatter of in-between palette colours that came out as grey speckle across a green fish. So
// the fish gets a palette of its own, FISH_SHADES colours clustered from its own pixels, and its
// cells are voted again over those: flat bands, the way the rest of him is drawn. The fish is the
// big piece of what is no part (the reel and his teeth are the small ones).
const FISH_SHADES = 6; const FISH_MIN = 60;
{
  const fish = [];
  ACTIONS.forEach((action) => frames[action].forEach((fr, f) => {
    pieces(COLS, ROWS, (i) => fr.cls[i] >= 0 && fr.part[i] === 0).forEach((g) => { if (g.length >= FISH_MIN) g.forEach((i) => fish.push({ action, f, fr, i })); });
  }));
  // The source pixels each fish cell covers, with their coverage.
  const img = (action) => images[action];
  const cover = ({ action, f, i }) => {
    const r = (i / COLS) | 0; const c = i % COLS;
    const sy0 = r * F; const sy1 = sy0 + F; const sx0 = X0 + c * F; const sx1 = sx0 + F; const px = [];
    for (let y = Math.max(0, Math.floor(sy0)); y < Math.min(BH, Math.ceil(sy1)); y += 1) for (let x = Math.max(0, Math.floor(sx0)); x < Math.min(BW, Math.ceil(sx1)); x += 1) {
      const wt = (Math.min(sx1, x + 1) - Math.max(sx0, x)) * (Math.min(sy1, y + 1) - Math.max(sy0, y));
      const q = (y * img(action).width + f * BW + x) * 4; const d = img(action).data;
      if (wt <= 0 || !d[q + 3]) continue;
      const rgb = [d[q], d[q + 1], d[q + 2]];
      if (palette[snap(...rgb)].key || masks[action].data[q] === PART.outline) continue;
      px.push({ rgb, wt });
    }
    return px;
  };
  const samples = fish.map((e) => ({ ...e, px: cover(e) }));
  const all = samples.flatMap((e) => e.px.map((p) => p.rgb)).sort((a, b) => lum(a) - lum(b));
  if (all.length) {
    let centres = Array.from({ length: FISH_SHADES }, (_, k) => all[Math.floor(((k + 0.5) / FISH_SHADES) * all.length)]);
    const nearest = (rgb) => centres.reduce((best, c, k) => (dist(c, rgb) < dist(centres[best], rgb) ? k : best), 0);
    for (let round = 0; round < 20; round += 1) {
      const sum = centres.map(() => [0, 0, 0, 0]);
      all.forEach((rgb) => { const k = nearest(rgb); sum[k][0] += rgb[0]; sum[k][1] += rgb[1]; sum[k][2] += rgb[2]; sum[k][3] += 1; });
      centres = centres.map((c, k) => (sum[k][3] ? sum[k].slice(0, 3).map((v) => Math.round(v / sum[k][3])) : c));
    }
    samples.forEach(({ fr, i, px }) => {
      if (!px.length) return;
      const votes = centres.map(() => 0);
      px.forEach(({ rgb, wt }) => { votes[nearest(rgb)] += wt; });
      fr.rgb[i] = centres[votes.indexOf(Math.max(...votes))];
    });
    console.log(`fish: ${samples.length} cells over ${new Set(samples.map((e) => `${e.action}${e.f}`)).size} frames, shades ${centres.map((c) => c.join(',')).join(' ')}`);
  }
}

// Each part drawn in its own few shades. What is left of the softened ring between blocks — an
// in-between colour that won a cell here and there — is a shade the part is hardly drawn in
// (under SHADE_SHARE of it) and lies near one it is drawn in (SHADE_NEAR), or on the way between
// two of them or between one and the keyline (a blend, BLEND_OFF off the straight line between
// them); it becomes the nearer. A rare shade that is neither is a feature of its own, drawn on
// purpose — the pink inside his open mouth — and stays. So the stock art is the same short
// palette per part that the painter swaps through.
const SHADE_SHARE = 0.02; const SHADE_NEAR = 40; const BLEND_OFF = 30;
{
  const tally = new Map();
  ACTIONS.forEach((action) => frames[action].forEach(({ rgb, part }) => rgb.forEach((c, i) => {
    if (!c || part[i] === PART.outline) return;
    const t = tally.get(part[i]) || new Map(); const k = c.join(','); t.set(k, (t.get(k) || 0) + 1); tally.set(part[i], t);
  })));
  const remap = new Map();
  tally.forEach((t, p) => {
    const n = [...t.values()].reduce((a, b) => a + b, 0);
    const kept = [...t].filter(([, v]) => v >= n * SHADE_SHARE).map(([k]) => k.split(',').map(Number));
    const ends = [...kept, KEYLINE];
    t.forEach((v, k) => {
      const c = k.split(',').map(Number);
      if (v >= n * SHADE_SHARE || !kept.length) return;
      const near = kept.reduce((best, e) => (dist(e, c) < dist(best, c) ? e : best));
      if (dist(near, c) <= SHADE_NEAR) { remap.set(`${p}:${k}`, near); return; }
      let blend = null; let off = BLEND_OFF;
      ends.forEach((A, ia) => ends.forEach((B, ib) => {
        if (ib <= ia) return;
        const d = [A[0] - B[0], A[1] - B[1], A[2] - B[2]]; const len = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        if (!len) return;
        const tt = ((c[0] - B[0]) * d[0] + (c[1] - B[1]) * d[1] + (c[2] - B[2]) * d[2]) / len;
        if (tt < 0.1 || tt > 0.9) return;
        const o = dist(c, [B[0] + tt * d[0], B[1] + tt * d[1], B[2] + tt * d[2]]);
        if (o <= off) { off = o; blend = tt >= 0.5 ? A : B; }
      }));
      if (blend) remap.set(`${p}:${k}`, blend);
    });
  });
  let moved = 0;
  ACTIONS.forEach((action) => frames[action].forEach(({ rgb, part }) => rgb.forEach((c, i) => {
    if (!c || part[i] === PART.outline) return;
    const to = remap.get(`${part[i]}:${c.join(',')}`);
    if (!to) return;
    rgb[i] = to; moved += 1;
    // A blend that settles on the keyline is the keyline, which the painter never dyes.
    if (to === KEYLINE) part[i] = PART.outline;
  })));
  console.log(`shades: ${moved} pixels moved onto their part's shades`);
}

// Columns nothing is drawn in, in any frame, are trimmed off both sides.
let firstCol = COLS; let lastCol = -1;
ACTIONS.forEach((a) => frames[a].forEach(({ cls }) => {
  for (let i = 0; i < cls.length; i += 1) if (cls[i] !== NONE) { const c = i % COLS; if (c < firstCol) firstCol = c; if (c > lastCol) lastCol = c; }
}));
const W = lastCol - firstCol + 1;
const FEET = { x: LEFT - firstCol, y: ROWS };
console.log(`art grid: ${F.toFixed(4)} source px per art px; frame ${W}x${ROWS}, feet anchor (${FEET.x}, ${FEET.y})`);

mkdirSync(`${OUT}masks/`, { recursive: true });
const strips = {};
const pool = {};
const PREVIEW = {
  [PART.outline]: [18, 18, 22], [PART.skin]: [255, 176, 96], [PART.cap]: [250, 250, 240],
  [PART.hair]: [150, 92, 50], [PART.shirt]: [190, 214, 236], [PART.vest]: [116, 168, 62],
  [PART.jeans]: [64, 122, 216], [PART.boots]: [120, 66, 32], [PART.rod]: [226, 72, 180],
};
const PZ = 3;
const previewW = Math.max(...ACTIONS.map((a) => hi[a].frames)) * W * PZ; const previewH = ACTIONS.length * ROWS * PZ;
const preview = Buffer.alloc(previewW * previewH * 4);
for (let i = 0; i < previewW * previewH; i += 1) { preview[i * 4] = 28; preview[i * 4 + 1] = 28; preview[i * 4 + 2] = 34; preview[i * 4 + 3] = 255; }
const colours = new Set();
ACTIONS.forEach((action, ri) => {
  const n = hi[action].frames;
  const art = Buffer.alloc(W * n * ROWS * 4); const mask = Buffer.alloc(W * n * ROWS * 4);
  const rodTips = []; const bounds = [];
  frames[action].forEach(({ rgb: colour, part }, f) => {
    let bx0 = W; let bx1 = -1; let by0 = ROWS; let by1 = -1;
    for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < W; c += 1) if (colour[r * COLS + c + firstCol]) { bx0 = Math.min(bx0, c); bx1 = Math.max(bx1, c); by0 = Math.min(by0, r); by1 = Math.max(by1, r); }
    bounds.push({ x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 });
    const framePart = new Uint8Array(W * ROWS);
    for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < W; c += 1) framePart[r * W + c] = part[r * COLS + c + firstCol];
    const { tip, size } = rodTip(framePart, W, ROWS, FEET.x, FEET.y);
    rodTips.push(tip);
    console.log(`  ${action}[${f}] rod ${size}px, ${tip.hand ? 'no rod: raised hand' : 'tip'} (${tip.x}, ${tip.y})`);
    for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < W; c += 1) {
      const rgb = colour[r * COLS + c + firstCol]; const p = framePart[r * W + c];
      if (!rgb) continue;
      const t = (r * W * n + f * W + c) * 4;
      art[t] = rgb[0]; art[t + 1] = rgb[1]; art[t + 2] = rgb[2]; art[t + 3] = 255;
      mask[t] = p; mask[t + 3] = 255;
      colours.add(rgb.join(','));
      if (p) (pool[p] = pool[p] || []).push(rgb);
      const pc = PREVIEW[p] || [90, 90, 96];
      for (let yy = 0; yy < PZ; yy += 1) for (let xx = 0; xx < PZ; xx += 1) {
        const q = (((ri * ROWS + r) * PZ + yy) * previewW + (f * W + c) * PZ + xx) * 4;
        preview[q] = pc[0]; preview[q + 1] = pc[1]; preview[q + 2] = pc[2];
      }
    }
  });
  writePng(`${OUT}${action}.png`, { width: W * n, height: ROWS, data: art });
  writePng(`${OUT}masks/${action}.png`, { width: W * n, height: ROWS, data: mask });
  strips[action] = { frames: n, w: W, h: ROWS, feetX: FEET.x, feetY: FEET.y, rodTips, bounds };
});
writePng(`${OUT}masks/preview.png`, { width: previewW, height: previewH, data: preview });
writeFileSync(`${OUT}strips.json`, `${JSON.stringify(strips, null, 2)}\n`);
console.log(`${colours.size} colours`);

// paint.json, measured off the art-res pixels as the mask script measures it off the hi-res ones.
// Each part's dye base is the mean of its lighter half, so a pale dye lands under white rather
// than blowing out. His skin ramp is four bands at the quartiles of the skin's brightness, without
// the drawing's own lines. Each part's shades are the palette colours it is drawn in (two percent
// of the part or more), darkest first, with `main` the one it is mostly drawn in — the table a dye
// swaps through (anglerPaint's swapShade).
const mean = (list) => list.reduce((acc, c) => acc.map((v, k) => v + c[k]), [0, 0, 0]).map((v) => Math.round(v / list.length));
const base = {};
Object.entries(pool).forEach(([p, list]) => { const sorted = [...list].sort((a, b) => lum(a) - lum(b)); base[NAME[p]] = mean(sorted.slice(Math.floor(sorted.length / 2))); });
const skin = (pool[PART.skin] || []).filter((c) => lum(c) >= 20).sort((a, b) => lum(a) - lum(b));
const body = [0, 1, 2, 3].map((q) => mean(skin.slice(Math.floor(skin.length * q / 4), Math.max(Math.floor(skin.length * (q + 1) / 4), Math.floor(skin.length * q / 4) + 1))));
const shades = {};
Object.entries(pool).forEach(([p, list]) => {
  if (Number(p) === PART.outline || Number(p) === PART.skin) return;
  const tally = new Map();
  list.forEach((c) => { const k = c.join(','); tally.set(k, (tally.get(k) || 0) + 1); });
  const kept = [...tally].filter(([, n]) => n / list.length >= 0.02).map(([k, n]) => ({ c: k.split(',').map(Number), n })).sort((a, b) => lum(a.c) - lum(b.c));
  const main = kept.reduce((best, e, i) => (e.n > kept[best].n ? i : best), 0);
  shades[NAME[p]] = { main, list: kept.map((e) => e.c) };
});
writeFileSync(`${OUT}paint.json`, `${JSON.stringify({ base, body, shades }, null, 2)}\n`);
console.log(JSON.stringify({ base, body }));

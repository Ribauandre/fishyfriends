// Slice art/angler-pixel-sheet.png into the angler's strips.
//
// This sheet is not like the ones before it. It is real pixel art — a small character drawn on a
// coarse grid — but it arrives as a large, softened render of that art: every native pixel is a
// block about eight screen pixels across, and the compression has left each block a cloud of
// near-identical colours rather than one. So the job here is to find the grid the artist actually
// drew on and average each block back down to the single colour it was, which is the only way to
// get art this size looking the way it was drawn instead of like a photograph of itself.
//
// Nothing about that grid is safe to assume. The model drew the table of panels freehand, so the
// panels are not the same width (216 to 222) or height (249 to 276), and the lattice inside one
// does not have to share a phase with the next. Each cell is therefore measured on its own, by
// the one property that actually defines the lattice: inside a real block every pixel is the same
// colour, so the right period and phase are the ones that make the colour variance within blocks
// smallest. Guessing a period from the panel width instead would drift by a pixel across the row
// and smear every edge on the far side of the sheet.
//
// Rows are IDLE, WALK, CAST, REEL IN, CELEBRATE, four frames each. There is no HURT row, which the
// game wants for a lost fish; `strips.json` records what is here and FishingGame decides what to
// show when a fish comes off.

import { readPng, writePng } from './png.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const SHEET = new URL('../art/angler-pixel-sheet.png', import.meta.url).pathname;
const OUT = new URL('../src/assets/angler/', import.meta.url).pathname;
const ROWS = ['idle', 'walk', 'cast', 'reel', 'celebrate'];

const sheet = readPng(SHEET);
const { width: W, height: H, data: D } = sheet;
const lum = (x, y) => { const p = (y * W + x) * 4; return 0.299 * D[p] + 0.587 * D[p + 1] + 0.114 * D[p + 2]; };

// The panel borders are the only near-black lines that run the whole way across the sheet, so they
// are found as columns and rows that are mostly dark rather than by measuring in from the edge.
function lines(count, span, dark) {
  const frac = [];
  for (let i = 0; i < count; i += 1) {
    let n = 0;
    for (let j = 0; j < span; j += 1) n += dark(i, j) ? 1 : 0;
    frac.push(n / span);
  }
  const runs = []; let start = -1;
  for (let i = 0; i < count; i += 1) {
    if (frac[i] > 0.55) { if (start < 0) start = i; } else if (start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (start >= 0) runs.push([start, count - 1]);
  return runs;
}

const vert = lines(W, H, (x, y) => lum(x, y) < 90);
const horz = lines(H, W, (y, x) => lum(x, y) < 90);
if (vert.length !== 5 || horz.length !== 6) {
  throw new Error(`expected a 4x5 table of panels, found ${vert.length - 1} columns and ${horz.length - 1} rows`);
}
// One pixel clear of the border line on each side, so no cell carries a slice of its own frame.
const cells = (runs) => runs.slice(0, -1).map((run, i) => [run[1] + 2, runs[i + 1][0] - 1]);
const COLS = cells(vert);
const ROWBANDS = cells(horz);

// The background goes before anything is averaged, and at the sheet's own resolution, because that
// is where it can be done cleanly: the figure is drawn with a near-black keyline all the way round
// it, eight screen pixels thick here, and a flood coming in from the edge of the cell simply stops
// against that. Averaging first and cutting after is what leaves a blue rim on everything — a
// block straddling the keyline comes out a blend of background and outline, and no threshold on
// that blend is right everywhere.
//
// What counts as background is the sky and the drop shadow under his boots, and the whole
// difficulty is that his jeans are very nearly the sky's colour: (38,99,147) against (36,146,189).
// Every rule that tried to separate them on blueness, or on darkness, or on both, failed on some
// pose — the flood walked in between his boots and hollowed out both legs.
//
// So the sky is not flooded for at all. It is a flat colour the artist filled every panel with,
// over a million pixels of it within a few steps of one value, and nothing on him comes near it:
// his jeans are ninety away from it in sum, and the reel and the lure are further. Matching it
// outright, wherever it lies, settles the sky in one pass — and, more to the point, settles the
// sky the figure has *closed around*. A flood can only reach what is open to the edge of the
// panel, and in a wide stance the gap between his legs is not: the shadow at his boots seals the
// bottom of it, and what a flood leaves behind there is a bright blue puddle standing between his
// knees.
//
// That leaves the shadow, and the softened blend around everything the render touched. The shadow
// is blue but far too dark to match, and it is starved of red where the sky and the jeans both sit
// at about r=37, so the flood proper runs outward from the sky on that and stops at his jeans,
// which are red enough to be his in every pose.
//
// The blend is the other half, and it cannot be had on colour: a pixel halfway between the sky and
// a white fishing line is a pale blue that is neither. What is true of it is that it is *near* the
// sky — a pixel or two of softening, no more — so it is taken by reach instead, a blue pixel
// within BLEND_REACH of sky being sky that got smeared. His keyline is eight pixels thick here, so
// a reach of three cannot cross it into the jeans behind, and the trailing leg he walks on, which
// is the darkest denim in the sheet, stays his. Left in, that blend is a halo: it is what fattened
// the drawn line past one pixel and so past the test below that takes the line out, and printed a
// pale streak down the side of every rod in the sheet.
const SKY_NEAR = 60;
const OUTLINE_RED = 12;
const BLEND_REACH = 3;
// Blue enough to be sky, shadow, or the blend between them. The second clause is for the last
// pixels of the boots' shadow, which the render leaves at about (6,32,42): blue-leaning but only
// thirty-six apart in red against blue, just under the bar, so they survived as a faint dark line
// under his feet in the cast frames. Nothing of his is that starved of red — his keyline is
// near-black in all three channels, and the darkest denim in the sheet still has twice this red —
// and in any case the reach budget below is what actually keeps the flood out of his jeans, not
// this test.
const isBlue = (p4) => (D[p4 + 2] - D[p4] > 45 || (D[p4] < OUTLINE_RED && D[p4 + 2] - D[p4] > 18)) && D[p4 + 2] > D[p4 + 1];
const isDim = (p4) => isBlue(p4) && D[p4] < OUTLINE_RED;

// The panel's own sky, read off its border ring rather than assumed, so a panel tinted differently
// from its neighbours is still measured against itself.
function skyColour([x0, x1], [y0, y1]) {
  const tally = new Map();
  const add = (x, y) => {
    const p4 = (y * W + x) * 4;
    const key = `${D[p4]},${D[p4 + 1]},${D[p4 + 2]}`;
    tally.set(key, (tally.get(key) || 0) + 1);
  };
  for (let x = x0; x < x1; x += 1) { add(x, y0); add(x, y1 - 1); }
  for (let y = y0; y < y1; y += 1) { add(x0, y); add(x1 - 1, y); }
  const best = [...tally].sort((a, b) => b[1] - a[1])[0][0];
  return best.split(',').map(Number);
}

function backgroundMask([x0, x1], [y0, y1]) {
  const w = x1 - x0; const h = y1 - y0;
  const sky = skyColour([x0, x1], [y0, y1]);
  const isSky = (p4) => Math.abs(D[p4] - sky[0]) + Math.abs(D[p4 + 1] - sky[1]) + Math.abs(D[p4 + 2] - sky[2]) <= SKY_NEAR;
  const seen = new Uint8Array(w * h);
  // How far the blend has been walked to reach this pixel, which is all it is allowed to spend.
  const spent = new Uint8Array(w * h).fill(255);
  let frontier = [];
  const push = (x, y, cost) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (cost >= spent[i]) return;
    const p4 = ((y + y0) * W + x + x0) * 4;
    if (!isSky(p4) && !isBlue(p4)) return;
    spent[i] = cost; seen[i] = 1; frontier.push(i);
  };
  // Every pixel of sky is a seed, so an enclosed pocket of it needs no way out to count. The
  // border needs no seeding of its own: it is sky, and where it is not — a boot run off the edge
  // of its panel — it is not background either.
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (isSky(((y + y0) * W + x + x0) * 4)) push(x, y, 0);
  // Breadth first, so every pixel is reached by its cheapest route before anything is spent past
  // it. Sky costs nothing to cross, and neither does the red-starved dark of an outline or a
  // boot's shadow, which is a colour he has nowhere in the sheet. Only the blend is rationed.
  while (frontier.length) {
    const wave = frontier;
    frontier = [];
    wave.forEach((i) => {
      const x = i % w; const y = (i / w) | 0;
      const p4 = ((y + y0) * W + x + x0) * 4;
      const cost = isSky(p4) || isDim(p4) ? spent[i] : spent[i] + 1;
      if (cost > BLEND_REACH) return;
      push(x - 1, y, cost); push(x + 1, y, cost); push(x, y - 1, cost); push(x, y + 1, cost);
    });
  }
  return seen;
}

// Cut one cell out at the sheet's own resolution. Nothing is averaged down.
//
// An earlier version of this script did average it down, onto a lattice it went to some trouble to
// find, on the theory that the sheet was a small pixel-art character delivered as a large soft
// render of itself and the job was to recover the small character. That theory was wrong, and the
// way it was wrong is worth writing down because the measurement that seemed to support it was
// bad. Within-block colour variance falls monotonically as the block shrinks — at one pixel per
// block it is zero — so "the period that minimises variance" has no minimum to find, and what it
// actually reports is whatever the bottom of the search range was. The range was set from a coarse
// first guess of eight, so it dutifully answered about eight, and the answer looked plausible.
//
// Two checks say otherwise. Scoring periods by how much more the colour changes *on* the candidate
// lattice lines than between them — which does have a real maximum — gives no clear winner at all
// here: the best contrast is about 1.4, and it lands on 8.2, 9.9 and 10.8 depending on the axis.
// And flattening a cell onto the detected lattice next to the cell itself is plainly worse: the
// eyes, the vest pockets, the rod guides and the boot laces are all finer than any such block.
//
// So this sheet is not a coarse grid softened; it is simply drawn finer than that, in a style that
// reads as pixel art. Averaging it threw away real detail and is what made him chunky on the
// stage. He is cut at the resolution the artist drew him.
function cell([x0, x1], [y0, y1]) {
  const bg = backgroundMask([x0, x1], [y0, y1]);
  const w = x1 - x0; const h = y1 - y0;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x;
    if (bg[i]) continue;
    const p4 = ((y + y0) * W + x + x0) * 4;
    for (let k = 0; k < 3; k += 1) data[i * 4 + k] = D[p4 + k];
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

// The sheet draws a fishing line and a bobber on the end of it; the game draws its own line from
// the rod tip, so they go. A drawn line is unmistakable: it is the artist's white, it is thin, and
// it runs straight for a long way. Nothing on him is both — the palest things he owns are the
// shirt, the rod's guides and the reel, and none of those is a long thin stroke. Cutting the line
// leaves the bobber hanging on nothing, and keepFigure takes it from there.
//
// Both numbers are in the sheet's own pixels. The averaged-down version of this script measured
// the same line as one pixel wide and six long; at the resolution he is actually drawn at, that is
// the width the artist strokes a line at — about eight — times as much.
const LINE_MIN = 48;
const LINE_MAX_THICK = 12;
function stripLine(img) {
  const { width: w, height: h, data } = img;
  const pale = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    if (!data[i * 4 + 3]) continue;
    const r = data[i * 4]; const g = data[i * 4 + 1]; const b = data[i * 4 + 2];
    if (0.299 * r + 0.587 * g + 0.114 * b > 185 && Math.max(r, g, b) - Math.min(r, g, b) < 50) pale[i] = 1;
  }
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start += 1) {
    if (seen[start] || !pale[start]) continue;
    const stack = [start]; seen[start] = 1; const group = [];
    while (stack.length) {
      const i = stack.pop(); group.push(i);
      const x = i % w; const y = (i / w) | 0;
      NEIGHBOURS.forEach(([ox, oy]) => {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const n = ny * w + nx;
        if (seen[n] || !pale[n]) return;
        seen[n] = 1; stack.push(n);
      });
    }
    let x0 = w; let x1 = -1; let y0 = h; let y1 = -1;
    group.forEach((i) => {
      const x = i % w; const y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    });
    const bw = x1 - x0 + 1; const bh = y1 - y0 + 1;
    if (Math.min(bw, bh) <= LINE_MAX_THICK && Math.max(bw, bh) >= LINE_MIN) group.forEach((i) => { data[i * 4 + 3] = 0; });
  }
  return img;
}

// He is one piece. The sheet draws a fishing line and its bobber as well, and those float clear of
// him in the air; the game draws its own line from the rod tip, so whatever is not joined to the
// figure is not his and goes. Anything he is actually holding — the rod, a fish — is joined to a
// hand and stays.
// Eight-connected, because the artist steps a silhouette across by one pixel at a time and a leg
// can hang off the hip by a single diagonal. Four-connectivity calls that a separate object, and
// it threw away both legs in half the cast and celebrate frames — the largest piece it could find
// there was the torso.
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function keepFigure(img) {
  const { width: w, height: h, data } = img;
  const seen = new Int32Array(w * h).fill(-1);
  let best = null;
  for (let start = 0; start < w * h; start += 1) {
    if (seen[start] >= 0 || !data[start * 4 + 3]) continue;
    const run = [start]; seen[start] = start; const group = [];
    while (run.length) {
      const i = run.pop(); group.push(i);
      const x = i % w; const y = (i / w) | 0;
      NEIGHBOURS.forEach(([ox, oy]) => {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const n = ny * w + nx;
        if (seen[n] >= 0 || !data[n * 4 + 3]) return;
        seen[n] = start; run.push(n);
      });
    }
    if (!best || group.length > best.length) best = group;
  }
  const keep = new Set(best);
  let dropped = 0;
  for (let i = 0; i < w * h; i += 1) if (!keep.has(i) && data[i * 4 + 3]) {
    if (process.env.MARKDROP) { data[i * 4] = 255; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; } else data[i * 4 + 3] = 0;
    dropped += 1;
  }
  // Worth saying out loud. What this is meant to drop is the odd orphan the sheet leaves in the
  // air — a bobber, a whip mark — and those are a handful of pixels each. Anything larger is a
  // piece of him that came adrift, which is the failure this step can cause rather than one it
  // fixes, so it is reported rather than swallowed.
  img.dropped = dropped;
  return img;
}

// Where he stands. The feet are the bottom of the figure, and the frames are hung on that rather
// than on the cell, because the artist did not place him at the same height in every panel and a
// character who bobs a pixel between frames reads as a glitch.
function feet(img) {
  const { width: w, height: h, data } = img;
  let bottom = -1; let x0 = w; let x1 = -1;
  for (let y = h - 1; y >= 0 && bottom < 0; y -= 1) {
    for (let x = 0; x < w; x += 1) if (data[(y * w + x) * 4 + 3]) { bottom = y; break; }
  }
  // The widest part of the bottom three rows is the pair of boots; its middle is where he stands.
  for (let y = Math.max(0, bottom - 2); y <= bottom; y += 1) {
    for (let x = 0; x < w; x += 1) if (data[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
  }
  return { x: Math.round((x0 + x1) / 2), y: bottom };
}

function bounds(img) {
  const { width: w, height: h, data } = img;
  let x0 = w; let x1 = -1; let y0 = h; let y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (!data[(y * w + x) * 4 + 3]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, x1, y0, y1 };
}

const frames = ROWS.map((action, r) => COLS.map((col, i) => {
  const img = keepFigure(stripLine(cell(col, ROWBANDS[r])));
  if (img.dropped > 600) console.log(`  ! ${action} frame ${i + 1}: ${img.dropped}px came off as detached`);
  return { img, feet: feet(img), bounds: bounds(img) };
}));


// One box for every frame in every strip, so a pose never shifts the sprite on the stage. It is
// the smallest box that holds every frame once they are all hung on their feet.
let left = 0; let right = 0; let up = 0; let down = 0;
frames.flat().forEach(({ feet: f, bounds: b }) => {
  left = Math.max(left, f.x - b.x0); right = Math.max(right, b.x1 - f.x);
  up = Math.max(up, f.y - b.y0); down = Math.max(down, b.y1 - f.y);
});
const BOX_W = left + right + 1; const BOX_H = up + down + 1;
const FEET_X = left; const FEET_Y = up;

mkdirSync(OUT, { recursive: true });
const strips = {};
ROWS.forEach((action, r) => {
  const row = frames[r];
  const w = BOX_W * row.length;
  const data = Buffer.alloc(w * BOX_H * 4);
  row.forEach(({ img, feet: f }, i) => {
    for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
      const s = (y * img.width + x) * 4;
      if (!img.data[s + 3]) continue;
      const tx = i * BOX_W + FEET_X + (x - f.x); const ty = FEET_Y + (y - f.y);
      if (tx < 0 || ty < 0 || tx >= w || ty >= BOX_H) continue;
      const t = (ty * w + tx) * 4;
      for (let k = 0; k < 4; k += 1) data[t + k] = img.data[s + k];
    }
  });
  writePng(`${OUT}${action}.png`, { width: w, height: BOX_H, data });
  strips[action] = { frames: row.length, w: BOX_W, h: BOX_H, feetX: FEET_X, feetY: FEET_Y };
  console.log(`${action}.png — ${row.length} frames`);
});
writeFileSync(`${OUT}strips.json`, `${JSON.stringify(strips, null, 2)}\n`);
console.log(`box ${BOX_W}x${BOX_H}, feet at (${FEET_X}, ${FEET_Y})`);

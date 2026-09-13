// Slice art/angler-pixel-sheet.png into the angler's strips.
//
// This sheet is flat pixel art on a transparent ground: five labelled rows — IDLE, WALK, CAST,
// REEL IN, CELEBRATE — of four frames each, every block of the drawing one colour, a black keyline
// round everything, and nothing behind him. The two hard problems the sheets before it posed are
// simply not here: there is no sky to tell his jeans from (the ground is alpha, so "on" is alpha
// at or over half), and there is no grid to find and average onto (he is cut at the resolution he
// is drawn at, and the box is whatever that comes to).
//
// What is still here is that the artist drew things that are not him: a row label at the left of
// each row, the fishing line and its bobber in the cast and reel frames, the splash off the line
// while he fights a fish, and the stars round a celebrated catch — and the lines are long enough
// to reach into the next frame's cell, so the cells cannot be found as gaps in the alpha (the cast
// row has none). They are found from the frame *pitch* instead: the rows have gaps, the first row
// has four clean frames, and every row is cut at the same four columns. Inside a cell, everything
// that is not him is thinner than he is anywhere: the line is two pixels, and the bobber, the
// droplets, the stars and the label hang off nothing once the line is gone. So each cell is
// opened by a pixel — eroded, the largest eight-connected piece kept, and the original grown back
// one pixel round it — which keeps the rod (eight pixels wide) and the fish he holds by the tail
// (attached to his hand) and drops all the rest.
//
// Frames are hung on the feet, not the cell, so a pose never bobs; `strips.json` records the
// shared box and `SPRITE_FRAME` in anglerSprites.js must match it.

import { readPng, writePng } from './png.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const SHEET = new URL('../art/angler-pixel-sheet.png', import.meta.url).pathname;
const OUT = new URL('../src/assets/angler/', import.meta.url).pathname;
const ROWS = ['idle', 'walk', 'cast', 'reel', 'celebrate'];
const ON = 128;

const sheet = readPng(SHEET);
const { width: W, height: H, data: D } = sheet;
const lit = (x, y) => D[(y * W + x) * 4 + 3] >= ON;

// Runs of rows (or columns) with anything drawn in them.
function bands(count, test) {
  const out = []; let start = -1;
  for (let i = 0; i <= count; i += 1) {
    const v = i < count && test(i);
    if (v && start < 0) start = i;
    if (!v && start >= 0) { out.push([start, i - 1]); start = -1; }
  }
  return out;
}
const ROWBANDS = bands(H, (y) => { for (let x = 0; x < W; x += 1) if (lit(x, y)) return true; return false; });
if (ROWBANDS.length !== ROWS.length) throw new Error(`found ${ROWBANDS.length} rows of drawing, expected ${ROWS.length}`);

// The columns, from the first row: its label and four frames stand apart, and the frames are at
// one pitch. Every row is cut at the midpoints between those frame centres, and to the left of
// the first frame at the midpoint between it and the label.
const [ly0, ly1] = ROWBANDS[0];
const firstRow = bands(W, (x) => { for (let y = ly0; y <= ly1; y += 1) if (lit(x, y)) return true; return false; });
if (firstRow.length !== 5) throw new Error(`found ${firstRow.length} things in the first row, expected a label and four frames`);
const centres = firstRow.slice(1).map(([a, b]) => (a + b) / 2);
const pitch = (centres[3] - centres[0]) / 3;
//
// The cells overlap by REACH each side of that, because the rod he winds up with in the second
// cast frame is drawn well into the first frame's cell, and cut at the midpoint it came out a
// stub. What each cell keeps is the piece that stands in its *own* middle (the one with the most
// pixels within half a pitch of the frame centre), not simply the largest piece, so the sliver of
// the next frame that the overlap lets in is dropped even where it is the bigger.
const REACH = 80;
const COLS = centres.map((c, i) => [Math.max(i === 0 ? firstRow[0][1] + 1 : 0, Math.round(c - pitch / 2 - REACH)), Math.min(W - 1, Math.round(c + pitch / 2 + REACH))]);
console.log(`frame pitch ${pitch.toFixed(1)}, columns ${COLS.map(([a, b]) => `${a}-${b}`).join(' ')}`);

function cell([x0, x1], [y0, y1], centre) {
  const w = x1 - x0 + 1; const h = y1 - y0 + 1;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const s = ((y + y0) * W + x + x0) * 4; const t = (y * w + x) * 4;
    if (D[s + 3] < ON) continue;
    data[t] = D[s]; data[t + 1] = D[s + 1]; data[t + 2] = D[s + 2]; data[t + 3] = 255;
  }
  return { width: w, height: h, data, centre: centre - x0 };
}

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const FOUR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Open the cell by OPEN pixels and keep the piece standing in its middle; see the note at the
// top. Two, not one: the line hanging off the rod tip in the first reel frame is three pixels
// wide where it leaves the rod and survived an opening of one.
const OPEN = 2;
function keepFigure(img) {
  const { width: w, height: h, data, centre } = img;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 0;
  let eroded = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (on(x, y)) eroded[y * w + x] = 1;
  for (let round = 0; round < OPEN; round += 1) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (eroded[i] && FOUR.every(([ox, oy]) => { const nx = x + ox; const ny = y + oy; return nx >= 0 && ny >= 0 && nx < w && ny < h && eroded[ny * w + nx]; })) next[i] = 1;
    }
    eroded = next;
  }
  const seen = new Uint8Array(w * h);
  let best = []; let bestScore = -1;
  for (let start = 0; start < w * h; start += 1) {
    if (seen[start] || !eroded[start]) continue;
    const run = [start]; seen[start] = 1; const group = []; let score = 0;
    while (run.length) {
      const i = run.pop(); group.push(i);
      const x = i % w; const y = (i / w) | 0;
      if (Math.abs(x - centre) <= pitch / 2) score += 1;
      NEIGHBOURS.forEach(([ox, oy]) => {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const n = ny * w + nx;
        if (seen[n] || !eroded[n]) return;
        seen[n] = 1; run.push(n);
      });
    }
    if (score > bestScore) { best = group; bestScore = score; }
  }
  // Growing back, the figure does not grow into the line: where it leaves the rod tip the
  // line is a few pixels wide, within reach of the tip's core, and came back as a stub.
  const lineish = (x, y) => { const p = (y * w + x) * 4; return data[p + 2] > data[p] + 20 && 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2] > 120; };
  let core = new Uint8Array(w * h); best.forEach((i) => { core[i] = 1; });
  for (let round = 0; round < OPEN; round += 1) {
    const next = new Uint8Array(core);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (core[i] || !on(x, y) || lineish(x, y)) continue;
      if (NEIGHBOURS.some(([ox, oy]) => { const nx = x + ox; const ny = y + oy; return nx >= 0 && ny >= 0 && nx < w && ny < h && core[ny * w + nx]; })) next[i] = 1;
    }
    core = next;
  }
  let dropped = 0;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x;
    if (!data[i * 4 + 3]) continue;
    if (core[i]) continue;
    if (process.env.MARKDROP) { data[i * 4] = 255; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; } else data[i * 4 + 3] = 0;
    dropped += 1;
  }
  img.dropped = dropped;
  return img;
}

// Where he stands: the bottom of the figure, and the middle of its widest part in the bottom rows.
function feet(img) {
  const { width: w, height: h, data } = img;
  let bottom = -1; let x0 = w; let x1 = -1;
  for (let y = h - 1; y >= 0 && bottom < 0; y -= 1) {
    for (let x = 0; x < w; x += 1) if (data[(y * w + x) * 4 + 3]) { bottom = y; break; }
  }
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
  const img = keepFigure(cell(col, ROWBANDS[r], centres[i]));
  const b = bounds(img);
  console.log(`  ${action}[${i}] ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}, dropped ${img.dropped}px`);
  return { img, feet: feet(img), bounds: b };
}));

// One box for every frame in every strip, the smallest that holds them all hung on their feet.
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
});
writeFileSync(`${OUT}strips.json`, `${JSON.stringify(strips, null, 2)}\n`);
console.log(`box ${BOX_W}x${BOX_H}, feet at (${FEET_X}, ${FEET_Y})`);

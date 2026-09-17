// Slice a rendered pet sheet (one row of frames, flat pixel art on a transparent ground) into
// a strip for the dock: `node scripts/petSlice.mjs <sheet.png> <name>` writes
// src/assets/pets/<name>.png and updates src/assets/pets/pets.json.
//
// "On" is alpha at or over half, like the angler's slicer. The frames are the biggest
// eight-connected pieces on the sheet (column gaps did not work: the model draws the frames
// close enough that one dog's tongue reaches over the next one's tail), smaller pieces go with
// the nearest frame and flecks are dropped, and every frame is hung on its feet (the bottom of
// its alpha) in one shared box, so a blink never bobs. The recorded box and feet are what
// utils/petSprites.js draws against.
import { readPng, writePng } from './png.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [, , SHEET, NAME, FRAMES_WANTED = '4'] = process.argv;
if (!SHEET || !NAME) { console.error('usage: petSlice.mjs <sheet.png> <name> [frames]'); process.exit(1); }
const OUT = new URL('../src/assets/pets/', import.meta.url).pathname;
const ON = 128;
const { width: W, height: H, data: D } = readPng(SHEET);
const lit = (x, y) => D[(y * W + x) * 4 + 3] >= ON;

// Label every eight-connected piece on the sheet. The frames are the `FRAMES_WANTED` largest,
// left to right — not column bands, because the model draws the frames close enough that one
// dog's tongue reaches over the next one's tail — and every smaller piece (a tail tip drawn
// apart from the body, or a fleck) goes with the frame whose box is nearest to it, unless it
// is a fleck: under a fortieth of the smallest frame.
const labels = new Int32Array(W * H);
const pieces = [null];
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  if (!lit(x, y) || labels[y * W + x]) continue;
  const id = pieces.length; const piece = { id, size: 0, x0: x, x1: x + 1, y0: y, y1: y + 1 }; pieces.push(piece);
  const stack = [[x, y]]; labels[y * W + x] = id;
  while (stack.length) {
    const [cx, cy] = stack.pop(); piece.size += 1;
    piece.x0 = Math.min(piece.x0, cx); piece.x1 = Math.max(piece.x1, cx + 1); piece.y0 = Math.min(piece.y0, cy); piece.y1 = Math.max(piece.y1, cy + 1);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || labels[ny * W + nx] || !lit(nx, ny)) continue;
      labels[ny * W + nx] = id; stack.push([nx, ny]);
    }
  }
}
const bodies = pieces.slice(1).sort((a, b) => b.size - a.size).slice(0, +FRAMES_WANTED).sort((a, b) => a.x0 - b.x0);
if (bodies.length !== +FRAMES_WANTED) { console.error(`found ${bodies.length} pieces, wanted ${FRAMES_WANTED}`); process.exit(1); }
const owner = new Int32Array(pieces.length);
bodies.forEach((body, i) => { owner[body.id] = i + 1; });
const gap = (a, b) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));
const fleck = Math.min(...bodies.map((b) => b.size)) / 40;
pieces.slice(1).forEach((piece) => {
  if (owner[piece.id] || piece.size < fleck) return;
  let best = 0, bestGap = Infinity;
  bodies.forEach((body, i) => { const g = gap(piece, body); if (g < bestGap) { bestGap = g; best = i + 1; } });
  owner[piece.id] = best;
});
// Per frame: the box round everything it owns, and the feet at the bottom middle.
const frames = bodies.map((body, i) => {
  let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
  pieces.slice(1).forEach((piece) => {
    if (owner[piece.id] !== i + 1) return;
    bx0 = Math.min(bx0, piece.x0); bx1 = Math.max(bx1, piece.x1); by0 = Math.min(by0, piece.y0); by1 = Math.max(by1, piece.y1);
  });
  return { index: i + 1, box: { x0: bx0, x1: bx1, y0: by0, y1: by1 }, feetX: Math.round((bx0 + bx1) / 2), feetY: by1 };
});
// One shared box: wide enough for every frame either side of its feet, tall enough for the tallest.
const left = Math.max(...frames.map((f) => f.feetX - f.box.x0));
const right = Math.max(...frames.map((f) => f.box.x1 - f.feetX));
const tall = Math.max(...frames.map((f) => f.feetY - f.box.y0));
const FW = left + right + 2, FH = tall + 1, feetX = left + 1, feetY = FH - 1;
const strip = { width: FW * frames.length, height: FH, data: Buffer.alloc(FW * frames.length * FH * 4) };
frames.forEach((f, i) => {
  for (let y = f.box.y0; y < f.box.y1; y += 1) for (let x = f.box.x0; x < f.box.x1; x += 1) {
    const id = labels[y * W + x];
    if (!id || owner[id] !== f.index) continue;
    const tx = i * FW + feetX + (x - f.feetX), ty = feetY - (f.feetY - y);
    const src = (y * W + x) * 4, dst = (ty * strip.width + tx) * 4;
    strip.data[dst] = D[src]; strip.data[dst + 1] = D[src + 1]; strip.data[dst + 2] = D[src + 2]; strip.data[dst + 3] = 255;
  }
});
mkdirSync(OUT, { recursive: true });
writePng(`${OUT}${NAME}.png`, strip);
const metaFile = `${OUT}pets.json`;
const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
meta[NAME] = { frames: frames.length, w: FW, h: FH, feetX, feetY };
writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`);
console.log(NAME, meta[NAME], 'frame boxes', frames.map((f) => `${f.box.x1 - f.box.x0}x${f.box.y1 - f.box.y0}`).join(' '));

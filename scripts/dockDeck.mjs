// Cuts the deck kit the stage builds its dock from out of the composed dock piece that
// scripts/dockSlice.mjs writes (art/dock-parts/00_*.png — lamp post, barrel, crate, planks,
// pilings and the rope-wrapped end post, all in one). The kit is three pieces:
//
//   deck.png    a plank span with no piling in it, repeated along the dock's length
//   piling.png  one piling, set in front of the deck at intervals
//   deckend.png the dock's right end: the last stretch of deck and the post with the rope
//
//   node scripts/dockSlice.mjs && node scripts/dockDeck.mjs [art/dock-parts/00_435x331.png]
//
// art/dock-parts/ is not committed, so the slicer runs first.
//
// The cuts are in that piece's own pixels and are checked against it: the deck band is the
// rows that run the whole width (planks plus the beam under them), and the span cut from it is
// a stretch of columns whose only content is that band, so it tiles. utils/dockKit.js repeats
// what comes out here, and its ratios are these numbers over the deck band's height — change a
// cut and change them together.
//
// Needs Playwright with Chromium (project or global install via NODE_PATH;
// PLAYWRIGHT_CHROMIUM=/path/to/chromium to point at a binary).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
  const candidates = [import.meta.url, ...(process.env.NODE_PATH || '').split(':').filter(Boolean).map((dir) => path.join(dir, 'x.js')), '/usr/local/lib/node_modules/x.js', '/usr/lib/node_modules/x.js'];
  for (const from of candidates) {
    try { return createRequire(from.startsWith('file:') ? from : `file://${from}`)('playwright'); } catch (error) { /* next */ }
  }
  throw new Error('playwright not found: npm i -D playwright, or set NODE_PATH to a global node_modules');
}
const { chromium } = loadPlaywright();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'art', 'dock-parts', '00_435x331.png');
const out = path.join(root, 'src', 'assets', 'props', 'dock');
mkdirSync(out, { recursive: true });

// Cuts in the composed piece's own pixels: [x0, y0, x1, y1], inclusive.
const CUTS = {
  deck: [132, 173, 168, 272],
  piling: [172, 218, 216, 330],
  deckend: [380, 133, 434, 330],
};

const data = `data:image/png;base64,${readFileSync(source).toString('base64')}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const result = await page.evaluate(async ({ src, cuts }) => {
  const img = new Image(); img.src = src; await img.decode();
  const W = img.width; const H = img.height;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  const on = (x, y) => d[(y * W + x) * 4 + 3] > 100;

  // The deck band: the rows that run the whole width of the piece.
  let top = -1; let bottom = -1;
  for (let y = 0; y < H; y += 1) {
    let n = 0; for (let x = 0; x < W; x += 1) if (on(x, y)) n += 1;
    if (n > W * 0.9) { if (top < 0) top = y; bottom = y; }
  }
  const notes = [`deck band rows ${top}-${bottom}`];
  const [dx0, dy0, dx1, dy1] = cuts.deck;
  if (dy0 !== top || dy1 !== bottom) notes.push(`WARNING deck cut ${dy0}-${dy1} is not the band`);
  // The span cut for the deck has to be band and nothing else, or it will not tile.
  for (let x = dx0; x <= dx1; x += 1) {
    let n = 0; for (let y = 0; y < H; y += 1) if (on(x, y)) n += 1;
    if (Math.abs(n - (bottom - top + 1)) > 1) { notes.push(`WARNING column ${x} carries ${n} rows, not the band's ${bottom - top + 1}`); break; }
  }

  const cut = (box) => {
    const [x0, y0, x1, y1] = box;
    const w = x1 - x0 + 1; const h = y1 - y0 + 1;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    return { w, h, url: c.toDataURL('image/png') };
  };
  return { notes, band: { top, bottom }, pieces: Object.fromEntries(Object.entries(cuts).map(([name, box]) => [name, cut(box)])) };
}, { src: data, cuts: CUTS });
await browser.close();
result.notes.forEach((note) => console.log(note));
for (const [name, piece] of Object.entries(result.pieces)) {
  writeFileSync(path.join(out, `${name}.png`), Buffer.from(piece.url.split(',')[1], 'base64'));
  console.log(`wrote src/assets/props/dock/${name}.png (${piece.w}x${piece.h})`);
}

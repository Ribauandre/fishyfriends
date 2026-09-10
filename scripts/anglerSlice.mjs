// Slices the angler sprite sheet into the strips the game animates
// (src/assets/angler/{idle,cast,reel,fishon,celebrate}.png) and writes strips.json beside
// them (frame count and box) for scripts/anglerMasks.mjs and utils/anglerSprites.js.
//
//   node scripts/anglerSlice.mjs [art/angler-sheet.png]
//
// The sheet (art/angler-sheet.png, made in the ChatGPT app) is the bald, clean-shaven,
// hatless angler on a transparent background, six unlabelled rows of unevenly spaced frames:
// STAND, WALK, CAST, REEL, CATCH, HURT. Nothing is on a grid, so nothing is measured off one:
// rows are the bands of the alpha channel's row profile, and each frame in a row is one
// connected component of it — which keeps a rod arcing over the next figure's head with the
// figure it belongs to, and drops the loose lure and line fragments (the bits with no body
// height) on the floor. A component is composed into a fixed box with its feet on one spot so
// actions can swap without the figure hopping.
//
// The game's five actions are cut from those rows:
//   idle      = REEL 1-7        (rod at the ready; the STAND row's hands are empty)
//   cast      = CAST 1-8        (the last frame, line away, is held while waiting)
//   fishon    = CATCH 1-3       (the strike: the rod loads and he leans back)
//   reel      = CATCH 3,4,5,4   (the pump: braced, hauling, braced)
//   celebrate = CATCH 6, twice, the second raised a few pixels for a hop
// The STAND and WALK rows are sliced but not written: the game stands with a rod, never walks.
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
const sheet = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'art', 'angler-sheet.png');
const out = path.join(root, 'src', 'assets', 'angler');
mkdirSync(out, { recursive: true });

// The rows the sheet has, top to bottom, and the box every frame is composed into: the feet
// land on (feetX, feetY), leaving room to the right and above for the rod's longest arc.
const ROWS = ['stand', 'walk', 'cast', 'reel', 'catch', 'hurt'];
const BOX = { w: 352, h: 192, feetX: 60, feetY: 186, bodyH: 128 };
// [row, frame index, lift in pixels].
const ACTIONS = {
  idle: [['reel', 0], ['reel', 1], ['reel', 2], ['reel', 3], ['reel', 4], ['reel', 5], ['reel', 6]],
  cast: [['cast', 0], ['cast', 1], ['cast', 2], ['cast', 3], ['cast', 4], ['cast', 5], ['cast', 6], ['cast', 7]],
  fishon: [['catch', 0], ['catch', 1], ['catch', 2]],
  reel: [['catch', 2], ['catch', 3], ['catch', 4], ['catch', 3]],
  celebrate: [['catch', 5], ['catch', 5, -4]],
};
// Alpha at or above this is the character; below it is the sheet's glow.
const ALPHA = 180;

const data = `data:image/png;base64,${readFileSync(sheet).toString('base64')}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const report = await page.evaluate(async ({ data: src, rows, box, actions, alpha }) => {
  const img = new Image(); img.src = src; await img.decode();
  const W = img.width; const H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;
  const on = (x, y) => x >= 0 && x < W && y >= 0 && y < H && px[(y * W + x) * 4 + 3] >= alpha;

  // Rows: the bands of the alpha row profile, with the thin gaps between them ignored.
  const bands = []; let start = -1; let gap = 0;
  for (let y = 0; y <= H; y += 1) {
    let n = 0; if (y < H) for (let x = 0; x < W; x += 1) if (on(x, y)) n += 1;
    if (n > 2) { if (start < 0) start = y; gap = 0; } else if (start >= 0) { gap += 1; if (gap >= 8 || y === H) { bands.push([start, y - gap]); start = -1; } }
  }
  if (bands.length !== rows.length) return { error: `expected ${rows.length} rows, found ${bands.length}: ${JSON.stringify(bands)}` };

  // Frames: the connected components of a row. The rod and line stay attached to their own
  // figure even where they cross into the next frame's columns; loose fragments (a cast lure
  // in flight) have no body height and are dropped.
  const sheetRows = {};
  bands.forEach(([y0, y1], row) => {
    const bandH = y1 - y0 + 1;
    const seen = new Uint8Array(W * H);
    const found = [];
    for (let y = y0; y <= y1; y += 1) for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (seen[i] || !on(x, y)) continue;
      const pixels = []; const stack = [i]; seen[i] = 1;
      let minX = x; let maxX = x; let minY = y; let maxY = y;
      while (stack.length) {
        const q = stack.pop(); pixels.push(q);
        const qy = Math.floor(q / W); const qx = q - qy * W;
        if (qx < minX) minX = qx; if (qx > maxX) maxX = qx; if (qy < minY) minY = qy; if (qy > maxY) maxY = qy;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const nx = qx + dx; const ny = qy + dy;
          if (nx < 0 || nx >= W || ny < y0 || ny > y1) continue;
          const n = ny * W + nx;
          if (!seen[n] && on(nx, ny)) { seen[n] = 1; stack.push(n); }
        }
      }
      if (maxY - minY + 1 < bandH * 0.55) continue;
      // The feet: where the bottom few rows of the figure sit.
      let sum = 0; let n = 0;
      for (const q of pixels) { const qy = Math.floor(q / W); if (qy > maxY - 6) { sum += q - qy * W; n += 1; } }
      found.push({ pixels, minX, maxX, minY, maxY, feetX: Math.round(sum / n), feetY: maxY });
    }
    sheetRows[rows[row]] = found.sort((a, b) => a.minX - b.minX);
  });

  const strips = {};
  Object.entries(actions).forEach(([action, picks]) => {
    const strip = document.createElement('canvas'); strip.width = box.w * picks.length; strip.height = box.h;
    const sctx = strip.getContext('2d');
    const image = sctx.createImageData(strip.width, strip.height);
    picks.forEach(([row, index, lift = 0], slot) => {
      const frame = sheetRows[row]?.[index]; if (!frame) return;
      const ox = slot * box.w + box.feetX - frame.feetX;
      const oy = box.feetY + lift - frame.feetY;
      for (const q of frame.pixels) {
        const qy = Math.floor(q / W); const qx = q - qy * W;
        const tx = qx + ox; const ty = qy + oy;
        if (tx < 0 || ty < 0 || tx >= strip.width || ty >= strip.height) continue;
        const s = q * 4; const t = (ty * strip.width + tx) * 4;
        image.data[t] = px[s]; image.data[t + 1] = px[s + 1]; image.data[t + 2] = px[s + 2]; image.data[t + 3] = 255;
      }
    });
    sctx.putImageData(image, 0, 0);
    strips[action] = { url: strip.toDataURL('image/png'), frames: picks.length };
  });
  return { strips, rows: bands, counts: Object.fromEntries(Object.entries(sheetRows).map(([k, v]) => [k, v.length])) };
}, { data, rows: ROWS, box: BOX, actions: ACTIONS, alpha: ALPHA });
await browser.close();
if (report.error) { console.error(report.error); process.exit(1); }
console.log(`rows ${JSON.stringify(report.rows)}`);
console.log(`frames per row ${JSON.stringify(report.counts)}`);
const meta = {};
for (const [action, strip] of Object.entries(report.strips)) {
  writeFileSync(path.join(out, `${action}.png`), Buffer.from(strip.url.split(',')[1], 'base64'));
  meta[action] = { frames: strip.frames };
  console.log(`wrote src/assets/angler/${action}.png (${strip.frames} frames)`);
}
writeFileSync(path.join(out, 'strips.json'), `${JSON.stringify({ box: BOX, actions: meta }, null, 2)}\n`);
console.log('wrote src/assets/angler/strips.json');

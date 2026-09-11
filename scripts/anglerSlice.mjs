// Slices the ChatGPT-made angler sprite sheet into the strips the game animates
// (src/assets/angler/{idle,cast,reel,celebrate,hurt}.png) and writes strips.json beside them
// (frame counts and box) for scripts/anglerMasks.mjs.
//
//   node scripts/anglerSlice.mjs art/angler-sheet.png
//
// The sheet is the bald one the character is drawn on now: two rows of labelled poses over
// rows of cosmetic examples, on a transparent background. The alpha haze is thresholded, the
// navy label chips are dropped (they are the only blue-on-blue blobs), the drawn fishing line
// and its lure go with every other strongly blue pixel (the game draws its own line from the
// rod tip, and the sheet's lines wander off across three frames), and what is left is one
// connected component per pose — a rod arcing over the next frame is still its caster's,
// because it is joined to his hands and to nothing else.
//
// Rows are read in order and split by the frame counts in ROWS; WALK is sliced but not kept
// (the game has no walk) and the one rodless cast frame is dropped by KEEP. Every pose is
// composed into a fixed box with its feet on one spot, so actions swap without the figure
// hopping, and the box is the one the stage has always used: 250x160 with the feet at
// (80, 154), which leaves the ten rows of headroom above the crown that a painted hat needs.
// Rods that run past the box are clipped there — utils/anglerSprites.js records where each
// pose's rod leaves the frame, and the game's line starts from that point, so the two meet.
// Needs Playwright with Chromium (project or global install via NODE_PATH; PLAYWRIGHT_CHROMIUM
// to point at a binary).
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

const sheet = process.argv[2];
if (!sheet) { console.error('usage: node scripts/anglerSlice.mjs <sheet.png>'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'src', 'assets', 'angler');
mkdirSync(out, { recursive: true });

// The two pose rows, in the order the sheet draws them, and how many frames each pose has.
const ROWS = [[['idle', 5], ['walk', 5], ['cast', 5]], [['reel', 6], ['celebrate', 4], ['hurt', 3]]];
// Which of those frames to write, and in which order. Cast's fourth is drawn without a rod
// and a head shorter than the rest of the row, so it is left out; the other four are put in
// the order a cast actually goes — rod loaded high, then swinging down and out — because the
// game holds the last one for as long as the line is in the water, and that has to be the
// pose with the rod out over it.
const KEEP = { idle: [0, 1, 2, 3, 4], cast: [4, 0, 1, 2], reel: [0, 1, 2, 3, 4, 5], celebrate: [0, 1, 2, 3], hurt: [0, 1, 2] };
const BOX = { w: 250, h: 160, feetX: 80, feetY: 154 };
const ALPHA = 60; // the haze below this is nothing

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const data = readFileSync(sheet).toString('base64');
const report = await page.evaluate(async ({ data, rows, keep, box, alpha }) => {
  const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
  const W = img.width; const H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H); const px = id.data;
  // Pixel art has no half-pixels: the haze is either the drawing or it is nothing.
  for (let p = 0; p < W * H; p += 1) px[p * 4 + 3] = px[p * 4 + 3] >= alpha ? 255 : 0;

  const on = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p += 1) on[p] = px[p * 4 + 3] ? 1 : 0;
  const componentsOf = (mask, W = img.width, H = img.height) => {
    const seen = new Int32Array(W * H).fill(-1); const found = [];
    for (let p = 0; p < W * H; p += 1) {
      if (!mask[p] || seen[p] >= 0) continue;
      const index = found.length; const stack = [p]; seen[p] = index; const pixels = [];
      let x0 = W; let y0 = H; let x1 = 0; let y1 = 0;
      while (stack.length) {
        const q = stack.pop(); pixels.push(q); const x = q % W; const y = (q / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
          const k = ny * W + nx; if (mask[k] && seen[k] < 0) { seen[k] = index; stack.push(k); }
        });
      }
      found.push({ pixels, x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    return found;
  };
  // The character is drawn in browns, olives and greys — nothing on him is bluer than a
  // shirt fold. The fishing line and its lure are a thread of real blue; the label chips are
  // a blob of a paler one, so they are found by leaning cool rather than by being vivid.
  const isBlue = (p) => px[p * 4 + 2] - px[p * 4] > 45 && px[p * 4 + 2] > 90;
  const isChipColour = (p) => px[p * 4 + 2] - px[p * 4] > 20;

  let poses = componentsOf(on).filter((comp) => comp.pixels.length > 400);
  poses = poses.filter((comp) => comp.pixels.filter(isChipColour).length / comp.pixels.length < 0.5);
  // Rows: components that overlap vertically belong together. Only the pose rows are read —
  // the cosmetic examples below them are reference, not frames — and a pose row is the only
  // band a whole standing angler fits in.
  poses.sort((a, b) => a.y0 - b.y0);
  const bands = [];
  poses.forEach((comp) => {
    const band = bands.find((b) => comp.y0 <= b.y1 - 20 && comp.y1 >= b.y0 + 20);
    if (band) { band.items.push(comp); band.y0 = Math.min(band.y0, comp.y0); band.y1 = Math.max(band.y1, comp.y1); }
    else bands.push({ y0: comp.y0, y1: comp.y1, items: [comp] });
  });
  const poseBands = bands.filter((b) => b.y1 - b.y0 + 1 >= 140);

  const erodedBlob = (pixels) => {
    // The body is what survives losing three pixels all round: rods and lines are thinner.
    const set = new Set(pixels); const kept = new Uint8Array(W * H);
    pixels.forEach((p) => {
      const x = p % W; const y = (p / W) | 0;
      for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (!set.has((y + dy) * W + x + dx)) return;
      kept[p] = 1;
    });
    return componentsOf(kept).sort((a, b) => b.pixels.length - a.pixels.length)[0];
  };

  const strips = {}; const notes = [];
  rows.forEach((row, index) => {
    const band = poseBands[index];
    band.items.sort((a, b) => a.x0 - b.x0);
    let next = 0;
    row.forEach(([action, count]) => {
      const frames = band.items.slice(next, next + count); next += count;
      if (!keep[action]) return;
      const chosen = keep[action].map((f) => frames[f]);
      const strip = document.createElement('canvas');
      strip.width = box.w * chosen.length; strip.height = box.h;
      const sctx = strip.getContext('2d');
      const image = sctx.createImageData(strip.width, strip.height);
      chosen.forEach((comp, f) => {
        const body = erodedBlob(comp.pixels);
        // The feet are the bottom of the body, centred on the last few rows of it.
        let sum = 0; let n = 0;
        body.pixels.forEach((p) => { if (((p / W) | 0) > body.y1 - 8) { sum += p % W; n += 1; } });
        const feetX = Math.round(sum / n); const feetY = body.y1;
        const dx = f * box.w + box.feetX - feetX; const dy = box.feetY - feetY;
        comp.pixels.forEach((p) => {
          if (isBlue(p)) return;
          const x = (p % W) + dx; const y = ((p / W) | 0) + dy;
          if (x < f * box.w || x >= (f + 1) * box.w || y < 0 || y >= box.h) return;
          const to = (y * strip.width + x) * 4;
          for (let k = 0; k < 4; k += 1) image.data[to + k] = px[p * 4 + k];
        });
        notes.push(`${action}[${f}] feet=(${feetX},${feetY}) body=${body.w}x${body.h}`);
      });
      // The drawn line took some of the artist's whip marks with it and left the rest as
      // flecks. Nothing that small is the angler — the lightest pose is thousands of pixels.
      const cell = new Uint8Array(strip.width * strip.height);
      for (let p = 0; p < cell.length; p += 1) cell[p] = image.data[p * 4 + 3] ? 1 : 0;
      componentsOf(cell, strip.width, strip.height).forEach((piece) => {
        if (piece.pixels.length >= 200) return;
        piece.pixels.forEach((p) => { image.data[p * 4 + 3] = 0; });
      });
      sctx.putImageData(image, 0, 0);
      strips[action] = { frames: chosen.length, url: strip.toDataURL('image/png') };
    });
  });
  return { strips, notes };
}, { data, rows: ROWS, keep: KEEP, box: BOX, alpha: ALPHA });

const manifest = {};
for (const [action, { frames, url }] of Object.entries(report.strips)) {
  writeFileSync(path.join(out, `${action}.png`), Buffer.from(url.split(',')[1], 'base64'));
  manifest[action] = { frames, ...BOX };
  console.log(`${action}.png — ${frames} frames`);
}
report.notes.forEach((note) => console.log(' ', note));
await browser.close();
writeFileSync(path.join(out, 'strips.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('wrote src/assets/angler/strips.json');

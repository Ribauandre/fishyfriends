// Reads the skin ramps off the sheet and writes src/utils/skinRamps.json:
//
//   node scripts/anglerSkin.mjs
//
// A skin tone was a dye — every pixel's brightness kept, relative to one mid-tone, and reapplied
// to a target colour. That works on flat art with a four-step ramp. This art is soft-shaded with
// hundreds of tones on a face, so the dye muddied it: the shading flattened and the deepest tone
// came out grey. The sheet says as much itself. Its SKIN TONES row is five separate heads, drawn
// one per tone, because the artist did not tint one either.
//
// So a tone becomes a ramp swapped for another ramp. Both ends are read off the art: the body's
// own, from the strips where their masks say skin, and the five the sheet draws. Each is that
// population sorted by brightness and cut into four bands at its own quartiles, so a band is the
// mean of the tones actually used there — derived, never picked. The body's ramp lands within
// three of the sheet's middle head, which is the check that this is the same character.
// Needs Playwright with Chromium (project or global install via NODE_PATH; PLAYWRIGHT_CHROMIUM
// to point at a binary).
import { readFileSync, writeFileSync } from 'node:fs';
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
const assets = path.join(root, 'src', 'assets', 'angler');
const ACTIONS = ['idle', 'cast', 'reel', 'celebrate', 'hurt'];
const SKIN = 1;
// The band of the sheet the SKIN TONES row sits in, and how many heads are drawn there.
const ROW = { y0: 590, y1: 690, heads: 5 };
const BANDS = 4;

const url = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const sheet = url(path.join(root, 'art', 'angler-sheet.png'));
const strips = Object.fromEntries(ACTIONS.map((a) => [a, url(path.join(assets, `${a}.png`))]));
const masks = Object.fromEntries(ACTIONS.map((a) => [a, url(path.join(assets, 'masks', `${a}.png`))]));

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const result = await page.evaluate(async ({ sheet, strips, masks, actions, row, bands, skin }) => {
  const load = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };
  const pixelsOf = async (src) => {
    const img = await load(src);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    return { data: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height };
  };
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  // A ramp is the population sorted by brightness and cut at its own quartiles, each band the
  // mean of what is in it. Nothing is chosen: these are the tones the art is painted in.
  const rampOf = (list) => {
    list.sort((a, b) => lum(...a) - lum(...b));
    const out = [];
    for (let i = 0; i < bands; i += 1) {
      const a = Math.floor(list.length * i / bands); const b = Math.max(a + 1, Math.floor(list.length * (i + 1) / bands));
      const band = list.slice(a, b);
      const sum = band.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
      out.push(sum.map((v) => Math.round(v / band.length)));
    }
    return out;
  };

  // ---- the body's own, from the strips where the masks say skin ----
  const body = [];
  for (const action of actions) {
    const art = await pixelsOf(strips[action]); const mask = await pixelsOf(masks[action]);
    for (let i = 0; i < art.data.length; i += 4) {
      if (art.data[i + 3] < 200 || mask.data[i] !== skin) continue;
      const rgb = [art.data[i], art.data[i + 1], art.data[i + 2]];
      if (lum(...rgb) < 34) continue;
      body.push(rgb);
    }
  }

  // ---- the five the sheet draws, split into heads by the gaps between them ----
  const sh = await pixelsOf(sheet);
  const cols = [];
  for (let x = 0; x < sh.width; x += 1) {
    let any = 0;
    for (let y = row.y0; y <= row.y1; y += 1) if (sh.data[(y * sh.width + x) * 4 + 3] >= 200) any += 1;
    cols[x] = any;
  }
  const spans = []; let start = -1;
  for (let x = 0; x <= sh.width; x += 1) {
    if (cols[x]) { if (start < 0) start = x; }
    else if (start >= 0) { if (x - start > 20) spans.push([start, x - 1]); start = -1; }
  }
  const heads = spans.slice(0, row.heads).map(([x0, x1]) => {
    const list = [];
    for (let y = row.y0; y <= row.y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      const i = (y * sh.width + x) * 4;
      if (sh.data[i + 3] < 200) continue;
      const rgb = [sh.data[i], sh.data[i + 1], sh.data[i + 2]];
      // Not the eyes and not the keyline: a head is skin and those two things.
      if (lum(...rgb) < 60) continue;
      if (rgb[0] - rgb[2] < 30 && lum(...rgb) > 200) continue;
      list.push(rgb);
    }
    return rampOf(list);
  });
  return { body: rampOf(body), tones: heads, spans: spans.length };
}, { sheet, strips, masks, actions: ACTIONS, row: ROW, bands: BANDS, skin: SKIN });

const gap = (a, b) => a.reduce((worst, band, i) => Math.max(worst, ...band.map((v, k) => Math.abs(v - b[i][k]))), 0);
const nearest = result.tones.map((ramp) => gap(result.body, ramp)).reduce((best, d, i, all) => (d < all[best] ? i : best), 0);
console.log(`found ${result.spans} heads in the SKIN TONES row, kept ${result.tones.length}`);
result.tones.forEach((ramp, i) => console.log(`  tone ${i}  ${ramp.map((c) => c.join(',')).join('  |  ')}`));
console.log(`  body    ${result.body.map((c) => c.join(',')).join('  |  ')}`);
console.log(`the body is drawn in tone ${nearest}, off by ${gap(result.body, result.tones[nearest])} at worst`);
writeFileSync(path.join(root, 'src', 'utils', 'skinRamps.json'), `${JSON.stringify({ body: result.body, tones: result.tones }, null, 1)}\n`);
console.log('wrote src/utils/skinRamps.json');
await browser.close();

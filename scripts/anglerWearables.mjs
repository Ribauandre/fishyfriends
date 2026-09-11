// Slices a ChatGPT-made sheet of things the angler wears on his head into the strip the game
// stamps from, and writes the manifest beside it:
//
//   node scripts/anglerWearables.mjs hats art/hats-sheet.png   -> assets/angler/hats.png, utils/hatSprites.json
//   node scripts/anglerWearables.mjs hair art/hair-sheet.png   -> assets/angler/hair.png, utils/hairSprites.json
//
// The sheet draws twenty hats on a transparent background, four rows of five, each many times
// bigger than the angler's head. They are shrunk by averaging — not by dropping pixels — to
// the width each is worn at, given as a multiple of the head's width in HATS below; at that
// reduction the sheet's own chunky blocks land at about the size of the character's, which is
// why a drawn hat sits on him as if it had been painted there. The painter has no shape to
// invent and no silhouette to reinterpret: it scales the cell by the frame's head and stamps.
//
// Every piece lands in a cell of one size, centred across it, with its anchor row on the cell's
// anchor row. That one row is the whole placement contract, so a new piece needs a key, a width
// and nothing else.
//
// The hair sheet needs one step the hats do not: asked for hairpieces, the model draws whole
// heads, hair wrapped round a blank face. That is no bad thing — what is wanted is exactly a
// hairpiece with a hole where the face goes — so the face is cut out by its own colour, and of
// the line work only what lies against hair is kept. The jaw line the model drew has no hair
// beside it and goes with the face, which is what stops a black chin strap being stamped
// across the angler's mouth.
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

const [kind, sheet] = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The head the widths below are measured against. The painter scales every cell by the frame's
// own head, so this is only the size the art is stored at.
const REF_HEAD = 40;
// Each sheet in reading order: the sprite's name, and how wide it is worn as a multiple of the
// head. A cap is barely wider than the skull; a straw hat is half as wide again.
const SHEETS = {
  hats: {
    asset: 'hats.png', manifest: 'hatSprites.json', cutFace: false, join: 8, grid: [4, 5], anchor: 'brim',
    items: [
      ['cap_fish_navy', 1.24], ['cap_fish_red', 1.24], ['cap_olive', 1.2], ['cap_brown', 1.2], ['cap_camo', 1.2],
      ['bucket_tan', 1.46], ['bucket_canvas', 1.46], ['bucket_camo', 1.46], ['straw_blue', 1.52], ['straw_red', 1.52],
      ['beanie_black', 1.1], ['beanie_olive', 1.1], ['beanie_red', 1.1], ['beanie_navy', 1.1], ['beanie_grey', 1.1],
      ['souwester', 1.42], ['wide_olive', 1.42], ['wide_navy', 1.42], ['boonie_white', 1.5], ['boonie_olive', 1.5],
    ],
  },
  hair: {
    asset: 'hair.png', manifest: 'hairSprites.json', cutFace: true, join: 10, grid: [2, 4], anchor: 'top',
    items: [
      ['side_part', 1.18], ['crew', 1.14], ['mop', 1.2], ['curls', 1.22],
      ['widows_peak', 1.16], ['long', 1.2], ['top_knot', 1.14], ['shaggy', 1.2],
    ],
  },
};
const config = SHEETS[kind];
if (!config || !sheet) { console.error(`usage: node scripts/anglerWearables.mjs <${Object.keys(SHEETS).join('|')}> <sheet.png>`); process.exit(1); }
const HATS = config.items;

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const data = readFileSync(sheet).toString('base64');
const report = await page.evaluate(async ({ data, hats, refHead, cutFace, join, grid, anchor }) => {
  const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
  const W = img.width; const H = img.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;

  // Asked for hairpieces the model draws whole heads: hair round a blank face. The face is a
  // pale fill nothing else on the sheet uses, so it goes by colour, and the line work it leaves
  // behind goes with it unless there is hair against it.
  if (cutFace) {
    const isHair = (p) => px[p * 4 + 3] >= 60 && (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 < 110 && px[p * 4] - px[p * 4 + 2] > 34 && px[p * 4 + 1] - px[p * 4 + 2] > 8;
    const isLine = (p) => px[p * 4 + 3] >= 60 && (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 < 60;
    const keep = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p += 1) if (isHair(p)) keep[p] = 1;
    // How far down each column the hair actually goes. Line work below that is the jaw and the
    // chin, which the model drew and this does not want: left in, it stamps a black chin strap
    // across the angler's face. Following the keyline from the hair would walk straight down it.
    // Only line work lying right against hair is the hair's. Following the keyline instead
    // walks straight down the jaw the model drew, and stamps a black chin strap across the
    // angler's face.
    const beside = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const p = y * W + x;
      if (keep[p] || !isLine(p)) continue;
      for (let dy = -2; dy <= 2 && !beside[p]; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        const nx = x + dx; const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && keep[ny * W + nx]) { beside[p] = 1; break; }
      }
    }
    for (let p = 0; p < W * H; p += 1) if (beside[p]) keep[p] = 1;
    // The antialiasing between the model's keyline and the face it drew reads brown, so a few
    // flecks of it survive along the jaw. Nothing that small is a hairstyle.
    const speck = new Int32Array(W * H).fill(-1);
    for (let p = 0; p < W * H; p += 1) {
      if (!keep[p] || speck[p] >= 0) continue;
      const st = [p]; speck[p] = p; const run = [];
      while (st.length) {
        const q = st.pop(); run.push(q); const x = q % W; const y = (q / W) | 0;
        [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => { if (nx < 0 || ny < 0 || nx >= W || ny >= H) return; const k = ny * W + nx; if (keep[k] && speck[k] < 0) { speck[k] = p; st.push(k); } });
      }
      if (run.length < 60) run.forEach((q) => { keep[q] = 0; });
    }
    for (let p = 0; p < W * H; p += 1) if (!keep[p]) px[p * 4 + 3] = 0;
  }

  // Items: opaque pixels, grown by the sheet's own `join` so a piece's separate parts — a brim
  // cut off its crown by line work, a chin cord, a top knot's bun, the two falls of long hair —
  // count as one piece rather than three.
  const on = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p += 1) on[p] = px[p * 4 + 3] >= 60 ? 1 : 0;
  const near = new Uint8Array(W * H); const R = join;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { if (!on[y * W + x]) continue; for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) { const ny = y + dy; const nx = x + dx; if (ny >= 0 && ny < H && nx >= 0 && nx < W) near[ny * W + nx] = 1; } }
  const seen = new Int32Array(W * H).fill(-1); const items = [];
  for (let p = 0; p < W * H; p += 1) {
    if (!near[p] || seen[p] >= 0) continue;
    const index = items.length; const st = [p]; seen[p] = index; let n = 0; let x0 = W; let y0 = H; let x1 = 0; let y1 = 0;
    while (st.length) {
      const q = st.pop(); const x = q % W; const y = (q / W) | 0;
      if (on[q]) { n += 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => { if (nx < 0 || ny < 0 || nx >= W || ny >= H) return; const k = ny * W + nx; if (near[k] && seen[k] < 0) { seen[k] = index; st.push(k); } });
    }
    if (n > 400) items.push({ x0, y0, x1, y1 });
  }
  // The sheet is a grid, and growing pixels until every piece is whole is a threshold that
  // cannot be right for all of them: too little and a top knot's bun is its own item, too much
  // and two hairstyles become one. So the layout settles it — components are banded into rows,
  // and inside a row the closest pair is joined again and again until the row holds the number
  // of pieces the grid says it does.
  const [gridRows, gridCols] = grid;
  // Rows are split at the widest gaps between pieces' middles rather than by overlap, so a
  // piece that lost some of its height to the cleanup above cannot fall out of its own row.
  items.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const gaps = items.slice(1).map((item, i) => ({ at: i + 1, gap: (item.y0 + item.y1) - (items[i].y0 + items[i].y1) }));
  const cuts = gaps.sort((a, b) => b.gap - a.gap).slice(0, gridRows - 1).map((g) => g.at).sort((a, b) => a - b);
  const bands = [];
  [0, ...cuts].forEach((from, i) => { bands.push({ items: items.slice(from, cuts[i] ?? items.length) }); });
  if (bands.length !== gridRows || bands.some((b) => !b.items.length)) return { error: `could not split ${items.length} pieces into ${gridRows} rows` };
  const ordered = [];
  for (const band of bands) {
    const row = band.items.slice().sort((a, b) => a.x0 - b.x0);
    while (row.length > gridCols) {
      let best = 0; let gap = Infinity;
      for (let i = 0; i + 1 < row.length; i += 1) { const g = row[i + 1].x0 - row[i].x1; if (g < gap) { gap = g; best = i; } }
      const [a, b] = row.splice(best, 2);
      row.splice(best, 0, { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
    }
    if (row.length !== gridCols) return { error: `found ${row.length} in a row, expected ${gridCols}` };
    ordered.push(...row);
  }
  items.length = 0; items.push(...ordered);
  if (items.length !== hats.length) return { error: `found ${items.length} pieces, expected ${hats.length}` };

  // Averaging shrink: every source pixel a target pixel covers is weighted by its own alpha,
  // so a hat's line work thins instead of eating the colour beside it.
  const shrink = (box, outW) => {
    const srcW = box.x1 - box.x0 + 1; const srcH = box.y1 - box.y0 + 1;
    const k = outW / srcW; const outH = Math.max(1, Math.round(srcH * k));
    const out = new Uint8ClampedArray(outW * outH * 4);
    for (let y = 0; y < outH; y += 1) for (let x = 0; x < outW; x += 1) {
      const sx0 = box.x0 + Math.floor(x / k); const sx1 = box.x0 + Math.min(srcW, Math.ceil((x + 1) / k));
      const sy0 = box.y0 + Math.floor(y / k); const sy1 = box.y0 + Math.min(srcH, Math.ceil((y + 1) / k));
      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let sy = sy0; sy < Math.max(sy0 + 1, sy1); sy += 1) for (let sx = sx0; sx < Math.max(sx0 + 1, sx1); sx += 1) {
        const i = (sy * W + sx) * 4; const weight = px[i + 3] / 255;
        r += px[i] * weight; g += px[i + 1] * weight; b += px[i + 2] * weight; a += px[i + 3]; n += 1;
      }
      const o = (y * outW + x) * 4;
      if (a / n < 90) continue; // more air than hat: leave it open
      const weight = a / 255;
      out[o] = Math.round(r / weight); out[o + 1] = Math.round(g / weight); out[o + 2] = Math.round(b / weight); out[o + 3] = 255;
    }
    return { width: outW, height: outH, data: out };
  };

  const shrunk = hats.map(([, width], i) => shrink(items[i], Math.round(width * refHead)));
  // Each hat's anchor is where it stops being a hat and starts being a head: the lowest row
  // still most of its full width — the underside of a cap's peak, a beanie's band, a bucket's
  // brim. Taking the widest row instead puts a cap's anchor up in the crown and drops the whole
  // thing over the eyes, and taking the very bottom hangs it off a chin cord.
  // A hat's anchor is 'brim' — the lowest row still most of its full width, the underside of a
  // cap's peak or a bucket's brim, which is where a hat meets a head. Taking the widest row
  // instead puts a cap's anchor up in the crown and drops the whole thing over the eyes.
  // A hairpiece is not worn on the head, it *is* the top of the head, so its anchor is 'top':
  // its own crown, which goes on the skull's. Hanging hair off a brim row buries the eyes.
  const anchors = shrunk.map((hat) => {
    const runs = [];
    for (let y = 0; y < hat.height; y += 1) {
      let run = 0;
      for (let x = 0; x < hat.width; x += 1) if (hat.data[(y * hat.width + x) * 4 + 3]) run += 1;
      runs.push(run);
    }
    if (anchor === 'top') return runs.findIndex((run) => run > 0);
    const full = Math.max(...runs);
    let last = 0;
    runs.forEach((run, y) => { if (run >= full * 0.7) last = y; });
    return last;
  });
  const above = Math.max(...shrunk.map((h, i) => anchors[i]));
  const below = Math.max(...shrunk.map((h, i) => h.height - anchors[i]));
  const cellW = Math.max(...shrunk.map((h) => h.width)) + 2;
  const cellH = above + below + 2;
  const anchorY = above + 1;

  const strip = document.createElement('canvas');
  strip.width = cellW * hats.length; strip.height = cellH;
  const sctx = strip.getContext('2d');
  const image = sctx.createImageData(strip.width, strip.height);
  shrunk.forEach((hat, i) => {
    const ox = i * cellW + Math.round((cellW - hat.width) / 2);
    const oy = anchorY - anchors[i];
    for (let y = 0; y < hat.height; y += 1) for (let x = 0; x < hat.width; x += 1) {
      const s = (y * hat.width + x) * 4; if (!hat.data[s + 3]) continue;
      const t = ((y + oy) * strip.width + x + ox) * 4;
      for (let k = 0; k < 4; k += 1) image.data[t + k] = hat.data[s + k];
    }
  });
  sctx.putImageData(image, 0, 0);
  return { url: strip.toDataURL('image/png'), cellW, cellH, anchorY, sizes: shrunk.map((h) => `${h.width}x${h.height}`) };
}, { data, hats: HATS, refHead: REF_HEAD, cutFace: config.cutFace, join: config.join, grid: config.grid, anchor: config.anchor });

if (report.error) { console.error(report.error); await browser.close(); process.exit(1); }
writeFileSync(path.join(root, 'src', 'assets', 'angler', config.asset), Buffer.from(report.url.split(',')[1], 'base64'));
const manifest = { refHead: REF_HEAD, anchor: config.anchor, cellW: report.cellW, cellH: report.cellH, anchorY: report.anchorY, order: HATS.map(([key]) => key) };
writeFileSync(path.join(root, 'src', 'utils', config.manifest), `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
console.log(`${config.asset} — ${HATS.length} cells of ${report.cellW}x${report.cellH}, anchor row ${report.anchorY}`);
report.sizes.forEach((size, i) => console.log(` ${HATS[i][0]} ${size}`));

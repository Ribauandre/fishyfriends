// Slices a ChatGPT-made angler sprite sheet into the strips the game animates
// (src/assets/angler/{idle,cast,reel,fishon,celebrate}.png) and writes strips.json beside
// them (frame counts and box) for scripts/anglerMasks.mjs.
//
//   node scripts/anglerSlice.mjs path/to/sheet.png
//
// The sheet is the one the art was first made as: six labelled rows — IDLE, WALK, CAST,
// REEL, FISH ON, CELEBRATE — of evenly spaced frames on a white or fake-checkerboard
// background. The background is flood-filled away from the edges, the label column on the
// left is dropped, rows become bands, tall opaque column runs find each body (rods are too
// thin to count), and every pixel component is handed to the frame whose body it overlaps
// (a cast rod reaching into the next frame's column still belongs to its caster). Frames are
// composed into a fixed box with the feet on one spot so actions swap without the figure
// hopping. WALK is sliced but not kept: the game has no walk. Needs Playwright with Chromium
// (project or global install via NODE_PATH; PLAYWRIGHT_CHROMIUM to point at a binary).
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

// The frame box in sheet pixels (for a ~1250px sheet) and the scale to the strip. 333×200 at
// 0.75 is the 250×150 box the stage has always used, feet at (80, 144).
const ROWS = ['idle', 'walk', 'cast', 'reel', 'fishon', 'celebrate'];
const KEEP = ['idle', 'cast', 'reel', 'fishon', 'celebrate'];
const BOX = { frameW: 333, frameH: 200, feetX: 107, scale: 0.75 };

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const data = readFileSync(sheet).toString('base64');
const report = await page.evaluate(async ({ data, rows, box }) => {
  const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
  const W = img.width; const H = img.height;
  const unit = W / 1254; // the box is specified for the original 1254px sheet
  const frameW = box.frameW * unit; const frameH = box.frameH * unit; const feetX = box.feetX * unit; const scale = box.scale / unit;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, W, H); const px = id.data;
  // Background: light, unsaturated pixels reachable from the edges (white or a checkerboard).
  const isLight = (i) => { const r = px[i]; const g = px[i + 1]; const b = px[i + 2]; return r > 190 && g > 190 && b > 190 && (Math.max(r, g, b) - Math.min(r, g, b)) < 16; };
  const bg = new Uint8Array(W * H); const stack = [];
  const push = (x, y) => { const p = y * W + x; if (bg[p] || !isLight(p * 4)) return; bg[p] = 1; stack.push(p); };
  for (let x = 0; x < W; x += 1) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y += 1) { push(0, y); push(W - 1, y); }
  while (stack.length) { const p = stack.pop(); const x = p % W; const y = (p / W) | 0; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
  const CUT = Math.round(W * 0.116); // the row labels
  for (let p = 0; p < W * H; p += 1) if (bg[p] || (p % W) < CUT) px[p * 4 + 3] = 0;
  ctx.putImageData(id, 0, 0);
  const op = (x, y) => px[(y * W + x) * 4 + 3] > 40;
  const rowHas = new Array(H).fill(false);
  for (let y = 0; y < H; y += 1) for (let x = CUT; x < W; x += 1) if (op(x, y)) { rowHas[y] = true; break; }
  const bands = []; let s = null; let g = 0;
  for (let y = 0; y <= H; y += 1) {
    const has = y < H && rowHas[y];
    if (has) { if (s === null) s = y; g = 0; } else if (s !== null) { g += 1; if (g > 6) { bands.push([s, y - g]); s = null; g = 0; } }
  }
  if (s !== null) bands.push([s, H - 1]);
  const strips = {}; const notes = [];
  bands.filter(([y0, y1]) => y1 - y0 > 40).forEach((band, bi) => {
    const name = rows[bi]; if (!name) return;
    const [y0, y1] = band; const bh = y1 - y0 + 1;
    // Bodies: tall opaque column runs (rods are thin).
    const colCount = new Array(W).fill(0);
    for (let x = CUT; x < W; x += 1) for (let y = y0; y <= y1; y += 1) if (op(x, y)) colCount[x] += 1;
    const bodies = []; let cs = null; let cg = 0;
    for (let x = 0; x <= W; x += 1) {
      const has = x < W && colCount[x] > 34 * unit;
      if (has) { if (cs === null) cs = x; cg = 0; } else if (cs !== null) { cg += 1; if (cg > 10 * unit) { bodies.push([cs, x - cg]); cs = null; cg = 0; } }
    }
    if (cs !== null) bodies.push([cs, W - 1]);
    // Components within the band.
    const lab = new Int32Array(W * bh).fill(-1); const comps = [];
    for (let y = y0; y <= y1; y += 1) for (let x = CUT; x < W; x += 1) {
      const li = (y - y0) * W + x; if (lab[li] !== -1 || !op(x, y)) continue;
      const idx = comps.length; const pixels = []; const st = [li]; lab[li] = idx;
      while (st.length) {
        const q = st.pop(); pixels.push(q); const qx = q % W; const qy = (q / W) | 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const nx = qx + dx; const ny = qy + dy;
          if (nx < CUT || nx >= W || ny < 0 || ny >= bh) continue;
          const nl = ny * W + nx; if (lab[nl] === -1 && op(nx, ny + y0)) { lab[nl] = idx; st.push(nl); }
        }
      }
      comps.push(pixels);
    }
    const nF = bodies.length; const framePixels = Array.from({ length: nF }, () => []);
    const mids = bodies.slice(0, -1).map((b, i) => (b[1] + bodies[i + 1][0]) / 2);
    const frameOfX = (x) => { let f = 0; while (f < mids.length && x > mids[f]) f += 1; return f; };
    const bodyBoxCount = (pixels, j) => { const [bx0, bx1] = bodies[j]; let n = 0; for (const q of pixels) { const qx = q % W; const qy = (q / W) | 0; if (qx >= bx0 && qx <= bx1 && qy > bh * 0.35) n += 1; } return n; };
    comps.forEach((pixels) => {
      const owners = []; for (let j = 0; j < nF; j += 1) if (bodyBoxCount(pixels, j) > 150 * unit * unit) owners.push(j);
      if (owners.length === 1) framePixels[owners[0]].push(...pixels);
      else if (owners.length === 0) { let sx = 0; for (const q of pixels) sx += q % W; framePixels[frameOfX(sx / pixels.length)].push(...pixels); }
      else for (const q of pixels) framePixels[frameOfX(q % W)].push(q);
    });
    const fw = Math.round(frameW * scale); const fh = Math.round(frameH * scale);
    const strip = document.createElement('canvas'); strip.width = fw * nF; strip.height = fh;
    const sctx = strip.getContext('2d'); sctx.imageSmoothingQuality = 'high';
    framePixels.forEach((pixels, fi) => {
      if (!pixels.length) return;
      const fc = document.createElement('canvas'); fc.width = W; fc.height = bh;
      const fctx = fc.getContext('2d'); const fid = fctx.createImageData(W, bh);
      let bottom = 0; let minX = W; let maxX = 0; let minY = bh;
      for (const q of pixels) {
        const qx = q % W; const qy = (q / W) | 0; const si = ((qy + y0) * W + qx) * 4; const di = q * 4;
        fid.data[di] = px[si]; fid.data[di + 1] = px[si + 1]; fid.data[di + 2] = px[si + 2]; fid.data[di + 3] = px[si + 3];
        if (qy > bottom) bottom = qy; if (qy < minY) minY = qy; if (qx < minX) minX = qx; if (qx > maxX) maxX = qx;
      }
      fctx.putImageData(fid, 0, 0);
      const [bx0, bx1] = bodies[fi]; let sum = 0; let n = 0;
      for (const q of pixels) { const qx = q % W; const qy = (q / W) | 0; if (qy >= bottom - 18 * unit && qx >= bx0 && qx <= bx1) { sum += qx; n += 1; } }
      const feet = n ? sum / n : (bx0 + bx1) / 2;
      const dx = feetX - feet; const dy = frameH - 8 * unit - bottom;
      sctx.drawImage(fc, minX, minY, maxX - minX + 1, bottom - minY + 1, Math.round((fi * frameW + minX + dx) * scale), Math.round((minY + dy) * scale), Math.round((maxX - minX + 1) * scale), Math.round((bottom - minY + 1) * scale));
    });
    strips[name] = { url: strip.toDataURL('image/png'), frames: nF, w: fw, h: fh, feetX: Math.round(feetX * scale), feetY: Math.round((frameH - 8 * unit) * scale) };
    notes.push(`${name}: ${nF} frames, ${comps.length} components`);
  });
  return { strips, notes };
}, { data, rows: ROWS, box: BOX });
await browser.close();
report.notes.forEach((note) => console.log(note));
const meta = {};
for (const name of KEEP) {
  const strip = report.strips[name];
  if (!strip) { console.error(`no ${name} row found`); process.exitCode = 1; continue; }
  writeFileSync(path.join(out, `${name}.png`), Buffer.from(strip.url.split(',')[1], 'base64'));
  meta[name] = { frames: strip.frames, w: strip.w, h: strip.h, feetX: strip.feetX, feetY: strip.feetY };
  console.log(`wrote src/assets/angler/${name}.png (${strip.frames} frames of ${strip.w}x${strip.h})`);
}
writeFileSync(path.join(out, 'strips.json'), `${JSON.stringify(meta, null, 2)}\n`);
console.log('wrote src/assets/angler/strips.json');

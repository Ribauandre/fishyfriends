// Cuts the dock sprite sheet (art/dock-parts.png, made in the ChatGPT app) into one
// transparent PNG per piece — pier sections, lamp posts, barrels and crates, a ladder, a
// bench, lobster traps, a life ring, a cleat, a perched gull, three boats, a buoy and a rock
// in the water — so the ones a scene wants can be copied into src/assets/props/dock.
//
//   node scripts/dockSlice.mjs [art/dock-parts.png] [out dir, default art/dock-parts/]
//
// The sheet's "transparent" background is a painted checkerboard, not real alpha, so it is
// flood-filled from the border (light, unsaturated, reachable) and cleared; each piece is then
// one connected component of what's left, found with a small dilation so a piece split by a
// pale gap stays whole, and written with only its own pixels — never the rectangle around it,
// which on this sheet would drag a neighbour's rigging in.
//
// Only the pieces a scene actually places belong in src/assets/props/dock (an unused import
// still ships), so this writes everything and the wanted ones are copied over by hand.
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
const sheet = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'art', 'dock-parts.png');
const out = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'art', 'dock-parts');
mkdirSync(out, { recursive: true });

const data = `data:image/png;base64,${readFileSync(sheet).toString('base64')}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const parts = await page.evaluate(async (src) => {
  const img = new Image(); img.src = src; await img.decode();
  const W = img.width; const H = img.height;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, W, H); const d = image.data;

  // The painted checkerboard, flooded from the border so a light patch inside a piece stays.
  const light = (q) => { const i = q * 4; const mx = Math.max(d[i], d[i + 1], d[i + 2]); const mn = Math.min(d[i], d[i + 1], d[i + 2]); return mn > 195 && mx - mn < 22; };
  const bg = new Uint8Array(W * H); const stack = [];
  const push = (x, y) => { const q = y * W + x; if (bg[q] || !light(q)) return; bg[q] = 1; stack.push(q); };
  for (let x = 0; x < W; x += 1) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y += 1) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const q = stack.pop(); const y = Math.floor(q / W); const x = q - y * W;
    if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1);
  }
  for (let q = 0; q < W * H; q += 1) if (bg[q]) d[q * 4 + 3] = 0;

  const opaque = (x, y) => d[(y * W + x) * 4 + 3] > 40;
  const seen = new Uint8Array(W * H); const found = []; const R = 3;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const q = y * W + x; if (seen[q] || !opaque(x, y)) continue;
    const pixels = []; const st = [q]; seen[q] = 1;
    let x0 = x; let x1 = x; let y0 = y; let y1 = y;
    while (st.length) {
      const j = st.pop(); pixels.push(j); const jy = Math.floor(j / W); const jx = j - jy * W;
      if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
      for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) {
        const nx = jx + dx; const ny = jy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const n = ny * W + nx;
        if (!seen[n] && opaque(nx, ny)) { seen[n] = 1; st.push(n); }
      }
    }
    if (pixels.length > 400) found.push({ x0, y0, x1, y1, pixels });
  }
  found.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
  return found.map((part) => {
    const w = part.x1 - part.x0 + 1; const h = part.y1 - part.y0 + 1;
    const cut = document.createElement('canvas'); cut.width = w; cut.height = h;
    const cctx = cut.getContext('2d'); const piece = cctx.createImageData(w, h);
    for (const q of part.pixels) {
      const qy = Math.floor(q / W); const qx = q - qy * W;
      const s = q * 4; const t = ((qy - part.y0) * w + (qx - part.x0)) * 4;
      piece.data[t] = d[s]; piece.data[t + 1] = d[s + 1]; piece.data[t + 2] = d[s + 2]; piece.data[t + 3] = d[s + 3];
    }
    cctx.putImageData(piece, 0, 0);
    return { w, h, url: cut.toDataURL('image/png') };
  });
}, data);
await browser.close();
parts.forEach((part, index) => {
  const name = `${String(index).padStart(2, '0')}_${part.w}x${part.h}.png`;
  writeFileSync(path.join(out, name), Buffer.from(part.url.split(',')[1], 'base64'));
});
console.log(`wrote ${parts.length} pieces to ${path.relative(root, out)}`);

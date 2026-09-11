// Lifts the artist's own beard off the dressed angler sheet and writes it as an overlay strip
// per action (src/assets/angler/beard/*.png), pixel-for-pixel on top of the bald strips.
//
//   node scripts/anglerBeard.mjs art/angler-dressed-sheet.png
//
// The dressed sheet is the same character in the same poses as art/angler-sheet.png, drawn
// with an olive cap and a full beard on a white background. Sliced on the same feet anchor
// into the same box, the two line up to within a pixel — so whatever the dressed frame has
// that the bald one does not is the cap and the beard, drawn by the artist for that pose, at
// that angle, with its own shading and line work. That is worth far more than a beard the
// painter invents: a shape guessed from a head box is the thing that looked sloppy.
//
// The two are told apart by hue, which the art makes easy: the cap is olive (red and green
// level, blue behind them) and the beard is brown (red ahead of green ahead of blue). Line
// work goes to whichever of the two it lies against. Only the beard is kept — hats come from
// the hats sheet, which has twenty of them — and it is written straight into the strip's own
// geometry, so the painter has nothing to scale or place: it stamps the overlay as it is.
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
if (!sheet) { console.error('usage: node scripts/anglerBeard.mjs <dressed-sheet.png>'); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'src', 'assets', 'angler');
const out = path.join(assets, 'beard');
mkdirSync(out, { recursive: true });

// The same rows and the same kept frames as scripts/anglerSlice.mjs — it is the same character
// in the same poses, so anything else would put a beard on the wrong face.
const ROWS = [[['idle', 5], ['walk', 5], ['cast', 5]], [['reel', 6], ['celebrate', 4], ['hurt', 3]]];
const KEEP = { idle: [0, 1, 2, 3, 4], cast: [4, 0, 1, 2], reel: [0, 1, 2, 3, 4, 5], celebrate: [0, 1, 2, 3], hurt: [0, 1, 2] };
const STRIPS = JSON.parse(readFileSync(path.join(assets, 'strips.json'), 'utf8'));
const BOX = { w: 250, h: 160, feetX: 80, feetY: 154 };

const bald = {};
for (const action of Object.keys(KEEP)) bald[action] = `data:image/png;base64,${readFileSync(path.join(assets, `${action}.png`)).toString('base64')}`;

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const data = readFileSync(sheet).toString('base64');
const report = await page.evaluate(async ({ data, bald, rows, keep, box, strips }) => {
  const load = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };
  const pixelsOf = (img) => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    return { data: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height };
  };
  const img = await load(`data:image/png;base64,${data}`);
  const { data: px, width: W, height: H } = pixelsOf(img);

  // The sheet is drawn on white: flood it away from the edges so the figures are all that is
  // left, then drop the navy label chips the same way the bald slicer does.
  const bg = new Uint8Array(W * H); const stack = [];
  const isLight = (p) => px[p * 4] > 200 && px[p * 4 + 1] > 200 && px[p * 4 + 2] > 200 && Math.max(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) - Math.min(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) < 20;
  const push = (x, y) => { const p = y * W + x; if (bg[p] || !isLight(p)) return; bg[p] = 1; stack.push(p); };
  for (let x = 0; x < W; x += 1) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y += 1) { push(0, y); push(W - 1, y); }
  while (stack.length) { const p = stack.pop(); const x = p % W; const y = (p / W) | 0; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
  const on = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p += 1) on[p] = bg[p] ? 0 : 1;

  const componentsOf = (mask, w, h) => {
    const seen = new Int32Array(w * h).fill(-1); const found = [];
    for (let p = 0; p < w * h; p += 1) {
      if (!mask[p] || seen[p] >= 0) continue;
      const index = found.length; const st = [p]; seen[p] = index; const pixels = [];
      let x0 = w; let y0 = h; let x1 = 0; let y1 = 0;
      while (st.length) {
        const q = st.pop(); pixels.push(q); const x = q % w; const y = (q / w) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([nx, ny]) => {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
          const k = ny * w + nx; if (mask[k] && seen[k] < 0) { seen[k] = index; st.push(k); }
        });
      }
      found.push({ pixels, x0, y0, x1, y1 });
    }
    return found;
  };

  let poses = componentsOf(on, W, H).filter((c) => c.pixels.length > 400);
  poses = poses.filter((c) => c.pixels.filter((p) => px[p * 4 + 2] - px[p * 4] > 20).length / c.pixels.length < 0.5);
  poses.sort((a, b) => a.y0 - b.y0);
  const bands = [];
  poses.forEach((comp) => {
    const band = bands.find((b) => comp.y0 <= b.y1 - 20 && comp.y1 >= b.y0 + 20);
    if (band) { band.items.push(comp); band.y0 = Math.min(band.y0, comp.y0); band.y1 = Math.max(band.y1, comp.y1); }
    else bands.push({ y0: comp.y0, y1: comp.y1, items: [comp] });
  });
  const poseBands = bands.filter((b) => b.y1 - b.y0 + 1 >= 140);

  // Brown against olive: the beard's red runs ahead of its green, the cap's does not.
  const isBeard = (p) => px[p * 4] - px[p * 4 + 1] > 10;
  const isDark = (p) => (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 < 70;

  // A rod arcing into the next pose joins the two into one blob, so the figures are counted
  // by their bodies — what survives losing three pixels all round — and every pixel goes to
  // the body nearest it. The beard is deep inside a body either way; this only has to get the
  // count and the feet right.
  const figuresIn = (band) => {
    // Only the band's own figures — the label chips sit in the same rows as a cast rod's arc
    // and would otherwise erode into bodies of their own.
    const mine = new Uint8Array(W * H);
    band.items.forEach((comp) => comp.pixels.forEach((p) => { mine[p] = 1; }));
    const solid = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      if (!mine[y * W + x]) continue;
      let ok = true;
      for (let dy = -3; dy <= 3 && ok; dy += 1) for (let dx = -3; dx <= 3; dx += 1) { const ny = y + dy; const nx = x + dx; if (ny < 0 || ny >= H || nx < 0 || nx >= W || !mine[ny * W + nx]) { ok = false; break; } }
      solid[y * W + x] = ok ? 1 : 0;
    }
    const bodies = componentsOf(solid, W, H).filter((b) => b.pixels.length > 1200);
    bodies.forEach((b) => { b.cx = b.pixels.reduce((s, p) => s + (p % W), 0) / b.pixels.length; b.cy = b.pixels.reduce((s, p) => s + ((p / W) | 0), 0) / b.pixels.length; b.own = []; });
    bodies.sort((a, b) => a.cx - b.cx);
    band.items.forEach((comp) => comp.pixels.forEach((p) => {
      const x = p % W; const y = (p / W) | 0;
      let best = null; let bestD = Infinity;
      bodies.forEach((b) => { const d = (x - b.cx) ** 2 + (y - b.cy) ** 2; if (d < bestD) { bestD = d; best = b; } });
      if (best) best.own.push(p);
    }));
    return bodies.map((b) => ({ pixels: b.own, y1: b.y1 }));
  };

  const sheets = {}; const notes = [];
  rows.forEach((row, index) => {
    const figures = figuresIn(poseBands[index]);
    let next = 0;
    row.forEach(([action, count]) => {
      const frames = figures.slice(next, next + count); next += count;
      if (!keep[action]) return;
      sheets[action] = keep[action].map((f) => frames[f]);
    });
    notes.push(`row ${index}: ${figures.length} figures`);
  });

  const results = {};
  for (const [action, frames] of Object.entries(sheets)) {
    const base = pixelsOf(await load(bald[action]));
    const strip = document.createElement('canvas');
    strip.width = base.width; strip.height = base.height;
    const sctx = strip.getContext('2d');
    const image = sctx.createImageData(strip.width, strip.height);
    let covered = 0; let total = 0;
    frames.forEach((comp, f) => {
      // Feet on the same spot the bald slicer used, so the two frames land on each other.
      let sum = 0; let n = 0;
      comp.pixels.forEach((p) => { if (((p / W) | 0) > comp.y1 - 8) { sum += p % W; n += 1; } });
      if (!n) { notes.push(`${action}[${f}] no feet found`); return; }
      const feetX = Math.round(sum / n); const feetY = comp.y1;
      const dx = f * box.w + box.feetX - feetX; const dy = box.feetY - feetY;
      const hit = new Set(); const line = new Set();
      comp.pixels.forEach((p) => {
        const x = (p % W) + dx; const y = ((p / W) | 0) + dy;
        if (x < f * box.w || x >= (f + 1) * box.w || y < 0 || y >= box.h) return;
        const to = (y * strip.width + x) * 4;
        total += 1;
        if (base.data[to + 3]) covered += 1;
        if (isBeard(p)) { hit.add(to); for (let k = 0; k < 3; k += 1) image.data[to + k] = px[p * 4 + k]; image.data[to + 3] = 255; }
        else if (isDark(p)) line.add(to);
      });
      // Line work touching the beard is the beard's; the cap's own is left behind.
      for (let pass = 0; pass < 2; pass += 1) {
        const gained = [];
        line.forEach((to) => {
          const i = to / 4; const x = i % strip.width; const y = (i / strip.width) | 0;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => hit.has(((y + oy) * strip.width + x + ox) * 4))) gained.push(to);
        });
        gained.forEach((to) => { line.delete(to); hit.add(to); image.data[to] = 20; image.data[to + 1] = 16; image.data[to + 2] = 14; image.data[to + 3] = 255; });
      }
      notes.push(`${action}[${f}] beard ${hit.size}px`);
    });
    sctx.putImageData(image, 0, 0);
    results[action] = { url: strip.toDataURL('image/png'), overlap: Math.round((covered / total) * 100) };
  }
  return { results, notes };
}, { data, bald, rows: ROWS, keep: KEEP, box: BOX, strips: STRIPS });

for (const [action, { url, overlap }] of Object.entries(report.results)) {
  writeFileSync(path.join(out, `${action}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`beard/${action}.png — ${overlap}% of the dressed frame lands on the bald one`);
}
report.notes.forEach((note) => console.log(' ', note));
await browser.close();

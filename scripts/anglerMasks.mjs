// Builds what utils/anglerPaint.js needs from the angler strips (src/assets/angler/*.png, the
// ChatGPT-made character sliced by scripts/anglerSlice.mjs): a part mask per strip
// (src/assets/angler/masks/*.png, red channel = part id — see PART in utils/anglerLook.js),
// per-frame anchors (src/utils/anglerAnchors.json: the cap's box, the beard's box and the
// face's box) that hats, hair and facial hair are placed against, and a colour-coded preview
// per strip beside the masks (masks/*.preview.png) to eyeball. Re-run whenever the strips
// change:
//
//   node scripts/anglerMasks.mjs
//
// Pixels are classified by nearest reference colour within a vertical band of the frame,
// then smoothed; the rod is the thin grey line outside the body's silhouette. Needs
// Playwright with Chromium (project or global install via NODE_PATH; PLAYWRIGHT_CHROMIUM to
// point at a binary).
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
const assets = path.join(root, 'src', 'assets', 'angler');
const masksDir = path.join(assets, 'masks');
mkdirSync(masksDir, { recursive: true });

const STRIPS = JSON.parse(readFileSync(path.join(assets, 'strips.json'), 'utf8'));
const PARTS = { skin: 1, beard: 2, hat: 3, panel: 4, jacket: 5, waders: 6, boots: 7, rod: 8, outline: 9 };
// Reference colours per part as drawn in the art, with the vertical band of the frame
// (fractions of frame height) the part can occur in.
const REFS = [
  { part: 'skin', rgb: [[220, 103, 38], [235, 150, 90], [190, 85, 35], [245, 185, 140], [160, 70, 30]], y: [0.1, 0.72] },
  { part: 'beard', rgb: [[53, 29, 15], [105, 51, 28], [80, 40, 20], [130, 65, 35]], y: [0.24, 0.38] },
  { part: 'hat', rgb: [[23, 57, 52], [35, 80, 70], [15, 40, 38], [50, 100, 85], [10, 28, 26], [28, 48, 44]], y: [0, 0.32] },
  { part: 'panel', rgb: [[207, 184, 153], [230, 215, 190], [180, 160, 130]], y: [0, 0.3] },
  { part: 'jacket', rgb: [[86, 83, 50], [63, 70, 48], [45, 52, 35], [100, 100, 60], [30, 36, 24]], y: [0.27, 0.95] },
  { part: 'waders', rgb: [[179, 138, 100], [147, 111, 78], [200, 165, 125], [120, 90, 62], [77, 63, 45]], y: [0.38, 0.9] },
  { part: 'boots', rgb: [[24, 26, 27], [40, 44, 46], [55, 60, 62]], y: [0.78, 1] },
  { part: 'outline', rgb: [[0, 0, 0], [10, 10, 10], [18, 18, 18]], y: [0, 1] },
  { part: 'rod', rgb: [[48, 48, 48], [64, 64, 64], [80, 80, 80], [36, 36, 36]], y: [0, 1] },
];
const PREVIEW = { 1: [255, 200, 150], 2: [255, 80, 40], 3: [0, 255, 0], 4: [255, 255, 255], 5: [0, 120, 255], 6: [255, 255, 0], 7: [255, 0, 255], 8: [0, 255, 255], 9: [30, 30, 30] };

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const anchors = {};
for (const [action, info] of Object.entries(STRIPS)) {
  const src = `data:image/png;base64,${readFileSync(path.join(assets, `${action}.png`)).toString('base64')}`;
  const result = await page.evaluate(async ({ src, frames, frameW, REFS, PARTS, PREVIEW }) => {
    const img = new Image(); img.src = src; await img.decode();
    const W = img.width; const H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const cls = new Uint8Array(W * H);
    const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4; if (d[i + 3] < 100) continue;
      const px = [d[i], d[i + 1], d[i + 2]]; const fy = y / H;
      let best = null; let bestD = Infinity;
      for (const ref of REFS) { if (fy < ref.y[0] || fy > ref.y[1]) continue; for (const rgb of ref.rgb) { const dd = dist(px, rgb); if (dd < bestD) { bestD = dd; best = ref.part; } } }
      cls[y * W + x] = PARTS[best];
    }
    // The rod is the grey outside the body: body = every non-rod, non-outline pixel dilated.
    const body = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i += 1) { const k = cls[i]; if (k && k !== PARTS.rod && k !== PARTS.outline) body[i] = 1; }
    const dil = new Uint8Array(W * H); const R = 3;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { if (!body[y * W + x]) continue; for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) { const yy = y + dy; const xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) dil[yy * W + xx] = 1; } }
    for (let i = 0; i < W * H; i += 1) { if (cls[i] === PARTS.rod && dil[i]) cls[i] = PARTS.outline; if (cls[i] === PARTS.outline && !dil[i] && d[i * 4 + 3] >= 100) cls[i] = PARTS.rod; }
    // Majority smoothing to clear speckle; the rod keeps its thin line.
    for (let pass = 0; pass < 2; pass += 1) {
      const next = new Uint8Array(cls);
      for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
        const i = y * W + x; const k = cls[i]; if (!k || k === PARTS.rod) continue;
        const votes = {};
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) { const n = cls[(y + dy) * W + x + dx]; if (n && n !== PARTS.rod) votes[n] = (votes[n] || 0) + 1; }
        let bestK = k; let bestV = 0; for (const [kk, v] of Object.entries(votes)) if (v > bestV) { bestV = v; bestK = +kk; }
        if (bestV >= 6 && bestK !== k) next[i] = bestK;
      }
      cls.set(next);
    }
    // Per-frame anchors: the cap (hat + panel), the beard, and the face (skin between them).
    const frameAnchors = [];
    for (let f = 0; f < frames; f += 1) {
      const box = (ids, yMin = 0, yMax = H) => {
        let x0 = 1e9; let y0 = 1e9; let x1 = -1; let y1 = -1;
        for (let y = yMin; y < yMax; y += 1) for (let x = f * frameW; x < (f + 1) * frameW; x += 1) {
          if (ids.includes(cls[y * W + x])) { const lx = x - f * frameW; if (lx < x0) x0 = lx; if (lx > x1) x1 = lx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        return x1 < 0 ? null : { x0, y0, x1, y1 };
      };
      // The cap and the beard are each the largest patch of their parts, so a fish held up in a
      // celebrate frame (green, dark) can't stretch the box.
      const largest = (ids) => {
        const seen = new Uint8Array(W * H); let best = null;
        for (let y = 0; y < H; y += 1) for (let x = f * frameW; x < (f + 1) * frameW; x += 1) {
          const i = y * W + x; if (seen[i] || !ids.includes(cls[i])) continue;
          const stack = [i]; seen[i] = 1; let area = 0; let x0 = x; let x1 = x; let y0 = y; let y1 = y;
          while (stack.length) {
            const j = stack.pop(); area += 1; const jy = Math.floor(j / W); const jx = j - jy * W;
            if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
            [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([dx, dy]) => { const nx = jx + dx; const ny = jy + dy; if (nx < f * frameW || nx >= (f + 1) * frameW || ny < 0 || ny >= H) return; const n = ny * W + nx; if (!seen[n] && ids.includes(cls[n])) { seen[n] = 1; stack.push(n); } });
          }
          if (!best || area > best.area) best = { area, x0: x0 - f * frameW, x1: x1 - f * frameW, y0, y1 };
        }
        if (!best || best.area <= 20) return null;
        // Pull in the pieces that touch it (the brim and panel are cut off the crown by outline).
        const merged = { x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1 };
        let grew = true;
        while (grew) {
          grew = false;
          for (let y = 0; y < H; y += 1) for (let x = f * frameW; x < (f + 1) * frameW; x += 1) {
            const lx = x - f * frameW;
            if (!ids.includes(cls[y * W + x])) continue;
            if (lx >= merged.x0 - 6 && lx <= merged.x1 + 6 && y >= merged.y0 - 6 && y <= merged.y1 + 6 && (lx < merged.x0 || lx > merged.x1 || y < merged.y0 || y > merged.y1)) {
              merged.x0 = Math.min(merged.x0, lx); merged.x1 = Math.max(merged.x1, lx); merged.y0 = Math.min(merged.y0, y); merged.y1 = Math.max(merged.y1, y); grew = true;
            }
          }
        }
        return merged;
      };
      let hat = largest([PARTS.hat, PARTS.panel]);
      // The jacket never rises above the cap's bottom row, so dark green up there is cap shading.
      if (hat) {
        for (let y = 0; y <= hat.y1; y += 1) for (let x = f * frameW; x < (f + 1) * frameW; x += 1) { if (cls[y * W + x] === PARTS.jacket) cls[y * W + x] = PARTS.hat; }
        hat = largest([PARTS.hat, PARTS.panel]);
      }
      const beard = largest([PARTS.beard]);
      const faceBox = hat ? box([PARTS.skin], hat.y0, (beard ? beard.y1 : hat.y1 + 30) + 4) : null;
      // The face is the skin under the cap, not a raised hand: clip it to the cap's reach.
      const face = faceBox && hat ? { x0: Math.max(faceBox.x0, hat.x0 - 6), y0: faceBox.y0, x1: Math.min(faceBox.x1, hat.x1 + 6), y1: faceBox.y1 } : faceBox;
      frameAnchors.push({ hat, beard, face });
    }
    const maskImage = ctx.createImageData(W, H); const preview = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i += 1) {
      const k = cls[i]; if (!k) continue;
      maskImage.data[i * 4] = k; maskImage.data[i * 4 + 3] = 255;
      const col = PREVIEW[k] || [255, 255, 255]; preview.data[i * 4] = col[0]; preview.data[i * 4 + 1] = col[1]; preview.data[i * 4 + 2] = col[2]; preview.data[i * 4 + 3] = 255;
    }
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H; mc.getContext('2d').putImageData(maskImage, 0, 0);
    const pc = document.createElement('canvas'); pc.width = W; pc.height = H; const pctx = pc.getContext('2d'); pctx.putImageData(preview, 0, 0);
    pctx.lineWidth = 1;
    frameAnchors.forEach((a, f) => {
      [['hat', '#ff0000'], ['beard', '#ff00aa'], ['face', '#0000ff']].forEach(([key, colour]) => { const b = a[key]; if (!b) return; pctx.strokeStyle = colour; pctx.strokeRect(f * frameW + b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0, b.y1 - b.y0); });
    });
    return { mask: mc.toDataURL('image/png'), preview: pc.toDataURL('image/png'), anchors: frameAnchors };
  }, { src, frames: info.frames, frameW: info.w, REFS, PARTS, PREVIEW });
  writeFileSync(path.join(masksDir, `${action}.png`), Buffer.from(result.mask.split(',')[1], 'base64'));
  writeFileSync(path.join(masksDir, `${action}.preview.png`), Buffer.from(result.preview.split(',')[1], 'base64'));
  anchors[action] = result.anchors;
  console.log(action, JSON.stringify(result.anchors[0]));
}
await browser.close();
writeFileSync(path.join(root, 'src', 'utils', 'anglerAnchors.json'), `${JSON.stringify(anchors)}\n`);
console.log('wrote src/utils/anglerAnchors.json');

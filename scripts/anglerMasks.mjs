// Builds what utils/anglerPaint.js needs from the angler strips (src/assets/angler/*.png, cut
// from the sheet by scripts/anglerSlice.mjs): a part mask per strip
// (src/assets/angler/masks/*.png, red channel = part id — see PART in utils/anglerLook.js),
// per-frame head boxes (src/utils/anglerAnchors.json) that hats, hair and facial hair are
// placed against, and a colour-coded preview per strip beside the masks
// (masks/*.preview.png, with the head box drawn on) to eyeball. Re-run whenever the strips
// change:
//
//   node scripts/anglerMasks.mjs
//
// The rod is found by shape, not colour — it is the long thin thing outside the body, the body
// being the silhouette eroded until nothing as narrow as a rod survives and then grown back —
// and then the rod is grown back along its own
// brown into the fist that holds it, which keeps it apart from the boots it is painted almost
// the same colour as. The line it throws is thin too but bright blue, and is left in no part
// at all so no dye reaches it. Everything else is classified by nearest reference colour
// within a vertical band of the frame, then smoothed.
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
const assets = path.join(root, 'src', 'assets', 'angler');
const masksDir = path.join(assets, 'masks');
mkdirSync(masksDir, { recursive: true });

const STRIPS = JSON.parse(readFileSync(path.join(assets, 'strips.json'), 'utf8'));
const PARTS = { skin: 1, shirt: 2, vest: 3, pants: 4, boots: 5, rod: 6, outline: 9 };
// Reference colours per part as drawn in the art, with the vertical band of the frame
// (fractions of frame height) the part can occur in.
const REFS = [
  { part: 'skin', rgb: [[253, 159, 87], [244, 145, 74], [249, 161, 91], [232, 125, 53], [218, 117, 50], [193, 100, 42]], y: [0, 0.95] },
  { part: 'shirt', rgb: [[70, 95, 121], [48, 73, 96], [96, 122, 148]], y: [0.34, 0.82] },
  { part: 'vest', rgb: [[96, 93, 52], [117, 111, 63], [73, 73, 41], [67, 65, 32], [49, 48, 26]], y: [0.34, 0.84] },
  { part: 'pants', rgb: [[21, 92, 186], [20, 87, 174], [15, 80, 164], [6, 66, 145], [4, 53, 121]], y: [0.52, 1] },
  { part: 'boots', rgb: [[93, 50, 21], [72, 43, 18], [48, 30, 14], [46, 23, 8]], y: [0.78, 1] },
  { part: 'outline', rgb: [[4, 2, 2], [18, 7, 2], [25, 16, 7], [23, 25, 19], [2, 7, 19]], y: [0, 1] },
];
// The rod's own brown, for growing it out of the fist that holds it.
const ROD_RGB = [[93, 50, 21], [72, 43, 18], [48, 30, 14], [46, 23, 8]];
const PREVIEW = { 1: [255, 200, 150], 2: [255, 255, 255], 3: [255, 210, 40], 4: [0, 200, 90], 5: [255, 0, 200], 6: [0, 220, 255], 9: [30, 30, 30] };

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const anchors = {};
for (const [action, info] of Object.entries(STRIPS.actions)) {
  const src = `data:image/png;base64,${readFileSync(path.join(assets, `${action}.png`)).toString('base64')}`;
  const result = await page.evaluate(async ({ src, frames, frameW, REFS, PARTS, PREVIEW, ROD_RGB }) => {
    const img = new Image(); img.src = src; await img.decode();
    const W = img.width; const H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const opaque = (x, y) => d[(y * W + x) * 4 + 3] > 100;
    const cls = new Uint8Array(W * H);

    // The body: the silhouette eroded until nothing as narrow as the rod is left, then grown
    // back. Doing it by shape rather than by column height is what lets a rod held near
    // upright fall outside it instead of reading as another leg.
    const ERODE = 3; const GROW = 5;
    const eroded = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      if (!opaque(x, y)) continue;
      let solid = true;
      for (let dy = -ERODE; dy <= ERODE && solid; dy += 1) for (let dx = -ERODE; dx <= ERODE; dx += 1) { if (!opaque(x + dx, y + dy)) { solid = false; break; } }
      if (solid) eroded[y * W + x] = 1;
    }
    const inBody = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      if (!eroded[y * W + x]) continue;
      for (let dy = -GROW; dy <= GROW; dy += 1) for (let dx = -GROW; dx <= GROW; dx += 1) { const yy = y + dy; const xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) inBody[yy * W + xx] = 1; }
    }

    // Outside the body: thin components are the rod and its line. Solid ones that touch the
    // body are still the angler (a hand at the end of an outstretched arm) and get classified
    // by colour; solid ones floating free are things he is holding at arm's length — the fish
    // and its sparkle in the celebrate frames — and are left alone so no dye reaches them.
    const seenOut = new Uint8Array(W * H);
    const thin = new Uint8Array(W * H);
    const loose = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      if (seenOut[i] || inBody[i] || !opaque(x, y)) continue;
      const pixels = []; const stack = [i]; seenOut[i] = 1;
      let bx0 = x; let bx1 = x; let by0 = y; let by1 = y; let touchesBody = false;
      while (stack.length) {
        const q = stack.pop(); pixels.push(q); const qy = Math.floor(q / W); const qx = q - qy * W;
        if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const nx = qx + dx; const ny = qy + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const n = ny * W + nx;
          if (inBody[n] && opaque(nx, ny)) touchesBody = true;
          if (!seenOut[n] && !inBody[n] && opaque(nx, ny)) { seenOut[n] = 1; stack.push(n); }
        }
      }
      // Thin however it is angled: either the average thickness (area over the longest side)
      // is small, which catches a rod held near upright, or the bounding box is mostly empty,
      // which catches one swept into an arc. A hand or a held fish passes neither.
      const bw = (bx1 - bx0) + 1; const bh = (by1 - by0) + 1; const long = Math.max(bw, bh);
      if (pixels.length / long < 8 || pixels.length / (bw * bh) < 0.25) for (const q of pixels) thin[q] = 1;
      else if (!touchesBody) for (const q of pixels) loose[q] = 1;
    }

    const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 4; if (d[i + 3] < 100) continue;
      if (loose[y * W + x]) continue;
      const px = [d[i], d[i + 1], d[i + 2]]; const fy = y / H;
      // The rod and the line it throws are both thin; the line is the bright blue one, and is
      // left in no part at all so nothing ever dyes it.
      if (thin[y * W + x]) { if (!(px[2] > px[0] + 40 && px[2] > 130)) cls[y * W + x] = PARTS.rod; continue; }
      let best = null; let bestD = Infinity;
      for (const ref of REFS) { if (fy < ref.y[0] || fy > ref.y[1]) continue; for (const rgb of ref.rgb) { const dd = dist(px, rgb); if (dd < bestD) { bestD = dd; best = ref.part; } } }
      cls[y * W + x] = PARTS[best];
    }

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

    // The rod does not stop at the silhouette: grow it back through its own brown into the
    // fist that holds it, so the grip is dyed with the blank and not with the vest.
    const rodDist = (px) => Math.min(...ROD_RGB.map((r) => (px[0] - r[0]) ** 2 + (px[1] - r[1]) ** 2 + (px[2] - r[2]) ** 2));
    const rodStack = [];
    for (let i = 0; i < W * H; i += 1) if (cls[i] === PARTS.rod) rodStack.push(i);
    while (rodStack.length) {
      const q = rodStack.pop(); const qy = Math.floor(q / W); const qx = q - qy * W;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = qx + dx; const ny = qy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const n = ny * W + nx; const k = cls[n];
        if (!k || k === PARTS.rod || k === PARTS.boots || ny / H > 0.78) continue;
        const j = n * 4;
        if (rodDist([d[j], d[j + 1], d[j + 2]]) > 900) continue;
        cls[n] = PARTS.rod; rodStack.push(n);
      }
    }

    // The head: the largest patch of skin in the top of the frame. The skin is eroded first so
    // that a hand raised against the head (the backswing) breaks away at the wrist instead of
    // being counted as part of it; the box is grown back by the pixel that took off.
    const skin = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
      const i = y * W + x;
      if (cls[i] === PARTS.skin && cls[i - 1] === PARTS.skin && cls[i + 1] === PARTS.skin && cls[i - W] === PARTS.skin && cls[i + W] === PARTS.skin) skin[i] = 1;
    }
    const frameAnchors = [];
    for (let f = 0; f < frames; f += 1) {
      const x0 = f * frameW; const x1 = Math.min(W, x0 + frameW); const limit = Math.round(H * 0.66);
      const seen = new Uint8Array(W * H); let best = null;
      for (let y = 0; y < limit; y += 1) for (let x = x0; x < x1; x += 1) {
        const i = y * W + x; if (seen[i] || !skin[i]) continue;
        const stack = [i]; seen[i] = 1; let area = 0; let bx0 = x; let bx1 = x; let by0 = y; let by1 = y;
        while (stack.length) {
          const q = stack.pop(); area += 1; const qy = Math.floor(q / W); const qx = q - qy * W;
          if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const nx = qx + dx; const ny = qy + dy;
            if (nx < x0 || nx >= x1 || ny < 0 || ny >= limit) continue;
            const n = ny * W + nx; if (!seen[n] && skin[n]) { seen[n] = 1; stack.push(n); }
          }
        }
        if (!best || area > best.area) best = { area, x0: bx0 - x0, x1: bx1 - x0, y0: by0, y1: by1 };
      }
      frameAnchors.push({ head: best ? { x0: best.x0 - 1, y0: best.y0 - 1, x1: best.x1 + 1, y1: best.y1 + 1 } : null });
    }

    const maskImage = ctx.createImageData(W, H); const preview = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i += 1) {
      const k = cls[i]; if (!k) continue;
      maskImage.data[i * 4] = k; maskImage.data[i * 4 + 3] = 255;
      const col = PREVIEW[k] || [255, 0, 0]; preview.data[i * 4] = col[0]; preview.data[i * 4 + 1] = col[1]; preview.data[i * 4 + 2] = col[2]; preview.data[i * 4 + 3] = 255;
    }
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H; mc.getContext('2d').putImageData(maskImage, 0, 0);
    const pc = document.createElement('canvas'); pc.width = W; pc.height = H; const pctx = pc.getContext('2d'); pctx.putImageData(preview, 0, 0);
    pctx.strokeStyle = '#ff0000'; pctx.lineWidth = 1;
    frameAnchors.forEach(({ head }, f) => { if (head) pctx.strokeRect(f * frameW + head.x0 + 0.5, head.y0 + 0.5, head.x1 - head.x0, head.y1 - head.y0); });
    return { mask: mc.toDataURL('image/png'), preview: pc.toDataURL('image/png'), anchors: frameAnchors };
  }, { src, frames: info.frames, frameW: STRIPS.box.w, REFS, PARTS, PREVIEW, ROD_RGB });
  writeFileSync(path.join(masksDir, `${action}.png`), Buffer.from(result.mask.split(',')[1], 'base64'));
  writeFileSync(path.join(masksDir, `${action}.preview.png`), Buffer.from(result.preview.split(',')[1], 'base64'));
  anchors[action] = result.anchors;
  console.log(action, JSON.stringify(result.anchors.map((a) => a.head)));
}
await browser.close();
writeFileSync(path.join(root, 'src', 'utils', 'anglerAnchors.json'), `${JSON.stringify(anchors)}\n`);
console.log('wrote src/utils/anglerAnchors.json');

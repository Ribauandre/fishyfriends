// Builds what utils/anglerPaint.js needs from the angler strips (src/assets/angler/*.png, the
// ChatGPT-made character sliced by scripts/anglerSlice.mjs): a part mask per strip
// (src/assets/angler/masks/*.png, red channel = part id — see PART in utils/anglerLook.js),
// per-frame anchors (src/utils/anglerAnchors.json: the head's box and the face's box) that
// hair, beards and hats are built against, and a colour-coded preview per strip beside the
// masks (masks/*.preview.png) to eyeball. Re-run whenever the strips change:
//
//   node scripts/anglerMasks.mjs
//
// The character is drawn bald and clean-shaven, so there is no cap or beard to tell apart —
// the parts are the five the art actually has plus its line work. Pixels are classified by
// nearest reference colour, the rod is the brown thin line outside the body's silhouette, and
// the head is the biggest run of skin in the top of the figure. The face box is the line work
// inside the head — the eyes, the brow and the mouth — which is what says which way the head
// is turned. Needs Playwright with Chromium (project or global install via NODE_PATH;
// PLAYWRIGHT_CHROMIUM to point at a binary).
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
const PARTS = { skin: 1, shirt: 2, waders: 3, boots: 4, rod: 5, outline: 6 };
// Reference colours per part as drawn in the art: skin orange, the shirt a pale blue grey,
// the waders olive, the boots a neutral dark, and the line work black. The rod is not in here
// — the art paints it a brown that sits between the line work and the boots, so it is found
// by its shape instead (see below).
const REFS = [
  { part: 'skin', rgb: [[213, 139, 85], [232, 170, 120], [190, 115, 68], [246, 202, 164], [158, 88, 48]] },
  { part: 'shirt', rgb: [[186, 191, 206], [216, 220, 231], [150, 157, 173], [118, 125, 142]] },
  { part: 'waders', rgb: [[128, 112, 80], [101, 89, 62], [78, 68, 46], [150, 134, 98], [58, 52, 36]] },
  { part: 'boots', rgb: [[42, 42, 47], [58, 58, 64], [26, 26, 31], [76, 76, 82]] },
  { part: 'outline', rgb: [[0, 0, 0], [12, 12, 12], [22, 20, 18]] },
];
const PREVIEW = { 1: [255, 200, 150], 2: [255, 255, 255], 3: [255, 255, 0], 4: [255, 0, 255], 5: [0, 255, 255], 6: [30, 30, 30] };
// Which way each frame's head is turned. The sheet only ever draws the angler in a
// three-quarter turn to his right — the eyes sit in the right third of the head in every
// frame, bowed ones included — so this is one fact about the art rather than something to
// find in it. The painter puts a cap's peak and a beard's chin on the front from it, and it
// reads the box as a profile: hairline deep at the back of the head and shallow at the
// forehead, sideburn high at the ear and beard low at the chin.
const FACING = 'right';

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const anchors = {};
for (const [action, info] of Object.entries(STRIPS)) {
  const src = `data:image/png;base64,${readFileSync(path.join(assets, `${action}.png`)).toString('base64')}`;
  const result = await page.evaluate(async ({ src, frames, frameW, REFS, PARTS, PREVIEW, FACING }) => {
    const img = new Image(); img.src = src; await img.decode();
    const W = img.width; const H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const cls = new Uint8Array(W * H);
    const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    for (let i = 0; i < W * H; i += 1) {
      if (d[i * 4 + 3] < 100) continue;
      const px = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
      // The waders' deepest folds go almost black, and nearest-colour hands them to the line
      // work, which leaves a dyed pair of waders full of undyed holes. They keep their olive
      // cast all the way down though — red and green together with blue behind them — and the
      // art's line work is neutral, so the tint tells them apart where the brightness cannot.
      if ((px[0] + px[1]) / 2 - px[2] >= 14 && Math.abs(px[0] - px[1]) <= 14 && (px[0] + px[1] + px[2]) / 3 < 60) { cls[i] = PARTS.waders; continue; }
      let best = null; let bestD = Infinity;
      for (const ref of REFS) for (const rgb of ref.rgb) { const dd = dist(px, rgb); if (dd < bestD) { bestD = dd; best = ref.part; } }
      cls[i] = PARTS[best];
    }
    // The rod is not told apart by colour — the art paints it a brown so dark it sits between
    // the line work and the boots — but by shape: it is the only thing on the figure thin
    // enough to disappear under an erosion. So the body is what survives losing three pixels
    // all round, and every opaque pixel outside that body, grown back with room to spare for
    // fingers and boot heels, is the rod. Where the rod crosses the body it stays line work,
    // which is how it was drawn and how it reads.
    const on = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i += 1) on[i] = d[i * 4 + 3] >= 100 ? 1 : 0;
    const grow = (mask, R) => {
      const out = new Uint8Array(W * H);
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { if (!mask[y * W + x]) continue; for (let dy = -R; dy <= R; dy += 1) for (let dx = -R; dx <= R; dx += 1) { const yy = y + dy; const xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) out[yy * W + xx] = 1; } }
      return out;
    };
    const body = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      let solid = true;
      for (let dy = -3; dy <= 3 && solid; dy += 1) for (let dx = -3; dx <= 3; dx += 1) { const yy = y + dy; const xx = x + dx; if (yy < 0 || yy >= H || xx < 0 || xx >= W || !on[yy * W + xx]) { solid = false; break; } }
      body[y * W + x] = solid ? 1 : 0;
    }
    const dil = grow(body, 4);
    for (let i = 0; i < W * H; i += 1) {
      if (!on[i]) continue;
      if (!dil[i]) { cls[i] = PARTS.rod; continue; }
      // Every pixel-art figure here is keylined, so the outermost pixel of the body is the
      // line and nothing else — without this the antialiased edge reads as dark boot leather
      // and rings the whole angler in a colour that then takes the boot dye.
      const x = i % W; const y = (i / W) | 0;
      const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => {
        const nx = x + dx; const ny = y + dy;
        return nx < 0 || ny < 0 || nx >= W || ny >= H || !on[ny * W + nx];
      });
      if (edge) cls[i] = PARTS.outline;
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

    const frameAnchors = [];
    for (let f = 0; f < frames; f += 1) {
      const fx0 = f * frameW; const fx1 = (f + 1) * frameW;
      let top = H; let bottom = -1;
      for (let y = 0; y < H; y += 1) for (let x = fx0; x < fx1; x += 1) if (cls[y * W + x]) { if (y < top) top = y; bottom = Math.max(bottom, y); break; }
      for (let y = H - 1; y >= 0; y -= 1) { let any = false; for (let x = fx0; x < fx1; x += 1) if (cls[y * W + x]) { any = true; break; } if (any) { bottom = y; break; } }
      // The head: the biggest patch of skin whose top is in the top of the figure. A raised
      // fist is skin up there too, but it is a fraction of the size of a head.
      const seen = new Uint8Array(W * H); let head = null;
      const ceiling = top + (bottom - top) * 0.45;
      for (let y = top; y <= bottom; y += 1) for (let x = fx0; x < fx1; x += 1) {
        const i = y * W + x; if (seen[i] || cls[i] !== PARTS.skin) continue;
        const stack = [i]; seen[i] = 1; let area = 0; let x0 = x; let x1 = x; let y0 = y; let y1 = y;
        const wide = new Map(); const rows = new Map();
        while (stack.length) {
          const j = stack.pop(); area += 1; const jy = Math.floor(j / W); const jx = j - jy * W;
          if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < y0) y0 = jy; if (jy > y1) y1 = jy;
          wide.set(jy, (wide.get(jy) || 0) + 1);
          const span = rows.get(jy); const lx = jx - fx0;
          if (span) { span[0] = Math.min(span[0], lx); span[1] = Math.max(span[1], lx); } else rows.set(jy, [lx, lx]);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nx = jx + dx; const ny = jy + dy;
            if (nx < fx0 || nx >= fx1 || ny < 0 || ny >= H) return;
            const n = ny * W + nx; if (!seen[n] && cls[n] === PARTS.skin) { seen[n] = 1; stack.push(n); }
          });
        }
        if (y0 > ceiling) continue;
        if (!head || area > head.area) head = { area, x0: x0 - fx0, y0, x1: x1 - fx0, y1, wide, rows };
      }
      if (head) {
        // The neck is the same skin as the face and joined to it, so the patch runs on down
        // into the collar. A head is widest at the cheeks and a neck is not, so the chin is
        // the first row below the widest one that has lost most of that width — and the box
        // has to stop there, or every beard and hairline is measured against a head half
        // again too long.
        let widest = head.y0; let most = 0;
        head.wide.forEach((n, y) => { if (n > most) { most = n; widest = y; } });
        for (let y = widest + 1; y <= head.y1; y += 1) {
          if ((head.wide.get(y) || 0) >= most * 0.55) continue;
          head.y1 = y - 1; break;
        }
        let x0 = Infinity; let x1 = -Infinity;
        head.rows.forEach((span, y) => { if (y > head.y1) return; x0 = Math.min(x0, span[0]); x1 = Math.max(x1, span[1]); });
        if (Number.isFinite(x0)) { head.x0 = x0; head.x1 = x1; }
      }
      // The face: the line work inside the head — the brow, the eyes, the mouth. Its bottom
      // row is the mouth line, which is where a beard's moustache ends and its jaw begins.
      // Only line work with head all round it counts, and the chin is cut off the bottom,
      // where the neck below leaves the silhouette's own line looking just as boxed in.
      let face = null;
      if (head) {
        const chin = head.y0 + (head.y1 - head.y0) * 0.8;
        for (let y = head.y0; y <= chin; y += 1) for (let x = head.x0 + fx0; x <= head.x1 + fx0; x += 1) {
          if (cls[y * W + x] !== PARTS.outline) continue;
          let boxed = true;
          for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) {
            const nx = x + dx; const ny = y + dy;
            if (nx < fx0 || nx >= fx1 || ny < 0 || ny >= H) { boxed = false; break; }
            const k = cls[ny * W + nx];
            if (k !== PARTS.skin && k !== PARTS.outline) { boxed = false; break; }
          }
          if (!boxed) continue;
          const lx = x - fx0;
          face = face
            ? { x0: Math.min(face.x0, lx), y0: Math.min(face.y0, y), x1: Math.max(face.x1, lx), y1: Math.max(face.y1, y) }
            : { x0: lx, y0: y, x1: lx, y1: y };
        }
      }
      frameAnchors.push({ head: head && { x0: head.x0, y0: head.y0, x1: head.x1, y1: head.y1 }, face, facing: FACING });
    }

    const maskImage = ctx.createImageData(W, H); const preview = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i += 1) {
      const k = cls[i]; if (!k) continue;
      maskImage.data[i * 4] = k; maskImage.data[i * 4 + 3] = 255;
      const col = PREVIEW[k] || [255, 0, 0]; preview.data[i * 4] = col[0]; preview.data[i * 4 + 1] = col[1]; preview.data[i * 4 + 2] = col[2]; preview.data[i * 4 + 3] = 255;
    }
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H; mc.getContext('2d').putImageData(maskImage, 0, 0);
    const pc = document.createElement('canvas'); pc.width = W; pc.height = H; const pctx = pc.getContext('2d'); pctx.putImageData(preview, 0, 0);
    pctx.lineWidth = 1;
    frameAnchors.forEach((a, f) => {
      [['head', '#ff0000'], ['face', '#0000ff']].forEach(([key, colour]) => { const b = a[key]; if (!b) return; pctx.strokeStyle = colour; pctx.strokeRect(f * frameW + b.x0 + 0.5, b.y0 + 0.5, b.x1 - b.x0, b.y1 - b.y0); });
    });
    return { mask: mc.toDataURL('image/png'), preview: pc.toDataURL('image/png'), anchors: frameAnchors };
  }, { src, frames: info.frames, frameW: info.w, REFS, PARTS, PREVIEW, FACING });
  writeFileSync(path.join(masksDir, `${action}.png`), Buffer.from(result.mask.split(',')[1], 'base64'));
  writeFileSync(path.join(masksDir, `${action}.preview.png`), Buffer.from(result.preview.split(',')[1], 'base64'));
  anchors[action] = result.anchors;
  console.log(action, JSON.stringify(result.anchors));
}
await browser.close();
writeFileSync(path.join(root, 'src', 'utils', 'anglerAnchors.json'), `${JSON.stringify(anchors)}\n`);
console.log('wrote src/utils/anglerAnchors.json');

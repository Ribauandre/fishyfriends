// Lifts what the artist drew on the angler's head off a sheet that has it, as an overlay strip
// per action laid pixel-for-pixel on top of the bald strips:
//
//   node scripts/anglerDressed.mjs beard art/angler-dressed-sheet.png  -> assets/angler/beard/*
//   node scripts/anglerDressed.mjs hair  art/angler-haired-sheet.png   -> assets/angler/hair/*
//
// The beard run also measures the cap that sheet wears and writes src/utils/hatAnchors.json.
//
// The dressed sheet is the same character in the same poses as art/angler-sheet.png, drawn
// with an olive cap and a full beard on a white background. Sliced on the same feet anchor
// into the same box, the two line up to within a pixel — so whatever the dressed frame has
// that the bald one does not is the cap and the beard, drawn by the artist for that pose, at
// that angle, with its own shading and line work. That is worth far more than a beard the
// painter invents: a shape guessed from a head box is the thing that looked sloppy.
//
// What is lifted is the brown around the head, which is all either sheet adds there: hair on
// one, a beard on the other. Hue does the work — brown runs red ahead of green ahead of blue,
// where the cap's olive has red and green level, and the waders are further off still. Line work
// goes with whatever it lies against. Each overlay is written straight into the strip's own
// geometry, so the painter has nothing to scale or place: it stamps it as it is. That is the
// whole point of these sheets — a hairstyle drawn for a head thrown back mid-cast beats any
// front-on hairpiece pasted onto one, and there are twenty-two of those heads.
//
// The cap itself is thrown away — hats come from the hats sheet, which has twenty of them — but
// not before it is measured. Where a hat sits was the last thing in this pipeline still being
// guessed at, as a fraction of the head box, and it showed: a fraction cannot know that the
// head is tipped forward in one pose and thrown back in another. The artist did know, in every
// frame, so each frame keeps the centre and the row of the cap's own brim and every hat is
// hung on that.
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

const [kind, sheet] = process.argv.slice(2);
// `below` is how far past the chin to look, as a fraction of the head: a beard spills onto the
// collar, hair does not. `caps` says the sheet wears one worth measuring.
const LIFT = { beard: { below: 0.55, caps: true }, hair: { below: 0, caps: false } };
const lift = LIFT[kind];
if (!lift || !sheet) { console.error(`usage: node scripts/anglerDressed.mjs <${Object.keys(LIFT).join('|')}> <sheet.png>`); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'src', 'assets', 'angler');
const out = path.join(assets, kind);
mkdirSync(out, { recursive: true });
const ANCHORS = JSON.parse(readFileSync(path.join(root, 'src', 'utils', 'anglerAnchors.json'), 'utf8'));

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
const report = await page.evaluate(async ({ data, bald, rows, keep, box, strips, heads, lift }) => {
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

  // Brown against olive: hair and beard run red ahead of green, where the cap's olive has the
  // two level. Skin runs redder still, so darkness is what separates it — the face is the
  // lightest thing on the head and hair the darkest.
  const isBeard = (p) => px[p * 4] - px[p * 4 + 1] > 10 && (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 < 130;
  const isDark = (p) => (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 < 70;
  const isCap = (p) => Math.abs(px[p * 4] - px[p * 4 + 1]) <= 12 && (px[p * 4] + px[p * 4 + 1]) / 2 - px[p * 4 + 2] > 16 && (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 < 170;

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

  const results = {}; const hatAnchors = {};
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
      const hit = new Set(); const line = new Set(); const capRows = new Map();
      // The head this pose was sliced with, so the cap can be told from the waders — which are
      // the same olive, and the only other olive on the figure.
      const box0 = (heads[action] || [])[f];
      const head = box0 && box0.head;
      comp.pixels.forEach((p) => {
        const x = (p % W) + dx; const y = ((p / W) | 0) + dy;
        if (x < f * box.w || x >= (f + 1) * box.w || y < 0 || y >= box.h) return;
        const to = (y * strip.width + x) * 4;
        total += 1;
        if (base.data[to + 3]) covered += 1;
        // Only brown around the head — the rod is brown too, and crosses right past it.
        const lx = x - f * box.w;
        const onHead = head && lx >= head.x0 - 14 && lx <= head.x1 + 14 && y >= head.y0 - 18 && y <= head.y1 + (head.y1 - head.y0) * lift.below;
        if (onHead && isBeard(p)) { hit.add(to); for (let k = 0; k < 3; k += 1) image.data[to + k] = px[p * 4 + k]; image.data[to + 3] = 255; }
        else if (isDark(p)) line.add(to);
        else if (lift.caps && head && isCap(p)) {
          if (lx < head.x0 - 14 || lx > head.x1 + 14 || y < head.y0 - 18 || y > head.y1) return;
          const row = capRows.get(y) || [Infinity, -Infinity];
          capRows.set(y, [Math.min(row[0], lx), Math.max(row[1], lx)]);
        }
      });
      // Where the cap meets the head: the lowest row still most of its full width, the same
      // row every hat sprite is anchored on, and the middle of the row that is widest.
      if (capRows.size) {
        let full = 0; let wideAt = null;
        capRows.forEach((row, y) => { const run = row[1] - row[0] + 1; if (run > full) { full = run; wideAt = y; } });
        let seat = wideAt;
        capRows.forEach((row, y) => { if (row[1] - row[0] + 1 >= full * 0.7 && y > seat) seat = y; });
        const wide = capRows.get(wideAt);
        hatAnchors[action] = hatAnchors[action] || [];
        hatAnchors[action][f] = { cx: Math.round((wide[0] + wide[1]) / 2), y: seat };
      }
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
  return { results, notes, hatAnchors };
}, { data, bald, rows: ROWS, keep: KEEP, box: BOX, strips: STRIPS, heads: ANCHORS, lift });

for (const [action, { url, overlap }] of Object.entries(report.results)) {
  writeFileSync(path.join(out, `${action}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${kind}/${action}.png — ${overlap}% of the dressed frame lands on the bald one`);
}
if (lift.caps) {
  writeFileSync(path.join(root, 'src', 'utils', 'hatAnchors.json'), `${JSON.stringify(report.hatAnchors)}\n`);
  console.log('wrote src/utils/hatAnchors.json');
}
report.notes.forEach((note) => console.log(' ', note));
await browser.close();

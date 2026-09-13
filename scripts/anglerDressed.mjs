// Lifts what the artist drew on the angler's head off a sheet that has it, as an overlay strip
// per action laid pixel-for-pixel on top of the bald strips:
//
//   node scripts/anglerDressed.mjs hair   art/angler-haired-sheet.png  -> assets/angler/hair/*
//   node scripts/anglerDressed.mjs outfit art/angler-outfit-sheet.png  -> assets/angler/outfit/*
//   node scripts/anglerDressed.mjs boots  art/angler-boots-sheet.png   -> assets/angler/boots/*
//   node scripts/anglerDressed.mjs beard  art/beards/full.png    full  -> assets/angler/beards/full/*
//   node scripts/anglerDressed.mjs hat    art/hats/cap_red.png   cap_red
//                                                               -> assets/angler/hats/cap_red/*
//   node scripts/anglerDressed.mjs cap    art/angler-dressed-sheet.png cap_olive
//
// The dressed sheet is the same character in the same poses as art/angler-sheet.png, drawn
// with an olive cap and a full beard on a white background. Sliced on the same feet anchor
// into the same box, the two line up to within a pixel — so whatever the dressed frame has
// that the bald one does not is the cap and the beard, drawn by the artist for that pose, at
// that angle, with its own shading and line work. That is worth far more than a beard the
// painter invents: a shape guessed from a head box is the thing that looked sloppy.
//
// What is lifted depends on the sheet. For the head sheets it is the brown around the head, and
// hue does the work: brown runs red ahead of green ahead of blue where the cap's olive has red
// and green level, and darkness separates it from skin, the lightest thing on a head. For the
// outfit sheet it is simply every body pixel that differs from the bald one, since the clothes
// are the only thing that changed and the two sheets line up to a pixel or two. The boots sheet
// gets the hue test instead, in a box of its own: brown leather against the olive of the wader
// hem right above it is the same question as brown hair against an olive cap, and two dark
// boots differ from two dark ones by too little for a diff to see. Its box is the rows the bald
// frame's own mask wears boots on, opened upwards for a taller shaft. Line work goes
// with whatever it lies against. Each overlay is written straight into the strip's own
// geometry, so the painter has nothing to scale or place: it stamps it as it is. That is the
// whole point of these sheets — a hairstyle drawn for a head thrown back mid-cast beats any
// front-on hairpiece pasted onto one, and there are twenty-two of those heads.
//
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

const [kind, sheet, name] = process.argv.slice(2);
// `pad`, `rise`, `from` and `below` open the head box sideways, upwards, downwards from the
// crown and past the chin: a hat sits above the crown and out past the ears, where facial hair
// starts below the brow and spills onto the collar.
// Two independent choices per sheet. `box` is where to look: the head box (`head`, opened by
// `pad`/`rise`/`below`), everything under the chin (`body`), or the rows the bald frame wears a
// masked part on (`band`). `test` is what counts as the garment there: `diff` is whatever is not
// what the bald sheet has, which needs no colour at all and is right whenever the sheet changed
// one thing; `brown` and `olive` are hue, for a sheet that changed two things at once.
const LIFT = {
  // One sheet per facial hair style, the same way hats go — but not the same rules. A hat is one
  // solid thing; a beard is a moustache and a chin and a pair of sideburns, and keeping only the
  // biggest piece of that throws away three of the four. A beard sheet puts him in no hat at
  // all, because a hat's own line work is the same brown as his whiskers and sits among them.
  // The shift test keeps the *ear* out, which the artist redraws a pixel over and a dye then
  // lights up as a grey blob on the side of his head. On a beard it has to be the narrowest
  // form of itself: this pixel only (`shift: 0`, no neighbourhood) and only where the pixel is
  // light enough to be skin. Given any reach it eats the beard, which is dark brown lying on a
  // dark brown jaw shadow, and any dark pixel it eats the *moustache*, which sits exactly on
  // the mouth line.
  beard: { box: 'head', test: 'brown', from: 0.3, below: 0.55, shift: 0, shiftLum: 100, shiftTol: 60, dir: 'beards' },
  hair: { box: 'head', test: 'brown', below: 0 },
  outfit: { box: 'body', test: 'diff' },
  boots: { box: 'band', test: 'brown', part: 4, above: 10, reach: 34, clean: 40, avoid: 1 },
  // Any hat, whatever colour: on a sheet that only put a hat on him, the hat is the difference.
  hat: { box: 'head', test: 'diff', pad: 24, rise: 28, below: 0, open: true, one: true, shift: 1, fill: true, dir: 'hats' },
  // The one sheet that changed two things: it wears a beard as well, so hue has to separate the
  // cap's olive from the beard's brown.
  cap: { box: 'head', test: 'olive', pad: 24, rise: 28, below: 0, one: true, dir: 'hats' },
};
const lift = LIFT[kind];
if (lift && lift.dir && !name) { console.error(`usage: node scripts/anglerDressed.mjs ${kind} <sheet.png> <name>`); process.exit(1); }
if (!lift || !sheet) { console.error(`usage: node scripts/anglerDressed.mjs <${Object.keys(LIFT).join('|')}> <sheet.png>`); process.exit(1); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'src', 'assets', 'angler');
const out = lift && lift.dir ? path.join(assets, lift.dir, name || kind) : path.join(assets, kind);
mkdirSync(out, { recursive: true });
const ANCHORS = JSON.parse(readFileSync(path.join(root, 'src', 'utils', 'anglerAnchors.json'), 'utf8'));

// The same rows and the same kept frames as scripts/anglerSlice.mjs — it is the same character
// in the same poses, so anything else would put a beard on the wrong face.
const ROWS = [[['idle', 5], ['walk', 5], ['cast', 5]], [['reel', 6], ['celebrate', 4], ['hurt', 3]]];
const KEEP = { idle: [0, 1, 2, 3, 4], cast: [4, 0, 1, 2], reel: [0, 1, 2, 3, 4, 5], celebrate: [0, 1, 2, 3], hurt: [0, 1, 2] };
const STRIPS = JSON.parse(readFileSync(path.join(assets, 'strips.json'), 'utf8'));
const BOX = { w: 250, h: 160, feetX: 80, feetY: 154 };

const bald = {};
const masks = {};
for (const action of Object.keys(KEEP)) {
  bald[action] = `data:image/png;base64,${readFileSync(path.join(assets, `${action}.png`)).toString('base64')}`;
  if (lift.part) masks[action] = `data:image/png;base64,${readFileSync(path.join(assets, 'masks', `${action}.png`)).toString('base64')}`;
}

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
const data = readFileSync(sheet).toString('base64');
const report = await page.evaluate(async ({ data, bald, masks, rows, keep, box, strips, heads, lift }) => {
  const load = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };
  const pixelsOf = (img) => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    return { data: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height };
  };
  const img = await load(`data:image/png;base64,${data}`);
  const { data: px, width: W, height: H } = pixelsOf(img);

  // The sheets come back both ways — some on white, some already cut out — so which one this
  // is decides how the background goes: a flood from the edges, or just the alpha channel.
  let clear = 0;
  for (let p = 0; p < W * H; p += 1) if (px[p * 4 + 3] === 0) clear += 1;
  const cutOut = clear > W * H * 0.2;
  const bg = new Uint8Array(W * H); const stack = [];
  const isLight = (p) => px[p * 4] > 200 && px[p * 4 + 1] > 200 && px[p * 4 + 2] > 200 && Math.max(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) - Math.min(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) < 20;
  const push = (x, y) => { const p = y * W + x; if (bg[p] || !isLight(p)) return; bg[p] = 1; stack.push(p); };
  if (!cutOut) {
    for (let x = 0; x < W; x += 1) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y += 1) { push(0, y); push(W - 1, y); }
    while (stack.length) { const p = stack.pop(); const x = p % W; const y = (p / W) | 0; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
  }
  const on = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p += 1) on[p] = cutOut ? (px[p * 4 + 3] >= 60 ? 1 : 0) : (bg[p] ? 0 : 1);
  // The figure less its outermost pixel. A sheet fades to its background over the last pixel or
  // two of the silhouette, and where the bald frame has nothing to compare against, that fringe
  // is all a diff can see — so out past the bald figure, only what is a pixel inside counts.
  let inner = on;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Uint8Array(W * H); const prev = inner;
    for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
      const p = y * W + x;
      next[p] = prev[p] && prev[p - 1] && prev[p + 1] && prev[p - W] && prev[p + W] && prev[p - W - 1] && prev[p - W + 1] && prev[p + W - 1] && prev[p + W + 1] ? 1 : 0;
    }
    inner = next;
  }

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
  // Hair and leather run red ahead of green, and darkness separates them from skin. The last
  // clause is for a sheet whose hat is *yellow*: that runs red ahead of green too, and its
  // shaded folds are dark enough to pass, but no brown has its green so far ahead of its blue.
  const isBeard = (p) => px[p * 4] - px[p * 4 + 1] > 10 && (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 < 130
    && px[p * 4 + 1] - px[p * 4 + 2] < 55;
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

  const results = {};
  for (const [action, frames] of Object.entries(sheets)) {
    const base = pixelsOf(await load(bald[action]));
    const mask = lift.part ? pixelsOf(await load(masks[action])) : null;
    // A diff on the head also finds the brow, the ear and the eye, because the artist redrew
    // them a pixel over — and once a hat is dyed, an eye that came along with it is dyed too.
    // What tells them apart is that a feature moved is still there to be found right beside it:
    // a pixel that matches what the bald frame has within a pixel or two of itself is that same
    // thing shifted, where a hat is a colour the head never had there at all.
    const shifted = (r, g, b, to) => {
      // Only what is light enough to be mistaken for skin or an eye. A hat's own keyline is as
      // black as the head's and would always look like it shifted — and a dark stray never
      // shows anyway, since a dye leaves line work alone.
      if (0.299 * r + 0.587 * g + 0.114 * b < (lift.shiftLum || 100)) return false;
      for (let dy = -lift.shift; dy <= lift.shift; dy += 1) for (let dx = -lift.shift; dx <= lift.shift; dx += 1) {
        const n = to + (dy * base.width + dx) * 4;
        if (n < 0 || n >= base.data.length || !base.data[n + 3]) continue;
        // Tight, because this is looking for the *same* colour moved over, not a near one: a
        // tan hat lands close to skin without being it, and a loose match punches the skin
        // through the crown of one in speckles.
        if (Math.abs(r - base.data[n]) + Math.abs(g - base.data[n + 1]) + Math.abs(b - base.data[n + 2]) <= (lift.shiftTol || 12)) return true;
      }
      return false;
    };
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
      // The head this pose was sliced with, so the cap can be told from the waders — which are
      // the same olive, and the only other olive on the figure.
      const box0 = (heads[action] || [])[f];
      const head = box0 && box0.head;
      // The rows this sheet redrew, off the bald frame's own mask: from the lowest row wearing
      // the part up to the highest one near it, opened upwards by a margin since a leather boot
      // is drawn with a taller shaft than a deck one. A stray pixel the mask got wrong higher up
      // the figure is left out by the reach, not by hoping there is none.
      let band = null;
      if (mask) {
        const rows = [];
        for (let y = 0; y < box.h; y += 1) {
          let n = 0;
          for (let x = f * box.w; x < (f + 1) * box.w; x += 1) if (mask.data[(y * mask.width + x) * 4] === lift.part) n += 1;
          rows[y] = n;
        }
        let y1 = box.h - 1; while (y1 > 0 && rows[y1] < 4) y1 -= 1;
        let y0 = y1; for (let y = y1; y >= 0 && y > y1 - lift.reach; y -= 1) if (rows[y] >= 4) y0 = y;
        // Never further from the ground than a boot is tall, whatever the mask says: in the
        // kneeling pose it calls his shoulder leather, and his bowed head is right beside it.
        band = { y0: Math.max(0, y1 - lift.reach, y0 - (lift.above || 0)), y1: Math.min(box.h - 1, y1 + 4) };
      }
      comp.pixels.forEach((p) => {
        const x = (p % W) + dx; const y = ((p / W) | 0) + dy;
        if (x < f * box.w || x >= (f + 1) * box.w || y < 0 || y >= box.h) return;
        const to = (y * strip.width + x) * 4;
        total += 1;
        if (base.data[to + 3]) covered += 1;
        const lx = x - f * box.w;
        // An outfit is everything below the chin that is not what the bald sheet has there.
        // Clothes are the only thing that changed, so nothing else can differ but the noise of
        // a redraw, and that is what the cleanup below is for.
        // Nothing goes on over skin: in the kneeling pose his bare forearms are as brown and as
        // dark as the leather, and they are in the same place in both sheets, so the bald
        // frame's own mask is what says which is which.
        const onSkin = (mask && lift.avoid && mask.data[to] === lift.avoid)
          || (typeof lift.shift === 'number' && base.data[to + 3] && shifted(px[p * 4], px[p * 4 + 1], px[p * 4 + 2], to));
        // Where this sheet is allowed to have drawn. A hue test needs one — the rod is brown too
        // and crosses right past the head, and the waders are olive down to the boots — and a
        // diff needs one just as much, since a redraw differs faintly everywhere.
        const inBox = !onSkin && (lift.box === 'band'
          ? Boolean(band) && y >= band.y0 && y <= band.y1
          : lift.box === 'body'
            ? Boolean(head) && y > head.y1
            : Boolean(head) && lx >= head.x0 - (lift.pad || 14) && lx <= head.x1 + (lift.pad || 14)
              // A hat opens the box upwards off the crown; facial hair starts below the brow,
              // and a sheet that wears both puts the hat's own dark keyline right across it.
              && y >= head.y0 + (head.y1 - head.y0) * (lift.from || 0) - (lift.from ? 0 : lift.rise || 18)
              && y <= head.y1 + (head.y1 - head.y0) * (lift.below || 0));
        // Out in the air beside him, a pale grey stroke is the sheet's own drawn line or the
        // whip marks around it. The bald strips carry neither — the slicer takes them out
        // because the game draws its own line from the rod tip — so there is nothing there to
        // diff against and every one of them reads as new. A hat out there is a colour.
        const grey = Math.max(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) - Math.min(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) < 24
          && (px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2]) / 3 > 190;
        const drawn = lift.test === 'diff'
          ? (base.data[to + 3]
            ? Math.abs(px[p * 4] - base.data[to]) + Math.abs(px[p * 4 + 1] - base.data[to + 1]) + Math.abs(px[p * 4 + 2] - base.data[to + 2]) > 60
            : inner[p] === 1 && !grey)
          : lift.test === 'olive' ? isCap(p) : isBeard(p);
        if (inBox && drawn) {
          hit.add(to); for (let k = 0; k < 3; k += 1) image.data[to + k] = px[p * 4 + k]; image.data[to + 3] = 255;
        }
        else if (lift.test !== 'diff' && isDark(p)) line.add(to);
      });
      // A redraw never lands on exactly the same pixels, so a diff leaves a rim of flecks all
      // round the body, and a hue test picks up the odd brown speck of shading. Nothing that
      // small is a garment.
      // A garment is not one pixel wide. Where the two sheets' silhouettes differ by a pixel the
      // diff finds a thread of it running all round the figure, and inside the bald figure there
      // is no fringe rule to catch it — this cap is white exactly where that thread is. So the
      // hits are opened: worn away by a pixel and grown back, which deletes anything thinner
      // than that and leaves everything else the size it was.
      if (lift.open) {
        const core = new Set();
        hit.forEach((to) => {
          const i = to / 4; const x = i % strip.width; const y = (i / strip.width) | 0;
          let all = true;
          for (let dy = -1; dy <= 1 && all; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            if (!hit.has(((y + dy) * strip.width + x + dx) * 4)) { all = false; break; }
          }
          if (all) core.add(to);
        });
        const kept = new Set();
        core.forEach((to) => {
          const i = to / 4; const x = i % strip.width; const y = (i / strip.width) | 0;
          for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
            const n = ((y + dy) * strip.width + x + dx) * 4;
            if (hit.has(n)) kept.add(n);
          }
        });
        hit.forEach((to) => { if (!kept.has(to)) image.data[to + 3] = 0; });
        hit.forEach((to) => { if (!kept.has(to)) hit.delete(to); });
      }
      const smallest = lift.test === 'diff' ? (lift.clean || 80) : lift.clean;
      if (smallest || lift.one) {
        const seenRun = new Set(); const runs = [];
        hit.forEach((to) => {
          if (seenRun.has(to)) return;
          const run = [to]; const st = [to]; seenRun.add(to);
          while (st.length) {
            const q = st.pop(); const i = q / 4; const qx = i % strip.width; const qy = (i / strip.width) | 0;
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
              const n = ((qy + dy) * strip.width + qx + dx) * 4;
              if (hit.has(n) && !seenRun.has(n)) { seenRun.add(n); run.push(n); st.push(n); }
            });
          }
          runs.push(run);
        });
        // A hat is one thing. The rod and the drawn line cross the head box and the artist put
        // them a pixel off, and a brow or an ear redrawn comes away in flecks — all of them
        // separate from the hat, however long a rod's run is. So the biggest piece is the hat
        // and the rest is not, which no size threshold can say.
        const biggest = lift.one ? runs.reduce((best, run) => (run.length > best ? run.length : best), 0) : 0;
        runs.forEach((run) => {
          if (lift.one ? run.length < biggest : run.length < smallest) run.forEach((q) => { hit.delete(q); image.data[q + 3] = 0; });
        });
      }
      // Line work touching the beard is the beard's; the cap's own is left behind.
      for (let pass = 0; pass < 2 && lift.test !== 'diff'; pass += 1) {
        const gained = [];
        line.forEach((to) => {
          const i = to / 4; const x = i % strip.width; const y = (i / strip.width) | 0;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => hit.has(((y + oy) * strip.width + x + ox) * 4))) gained.push(to);
        });
        gained.forEach((to) => { line.delete(to); hit.add(to); image.data[to] = 20; image.data[to + 1] = 16; image.data[to + 2] = 14; image.data[to + 3] = 255; });
      }
      // A garment is solid. Wherever the tests above have punched a hole clean through the
      // middle of one — a tan hat lands near enough to skin for that — the sheet itself says
      // what belongs there, so it is put back. Holes only: anything open to the outside of the
      // frame is not a hole, it is the shape of the hat.
      if (lift.fill) {
        const outside = new Uint8Array(box.w * box.h); const queue = [];
        const push = (lx, ly) => {
          if (lx < 0 || ly < 0 || lx >= box.w || ly >= box.h) return;
          const k = ly * box.w + lx;
          if (outside[k] || hit.has(((ly) * strip.width + f * box.w + lx) * 4)) return;
          outside[k] = 1; queue.push(k);
        };
        for (let lx = 0; lx < box.w; lx += 1) { push(lx, 0); push(lx, box.h - 1); }
        for (let ly = 0; ly < box.h; ly += 1) { push(0, ly); push(box.w - 1, ly); }
        while (queue.length) {
          const k = queue.pop(); const lx = k % box.w; const ly = (k / box.w) | 0;
          push(lx - 1, ly); push(lx + 1, ly); push(lx, ly - 1); push(lx, ly + 1);
        }
        for (let ly = 0; ly < box.h; ly += 1) for (let lx = 0; lx < box.w; lx += 1) {
          if (outside[ly * box.w + lx]) continue;
          const to = (ly * strip.width + f * box.w + lx) * 4;
          if (hit.has(to)) continue;
          const sx = lx + f * box.w - dx; const sy = ly - dy;
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          // Only from the figure. A wide brim and the rod can close a pocket of plain
          // background between them, and filling that would stamp the sheet's own backdrop
          // onto the stage beside his ear.
          if (!on[sy * W + sx]) continue;
          const from = (sy * W + sx) * 4;
          hit.add(to);
          for (let k = 0; k < 3; k += 1) image.data[to + k] = px[from + k];
          image.data[to + 3] = 255;
        }
      }
      notes.push(`${action}[${f}] ${hit.size}px`);
    });
    sctx.putImageData(image, 0, 0);
    results[action] = { url: strip.toDataURL('image/png'), overlap: Math.round((covered / total) * 100) };
  }
  return { results, notes };
}, { data, bald, masks, rows: ROWS, keep: KEEP, box: BOX, strips: STRIPS, heads: ANCHORS, lift });

for (const [action, { url, overlap }] of Object.entries(report.results)) {
  writeFileSync(path.join(out, `${action}.png`), Buffer.from(url.split(',')[1], 'base64'));
  console.log(`${kind}/${action}.png — ${overlap}% of the dressed frame lands on the bald one`);
}
report.notes.forEach((note) => console.log(' ', note));
await browser.close();

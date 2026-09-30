// The dock pets' strips, on the world's one art pixel: `node scripts/petSlice.mjs [name ...]`
// re-grids every strip named in art/pets/pets.grid.json (or just the ones given) and writes
// src/assets/pets/<name>.png and src/assets/pets/pets.json.
//
// The sources in art/pets/ are the hi-res strips the pets were first sliced into from their
// renders (flat pixel art on a transparent ground, at about thirteen source pixels to the dog's
// own art pixel, ten to the idle cat's, and a non-square fourteen by seventeen in the cheer
// strips). Every strip is re-gridded here at one square cell — `cell` source pixels to an art
// pixel, the same for all four — so the two strips of a pet share one pixel size (a cheer used
// to be a pixel a third taller than the sitting animal) and a pet's pixel is the angler's:
// one file pixel is one art pixel, drawn at ART_PX painting units.
//
//   - frames are the biggest eight-connected pieces of the strip (a tail tip drawn apart from the
//     body goes with the nearest frame; flecks are dropped), left to right
//   - each frame is voted onto the grid by scripts/pixelGrid.mjs (flat palette colours, hard
//     alpha, the outline closed and one art pixel wide in the world's keyline, #130f0c), with its
//     bottom row ending on the soles so the pet stands on a cell edge
//   - a cheer strip takes its palette from its pet's idle strip (`paletteFrom`), so the dog does
//     not change coat when it jumps up (its cheer was drawn a redder brown) and the cat stays the
//     same cat; `recolor` then moves a palette entry, which is how the cat was brought down from a
//     near-pure orange to the saturation the angler and the painting sit at
//   - frames are hung on their feet in one shared box and *registered on the body*: an idle frame
//     is placed where it overlaps its first frame most, so a tail flick moves the tail and not the
//     cat (the old slicer hung each frame from the middle of a box the swept tail widened, and the
//     whole cat hopped four art pixels on every flick); a cheer frame, a different pose each, is
//     placed by the middle of its body mass
//
// pets.json records, per strip, the box (w x h art pixels), the feet in it, and the frame count;
// utils/petSprites.js draws a strip at h x ART_PX painting units, so the pixel size never changes
// between moods.
import { readPng, writePng } from './png.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { classify, vote, outline, crop, alphaBox, rgbToHex, toImage, hexToRgb, oklab, fromOklab, KEYLINE_HEX } from './pixelGrid.mjs';

const KEY = hexToRgb(KEYLINE_HEX);

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = `${ROOT}src/assets/pets/`;
const CONFIG = JSON.parse(readFileSync(`${ROOT}art/pets/pets.grid.json`, 'utf8'));
const wanted = process.argv.slice(2);

// The frames of a strip: the biggest pieces, each with the smaller pieces nearest to it.
function framesOf(img, count) {
  const { width: W, height: H, data } = img;
  const lit = (x, y) => data[(y * W + x) * 4 + 3] >= 128;
  const labels = new Int32Array(W * H);
  const pieces = [null];
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!lit(x, y) || labels[y * W + x]) continue;
    const id = pieces.length; const piece = { id, size: 0, x0: x, x1: x + 1, y0: y, y1: y + 1 }; pieces.push(piece);
    const stack = [[x, y]]; labels[y * W + x] = id;
    while (stack.length) {
      const [cx, cy] = stack.pop(); piece.size += 1;
      piece.x0 = Math.min(piece.x0, cx); piece.x1 = Math.max(piece.x1, cx + 1); piece.y0 = Math.min(piece.y0, cy); piece.y1 = Math.max(piece.y1, cy + 1);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || labels[ny * W + nx] || !lit(nx, ny)) continue;
        labels[ny * W + nx] = id; stack.push([nx, ny]);
      }
    }
  }
  const bodies = pieces.slice(1).sort((a, b) => b.size - a.size).slice(0, count).sort((a, b) => a.x0 - b.x0);
  if (bodies.length !== count) throw new Error(`found ${bodies.length} pieces, wanted ${count}`);
  const owner = new Int32Array(pieces.length);
  bodies.forEach((body, i) => { owner[body.id] = i + 1; });
  const gap = (a, b) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));
  const fleck = Math.min(...bodies.map((b) => b.size)) / 40;
  pieces.slice(1).forEach((piece) => {
    if (owner[piece.id] || piece.size < fleck) return;
    let best = 0, bestGap = Infinity;
    bodies.forEach((body, i) => { const g = gap(piece, body); if (g < bestGap) { bestGap = g; best = i + 1; } });
    owner[piece.id] = best;
  });
  return bodies.map((body, i) => {
    const frame = { width: W, height: H, data: Buffer.alloc(W * H * 4) };
    for (let p = 0; p < W * H; p += 1) if (labels[p] && owner[labels[p]] === i + 1) data.copy(frame.data, p * 4, p * 4, p * 4 + 4);
    return crop(frame, alphaBox(frame));
  });
}

// Vote one frame onto the grid: square cells of `cell` source pixels, the bottom row ending on
// the soles, the columns centred on the frame.
function gridFrame(frame, cls, palette, cell) {
  const rows = Math.ceil(frame.height / cell - 0.25);
  const cols = Math.ceil(frame.width / cell - 0.25);
  const art = vote(frame, cls, palette, { cols, rows, cellX: cell, cellY: cell, originX: (frame.width - cols * cell) / 2, originY: frame.height - rows * cell, alpha: 0.5, keyShare: 0.34 });
  outline(art, 'force');
  const image = toImage(art);
  return crop(image, alphaBox(image));
}

const opaque = (img, x, y) => x >= 0 && y >= 0 && x < img.width && y < img.height && img.data[(y * img.width + x) * 4 + 3] > 0;

// Where each frame's feet go, as a column in that frame: the first frame's is the middle of its
// bottom row; an idle frame's is wherever it overlaps the first frame most (both standing on
// their bottom rows); a cheer frame's is the middle of its body mass.
function feetColumns(frames, register) {
  const bottomMid = (f) => {
    const xs = []; for (let x = 0; x < f.width; x += 1) if (opaque(f, x, f.height - 1)) xs.push(x);
    return Math.round((xs[0] + xs[xs.length - 1]) / 2);
  };
  const massMid = (f) => { let s = 0, n = 0; for (let y = 0; y < f.height; y += 1) for (let x = 0; x < f.width; x += 1) if (opaque(f, x, y)) { s += x; n += 1; } return Math.round(s / n); };
  const first = frames[0];
  const firstFeet = register === 'mass' ? massMid(first) : bottomMid(first);
  return frames.map((f, i) => {
    if (i === 0) return firstFeet;
    if (register === 'mass') return massMid(f);
    // Overlap with the first frame, both hung on their bottom rows, for every horizontal shift.
    let best = 0, bestShift = 0;
    for (let shift = -f.width; shift <= first.width; shift += 1) {
      let score = 0;
      for (let y = 0; y < f.height; y += 1) for (let x = 0; x < f.width; x += 1) {
        if (!opaque(f, x, y)) continue;
        if (opaque(first, x + shift, y + (first.height - f.height))) score += 1;
      }
      if (score > best) { best = score; bestShift = shift; }
    }
    return firstFeet - bestShift;
  });
}

// The coat: the most common drawn colour that is not the keyline.
function coatOf(img, opts) {
  const { palette } = classify(img, { ...opts, colors: 1 });
  return palette[1];
}
// Move every drawn pixel of an image by one step in OKLab (a cheer drawn a redder brown than its
// sitting strip is moved onto the sitting coat before either is matched to the palette).
function shift(img, delta) {
  const out = { width: img.width, height: img.height, data: Buffer.from(img.data) };
  for (let i = 0; i < img.width * img.height; i += 1) {
    if (img.data[i * 4 + 3] < 128) continue;
    const lab = oklab([img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]]);
    const rgb = fromOklab([lab[0] + delta[0], lab[1] + delta[1], lab[2] + delta[2]]);
    out.data[i * 4] = rgb[0]; out.data[i * 4 + 1] = rgb[1]; out.data[i * 4 + 2] = rgb[2];
  }
  return out;
}
// A palette graded toward the world's: chroma and lightness scaled in OKLab.
const grade = (rgb, g) => { if (!g) return rgb; const [L, a, b] = oklab(rgb); return fromOklab([L * (g.L ?? 1), a * (g.chroma ?? 1), b * (g.chroma ?? 1)]); };

const meta = (() => { try { return JSON.parse(readFileSync(`${OUT}pets.json`, 'utf8')); } catch (e) { return {}; } })();
const palettes = {};
for (const job of CONFIG) {
  if (wanted.length && !wanted.includes(job.name) && !wanted.includes(job.paletteFrom)) continue;
  const parent = CONFIG.find((j) => j.name === job.paletteFrom) || null;
  const opts = { colors: job.colors, keyLum: job.keyLum, keyChroma: job.keyChroma, pin: job.pin };
  let src = readPng(`${ROOT}${job.src}`);
  // One palette for the strip: its own (k-means over every frame), or its idle strip's — with this
  // strip's coat first moved onto the idle strip's coat, so the pet is the same colour in both.
  if (parent) {
    const from = coatOf(crop(src, alphaBox(src)), opts);
    const parentSrc = readPng(`${ROOT}${parent.src}`);
    const to = coatOf(crop(parentSrc, alphaBox(parentSrc)), { ...opts, keyLum: parent.keyLum, keyChroma: parent.keyChroma });
    const [a, b] = [oklab(from), oklab(to)];
    src = shift(src, [b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    console.log(job.name, 'coat', rgbToHex(from), '->', rgbToHex(to));
  }
  const frames = framesOf(src, job.frames);
  const base = parent ? palettes[parent.name] : classify(crop(src, alphaBox(src)), opts).palette.slice(1).map(rgbToHex);
  if (!base) throw new Error(`${job.name}: grid ${job.paletteFrom} first`);
  palettes[job.name] = base;
  const look = job.grade || (parent && parent.grade);
  const gridded = frames.map((frame) => {
    const { cls, palette } = classify(frame, { ...opts, palette: base });
    const shown = palette.map((rgb, i) => (i ? grade(rgb, look) : rgb));
    return gridFrame(frame, cls, shown, job.cell);
  });
  const feet = feetColumns(gridded, job.register || 'overlap');
  const left = Math.max(...gridded.map((f, i) => feet[i]));
  const right = Math.max(...gridded.map((f, i) => f.width - feet[i]));
  const tall = Math.max(...gridded.map((f) => f.height));
  const FW = left + right, FH = tall, feetX = left;
  const out = { width: FW * gridded.length, height: FH, data: Buffer.alloc(FW * gridded.length * FH * 4) };
  gridded.forEach((f, i) => {
    const ox = i * FW + feetX - feet[i], oy = FH - f.height;
    for (let y = 0; y < f.height; y += 1) f.data.copy(out.data, ((y + oy) * out.width + ox) * 4, y * f.width * 4, (y + 1) * f.width * 4);
  });
  // Hand touches, in strip pixels, after everything else: the few art pixels a downscale cannot
  // decide (a cat's eye that straddled four cells), each [x, y, colour] with 'key' for the
  // keyline and 'none' to clear.
  (job.touch || []).forEach(([x, y, c]) => {
    const i = (y * out.width + x) * 4;
    if (c === 'none') { out.data.fill(0, i, i + 4); return; }
    const rgb = c === 'key' ? KEY : c.replace('#', '').match(/../g).map((h) => parseInt(h, 16));
    out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2]; out.data[i + 3] = 255;
  });
  mkdirSync(OUT, { recursive: true });
  writePng(`${OUT}${job.name}.png`, out);
  meta[job.name] = { frames: gridded.length, w: FW, h: FH, feetX, feetY: FH };
  console.log(job.name, meta[job.name], 'frames', gridded.map((f) => `${f.width}x${f.height}`).join(' '), 'palette', base.length + 1);
}
writeFileSync(`${OUT}pets.json`, `${JSON.stringify(meta, null, 2)}\n`);

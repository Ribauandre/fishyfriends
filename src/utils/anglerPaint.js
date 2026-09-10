// Dresses the angler at runtime. The strips in assets/angler are the ChatGPT-drawn character
// as he comes (cap, full beard); for a look each strip goes through a canvas where
// `paintPixels` (pure, tested on plain arrays) does two things. Parts that keep their shape
// are dyed — skin, cap, waders, boots, rod, beard — luminance-preserving, so the artist's
// shading survives. The head is sculpted: the cap's own pixels and the beard's own pixels,
// found by the mask, are the silhouettes that become a scalp, hair, another hat, a jaw, a
// goatee or a mustache, shaded like a dome and given the art's outline back. Nothing is
// pasted on from outside the art, so it fits every frame from every angle the sheet has —
// the cap the artist drew from the side, the front and the back is what the beanie is
// sculpted from in each. Results are data URLs per action, cached by look. Where there is no
// canvas (jsdom, ancient browsers) `renderAngler` resolves null and the stock strips show.
import { ANGLER_SPRITES, SPRITE_FRAME } from './anglerSprites';
import anchors from './anglerAnchors.json';
import { PART, PART_BASE, paletteFor, lookKey, isDefaultLook } from './anglerLook';
import idleMask from '../assets/angler/masks/idle.png';
import castMask from '../assets/angler/masks/cast.png';
import reelMask from '../assets/angler/masks/reel.png';
import fishonMask from '../assets/angler/masks/fishon.png';
import celebrateMask from '../assets/angler/masks/celebrate.png';

const MASKS = { idle: idleMask, cast: castMask, reel: reelMask, fishon: fishonMask, celebrate: celebrateMask };

// The art's line colour, drawn back around anything sculpted.
export const OUTLINE = [16, 15, 14];

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const shaded = (rgb, k) => [clamp(rgb[0] * k), clamp(rgb[1] * k), clamp(rgb[2] * k)];
const mix = (a, b, t) => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];

// Retint one pixel: keep how light or dark it was relative to the part's painted mid-tone
// and reapply that shading to the target colour, so highlights and folds survive the dye.
export function tintPixel(rgb, base, target) {
  const shade = Math.max(0.3, Math.min(1.7, luminance(...rgb) / luminance(...base)));
  return [clamp(target[0] * shade), clamp(target[1] * shade), clamp(target[2] * shade)];
}

// Which way a frame's head is turned, from its anchors: the face box is the whole width of
// the cap from the front, a sliver or nothing from the back, and to one side of the cap's
// centre in profile.
export function facingOf(frame) {
  const { hat, face } = frame || {};
  if (!hat || !face) return 'back';
  const hatW = hat.x1 - hat.x0 + 1;
  const faceW = face.x1 - face.x0 + 1;
  if (faceW < hatW * 0.3) return 'back';
  if (faceW >= hatW * 0.78) return 'front';
  return (face.x0 + face.x1) / 2 >= (hat.x0 + hat.x1) / 2 ? 'right' : 'left';
}

// How far forward on the face a column is: 1 at the chin and lips, 0 at the back of the
// face, below 0 behind it (the nape). From the front the middle of the face is the front.
export function frontness(x, face, facing) {
  const t = (x - face.x0) / Math.max(1, face.x1 - face.x0);
  if (facing === 'right') return t;
  if (facing === 'left') return 1 - t;
  if (facing === 'front') return 1 - 2 * Math.abs(t - 0.5);
  return -1;
}

// A dome's light: brightest at the top and the front, falling away down the sides.
function domeShade(u, v, dir) {
  const round = 1 - 0.34 * u * u;
  return Math.max(0.55, Math.min(1.3, (1.2 - 0.42 * v) * round + (dir === 0 ? 0 : 0.12 * dir * u)));
}

// ---- The sculpting, one frame at a time ----

function sculptHead({ pixels, mask, width, height, x0, x1, frame, palette }) {
  if (!frame || !frame.hat) return;
  // The anchors are in the frame's own pixels; the strip's start puts them in the strip's.
  const shift = (box) => (box ? { ...box, x0: box.x0 + x0, x1: box.x1 + x0 } : null);
  let hat = shift(frame.hat); const face = shift(frame.face); const beard = shift(frame.beard);
  const { head, skin, hair } = palette;
  const facing = facingOf(frame);
  const dir = facing === 'right' ? 1 : facing === 'left' ? -1 : 0;
  const inside = (x, y) => x >= x0 && x < x1 && y >= 0 && y < height;
  const at = (x, y) => (y * width + x) * 4;
  const partAt = (x, y) => (inside(x, y) ? mask[at(x, y)] : 0);
  const alphaAt = (x, y) => (inside(x, y) ? pixels[at(x, y) + 3] : 0);
  const put = (x, y, rgb) => { if (!inside(x, y)) return; const i = at(x, y); pixels[i] = rgb[0]; pixels[i + 1] = rgb[1]; pixels[i + 2] = rgb[2]; pixels[i + 3] = 255; };
  const erase = (x, y) => { if (inside(x, y)) pixels[at(x, y) + 3] = 0; };
  const key = (x, y) => y * width + x;

  // The crown: the cap, found on the head rather than from the mask's box. The mask cannot be
  // asked which pixels are the cap — it breaks the cap into hat, panel, a shadow it reads as
  // rod and the line work between them, and the box it hands over is only what it called cap,
  // which in the back views is a ring around a crown it called rod. So the search runs over
  // the whole head (the hat and face boxes together, with the headroom above them) and takes
  // the largest run of pixels that are the cap's own colours — hat, panel, or a rod-labelled
  // patch too fat to be a rod, since the real rod does cross the head in the backswing and is
  // thin however it lies. Line work joins the run afterwards, a step at a time, so the
  // outline around the head cannot carry the run off down the body.
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const AROUND = [...NEIGHBOURS, [1, 1], [-1, 1], [1, -1], [-1, -1]];
  // Wide of both boxes, since neither is the cap's real extent — in profile the mask's box can
  // miss the whole back of the skull. Nothing but the head is up here, and what else reaches
  // in (the raised hand, the rod) is not the cap's colours.
  const REACH = 18;
  const region = {
    x0: Math.max(x0, Math.min(hat.x0, face ? face.x0 : hat.x0) - REACH),
    y0: 0,
    x1: Math.min(x1 - 1, Math.max(hat.x1, face ? face.x1 : hat.x1) + REACH),
    // The cap stops at the jaw: the beard's top is the ear line, and the hood and the collar
    // are below it. Without a beard, halfway down the face.
    y1: beard ? beard.y0 - 2 : (face ? face.y0 + Math.round((face.y1 - face.y0) * 0.5) : hat.y1 + 10),
  };
  const inRegion = (x, y) => x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1;
  // Rod-labelled runs on the head, kept only where they are too fat to be a rod.
  const fatRod = new Set();
  {
    const seenRod = new Set();
    for (let y = region.y0; y <= region.y1; y += 1) for (let x = region.x0; x <= region.x1; x += 1) {
      if (seenRod.has(key(x, y)) || partAt(x, y) !== PART.rod || alphaAt(x, y) === 0) continue;
      const run = []; const stack = [[x, y]]; seenRod.add(key(x, y));
      let rx0 = x; let rx1 = x; let ry0 = y; let ry1 = y;
      while (stack.length) {
        const [qx, qy] = stack.pop(); run.push(key(qx, qy));
        if (qx < rx0) rx0 = qx; if (qx > rx1) rx1 = qx; if (qy < ry0) ry0 = qy; if (qy > ry1) ry1 = qy;
        AROUND.forEach(([dx, dy]) => { const nx = qx + dx; const ny = qy + dy; if (inRegion(nx, ny) && !seenRod.has(key(nx, ny)) && partAt(nx, ny) === PART.rod && alphaAt(nx, ny) > 0) { seenRod.add(key(nx, ny)); stack.push([nx, ny]); } });
      }
      if (run.length / Math.max(rx1 - rx0 + 1, ry1 - ry0 + 1) >= 3) run.forEach((k) => fatRod.add(k));
    }
  }
  // What the cap is: the top of the head. The mask cannot say — from behind, the crown is
  // painted the same olive as the jacket and it labels most of it jacket or rod — so the cap
  // is read off the silhouette instead. Down each column of the head, from the first pixel
  // there is, everything as far as the first skin or beard is the cap: the forehead ends it
  // from the front, the neck from behind, and a peak that juts over open air ends at the air.
  // Only columns whose top is up where the head's top is are walked, which leaves the hood
  // and the shoulders behind it out, and a column has to gather a few pixels to count, which
  // leaves out the rod crossing above.
  const capSeed = new Set();
  {
    const tops = new Map();
    let headTop = Infinity;
    for (let x = region.x0; x <= region.x1; x += 1) {
      for (let y = region.y0; y <= region.y1; y += 1) if (alphaAt(x, y) > 0) { tops.set(x, y); headTop = Math.min(headTop, y); break; }
    }
    const reach = Math.max(8, (face ? face.y0 : region.y1) - headTop);
    tops.forEach((top, x) => {
      if (top > headTop + reach) return;
      const run = [];
      for (let y = top; y <= region.y1; y += 1) {
        if (alphaAt(x, y) === 0) break;
        const part = partAt(x, y);
        if (part === PART.skin || part === PART.beard || part === PART.waders || part === PART.boots) break;
        // A rod lying across the cap is not the cap, but it does not end it either.
        if (part === PART.rod && !fatRod.has(key(x, y))) continue;
        run.push(y);
      }
      if (run.length >= 4) run.forEach((y) => capSeed.add(key(x, y)));
    });
  }
  const capAt = (x, y) => capSeed.has(key(x, y));
  const seen = new Set();
  const runs = [];
  for (let y = region.y0; y <= region.y1; y += 1) for (let x = region.x0; x <= region.x1; x += 1) {
    if (seen.has(key(x, y)) || !capAt(x, y)) continue;
    const run = new Set(); const stack = [[x, y]]; seen.add(key(x, y));
    let bx0 = x; let by0 = y; let bx1 = x; let by1 = y;
    while (stack.length) {
      const [qx, qy] = stack.pop(); run.add(key(qx, qy));
      if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy < by0) by0 = qy; if (qy > by1) by1 = qy;
      // Two pixels of reach, to step over the seams the cap is drawn with.
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) { const nx = qx + dx; const ny = qy + dy; if (!seen.has(key(nx, ny)) && capAt(nx, ny)) { seen.add(key(nx, ny)); stack.push([nx, ny]); } }
    }
    // Scored by how much of it sits over the head: a held fish, cap-green and to the side,
    // has plenty of cap in it but none where the face is.
    let score = run.size;
    if (beard) { score = 0; run.forEach((k) => { const y2 = Math.floor(k / width); const x2 = k - y2 * width; if (x2 >= beard.x0 - 10 && x2 <= beard.x1 + 10 && y2 <= beard.y0 + 6) score += 1; }); }
    runs.push({ run, score, box: { x0: bx0, y0: by0, x1: bx1, y1: by1 } });
  }
  // The cap comes apart into several runs — the art draws seams between its panels that are
  // thicker than the reach above — so the crown is the best-placed run together with every
  // other one that lies against it. A fish held out at arm's length is nowhere near.
  const first = runs.reduce((a, b) => (b.score > (a ? a.score : -1) ? b : a), null);
  if (!first || first.score < 12) return;
  const crown = new Set(first.run);
  let box = { ...first.box };
  const NEAR = 5;
  const merged = new Set([first]);
  for (let pass = 0; pass < runs.length; pass += 1) {
    let grew = false;
    for (const r of runs) {
      if (merged.has(r)) continue;
      if (r.box.x0 > box.x1 + NEAR || r.box.x1 < box.x0 - NEAR || r.box.y0 > box.y1 + NEAR || r.box.y1 < box.y0 - NEAR) continue;
      merged.add(r); grew = true;
      r.run.forEach((k) => crown.add(k));
      box = { x0: Math.min(box.x0, r.box.x0), y0: Math.min(box.y0, r.box.y0), x1: Math.max(box.x1, r.box.x1), y1: Math.max(box.y1, r.box.y1) };
    }
    if (!grew) break;
  }
  // The line work drawn against the cap is the cap's, one step at a time.
  for (let pass = 0; pass < 2; pass += 1) {
    const grown = [];
    crown.forEach((k) => { const y = Math.floor(k / width); const x = k - y * width; AROUND.forEach(([dx, dy]) => { const nx = x + dx; const ny = y + dy; if (inRegion(nx, ny) && !crown.has(key(nx, ny)) && partAt(nx, ny) === PART.outline && alphaAt(nx, ny) > 0) grown.push(key(nx, ny)); }); });
    grown.forEach((k) => crown.add(k));
  }
  {
    let bx0 = Infinity; let by0 = Infinity; let bx1 = -Infinity; let by1 = -Infinity;
    crown.forEach((k) => { const y = Math.floor(k / width); const x = k - y * width; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); });
    hat = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
  }
  const hatH = hat.y1 - hat.y0 + 1;

  // The skull reaches the top of the cap; the peak does not. So a column of the crown belongs
  // to the head where its highest pixel is near the crown's top, and the peak is what stands
  // in the columns either side of those — which finds it whichever way the head is turned.
  // A cap seen from behind has no peak to find, and every column of a cap seen head-on has
  // skull above it, so neither loses anything here.
  const colTop = new Map();
  crown.forEach((k) => { const y = Math.floor(k / width); const x = k - y * width; colTop.set(x, Math.min(colTop.get(x) ?? Infinity, y)); });
  let hx0 = Infinity; let hx1 = -Infinity;
  colTop.forEach((top, x) => { if (top <= hat.y0 + hatH * 0.3) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); } });
  if (!Number.isFinite(hx0)) return;
  const brim = new Set();
  if (facing !== 'back') {
    crown.forEach((k) => { const y = Math.floor(k / width); const x = k - y * width; if (x < hx0 || x > hx1) brim.add(k); });
  }

  if (head.crown === 'cap') {
    // Every pixel of the crown takes the dye, whatever the mask called it, measured against
    // the panel where it is light and the cap where it is dark; the line work stays black.
    const tint = palette.targets[PART.hat];
    if (tint) crown.forEach((k) => {
      const i = k * 4; const lum = luminance(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (lum < 26) return;
      const out = tintPixel([pixels[i], pixels[i + 1], pixels[i + 2]], PART_BASE[lum > 120 ? PART.panel : PART.hat], tint);
      pixels[i] = out[0]; pixels[i + 1] = out[1]; pixels[i + 2] = out[2];
    });
  } else {
    const kind = head.hat?.kind || null;
    // The brim goes, unless it is a visor's; the cap's own top is a little taller than a head.
    if (kind !== 'visor') brim.forEach((k) => { crown.delete(k); erase(k - Math.floor(k / width) * width, Math.floor(k / width)); });
    if (head.crown !== 'hat') {
      // The top row goes, and the next two lose their ends, so the head rounds off rather
      // than ending in the cap's flat top.
      const top = Math.min(...[...crown].map((k) => Math.floor(k / width)));
      const ends = new Map();
      crown.forEach((k) => { const y = Math.floor(k / width); const x = k - y * width; const e = ends.get(y) || [Infinity, -Infinity]; ends.set(y, [Math.min(e[0], x), Math.max(e[1], x)]); });
      [...crown].forEach((k) => {
        const y = Math.floor(k / width); const x = k - y * width; if (brim.has(k)) return;
        const [ex0, ex1] = ends.get(y);
        const trim = y === top ? Infinity : y === top + 1 ? 3 : y === top + 2 ? 2 : y === top + 3 ? 1 : 0;
        if (x - ex0 < trim || ex1 - x < trim) { crown.delete(k); erase(x, y); }
      });
    }
    const base = head.crown === 'scalp' ? skin : head.crown === 'hair' ? hair : head.hat.rgb;
    const trim = head.hat?.trim || null;
    // A cowboy hat's crown stands taller than a cap's, a beanie's a little.
    if (kind === 'cowboy' || kind === 'beanie') {
      const top = Math.min(...[...crown].filter((k) => !brim.has(k)).map((k) => Math.floor(k / width)));
      let tx0 = Infinity; let tx1 = -Infinity;
      crown.forEach((k) => { const y = Math.floor(k / width); if (y === top) { tx0 = Math.min(tx0, k - y * width); tx1 = Math.max(tx1, k - y * width); } });
      // Each row up is set in a little further, so the crown rounds rather than blocks.
      const raise = kind === 'cowboy' ? 3 : 1; const inset = kind === 'cowboy' ? 2 : 1;
      for (let r = 1; r <= raise; r += 1) { const y = top - r; const step = inset + (r - 1) * 2; for (let x = tx0 + step; x <= tx1 - step; x += 1) if (inside(x, y)) { crown.add(key(x, y)); put(x, y, base); } }
    }
    const rows = new Map();
    let by0 = Infinity; let by1 = -Infinity;
    crown.forEach((k) => { if (brim.has(k)) return; const y = Math.floor(k / width); const x = k - y * width; const row = rows.get(y) || [Infinity, -Infinity]; rows.set(y, [Math.min(row[0], x), Math.max(row[1], x)]); by0 = Math.min(by0, y); by1 = Math.max(by1, y); });
    if (!rows.size) return;
    const bh = by1 - by0 + 1;

    // The dome.
    crown.forEach((k) => {
      if (brim.has(k)) return;
      const y = Math.floor(k / width); const x = k - y * width;
      const [rx0, rx1] = rows.get(y);
      const u = rx1 > rx0 ? (2 * (x - rx0)) / (rx1 - rx0) - 1 : 0;
      const v = (y - by0) / bh;
      let shade = domeShade(u, v, dir);
      let rgb = base;
      // Skin does not shine like cloth; a cowboy hat's crown is dented on top.
      if (head.crown === 'scalp') shade = Math.min(shade, 1.0) * 0.94;
      if (kind === 'cowboy' && v < 0.28 && Math.abs(u) < 0.3) shade *= 0.84;
      if (head.crown === 'hair' && v > 0.1 && v < 0.26 && (dir === 0 ? Math.abs(u) < 0.5 : u * dir > -0.2)) shade *= 1.22;
      if (kind === 'beanie' && v > 0.66) { rgb = y === by0 + Math.round(bh * 0.66) ? shaded(base, 1.2) : shaded(base, 0.84); shade = 1; }
      if ((kind === 'straw' && v > 0.74) || (kind === 'cowboy' && v > 0.78)) { rgb = trim; shade = 0.95; }
      if (kind === 'visor' && v > 0.8) { rgb = head.hat.rgb; shade = 0.98 - 0.1 * v; }
      put(x, y, shaded(rgb, shade));
    });
    // A visor keeps the cap's brim, in its own colour.
    if (kind === 'visor') brim.forEach((k) => { const i = k * 4; const out = tintPixel([pixels[i], pixels[i + 1], pixels[i + 2]], PART_BASE[PART.hat], head.hat.rgb); pixels[i] = out[0]; pixels[i + 1] = out[1]; pixels[i + 2] = out[2]; });

    // What a hat adds beyond the cap's silhouette: a pompom, a brim.
    const extras = new Set();
    const add = (x, y, rgb) => { if (!inside(x, y)) return; put(x, y, rgb); extras.add(key(x, y)); };
    const bottom = rows.get(by1);
    if (kind === 'beanie') {
      const [tx0, tx1] = rows.get(by0); const cx = Math.round((tx0 + tx1) / 2 + dir * (tx1 - tx0) * 0.05); const cy = by0 - 2;
      for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (dx * dx + dy * dy <= 10) add(cx + dx, cy + dy, shaded(trim, 1 - 0.06 * (dy + 3)));
    }
    if (kind === 'bucket' || kind === 'straw' || kind === 'cowboy') {
      const reach = kind === 'bucket' ? 4 : kind === 'straw' ? 7 : 8;
      const lift = kind === 'cowboy' ? 3 : kind === 'straw' ? 1 : 0;
      for (let x = bottom[0] - reach; x <= bottom[1] + reach; x += 1) {
        const out = Math.max(0, Math.max(bottom[0] - x, x - bottom[1]));
        const up = lift && out > reach - 3 ? lift - (reach - out) : 0;
        for (let r = 0; r < 3; r += 1) add(x, by1 + 1 + r - Math.max(0, up), r === 2 ? shaded(base, 0.72) : shaded(base, 1.02 - 0.08 * r));
      }
      if (kind === 'bucket') for (let x = bottom[0] - reach; x <= bottom[1] + reach; x += 1) add(x, by1 + 1, shaded(trim, 1));
    }

    // The line: around the sculpted head against the open, around a hat against everything;
    // hair meets the face with a darker row rather than a line, scalp meets it with nothing.
    const sculpted = new Set([...crown, ...extras]);
    sculpted.forEach((k) => {
      if (brim.has(k) && kind !== 'visor') return;
      const y = Math.floor(k / width); const x = k - y * width;
      let edge = false; let onFace = false;
      NEIGHBOURS.forEach(([dx, dy]) => {
        const nx = x + dx; const ny = y + dy;
        if (sculpted.has(key(nx, ny))) return;
        if (alphaAt(nx, ny) === 0) edge = true;
        else if (head.crown === 'hat' || kind === 'visor') edge = true;
        else onFace = true;
      });
      if (edge) put(x, y, OUTLINE);
      else if (onFace && head.crown === 'hair') { const i = at(x, y); put(x, y, shaded([pixels[i], pixels[i + 1], pixels[i + 2]], 0.72)); }
    });

    // Long hair, down the back of the neck, behind the body: only the open air and the nape
    // are painted, and from behind the neck too.
    if (head.hairBack) {
      const headW = hx1 - hx0 + 1;
      const yTop = Math.round(by0 + bh * 0.45);
      const yBot = Math.round((beard ? beard.y1 : by1) + bh * 0.4);
      const spans = facing === 'right' ? [[hx0 - Math.round(headW * 0.12), hx0 + Math.round(headW * 0.28)]]
        : facing === 'left' ? [[hx1 - Math.round(headW * 0.28), hx1 + Math.round(headW * 0.12)]]
          : facing === 'front' ? [[hx0 - Math.round(headW * 0.08), hx0 + Math.round(headW * 0.18)], [hx1 - Math.round(headW * 0.18), hx1 + Math.round(headW * 0.08)]]
            : [[hx0, hx1]];
      const fill = new Set();
      spans.forEach(([sx0, sx1], index) => {
        // The edge against the head is where the hair hangs from; it tapers away from it
        // toward the ends, and the top corner is cut so it rounds off the crown.
        const inner = facing === 'right' || (facing === 'front' && index === 0) ? sx1 : facing === 'left' || facing === 'front' ? sx0 : (sx0 + sx1) / 2;
        const half = facing === 'back' ? (sx1 - sx0) / 2 : sx1 - sx0;
        for (let y = yTop; y <= yBot; y += 1) for (let x = sx0; x <= sx1; x += 1) {
          if (!inside(x, y) || sculpted.has(key(x, y))) continue;
          const part = partAt(x, y);
          const open = alphaAt(x, y) === 0 || part === PART.beard || (facing === 'back' && (part === PART.jacket || part === PART.skin));
          if (!open) continue;
          const v = (y - yTop) / Math.max(1, yBot - yTop);
          const out = Math.abs(x - inner) / Math.max(1, half);
          if (out > 1 - (facing === 'back' ? 0.3 : 0.45) * v) continue;
          if (v < 0.12 && out > 0.55) continue;
          put(x, y, shaded(hair, 0.9 - 0.2 * v));
          fill.add(key(x, y));
        }
      });
      fill.forEach((k) => {
        const y = Math.floor(k / width); const x = k - y * width;
        if (NEIGHBOURS.some(([dx, dy]) => !fill.has(key(x + dx, y + dy)) && !sculpted.has(key(x + dx, y + dy)) && alphaAt(x + dx, y + dy) === 0)) put(x, y, OUTLINE);
      });
    }
  }

  // The beard: kept and dyed, or cut down to a jaw with the parts of it a style keeps.
  if (!beard) return;
  const bH = beard.y1 - beard.y0 + 1;
  const nape = (x) => facing === 'back' || (facing !== 'front' && face && frontness(x, face, facing) < 0);
  const stubble = mix(skin, hair, 0.45);
  for (let y = beard.y0; y <= beard.y1; y += 1) for (let x = Math.max(x0, beard.x0); x <= Math.min(x1 - 1, beard.x1); x += 1) {
    if (partAt(x, y) !== PART.beard) continue;
    const i = at(x, y);
    const own = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const v = (y - beard.y0) / bH;
    const t = face ? frontness(x, face, facing) : -1;
    let keep = head.beard === 'keep';
    if (head.beard === 'goatee') keep = (t > 0.5 && v > 0.45) || (t > 0.38 && v < 0.3);
    if (head.beard === 'mustache') keep = t > 0.35 && v < 0.32;
    if (nape(x)) {
      // Behind the ear it is the hair at the nape, whatever the beard is.
      if (head.crown === 'scalp') put(x, y, shaded(skin, 0.9 - 0.1 * v));
      else if (head.beardTint || head.crown !== 'cap') { const out = tintPixel(own, PART_BASE[PART.beard], hair); put(x, y, out); }
      continue;
    }
    if (keep) {
      if (head.beardTint) put(x, y, tintPixel(own, PART_BASE[PART.beard], head.beardTint));
      continue;
    }
    let rgb = shaded(skin, (0.97 - 0.14 * v) * (t < 0.3 ? 0.94 : 1));
    if (head.beard === 'stubble' && v > 0.2 && (x + y) % 2 === 0) rgb = stubble;
    const edge = NEIGHBOURS.some(([dx, dy]) => alphaAt(x + dx, y + dy) === 0);
    const collar = !edge && NEIGHBOURS.some(([dx, dy]) => partAt(x + dx, y + dy) === PART.jacket);
    put(x, y, edge ? OUTLINE : collar ? shaded(rgb, 0.8) : rgb);
  }
}

// Dye a strip in place, then sculpt every frame's head. `pixels` is the strip's RGBA, `mask`
// the matching mask's RGBA (red = part id), `anchors` the per-frame boxes.
export function paintPixels({ pixels, mask, width, height, frameWidth, anchors: frameAnchors = [], palette }) {
  const { targets } = palette;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const part = mask[i];
    // The cap and the beard are the head's to sculpt.
    if (!part || part === PART.hat || part === PART.panel || part === PART.beard) continue;
    const target = targets[part];
    if (!target) continue;
    const out = tintPixel([pixels[i], pixels[i + 1], pixels[i + 2]], PART_BASE[part], target);
    pixels[i] = out[0]; pixels[i + 1] = out[1]; pixels[i + 2] = out[2];
  }
  const frames = Math.ceil(width / frameWidth);
  for (let f = 0; f < frames; f += 1) {
    sculptHead({ pixels, mask, width, height, x0: f * frameWidth, x1: Math.min(width, (f + 1) * frameWidth), frame: frameAnchors[f], palette });
  }
  return pixels;
}

// ---- Canvas work ----

function canvasFor(width, height) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  } catch (error) { return null; }
}

let paintable = null;
export function canPaint() {
  if (paintable === null) paintable = typeof document !== 'undefined' && typeof Image !== 'undefined' && Boolean(canvasFor(1, 1));
  return paintable;
}

const images = new Map();
function loadImage(src) {
  if (!images.has(src)) {
    images.set(src, new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }));
  }
  return images.get(src);
}

// Paint one action's strip for a palette.
async function paintStrip(action, palette) {
  const [art, maskArt] = await Promise.all([loadImage(ANGLER_SPRITES[action].src), loadImage(MASKS[action])]);
  const { width, height } = art;
  const main = canvasFor(width, height);
  const maskCanvas = canvasFor(width, height);
  main.ctx.drawImage(art, 0, 0);
  maskCanvas.ctx.drawImage(maskArt, 0, 0);
  const image = main.ctx.getImageData(0, 0, width, height);
  const mask = maskCanvas.ctx.getImageData(0, 0, width, height).data;
  paintPixels({ pixels: image.data, mask, width, height, frameWidth: SPRITE_FRAME.w, anchors: anchors[action] || [], palette });
  main.ctx.putImageData(image, 0, 0);
  return main.canvas;
}

const sheetCache = new Map();
const stillCache = new Map();

// Resolves to { idle, cast, reel, fishon, celebrate } data URLs, or null for the stock look
// and wherever nothing can be painted.
export function renderAngler(look) {
  if (!look || isDefaultLook(look) || !canPaint()) return Promise.resolve(null);
  const key = lookKey(look);
  if (!sheetCache.has(key)) {
    const palette = paletteFor(look);
    const job = (async () => {
      const sheets = {};
      for (const action of Object.keys(ANGLER_SPRITES)) sheets[action] = (await paintStrip(action, palette)).toDataURL('image/png');
      return sheets;
    })().catch(() => null);
    sheetCache.set(key, job);
  }
  return sheetCache.get(key);
}

// One still of the angler (the idle strip's first frame) for previews and the racks; null
// for the stock look (the stock strip shows) and wherever nothing can be painted.
export function renderStill(look) {
  if (!look || isDefaultLook(look) || !canPaint()) return Promise.resolve(null);
  const key = lookKey(look);
  if (!stillCache.has(key)) {
    const job = (async () => {
      const strip = await paintStrip('idle', paletteFor(look));
      const still = canvasFor(SPRITE_FRAME.w, SPRITE_FRAME.h);
      still.ctx.drawImage(strip, 0, 0, SPRITE_FRAME.w, SPRITE_FRAME.h, 0, 0, SPRITE_FRAME.w, SPRITE_FRAME.h);
      return still.canvas.toDataURL('image/png');
    })().catch(() => null);
    stillCache.set(key, job);
  }
  return stillCache.get(key);
}

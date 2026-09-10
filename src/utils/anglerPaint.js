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
  return Math.max(0.62, Math.min(1.24, 1.14 - 0.4 * v + (dir === 0 ? -0.1 * Math.abs(u) : 0.1 * dir * u)));
}

// ---- The sculpting, one frame at a time ----

function sculptHead({ pixels, mask, width, height, x0, x1, frame, palette }) {
  if (!frame || !frame.hat) return;
  const { hat, face, beard } = frame;
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
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // The crown: the cap and its panel, plus the line work inside the cap's box, which is the
  // cap's own seams and edge and has to be repainted with it.
  const crown = new Set();
  for (let y = hat.y0; y <= hat.y1; y += 1) for (let x = Math.max(x0, hat.x0); x <= Math.min(x1 - 1, hat.x1); x += 1) {
    const part = partAt(x, y);
    if (part === PART.hat || part === PART.panel || (part === PART.outline && alphaAt(x, y) > 0)) crown.add(key(x, y));
  }
  const hatH = hat.y1 - hat.y0 + 1;

  // The head's width, read across the crown's middle rows — a brim is whatever the cap has
  // past that, low down.
  let hx0 = Infinity; let hx1 = -Infinity;
  crown.forEach((k) => { const y = Math.floor(k / width); const x = k - y * width; if (y >= hat.y0 + hatH * 0.25 && y <= hat.y0 + hatH * 0.55) { hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); } });
  if (!Number.isFinite(hx0)) return;
  const brim = new Set();
  if (facing !== 'back') {
    crown.forEach((k) => { const y = Math.floor(k / width); const x = k - y * width; if (y > hat.y0 + hatH * 0.45 && (x > hx1 + 1 || x < hx0 - 1)) brim.add(k); });
  }

  if (head.crown === 'cap') {
    const tint = palette.targets[PART.hat];
    if (tint) crown.forEach((k) => { if (mask[k * 4] === PART.hat || mask[k * 4] === PART.panel) { const i = k * 4; const out = tintPixel([pixels[i], pixels[i + 1], pixels[i + 2]], PART_BASE[mask[i]], tint); pixels[i] = out[0]; pixels[i + 1] = out[1]; pixels[i + 2] = out[2]; } });
  } else {
    const kind = head.hat?.kind || null;
    // The brim goes, unless it is a visor's; the cap's own top is a little taller than a head.
    if (kind !== 'visor') brim.forEach((k) => { crown.delete(k); erase(k - Math.floor(k / width) * width, Math.floor(k / width)); });
    if (head.crown !== 'hat') {
      const top = Math.min(...[...crown].map((k) => Math.floor(k / width)));
      [...crown].forEach((k) => { const y = Math.floor(k / width); if (y < top + 2 && !brim.has(k)) { crown.delete(k); erase(k - y * width, y); } });
    }
    const base = head.crown === 'scalp' ? skin : head.crown === 'hair' ? hair : head.hat.rgb;
    const trim = head.hat?.trim || null;
    // A cowboy hat's crown stands taller than a cap's, a beanie's a little.
    if (kind === 'cowboy' || kind === 'beanie') {
      const top = Math.min(...[...crown].filter((k) => !brim.has(k)).map((k) => Math.floor(k / width)));
      let tx0 = Infinity; let tx1 = -Infinity;
      crown.forEach((k) => { const y = Math.floor(k / width); if (y === top) { tx0 = Math.min(tx0, k - y * width); tx1 = Math.max(tx1, k - y * width); } });
      const raise = kind === 'cowboy' ? 3 : 1; const inset = kind === 'cowboy' ? 2 : 1;
      for (let y = top - raise; y < top; y += 1) for (let x = tx0 + inset; x <= tx1 - inset; x += 1) if (inside(x, y)) { crown.add(key(x, y)); put(x, y, base); }
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
      if (head.crown === 'scalp') shade = Math.min(shade, 1.06);
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
      spans.forEach(([sx0, sx1]) => {
        for (let y = yTop; y <= yBot; y += 1) for (let x = sx0; x <= sx1; x += 1) {
          if (!inside(x, y) || sculpted.has(key(x, y))) continue;
          const part = partAt(x, y);
          const open = alphaAt(x, y) === 0 || part === PART.beard || (facing === 'back' && (part === PART.jacket || part === PART.skin));
          if (!open) continue;
          // Rounded off at the bottom corners.
          const v = (y - yTop) / Math.max(1, yBot - yTop);
          if (v > 0.85 && (x === sx0 || x === sx1)) continue;
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

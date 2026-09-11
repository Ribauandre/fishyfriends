// Dresses the angler at runtime. The strips in assets/angler are the ChatGPT-drawn character
// as he comes — bald, clean-shaven, pale shirt, olive waders — and for a look each strip goes
// through a canvas where `paintPixels` (pure, tested on plain arrays) does two things. Parts
// that keep their shape are dyed: skin, shirt, waders, boots and rod, luminance-preserving, so
// the artist's shading survives. The head is built on: the sheet gives a bare skull and a bare
// jaw, so hair is laid over the top of the skull, a beard onto the jaw, and a hat over the
// crown following the silhouette the art already drew — into the ten rows of headroom the
// slicer leaves above the head. Nothing has to be taken off first, which is what the previous
// sheet, drawn in a cap and a full beard, made every look fight with. Results are data URLs
// per action, cached by look. Where there is no canvas (jsdom, ancient browsers)
// `renderAngler` resolves null and the stock strips show.
import { ANGLER_SPRITES, SPRITE_FRAME } from './anglerSprites';
import anchors from './anglerAnchors.json';
import { PART, PART_BASE, paletteFor, lookKey, isDefaultLook } from './anglerLook';
import idleMask from '../assets/angler/masks/idle.png';
import castMask from '../assets/angler/masks/cast.png';
import reelMask from '../assets/angler/masks/reel.png';
import celebrateMask from '../assets/angler/masks/celebrate.png';
import hurtMask from '../assets/angler/masks/hurt.png';

const MASKS = { idle: idleMask, cast: castMask, reel: reelMask, celebrate: celebrateMask, hurt: hurtMask };

// The art's line colour, drawn back around anything built on the head.
export const OUTLINE = [16, 15, 14];

// Where things sit on the head, as fractions of it from the crown down to the chin. The sheet
// draws the same head in every pose, only tilted, so these hold whichever way it is turned:
// the eyes a little above the middle, the mouth low, and each hat's brim at the height that
// hat is worn — a cap just above the eyes, a beanie pulled past them, a straw or a cowboy hat
// perched high on the crown.
const EYES = 0.58;
const MOUTH = 0.84;
const BRIM = { cap: 0.45, visor: 0.36, beanie: 0.5, bucket: 0.48, straw: 0.36, cowboy: 0.32 };

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

// How far forward on the face a column is: 1 at the nose and chin, 0 at the back of the head.
// From the front the middle of the face is the front, so a goatee lands on the chin either way.
export function frontness(x, head, facing) {
  const t = (x - head.x0) / Math.max(1, head.x1 - head.x0);
  if (facing === 'right') return t;
  if (facing === 'left') return 1 - t;
  return 1 - 2 * Math.abs(t - 0.5);
}

// A dome's light: brightest at the top and the front, falling away down the sides.
function domeShade(u, v, dir) {
  const round = 1 - 0.34 * u * u;
  return Math.max(0.55, Math.min(1.3, (1.2 - 0.42 * v) * round + (dir === 0 ? 0 : 0.12 * dir * u)));
}

// ---- Building on the head, one frame at a time ----

function dressHead({ pixels, mask, width, height, x0, x1, frame, palette }) {
  const plan = palette.head;
  if (!frame || !frame.head) return;
  if (plan.crown === 'bare' && !plan.hat && !plan.beard.rise && !plan.beard.lip && !plan.beard.chinOnly) return;
  // The anchors are in the frame's own pixels; the strip's start puts them in the strip's.
  const head = { ...frame.head, x0: frame.head.x0 + x0, x1: frame.head.x1 + x0 };
  const facing = frame.facing || 'front';
  const dir = facing === 'right' ? 1 : facing === 'left' ? -1 : 0;
  const { skin, hair } = palette;
  const headW = head.x1 - head.x0 + 1;
  const headH = head.y1 - head.y0 + 1;

  const inside = (x, y) => x >= x0 && x < x1 && y >= 0 && y < height;
  const at = (x, y) => (y * width + x) * 4;
  const partAt = (x, y) => (inside(x, y) ? mask[at(x, y)] : 0);
  const alphaAt = (x, y) => (inside(x, y) ? pixels[at(x, y) + 3] : 0);
  const put = (x, y, rgb) => { if (!inside(x, y)) return; const i = at(x, y); pixels[i] = rgb[0]; pixels[i + 1] = rgb[1]; pixels[i + 2] = rgb[2]; pixels[i + 3] = 255; };
  const key = (x, y) => y * width + x;
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // The head is the skin and the line work around it inside the head's box — the box came
  // from the skin blob itself, so nothing else of the figure reaches into it.
  const inBox = (x, y) => x >= head.x0 && x <= head.x1 && y >= head.y0 && y <= head.y1;
  const isHead = (x, y) => inBox(x, y) && alphaAt(x, y) > 0 && (partAt(x, y) === PART.skin || partAt(x, y) === PART.outline);
  // The silhouette's top, column by column: what a hat or a head of hair has to follow.
  const tops = new Map();
  for (let x = head.x0; x <= head.x1; x += 1) {
    for (let y = head.y0; y <= head.y1; y += 1) if (isHead(x, y)) { tops.set(x, y); break; }
  }
  if (!tops.size) return;
  const crownTop = Math.min(...tops.values());
  const eyeY = head.y0 + headH * EYES;
  const mouthY = head.y0 + headH * MOUTH;

  // ---- the beard, onto the bare jaw ----
  const beard = plan.beard;
  if (beard.rise || beard.lip || beard.chinOnly) {
    const stubble = mix(skin, hair, 0.5);
    for (let y = head.y0; y <= head.y1; y += 1) for (let x = head.x0; x <= head.x1; x += 1) {
      if (partAt(x, y) !== PART.skin) continue;
      const t = frontness(x, head, facing);
      // A beard is not a band across the face: it rides high at the sideburn and drops to the
      // mouth at the chin, so the top of it slides with how far forward the column is. A
      // goatee keeps only the front of that, from below the mouth.
      const jawTop = beard.chinOnly ? mouthY + 1 : mouthY - (mouthY - eyeY) * (1 - t) * beard.rise;
      const onJaw = (beard.rise > 0 || beard.chinOnly) && y >= jawTop;
      const onLip = beard.lip && y >= mouthY - 4 && y < mouthY - 1 && t > 0.7;
      if (!onJaw && !onLip) continue;
      if (beard.chinOnly && t < 0.5) continue;
      if (beard.dither && (x + y) % 2 === 0) continue;
      const v = (y - jawTop) / Math.max(1, head.y1 - jawTop);
      put(x, y, beard.dither ? stubble : shaded(hair, 1 - 0.18 * Math.max(0, v)));
    }
  }

  if (plan.crown === 'bare' && !plan.hat) return;

  // ---- what sits on the crown ----
  const kind = plan.hat?.kind || null;
  const isHat = plan.crown === 'hat';
  // A visor on a bald head paints nothing over the crown, but it still has to find where the
  // crown ends to hang its band and peak off, so the shape is worked out either way.
  const paintCrown = plan.crown !== 'bare';
  const base = isHat ? plan.hat.rgb : hair;
  const trim = plan.hat?.trim || base;
  // How far down the forehead it reaches, and how far it stands proud of the skull. A cap and
  // a head of hair sit on the skull; a beanie is pulled down over the ears; a cowboy hat has a
  // crown of its own to stand up in.
  const depth = isHat ? (BRIM[kind] ?? BRIM.cap) : plan.hairDepth;
  const rise = isHat ? (kind === 'cowboy' ? 7 : kind === 'beanie' ? 3 : kind === 'bucket' ? 2 : 1) : 0;

  const crown = new Set();
  const rows = new Map();
  for (let x = head.x0; x <= head.x1; x += 1) {
    const top = tops.get(x);
    if (top === undefined) continue;
    // Hair is deeper at the back than at the front, which is where a hairline actually is;
    // a hat sits level, because a hat does.
    const reach = isHat ? depth : depth * (1 + 0.3 * (1 - frontness(x, head, facing)));
    const limit = head.y0 + headH * reach;
    for (let y = top - rise; y <= limit; y += 1) {
      if (!inside(x, y)) continue;
      // Hair fills the skin the art drew and leaves its keyline alone; a hat is drawn over
      // the top of the head, keyline and all, and past it into the headroom above.
      if (!isHat && partAt(x, y) !== PART.skin) continue;
      if (isHat && y >= top && !isHead(x, y)) continue;
      crown.add(key(x, y));
      const row = rows.get(y) || [Infinity, -Infinity];
      rows.set(y, [Math.min(row[0], x), Math.max(row[1], x)]);
    }
  }
  if (!crown.size) return;
  let top = Infinity; let bottom = -Infinity;
  rows.forEach((_, y) => { top = Math.min(top, y); bottom = Math.max(bottom, y); });
  const span = bottom - top + 1;

  // A cowboy hat and a beanie stand taller than the skull: each row above is set in a little
  // further, so the crown rounds off rather than ending in a block.
  if (kind === 'cowboy' || kind === 'beanie') {
    const [tx0, tx1] = rows.get(top);
    const raise = kind === 'cowboy' ? 3 : 1;
    for (let r = 1; r <= raise; r += 1) {
      const y = top - r; const step = r * (kind === 'cowboy' ? 2 : 1);
      for (let x = tx0 + step; x <= tx1 - step; x += 1) if (inside(x, y)) { crown.add(key(x, y)); const row = rows.get(y) || [Infinity, -Infinity]; rows.set(y, [Math.min(row[0], x), Math.max(row[1], x)]); }
    }
    top -= raise;
  }

  // The dome.
  if (paintCrown) crown.forEach((k) => {
    const y = Math.floor(k / width); const x = k - y * width;
    const [rx0, rx1] = rows.get(y);
    const u = rx1 > rx0 ? (2 * (x - rx0)) / (rx1 - rx0) - 1 : 0;
    const v = (y - top) / Math.max(1, span);
    let shade = domeShade(u, v, dir);
    let rgb = base;
    if (!isHat) shade *= 1.02;
    // A knit band round the bottom of a beanie, a hatband on the straw, a dent in the felt.
    if (kind === 'beanie' && v > 0.78) { rgb = trim; shade = 1 - 0.1 * v; }
    if (kind === 'straw' && v > 0.72) { rgb = trim; shade = 0.98; }
    if (kind === 'cowboy' && v < 0.3 && Math.abs(u) < 0.32) shade *= 0.84;
    put(x, y, shaded(rgb, shade));
  });

  // What a hat adds past the head's own silhouette: a peak, a brim, a pompom.
  const extras = new Set();
  const add = (x, y, rgb) => { if (!inside(x, y)) return; put(x, y, rgb); extras.add(key(x, y)); };
  const brow = rows.get(bottom) || rows.get(top);
  if (kind === 'cap' || kind === 'visor') {
    const peakY = kind === 'visor' ? Math.round(head.y0 + headH * BRIM.visor) : bottom + 1;
    if (dir === 0) {
      // Head on, a peak is foreshortened into a bar across the brow, a little wider than the
      // head and turned down at its ends — not something sticking out to the sides.
      for (let x = brow[0] - 2; x <= brow[1] + 2; x += 1) {
        const out = Math.max(0, Math.max(brow[0] - x, x - brow[1]));
        for (let r = 0; r < 3; r += 1) add(x, peakY + r + (out > 1 ? 1 : 0), shaded(trim, r === 2 ? 0.72 : 1 - 0.1 * r));
      }
    } else {
      // In profile it juts out over the face, three rows of it, dropping as it goes.
      const reach = Math.round(headW * 0.4);
      const edge = dir > 0 ? brow[1] : brow[0];
      for (let step = 0; step <= reach; step += 1) {
        const x = edge + dir * step;
        const drop = Math.round((step / reach) * 2);
        for (let r = 0; r < 4; r += 1) add(x, peakY + drop + r - 2, shaded(trim, r === 3 ? 0.72 : 1 - 0.08 * r));
      }
    }
    // A visor is a peak and the band that holds it on, nothing over the crown — so the band
    // goes on last, over the end of the peak, the way it does on a real one.
    if (kind === 'visor') for (let x = brow[0] - 1; x <= brow[1] + 1; x += 1) for (let r = 0; r < 3; r += 1) add(x, peakY + r - 2, shaded(plan.hat.rgb, 1 - 0.09 * r));
  }
  if (kind === 'bucket' || kind === 'straw' || kind === 'cowboy') {
    const reach = kind === 'bucket' ? 4 : kind === 'straw' ? 8 : 9;
    const lift = kind === 'cowboy' ? 3 : kind === 'straw' ? 1 : 0;
    for (let x = brow[0] - reach; x <= brow[1] + reach; x += 1) {
      const out = Math.max(0, Math.max(brow[0] - x, x - brow[1]));
      const up = lift && out > reach - 3 ? lift - (reach - out) : 0;
      for (let r = 0; r < 3; r += 1) add(x, bottom + 1 + r - Math.max(0, up), r === 2 ? shaded(base, 0.7) : shaded(base, 1.02 - 0.08 * r));
    }
    if (kind === 'bucket') for (let x = brow[0] - reach; x <= brow[1] + reach; x += 1) add(x, bottom + 1, shaded(trim, 1));
  }
  if (kind === 'beanie') {
    const [tx0, tx1] = rows.get(top);
    const cx = Math.round((tx0 + tx1) / 2 + dir * (tx1 - tx0) * 0.06); const cy = top - 2;
    for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (dx * dx + dy * dy <= 10) add(cx + dx, cy + dy, shaded(trim, 1 - 0.06 * (dy + 3)));
  }

  // Long hair, down the back of the neck: only the open air behind the head is filled, and it
  // tapers away from the head as it falls.
  const fall = new Set();
  if (plan.hairBack) {
    const yTop = crownTop + Math.round(headH * 0.35);
    const yBot = head.y1 + Math.round(headH * 0.3);
    const wide = Math.round(headW * 0.22);
    const edges = facing === 'right' ? [head.x0] : facing === 'left' ? [head.x1] : [head.x0, head.x1];
    edges.forEach((edge, index) => {
      const away = facing === 'front' ? (index === 0 ? -1 : 1) : facing === 'right' ? -1 : 1;
      for (let y = yTop; y <= yBot; y += 1) for (let step = 0; step <= wide; step += 1) {
        const x = edge + away * step;
        if (!inside(x, y) || alphaAt(x, y) !== 0) continue;
        const v = (y - yTop) / Math.max(1, yBot - yTop);
        if (step > wide * (1 - 0.45 * v)) continue;
        if (v < 0.14 && step > wide * 0.5) continue;
        put(x, y, shaded(hair, 0.88 - 0.2 * v));
        fall.add(key(x, y));
      }
    });
  }

  // The line: round anything standing against the open air, and round a hat wherever it meets
  // the face as well — hair meets the face with a darker row instead, the way the art shades.
  const drawn = new Set([...(paintCrown ? crown : []), ...extras, ...fall]);
  drawn.forEach((k) => {
    const y = Math.floor(k / width); const x = k - y * width;
    let edge = false; let onFace = false;
    NEIGHBOURS.forEach(([dx, dy]) => {
      if (drawn.has(key(x + dx, y + dy))) return;
      if (alphaAt(x + dx, y + dy) === 0) edge = true;
      else if (isHat) edge = true;
      else onFace = true;
    });
    if (edge) put(x, y, OUTLINE);
    else if (onFace) { const i = at(x, y); put(x, y, shaded([pixels[i], pixels[i + 1], pixels[i + 2]], 0.74)); }
  });
}

// Dye a strip in place, then dress every frame's head. `pixels` is the strip's RGBA, `mask`
// the matching mask's RGBA (red = part id), `anchors` the per-frame boxes.
export function paintPixels({ pixels, mask, width, height, frameWidth, anchors: frameAnchors = [], palette }) {
  const { targets } = palette;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const target = targets[mask[i]];
    if (!target) continue;
    const out = tintPixel([pixels[i], pixels[i + 1], pixels[i + 2]], PART_BASE[mask[i]], target);
    pixels[i] = out[0]; pixels[i + 1] = out[1]; pixels[i + 2] = out[2];
  }
  const frames = Math.ceil(width / frameWidth);
  for (let f = 0; f < frames; f += 1) {
    dressHead({ pixels, mask, width, height, x0: f * frameWidth, x1: Math.min(width, (f + 1) * frameWidth), frame: frameAnchors[f], palette });
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

// Resolves to { idle, cast, reel, celebrate, hurt } data URLs, or null for the stock look and
// wherever nothing can be painted.
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

// Paint the angler's strips for a look.
//
// Every cosmetic on this character is a colour, so this module only ever recolours pixels the
// artist drew — it never adds, stamps or places anything. That is a deliberate narrowing: the
// version before it composited overlays lifted off a dozen sheets, and every defect that ever
// reached the site was a placement or a lift gone wrong, never a dye.
//
// `paintPixels` is the whole of it and is pure: give it a strip's pixels, the matching part mask
// and a palette from `paletteFor`, and it walks them together. Which part a pixel belongs to is
// settled offline by scripts/anglerPixelMasks.mjs; all that is decided here is what to do with it:
//
//   skin      moved between ramps, band for band, so the modelling on his face survives
//   hair      dyed with the contrast pulled in first, because hair is drawn dark
//   the rest  dyed straight, keeping each pixel's shade against its part's painted mid-tone
//   outline   left alone, and so is any pixel in no part at all — the reel, a caught fish
//
// The canvas half below renders those strips to data URLs and caches them per look. Where there is
// no canvas — jsdom, in the tests — everything returns null and the components fall back to the
// stock strips, which is also what the stock look itself does, since painting it would be a no-op.
import { PART, PART_BASE, SKIN_BODY, paletteFor, lookKey, isDefaultLook } from './anglerLook';
import { ANGLER_SPRITES, SPRITE_FRAME } from './anglerSprites';

import idleMask from '../assets/angler/masks/idle.png';
import walkMask from '../assets/angler/masks/walk.png';
import castMask from '../assets/angler/masks/cast.png';
import reelMask from '../assets/angler/masks/reel.png';
import celebrateMask from '../assets/angler/masks/celebrate.png';

const MASKS = { idle: idleMask, walk: walkMask, cast: castMask, reel: reelMask, celebrate: celebrateMask };

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const mix = (a, b, t) => [clamp(a[0] + (b[0] - a[0]) * t), clamp(a[1] + (b[1] - a[1]) * t), clamp(a[2] + (b[2] - a[2]) * t)];

// Which band of a ramp a pixel belongs to. A ramp is a ladder of brightness, so that is what
// places a pixel on it.
export function bandOf(rgb, ramp) {
  let best = 0; let nearest = Infinity;
  ramp.forEach((tone, i) => { const d = Math.abs(luminance(...rgb) - luminance(...tone)); if (d < nearest) { nearest = d; best = i; } });
  return best;
}

// Move one pixel from the ramp the art is painted in to another the artist drew, by the step
// between their matching bands. A dye would have thrown away everything but the pixel's
// brightness; this keeps the pixel and moves it, so the shading arrives intact.
//
// The step is *interpolated* between the two bands the pixel's brightness falls between, not
// taken from the nearest one. Snapping to the nearest band was fine when he was thirty pixels
// tall and every skin pixel sat near a band's centre; drawn at full size his face is a gradient,
// and a gradient crosses the midpoint between two bands somewhere on every cheek. On one side of
// that line a pixel took band one's step and on the other band two's — steps that differ by a
// hundred in red for the deep tone — so a smooth face came out as flat patches with a hard edge
// between them. Blending the two steps by where the pixel sits makes the move continuous, and at
// a band's own brightness it is exactly that band's step, as before.
export function shiftPixel(rgb, from, to) {
  const light = luminance(...rgb);
  const rungs = from.map((tone) => luminance(...tone));
  let i = 0;
  while (i < rungs.length - 2 && light > rungs[i + 1]) i += 1;
  const span = rungs[i + 1] - rungs[i];
  const t = span > 0 ? Math.max(0, Math.min(1, (light - rungs[i]) / span)) : 0;
  return [0, 1, 2].map((k) => clamp(rgb[k] + (to[i][k] - from[i][k]) * (1 - t) + (to[i + 1][k] - from[i + 1][k]) * t));
}

// Retint one pixel: keep how light or dark it was relative to the part's painted mid-tone
// and reapply that shading to the target colour, so highlights and folds survive the dye.
export function tintPixel(rgb, base, target) {
  const shade = Math.max(0.3, Math.min(1.7, luminance(...rgb) / luminance(...base)));
  if (shade <= 1) return [clamp(target[0] * shade), clamp(target[1] * shade), clamp(target[2] * shade)];
  // A highlight lightens toward white, it does not multiply past it. Multiplying is what turned
  // a blond beard neon: the drawing is painted dark, so its lit strands ask for a shade of 1.7,
  // and 1.7 times a pale target clips two channels and leaves the third, which is a colour
  // nobody chose. Mixing keeps the hue all the way up.
  return mix(target, [255, 255, 255], (shade - 1) / 0.7 * 0.55);
}

// Hair and beards are drawn dark, so most of a strand sits below its own mid-tone and a plain
// dye carries all of that darkness onto whatever colour it is given — which is why blond read
// as olive. Pulling the drawing's contrast in toward its middle lifts the darks onto the target
// and lets a pale colour read as itself, and the strands are still there underneath.
const HAIR_CONTRAST = 0.55;
export function dyeDrawn(rgb, base, target) {
  const lifted = luminance(...base) * (1 + (luminance(...rgb) / luminance(...base) - 1) * HAIR_CONTRAST);
  return tintPixel([lifted, lifted, lifted], base, target);
}

// Recolour a strip in place. `pixels` is RGBA from the strip, `mask` is RGBA from the matching
// part mask — only its red channel is read, and it is the part id.
export function paintPixels({ pixels, mask, width, height, palette }) {
  for (let i = 0; i < width * height; i += 1) {
    if (!pixels[i * 4 + 3]) continue;
    const part = mask[i * 4];
    if (!part || part === PART.outline) continue;
    const rgb = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
    let out = null;
    if (part === PART.skin) {
      if (palette.skinRamp) out = shiftPixel(rgb, SKIN_BODY, palette.skinRamp);
    } else if (part === PART.hair) {
      if (palette.targets[PART.hair]) out = dyeDrawn(rgb, PART_BASE[PART.hair], palette.targets[PART.hair]);
    } else {
      const target = palette.targets[part];
      if (target) out = tintPixel(rgb, PART_BASE[part], target);
    }
    if (!out) continue;
    pixels[i * 4] = out[0]; pixels[i * 4 + 1] = out[1]; pixels[i * 4 + 2] = out[2];
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

async function pixelsOf(src) {
  const img = await loadImage(src);
  const canvas = canvasFor(img.width, img.height);
  canvas.ctx.drawImage(img, 0, 0);
  return { data: canvas.ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height };
}

// Paint one action's strip for a palette.
async function paintStrip(action, palette) {
  const [art, mask] = await Promise.all([loadImage(ANGLER_SPRITES[action].src), pixelsOf(MASKS[action])]);
  const { width, height } = art;
  const main = canvasFor(width, height);
  main.ctx.drawImage(art, 0, 0);
  const image = main.ctx.getImageData(0, 0, width, height);
  paintPixels({ pixels: image.data, mask: mask.data, width, height, palette });
  main.ctx.putImageData(image, 0, 0);
  return main.canvas;
}

const sheetCache = new Map();
const stillCache = new Map();

// Resolves to one data URL per strip, or null for the stock look and wherever nothing can be
// painted.
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

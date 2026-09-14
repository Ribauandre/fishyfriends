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
import { PART, PART_BASE, PART_SHADES, SKIN_BODY, paletteFor, lookKey, isDefaultLook } from './anglerLook';
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
//
// And the step is a ratio per channel, not a difference. A pixel *on* a band lands on the other
// ramp's band either way; the two part company on a pixel that is off the ramp, and the render
// has thousands of those — every pixel along an eye, a nostril or the line of the mouth is part
// skin and part the line's black. Take the difference and such a pixel is pushed the whole of the
// band's step: a half-black cheek pixel next to his eye came out grey-purple under the deep tone,
// and the shadow under his cheekbone, warmer than the band it sat nearest, went the same way.
// Scaled, a pixel that is half skin and half black becomes half the new skin and half black,
// which is what the artist would have drawn there.
export function shiftPixel(rgb, from, to) {
  const light = luminance(...rgb);
  const rungs = from.map((tone) => luminance(...tone));
  let i = 0;
  while (i < rungs.length - 2 && light > rungs[i + 1]) i += 1;
  const span = rungs[i + 1] - rungs[i];
  const t = span > 0 ? Math.max(0, Math.min(1, (light - rungs[i]) / span)) : 0;
  const ratio = (band, k) => to[band][k] / Math.max(1, from[band][k]);
  return [0, 1, 2].map((k) => clamp(rgb[k] * (ratio(i, k) * (1 - t) + ratio(i + 1, k) * t)));
}

// Retint one pixel: keep how much lighter or darker it was than the part's painted mid-tone
// and reapply that same step to the target colour, so highlights and folds survive the dye.
export function tintPixel(rgb, base, target) {
  // The artist's shading, as a step in brightness from the part's own mid-tone — and the same
  // step taken from the target. This is additive, not a ratio, and that is the whole point: a
  // ratio scales every contrast the artist drew by target-over-base, so a white rod on dark
  // brown stretched its shading threefold, and a highlight on a black vest — which the ratio
  // path then mixed toward white by a fixed fraction — came out as a bright grey line along a
  // black garment. A highlight fifty steps above the drawn mid-tone should sit fifty steps above
  // the dye, whatever the dye is: dark grey on black, near-white on white.
  const want = luminance(...target) + (luminance(...rgb) - luminance(...base));
  const lt = luminance(...target);
  if (want <= lt) return target.map((v) => clamp(v * Math.max(0, want) / Math.max(1, lt)));
  // Lightening goes toward white, and only as far as the step asks, so the hue holds all the
  // way up instead of clipping two channels and leaving the third.
  return mix(target, [255, 255, 255], Math.min(1, (want - lt) / Math.max(1, 255 - lt)));
}

// A dye on flat pixel art is a palette swap. The art draws each part in a few shades — the beard
// in three browns, the cap in a cream, a navy and a green, the boots in a brown and the tan of
// their tops — and a recoloured part is the same shades, in the same places, of the new colour.
// So a pixel is first snapped to the nearest of its part's drawn shades (the softened ring
// between two blocks lands on one of them, which is what keeps an edge crisp), and that shade
// maps to the target by rank: the shade the part is mostly drawn in becomes the target itself, a
// darker shade the target scaled down by the same brightness ratio, and a lighter one the target
// mixed a fixed step toward white — capped, because the tan top of a boot is more than twice as
// bright as its leather and carrying that ratio onto any target is white. The per-pixel dye this
// replaces kept each pixel's own step from the part's mid-tone, which on flat art turned the
// beard's shadow shade into a dark brown patch inside a grey beard and blew every highlight out.
//
// A pixel near none of the part's shades is not a shade of the part: it is the softened ring
// where the part meets another — the beard against the cheek — carried into the part's mask.
// Snapped to its nearest shade it landed on the lightest, since it is a blend with something
// lighter, and was painted a step lighter still: a pale rim round a grey beard on a deep face.
// It is painted as the main shade instead, which is what a crisp edge is.
export const SHADE_REACH = 32;
export function swapShade(rgb, shades, target) {
  const { list, main } = shades;
  let best = 0; let near = Infinity;
  list.forEach((c, i) => { const d = Math.abs(c[0] - rgb[0]) + Math.abs(c[1] - rgb[1]) + Math.abs(c[2] - rgb[2]); if (d < near) { near = d; best = i; } });
  if (near > SHADE_REACH) best = main;
  const ratio = luminance(...list[best]) / Math.max(1, luminance(...list[main]));
  if (ratio <= 1) return target.map((v) => clamp(v * ratio));
  return mix(target, [255, 255, 255], Math.min(0.55, (ratio - 1) * 0.6));
}

// Hair and the beard take the same additive dye as gear where a part has no shade table. There used to be a step here that pulled
// the drawing's contrast in toward its middle first, because under the old ratio dye a dark strand
// times a pale target came out olive; the additive dye carries a strand's darkness as the same
// step below the target that it was below the drawn mid-tone, so blond reads as blond with its
// strands intact, and compressing on top of that only flattened the beard into a beige patch.
export function dyeDrawn(rgb, base, target) {
  return tintPixel(rgb, base, target);
}

// How much of a pixel is the artist's keyline, and so is kept as drawn whatever part it is in.
//
// The part mask says what a pixel is *of*; it does not say that it is the drawing's own black.
// The masks are settled at working size, where his eye is a block of near-black inside the face
// and its cell averages to brown, so the eye comes out labelled hair, and the seams inside a
// garment, the lines the artist drew across his beard and the nostrils on his face all carry the
// label of whatever they are drawn on. Every dye above keeps a pixel's step below its part's
// mid-tone, which is right for shading and wrong for a line: a pixel a hundred steps below a
// cream cap is black, and a hundred steps below a white one is grey, so a white cap came out
// with grey seams and blond hair with blond eyes. A pixel artist recolouring a sprite swaps every
// entry in its palette but one: the line stays black. So does it here — fully where the pixel is
// the line's own colour, and by a fading share through the few steps of softening the render put
// around every line, where a pixel is part line and part whatever it lies against.
//
// The line on this sheet is black outright and the masks label it outline, so the hold only has
// to catch the softened ring round it; the beard's darkest shade sits at a brightness of 30, and
// a hold that faded out at 36 kept it brown inside a grey beard.
export const KEYLINE_HOLD = 8;
export const KEYLINE_FADE = 20;
export function keylineHold(rgb) {
  return Math.max(0, Math.min(1, (KEYLINE_FADE - luminance(...rgb)) / (KEYLINE_FADE - KEYLINE_HOLD)));
}

// Recolour a strip in place. `pixels` is RGBA from the strip, `mask` is RGBA from the matching
// part mask — only its red channel is read, and it is the part id.
export function paintPixels({ pixels, mask, width, height, palette }) {
  for (let i = 0; i < width * height; i += 1) {
    if (!pixels[i * 4 + 3]) continue;
    const part = mask[i * 4];
    if (!part || part === PART.outline) continue;
    const rgb = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
    const hold = keylineHold(rgb);
    if (hold >= 1) continue;
    let out = null;
    if (part === PART.skin) {
      if (palette.skinRamp) out = shiftPixel(rgb, SKIN_BODY, palette.skinRamp);
    } else {
      const target = palette.targets[part];
      if (target) out = PART_SHADES[part] ? swapShade(rgb, PART_SHADES[part], target) : part === PART.hair ? dyeDrawn(rgb, PART_BASE[part], target) : tintPixel(rgb, PART_BASE[part], target);
    }
    if (!out) continue;
    if (hold > 0) out = mix(out, rgb, hold);
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

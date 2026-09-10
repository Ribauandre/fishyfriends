// Dresses the angler at runtime. The strips in assets/angler are the ChatGPT-drawn character
// as he comes (cap, full beard); for a look each strip goes through a canvas where masked
// parts are dyed (`paintPixels`, pure, tested on plain arrays) — skin, the beard to the hair
// colour or into jaw, the cap to a colour or into hair, waders, boots, rod — and drawings
// from assets/angler/parts are composited on the head at every frame's anchors
// (utils/anglerAnchors.json: the cap's, beard's and face's boxes, found from the mask offline
// by scripts/anglerMasks.mjs). Results are data URLs per action, cached by look. Where there
// is no canvas (jsdom, ancient browsers) `renderAngler` resolves null and the stock strips
// show.
import { ANGLER_SPRITES, SPRITE_FRAME } from './anglerSprites';
import anchors from './anglerAnchors.json';
import { PART, PART_BASE, HAIR_ART_BASE, paletteFor, lookKey, isDefaultLook } from './anglerLook';
import idleMask from '../assets/angler/masks/idle.png';
import castMask from '../assets/angler/masks/cast.png';
import reelMask from '../assets/angler/masks/reel.png';
import fishonMask from '../assets/angler/masks/fishon.png';
import celebrateMask from '../assets/angler/masks/celebrate.png';
import bucket from '../assets/angler/parts/bucket.png';
import beanie from '../assets/angler/parts/beanie.png';
import straw from '../assets/angler/parts/straw.png';
import visor from '../assets/angler/parts/visor.png';
import cowboy from '../assets/angler/parts/cowboy.png';
import hairShort from '../assets/angler/parts/hair_short.png';
import hairLong from '../assets/angler/parts/hair_long.png';
import beardGoatee from '../assets/angler/parts/beard_goatee.png';
import beardMustache from '../assets/angler/parts/beard_mustache.png';

const MASKS = { idle: idleMask, cast: castMask, reel: reelMask, fishon: fishonMask, celebrate: celebrateMask };
export const PART_ART = { bucket, beanie, straw, visor, cowboy, hair_short: hairShort, hair_long: hairLong, beard_goatee: beardGoatee, beard_mustache: beardMustache };

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Retint one pixel: keep how light or dark it was relative to the part's painted mid-tone
// and reapply that shading to the target colour, so highlights and folds survive the dye.
export function tintPixel(rgb, base, target) {
  const shade = Math.max(0.3, Math.min(1.7, luminance(...rgb) / luminance(...base)));
  return [clamp(target[0] * shade), clamp(target[1] * shade), clamp(target[2] * shade)];
}

// A beard pixel turned into jaw: mostly flat skin, a touch darker than the cheek, with only
// a hint of the beard's shading so it doesn't read as a sticker.
export function jawPixel(rgb, skin) {
  const ratio = luminance(...rgb) / luminance(...PART_BASE[PART.beard]);
  const shade = 0.92 * Math.max(0.8, Math.min(1.05, 0.85 + 0.15 * ratio));
  return [clamp(skin[0] * shade), clamp(skin[1] * shade), clamp(skin[2] * shade)];
}

const frameOf = (x, frameWidth) => Math.floor(x / frameWidth);

// Dye a strip in place. `pixels` is the strip's RGBA, `mask` the matching mask's RGBA (red =
// part id), `anchors` the per-frame boxes. The art's beard becomes jaw unless the look keeps
// it; with no hat at all the cap's brim (the cap past the face) is erased; stubble dithers
// the jaw with a hair-and-skin mix.
export function paintPixels({ pixels, mask, width, height, frameWidth, anchors: frameAnchors = [], palette }) {
  const { targets, skin, hair } = palette;
  const keepBeard = targets[PART.beard] !== skin;
  const stubble = palette.stubble ? [Math.round((skin[0] * 0.8 + hair[0]) / 2), Math.round((skin[1] * 0.8 + hair[1]) / 2), Math.round((skin[2] * 0.8 + hair[2]) / 2)] : null;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] === 0) continue;
      const part = mask[i];
      if (!part) continue;
      const frame = frameAnchors[frameOf(x, frameWidth)];
      const fx = x - frameOf(x, frameWidth) * frameWidth;
      if (palette.bareHead && (part === PART.hat || part === PART.panel) && frame?.face && frame?.hat) {
        // The brim: cap pixels past the face, below the crown — only where the face is actually
        // showing (a back view keeps its whole cap as the back of the head).
        const faceShowing = frame.face.x1 - frame.face.x0 >= (frame.hat.x1 - frame.hat.x0) * 0.3;
        if (faceShowing && fx > frame.face.x1 - 1 && y > frame.hat.y0 + (frame.hat.y1 - frame.hat.y0) * 0.4) { pixels[i + 3] = 0; continue; }
      }
      if (part === PART.beard && !keepBeard) {
        const out = jawPixel([pixels[i], pixels[i + 1], pixels[i + 2]], skin);
        pixels[i] = out[0]; pixels[i + 1] = out[1]; pixels[i + 2] = out[2];
        if (stubble && (x + y) % 2 === 0) { pixels[i] = stubble[0]; pixels[i + 1] = stubble[1]; pixels[i + 2] = stubble[2]; }
        continue;
      }
      const target = targets[part];
      if (!target) continue;
      const out = tintPixel([pixels[i], pixels[i + 1], pixels[i + 2]], PART_BASE[part], target);
      pixels[i] = out[0]; pixels[i + 1] = out[1]; pixels[i + 2] = out[2];
    }
  }
  return pixels;
}

// Where a drawing goes on a frame, as fractions of the box it's placed on (the cap's box
// for hats and hair, the beard's box for facial hair): its width relative to the box, how
// far its centre sits forward of the box's centre, and where its bottom or top lands.
// `aspect` is the drawing's width / height. Coordinates are frame pixels: { x, y, w, h }.
export const PLACEMENTS = {
  hat: { on: 'hat', w: 1.36, cx: 0.03, bottom: 0.98 },
  visor: { on: 'hat', w: 1.1, cx: 0.1, bottom: 1.02 },
  hair_short: { on: 'hat', w: 1.3, cx: 0.02, bottom: 1.14 },
  hair_long: { on: 'hat', w: 1.0, cx: -0.18, top: 0.35 },
  beard_goatee: { on: 'beard', w: 0.72, cx: 0.14, top: 0.15 },
  beard_mustache: { on: 'beard', w: 0.66, cx: 0.16, top: -0.08 },
};
export function placeOn(frame, kind, aspect = 1) {
  const rule = PLACEMENTS[kind];
  const box = frame?.[rule.on];
  if (!box) return null;
  const boxW = box.x1 - box.x0 + 1;
  const boxH = box.y1 - box.y0 + 1;
  const w = boxW * rule.w;
  const h = w / aspect;
  const cx = box.x0 + boxW / 2 + boxW * rule.cx;
  const y = rule.bottom !== undefined ? box.y0 + boxH * rule.bottom - h : box.y0 + boxH * rule.top;
  return { x: cx - w / 2, y, w, h };
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

// A hair or beard drawing dyed to the look's hair colour, keeping its own shading.
function dyed(img, target) {
  const { canvas, ctx } = canvasFor(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, img.width, img.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const out = tintPixel([d[i], d[i + 1], d[i + 2]], HAIR_ART_BASE, target);
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function partsFor(palette) {
  const want = [];
  if (palette.hairCrown) want.push(['crown', palette.hairCrown, true]);
  if (palette.hairBack) want.push(['back', palette.hairBack, true]);
  if (palette.beardOverlay) want.push(['beard', palette.beardOverlay, true]);
  if (palette.hatOverlay) want.push(['hat', palette.hatOverlay, false]);
  const entries = await Promise.all(want.map(async ([slot, name, dye]) => {
    const img = await loadImage(PART_ART[name]);
    return [slot, { image: dye ? dyed(img, palette.hair) : img, kind: name === 'visor' ? 'visor' : PLACEMENTS[name] ? name : 'hat' }];
  }));
  return Object.fromEntries(entries);
}

function drawPart(ctx, part, frame, offsetX) {
  if (!part) return;
  const box = placeOn(frame, part.kind, part.image.width / part.image.height);
  if (box) ctx.drawImage(part.image, offsetX + box.x, box.y, box.w, box.h);
}

// Paint one action's strip for a palette: dye the art, then dress every frame.
async function paintStrip(action, palette, parts) {
  const [art, maskArt] = await Promise.all([loadImage(ANGLER_SPRITES[action].src), loadImage(MASKS[action])]);
  const { width, height } = art;
  const main = canvasFor(width, height);
  const maskCanvas = canvasFor(width, height);
  const base = canvasFor(width, height);
  base.ctx.drawImage(art, 0, 0);
  maskCanvas.ctx.drawImage(maskArt, 0, 0);
  const image = base.ctx.getImageData(0, 0, width, height);
  const mask = maskCanvas.ctx.getImageData(0, 0, width, height).data;
  const frameAnchors = anchors[action] || [];
  paintPixels({ pixels: image.data, mask, width, height, frameWidth: SPRITE_FRAME.w, anchors: frameAnchors, palette });
  base.ctx.putImageData(image, 0, 0);
  main.ctx.imageSmoothingEnabled = true;
  main.ctx.imageSmoothingQuality = 'high';
  // Behind the body, the body, then what sits on the head.
  frameAnchors.forEach((frame, index) => drawPart(main.ctx, parts.back, frame, index * SPRITE_FRAME.w));
  main.ctx.drawImage(base.canvas, 0, 0);
  frameAnchors.forEach((frame, index) => {
    const offset = index * SPRITE_FRAME.w;
    drawPart(main.ctx, parts.crown, frame, offset);
    drawPart(main.ctx, parts.beard, frame, offset);
    drawPart(main.ctx, parts.hat, frame, offset);
  });
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
      const parts = await partsFor(palette);
      const sheets = {};
      for (const action of Object.keys(ANGLER_SPRITES)) sheets[action] = (await paintStrip(action, palette, parts)).toDataURL('image/png');
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
      const palette = paletteFor(look);
      const parts = await partsFor(palette);
      const strip = await paintStrip('idle', palette, parts);
      const still = canvasFor(SPRITE_FRAME.w, SPRITE_FRAME.h);
      still.ctx.drawImage(strip, 0, 0, SPRITE_FRAME.w, SPRITE_FRAME.h, 0, 0, SPRITE_FRAME.w, SPRITE_FRAME.h);
      return still.canvas.toDataURL('image/png');
    })().catch(() => null);
    stillCache.set(key, job);
  }
  return stillCache.get(key);
}

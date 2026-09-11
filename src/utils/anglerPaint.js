// Dresses the angler at runtime. The strips in assets/angler are the ChatGPT-drawn character
// as he comes — bald, clean-shaven, pale shirt, olive waders — and for a look each strip goes
// through a canvas where `paintPixels` (pure, tested on plain arrays) does three things.
//
// Parts that keep their shape are dyed: skin, shirt, waders, boots and rod, luminance-
// preserving, so the artist's shading survives. The beard, the hat and the hair are *drawn art
// stamped on*, not shapes the painter invents — inventing them was what looked sloppy. The beard
// overlays in assets/angler/beard are the artist's own beard, lifted pose by pose off the
// dressed sheet by scripts/anglerBeard.mjs, and they sit pixel-for-pixel on the strip they
// belong to, so there is nothing to place: a style is a mask over them and the hair colour is a
// dye. The hats in assets/angler/hats.png are twenty drawn hats, each already shrunk to the
// width it is worn at, and each carries one anchor row — the peak, band or brim that lies on a
// head — so stamping one is a scale by the frame's own head and a single row to line up.
//
// Hair is the same again: eight drawn hairpieces in assets/angler/hair.png, dyed to the chosen
// colour. Nothing on this character is invented any more — every cosmetic is a drawing, and the
// painter only dyes and places. Results are data URLs per action, cached by look. Where there is no canvas (jsdom, ancient
// browsers) `renderAngler` resolves null and the stock strips show.
import { ANGLER_SPRITES, SPRITE_FRAME } from './anglerSprites';
import anchors from './anglerAnchors.json';
import hatAnchors from './hatAnchors.json';
import hatSprites from './hatSprites.json';
import hairSprites from './hairSprites.json';
import { PART_BASE, BEARD_BASE, HAIR_BASE, paletteFor, lookKey, isDefaultLook } from './anglerLook';
import idleMask from '../assets/angler/masks/idle.png';
import castMask from '../assets/angler/masks/cast.png';
import reelMask from '../assets/angler/masks/reel.png';
import celebrateMask from '../assets/angler/masks/celebrate.png';
import hurtMask from '../assets/angler/masks/hurt.png';
import idleBeard from '../assets/angler/beard/idle.png';
import castBeard from '../assets/angler/beard/cast.png';
import reelBeard from '../assets/angler/beard/reel.png';
import celebrateBeard from '../assets/angler/beard/celebrate.png';
import hurtBeard from '../assets/angler/beard/hurt.png';
import hatSheet from '../assets/angler/hats.png';
import hairSheet from '../assets/angler/hair.png';

const MASKS = { idle: idleMask, cast: castMask, reel: reelMask, celebrate: celebrateMask, hurt: hurtMask };
// One set of per-frame anchors: the head box and facing from the mask tool, and the row and
// centre the artist's own cap sat on from the dressed sheet.
const FRAMES = Object.fromEntries(Object.entries(anchors).map(([action, list]) => [action, list.map((frame, f) => ({ ...frame, hatAnchor: (hatAnchors[action] || [])[f] || null }))]));
const BEARDS = { idle: idleBeard, cast: castBeard, reel: reelBeard, celebrate: celebrateBeard, hurt: hurtBeard };

// Where the mouth falls down the head, from the crown to the chin: the landmark the cut-down
// beards are measured against. The full beard needs none, being the drawing as the artist left
// it, and neither does a hat — the dressed sheet says where one sits, frame by frame.
const MOUTH = 0.84;
// Only for a frame the dressed sheet has no cap in. A fraction of the head cannot know that it
// is tipped forward in one pose and thrown back in another, which is why it is the fallback.
const HAT_SEAT = 0.32;

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
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

// ---- Dressing one frame's head ----

function dressHead({ pixels, mask, width, height, x0, x1, frame, palette, beard, hats, hairArt }) {
  const plan = palette.head;
  if (!frame || !frame.head) return;
  // The anchors are in the frame's own pixels; the strip's start puts them in the strip's.
  const head = { ...frame.head, x0: frame.head.x0 + x0, x1: frame.head.x1 + x0 };
  const facing = frame.facing || 'front';
  const dir = facing === 'right' ? 1 : facing === 'left' ? -1 : 0;
  const { skin, hair } = palette;
  const headW = head.x1 - head.x0 + 1;
  const headH = head.y1 - head.y0 + 1;
  const mouthY = head.y0 + headH * MOUTH;

  const inside = (x, y) => x >= x0 && x < x1 && y >= 0 && y < height;
  const at = (x, y) => (y * width + x) * 4;
  const put = (x, y, rgb) => { if (!inside(x, y)) return; const i = at(x, y); pixels[i] = rgb[0]; pixels[i + 1] = rgb[1]; pixels[i + 2] = rgb[2]; pixels[i + 3] = 255; };

  // Anything worn on the head is a drawing stamped on: scaled by this frame's own head, hung
  // on the row and centre the artist's cap sat on, and dyed if the item asks for it.
  const stamp = (sheet, sprite, base, tint) => {
    const { cellW, cellH, anchorY, refHead } = sheet;
    const column = sheet.index[sprite];
    if (column === undefined) return;
    const scale = headW / refHead;
    // A hat hangs off the row the artist's own cap sat on, which is the one thing in this
    // pipeline that knows the head is tipped forward in one pose and thrown back in another.
    // A hairpiece is the top of the head rather than something worn on it, so its own crown
    // goes on the skull's, a shade above.
    const seat = sheet.anchor === 'top'
      ? { cx: (head.x0 + head.x1) / 2 + dir * headW * 0.06, y: head.y0 - 2 * scale }
      : frame.hatAnchor
        ? { cx: frame.hatAnchor.cx + x0, y: frame.hatAnchor.y }
        : { cx: (head.x0 + head.x1) / 2 + dir * headW * 0.06, y: head.y0 + headH * HAT_SEAT };
    const left = Math.round(seat.cx - (cellW * scale) / 2);
    const top = Math.round(seat.y - anchorY * scale);
    for (let y = 0; y < Math.round(cellH * scale); y += 1) for (let x = 0; x < Math.round(cellW * scale); x += 1) {
      const sx = column * cellW + Math.min(cellW - 1, Math.floor(x / scale));
      const sy = Math.min(cellH - 1, Math.floor(y / scale));
      const s = (sy * sheet.width + sx) * 4;
      if (!sheet.data[s + 3]) continue;
      const own = [sheet.data[s], sheet.data[s + 1], sheet.data[s + 2]];
      put(left + x, top + y, tint && luminance(...own) >= 40 ? tintPixel(own, base, tint) : own);
    }
  };

  // ---- the beard: the artist's own, masked to a style and dyed ----
  const style = plan.beard;
  if (beard && style.keep !== 'none') {
    const stubble = mix(skin, hair, 0.5);
    for (let y = 0; y < height; y += 1) for (let x = x0; x < x1; x += 1) {
      const i = at(x, y);
      if (!beard[i + 3]) continue;
      const t = frontness(x, head, facing);
      // A full beard keeps the artist's whole shape, spill onto the collar and all. The cut-down
      // styles are a window on it, and are held to the head so they cannot leave a patch of
      // stubble or a stray goatee pixel down on the chest.
      if (style.keep !== 'all' && y > head.y1 + headH * 0.2) continue;
      if (style.keep === 'chin' && !(y > mouthY && t > 0.55)) continue;
      if (style.keep === 'lip' && !(y > mouthY - 5 && y < mouthY + 1 && t > 0.55)) continue;
      if (style.dither && (x + y) % 2 === 0) continue;
      const own = [beard[i], beard[i + 1], beard[i + 2]];
      // Line work the beard brought with it stays line work; the rest takes the hair colour.
      if (luminance(...own) < 40) { put(x, y, own); continue; }
      const dyed = tintPixel(own, BEARD_BASE, hair);
      // Stubble is the same beard thinned to every other pixel and let down into the skin
      // under it, so it reads as a shadow on the jaw rather than a mesh laid over it.
      put(x, y, style.dither ? mix([pixels[i], pixels[i + 1], pixels[i + 2]], mix(stubble, dyed, 0.5), 0.55) : dyed);
    }
  }

  // ---- what is worn on the head: hair first, then the hat over it ----
  if (hairArt && plan.hair) stamp(hairArt, plan.hair.sprite, HAIR_BASE, palette.hair);
  if (hats && plan.hat) stamp(hats, plan.hat.sprite, plan.hat.base, plan.hat.tint);
}

// Dye a strip in place, then dress every frame's head. `pixels` is the strip's RGBA, `mask` the
// matching mask's RGBA (red = part id), `beard` the matching beard overlay's RGBA, `hats` the
// hat sheet with its manifest, `anchors` the per-frame boxes.
export function paintPixels({ pixels, mask, width, height, frameWidth, anchors: frameAnchors = [], palette, beard = null, hats = null, hairArt = null }) {
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
    dressHead({ pixels, mask, width, height, x0: f * frameWidth, x1: Math.min(width, (f + 1) * frameWidth), frame: frameAnchors[f], palette, beard, hats, hairArt });
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

const wearables = new Map();
function loadWearable(src, manifest) {
  if (!wearables.has(src)) wearables.set(src, pixelsOf(src).then((art) => ({ ...art, ...manifest, index: Object.fromEntries(manifest.order.map((key, i) => [key, i])) })));
  return wearables.get(src);
}

// Paint one action's strip for a palette.
async function paintStrip(action, palette) {
  const [art, mask, beard, hats, hairArt] = await Promise.all([loadImage(ANGLER_SPRITES[action].src), pixelsOf(MASKS[action]), pixelsOf(BEARDS[action]), loadWearable(hatSheet, hatSprites), loadWearable(hairSheet, hairSprites)]);
  const { width, height } = art;
  const main = canvasFor(width, height);
  main.ctx.drawImage(art, 0, 0);
  const image = main.ctx.getImageData(0, 0, width, height);
  paintPixels({ pixels: image.data, mask: mask.data, width, height, frameWidth: SPRITE_FRAME.w, anchors: FRAMES[action] || [], palette, beard: beard.data, hats, hairArt });
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

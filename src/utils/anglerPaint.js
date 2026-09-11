// Dresses the angler at runtime. The strips in assets/angler are the ChatGPT-drawn character
// as he comes — bald, clean-shaven, pale shirt, olive waders — and for a look each strip goes
// through a canvas where `paintPixels` (pure, tested on plain arrays) does three things.
//
// Parts that keep their shape are dyed: skin, shirt, waders, boots and rod, luminance-
// preserving, so the artist's shading survives. The beard and the hat are *drawn art stamped
// on*, not shapes the painter invents — inventing them was what looked sloppy. The beard
// overlays in assets/angler/beard are the artist's own beard, lifted pose by pose off the
// dressed sheet by scripts/anglerBeard.mjs, and they sit pixel-for-pixel on the strip they
// belong to, so there is nothing to place: a style is a mask over them and the hair colour is a
// dye. The hats in assets/angler/hats.png are twenty drawn hats, each already shrunk to the
// width it is worn at, and each carries one anchor row — the peak, band or brim that lies on a
// head — so stamping one is a scale by the frame's own head and a single row to line up.
//
// Only the hair is still built by hand, since no sheet draws any: it is laid over the top of
// the skull following the silhouette the art gives, deeper round the back than at the forehead.
// Results are data URLs per action, cached by look. Where there is no canvas (jsdom, ancient
// browsers) `renderAngler` resolves null and the stock strips show.
import { ANGLER_SPRITES, SPRITE_FRAME } from './anglerSprites';
import anchors from './anglerAnchors.json';
import hatSprites from './hatSprites.json';
import { PART, PART_BASE, BEARD_BASE, paletteFor, lookKey, isDefaultLook } from './anglerLook';
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

const MASKS = { idle: idleMask, cast: castMask, reel: reelMask, celebrate: celebrateMask, hurt: hurtMask };
const BEARDS = { idle: idleBeard, cast: castBeard, reel: reelBeard, celebrate: celebrateBeard, hurt: hurtBeard };

// The art's line colour, drawn back around the hair.
export const OUTLINE = [16, 15, 14];

// Where things sit on the head, as fractions of it from the crown down to the chin. The sheet
// draws the same head in every pose, only tilted, so these hold whichever way it is turned:
// the mouth low, and a hat's anchor row — the peak, band or brim that lies on the head — just
// above the eyes. They are what the cut-down beards are measured against; the full beard needs
// no landmark at all, since it is the drawing as the artist left it.
const MOUTH = 0.84;
const HAT_SEAT = 0.5;

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

// ---- Dressing one frame's head ----

function dressHead({ pixels, mask, width, height, x0, x1, frame, palette, beard, hats }) {
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
  const partAt = (x, y) => (inside(x, y) ? mask[at(x, y)] : 0);
  const alphaAt = (x, y) => (inside(x, y) ? pixels[at(x, y) + 3] : 0);
  const put = (x, y, rgb) => { if (!inside(x, y)) return; const i = at(x, y); pixels[i] = rgb[0]; pixels[i + 1] = rgb[1]; pixels[i + 2] = rgb[2]; pixels[i + 3] = 255; };
  const key = (x, y) => y * width + x;
  const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ---- hair, laid over the top of the skull ----
  if (plan.crown === 'hair') {
    const inBox = (x, y) => x >= head.x0 && x <= head.x1 && y >= head.y0 && y <= head.y1;
    const isHead = (x, y) => inBox(x, y) && alphaAt(x, y) > 0 && (partAt(x, y) === PART.skin || partAt(x, y) === PART.outline);
    const tops = new Map();
    for (let x = head.x0; x <= head.x1; x += 1) {
      for (let y = head.y0; y <= head.y1; y += 1) if (isHead(x, y)) { tops.set(x, y); break; }
    }
    const crown = new Set();
    const rows = new Map();
    tops.forEach((top, x) => {
      // A hairline runs deep round the back of the head and shallow at the forehead.
      const reach = plan.hairDepth * (1 + 0.3 * (1 - frontness(x, head, facing)));
      for (let y = top; y <= head.y0 + headH * reach; y += 1) {
        if (!inside(x, y) || partAt(x, y) !== PART.skin) continue;
        crown.add(key(x, y));
        const row = rows.get(y) || [Infinity, -Infinity];
        rows.set(y, [Math.min(row[0], x), Math.max(row[1], x)]);
      }
    });
    let top = Infinity; let bottom = -Infinity;
    rows.forEach((_, y) => { top = Math.min(top, y); bottom = Math.max(bottom, y); });
    const span = bottom - top + 1;
    crown.forEach((k) => {
      const y = Math.floor(k / width); const x = k - y * width;
      const [rx0, rx1] = rows.get(y);
      const u = rx1 > rx0 ? (2 * (x - rx0)) / (rx1 - rx0) - 1 : 0;
      put(x, y, shaded(hair, domeShade(u, (y - top) / Math.max(1, span), dir) * 1.02));
    });

    // Long hair, down the back of the neck: only the open air behind the head is filled, and
    // it tapers away from the head as it falls.
    const fall = new Set();
    if (plan.hairBack && crown.size) {
      const yTop = top + Math.round(headH * 0.35);
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

    // The line: round anything standing against the open air; where hair meets the face it is
    // a darker row rather than a line, the way the art shades.
    const drawn = new Set([...crown, ...fall]);
    drawn.forEach((k) => {
      const y = Math.floor(k / width); const x = k - y * width;
      let edge = false; let onFace = false;
      NEIGHBOURS.forEach(([dx, dy]) => {
        if (drawn.has(key(x + dx, y + dy))) return;
        if (alphaAt(x + dx, y + dy) === 0) edge = true; else onFace = true;
      });
      if (edge) put(x, y, OUTLINE);
      else if (onFace) { const i = at(x, y); put(x, y, shaded([pixels[i], pixels[i + 1], pixels[i + 2]], 0.74)); }
    });
  }

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

  // ---- the hat: a drawn one, scaled by this frame's head and hung on its anchor row ----
  if (hats && plan.hat) {
    const { cellW, cellH, anchorY, refHead } = hats;
    const column = hats.index[plan.hat.sprite];
    if (column === undefined) return;
    const scale = headW / refHead;
    const left = Math.round((head.x0 + head.x1) / 2 + dir * headW * 0.06 - (cellW * scale) / 2);
    const top = Math.round(head.y0 + headH * HAT_SEAT - anchorY * scale);
    for (let y = 0; y < Math.round(cellH * scale); y += 1) for (let x = 0; x < Math.round(cellW * scale); x += 1) {
      const sx = column * cellW + Math.min(cellW - 1, Math.floor(x / scale));
      const sy = Math.min(cellH - 1, Math.floor(y / scale));
      const s = (sy * hats.width + sx) * 4;
      if (!hats.data[s + 3]) continue;
      const own = [hats.data[s], hats.data[s + 1], hats.data[s + 2]];
      put(left + x, top + y, plan.hat.tint && luminance(...own) >= 40 ? tintPixel(own, plan.hat.base, plan.hat.tint) : own);
    }
  }
}

// Dye a strip in place, then dress every frame's head. `pixels` is the strip's RGBA, `mask` the
// matching mask's RGBA (red = part id), `beard` the matching beard overlay's RGBA, `hats` the
// hat sheet with its manifest, `anchors` the per-frame boxes.
export function paintPixels({ pixels, mask, width, height, frameWidth, anchors: frameAnchors = [], palette, beard = null, hats = null }) {
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
    dressHead({ pixels, mask, width, height, x0: f * frameWidth, x1: Math.min(width, (f + 1) * frameWidth), frame: frameAnchors[f], palette, beard, hats });
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

let hatArt = null;
function loadHats() {
  if (!hatArt) hatArt = pixelsOf(hatSheet).then((art) => ({ ...art, ...hatSprites, index: Object.fromEntries(hatSprites.order.map((key, i) => [key, i])) }));
  return hatArt;
}

// Paint one action's strip for a palette.
async function paintStrip(action, palette) {
  const [art, mask, beard, hats] = await Promise.all([loadImage(ANGLER_SPRITES[action].src), pixelsOf(MASKS[action]), pixelsOf(BEARDS[action]), loadHats()]);
  const { width, height } = art;
  const main = canvasFor(width, height);
  main.ctx.drawImage(art, 0, 0);
  const image = main.ctx.getImageData(0, 0, width, height);
  paintPixels({ pixels: image.data, mask: mask.data, width, height, frameWidth: SPRITE_FRAME.w, anchors: anchors[action] || [], palette, beard: beard.data, hats });
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

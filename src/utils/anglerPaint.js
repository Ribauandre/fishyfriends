// Turns a look (utils/anglerLook.js) into recoloured sprite strips at runtime: each strip and
// its part mask go through a canvas, paintPixels dyes the parts, an overlay hat is drawn on the
// head at every frame's anchor, and the result is a data URL per action, cached by look. Where
// there is no canvas (tests, ancient browsers) it resolves to null and the original art is used.
import { ANGLER_SPRITES } from './anglerSprites';
import anchors from './anglerAnchors.json';
import { WARDROBE, lookKey, isDefaultLook, normalizeLook, paintPixels, hatPlacement } from './anglerLook';
import idleMask from '../assets/angler/masks/idle.png';
import castMask from '../assets/angler/masks/cast.png';
import reelMask from '../assets/angler/masks/reel.png';
import fishonMask from '../assets/angler/masks/fishon.png';
import celebrateMask from '../assets/angler/masks/celebrate.png';
import bucket from '../assets/angler/hats/bucket.png';
import beanie from '../assets/angler/hats/beanie.png';
import cowboy from '../assets/angler/hats/cowboy.png';
import visor from '../assets/angler/hats/visor.png';
import straw from '../assets/angler/hats/straw.png';

const MASKS = { idle: idleMask, cast: castMask, reel: reelMask, fishon: fishonMask, celebrate: celebrateMask };
export const HAT_ART = { bucket, beanie, cowboy, visor, straw };
const FRAME_W = 250;
const cache = new Map();

function canvasFor(width, height) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  } catch (error) { return null; }
}

export function canPaint() {
  return typeof document !== 'undefined' && typeof Image !== 'undefined' && Boolean(canvasFor(1, 1));
}

const loadImage = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });

// Resolves to { idle, cast, reel, fishon, celebrate } data URLs, or null for the stock look.
export function paintAngler(look) {
  if (!look || isDefaultLook(look) || !canPaint()) return Promise.resolve(null);
  const key = lookKey(look);
  if (cache.has(key)) return cache.get(key);
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  const hat = WARDROBE[safe.hat];
  const job = (async () => {
    const overlay = hat.overlay ? await loadImage(HAT_ART[hat.overlay]) : null;
    const sheets = {};
    for (const [action, sprite] of Object.entries(ANGLER_SPRITES)) {
      const [art, maskArt] = await Promise.all([loadImage(sprite.src), loadImage(MASKS[action])]);
      const { width, height } = art;
      const main = canvasFor(width, height);
      const maskCanvas = canvasFor(width, height);
      if (!main || !maskCanvas) return null;
      main.ctx.drawImage(art, 0, 0);
      maskCanvas.ctx.drawImage(maskArt, 0, 0);
      const image = main.ctx.getImageData(0, 0, width, height);
      const mask = maskCanvas.ctx.getImageData(0, 0, width, height).data;
      paintPixels({ pixels: image.data, mask, width, height, frameWidth: FRAME_W, anchors: anchors[action], look: safe });
      main.ctx.putImageData(image, 0, 0);
      if (overlay) {
        main.ctx.imageSmoothingEnabled = true;
        main.ctx.imageSmoothingQuality = 'high';
        (anchors[action] || []).forEach((frameAnchor, frame) => {
          const box = hatPlacement(frameAnchor.hat, overlay.width / overlay.height);
          if (box) main.ctx.drawImage(overlay, frame * FRAME_W + box.x, box.y, box.w, box.h);
        });
      }
      sheets[action] = main.canvas.toDataURL('image/png');
    }
    return sheets;
  })().catch(() => null);
  cache.set(key, job);
  return job;
}

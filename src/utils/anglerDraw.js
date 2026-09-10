// Renders the rigged angler (utils/anglerRig.js) in a look (utils/anglerLook.js) as pixel art.
//
// Every frame is drawn part by part into its own native-resolution layer — back arm, pack,
// legs, torso, head, facial hair, hat, rod, front arm — and each layer is snapped (alpha
// thresholded, so curves and rotated limbs come out as crisp pixels) and given a one-pixel
// dark outline before it lands on the frame. Outlining per layer is what draws the seams
// between a hand and a sleeve or a hat and a head, and it's why a hat or a beard is simply
// another shape rather than a mask over a painting. The finished frames are scaled up SCALE×
// with no smoothing into one strip per action, exactly the strips the stage animates.
//
// The drawing only uses fillRect, paths, arcs and strokes, so a fake context can record it
// in tests; `finishPixels` is the pure snap-and-outline pass. Where there is no canvas at all
// (jsdom) `renderAngler` resolves null and the stock strips in assets/angler — which are this
// renderer's own output for the default look, written by scripts/renderAnglerSheets.mjs —
// show instead.
import { NATIVE, SCALE, FRAME_COUNTS, HELD_FRAME, HIP_Y, LEGS, framesFor } from './anglerRig.js';
import { paletteFor, lookKey } from './anglerLook.js';

const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

function rect(ctx, x, y, w, h, c) { ctx.fillStyle = css(c); ctx.fillRect(x, y, w, h); }
function px(ctx, x, y, c) { rect(ctx, x, y, 1, 1, c); }
function poly(ctx, points, c) {
  ctx.fillStyle = css(c);
  ctx.beginPath();
  points.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
function rrect(ctx, x, y, w, h, r, c) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.fillStyle = css(c);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arc(x + w - rad, y + rad, rad, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arc(x + w - rad, y + h - rad, rad, 0, Math.PI / 2);
  ctx.lineTo(x + rad, y + h);
  ctx.arc(x + rad, y + h - rad, rad, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rad);
  ctx.arc(x + rad, y + rad, rad, Math.PI, Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();
}
function disc(ctx, cx, cy, r, c) { ctx.fillStyle = css(c); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.fill(); }
function ellipse(ctx, cx, cy, rx, ry, c) { ctx.fillStyle = css(c); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.closePath(); ctx.fill(); }
function line(ctx, a, b, width, c) {
  ctx.strokeStyle = css(c); ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function curve(ctx, a, control, b, width, c) {
  ctx.strokeStyle = css(c); ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(control.x, control.y, b.x, b.y); ctx.stroke();
}

// ---- Parts ----

function drawArm(ctx, arm, shoulder, pal) {
  line(ctx, shoulder, arm.elbow, 8, pal.jacket.base);
  line(ctx, arm.elbow, arm.hand, 7, pal.jacket.base);
  // The cuff, then a dark ring so the hand reads as a hand and not the end of the sleeve.
  const dx = arm.hand.x - arm.elbow.x; const dy = arm.hand.y - arm.elbow.y; const len = Math.hypot(dx, dy) || 1;
  const cuff = { x: arm.hand.x - (dx / len) * 4, y: arm.hand.y - (dy / len) * 4 };
  line(ctx, cuff, arm.hand, 7, pal.jacket.shade);
  disc(ctx, arm.hand.x, arm.hand.y, 5.5, pal.outline);
  disc(ctx, arm.hand.x, arm.hand.y, 4.5, pal.skin.base);
  rect(ctx, Math.round(arm.hand.x) - 2, Math.round(arm.hand.y) - 3, 2, 1, pal.skin.light);
}

function drawRod(ctx, rod, pal) {
  line(ctx, rod.butt, rod.grip, 3.5, pal.cork.base);
  curve(ctx, rod.grip, rod.control, rod.tip, 2.5, pal.rod.base);
  curve(ctx, rod.grip, rod.control, rod.tip, 1, pal.rod.light);
  disc(ctx, rod.reel.x, rod.reel.y, 3.5, pal.reel.base);
  disc(ctx, rod.reel.x, rod.reel.y, 1.2, pal.reel.light);
  if (rod.crank != null) {
    const handle = { x: rod.reel.x + Math.cos((rod.crank * Math.PI) / 180) * 4, y: rod.reel.y + Math.sin((rod.crank * Math.PI) / 180) * 4 };
    line(ctx, rod.reel, handle, 1.2, pal.reel.light);
  }
}

function drawLeg(ctx, x, top, bottom, toe, pal) {
  const w = LEGS.w;
  const cuff = bottom - 10;
  rect(ctx, x, top, w, cuff - top + 2, pal.waders.base);
  rect(ctx, x, top, 4, cuff - top + 2, pal.waders.shade);
  rect(ctx, x + 4, top + 14, w - 4, 1, pal.waders.shade);
  // Boot: a lighter cuff, the body, a dark sole and a toe cap.
  rect(ctx, x - 1, cuff, w + 2 + toe, 10, pal.boots.base);
  rect(ctx, x - 1, cuff, w + 2 + toe, 2, pal.boots.light);
  rect(ctx, x - 1, bottom - 2, w + 2 + toe, 2, pal.boots.shade);
  rect(ctx, x + w - 2 + toe, cuff + 4, 2, 1, pal.boots.light);
}

function drawTorso(ctx, s, pal) {
  const { lean, torsoY } = s;
  const top = 44 + torsoY;
  const bottom = HIP_Y + s.stanceShift.drop + s.lift + 2;
  // Neck first so the collar sits over it.
  rect(ctx, 44 + lean, 34 + torsoY, 12, 14, pal.skin.shade);
  poly(ctx, [[35 + lean, top], [65 + lean, top], [67 + lean, top + 4], [67, bottom], [33, bottom], [33 + lean, top + 4]], pal.jacket.base);
  poly(ctx, [[33 + lean, top + 4], [38 + lean, top + 4], [38, bottom], [33, bottom]], pal.jacket.shade);
  rect(ctx, 38 + lean, top + 1, 24, 2, pal.jacket.light);
  poly(ctx, [[44 + lean, top], [56 + lean, top], [50 + lean, top + 8]], pal.jacket.shade);
  // Waders bib and straps.
  const bibTop = bottom - 18;
  rect(ctx, 41, bibTop, 18, bottom - bibTop, pal.waders.base);
  rect(ctx, 41, bibTop, 18, 1, pal.waders.light);
  rect(ctx, 44, bibTop + 6, 12, 1, pal.waders.shade);
  rect(ctx, 41, bibTop, 3, bottom - bibTop, pal.waders.shade);
  line(ctx, { x: 44, y: bibTop }, { x: 44 + lean, y: top + 2 }, 3, pal.waders.base);
  line(ctx, { x: 56, y: bibTop }, { x: 56 + lean, y: top + 2 }, 3, pal.waders.base);
  line(ctx, { x: 43, y: bibTop }, { x: 43 + lean, y: top + 2 }, 1, pal.waders.light);
  line(ctx, { x: 55, y: bibTop }, { x: 55 + lean, y: top + 2 }, 1, pal.waders.light);
}

function drawPack(ctx, s, pal) {
  const { torsoY } = s;
  rrect(ctx, 22, 46 + torsoY, 13, 21, 3, pal.pack.base);
  rrect(ctx, 22, 46 + torsoY, 13, 7, 3, pal.pack.light);
  rect(ctx, 24, 57 + torsoY, 9, 1, pal.pack.shade);
}

function drawHairBack(ctx, head, pal) {
  if (pal.hairstyle !== 'long') return;
  rrect(ctx, head.x - 3, head.y + 10, 11, 36, 5, pal.hair.base);
  rect(ctx, head.x - 3, head.y + 18, 4, 24, pal.hair.shade);
}

function drawHead(ctx, s, pal) {
  const { x, y } = s.head;
  const bareTop = pal.hatStyle === 'none' || pal.hatStyle === 'visor';
  rrect(ctx, x, y, 28, 28, 8, pal.skin.base);
  rect(ctx, x, y + 8, 4, 14, pal.skin.shade);
  rect(ctx, x + 4, y + 24, 20, 4, pal.skin.shade);
  rect(ctx, x + 8, y + 2, 14, 2, pal.skin.light);
  // Hair: a top (taller when nothing covers it), a sideburn and the nape.
  if (pal.hairstyle !== 'bald') {
    rrect(ctx, x, y - (bareTop ? 4 : 1), 28, bareTop ? 13 : 9, 9, pal.hair.base);
    rect(ctx, x + 19, y + 7, 6, 2, pal.hair.base);
    if (bareTop) { rect(ctx, x + 3, y - 3, 8, 2, pal.hair.light); rect(ctx, x + 23, y + 1, 2, 1, pal.hair.light); }
    rect(ctx, x + 1, y + 9, 4, 9, pal.hair.shade);
    rect(ctx, x, y + 18, 5, 6, pal.hair.base);
  } else if (bareTop) {
    rect(ctx, x + 6, y + 1, 12, 1, pal.skin.light);
  }
  // Ear, eye, brow, nose, mouth.
  ellipse(ctx, x + 4, y + 15, 2.5, 3.5, pal.skin.shade);
  px(ctx, x + 4, y + 15, pal.skin.base);
  const grit = s.face === 'grit';
  rect(ctx, x + 19, y + (grit ? 12 : 11), 3, grit ? 2 : 4, pal.eye);
  if (!grit) px(ctx, x + 19, y + 11, [255, 255, 255]);
  rect(ctx, x + 18, y + (grit ? 11 : 10), 5, 1, pal.hair.shade);
  if (grit) px(ctx, x + 23, y + 10, pal.hair.shade);
  rect(ctx, x + 27, y + 13, 3, 4, pal.skin.shade);
  px(ctx, x + 28, y + 14, pal.skin.base);
  const mouthShows = pal.beard === 'none' || pal.beard === 'stubble';
  if (s.face === 'grin') {
    rect(ctx, x + 18, y + 19, 8, 4, pal.mouth);
    rect(ctx, x + 18, y + 19, 8, 1, pal.teeth);
  } else if (grit) {
    rect(ctx, x + 18, y + 19, 8, 2, pal.teeth);
    px(ctx, x + 20, y + 19, pal.outline); px(ctx, x + 23, y + 19, pal.outline);
  } else if (mouthShows) {
    rect(ctx, x + 19, y + 20, 5, 1, pal.mouth);
  }
}

function drawBeard(ctx, s, pal) {
  const { x, y } = s.head;
  const hair = pal.hair;
  const mustache = () => { rect(ctx, x + 20, y + 17, 9, 2, hair.base); px(ctx, x + 19, y + 18, hair.base); };
  switch (pal.beard) {
    case 'full':
      poly(ctx, [[x + 2, y + 16], [x + 2, y + 24], [x + 9, y + 31], [x + 21, y + 31], [x + 28, y + 25], [x + 28, y + 21], [x + 22, y + 21], [x + 19, y + 17]], hair.base);
      rect(ctx, x + 9, y + 29, 12, 2, hair.shade);
      rect(ctx, x + 2, y + 17, 4, 7, hair.shade);
      mustache();
      break;
    case 'goatee':
      rrect(ctx, x + 18, y + 22, 10, 9, 3, hair.base);
      rect(ctx, x + 18, y + 29, 10, 2, hair.shade);
      mustache();
      break;
    case 'mustache':
      mustache();
      px(ctx, x + 29, y + 18, hair.base);
      break;
    case 'stubble':
      for (let row = 18; row <= 27; row += 1) {
        const inset = row >= 25 ? (row - 24) * 2 : 0;
        for (let col = 4 + inset; col <= 27 - inset; col += 1) {
          if ((row + col) % 2 === 0 && !(row < 21 && col > 17)) px(ctx, x + col, y + row, pal.stubble);
        }
      }
      break;
    default:
      break;
  }
}

function drawHat(ctx, s, pal) {
  const { x, y } = s.head;
  const hat = pal.hat;
  switch (pal.hatStyle) {
    case 'cap':
      rrect(ctx, x - 1, y - 7, 30, 16, 10, hat.base);
      rect(ctx, x - 1, y + 1, 10, 8, hat.shade);
      rrect(ctx, x + 14, y - 6, 15, 14, 6, pal.panel.base);
      rect(ctx, x + 18, y + 1, 5, 2, hat.base); px(ctx, x + 23, y + 1, hat.base);
      poly(ctx, [[x + 18, y + 7], [x + 34, y + 7], [x + 35, y + 10], [x + 18, y + 10]], hat.shade);
      px(ctx, x + 14, y - 7, hat.shade);
      break;
    case 'bucket':
      poly(ctx, [[x + 1, y + 7], [x + 2, y - 7], [x + 6, y - 9], [x + 22, y - 9], [x + 26, y - 7], [x + 27, y + 7]], hat.base);
      rect(ctx, x + 1, y + 3, 26, 2, hat.shade);
      poly(ctx, [[x - 6, y + 6], [x + 34, y + 6], [x + 37, y + 11], [x - 9, y + 11]], hat.base);
      rect(ctx, x - 8, y + 9, 44, 2, hat.shade);
      break;
    case 'beanie':
      rrect(ctx, x - 1, y - 12, 30, 22, 11, hat.base);
      rect(ctx, x - 1, y + 4, 30, 6, hat.light);
      for (let col = x + 1; col < x + 29; col += 3) rect(ctx, col, y + 4, 1, 6, hat.base);
      disc(ctx, x + 14, y - 13, 4, pal.panel.base);
      break;
    case 'straw':
      rrect(ctx, x + 2, y - 11, 24, 18, 5, hat.base);
      rect(ctx, x + 2, y + 3, 24, 4, [70, 46, 26]);
      poly(ctx, [[x - 9, y + 7], [x + 37, y + 7], [x + 37, y + 11], [x - 9, y + 11]], hat.base);
      rect(ctx, x - 8, y + 8, 44, 1, hat.light);
      rect(ctx, x + 5, y - 9, 18, 1, hat.light);
      break;
    case 'visor':
      rrect(ctx, x - 1, y + 1, 30, 8, 3, hat.base);
      poly(ctx, [[x + 19, y + 5], [x + 37, y + 5], [x + 38, y + 9], [x + 19, y + 9]], hat.shade);
      break;
    case 'cowboy':
      poly(ctx, [[x + 2, y + 7], [x + 2, y - 10], [x + 7, y - 15], [x + 14, y - 11], [x + 21, y - 15], [x + 26, y - 10], [x + 26, y + 7]], hat.base);
      rect(ctx, x + 2, y + 3, 24, 4, hat.shade);
      rect(ctx, x - 8, y + 7, 44, 4, hat.base);
      rect(ctx, x - 9, y + 4, 4, 5, hat.light);
      rect(ctx, x + 33, y + 4, 4, 5, hat.light);
      break;
    default:
      break;
  }
}

// ---- A frame ----

// The layers of a solved pose, back to front. Each is a function of a context.
export function layersFor(s, pal) {
  const shift = s.stanceShift;
  const legTop = HIP_Y + shift.drop + s.lift;
  const legBottom = NATIVE.feetY + s.lift;
  const rodWithCrank = { ...s.rod, crank: s.crank };
  const layers = [];
  const backArmForward = s.rod.inFront && (s.crank != null || s.backHand === 'butt');
  if (!s.rod.inFront) layers.push((ctx) => drawRod(ctx, rodWithCrank, pal));
  if (!backArmForward) layers.push((ctx) => drawArm(ctx, s.arms.back, s.shoulders.back, pal));
  layers.push((ctx) => { drawHairBack(ctx, s.head, pal); drawPack(ctx, s, pal); });
  layers.push((ctx) => drawLeg(ctx, LEGS.back + shift.back, legTop, legBottom, 0, pal));
  layers.push((ctx) => drawLeg(ctx, LEGS.front + shift.front, legTop, legBottom, 3, pal));
  layers.push((ctx) => drawTorso(ctx, s, pal));
  layers.push((ctx) => drawHead(ctx, s, pal));
  if (pal.beard !== 'none') layers.push((ctx) => drawBeard(ctx, s, pal));
  if (pal.hatStyle !== 'none') layers.push((ctx) => drawHat(ctx, s, pal));
  if (s.rod.inFront) layers.push((ctx) => drawRod(ctx, rodWithCrank, pal));
  if (backArmForward) layers.push((ctx) => drawArm(ctx, s.arms.back, s.shoulders.back, pal));
  layers.push((ctx) => drawArm(ctx, s.arms.front, s.shoulders.front, pal));
  return layers;
}

// Snap a layer to whole pixels and give it a one-pixel outline: anything drawn at half
// coverage or less is dropped, the rest is solid, and every empty pixel touching a solid one
// becomes the outline colour.
export function finishPixels(data, width, height, outline) {
  const solid = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    if (data[i * 4 + 3] >= 128) { data[i * 4 + 3] = 255; solid[i] = 1; } else { data[i * 4 + 3] = 0; }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (solid[i]) continue;
      const touching = (x > 0 && solid[i - 1]) || (x < width - 1 && solid[i + 1]) || (y > 0 && solid[i - width]) || (y < height - 1 && solid[i + width]);
      if (touching) { data[i * 4] = outline[0]; data[i * 4 + 1] = outline[1]; data[i * 4 + 2] = outline[2]; data[i * 4 + 3] = 255; }
    }
  }
  return data;
}

// Draw one solved frame onto `target` at native size using `makeCanvas` for the layers.
export function drawFrame(makeCanvas, target, s, pal) {
  layersFor(s, pal).forEach((draw) => {
    const layer = makeCanvas(NATIVE.w, NATIVE.h);
    draw(layer.ctx);
    const image = layer.ctx.getImageData(0, 0, NATIVE.w, NATIVE.h);
    finishPixels(image.data, NATIVE.w, NATIVE.h, pal.outline);
    layer.ctx.putImageData(image, 0, 0);
    target.ctx.drawImage(layer.canvas, 0, 0);
  });
}

// ---- Strips ----

function canvasFor(width, height) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  } catch (error) { return null; }
}

let renderable = null;
export function canRender() {
  if (renderable === null) renderable = typeof document !== 'undefined' && Boolean(canvasFor(1, 1));
  return renderable;
}

function scaledCanvas(frames, scale) {
  const out = canvasFor(NATIVE.w * scale * frames, NATIVE.h * scale);
  out.ctx.imageSmoothingEnabled = false;
  return out;
}

export function renderStrip(action, pal, scale = SCALE) {
  const solved = framesFor(action);
  const strip = scaledCanvas(solved.length, scale);
  solved.forEach((s, index) => {
    const frame = canvasFor(NATIVE.w, NATIVE.h);
    drawFrame(canvasFor, frame, s, pal);
    strip.ctx.drawImage(frame.canvas, 0, 0, NATIVE.w, NATIVE.h, index * NATIVE.w * scale, 0, NATIVE.w * scale, NATIVE.h * scale);
  });
  return strip.canvas;
}

const sheetCache = new Map();
const previewCache = new Map();

// Resolves to { idle, cast, reel, fishon, celebrate } data URLs, or null where nothing can
// be drawn (the stock strips show then).
export function renderAngler(look) {
  if (!canRender()) return Promise.resolve(null);
  const key = lookKey(look || {});
  if (!sheetCache.has(key)) {
    const pal = paletteFor(look || {});
    const sheets = {};
    Object.keys(FRAME_COUNTS).forEach((action) => { sheets[action] = renderStrip(action, pal).toDataURL('image/png'); });
    sheetCache.set(key, sheets);
  }
  return Promise.resolve(sheetCache.get(key));
}

// One still of the angler (the frame a strip rests on) for previews and the racks.
export function renderStill(look, action = 'idle', scale = 2) {
  if (!canRender()) return null;
  const key = `${lookKey(look || {})}|${action}|${scale}`;
  if (!previewCache.has(key)) {
    const pal = paletteFor(look || {});
    const s = framesFor(action)[HELD_FRAME[action] || 0];
    const frame = canvasFor(NATIVE.w, NATIVE.h);
    drawFrame(canvasFor, frame, s, pal);
    const still = scaledCanvas(1, scale);
    still.ctx.drawImage(frame.canvas, 0, 0, NATIVE.w, NATIVE.h, 0, 0, NATIVE.w * scale, NATIVE.h * scale);
    previewCache.set(key, still.canvas.toDataURL('image/png'));
  }
  return previewCache.get(key);
}

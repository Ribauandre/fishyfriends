import { readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ANGLER_SPRITES, FRAME_MS, KEYLINE, SPRITE_FRAME, STILL_WINDOW, anglerAction } from './anglerSprites';
import { ART_PX } from './sceneLayout';
import strips from '../assets/angler/strips.json';
import paint from '../assets/angler/paint.json';

// The art, the part masks and the numbers in this module are three descriptions of one thing, and
// nothing at runtime notices when they stop agreeing: the painter walks a strip and its mask
// together by index, so a mask a pixel wider than its strip paints a garment onto whatever happens
// to fall at that offset, and jsdom has no canvas, so every test that goes through the painter
// falls back and sees none of it. That is not hypothetical — the strips were re-sliced to a
// smaller box once and the masks were left behind at the old one, and everything went on passing.
// So they are checked here, off the files themselves, where a mismatch is a failure rather than a
// silently wrong picture.
const ANGLER = path.join(__dirname, '..', 'assets', 'angler');

// A PNG's width and height are the first two fields of its IHDR, which is always the first chunk.
// That is all this needs, so there is no decoding and no image library.
function sizeOf(file) {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// The pixels themselves, for the checks sizes cannot make: an 8-bit RGBA PNG, unfiltered.
function pixelsOf(file) {
  const buf = readFileSync(file);
  const { width, height } = sizeOf(file);
  const idat = []; let at = 8;
  while (at < buf.length) {
    const len = buf.readUInt32BE(at); const type = buf.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = width * 4;
  const out = Buffer.alloc(stride * height); let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const type = raw[y * (stride + 1)]; const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i += 1) {
      const a = i >= 4 ? line[i - 4] : 0; const b = prev[i]; const c = i >= 4 ? prev[i - 4] : 0;
      const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      const add = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][type];
      line[i] = (line[i] + add) & 255;
    }
    line.copy(out, y * stride); prev = line;
  }
  return out;
}

const ACTIONS = Object.keys(ANGLER_SPRITES);
const inside = ({ x, y }) => x >= 0 && y >= 0 && x < SPRITE_FRAME.w && y < SPRITE_FRAME.h;

test('every action in the module is a strip on disk, and every strip is in the module', () => {
  expect(ACTIONS.sort()).toEqual(Object.keys(strips).sort());
});

// He is drawn at the world's art pixel: 92 painting units tall (every layout's spriteH) is the
// frame's height in art pixels times ART_PX, so one file pixel is one art pixel on the stage.
test('the frame is drawn one file pixel to one art pixel', () => {
  expect(SPRITE_FRAME.h * ART_PX).toBeCloseTo(92, 5);
  expect(Number.isInteger(SPRITE_FRAME.w) && Number.isInteger(SPRITE_FRAME.feetX)).toBe(true);
});

describe.each(ACTIONS)('%s', (action) => {
  test('the strip is exactly as many frames wide as the module plays, at the shared box size', () => {
    const strip = sizeOf(path.join(ANGLER, `${action}.png`));
    expect(strips[action]).toMatchObject({ w: SPRITE_FRAME.w, h: SPRITE_FRAME.h, feetX: SPRITE_FRAME.feetX, feetY: SPRITE_FRAME.feetY });
    expect(ANGLER_SPRITES[action].frames).toBe(strips[action].frames);
    expect(strip).toEqual({ width: SPRITE_FRAME.w * ANGLER_SPRITES[action].frames, height: SPRITE_FRAME.h });
  });

  test('the part mask covers the strip pixel for pixel', () => {
    expect(sizeOf(path.join(ANGLER, 'masks', `${action}.png`))).toEqual(sizeOf(path.join(ANGLER, `${action}.png`)));
  });

  // Flat pixel art on the world's grid: every pixel is drawn or not (no soft edge for a pixelated
  // scale-up to turn into a ring), the mask labels exactly the pixels that are drawn, and every
  // pixel the mask calls the keyline is the one keyline colour, which the painter never dyes.
  test('hard alpha, a label under every drawn pixel, and one keyline colour', () => {
    const art = pixelsOf(path.join(ANGLER, `${action}.png`));
    const mask = pixelsOf(path.join(ANGLER, 'masks', `${action}.png`));
    const key = [1, 3, 5].map((i) => parseInt(KEYLINE.slice(i, i + 2), 16));
    let soft = 0; let unlabelled = 0; let offKey = 0;
    for (let i = 0; i < art.length; i += 4) {
      if (art[i + 3] !== 0 && art[i + 3] !== 255) soft += 1;
      if (Boolean(art[i + 3]) !== Boolean(mask[i + 3])) unlabelled += 1;
      if (mask[i + 3] && mask[i] === 1 && (art[i] !== key[0] || art[i + 1] !== key[1] || art[i + 2] !== key[2])) offKey += 1;
    }
    expect({ soft, unlabelled, offKey }).toEqual({ soft: 0, unlabelled: 0, offKey: 0 });
  });

  // The line and the pennant leave from the rod tip of the frame on screen, so there is one per
  // frame, and each is a point inside the frame, so the line starts on the rod and not off it.
  test('there is a rod tip for every frame, each inside the frame', () => {
    const { rodTips, rodTip, frames } = ANGLER_SPRITES[action];
    expect(rodTips).toHaveLength(frames);
    rodTips.forEach((tip) => expect(inside(tip)).toBe(true));
    expect(rodTips).toContain(rodTip);
  });
});

test('the reel loop really does move the tip, which is why there is one per frame', () => {
  const xs = ANGLER_SPRITES.reel.rodTips.map((tip) => tip.x);
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10);
});

test('the frame he holds a caught fish up in marks its point as his hand, not a rod tip', () => {
  const { rodTips, rodTip } = ANGLER_SPRITES.celebrate;
  expect(rodTips[3].hand).toBe(true);
  expect(rodTip).toBe(rodTips[3]);
  expect(rodTips.slice(0, 3).every((tip) => !tip.hand)).toBe(true);
});

test('the still window is a window on one frame, and holds the whole idle pose', () => {
  expect(STILL_WINDOW.x + STILL_WINDOW.w).toBeLessThanOrEqual(SPRITE_FRAME.w);
  expect(STILL_WINDOW.y + STILL_WINDOW.h).toBeLessThanOrEqual(SPRITE_FRAME.h);
  const pose = strips.idle.bounds[0];
  expect(pose.x).toBeGreaterThanOrEqual(STILL_WINDOW.x);
  expect(pose.y).toBeGreaterThanOrEqual(STILL_WINDOW.y);
  expect(pose.x + pose.w).toBeLessThanOrEqual(STILL_WINDOW.x + STILL_WINDOW.w);
  expect(pose.y + pose.h).toBeLessThanOrEqual(STILL_WINDOW.y + STILL_WINDOW.h);
});

// The painter swaps a part's drawn shades by rank; on flat art its shades are the colours it is
// drawn in, each named once.
test('every dyed part has a shade table, with its main shade in range', () => {
  ['cap', 'hair', 'shirt', 'vest', 'jeans', 'boots', 'rod'].forEach((name) => {
    const { list, main } = paint.shades[name];
    expect(list.length).toBeGreaterThan(0);
    expect(main).toBeGreaterThanOrEqual(0);
    expect(main).toBeLessThan(list.length);
  });
  expect(paint.body).toHaveLength(4);
});

// Every phase the game can be in has to name a strip that exists and stay inside its frame count,
// or the sprite reads past the end of the art and the angler vanishes mid-cast; and every frame it
// steps through lasts a whole number of the world's 125 ms beats.
test.each([
  ['idle', { phase: 'idle' }],
  ['casting', { phase: 'casting' }],
  ['waiting', { phase: 'waiting' }],
  ['hookset', { phase: 'hookset' }],
  ['reeling, cranking', { phase: 'reeling', holding: true }],
  ['reeling, resting', { phase: 'reeling', holding: false }],
  ['landed it', { phase: 'result', result: { success: true } }],
  ['lost it', { phase: 'result', result: { success: false } }],
  ['landed a stick', { phase: 'result', result: { success: true, rarity: 'junk' } }],
])('%s plays frames the strip actually has, on the 8 fps clock', (_label, state) => {
  const { action, play, frame, durationMs } = anglerAction(state);
  expect(ANGLER_SPRITES[action]).toBeDefined();
  const count = ANGLER_SPRITES[action].frames;
  if (play !== undefined) {
    expect(play).toBeLessThanOrEqual(count);
    expect(durationMs % (play * FRAME_MS)).toBe(0);
  }
  if (frame !== undefined) expect(frame).toBeLessThan(count);
});

test('a stick on the hook is not celebrated: he does not hold up a bass for it', () => {
  expect(anglerAction({ phase: 'result', result: { success: true, rarity: 'junk' } })).toEqual({ action: 'idle', frame: 0 });
  expect(anglerAction({ phase: 'result', result: { success: true, rarity: 'common' } }).action).toBe('celebrate');
});

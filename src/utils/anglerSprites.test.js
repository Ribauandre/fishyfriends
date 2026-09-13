import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ANGLER_SPRITES, SPRITE_FRAME, STILL_WINDOW, anglerAction } from './anglerSprites';
import strips from '../assets/angler/strips.json';

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

const ACTIONS = Object.keys(ANGLER_SPRITES);

test('every action in the module is a strip on disk, and every strip is in the module', () => {
  expect(ACTIONS.sort()).toEqual(Object.keys(strips).sort());
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

  test('the rod tip is a point inside the frame, so the line starts on the rod and not off it', () => {
    const { x, y } = ANGLER_SPRITES[action].rodTip;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(SPRITE_FRAME.w);
    expect(y).toBeLessThan(SPRITE_FRAME.h);
  });
});

test('the still window is a window on one frame, not on the whole strip', () => {
  expect(STILL_WINDOW.x + STILL_WINDOW.w).toBeLessThanOrEqual(SPRITE_FRAME.w);
  expect(STILL_WINDOW.y + STILL_WINDOW.h).toBeLessThanOrEqual(SPRITE_FRAME.h);
});

// Every phase the game can be in has to name a strip that exists and stay inside its frame count,
// or the sprite reads past the end of the art and the angler vanishes mid-cast.
test.each([
  ['idle', { phase: 'idle' }],
  ['casting', { phase: 'casting' }],
  ['waiting', { phase: 'waiting' }],
  ['hookset', { phase: 'hookset' }],
  ['reeling, cranking', { phase: 'reeling', holding: true }],
  ['reeling, resting', { phase: 'reeling', holding: false }],
  ['landed it', { phase: 'result', result: { success: true } }],
  ['lost it', { phase: 'result', result: { success: false } }],
])('%s plays frames the strip actually has', (_label, state) => {
  const { action, play, frame } = anglerAction(state);
  expect(ANGLER_SPRITES[action]).toBeDefined();
  const count = ANGLER_SPRITES[action].frames;
  if (play !== undefined) expect(play).toBeLessThanOrEqual(count);
  if (frame !== undefined) expect(frame).toBeLessThan(count);
});

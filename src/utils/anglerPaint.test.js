import { tintPixel, frontness, paintPixels, OUTLINE } from './anglerPaint';
import { PART, PART_BASE, WARDROBE, SKIN_TONES, HAIR_COLORS, paletteFor } from './anglerLook';

// A tiny frame in the three-quarter turn the sheet draws: a bare head and jaw, shoulders in a
// shirt, and a rod out to one side. Everything the painter puts on the head it puts on here.
const W = 44; const H = 40;
const FRAME = { head: { x0: 12, y0: 10, x1: 30, y1: 32 }, facing: 'right' };
function scene() {
  const pixels = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8ClampedArray(W * H * 4);
  const fill = (x0, y0, x1, y1, part, rgb) => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) { const i = (y * W + x) * 4; pixels.set([...rgb, 255], i); mask[i] = part; }
  };
  fill(12, 10, 30, 32, PART.skin, PART_BASE[PART.skin]);
  fill(14, 33, 28, 39, PART.shirt, PART_BASE[PART.shirt]);
  fill(32, 34, 41, 36, PART.rod, PART_BASE[PART.rod]);
  return { pixels, mask };
}
function paint(look, frame = FRAME) {
  const { pixels, mask } = scene();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [frame], palette: paletteFor(look) });
  return (x, y) => { const i = (y * W + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
}
const near = (px, rgb, tolerance = 60) => Math.abs(px.r - rgb[0]) <= tolerance && Math.abs(px.g - rgb[1]) <= tolerance && Math.abs(px.b - rgb[2]) <= tolerance;
const bare = paint({});

test('tintPixel keeps a pixel\'s shading relative to its part\'s mid-tone', () => {
  expect(tintPixel(PART_BASE[PART.skin], PART_BASE[PART.skin], [86, 52, 34])).toEqual([86, 52, 34]);
  const dark = tintPixel([104, 68, 44], PART_BASE[PART.skin], [86, 52, 34]);
  expect(dark[0]).toBeLessThan(86);
});

test('how far forward a column is depends on which way the head is turned', () => {
  const head = { x0: 12, x1: 30 };
  expect(frontness(30, head, 'right')).toBe(1);
  expect(frontness(12, head, 'right')).toBe(0);
  expect(frontness(12, head, 'left')).toBe(1);
  expect(frontness(21, head, 'front')).toBeCloseTo(1, 5);
  expect(frontness(12, head, 'front')).toBe(0);
});

test('the stock look leaves the art alone', () => {
  const { pixels, mask } = scene();
  const before = pixels.slice();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [FRAME], palette: paletteFor({}) });
  expect(Array.from(pixels)).toEqual(Array.from(before));
});

test('hair is laid over the top of the skull and leaves the face alone', () => {
  const px = paint({ hairstyle: 'short', hair: 'blond' });
  expect(near(px(20, 13), HAIR_COLORS.blond.rgb, 80)).toBe(true);
  // Lit from the top.
  expect(px(20, 12).r).toBeGreaterThan(px(20, 16).r);
  // The face below it is untouched skin.
  expect(near(px(20, 26), PART_BASE[PART.skin], 2)).toBe(true);
  // It reaches further down the back of the head than the forehead, and is shaded darker
  // there, so the test is that the pixel changed at the back and did not at the front.
  expect(px(13, 18).r).not.toBe(bare(13, 18).r);
  expect(near(px(29, 18), PART_BASE[PART.skin], 2)).toBe(true);
});

test('long hair hangs down the back of the neck, in the open air behind the head', () => {
  const px = paint({ hairstyle: 'long', hair: 'red' });
  expect(px(11, 24).a).toBe(255);
  expect(near(px(11, 24), HAIR_COLORS.red.rgb, 90) || near(px(11, 24), OUTLINE, 20)).toBe(true);
  // It falls behind the head, not in front of it, and never over the face.
  expect(px(32, 24).a).toBe(0);
  expect(near(px(26, 26), PART_BASE[PART.skin], 2)).toBe(true);
});

// A stand-in for the drawn art the painter stamps: a beard overlay lying on the jaw exactly
// where the strip has one, and a hat sheet of two flat cells with a known anchor row.
function beardOverlay() {
  const beard = new Uint8ClampedArray(W * H * 4);
  for (let y = 24; y <= 34; y += 1) for (let x = 14; x <= 29; x += 1) beard.set([150, 112, 70, 255], (y * W + x) * 4);
  return beard;
}
const HAT_CELL = { cellW: 10, cellH: 8, anchorY: 5, refHead: 19 };
function hatSheet() {
  const { cellW, cellH } = HAT_CELL;
  const data = new Uint8ClampedArray(cellW * 2 * cellH * 4);
  for (let y = 0; y < cellH; y += 1) for (let x = 0; x < cellW * 2; x += 1) {
    data.set(x < cellW ? [180, 40, 40, 255] : [40, 60, 180, 255], (y * cellW * 2 + x) * 4);
  }
  return { data, width: cellW * 2, height: cellH, ...HAT_CELL, index: { cap_olive: 0, straw_blue: 1 } };
}
function dressed(look, extra = {}) {
  const { pixels, mask } = scene();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [FRAME], palette: paletteFor(look), beard: beardOverlay(), hats: hatSheet(), ...extra });
  return (x, y) => { const i = (y * W + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
}

test('a hat is the drawn sprite, scaled by the head and hung on its anchor row', () => {
  const px = dressed({ hat: 'cap_green' });
  // The cell is stamped: its anchor row lands just above the eyes and it stands proud above.
  expect(px(21, 20).a).toBe(255);
  expect(near(px(21, 20), [180, 40, 40], 30)).toBe(true);
  // Below the anchor the face is the art's own skin again.
  expect(near(px(21, 28), PART_BASE[PART.skin], 2)).toBe(true);
  // Another item in the same slot stamps a different cell.
  expect(near(dressed({ hat: 'hat_straw' })(21, 20), [40, 60, 180], 30)).toBe(true);
  // And a tinted item re-dyes the drawing it shares.
  const black = dressed({ hat: 'cap_black' });
  expect(black(21, 20).r).toBeLessThan(px(21, 20).r);
});

test('a hat is stamped on every frame, at that frame\'s own head', () => {
  const one = scene();
  const pixels = new Uint8ClampedArray(W * 2 * H * 4);
  const mask = new Uint8ClampedArray(W * 2 * H * 4);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const from = (y * W + x) * 4;
    [[x, 0], [x + 4, W]].forEach(([tx, ox]) => { if (tx < W) { const to = (y * W * 2 + ox + tx) * 4; pixels.set(one.pixels.slice(from, from + 4), to); mask[to] = one.mask[from]; } });
  }
  const second = { head: { ...FRAME.head, x0: FRAME.head.x0 + 4, x1: FRAME.head.x1 + 4 }, facing: 'right' };
  paintPixels({ pixels, mask, width: W * 2, height: H, frameWidth: W, anchors: [FRAME, second], palette: paletteFor({ hat: 'cap_green' }), hats: hatSheet() });
  const px = (x, y) => { const i = (y * W * 2 + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
  expect(near(px(21, 20), [180, 40, 40], 30)).toBe(true);
  expect(near(px(W + 25, 20), [180, 40, 40], 30)).toBe(true);
});

test('the beard is the drawn overlay, dyed, and a style is a window on it', () => {
  const full = dressed({ beard: 'full', hair: 'black' });
  expect(near(full(20, 30), HAIR_COLORS.black.rgb, 80)).toBe(true);
  expect(near(full(20, 20), PART_BASE[PART.skin], 2)).toBe(true);
  // Nothing outside the drawn overlay is touched, however the style is cut.
  expect(near(full(20, 22), PART_BASE[PART.skin], 2)).toBe(true);
  // A goatee keeps the front of the chin and leaves the rest of the jaw bare.
  const goatee = dressed({ beard: 'goatee', hair: 'black' });
  expect(near(goatee(28, 33), HAIR_COLORS.black.rgb, 80)).toBe(true);
  expect(near(goatee(15, 26), PART_BASE[PART.skin], 2)).toBe(true);
  // Stubble is the same shape let down into the skin under it, on every other pixel.
  const stubble = dressed({ beard: 'stubble', hair: 'black' });
  expect(stubble(15, 30).r).toBeLessThan(full(15, 30).r + 200);
  expect(near(stubble(16, 30), PART_BASE[PART.skin], 2)).toBe(true);
  // Clean shaven leaves the overlay off entirely.
  expect(near(dressed({ beard: 'none' })(20, 30), PART_BASE[PART.skin], 2)).toBe(true);
});

test('skin and gear are dyed in place, shading and all', () => {
  const px = paint({ skin: 'deep', rod: 'rod_gold', shirt: 'shirt_navy' });
  expect(near(px(20, 26), SKIN_TONES.deep.rgb, 40)).toBe(true);
  expect(px(36, 35).r).toBeGreaterThan(px(36, 35).b);
  expect(px(20, 35).b).toBeGreaterThan(px(20, 35).r);
});

test('a frame with no anchors is only dyed', () => {
  const { pixels, mask } = scene();
  const before = pixels.slice();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [], palette: paletteFor({ skin: 'deep', hat: 'cap_green' }), beard: beardOverlay(), hats: hatSheet() });
  expect(pixels[(26 * W + 20) * 4]).toBeLessThan(before[(26 * W + 20) * 4]);
  // Nothing was stamped on the head: the headroom above it is still open.
  expect(pixels[(9 * W + 20) * 4 + 3]).toBe(0);
});

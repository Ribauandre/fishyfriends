import { tintPixel, frontness, paintPixels, bandOf, shiftPixel } from './anglerPaint';
import { PART, PART_BASE, SKIN_BODY, WARDROBE, SKIN_TONES, HAIR_COLORS, paletteFor, skinRampFor, itemsFor } from './anglerLook';

// A tiny frame in the three-quarter turn the sheet draws: a bare head and jaw, shoulders in a
// shirt, and a rod out to one side. Everything the painter puts on the head it puts on here.
const W = 44; const H = 40;
const FRAME = { head: { x0: 12, y0: 10, x1: 30, y1: 32 }, facing: 'right', hatAnchor: { cx: 21, y: 18 } };
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

// A stand-in for the drawn art the painter stamps: a beard overlay lying on the jaw exactly
// where the strip has one, and a hat sheet of two flat cells with a known anchor row.
function beardOverlay() {
  const beard = new Uint8ClampedArray(W * H * 4);
  for (let y = 24; y <= 34; y += 1) for (let x = 14; x <= 29; x += 1) beard.set([150, 112, 70, 255], (y * W + x) * 4);
  return beard;
}
// A stand-in for a hat lifted off a sheet of him wearing it: it lies on the strip's own pixels,
// so there is nothing to scale or anchor.
function hatOverlay() {
  const over = new Uint8ClampedArray(W * H * 4);
  for (let y = 8; y <= 15; y += 1) for (let x = 13; x <= 29; x += 1) over.set([96, 128, 64, 255], (y * W + x) * 4);
  return over;
}
function dressed(look, extra = {}) {
  const { pixels, mask } = scene();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [FRAME], palette: paletteFor(look), beard: beardOverlay(), ...extra });
  return (x, y) => { const i = (y * W + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
}

test('a drawn hat is copied where the artist put it, and a dyed one is that same drawing', () => {
  const worn = dressed({ hat: 'cap_green' }, { hatOver: hatOverlay() });
  // Nothing is scaled and no anchor row is consulted: the overlay lands on its own pixels.
  expect(near(worn(21, 12), [96, 128, 64], 20)).toBe(true);
  // Below it the face is the art's own skin again.
  expect(near(worn(21, 28), PART_BASE[PART.skin], 2)).toBe(true);
  // A dyed cap is the same drawing measured against the olive it was painted in.
  const black = dressed({ hat: 'cap_black' }, { hatOver: hatOverlay() });
  expect(black(21, 12).g).toBeLessThan(worn(21, 12).g);
  // How dark a pixel can be and still take the dye is the drawing's own: a black knit hat is
  // mostly under the usual guard, and dyeing it against that would leave it black.
  expect(paletteFor({ hat: 'hat_beanie_red' }).head.hat.floor).toBeLessThan(40);
  expect(paletteFor({ hat: 'cap_black' }).head.hat.floor).toBeNull();
  expect(paletteFor({ hat: 'cap_green' }).head.hat).toMatchObject({ overlay: 'cap_olive', tint: null });
  // Every hat in the rack is one of these drawings now — nothing is stamped.
  itemsFor('hat').forEach((item) => { if (item.key !== 'hat_none') expect(typeof item.overlay).toBe('string'); });
});

test('a drawn hat lands on every frame, on the pixels the artist drew it on', () => {
  const one = scene();
  const pixels = new Uint8ClampedArray(W * 2 * H * 4);
  const mask = new Uint8ClampedArray(W * 2 * H * 4);
  const over = new Uint8ClampedArray(W * 2 * H * 4);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const from = (y * W + x) * 4;
    [[x, 0], [x + 4, W]].forEach(([tx, ox]) => { if (tx < W) { const to = (y * W * 2 + ox + tx) * 4; pixels.set(one.pixels.slice(from, from + 4), to); mask[to] = one.mask[from]; } });
  }
  // The drawing carries its own place in each frame, so the second one needs no second anchor.
  [[21, 0], [25, 0]].forEach(([cx]) => { for (let y = 10; y <= 14; y += 1) for (let x = cx - 4; x <= cx + 4; x += 1) over.set([96, 128, 64, 255], (y * W * 2 + (cx === 25 ? W : 0) + x) * 4); });
  const second = { head: { ...FRAME.head, x0: FRAME.head.x0 + 4, x1: FRAME.head.x1 + 4 }, facing: 'right' };
  paintPixels({ pixels, mask, width: W * 2, height: H, frameWidth: W, anchors: [FRAME, second], palette: paletteFor({ hat: 'cap_green' }), hatOver: over });
  const px = (x, y) => { const i = (y * W * 2 + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
  expect(near(px(21, 12), [96, 128, 64], 20)).toBe(true);
  expect(near(px(W + 25, 12), [96, 128, 64], 20)).toBe(true);
});

test('facial hair is the drawn overlay for its style, dyed where it is not line work', () => {
  const full = dressed({ beard: 'full', hair: 'black' });
  expect(near(full(20, 30), HAIR_COLORS.black.rgb, 80)).toBe(true);
  // Nothing outside the drawing is touched, whichever style is worn.
  expect(near(full(20, 20), PART_BASE[PART.skin], 2)).toBe(true);
  expect(near(full(20, 22), PART_BASE[PART.skin], 2)).toBe(true);
  // Each style names its own drawing now, so the painter copies rather than cutting a window.
  ['full', 'goatee', 'mustache'].forEach((beard) => expect(paletteFor({ beard }).head.beard.keep).toBe('all'));
  // Stubble is the full beard's own footprint let almost all the way down into the skin, so it
  // reads as a shadow on the jaw. It used to be thinned to every other pixel, which at this size
  // is a checkerboard rather than stubble.
  const stubble = dressed({ beard: 'stubble', hair: 'black' });
  const bare = PART_BASE[PART.skin][0];
  expect(stubble(16, 30).r).toBeLessThan(bare);
  expect(stubble(16, 30).r).toBeGreaterThan(full(16, 30).r);
  // Every pixel of the shape, not every other one.
  expect(stubble(15, 30).r).toBeLessThan(bare);
  // Clean shaven leaves the overlay off entirely.
  expect(near(dressed({ beard: 'none' })(20, 30), PART_BASE[PART.skin], 2)).toBe(true);
});

test('the stock hairstyle is an overlay lying on the strip, dyed where it is not line work', () => {
  const over = new Uint8ClampedArray(W * H * 4);
  for (let y = 11; y <= 18; y += 1) for (let x = 14; x <= 28; x += 1) over.set([120, 78, 52, 255], (y * W + x) * 4);
  const { pixels, mask } = scene();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [FRAME], palette: paletteFor({ hairstyle: 'short', hair: 'black' }), hairOver: over });
  const px = (x, y) => { const i = (y * W + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
  expect(near(px(20, 14), HAIR_COLORS.black.rgb, 80)).toBe(true);
  // Nothing outside the overlay is touched.
  expect(near(px(20, 28), PART_BASE[PART.skin], 2)).toBe(true);
});

test('the other hairstyles are hairpieces stamped on the crown and dyed', () => {
  const cell = { cellW: 10, cellH: 8, anchorY: 0, refHead: 19, anchor: 'top' };
  const data = new Uint8ClampedArray(cell.cellW * cell.cellH * 4);
  for (let i = 0; i < cell.cellW * cell.cellH; i += 1) data.set([150, 100, 60, 255], i * 4);
  const art = { data, width: cell.cellW, height: cell.cellH, ...cell, index: { curls: 0 } };
  const { pixels, mask } = scene();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [FRAME], palette: paletteFor({ hairstyle: 'curls', hair: 'black' }), hairArt: art });
  const px = (x, y) => { const i = (y * W + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
  // Its own crown goes on the skull's, not on the row a hat hangs from.
  expect(near(px(21, 11), HAIR_COLORS.black.rgb, 80)).toBe(true);
  expect(near(px(21, 28), PART_BASE[PART.skin], 2)).toBe(true);
});

test('a drawn outfit is copied over the body, and the waders dye gives way to it', () => {
  const over = new Uint8ClampedArray(W * H * 4);
  for (let y = 34; y <= 38; y += 1) for (let x = 16; x <= 26; x += 1) over.set([60, 80, 140, 255], (y * W + x) * 4);
  const { pixels, mask } = scene();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [FRAME], palette: paletteFor({ waders: 'waders_jeans' }, ['waders_jeans']), outfitOver: over });
  const px = (x, y) => { const i = (y * W + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
  expect(near(px(20, 36), [60, 80, 140], 20)).toBe(true);
  // Outside the drawing the art is its own, so the sleeves are still there to dye.
  expect(near(px(20, 20), PART_BASE[PART.skin], 2)).toBe(true);
  // And the palette stops dyeing waders that a drawing covers.
  expect(paletteFor({ waders: 'waders_jeans' }, ['waders_jeans']).targets[PART.waders]).toBeNull();
});

test('drawn boots go on over the outfit, and the boots dye gives way to them', () => {
  const outfit = new Uint8ClampedArray(W * H * 4);
  for (let y = 34; y <= 39; y += 1) for (let x = 16; x <= 26; x += 1) outfit.set([60, 80, 140, 255], (y * W + x) * 4);
  const boots = new Uint8ClampedArray(W * H * 4);
  for (let y = 37; y <= 39; y += 1) for (let x = 16; x <= 26; x += 1) boots.set([112, 72, 42, 255], (y * W + x) * 4);
  const { pixels, mask } = scene();
  const look = { waders: 'waders_jeans', boots: 'boots_brown' };
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [FRAME], palette: paletteFor(look), outfitOver: outfit, bootsOver: boots });
  const px = (x, y) => { const i = (y * W + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
  // Where the two drawings overlap the boots win — they are worn over the hem, not under it.
  expect(near(px(20, 38), [112, 72, 42], 20)).toBe(true);
  expect(near(px(20, 35), [60, 80, 140], 20)).toBe(true);
  expect(paletteFor(look).targets[PART.boots]).toBeNull();
  // A dyed boot is still a dye, and no drawing is copied for it.
  expect(paletteFor({ boots: 'boots_red' }).boots).toBeNull();
  expect(paletteFor({ boots: 'boots_red' }).targets[PART.boots]).toEqual(WARDROBE.boots_red.tint);
});

test('gear is dyed in place and skin is moved to another of the artist\'s ramps', () => {
  const px = paint({ skin: 'deep', rod: 'rod_gold', shirt: 'shirt_navy' });
  // The scene's skin is the art's own mid-tone, so it lands on the deep ramp's matching band.
  const band = bandOf(PART_BASE[PART.skin], SKIN_BODY);
  expect(near(px(20, 26), skinRampFor('deep')[band], 12)).toBe(true);
  // And the shading survives, because the pixel is moved rather than rebuilt from its brightness.
  expect(shiftPixel([120, 80, 52], SKIN_BODY, skinRampFor('deep'))).not.toEqual(shiftPixel([200, 130, 82], SKIN_BODY, skinRampFor('deep')));
  expect(px(36, 35).r).toBeGreaterThan(px(36, 35).b);
  expect(px(20, 35).b).toBeGreaterThan(px(20, 35).r);
});

test('a frame with no anchors is only dyed', () => {
  const { pixels, mask } = scene();
  const before = pixels.slice();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [], palette: paletteFor({ skin: 'deep', hat: 'cap_green' }), beard: beardOverlay() });
  expect(pixels[(26 * W + 20) * 4]).toBeLessThan(before[(26 * W + 20) * 4]);
  // Nothing went on the head: the headroom above it is still open.
  expect(pixels[(9 * W + 20) * 4 + 3]).toBe(0);
});

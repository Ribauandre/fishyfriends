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

test('a cap is built over the crown with its peak out past the face', () => {
  const px = paint({ hat: 'cap_red' });
  expect(near(px(20, 14), WARDROBE.cap_red.rgb, 70)).toBe(true);
  // It stands a little proud of the skull, into the headroom above it.
  expect(px(20, 9).a).toBe(255);
  // The peak juts out on the side the head is turned to, and nothing juts out behind.
  expect(px(34, 21).a).toBe(255);
  expect(near(px(34, 21), WARDROBE.cap_red.trim, 70)).toBe(true);
  expect(px(8, 21).a).toBe(0);
  // The face keeps its own skin.
  expect(near(px(24, 28), PART_BASE[PART.skin], 2)).toBe(true);
});

test('a beanie is the crown in its colour, banded, with a pompom above the head', () => {
  const px = paint({ hat: 'hat_beanie' });
  const { rgb, trim } = WARDROBE.hat_beanie;
  expect(near(px(20, 12), rgb, 70)).toBe(true);
  expect(near(px(20, 20), trim, 70)).toBe(true);
  expect(px(21, 4).a).toBe(255);
  // No peak: a beanie has none.
  expect(px(34, 21).a).toBe(0);
});

test('a straw hat adds a wide brim past the head, with a band round the crown', () => {
  const px = paint({ hat: 'hat_straw' });
  expect(px(6, 20).a).toBe(255);
  expect(px(36, 20).a).toBe(255);
  expect(near(px(20, 17), WARDROBE.hat_straw.trim, 70)).toBe(true);
});

test('a visor is a band and a peak on a head that keeps its own crown', () => {
  const px = paint({ hat: 'hat_visor', hairstyle: 'bald' });
  expect(px(34, 19).a).toBe(255);
  // Bald under it: the crown is the art's own skin, not the visor's colour.
  expect(near(px(20, 12), PART_BASE[PART.skin], 2)).toBe(true);
  const haired = paint({ hat: 'hat_visor', hairstyle: 'short', hair: 'black' });
  expect(near(haired(20, 12), HAIR_COLORS.black.rgb, 80)).toBe(true);
});

test('a beard is painted onto the jaw, high at the sideburn and low at the chin', () => {
  const full = paint({ beard: 'full', hair: 'black' });
  expect(near(full(14, 27), HAIR_COLORS.black.rgb, 80)).toBe(true);
  expect(near(full(14, 20), PART_BASE[PART.skin], 2)).toBe(true);
  // It rides up to the ear: on the same row the sideburn is beard and the chin is still bare.
  expect(near(full(14, 29), HAIR_COLORS.black.rgb, 80)).toBe(true);
  expect(near(full(29, 29), PART_BASE[PART.skin], 2)).toBe(true);
  const goatee = paint({ beard: 'goatee', hair: 'black' });
  expect(near(goatee(28, 31), HAIR_COLORS.black.rgb, 80)).toBe(true);
  expect(near(goatee(14, 31), PART_BASE[PART.skin], 2)).toBe(true);
  const mustache = paint({ beard: 'mustache', hair: 'black' });
  expect(near(mustache(28, 27), HAIR_COLORS.black.rgb, 80)).toBe(true);
  expect(near(mustache(28, 31), PART_BASE[PART.skin], 2)).toBe(true);
  // Stubble is the same shape, thinned to every other pixel.
  const stubble = paint({ beard: 'stubble', hair: 'black' });
  expect(stubble(14, 29).r).toBeLessThan(bare(14, 29).r);
  expect(near(stubble(15, 29), PART_BASE[PART.skin], 2)).toBe(true);
});

test('skin and gear are dyed in place, shading and all', () => {
  const px = paint({ skin: 'deep', rod: 'rod_gold', shirt: 'shirt_navy' });
  expect(near(px(20, 26), SKIN_TONES.deep.rgb, 40)).toBe(true);
  expect(px(36, 35).r).toBeGreaterThan(px(36, 35).b);
  expect(px(20, 35).b).toBeGreaterThan(px(20, 35).r);
});

test('every frame of a strip is dressed where its own anchors say', () => {
  const one = scene();
  const pixels = new Uint8ClampedArray(W * 2 * H * 4);
  const mask = new Uint8ClampedArray(W * 2 * H * 4);
  // The same head twice, the second one a frame along and four pixels to the right.
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const from = (y * W + x) * 4;
    [[x, 0], [x + 4, W]].forEach(([tx, ox]) => { if (tx < W) { const to = (y * W * 2 + ox + tx) * 4; pixels.set(one.pixels.slice(from, from + 4), to); mask[to] = one.mask[from]; } });
  }
  const second = { head: { ...FRAME.head, x0: FRAME.head.x0 + 4, x1: FRAME.head.x1 + 4 }, facing: 'right' };
  paintPixels({ pixels, mask, width: W * 2, height: H, frameWidth: W, anchors: [FRAME, second], palette: paletteFor({ hat: 'cap_red' }) });
  const px = (x, y) => { const i = (y * W * 2 + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
  expect(near(px(20, 14), WARDROBE.cap_red.rgb, 70)).toBe(true);
  expect(near(px(W + 24, 14), WARDROBE.cap_red.rgb, 70)).toBe(true);
  // The second frame's peak moved with its head.
  expect(px(W + 38, 21).a).toBe(255);
});

test('a frame with no anchors is only dyed', () => {
  const { pixels, mask } = scene();
  const before = pixels.slice();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [], palette: paletteFor({ skin: 'deep', hat: 'cap_red' }) });
  expect(pixels[(26 * W + 20) * 4]).toBeLessThan(before[(26 * W + 20) * 4]);
  // Nothing was built on the head: the headroom above it is still open.
  expect(pixels[(9 * W + 20) * 4 + 3]).toBe(0);
});

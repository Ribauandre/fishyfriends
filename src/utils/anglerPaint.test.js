import { tintPixel, facingOf, frontness, paintPixels, OUTLINE } from './anglerPaint';
import { PART, PART_BASE, WARDROBE, SKIN_TONES, HAIR_COLORS, paletteFor } from './anglerLook';

// A tiny frame in profile, facing right: a cap with a peak past the face, a face, a beard
// whose back two columns are the nape, and a jacket. Everything else is open.
const W = 40; const H = 40;
const FRAME = { hat: { x0: 10, y0: 4, x1: 34, y1: 14 }, face: { x0: 16, y0: 15, x1: 29, y1: 21 }, beard: { x0: 14, y0: 22, x1: 29, y1: 28 } };
function scene() {
  const pixels = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8ClampedArray(W * H * 4);
  const fill = (x0, y0, x1, y1, part, rgb) => {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) { const i = (y * W + x) * 4; pixels.set([...rgb, 255], i); mask[i] = part; }
  };
  fill(10, 4, 29, 14, PART.hat, PART_BASE[PART.hat]);
  fill(31, 11, 34, 14, PART.hat, PART_BASE[PART.hat]);
  fill(16, 15, 29, 21, PART.skin, PART_BASE[PART.skin]);
  fill(14, 22, 29, 28, PART.beard, PART_BASE[PART.beard]);
  fill(8, 29, 31, 39, PART.jacket, [60, 70, 50]);
  return { pixels, mask };
}
function paint(look, frame = FRAME) {
  const { pixels, mask } = scene();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [frame], palette: paletteFor(look, Object.keys(WARDROBE)) });
  return (x, y) => { const i = (y * W + x) * 4; return { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2], a: pixels[i + 3] }; };
}
const near = (px, rgb, tolerance = 60) => Math.abs(px.r - rgb[0]) <= tolerance && Math.abs(px.g - rgb[1]) <= tolerance && Math.abs(px.b - rgb[2]) <= tolerance;

test('tintPixel keeps a pixel\'s shading relative to its part\'s mid-tone', () => {
  expect(tintPixel([220, 103, 38], PART_BASE[PART.skin], [86, 52, 34])).toEqual([86, 52, 34]);
  const dark = tintPixel([110, 52, 19], PART_BASE[PART.skin], [86, 52, 34]);
  expect(dark[0]).toBeLessThan(86);
});

test('a frame\'s facing and a column\'s frontness come from the anchors', () => {
  expect(facingOf(FRAME)).toBe('right');
  expect(facingOf({ ...FRAME, face: { x0: 10, y0: 15, x1: 33, y1: 21 } })).toBe('front');
  expect(facingOf({ ...FRAME, face: { x0: 11, y0: 15, x1: 22, y1: 21 } })).toBe('left');
  expect(facingOf({ hat: FRAME.hat, face: null, beard: null })).toBe('back');
  expect(frontness(29, FRAME.face, 'right')).toBe(1);
  expect(frontness(14, FRAME.face, 'right')).toBeLessThan(0);
  expect(frontness(16, FRAME.face, 'left')).toBe(1);
  expect(frontness(22.5, { x0: 16, x1: 29 }, 'front')).toBeCloseTo(1, 5);
});

test('a cap is dyed in place, peak and all', () => {
  const px = paint({ hat: 'cap_red' });
  expect(px(20, 9).r).toBeGreaterThan(px(20, 9).g);
  expect(px(33, 12).a).toBe(255);
  expect(px(33, 12).r).toBeGreaterThan(px(33, 12).g);
});

test('a bare head loses the peak and the cap\'s extra height and becomes a shaded scalp', () => {
  const px = paint({ hat: 'hat_none', hairstyle: 'bald' });
  expect(px(33, 12).a).toBe(0);
  expect(px(20, 4).a).toBe(0);
  expect(px(20, 5).a).toBe(0);
  expect(near(px(20, 9), SKIN_TONES.medium.rgb, 70)).toBe(true);
  // Lit from the top, darker down the back.
  expect(px(20, 7).r).toBeGreaterThan(px(20, 13).r);
  // The silhouette gets the art's line back.
  expect(near(px(10, 9), OUTLINE, 6)).toBe(true);
  // With no hair, the nape is skin too.
  expect(near(px(14, 25), SKIN_TONES.medium.rgb, 80)).toBe(true);
});

test('hair is the crown in the hair colour, with a highlight and a darker hairline', () => {
  const px = paint({ hat: 'hat_none', hairstyle: 'short', hair: 'blond' });
  expect(near(px(20, 10), HAIR_COLORS.blond.rgb, 80)).toBe(true);
  expect(px(20, 7).r).toBeGreaterThan(px(20, 10).r);
  // The row against the face is darker hair, not a line.
  expect(px(20, 14).r).toBeLessThan(px(20, 12).r);
  expect(px(20, 14).r).toBeGreaterThan(OUTLINE[0] + 20);
});

test('long hair hangs down the back of the neck in the open, with its own line', () => {
  const px = paint({ hat: 'hat_none', hairstyle: 'long', hair: 'red' });
  expect(px(9, 20).a).toBe(255);
  expect(near(px(9, 20), HAIR_COLORS.red.rgb, 90)).toBe(true);
  expect(near(px(8, 20), OUTLINE, 6)).toBe(true);
  // The face is never painted over.
  expect(near(px(20, 18), PART_BASE[PART.skin], 2)).toBe(true);
});

test('a beanie is the crown in its colour, banded, with a pompom above the head', () => {
  const px = paint({ hat: 'hat_beanie' });
  const { rgb, trim } = WARDROBE.hat_beanie;
  expect(near(px(20, 7), rgb, 70)).toBe(true);
  expect(px(20, 2).a).toBe(255);
  expect(near(px(20, 2), trim, 60)).toBe(true);
  // The cap's peak is gone.
  expect(px(33, 12).a).toBe(0);
});

test('a straw hat adds a wide brim past the head', () => {
  const px = paint({ hat: 'hat_straw' });
  expect(px(4, 15).a).toBe(255);
  // Lined top and bottom, straw between.
  expect(near(px(5, 15), OUTLINE, 6)).toBe(true);
  expect(near(px(5, 16), WARDROBE.hat_straw.rgb, 80)).toBe(true);
  // The band round the crown is the trim colour.
  expect(near(px(20, 13), WARDROBE.hat_straw.trim, 60)).toBe(true);
});

test('a visor keeps the cap\'s peak in its own colour on the hairstyle\'s crown', () => {
  const px = paint({ hat: 'hat_visor', hairstyle: 'bald' });
  expect(px(33, 12).a).toBe(255);
  expect(px(33, 12).r).toBeGreaterThan(150);
  expect(near(px(20, 8), SKIN_TONES.medium.rgb, 70)).toBe(true);
});

test('the beard is cut down to a jaw of the skin, keeping what a style keeps and the nape', () => {
  const clean = paint({ beard: 'none' });
  expect(near(clean(27, 25), SKIN_TONES.medium.rgb, 70)).toBe(true);
  expect(near(clean(14, 25), PART_BASE[PART.beard], 2)).toBe(true);
  expect(near(clean(29, 25), OUTLINE, 6)).toBe(true);
  const goatee = paint({ beard: 'goatee' });
  expect(near(goatee(27, 27), PART_BASE[PART.beard], 2)).toBe(true);
  expect(near(goatee(18, 27), SKIN_TONES.medium.rgb, 70)).toBe(true);
  expect(near(goatee(26, 23), PART_BASE[PART.beard], 2)).toBe(true);
  const mustache = paint({ beard: 'mustache' });
  expect(near(mustache(26, 23), PART_BASE[PART.beard], 2)).toBe(true);
  expect(near(mustache(27, 27), SKIN_TONES.medium.rgb, 70)).toBe(true);
  const stubble = paint({ beard: 'stubble' });
  expect(stubble(26, 26).g).toBeLessThan(clean(26, 26).g);
  // A kept beard is dyed to the hair colour.
  const grey = paint({ hair: 'grey' });
  expect(near(grey(27, 25), HAIR_COLORS.grey.rgb, 60)).toBe(true);
});

test('a frame with no anchors is only dyed', () => {
  const { pixels, mask } = scene();
  const before = pixels.slice();
  paintPixels({ pixels, mask, width: W, height: H, frameWidth: W, anchors: [], palette: paletteFor({ skin: 'deep', hat: 'hat_none' }) });
  expect(pixels[(18 * W + 20) * 4]).toBeLessThan(before[(18 * W + 20) * 4]);
  expect(pixels[(9 * W + 20) * 4 + 3]).toBe(255);
});

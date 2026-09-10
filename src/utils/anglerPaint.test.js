import { tintPixel, jawBox, paintPixels, placeOn, PLACEMENTS, renderAngler, renderStill, canPaint } from './anglerPaint';
import { PART, PART_BASE, paletteFor, SKIN_TONES, WARDROBE } from './anglerLook';

// A three-frame strip, one pixel per part per frame, with the head box over the top-left
// corner of each frame so its jaw covers the two skin pixels on the bottom row and not the
// one at the top.
function makeStrip() {
  const frameWidth = 12; const width = 36; const height = 4;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8ClampedArray(width * height * 4);
  const put = (x, y, part, rgb) => { const i = (y * width + x) * 4; pixels.set([...rgb, 255], i); mask[i] = part; };
  for (let f = 0; f < 3; f += 1) {
    const o = f * frameWidth;
    put(o + 1, 0, PART.skin, PART_BASE[PART.skin]);
    put(o + 3, 3, PART.skin, PART_BASE[PART.skin]);
    put(o + 4, 3, PART.skin, PART_BASE[PART.skin]);
    put(o + 5, 1, PART.shirt, PART_BASE[PART.shirt]);
    put(o + 6, 1, PART.vest, PART_BASE[PART.vest]);
    put(o + 7, 3, PART.pants, PART_BASE[PART.pants]);
    put(o + 8, 3, PART.boots, PART_BASE[PART.boots]);
    put(o + 10, 1, PART.rod, PART_BASE[PART.rod]);
    put(o + 11, 1, PART.outline, [0, 0, 0]);
  }
  const anchors = [0, 1, 2].map(() => ({ head: { x0: 0, y0: 0, x1: 4, y1: 3 } }));
  const at = (x, y) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
  return { pixels, mask, width, height, frameWidth, anchors, at };
}

test('tinting keeps the shading: highlights stay lighter than folds', () => {
  const base = [220, 103, 38];
  const light = tintPixel([245, 185, 140], base, [86, 52, 34]);
  const dark = tintPixel([160, 70, 30], base, [86, 52, 34]);
  expect(light[0]).toBeGreaterThan(dark[0]);
  expect(tintPixel(base, base, [100, 50, 25])).toEqual([100, 50, 25]);
  // Nothing blows out or goes negative.
  tintPixel([255, 255, 255], [10, 10, 10], [200, 200, 200]).forEach((v) => expect(v).toBeLessThanOrEqual(255));
});

test('the jaw is the lower, forward part of the head box', () => {
  const jaw = jawBox({ x0: 40, y0: 10, x1: 79, y1: 49 });
  expect(jaw.x0).toBeGreaterThan(40);
  expect(jaw.x1).toBe(79);
  expect(jaw.y0).toBeGreaterThan(10);
  expect(jaw.y1).toBe(49);
  expect(jawBox(null)).toBeNull();
});

test('the stock look leaves every pixel as drawn', () => {
  const strip = makeStrip();
  const before = Array.from(strip.pixels);
  paintPixels({ ...strip, palette: paletteFor({}) });
  expect(Array.from(strip.pixels)).toEqual(before);
});

test('dyes land on their parts and nothing else', () => {
  const strip = makeStrip();
  paintPixels({ ...strip, palette: paletteFor({ skin: 'deep', rod: 'rod_red', boots: 'boots_yellow', vest: 'vest_navy', pants: 'pants_khaki' }) });
  expect(strip.at(1, 0).slice(0, 3)).toEqual(SKIN_TONES.deep.rgb);
  expect(strip.at(6, 1).slice(0, 3)).toEqual(WARDROBE.vest_navy.tint);
  expect(strip.at(7, 3).slice(0, 3)).toEqual(WARDROBE.pants_khaki.tint);
  expect(strip.at(8, 3).slice(0, 3)).toEqual(WARDROBE.boots_yellow.tint);
  expect(strip.at(10, 1).slice(0, 3)).toEqual(WARDROBE.rod_red.tint);
  // The shirt and the outline are never dyed.
  expect(strip.at(5, 1).slice(0, 3)).toEqual(PART_BASE[PART.shirt]);
  expect(strip.at(11, 1)).toEqual([0, 0, 0, 255]);
  // Every frame got the same treatment.
  expect(strip.at(12 + 1, 0).slice(0, 3)).toEqual(SKIN_TONES.deep.rgb);
  expect(strip.at(24 + 6, 1).slice(0, 3)).toEqual(WARDROBE.vest_navy.tint);
});

test('stubble dithers the jaw and leaves the rest of the skin alone', () => {
  const strip = makeStrip();
  paintPixels({ ...strip, palette: paletteFor({ beard: 'stubble', hair: 'black' }) });
  // (x + y) even pixels inside the jaw carry the stubble mix, odd ones stay skin.
  expect(strip.at(3, 3)[0]).toBeLessThan(strip.at(4, 3)[0]);
  expect(strip.at(4, 3).slice(0, 3)).toEqual(PART_BASE[PART.skin]);
  // The forehead is outside the jaw, so it is untouched even on an even pixel.
  expect(strip.at(1, 0).slice(0, 3)).toEqual(PART_BASE[PART.skin]);
  // Clean-shaven dithers nothing.
  const shaved = makeStrip();
  paintPixels({ ...shaved, palette: paletteFor({ beard: 'none' }) });
  expect(shaved.at(3, 3).slice(0, 3)).toEqual(PART_BASE[PART.skin]);
});

test('drawings are placed against the head box and scale with it', () => {
  const frame = { head: { x0: 60, y0: 10, x1: 99, y1: 49 } };
  const cap = placeOn(frame, 'cap', 1.25);
  expect(cap.w).toBeCloseTo(40 * PLACEMENTS.cap.w, 5);
  expect(cap.h).toBeCloseTo(cap.w / 1.25, 5);
  expect(cap.y + cap.h).toBeCloseTo(10 + 40 * PLACEMENTS.cap.bottom, 5);
  expect(cap.x + cap.w / 2).toBeCloseTo(80 + 40 * PLACEMENTS.cap.cx, 5);
  const goatee = placeOn(frame, 'beard_goatee', 1);
  expect(goatee.y).toBeCloseTo(10 + 40 * PLACEMENTS.beard_goatee.top, 5);
  expect(goatee.w).toBeLessThan(40);
  // A frame with no head box (nothing found in the art) places nothing.
  expect(placeOn({ head: null }, 'cap', 1)).toBeNull();
  expect(placeOn(frame, 'not_a_part', 1)).toBeNull();
});

test('without a canvas nothing is painted and the stock art stands in', async () => {
  expect(canPaint()).toBe(false);
  expect(await renderAngler({ skin: 'fair' })).toBeNull();
  expect(await renderStill({ skin: 'fair' })).toBeNull();
  expect(await renderAngler({})).toBeNull();
});

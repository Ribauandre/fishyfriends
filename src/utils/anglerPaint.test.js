import { tintPixel, jawPixel, paintPixels, placeOn, PLACEMENTS, renderAngler, renderStill, canPaint } from './anglerPaint';
import { PART, PART_BASE, paletteFor, SKIN_TONES, HAIR_COLORS, WARDROBE } from './anglerLook';

// A three-frame strip, one pixel per part per frame, plus a cap brim pixel past the face.
function makeStrip() {
  const frameWidth = 12; const width = 36; const height = 4;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8ClampedArray(width * height * 4);
  const put = (x, y, part, rgb) => { const i = (y * width + x) * 4; pixels.set([...rgb, 255], i); mask[i] = part; };
  for (let f = 0; f < 3; f += 1) {
    const o = f * frameWidth;
    put(o + 1, 0, PART.hat, PART_BASE[PART.hat]);
    put(o + 2, 0, PART.panel, PART_BASE[PART.panel]);
    put(o + 9, 2, PART.hat, [30, 70, 60]); // brim: past the face, low on the cap
    put(o + 3, 1, PART.skin, PART_BASE[PART.skin]);
    put(o + 4, 2, PART.beard, PART_BASE[PART.beard]);
    put(o + 5, 2, PART.beard, [40, 20, 10]);
    put(o + 6, 3, PART.jacket, [86, 83, 50]);
    put(o + 7, 3, PART.waders, PART_BASE[PART.waders]);
    put(o + 8, 3, PART.boots, PART_BASE[PART.boots]);
    put(o + 10, 1, PART.rod, PART_BASE[PART.rod]);
    put(o + 11, 1, PART.outline, [0, 0, 0]);
  }
  const anchors = [0, 1, 2].map(() => ({ hat: { x0: 1, y0: 0, x1: 9, y1: 2 }, beard: { x0: 4, y0: 2, x1: 5, y1: 2 }, face: { x0: 2, y0: 1, x1: 5, y1: 2 } }));
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

test('jaw pixels are near-flat skin, a touch darker than the cheek', () => {
  const skin = [220, 103, 38];
  const fromLight = jawPixel([130, 65, 35], skin);
  const fromDark = jawPixel([40, 20, 10], skin);
  fromLight.forEach((v, i) => expect(v).toBeLessThanOrEqual(skin[i]));
  expect(fromLight[0] - fromDark[0]).toBeLessThan(30);
});

test('the stock look leaves every pixel as drawn', () => {
  const strip = makeStrip();
  const before = Array.from(strip.pixels);
  paintPixels({ ...strip, palette: paletteFor({}) });
  expect(Array.from(strip.pixels)).toEqual(before);
});

test('dyes land on their parts and nothing else', () => {
  const strip = makeStrip();
  paintPixels({ ...strip, palette: paletteFor({ skin: 'deep', hair: 'grey', hat: 'cap_red', rod: 'rod_red', boots: 'boots_yellow', waders: 'waders_navy' }) });
  expect(strip.at(3, 1).slice(0, 3)).toEqual(SKIN_TONES.deep.rgb);
  expect(strip.at(4, 2).slice(0, 3)).toEqual(HAIR_COLORS.grey.rgb);
  expect(strip.at(1, 0).slice(0, 3)).toEqual(WARDROBE.cap_red.tint);
  expect(strip.at(2, 0).slice(0, 3)).toEqual(PART_BASE[PART.panel]);
  expect(strip.at(7, 3).slice(0, 3)).toEqual(WARDROBE.waders_navy.tint);
  expect(strip.at(8, 3).slice(0, 3)).toEqual(WARDROBE.boots_yellow.tint);
  expect(strip.at(10, 1).slice(0, 3)).toEqual(WARDROBE.rod_red.tint);
  expect(strip.at(6, 3).slice(0, 3)).toEqual([86, 83, 50]);
  expect(strip.at(11, 1)).toEqual([0, 0, 0, 255]);
  // Every frame got the same treatment.
  expect(strip.at(12 + 3, 1).slice(0, 3)).toEqual(SKIN_TONES.deep.rgb);
  expect(strip.at(24 + 1, 0).slice(0, 3)).toEqual(WARDROBE.cap_red.tint);
});

test('a clean shave turns the beard into jaw; stubble dithers it', () => {
  const shaved = makeStrip();
  paintPixels({ ...shaved, palette: paletteFor({ beard: 'none' }) });
  const jaw = shaved.at(4, 2).slice(0, 3);
  expect(jaw[0]).toBeGreaterThan(150);
  expect(jaw[0]).toBeLessThanOrEqual(220);
  expect(Math.abs(shaved.at(4, 2)[0] - shaved.at(5, 2)[0])).toBeLessThan(30);

  const stubble = makeStrip();
  paintPixels({ ...stubble, palette: paletteFor({ beard: 'stubble', hair: 'black' }) });
  // (x + y) even pixels carry the stubble mix, odd ones plain jaw.
  expect(stubble.at(4, 2)[0]).toBeLessThan(stubble.at(5, 2)[0]);
  // A full beard in another colour is a dye, not a shave.
  const bearded = makeStrip();
  paintPixels({ ...bearded, palette: paletteFor({ beard: 'full', hair: 'blond' }) });
  expect(bearded.at(4, 2).slice(0, 3)).toEqual(HAIR_COLORS.blond.rgb);
});

test('other hats turn the cap into hair underneath; a bare head loses the brim', () => {
  const cowboy = makeStrip();
  paintPixels({ ...cowboy, palette: paletteFor({ hat: 'hat_cowboy', hair: 'blond' }) });
  expect(cowboy.at(1, 0).slice(0, 3)).toEqual(HAIR_COLORS.blond.rgb);
  expect(cowboy.at(9, 2)[3]).toBe(255);

  const bare = makeStrip();
  paintPixels({ ...bare, palette: paletteFor({ hat: 'hat_none', hair: 'blond' }) });
  expect(bare.at(1, 0).slice(0, 3)).toEqual(HAIR_COLORS.blond.rgb);
  expect(bare.at(9, 2)[3]).toBe(0);

  const bald = makeStrip();
  paintPixels({ ...bald, palette: paletteFor({ hat: 'hat_none', hairstyle: 'bald', skin: 'fair' }) });
  expect(bald.at(1, 0).slice(0, 3)).toEqual(SKIN_TONES.fair.rgb);
});

test('drawings are placed against the cap or beard box and scale with it', () => {
  const frame = { hat: { x0: 60, y0: 1, x1: 99, y1: 34 }, beard: { x0: 57, y0: 36, x1: 102, y1: 57 }, face: { x0: 57, y0: 15, x1: 102, y1: 57 } };
  const hat = placeOn(frame, 'hat', 1.25);
  expect(hat.w).toBeCloseTo(40 * PLACEMENTS.hat.w, 5);
  expect(hat.h).toBeCloseTo(hat.w / 1.25, 5);
  expect(hat.y + hat.h).toBeCloseTo(1 + 34 * PLACEMENTS.hat.bottom, 5);
  expect(hat.x + hat.w / 2).toBeCloseTo(80 + 40 * PLACEMENTS.hat.cx, 5);
  const goatee = placeOn(frame, 'beard_goatee', 1);
  expect(goatee.y).toBeCloseTo(36 + 22 * PLACEMENTS.beard_goatee.top, 5);
  expect(goatee.w).toBeLessThan(46);
  // Back-view frames have no beard box, so nothing is placed there.
  expect(placeOn({ hat: frame.hat, beard: null }, 'beard_mustache', 2)).toBeNull();
  expect(placeOn({ hat: null }, 'hat', 1)).toBeNull();
});

test('without a canvas nothing is painted and the stock art stands in', async () => {
  expect(canPaint()).toBe(false);
  expect(await renderAngler({ skin: 'fair' })).toBeNull();
  expect(await renderStill({ skin: 'fair' })).toBeNull();
  expect(await renderAngler({})).toBeNull();
});

import { paintPixels, tintPixel, shiftPixel, swapShade, bandOf, canPaint, renderAngler, renderStill, keylineHold, KEYLINE_HOLD, KEYLINE_FADE } from './anglerPaint';
import { PART, PART_BASE, PART_SHADES, SKIN_BODY, DEFAULT_LOOK, paletteFor, skinRampFor } from './anglerLook';

// A strip four pixels wide, one high, with one pixel per part we care about.
function strip(parts, colours) {
  const pixels = new Uint8ClampedArray(parts.length * 4);
  const mask = new Uint8ClampedArray(parts.length * 4);
  parts.forEach((part, i) => {
    mask[i * 4] = part; mask[i * 4 + 3] = 255;
    const [r, g, b] = colours[i];
    pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = 255;
  });
  return { pixels, mask };
}
const read = (pixels, i) => [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];

test('each part is recoloured the way that part is meant to be', () => {
  const parts = [PART.cap, PART.skin, PART.hair, PART.outline];
  const colours = [PART_BASE[PART.cap], PART_BASE[PART.skin], PART_BASE[PART.hair], [20, 20, 22]];
  const { pixels, mask } = strip(parts, colours);
  const palette = paletteFor({ skin: 'deep', hair: 'blond', hat: 'cap_red' });
  paintPixels({ pixels, mask, width: parts.length, height: 1, palette });

  // Gear swaps shades: a pixel of the shade the part is mostly drawn in lands on the target itself.
  expect(read(pixels, 0)).toEqual(swapShade(PART_BASE[PART.cap], PART_SHADES[PART.cap], palette.targets[PART.cap]));
  // Skin is moved between ramps rather than dyed, so it keeps its modelling.
  expect(read(pixels, 1)).toEqual(shiftPixel(PART_BASE[PART.skin], SKIN_BODY, skinRampFor('deep')));
  // Hair swaps shades too.
  expect(read(pixels, 2)).toEqual(swapShade(PART_BASE[PART.hair], PART_SHADES[PART.hair], palette.targets[PART.hair]));
  // His keyline is never touched, whatever he is wearing.
  expect(read(pixels, 3)).toEqual([20, 20, 22]);
});

test('a pixel in no part at all is left exactly as drawn', () => {
  // The reel, the rod's guides and a fish held up on the celebrate frames belong to no garment.
  // Nothing should ever recolour them, however much of the look is changed.
  const parts = [0, PART.vest];
  const colours = [[120, 170, 90], PART_BASE[PART.vest]];
  const { pixels, mask } = strip(parts, colours);
  paintPixels({ pixels, mask, width: 2, height: 1, palette: paletteFor({ vest: 'vest_rust', skin: 'deep' }) });
  expect(read(pixels, 0)).toEqual([120, 170, 90]);
  expect(read(pixels, 1)).not.toEqual(PART_BASE[PART.vest]);
});

test('a transparent pixel is skipped even where the mask claims it', () => {
  const { pixels, mask } = strip([PART.vest], [[100, 100, 60]]);
  pixels[3] = 0;
  paintPixels({ pixels, mask, width: 1, height: 1, palette: paletteFor({ vest: 'vest_rust' }) });
  expect(read(pixels, 0)).toEqual([100, 100, 60]);
});

test('the stock look changes nothing, so the unpainted strips are correct for it', () => {
  const parts = [PART.cap, PART.skin, PART.hair, PART.vest];
  const colours = [PART_BASE[PART.cap], PART_BASE[PART.skin], PART_BASE[PART.hair], PART_BASE[PART.vest]];
  const { pixels, mask } = strip(parts, colours);
  paintPixels({ pixels, mask, width: parts.length, height: 1, palette: paletteFor(DEFAULT_LOOK) });
  parts.forEach((part, i) => expect(read(pixels, i)).toEqual(colours[i]));
});

test('a dye keeps a pixel lighter or darker than its part, rather than flattening it', () => {
  const base = PART_BASE[PART.vest];
  const target = [160, 80, 40];
  const shadow = tintPixel(base.map((v) => Math.round(v * 0.6)), base, target);
  const mid = tintPixel(base, base, target);
  const highlight = tintPixel(base.map((v) => Math.min(255, Math.round(v * 1.5))), base, target);
  const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
  expect(lum(shadow)).toBeLessThan(lum(mid));
  expect(lum(mid)).toBeLessThan(lum(highlight));
  // A highlight lightens toward white rather than multiplying past it, so it stays in gamut and
  // keeps its hue instead of clipping two channels and leaving the third.
  expect(Math.max(...highlight)).toBeLessThanOrEqual(255);
  expect(highlight[0]).toBeGreaterThan(highlight[2]);
});

test('a skin pixel is moved by the step between bands, so shading survives the change', () => {
  const ramp = skinRampFor('deep');
  SKIN_BODY.forEach((band, i) => {
    expect(bandOf(band, SKIN_BODY)).toBe(i);
    expect(shiftPixel(band, SKIN_BODY, ramp)).toEqual(ramp[i].map((v) => Math.max(0, Math.min(255, v))));
  });
  // Two tones a step apart in his own ramp stay a step apart in the one he moves to: that is the
  // difference between moving a pixel and rebuilding it, and it is what keeps a face from going
  // flat and grey in its deepest tone.
  const dark = shiftPixel(SKIN_BODY[0], SKIN_BODY, ramp);
  const light = shiftPixel(SKIN_BODY[3], SKIN_BODY, ramp);
  expect(light[0]).toBeGreaterThan(dark[0]);
});

test('nothing is painted where there is no canvas, and the stock look is never painted', async () => {
  // jsdom has no 2d context, which is also the fallback path in a browser that refuses one: the
  // components show the stock strips instead.
  expect(canPaint()).toBe(false);
  await expect(renderAngler({ skin: 'deep' })).resolves.toBe(null);
  await expect(renderStill({ skin: 'deep' })).resolves.toBe(null);
  await expect(renderAngler(DEFAULT_LOOK)).resolves.toBe(null);
  await expect(renderAngler(null)).resolves.toBe(null);
});

test('the artist\'s line is never dyed, whatever part it is labelled', () => {
  // The masks are settled at working size, where his eye averages into the face and comes out
  // labelled hair, and the seams inside a garment carry the garment's label. A pixel that is the
  // drawing's own near-black stays exactly as drawn under every dye and every skin tone.
  const line = [8, 6, 9];
  const parts = [PART.hair, PART.cap, PART.skin, PART.vest];
  const { pixels, mask } = strip(parts, parts.map(() => line));
  paintPixels({ pixels, mask, width: parts.length, height: 1, palette: paletteFor({ skin: 'fair', hair: 'blond', hat: 'hat_boonie_white', vest: 'vest_rust' }) });
  parts.forEach((_, i) => expect(read(pixels, i)).toEqual(line));
  // The hold fades out through the softening the render put round every line, so there is no
  // step in it: full at the line's own brightness, none by the time a pixel is plainly shading.
  expect(keylineHold([KEYLINE_HOLD, KEYLINE_HOLD, KEYLINE_HOLD])).toBe(1);
  expect(keylineHold([KEYLINE_FADE, KEYLINE_FADE, KEYLINE_FADE])).toBe(0);
  const mid = (KEYLINE_HOLD + KEYLINE_FADE) / 2;
  expect(keylineHold([mid, mid, mid])).toBeCloseTo(0.5);
});

test('a skin pixel off the ramp is scaled, not pushed: half black stays half black', () => {
  // A pixel along the line of his eye is part skin and part the line. Moved by a difference it
  // came out grey-purple under the deep tone; moved by a ratio it is half the new skin.
  const ramp = skinRampFor('deep');
  const half = SKIN_BODY[2].map((v) => Math.round(v / 2));
  const moved = shiftPixel(half, SKIN_BODY, ramp);
  // Not clamped to black in any channel, and still warm — redder than it is blue, as every band
  // of every ramp is — rather than the grey-purple the difference left when it took red further
  // down than blue.
  moved.forEach((v) => expect(v).toBeGreaterThan(0));
  expect(moved[0]).toBeGreaterThan(moved[2]);
});

test('a dye on flat art is a palette swap: every drawn shade lands on one shade of the target', () => {
  const shades = PART_SHADES[PART.hair];
  const target = [156, 156, 156];
  const main = shades.list[shades.main];
  // The shade the part is mostly drawn in becomes the target exactly.
  expect(swapShade(main, shades, target)).toEqual(target);
  // Every darker shade becomes a darker grey, never a brown — that is the patch this replaces.
  shades.list.slice(0, shades.main).forEach((c) => {
    const out = swapShade(c, shades, target);
    expect(out[0]).toBe(out[1]); expect(out[1]).toBe(out[2]);
    expect(out[0]).toBeLessThan(target[0]);
  });
  // A softened pixel between two shades snaps to one of them rather than landing in between.
  const between = main.map((v, k) => Math.round((v + shades.list[0][k]) / 2));
  const outs = shades.list.map((c) => swapShade(c, shades, target).join(','));
  expect(outs).toContain(swapShade(between, shades, target).join(','));
  // And a lighter shade lightens, but never all the way to white.
  const top = shades.list[shades.list.length - 1];
  if (shades.list.length - 1 > shades.main) { const out = swapShade(top, shades, target); expect(out[0]).toBeGreaterThan(target[0]); expect(out[0]).toBeLessThan(255); }
});

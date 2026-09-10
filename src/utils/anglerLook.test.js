import {
  WARDROBE, WARDROBE_LIST, SLOTS, SKIN_TONES, HAIR_COLORS, DEFAULT_LOOK, PART,
  isOwned, normalizeLook, lookKey, isDefaultLook, tintPixel, partTargets, paintPixels, hatPlacement,
} from './anglerLook';

test('every rack has a free default and everything else costs points', () => {
  SLOTS.forEach((slot) => {
    const free = WARDROBE_LIST.filter((item) => item.slot === slot && item.cost === 0);
    expect(free.length).toBe(1);
    expect(DEFAULT_LOOK[slot]).toBe(free[0].key);
    expect(WARDROBE_LIST.filter((item) => item.slot === slot).length).toBeGreaterThan(3);
  });
  WARDROBE_LIST.forEach((item) => { expect(item.tint || item.overlay).toBeTruthy(); expect(item.cost).toBeGreaterThanOrEqual(0); });
});

test('a look only wears what is owned, and the rest falls back to the free defaults', () => {
  expect(isOwned('cap_green', [])).toBe(true);
  expect(isOwned('cap_red', [])).toBe(false);
  expect(isOwned('cap_red', ['cap_red'])).toBe(true);
  expect(isOwned('nothing', ['nothing'])).toBe(false);
  const wanted = { skin: 'deep', beard: 'goatee', hair: 'grey', hat: 'hat_cowboy', rod: 'rod_gold', boots: 'boots_yellow', waders: 'waders_navy' };
  expect(normalizeLook(wanted, ['hat_cowboy', 'boots_yellow'])).toEqual({ ...wanted, rod: 'rod_graphite', waders: 'waders_khaki' });
  expect(normalizeLook({ skin: 'purple', hat: 'rod_red', rod: 'cap_red' }, ['rod_red', 'cap_red'])).toEqual(DEFAULT_LOOK);
  expect(normalizeLook(undefined)).toEqual(DEFAULT_LOOK);
  expect(isDefaultLook({})).toBe(true);
  expect(lookKey({ skin: 'fair' })).not.toBe(lookKey({}));
});

test('tinting keeps the shading: highlights stay lighter than folds', () => {
  const base = [220, 103, 38];
  const deep = SKIN_TONES.deep.rgb;
  const lit = tintPixel([240, 170, 120], base, deep);
  const mid = tintPixel(base, base, deep);
  const dark = tintPixel([120, 50, 20], base, deep);
  expect(mid).toEqual(deep);
  expect(lit[0]).toBeGreaterThan(mid[0]);
  expect(dark[0]).toBeLessThan(mid[0]);
  // Never blows out or drops below the clamp band.
  expect(tintPixel([255, 255, 255], [10, 10, 10], [200, 200, 200])).toEqual([255, 255, 255]);
  expect(tintPixel([0, 0, 0], [200, 200, 200], [100, 100, 100])).toEqual([30, 30, 30]);
});

test('an overlay hat dyes the cap to the hair colour so nothing green shows past the brim', () => {
  const capTargets = partTargets({ hat: 'cap_red' });
  expect(capTargets[PART.hat]).toEqual(WARDROBE.cap_red.tint);
  expect(capTargets[PART.panel]).toBeNull();
  const overlayTargets = partTargets({ hat: 'hat_bucket', hair: 'blond' });
  expect(overlayTargets[PART.hat]).toEqual(HAIR_COLORS.blond.rgb);
  expect(overlayTargets[PART.panel]).toEqual(HAIR_COLORS.blond.rgb);
  expect(overlayTargets[PART.jacket]).toBeNull();
});

function makeStrip() {
  // A 6x2 "strip" of one frame: skin, beard x3 across, jacket, rod on the top row; waders, boots below.
  const width = 6, height = 2, frameWidth = 6;
  const parts = [PART.skin, PART.beard, PART.beard, PART.beard, PART.jacket, PART.rod, PART.waders, PART.boots, 0, PART.beard, PART.beard, PART.beard];
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8ClampedArray(width * height * 4);
  const base = { [PART.skin]: [220, 103, 38], [PART.beard]: [80, 40, 20], [PART.jacket]: [86, 83, 50], [PART.rod]: [48, 48, 48], [PART.waders]: [179, 138, 100], [PART.boots]: [24, 26, 27] };
  parts.forEach((part, index) => {
    mask[index * 4] = part;
    const rgb = base[part] || [0, 0, 0];
    pixels.set([...rgb, part ? 255 : 0], index * 4);
  });
  const anchors = [{ beard: { x0: 1, y0: 0, x1: 5, y1: 1 } }];
  return { pixels, mask, width, height, frameWidth, anchors };
}

test('painting recolours each part to the look and leaves the jacket and empty pixels alone', () => {
  const strip = makeStrip();
  paintPixels({ ...strip, look: { skin: 'deep', hair: 'grey', rod: 'rod_red', boots: 'boots_yellow', waders: 'waders_navy' } });
  const px = (index) => [...strip.pixels.slice(index * 4, index * 4 + 3)];
  expect(px(0)).toEqual(SKIN_TONES.deep.rgb);
  expect(px(1)).toEqual(HAIR_COLORS.grey.rgb);
  expect(px(4)).toEqual([86, 83, 50]);
  expect(px(5)).toEqual(WARDROBE.rod_red.tint);
  expect(px(6)).toEqual(WARDROBE.waders_navy.tint);
  expect(px(7)).toEqual(WARDROBE.boots_yellow.tint);
  expect(px(8)).toEqual([0, 0, 0]);
});

test('a clean shave turns the beard into face, and a goatee keeps only the middle of the chin', () => {
  const shaved = makeStrip();
  paintPixels({ ...shaved, look: { beard: 'none' } });
  const px = (strip, index) => [...strip.pixels.slice(index * 4, index * 4 + 3)];
  [1, 2, 3, 9, 10, 11].forEach((index) => expect(px(shaved, index)).toEqual(px(shaved, 1)));
  expect(px(shaved, 1)[0]).toBeGreaterThan(150);
  const goatee = makeStrip();
  paintPixels({ ...goatee, look: { beard: 'goatee', hair: 'black' } });
  // Top row of the beard box is above the chin line: shaved. Bottom row keeps the centre only.
  expect(px(goatee, 2)).toEqual(px(goatee, 1));
  expect(px(goatee, 9)).toEqual(HAIR_COLORS.black.rgb);
  expect(px(goatee, 10)).not.toEqual(HAIR_COLORS.black.rgb);
  expect(px(goatee, 11)).toEqual(px(goatee, 10));
});

test('an overlay hat is placed over the cap, wider than it and resting on the brim', () => {
  expect(hatPlacement(null)).toBeNull();
  const box = hatPlacement({ x0: 60, y0: 1, x1: 99, y1: 41 }, 1.25);
  expect(box.w).toBeCloseTo(52, 0);
  expect(box.x + box.w / 2).toBeCloseTo(80, 0);
  expect(box.y + box.h).toBeCloseTo(45, 0);
});

import {
  WARDROBE, WARDROBE_LIST, SLOTS, DEFAULT_LOOK, SKIN_TONES, HAIR_COLORS, HAIR_STYLES, BEARD_STYLES,
  isOwned, normalizeLook, lookKey, isDefaultLook, paletteFor, shade, mix, itemsFor,
} from './anglerLook';

test('every rack has a free default and everything else costs points', () => {
  SLOTS.forEach((slot) => {
    const items = itemsFor(slot);
    expect(items.some((item) => item.cost === 0)).toBe(true);
    expect(WARDROBE[DEFAULT_LOOK[slot]].slot).toBe(slot);
    expect(WARDROBE[DEFAULT_LOOK[slot]].cost).toBe(0);
  });
  WARDROBE_LIST.forEach((item) => { expect(item.cost).toBeGreaterThanOrEqual(0); expect(SLOTS).toContain(item.slot); });
  // Every hat has a style the renderer knows, and only the bare head has no colour.
  itemsFor('hat').forEach((hat) => { expect(typeof hat.style).toBe('string'); expect(hat.tint === null).toBe(hat.style === 'none'); });
});

test('the free choices are all real options', () => {
  expect(SKIN_TONES[DEFAULT_LOOK.skin]).toBeDefined();
  expect(HAIR_COLORS[DEFAULT_LOOK.hair]).toBeDefined();
  expect(HAIR_STYLES[DEFAULT_LOOK.hairstyle]).toBeDefined();
  expect(BEARD_STYLES[DEFAULT_LOOK.beard]).toBeDefined();
  expect(Object.keys(BEARD_STYLES)).toEqual(['full', 'goatee', 'mustache', 'stubble', 'none']);
  expect(Object.keys(HAIR_STYLES)).toEqual(['short', 'long', 'bald']);
});

test('a look only wears what is owned, and the rest falls back to the free defaults', () => {
  expect(isOwned('cap_green')).toBe(true);
  expect(isOwned('hat_none')).toBe(true);
  expect(isOwned('cap_red')).toBe(false);
  expect(isOwned('cap_red', ['cap_red'])).toBe(true);
  expect(isOwned('nope', ['nope'])).toBe(false);

  const wanted = { skin: 'deep', hairstyle: 'long', hair: 'grey', beard: 'stubble', hat: 'cap_red', rod: 'rod_gold', boots: 'boots_yellow', waders: 'waders_navy' };
  expect(normalizeLook(wanted, ['cap_red', 'boots_yellow'])).toEqual({ ...wanted, rod: 'rod_graphite', waders: 'waders_khaki' });
  // Wrong slot, unknown keys and junk values all fall through.
  expect(normalizeLook({ hat: 'rod_red', rod: 'cap_red', skin: 'purple', beard: 'braided', hairstyle: 'mohawk' }, ['rod_red', 'cap_red'])).toEqual(DEFAULT_LOOK);
  expect(normalizeLook(null)).toEqual(DEFAULT_LOOK);
});

test('lookKey names every choice and isDefaultLook spots the stock angler', () => {
  expect(lookKey({})).toBe('medium|short|auburn|full|cap_green|rod_graphite|boots_green|waders_khaki');
  expect(lookKey({ skin: 'fair', beard: 'none', hat: 'hat_cowboy', hairstyle: 'bald' })).toBe('fair|bald|auburn|none|hat_cowboy|rod_graphite|boots_green|waders_khaki');
  expect(isDefaultLook({})).toBe(true);
  expect(isDefaultLook({ hat: 'cap_green', rod: 'rod_graphite' })).toBe(true);
  expect(isDefaultLook({ skin: 'fair' })).toBe(false);
});

test('shade and mix stay inside 0-255 and preserve the hue', () => {
  expect(shade([200, 100, 50], 0.5)).toEqual([100, 50, 25]);
  expect(shade([200, 100, 50], 1.5)).toEqual([255, 150, 75]);
  expect(mix([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
});

test('the palette follows the look: skin, hair, hat style and every rack colour', () => {
  const pal = paletteFor({ skin: 'deep', hair: 'blond', hairstyle: 'long', beard: 'goatee', hat: 'hat_straw', rod: 'rod_red', boots: 'boots_yellow', waders: 'waders_navy' });
  expect(pal.skin.base).toEqual(SKIN_TONES.deep.rgb);
  expect(pal.hair.base).toEqual(HAIR_COLORS.blond.rgb);
  expect(pal.hairstyle).toBe('long');
  expect(pal.beard).toBe('goatee');
  expect(pal.hatStyle).toBe('straw');
  expect(pal.hat.base).toEqual(WARDROBE.hat_straw.tint);
  expect(pal.rod.base).toEqual(WARDROBE.rod_red.tint);
  expect(pal.boots.base).toEqual(WARDROBE.boots_yellow.tint);
  expect(pal.waders.base).toEqual(WARDROBE.waders_navy.tint);
  // Shading tones bracket the base colour.
  expect(pal.skin.shade[0]).toBeLessThan(pal.skin.base[0]);
  expect(pal.waders.light[2]).toBeGreaterThan(pal.waders.base[2]);
  // A bare head has no hat colour at all, and unowned picks are ignored by the palette too.
  expect(paletteFor({ hat: 'hat_none' }).hat).toBeNull();
  expect(paletteFor({ hat: 'hat_none' }).hatStyle).toBe('none');
  expect(paletteFor({ skin: 'nope' }).skin.base).toEqual(SKIN_TONES.medium.rgb);
});

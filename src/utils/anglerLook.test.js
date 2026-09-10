import { DEFAULT_LOOK, WARDROBE, HAIR_COLORS, SKIN_TONES, PART, normalizeLook, lookKey, isDefaultLook, isOwned, itemsFor, paletteFor } from './anglerLook';

test('a look you cannot wear falls back to the free defaults, slot by slot', () => {
  expect(normalizeLook(null)).toEqual(DEFAULT_LOOK);
  expect(normalizeLook({ skin: 'nope', hat: 'hat_cowboy', beard: 'goatee' })).toEqual({ ...DEFAULT_LOOK, beard: 'goatee' });
  expect(normalizeLook({ hat: 'hat_cowboy' }, ['hat_cowboy']).hat).toBe('hat_cowboy');
  // A rod key in the hat slot is not a hat.
  expect(normalizeLook({ hat: 'rod_gold' }, ['rod_gold']).hat).toBe(DEFAULT_LOOK.hat);
  expect(isOwned('cap_green')).toBe(true);
  expect(isOwned('cap_red')).toBe(false);
  expect(isOwned('cap_red', ['cap_red'])).toBe(true);
});

test('the look key is the normalized look in a fixed order, so it can cache paints', () => {
  expect(lookKey(DEFAULT_LOOK)).toBe('medium|short|auburn|full|cap_green|rod_graphite|boots_green|waders_khaki');
  expect(lookKey({ skin: 'deep', hat: 'hat_straw' })).toBe('deep|short|auburn|full|hat_straw|rod_graphite|boots_green|waders_khaki');
  expect(isDefaultLook({})).toBe(true);
  expect(isDefaultLook({ beard: 'none' })).toBe(false);
});

test('every rack item has a slot, a price and, for a hat, the kind the painter sculpts', () => {
  Object.entries(WARDROBE).forEach(([key, item]) => {
    expect(['hat', 'rod', 'boots', 'waders']).toContain(item.slot);
    expect(item.cost).toBeGreaterThanOrEqual(0);
    if (item.slot === 'hat') {
      expect(['cap', 'none', 'visor', 'beanie', 'straw', 'bucket', 'cowboy']).toContain(item.kind);
      if (item.kind !== 'cap' && item.kind !== 'none') expect(item.rgb).toHaveLength(3);
      if (item.kind === 'cap' && key !== 'cap_green') expect(item.tint).toHaveLength(3);
    }
  });
  ['hat', 'rod', 'boots', 'waders'].forEach((slot) => expect(itemsFor(slot).some((item) => item.cost === 0)).toBe(true));
});

test('the default look dyes nothing and keeps the cap and the beard as drawn', () => {
  const palette = paletteFor(DEFAULT_LOOK);
  expect(Object.values(palette.targets).every((target) => target === null)).toBe(true);
  expect(palette.head).toEqual({ crown: 'cap', hat: null, hairBack: false, beard: 'keep', beardTint: null });
});

test('the head plan says what the cap and the beard become', () => {
  expect(paletteFor({ hat: 'cap_red' }).targets[PART.hat]).toEqual(WARDROBE.cap_red.tint);
  expect(paletteFor({ hat: 'cap_red' }).head.crown).toBe('cap');
  expect(paletteFor({ hat: 'hat_none', hairstyle: 'bald' }).head).toMatchObject({ crown: 'scalp', hat: null, hairBack: false });
  expect(paletteFor({ hat: 'hat_none', hairstyle: 'long' }).head).toMatchObject({ crown: 'hair', hairBack: true });
  expect(paletteFor({ hat: 'hat_beanie' }).head).toMatchObject({ crown: 'hat', hat: { kind: 'beanie', rgb: WARDROBE.hat_beanie.rgb, trim: WARDROBE.hat_beanie.trim } });
  // A visor sits on whatever the hairstyle makes of the crown.
  expect(paletteFor({ hat: 'hat_visor' }).head).toMatchObject({ crown: 'hair', hat: { kind: 'visor' } });
  expect(paletteFor({ hat: 'hat_visor', hairstyle: 'bald' }).head.crown).toBe('scalp');
  // Long hair hangs down the back under a cap too.
  expect(paletteFor({ hairstyle: 'long' }).head).toMatchObject({ crown: 'cap', hairBack: true });
  expect(paletteFor({ beard: 'none' }).head.beard).toBe('jaw');
  expect(paletteFor({ beard: 'goatee' }).head.beard).toBe('goatee');
  expect(paletteFor({ beard: 'stubble' }).head.beard).toBe('stubble');
  expect(paletteFor({ hair: 'grey' }).head.beardTint).toEqual(HAIR_COLORS.grey.rgb);
});

test('skin and gear are dyes, and the art\'s own colours are never dyed to themselves', () => {
  expect(paletteFor({ skin: 'deep' }).targets[PART.skin]).toEqual(SKIN_TONES.deep.rgb);
  expect(paletteFor({ skin: 'medium' }).targets[PART.skin]).toBeNull();
  const geared = paletteFor({ rod: 'rod_gold', boots: 'boots_red', waders: 'waders_navy' }, ['rod_gold', 'boots_red', 'waders_navy']);
  expect(geared.targets[PART.rod]).toEqual(WARDROBE.rod_gold.tint);
  expect(geared.targets[PART.boots]).toEqual(WARDROBE.boots_red.tint);
  expect(geared.targets[PART.waders]).toEqual(WARDROBE.waders_navy.tint);
});

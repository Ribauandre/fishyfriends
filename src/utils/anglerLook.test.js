import { DEFAULT_LOOK, WARDROBE, HAIR_COLORS, SKIN_TONES, SLOTS, PART, normalizeLook, lookKey, isDefaultLook, isOwned, itemsFor, paletteFor } from './anglerLook';

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
  expect(lookKey(DEFAULT_LOOK)).toBe('medium|bald|brown|none|hat_none|shirt_grey|rod_graphite|boots_green|waders_khaki');
  expect(lookKey({ skin: 'deep', hat: 'hat_straw' })).toBe('deep|bald|brown|none|hat_straw|shirt_grey|rod_graphite|boots_green|waders_khaki');
  expect(isDefaultLook({})).toBe(true);
  expect(isDefaultLook({ beard: 'full' })).toBe(false);
});

test('every rack item has a slot, a price and, for a hat, the kind the painter builds', () => {
  Object.values(WARDROBE).forEach((item) => {
    expect(SLOTS).toContain(item.slot);
    expect(item.cost).toBeGreaterThanOrEqual(0);
    if (item.slot === 'hat' && item.kind !== 'none') {
      expect(['cap', 'visor', 'beanie', 'straw', 'bucket', 'cowboy']).toContain(item.kind);
      expect(item.rgb).toHaveLength(3);
      expect(item.trim).toHaveLength(3);
    }
  });
  SLOTS.forEach((slot) => expect(itemsFor(slot).some((item) => item.cost === 0)).toBe(true));
});

test('the default look is the art as drawn: nothing dyed and nothing on the head', () => {
  const palette = paletteFor(DEFAULT_LOOK);
  expect(Object.values(palette.targets).every((target) => target === null)).toBe(true);
  expect(palette.head).toMatchObject({ crown: 'bare', hat: null, hairBack: false });
  expect(palette.head.beard.rise).toBe(0);
  expect(palette.head.beard.lip).toBe(false);
});

test('the head plan says what goes on the skull and what shape the beard takes', () => {
  expect(paletteFor({ hat: 'cap_red' }).head).toMatchObject({ crown: 'hat', hat: { kind: 'cap', rgb: WARDROBE.cap_red.rgb, trim: WARDROBE.cap_red.trim } });
  expect(paletteFor({ hairstyle: 'short' }).head).toMatchObject({ crown: 'hair', hairBack: false });
  expect(paletteFor({ hairstyle: 'long' }).head).toMatchObject({ crown: 'hair', hairBack: true });
  expect(paletteFor({ hat: 'hat_beanie' }).head.crown).toBe('hat');
  // A visor sits on whatever the hairstyle makes of the crown.
  expect(paletteFor({ hat: 'hat_visor', hairstyle: 'short' }).head).toMatchObject({ crown: 'hair', hat: { kind: 'visor' } });
  expect(paletteFor({ hat: 'hat_visor' }).head.crown).toBe('bare');
  // Long hair hangs down the back under a hat too.
  expect(paletteFor({ hat: 'cap_red', hairstyle: 'long' }).head).toMatchObject({ crown: 'hat', hairBack: true });
  expect(paletteFor({ beard: 'full' }).head.beard.rise).toBeGreaterThan(0);
  expect(paletteFor({ beard: 'goatee' }).head.beard.chinOnly).toBe(true);
  expect(paletteFor({ beard: 'stubble' }).head.beard.dither).toBe(true);
  expect(paletteFor({ hair: 'grey' }).hair).toEqual(HAIR_COLORS.grey.rgb);
});

test('skin and gear are dyes, and the art\'s own colours are never dyed to themselves', () => {
  expect(paletteFor({ skin: 'deep' }).targets[PART.skin]).toEqual(SKIN_TONES.deep.rgb);
  expect(paletteFor({ skin: 'medium' }).targets[PART.skin]).toBeNull();
  const geared = paletteFor({ rod: 'rod_gold', boots: 'boots_red', waders: 'waders_navy', shirt: 'shirt_navy' }, ['rod_gold', 'boots_red', 'waders_navy', 'shirt_navy']);
  expect(geared.targets[PART.rod]).toEqual(WARDROBE.rod_gold.tint);
  expect(geared.targets[PART.boots]).toEqual(WARDROBE.boots_red.tint);
  expect(geared.targets[PART.waders]).toEqual(WARDROBE.waders_navy.tint);
  expect(geared.targets[PART.shirt]).toEqual(WARDROBE.shirt_navy.tint);
});

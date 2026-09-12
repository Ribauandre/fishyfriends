import { DEFAULT_LOOK, WARDROBE, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, SLOTS, PART, normalizeLook, lookKey, isDefaultLook, isOwned, itemsFor, paletteFor } from './anglerLook';
import hatSprites from './hatSprites.json';
import hairSprites from './hairSprites.json';

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

test('every rack item has a slot, a price and, for a hat, a drawing to stamp', () => {
  Object.values(WARDROBE).forEach((item) => {
    expect(SLOTS).toContain(item.slot);
    expect(item.cost).toBeGreaterThanOrEqual(0);
    if (item.overlay) return;
    if (item.slot !== 'hat') return;
    if (item.sprite === null) return;
    expect(hatSprites.order).toContain(item.sprite);
    // A tinted hat says which drawing's colour it is measured against.
    if (item.tint) expect(item.base).toHaveLength(3);
  });
  SLOTS.forEach((slot) => expect(itemsFor(slot).some((item) => item.cost === 0)).toBe(true));
  // Every hairstyle but the bald one names a drawing too.
  Object.values(HAIR_STYLES).forEach((style) => { if (style.sprite) expect(hairSprites.order).toContain(style.sprite); });
});

test('the default look is the art as drawn: nothing dyed and nothing on the head', () => {
  const palette = paletteFor(DEFAULT_LOOK);
  expect(Object.values(palette.targets).every((target) => target === null)).toBe(true);
  expect(palette.head).toMatchObject({ hair: null, hat: null });
  expect(palette.head.beard.keep).toBe('none');
});

test('the head plan names the drawing to stamp and the part of the beard to keep', () => {
  expect(paletteFor({ hat: 'cap_red' }).head.hat).toMatchObject({ sprite: WARDROBE.cap_red.sprite, tint: null });
  expect(paletteFor({ hat: 'cap_black' }).head.hat).toMatchObject({ sprite: 'cap_olive', tint: WARDROBE.cap_black.tint });
  // Hair goes on whether or not a hat does — a cap leaves plenty of it showing.
  // The stock style is the artist's own, lifted pose by pose; the rest are stamped hairpieces.
  expect(paletteFor({ hairstyle: 'short' }).head.hair).toMatchObject({ overlay: true });
  expect(paletteFor({ hat: 'cap_red', hairstyle: 'long' }).head.hair).toMatchObject({ sprite: 'long' });
  expect(paletteFor({ hairstyle: 'bald' }).head.hair).toBeNull();
  expect(paletteFor({ beard: 'full' }).head.beard.keep).toBe('all');
  expect(paletteFor({ beard: 'goatee' }).head.beard.keep).toBe('chin');
  expect(paletteFor({ beard: 'mustache' }).head.beard.keep).toBe('lip');
  expect(paletteFor({ beard: 'stubble' }).head.beard.dither).toBe(true);
  expect(paletteFor({ hair: 'grey' }).hair).toEqual(HAIR_COLORS.grey.rgb);
});

test('skin and gear are dyes, and the art\'s own colours are never dyed to themselves', () => {
  expect(paletteFor({ skin: 'deep' }).targets[PART.skin]).toEqual(SKIN_TONES.deep.rgb);
  expect(paletteFor({ skin: 'medium' }).targets[PART.skin]).toBeNull();
  const geared = paletteFor({ rod: 'rod_gold', boots: 'boots_red', waders: 'waders_navy', shirt: 'shirt_navy' }, ['rod_gold', 'boots_red', 'waders_navy', 'shirt_navy']);
  expect(geared.targets[PART.rod]).toEqual(WARDROBE.rod_gold.tint);
  expect(geared.targets[PART.boots]).toEqual(WARDROBE.boots_red.tint);
  // A drawn garment is copied on instead, so the dye under it is dropped.
  expect(paletteFor({ boots: 'boots_brown' }, ['boots_brown']).targets[PART.boots]).toBeNull();
  expect(paletteFor({ boots: 'boots_brown' }, ['boots_brown']).boots).toEqual({ overlay: true });
  expect(geared.targets[PART.waders]).toEqual(WARDROBE.waders_navy.tint);
  expect(geared.targets[PART.shirt]).toEqual(WARDROBE.shirt_navy.tint);
});

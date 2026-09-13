import { DEFAULT_LOOK, WARDROBE, HAIR_COLORS, SKIN_TONES, SKIN_BODY, SLOTS, PART, PART_BASE, normalizeLook, lookKey, isDefaultLook, isOwned, itemsFor, paletteFor, skinRampFor } from './anglerLook';

test('a look you cannot wear falls back to the free defaults, slot by slot', () => {
  expect(normalizeLook(null)).toEqual(DEFAULT_LOOK);
  expect(normalizeLook({ skin: 'nope', hat: 'hat_cowboy' })).toEqual(DEFAULT_LOOK);
  expect(normalizeLook({ hat: 'hat_cowboy' }, ['hat_cowboy']).hat).toBe('hat_cowboy');
  // A rod key in the hat slot is not a hat.
  expect(normalizeLook({ hat: 'rod_gold' }, ['rod_gold']).hat).toBe(DEFAULT_LOOK.hat);
  expect(isOwned('cap_green')).toBe(true);
  expect(isOwned('cap_red')).toBe(false);
  expect(isOwned('cap_red', ['cap_red'])).toBe(true);
});

test('a look saved against the old sheet still loads, retired keys and all', () => {
  // The sheet before this one drew him bald and clean-shaven, so a look could carry a hairstyle,
  // a beard and no hat at all. This one draws one of each on him and there is no bare head to go
  // back to, so those fields are read past rather than rejected — the rest of the look survives.
  const old = { skin: 'deep', hairstyle: 'topknot', hair: 'blond', beard: 'goatee', hat: 'hat_none', shirt: 'shirt_navy' };
  const worn = normalizeLook(old, ['shirt_navy']);
  expect(worn.skin).toBe('deep');
  expect(worn.hair).toBe('blond');
  expect(worn.shirt).toBe('shirt_navy');
  expect(worn.hat).toBe('cap_green');
  expect(worn.hairstyle).toBeUndefined();
  expect(worn.beard).toBeUndefined();
});

test('the look key is the normalized look in a fixed order, so it can cache paints', () => {
  expect(lookKey(DEFAULT_LOOK)).toBe('medium|brown|cap_green|shirt_grey|vest_olive|rod_graphite|boots_green|waders_khaki');
  // lookKey reckons every item owned — it is a cache key for a paint, not a check on a purchase.
  expect(lookKey({ skin: 'deep', hat: 'hat_straw' })).toBe('deep|brown|hat_straw|shirt_grey|vest_olive|rod_graphite|boots_green|waders_khaki');
  expect(isDefaultLook({})).toBe(true);
  expect(isDefaultLook({ skin: 'deep' })).toBe(false);
});

test('every rack item is a colour in a slot with a price, and every slot has a free one', () => {
  Object.entries(WARDROBE).forEach(([key, item]) => {
    expect(SLOTS).toContain(item.slot);
    expect(item.cost).toBeGreaterThanOrEqual(0);
    // Nothing is a shape any more. An item either dyes its part or is the art's own colour.
    expect('tint' in item).toBe(true);
    if (item.tint) expect(item.tint).toHaveLength(3);
    else expect(item.cost).toBe(0);
    expect(item.label).toEqual(expect.any(String));
    expect(key).not.toMatch(/\s/);
  });
  SLOTS.forEach((slot) => expect(itemsFor(slot).filter((item) => item.cost === 0)).toHaveLength(1));
});

test('every key the old hat rack sold still buys something', () => {
  // The promise is that a purchase is never orphaned by an art swap. The old rack's twenty-three
  // hats were shapes and this sheet has one cap, so each key is that cap in the nearest colour —
  // relabelled to say so, but still there and still in the hat slot.
  const sold = ['hat_none', 'cap_green', 'cap_red', 'cap_navy', 'cap_black', 'cap_orange', 'cap_brown', 'cap_camo',
    'hat_beanie', 'hat_beanie_olive', 'hat_beanie_red', 'hat_beanie_navy', 'hat_beanie_grey', 'hat_visor',
    'hat_bucket', 'hat_boonie', 'hat_straw', 'hat_straw_red', 'hat_wide_olive', 'hat_wide_navy', 'hat_cowboy',
    'hat_boonie_white', 'hat_boonie_olive'];
  sold.forEach((key) => expect(normalizeLook({ hat: key }, [key]).hat).not.toBe(undefined));
  // ...and every one of them puts something on his head rather than falling back.
  sold.filter((key) => key !== 'hat_none').forEach((key) => {
    expect(WARDROBE[key].slot).toBe('hat');
    expect(normalizeLook({ hat: key }, [key]).hat).toBe(key);
  });
  // The other racks kept their keys too.
  ['shirt_grey', 'shirt_white', 'shirt_navy', 'shirt_red', 'shirt_olive',
    'rod_graphite', 'rod_red', 'rod_blue', 'rod_white', 'rod_gold',
    'boots_green', 'boots_black', 'boots_brown', 'boots_yellow', 'boots_red',
    'waders_khaki', 'waders_jeans', 'waders_olive', 'waders_grey', 'waders_navy', 'waders_brown',
  ].forEach((key) => expect(WARDROBE[key]).toBeTruthy());
});

test('the default look is the art exactly as drawn, so the stock strips can show unpainted', () => {
  const palette = paletteFor(DEFAULT_LOOK);
  expect(Object.values(palette.targets).every((target) => target === null)).toBe(true);
  expect(palette.skinRamp).toBe(null);
  expect(isDefaultLook(DEFAULT_LOOK)).toBe(true);
});

test('gear is a dye, skin is a ramp, and the art is never dyed to its own colour', () => {
  const palette = paletteFor({ skin: 'deep', hair: 'blond', hat: 'cap_red', shirt: 'shirt_navy', vest: 'vest_rust', rod: 'rod_gold', boots: 'boots_red', waders: 'waders_olive' });
  expect(palette.targets[PART.cap]).toEqual(WARDROBE.cap_red.tint);
  expect(palette.targets[PART.shirt]).toEqual(WARDROBE.shirt_navy.tint);
  expect(palette.targets[PART.vest]).toEqual(WARDROBE.vest_rust.tint);
  expect(palette.targets[PART.rod]).toEqual(WARDROBE.rod_gold.tint);
  expect(palette.targets[PART.boots]).toEqual(WARDROBE.boots_red.tint);
  // The trousers are stored under the slot the waders used to have, and dye the jeans.
  expect(palette.targets[PART.jeans]).toEqual(WARDROBE.waders_olive.tint);
  expect(palette.targets[PART.hair]).toEqual(HAIR_COLORS.blond.rgb);
  // Skin is a ramp to move to, not a colour to dye with.
  expect(palette.skinRamp).toEqual(skinRampFor('deep'));
  expect(palette.skinRamp).toHaveLength(SKIN_BODY.length);
  // Brown hair is what the sheet draws, so choosing it asks for no dye at all.
  expect(paletteFor({ hair: 'brown' }).targets[PART.hair]).toBe(null);
});

test('olive skin is mixed from the two drawn ramps either side of it', () => {
  const olive = skinRampFor('olive');
  const [from, to] = [skinRampFor('medium'), skinRampFor('brown')];
  olive.forEach((band, i) => band.forEach((value, k) => {
    const low = Math.min(from[i][k], to[i][k]); const high = Math.max(from[i][k], to[i][k]);
    expect(value).toBeGreaterThanOrEqual(low);
    expect(value).toBeLessThanOrEqual(high);
  }));
  Object.keys(SKIN_TONES).forEach((key) => expect(skinRampFor(key)).toHaveLength(4));
});

test('every part the painter can dye knows the colour it was drawn in', () => {
  // A dye is reckoned against the part's own painted mid-tone, so a part with a target but no
  // base would be dyed against nothing.
  [PART.skin, PART.cap, PART.hair, PART.shirt, PART.vest, PART.jeans, PART.boots, PART.rod].forEach((part) => {
    expect(PART_BASE[part]).toHaveLength(3);
    PART_BASE[part].forEach((channel) => expect(channel).toBeGreaterThanOrEqual(0));
  });
  // The outline is never dyed, so it has no base and needs none.
  expect(PART_BASE[PART.outline]).toBeUndefined();
});

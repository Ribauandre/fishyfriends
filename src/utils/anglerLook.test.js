import {
  WARDROBE, WARDROBE_LIST, SLOTS, DEFAULT_LOOK, SKIN_TONES, HAIR_COLORS, HAIR_STYLES, BEARD_STYLES, PART,
  isOwned, normalizeLook, lookKey, isDefaultLook, paletteFor, itemsFor,
} from './anglerLook';

test('every rack has a free default and everything else costs points', () => {
  SLOTS.forEach((slot) => {
    const items = itemsFor(slot);
    expect(items.some((item) => item.cost === 0)).toBe(true);
    expect(WARDROBE[DEFAULT_LOOK[slot]].slot).toBe(slot);
    expect(WARDROBE[DEFAULT_LOOK[slot]].cost).toBe(0);
  });
  WARDROBE_LIST.forEach((item) => { expect(item.cost).toBeGreaterThanOrEqual(0); expect(SLOTS).toContain(item.slot); });
  // A hat is either the art's cap in a colour, a drawing worn over it, or no hat at all.
  itemsFor('hat').forEach((hat) => { expect(Boolean(hat.tint) || Boolean(hat.overlay) || hat.key === 'hat_none').toBe(true); });
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

test('the stock look leaves the art alone', () => {
  const pal = paletteFor({});
  Object.values(pal.targets).forEach((target) => expect(target).toBeNull());
  expect(pal.capOff).toBe(false);
  expect(pal.bareHead).toBe(false);
  expect(pal.hairCrown).toBeNull();
  expect(pal.beardOverlay).toBeNull();
  expect(pal.hatOverlay).toBeNull();
});

test('the paint plan follows the look: dyes for skin, cap and racks, hair for the beard', () => {
  const pal = paletteFor({ skin: 'deep', hair: 'blond', hat: 'cap_red', rod: 'rod_red', boots: 'boots_yellow', waders: 'waders_navy' });
  expect(pal.targets[PART.skin]).toEqual(SKIN_TONES.deep.rgb);
  expect(pal.targets[PART.beard]).toEqual(HAIR_COLORS.blond.rgb);
  expect(pal.targets[PART.hat]).toEqual(WARDROBE.cap_red.tint);
  expect(pal.targets[PART.panel]).toBeNull();
  expect(pal.targets[PART.rod]).toEqual(WARDROBE.rod_red.tint);
  expect(pal.targets[PART.boots]).toEqual(WARDROBE.boots_yellow.tint);
  expect(pal.targets[PART.waders]).toEqual(WARDROBE.waders_navy.tint);
  expect(pal.capOff).toBe(false);
});

test('facial hair other than the full beard turns the art beard into jaw and picks a drawing', () => {
  const goatee = paletteFor({ beard: 'goatee', skin: 'fair' });
  expect(goatee.targets[PART.beard]).toEqual(SKIN_TONES.fair.rgb);
  expect(goatee.beardOverlay).toBe('beard_goatee');
  expect(goatee.stubble).toBe(false);
  const stubble = paletteFor({ beard: 'stubble' });
  expect(stubble.targets[PART.beard]).toEqual(SKIN_TONES.medium.rgb);
  expect(stubble.stubble).toBe(true);
  expect(stubble.beardOverlay).toBeNull();
  expect(paletteFor({ beard: 'none' }).beardOverlay).toBeNull();
  expect(paletteFor({ beard: 'mustache' }).beardOverlay).toBe('beard_mustache');
});

test('other hats go over the cap with the cap turned to hair; a bare head loses the brim and gets a haircut', () => {
  const cowboy = paletteFor({ hat: 'hat_cowboy', hair: 'grey' });
  expect(cowboy.hatOverlay).toBe('cowboy');
  expect(cowboy.capOff).toBe(true);
  expect(cowboy.targets[PART.hat]).toEqual(HAIR_COLORS.grey.rgb);
  expect(cowboy.targets[PART.panel]).toEqual(HAIR_COLORS.grey.rgb);
  expect(cowboy.hairCrown).toBeNull();
  expect(cowboy.bareHead).toBe(false);

  const bare = paletteFor({ hat: 'hat_none', hairstyle: 'long' });
  expect(bare.bareHead).toBe(true);
  expect(bare.hairCrown).toBe('hair_short');
  expect(bare.hairBack).toBe('hair_long');
  expect(bare.hatOverlay).toBeNull();

  // Bald and hatless: the cap becomes scalp and nothing is drawn on top.
  const bald = paletteFor({ hat: 'hat_none', hairstyle: 'bald', skin: 'brown' });
  expect(bald.targets[PART.hat]).toEqual(SKIN_TONES.brown.rgb);
  expect(bald.hairCrown).toBeNull();
  expect(bald.hairBack).toBeNull();

  // A visor shows the hair on top; a bucket hat keeps the long hair behind.
  expect(paletteFor({ hat: 'hat_visor' }).hairCrown).toBe('hair_short');
  expect(paletteFor({ hat: 'hat_bucket', hairstyle: 'long' }).hairBack).toBe('hair_long');
  expect(paletteFor({ hat: 'cap_navy', hairstyle: 'long' }).hairBack).toBeNull();
});

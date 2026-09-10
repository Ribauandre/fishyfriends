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
  // A hat is either a drawing worn on the head or no hat at all; only a cap takes a colour.
  itemsFor('hat').forEach((hat) => {
    expect(Boolean(hat.overlay) || hat.key === 'hat_none').toBe(true);
    if (hat.tint) expect(hat.overlay).toBe('cap');
  });
});

test('the free choices are all real options', () => {
  expect(SKIN_TONES[DEFAULT_LOOK.skin]).toBeDefined();
  expect(HAIR_COLORS[DEFAULT_LOOK.hair]).toBeDefined();
  expect(HAIR_STYLES[DEFAULT_LOOK.hairstyle]).toBeDefined();
  expect(BEARD_STYLES[DEFAULT_LOOK.beard]).toBeDefined();
  expect(Object.keys(BEARD_STYLES)).toEqual(['none', 'stubble', 'mustache', 'goatee', 'full']);
  expect(Object.keys(HAIR_STYLES)).toEqual(['bald', 'short', 'long']);
  // The art is bald, clean-shaven and bare-headed, so that is what the default look must be.
  expect(DEFAULT_LOOK.hairstyle).toBe('bald');
  expect(DEFAULT_LOOK.beard).toBe('none');
  expect(DEFAULT_LOOK.hat).toBe('hat_none');
});

test('a look only wears what is owned, and the rest falls back to the free defaults', () => {
  expect(isOwned('cap_green')).toBe(true);
  expect(isOwned('hat_none')).toBe(true);
  expect(isOwned('cap_red')).toBe(false);
  expect(isOwned('cap_red', ['cap_red'])).toBe(true);
  expect(isOwned('nope', ['nope'])).toBe(false);

  const wanted = { skin: 'deep', hairstyle: 'long', hair: 'grey', beard: 'stubble', hat: 'cap_red', rod: 'rod_gold', boots: 'boots_yellow', vest: 'vest_navy', pants: 'pants_khaki' };
  expect(normalizeLook(wanted, ['cap_red', 'boots_yellow', 'vest_navy'])).toEqual({ ...wanted, rod: 'rod_graphite', pants: 'pants_blue' });
  // Wrong slot, unknown keys and junk values all fall through.
  expect(normalizeLook({ hat: 'rod_red', rod: 'cap_red', skin: 'purple', beard: 'braided', hairstyle: 'mohawk' }, ['rod_red', 'cap_red'])).toEqual(DEFAULT_LOOK);
  expect(normalizeLook(null)).toEqual(DEFAULT_LOOK);
  // A look saved against the old wardrobe (waders, a cap by default) still wears.
  expect(normalizeLook({ waders: 'waders_navy', hat: 'cap_green' }, ['waders_navy'])).toEqual({ ...DEFAULT_LOOK, hat: 'cap_green' });
});

test('lookKey names every choice and isDefaultLook spots the stock angler', () => {
  expect(lookKey({})).toBe('medium|bald|auburn|none|hat_none|vest_olive|pants_blue|boots_brown|rod_graphite');
  expect(lookKey({ skin: 'fair', beard: 'full', hat: 'hat_cowboy', hairstyle: 'short' })).toBe('fair|short|auburn|full|hat_cowboy|vest_olive|pants_blue|boots_brown|rod_graphite');
  expect(isDefaultLook({})).toBe(true);
  expect(isDefaultLook({ hat: 'hat_none', rod: 'rod_graphite' })).toBe(true);
  expect(isDefaultLook({ skin: 'fair' })).toBe(false);
  expect(isDefaultLook({ hat: 'cap_green' })).toBe(false);
});

test('the stock look leaves the art alone', () => {
  const pal = paletteFor({});
  Object.values(pal.targets).forEach((target) => expect(target).toBeNull());
  expect(pal.hairCrown).toBeNull();
  expect(pal.hairBack).toBeNull();
  expect(pal.beardOverlay).toBeNull();
  expect(pal.stubble).toBe(false);
  expect(pal.hatOverlay).toBeNull();
});

test('the paint plan follows the look: a dye per rack, a drawing per head piece', () => {
  const pal = paletteFor({ skin: 'deep', hair: 'blond', hat: 'cap_red', rod: 'rod_red', boots: 'boots_yellow', vest: 'vest_navy', pants: 'pants_khaki' });
  expect(pal.targets[PART.skin]).toEqual(SKIN_TONES.deep.rgb);
  expect(pal.targets[PART.rod]).toEqual(WARDROBE.rod_red.tint);
  expect(pal.targets[PART.boots]).toEqual(WARDROBE.boots_yellow.tint);
  expect(pal.targets[PART.vest]).toEqual(WARDROBE.vest_navy.tint);
  expect(pal.targets[PART.pants]).toEqual(WARDROBE.pants_khaki.tint);
  // The shirt under the vest is never dyed, and the art's own skin costs no paint.
  expect(pal.targets[PART.shirt]).toBeUndefined();
  expect(paletteFor({ skin: 'medium' }).targets[PART.skin]).toBeNull();
  expect(pal.hatOverlay).toBe('cap');
  expect(pal.hatTint).toEqual(WARDROBE.cap_red.tint);
});

test('facial hair is a drawing on a clean-shaven jaw, and stubble is a dither', () => {
  expect(paletteFor({ beard: 'goatee' }).beardOverlay).toBe('beard_goatee');
  expect(paletteFor({ beard: 'mustache' }).beardOverlay).toBe('beard_mustache');
  expect(paletteFor({ beard: 'full' }).beardOverlay).toBe('beard_full');
  expect(paletteFor({ beard: 'none' }).beardOverlay).toBeNull();
  const stubble = paletteFor({ beard: 'stubble' });
  expect(stubble.stubble).toBe(true);
  expect(stubble.beardOverlay).toBeNull();
});

test('hair is drawn on the bald head and a hat goes on over it', () => {
  const cowboy = paletteFor({ hat: 'hat_cowboy', hairstyle: 'short', hair: 'grey' });
  expect(cowboy.hatOverlay).toBe('cowboy');
  expect(cowboy.hatTint).toBeNull();
  expect(cowboy.hairCrown).toBe('hair_short');
  expect(cowboy.hair).toEqual(HAIR_COLORS.grey.rgb);

  // Long hair falls down the back whatever is worn on top; bald draws nothing at all.
  expect(paletteFor({ hairstyle: 'long', hat: 'cap_navy' }).hairBack).toBe('hair_long');
  expect(paletteFor({ hairstyle: 'long' }).hairCrown).toBe('hair_short');
  const bald = paletteFor({ hairstyle: 'bald', hat: 'hat_none' });
  expect(bald.hairCrown).toBeNull();
  expect(bald.hairBack).toBeNull();
  expect(bald.hatOverlay).toBeNull();
});

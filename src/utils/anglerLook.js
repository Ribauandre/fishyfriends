// How an angler looks in Cast & Catch, and the wardrobe Marina's Outfitters sells.
//
// The angler is the ChatGPT-drawn sprite sheet in assets/angler — cap, full beard, olive
// jacket, khaki waders — dressed at runtime by utils/anglerPaint.js. Every strip has a part
// mask (assets/angler/masks, red channel = part id: skin, beard, the cap and its panel,
// jacket, waders, boots, rod) and per-frame anchors (utils/anglerAnchors.json: the cap's,
// beard's and face's boxes), both built from the art by scripts/anglerMasks.mjs. A look is
// applied two ways. Parts that keep their shape are dyed (skin tone, the cap to a cap colour,
// waders, boots, rod, the beard to the hair colour) — luminance-preserving, so the artist's
// shading survives. The head is *sculpted*: the cap's and the beard's own pixels are the
// silhouette the painter reshapes, in every frame and from every angle the sheet has, into a
// bald scalp, hair, another hat, a jaw, a goatee or a mustache, with a dome's shading and the
// art's own outline drawn back on. Nothing is pasted on from outside the art, which is why it
// fits. This module owns the model — the free choices (skin tone, hair style and colour,
// facial hair), the racks (hats, rods, boots, waders — bought once with tackle points,
// `wardrobe` on game_profiles, worn from `look`, migration 0022) — and `paletteFor`, the
// pure look → paint plan the painter and its tests share. Every slot has a free default, so a
// look can always be worn even after a refund or a bad save.
export const SKIN_TONES = {
  fair: { label: 'Fair', rgb: [246, 208, 176] },
  light: { label: 'Light', rgb: [236, 176, 128] },
  medium: { label: 'Medium', rgb: [220, 103, 38] },
  olive: { label: 'Olive', rgb: [186, 132, 80] },
  brown: { label: 'Brown', rgb: [140, 85, 50] },
  deep: { label: 'Deep', rgb: [86, 52, 34] },
};

export const HAIR_COLORS = {
  auburn: { label: 'Auburn', rgb: [80, 40, 20] },
  brown: { label: 'Brown', rgb: [70, 48, 32] },
  black: { label: 'Black', rgb: [26, 22, 20] },
  blond: { label: 'Blond', rgb: [196, 156, 84] },
  red: { label: 'Red', rgb: [178, 72, 30] },
  grey: { label: 'Grey', rgb: [150, 150, 150] },
};

// With the cap off the crown of the head is hair or scalp; `back` hangs long hair down the
// back of the neck, under a hat or not.
export const HAIR_STYLES = {
  short: { label: 'Short', crown: 'hair', back: false },
  long: { label: 'Long', crown: 'hair', back: true },
  bald: { label: 'Bald', crown: 'scalp', back: false },
};

// The art has a full beard; every other style is cut from it — the beard's own pixels become
// jaw, and a goatee or mustache keeps the part of the beard that is one.
export const BEARD_STYLES = {
  full: { label: 'Full beard', mode: 'keep' },
  goatee: { label: 'Goatee', mode: 'goatee' },
  mustache: { label: 'Mustache', mode: 'mustache' },
  stubble: { label: 'Stubble', mode: 'stubble' },
  none: { label: 'Clean shaven', mode: 'jaw' },
};

// The racks. Caps are the art's own cap dyed to `tint`. The other hats are `kind`s the painter
// sculpts from the cap's silhouette in `rgb`, with `trim` for a band, brim underside or
// pompom. Rods, boots and waders are dyes.
export const WARDROBE = {
  cap_green: { slot: 'hat', label: 'Club cap', cost: 0, kind: 'cap', tint: null },
  hat_none: { slot: 'hat', label: 'Bare head', cost: 0, kind: 'none' },
  cap_red: { slot: 'hat', label: 'Red cap', cost: 40, kind: 'cap', tint: [176, 42, 40] },
  cap_navy: { slot: 'hat', label: 'Navy cap', cost: 40, kind: 'cap', tint: [34, 48, 96] },
  cap_black: { slot: 'hat', label: 'Black cap', cost: 40, kind: 'cap', tint: [30, 30, 34] },
  cap_orange: { slot: 'hat', label: 'Blaze cap', cost: 50, kind: 'cap', tint: [226, 112, 30] },
  hat_visor: { slot: 'hat', label: 'Sun visor', cost: 60, kind: 'visor', rgb: [236, 232, 222], trim: [44, 46, 50] },
  hat_beanie: { slot: 'hat', label: 'Knit beanie', cost: 70, kind: 'beanie', rgb: [132, 36, 46], trim: [236, 222, 196] },
  hat_straw: { slot: 'hat', label: 'Straw hat', cost: 80, kind: 'straw', rgb: [216, 180, 98], trim: [96, 62, 32] },
  hat_bucket: { slot: 'hat', label: 'Bucket hat', cost: 90, kind: 'bucket', rgb: [112, 118, 76], trim: [78, 84, 50] },
  hat_cowboy: { slot: 'hat', label: 'Cowboy hat', cost: 120, kind: 'cowboy', rgb: [126, 82, 46], trim: [68, 42, 22] },
  rod_graphite: { slot: 'rod', label: 'Graphite rod', cost: 0, tint: null },
  rod_red: { slot: 'rod', label: 'Red rod', cost: 50, tint: [196, 44, 44] },
  rod_blue: { slot: 'rod', label: 'Blue rod', cost: 50, tint: [44, 96, 204] },
  rod_white: { slot: 'rod', label: 'White rod', cost: 50, tint: [226, 226, 226] },
  rod_gold: { slot: 'rod', label: 'Gold rod', cost: 80, tint: [222, 172, 52] },
  boots_green: { slot: 'boots', label: 'Dock boots', cost: 0, tint: null },
  boots_black: { slot: 'boots', label: 'Black boots', cost: 40, tint: [12, 12, 14] },
  boots_brown: { slot: 'boots', label: 'Leather boots', cost: 40, tint: [112, 72, 42] },
  boots_yellow: { slot: 'boots', label: 'Yellow boots', cost: 60, tint: [196, 160, 44] },
  boots_red: { slot: 'boots', label: 'Red boots', cost: 60, tint: [184, 44, 44] },
  waders_khaki: { slot: 'waders', label: 'Khaki waders', cost: 0, tint: null },
  waders_olive: { slot: 'waders', label: 'Olive waders', cost: 60, tint: [112, 118, 72] },
  waders_grey: { slot: 'waders', label: 'Grey waders', cost: 60, tint: [124, 128, 134] },
  waders_navy: { slot: 'waders', label: 'Navy waders', cost: 70, tint: [52, 66, 112] },
  waders_brown: { slot: 'waders', label: 'Brown waders', cost: 60, tint: [122, 82, 52] },
};

export const SLOTS = ['hat', 'rod', 'boots', 'waders'];
export const SLOT_LABELS = { hat: 'Hats', rod: 'Rods', boots: 'Boots', waders: 'Waders' };
export const WARDROBE_LIST = Object.entries(WARDROBE).map(([key, item]) => ({ key, ...item }));
export const itemsFor = (slot) => WARDROBE_LIST.filter((item) => item.slot === slot);

export const DEFAULT_LOOK = { skin: 'medium', hairstyle: 'short', hair: 'auburn', beard: 'full', hat: 'cap_green', rod: 'rod_graphite', boots: 'boots_green', waders: 'waders_khaki' };
const LOOK_FIELDS = ['skin', 'hairstyle', 'hair', 'beard', 'hat', 'rod', 'boots', 'waders'];

export function isOwned(itemKey, wardrobe = []) {
  const item = WARDROBE[itemKey];
  return Boolean(item) && (item.cost === 0 || wardrobe.includes(itemKey));
}

// A look you can actually wear: unknown or unowned choices fall back to the free defaults.
export function normalizeLook(look, wardrobe = []) {
  const safe = { ...DEFAULT_LOOK };
  if (!look || typeof look !== 'object') return safe;
  if (SKIN_TONES[look.skin]) safe.skin = look.skin;
  if (HAIR_STYLES[look.hairstyle]) safe.hairstyle = look.hairstyle;
  if (HAIR_COLORS[look.hair]) safe.hair = look.hair;
  if (BEARD_STYLES[look.beard]) safe.beard = look.beard;
  SLOTS.forEach((slot) => { const key = look[slot]; if (WARDROBE[key]?.slot === slot && isOwned(key, wardrobe)) safe[slot] = key; });
  return safe;
}

export function lookKey(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  return LOOK_FIELDS.map((field) => safe[field]).join('|');
}

export const isDefaultLook = (look) => lookKey(look) === lookKey(DEFAULT_LOOK);

// The parts a pixel can belong to (the mask's red channel), and the colour each is painted
// in the art: the mid-tone the shading is measured against when it's retinted.
export const PART = { skin: 1, beard: 2, hat: 3, panel: 4, jacket: 5, waders: 6, boots: 7, rod: 8, outline: 9 };
export const PART_BASE = {
  [PART.skin]: [220, 103, 38],
  [PART.beard]: [80, 40, 20],
  [PART.hat]: [23, 57, 52],
  [PART.panel]: [207, 184, 153],
  [PART.waders]: [179, 138, 100],
  [PART.boots]: [24, 26, 27],
  [PART.rod]: [48, 48, 48],
};

// Everything the painter needs for a look: what each dyed part goes to (null = leave the art
// alone), and the head plan — what the cap's silhouette becomes (`crown`: the cap itself,
// scalp, hair, or a hat `kind` of its own), whether long hair hangs down the back, and what
// is cut from the beard.
export function paletteFor(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  const hat = WARDROBE[safe.hat];
  const hair = HAIR_COLORS[safe.hair].rgb;
  const skin = SKIN_TONES[safe.skin].rgb;
  const style = HAIR_STYLES[safe.hairstyle];
  const beard = BEARD_STYLES[safe.beard];
  const capOn = hat.kind === 'cap';
  return {
    look: safe,
    skin,
    hair,
    targets: {
      [PART.skin]: safe.skin === DEFAULT_LOOK.skin ? null : skin,
      [PART.hat]: capOn && safe.hat !== DEFAULT_LOOK.hat ? hat.tint : null,
      [PART.waders]: WARDROBE[safe.waders].tint,
      [PART.boots]: WARDROBE[safe.boots].tint,
      [PART.rod]: WARDROBE[safe.rod].tint,
    },
    head: {
      // A visor sits on the crown the hairstyle gives; every other hat is the crown.
      crown: capOn ? 'cap' : hat.kind === 'none' || hat.kind === 'visor' ? style.crown : 'hat',
      hat: capOn || hat.kind === 'none' ? null : { kind: hat.kind, rgb: hat.rgb, trim: hat.trim },
      hairBack: style.back,
      beard: beard.mode,
      // The beard is dyed to the hair colour wherever it stays a beard; the default look is the
      // art as drawn, so it is left alone there.
      beardTint: safe.hair === DEFAULT_LOOK.hair ? null : hair,
    },
  };
}

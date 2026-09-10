// How an angler looks in Cast & Catch, and the wardrobe Marina's Outfitters sells.
//
// The angler is the ChatGPT-drawn sprite sheet in assets/angler, dressed at runtime by
// utils/anglerPaint.js: every strip has a part mask (assets/angler/masks, red channel = part
// id — skin, beard, the cap and its panel, jacket, waders, boots, rod) and per-frame anchors
// (utils/anglerAnchors.json: the cap's, beard's and face's boxes), both built from the art by
// scripts/anglerMasks.mjs. A look is applied by dyeing masked parts (skin tone, the beard to
// the hair colour, the cap to a cap colour, waders, boots, rod) and by compositing drawings
// from assets/angler/parts on the head (the other hats, hair when the cap is off, facial hair
// other than the full beard the art has). This module owns the model — the free choices
// (skin tone, hair style and colour, facial hair), the racks (hats, rods, boots, waders —
// bought once with tackle points, `wardrobe` on game_profiles, worn from `look`, migration
// 0022) — and `paletteFor`, the pure look → paint plan the painter and its tests share.
// Every slot has a free default, so a look can always be worn even after a refund or a bad
// save.
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

// With the cap off, `crown` is drawn on the head and `back` behind the body.
export const HAIR_STYLES = {
  short: { label: 'Short', crown: 'hair_short', back: null },
  long: { label: 'Long', crown: 'hair_short', back: 'hair_long' },
  bald: { label: 'Bald', crown: null, back: null },
};

// The art has a full beard; anything else turns that beard into jaw and draws `overlay`
// (or, for stubble, dithers the jaw).
export const BEARD_STYLES = {
  full: { label: 'Full beard', overlay: null, keep: true },
  goatee: { label: 'Goatee', overlay: 'beard_goatee' },
  mustache: { label: 'Mustache', overlay: 'beard_mustache' },
  stubble: { label: 'Stubble', overlay: null, stubble: true },
  none: { label: 'Clean shaven', overlay: null },
};

// The racks. Caps are the art's own cap dyed to `tint`; other hats are drawings (`overlay`)
// worn over it, with the cap underneath turned to hair. Rods, boots and waders are dyes.
export const WARDROBE = {
  cap_green: { slot: 'hat', label: 'Club cap', cost: 0, overlay: null, tint: [23, 57, 52] },
  hat_none: { slot: 'hat', label: 'Bare head', cost: 0, overlay: null, tint: null },
  cap_red: { slot: 'hat', label: 'Red cap', cost: 40, overlay: null, tint: [176, 42, 40] },
  cap_navy: { slot: 'hat', label: 'Navy cap', cost: 40, overlay: null, tint: [34, 48, 96] },
  cap_black: { slot: 'hat', label: 'Black cap', cost: 40, overlay: null, tint: [30, 30, 34] },
  cap_orange: { slot: 'hat', label: 'Blaze cap', cost: 50, overlay: null, tint: [226, 112, 30] },
  hat_visor: { slot: 'hat', label: 'Sun visor', cost: 60, overlay: 'visor', tint: null },
  hat_beanie: { slot: 'hat', label: 'Knit beanie', cost: 70, overlay: 'beanie', tint: null },
  hat_straw: { slot: 'hat', label: 'Straw hat', cost: 80, overlay: 'straw', tint: null },
  hat_bucket: { slot: 'hat', label: 'Bucket hat', cost: 90, overlay: 'bucket', tint: null },
  hat_cowboy: { slot: 'hat', label: 'Cowboy hat', cost: 120, overlay: 'cowboy', tint: null },
  rod_graphite: { slot: 'rod', label: 'Graphite rod', cost: 0, tint: null },
  rod_red: { slot: 'rod', label: 'Red rod', cost: 50, tint: [196, 44, 44] },
  rod_blue: { slot: 'rod', label: 'Blue rod', cost: 50, tint: [44, 96, 204] },
  rod_white: { slot: 'rod', label: 'White rod', cost: 50, tint: [226, 226, 226] },
  rod_gold: { slot: 'rod', label: 'Gold rod', cost: 80, tint: [222, 172, 52] },
  boots_green: { slot: 'boots', label: 'Dock boots', cost: 0, tint: null },
  boots_black: { slot: 'boots', label: 'Black boots', cost: 40, tint: [12, 12, 14] },
  boots_brown: { slot: 'boots', label: 'Leather boots', cost: 40, tint: [112, 72, 42] },
  boots_yellow: { slot: 'boots', label: 'Yellow boots', cost: 60, tint: [232, 192, 52] },
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
// The colour the drawn hair and beard parts come in, for dyeing them to a look.
export const HAIR_ART_BASE = [110, 52, 24];

// Everything the painter needs for a look: what each masked part is dyed to (null = leave
// the art alone), whether the art's beard and cap stay, which drawings go on the head.
export function paletteFor(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  const hat = WARDROBE[safe.hat];
  const hair = HAIR_COLORS[safe.hair].rgb;
  const skin = SKIN_TONES[safe.skin].rgb;
  const style = HAIR_STYLES[safe.hairstyle];
  const beard = BEARD_STYLES[safe.beard];
  const capOff = safe.hat === 'hat_none' || Boolean(hat.overlay);
  const bald = safe.hairstyle === 'bald';
  return {
    look: safe,
    skin,
    hair,
    targets: {
      [PART.skin]: safe.skin === DEFAULT_LOOK.skin ? null : skin,
      // The art's beard stays for a full beard (dyed to the hair colour); otherwise it becomes jaw.
      [PART.beard]: beard.keep ? (safe.hair === DEFAULT_LOOK.hair ? null : hair) : skin,
      // The cap is dyed to its colour, or — with the cap off — becomes the hair under a hat, or scalp.
      [PART.hat]: capOff ? (bald ? skin : hair) : (safe.hat === DEFAULT_LOOK.hat ? null : hat.tint),
      [PART.panel]: capOff ? (bald ? skin : hair) : null,
      [PART.waders]: WARDROBE[safe.waders].tint,
      [PART.boots]: WARDROBE[safe.boots].tint,
      [PART.rod]: WARDROBE[safe.rod].tint,
    },
    capOff,
    // With no hat at all the cap's brim has to go, and the hair drawing gives the head a haircut.
    bareHead: safe.hat === 'hat_none',
    hairCrown: safe.hat === 'hat_none' || safe.hat === 'hat_visor' ? style.crown : null,
    hairBack: capOff ? style.back : null,
    beardOverlay: beard.overlay,
    stubble: Boolean(beard.stubble),
    hatOverlay: hat.overlay,
  };
}

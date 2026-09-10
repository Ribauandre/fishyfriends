// How an angler looks in Cast & Catch, and the wardrobe Marina's Outfitters sells.
//
// The angler is the ChatGPT-drawn sprite sheet in assets/angler — a bald, clean-shaven,
// hatless man in blue jeans and an olive vest — dressed at runtime by utils/anglerPaint.js:
// every strip has a part mask (assets/angler/masks, red channel = part id — skin, shirt,
// vest, trousers, boots, rod) and a head box per frame (utils/anglerAnchors.json), both built
// from the art by scripts/anglerMasks.mjs. A look is applied by dyeing masked parts (skin
// tone, vest, trousers, boots, rod) and by compositing drawings from assets/angler/parts on
// the head: hair, facial hair and a hat, none of which the art has of its own, so nothing has
// to be erased first. This module owns the model — the free choices (skin tone, hair style
// and colour, facial hair), the racks (hats, vests, trousers, boots, rods — bought once with
// tackle points, `wardrobe` on game_profiles, worn from `look`, migration 0022) — and
// `paletteFor`, the pure look → paint plan the painter and its tests share. Every slot has a
// free default, and the defaults together are the art exactly as it was drawn, so the stock
// strips can be shown unpainted.
export const SKIN_TONES = {
  fair: { label: 'Fair', rgb: [255, 205, 165] },
  light: { label: 'Light', rgb: [250, 185, 130] },
  medium: { label: 'Medium', rgb: [253, 159, 87] },
  olive: { label: 'Olive', rgb: [206, 148, 92] },
  brown: { label: 'Brown', rgb: [160, 100, 55] },
  deep: { label: 'Deep', rgb: [104, 62, 40] },
};

export const HAIR_COLORS = {
  auburn: { label: 'Auburn', rgb: [110, 52, 24] },
  brown: { label: 'Brown', rgb: [70, 48, 32] },
  black: { label: 'Black', rgb: [26, 22, 20] },
  blond: { label: 'Blond', rgb: [196, 156, 84] },
  red: { label: 'Red', rgb: [178, 72, 30] },
  grey: { label: 'Grey', rgb: [150, 150, 150] },
};

// `crown` is drawn on the head, `back` behind the body. A hat goes on over both.
export const HAIR_STYLES = {
  bald: { label: 'Bald', crown: null, back: null },
  short: { label: 'Short', crown: 'hair_short', back: null },
  long: { label: 'Long', crown: 'hair_short', back: 'hair_long' },
};

// The art is clean-shaven, so every style but `none` is a drawing on the jaw — except
// stubble, which is a dither of hair colour into the jaw's own skin.
export const BEARD_STYLES = {
  none: { label: 'Clean shaven', overlay: null },
  stubble: { label: 'Stubble', overlay: null, stubble: true },
  mustache: { label: 'Mustache', overlay: 'beard_mustache' },
  goatee: { label: 'Goatee', overlay: 'beard_goatee' },
  full: { label: 'Full beard', overlay: 'beard_full' },
};

// The racks. Hats are drawings worn on the head; a cap is the one drawing dyed to `tint`.
// Vests, trousers, boots and rods are dyes of the art's own parts — `tint: null` is the
// colour it was drawn in, which costs nothing and needs no canvas.
export const WARDROBE = {
  hat_none: { slot: 'hat', label: 'Bare head', cost: 0, overlay: null, tint: null },
  cap_green: { slot: 'hat', label: 'Club cap', cost: 0, overlay: 'cap', tint: null },
  cap_red: { slot: 'hat', label: 'Red cap', cost: 40, overlay: 'cap', tint: [176, 42, 40] },
  cap_navy: { slot: 'hat', label: 'Navy cap', cost: 40, overlay: 'cap', tint: [34, 48, 96] },
  cap_black: { slot: 'hat', label: 'Black cap', cost: 40, overlay: 'cap', tint: [34, 34, 38] },
  cap_orange: { slot: 'hat', label: 'Blaze cap', cost: 50, overlay: 'cap', tint: [226, 112, 30] },
  hat_visor: { slot: 'hat', label: 'Sun visor', cost: 60, overlay: 'visor', tint: null },
  hat_beanie: { slot: 'hat', label: 'Knit beanie', cost: 70, overlay: 'beanie', tint: null },
  hat_straw: { slot: 'hat', label: 'Straw hat', cost: 80, overlay: 'straw', tint: null },
  hat_bucket: { slot: 'hat', label: 'Bucket hat', cost: 90, overlay: 'bucket', tint: null },
  hat_cowboy: { slot: 'hat', label: 'Cowboy hat', cost: 120, overlay: 'cowboy', tint: null },
  vest_olive: { slot: 'vest', label: 'Olive vest', cost: 0, tint: null },
  vest_red: { slot: 'vest', label: 'Red vest', cost: 40, tint: [162, 54, 44] },
  vest_navy: { slot: 'vest', label: 'Navy vest', cost: 40, tint: [46, 62, 104] },
  vest_grey: { slot: 'vest', label: 'Grey vest', cost: 50, tint: [122, 124, 128] },
  vest_tan: { slot: 'vest', label: 'Tan vest', cost: 60, tint: [166, 134, 84] },
  pants_blue: { slot: 'pants', label: 'Blue jeans', cost: 0, tint: null },
  pants_black: { slot: 'pants', label: 'Black jeans', cost: 40, tint: [42, 44, 50] },
  pants_khaki: { slot: 'pants', label: 'Khaki trousers', cost: 40, tint: [178, 156, 108] },
  pants_olive: { slot: 'pants', label: 'Olive trousers', cost: 50, tint: [98, 106, 62] },
  pants_grey: { slot: 'pants', label: 'Grey trousers', cost: 60, tint: [116, 118, 124] },
  boots_brown: { slot: 'boots', label: 'Dock boots', cost: 0, tint: null },
  boots_black: { slot: 'boots', label: 'Black boots', cost: 40, tint: [26, 26, 30] },
  boots_green: { slot: 'boots', label: 'Wellies', cost: 40, tint: [40, 84, 62] },
  boots_yellow: { slot: 'boots', label: 'Yellow boots', cost: 60, tint: [214, 172, 48] },
  boots_red: { slot: 'boots', label: 'Red boots', cost: 60, tint: [168, 48, 44] },
  rod_graphite: { slot: 'rod', label: 'Graphite rod', cost: 0, tint: null },
  rod_red: { slot: 'rod', label: 'Red rod', cost: 50, tint: [150, 40, 38] },
  rod_blue: { slot: 'rod', label: 'Blue rod', cost: 50, tint: [42, 82, 158] },
  rod_white: { slot: 'rod', label: 'White rod', cost: 50, tint: [186, 186, 190] },
  rod_gold: { slot: 'rod', label: 'Gold rod', cost: 80, tint: [178, 138, 46] },
};

export const SLOTS = ['hat', 'vest', 'pants', 'boots', 'rod'];
export const SLOT_LABELS = { hat: 'Hats', vest: 'Vests', pants: 'Trousers', boots: 'Boots', rod: 'Rods' };
export const WARDROBE_LIST = Object.entries(WARDROBE).map(([key, item]) => ({ key, ...item }));
export const itemsFor = (slot) => WARDROBE_LIST.filter((item) => item.slot === slot);

// The art as it was drawn: nothing to dye, nothing to draw on the head.
export const DEFAULT_LOOK = { skin: 'medium', hairstyle: 'bald', hair: 'auburn', beard: 'none', hat: 'hat_none', vest: 'vest_olive', pants: 'pants_blue', boots: 'boots_brown', rod: 'rod_graphite' };
const LOOK_FIELDS = ['skin', 'hairstyle', 'hair', 'beard', 'hat', 'vest', 'pants', 'boots', 'rod'];

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
export const PART = { skin: 1, shirt: 2, vest: 3, pants: 4, boots: 5, rod: 6, outline: 9 };
export const PART_BASE = {
  [PART.skin]: [253, 159, 87],
  [PART.shirt]: [70, 95, 121],
  [PART.vest]: [96, 93, 52],
  [PART.pants]: [21, 92, 186],
  [PART.boots]: [72, 43, 18],
  [PART.rod]: [72, 43, 18],
};
// The colour the drawn hair and beard parts come in, and the cap's own green, for dyeing them.
export const HAIR_ART_BASE = [110, 52, 24];
export const CAP_ART_BASE = [42, 74, 62];

// Everything the painter needs for a look: what each masked part is dyed to (null = leave the
// art alone), and which drawings go on the head and in what colour.
export function paletteFor(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  const hat = WARDROBE[safe.hat];
  const hair = HAIR_COLORS[safe.hair].rgb;
  const skin = SKIN_TONES[safe.skin].rgb;
  const style = HAIR_STYLES[safe.hairstyle];
  const beard = BEARD_STYLES[safe.beard];
  return {
    look: safe,
    skin,
    hair,
    targets: {
      [PART.skin]: safe.skin === DEFAULT_LOOK.skin ? null : skin,
      [PART.vest]: WARDROBE[safe.vest].tint,
      [PART.pants]: WARDROBE[safe.pants].tint,
      [PART.boots]: WARDROBE[safe.boots].tint,
      [PART.rod]: WARDROBE[safe.rod].tint,
    },
    // Hair goes on first and the hat over it, so a brimmed hat leaves only the sideburn
    // showing, a visor leaves the top open, and long hair falls down the back whatever is worn.
    hairCrown: style.crown,
    hairBack: style.back,
    beardOverlay: beard.overlay,
    stubble: Boolean(beard.stubble),
    hatOverlay: hat.overlay,
    hatTint: hat.overlay === 'cap' ? hat.tint : null,
  };
}

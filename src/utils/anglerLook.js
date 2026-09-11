// How an angler looks in Cast & Catch, and the wardrobe Marina's Outfitters sells.
//
// The angler is the ChatGPT-drawn sprite sheet in assets/angler — bald, clean-shaven, pale
// shirt, olive waders — dressed at runtime by utils/anglerPaint.js. Every strip has a part
// mask (assets/angler/masks, red channel = part id: skin, shirt, waders, boots, rod, line
// work) and per-frame anchors (utils/anglerAnchors.json: the head's box, the face's box and
// which way it is turned), both built from the art by scripts/anglerMasks.mjs. A look is
// applied two ways. Parts that keep their shape are dyed — skin, shirt, waders, boots, rod —
// luminance-preserving, so the artist's shading survives. The head is *built on*: the sheet
// draws a bare skull and a bare jaw, so hair, a beard and a hat are added to them rather than
// carved out of a cap and a beard that were drawn in. That is the whole reason this sheet
// replaced the last one — nothing has to be taken off before anything can be put on, and a
// hat is a shape over a known silhouette instead of a reinterpretation of someone else's.
// This module owns the model — the free choices (skin tone, hair style and colour, facial
// hair), the racks (hats, shirts, rods, boots, waders — bought once with tackle points,
// `wardrobe` on game_profiles, worn from `look`, migration 0022) — and `paletteFor`, the pure
// look → paint plan the painter and its tests share. Every slot has a free default, and the
// free defaults together are the art exactly as drawn, so the stock strips can show unpainted.
export const SKIN_TONES = {
  fair: { label: 'Fair', rgb: [248, 176, 128] },
  light: { label: 'Light', rgb: [232, 164, 112] },
  medium: { label: 'Medium', rgb: [208, 136, 88] },
  olive: { label: 'Olive', rgb: [186, 120, 80] },
  brown: { label: 'Brown', rgb: [168, 104, 72] },
  deep: { label: 'Deep', rgb: [104, 72, 56] },
};

export const HAIR_COLORS = {
  auburn: { label: 'Auburn', rgb: [116, 58, 30] },
  brown: { label: 'Brown', rgb: [74, 50, 34] },
  black: { label: 'Black', rgb: [30, 26, 24] },
  blond: { label: 'Blond', rgb: [200, 160, 88] },
  red: { label: 'Red', rgb: [180, 74, 32] },
  grey: { label: 'Grey', rgb: [156, 156, 156] },
};

// The sheet draws the head bald, so a hairstyle is hair laid over the top of the skull:
// `depth` is how far down the head the hairline sits, as a fraction of it — deeper round the
// back than at the forehead, which the painter works out from the turn of the head — and
// `back` hangs it down the neck as well, under a hat or not.
export const HAIR_STYLES = {
  bald: { label: 'Bald', depth: 0, back: false },
  short: { label: 'Short', depth: 0.3, back: false },
  long: { label: 'Long', depth: 0.34, back: true },
};

// The jaw is drawn bare, so every beard is painted onto it. A beard is not a band across the
// face: it runs from the mouth at the chin up to the sideburn at the ear, and `rise` is how
// far up that run it goes. `lip` adds the moustache, `chinOnly` keeps just the front of it,
// and `dither` thins the whole thing to stubble.
export const BEARD_STYLES = {
  none: { label: 'Clean shaven', rise: 0, lip: false },
  stubble: { label: 'Stubble', rise: 0.7, lip: true, dither: true },
  mustache: { label: 'Moustache', rise: 0, lip: true },
  goatee: { label: 'Goatee', rise: 0, lip: true, chinOnly: true },
  full: { label: 'Full beard', rise: 0.75, lip: true },
};

// The racks. Hats are `kind`s the painter builds over the bare skull in `rgb`, with `trim` for
// a peak, band, brim underside or pompom. Shirts, rods, boots and waders are dyes: `tint` null
// means the art's own colour, which is what the free item in every rack is.
export const WARDROBE = {
  hat_none: { slot: 'hat', label: 'Bare head', cost: 0, kind: 'none' },
  cap_green: { slot: 'hat', label: 'Club cap', cost: 0, kind: 'cap', rgb: [80, 96, 48], trim: [56, 68, 34] },
  cap_red: { slot: 'hat', label: 'Red cap', cost: 40, kind: 'cap', rgb: [176, 42, 40], trim: [120, 28, 28] },
  cap_navy: { slot: 'hat', label: 'Navy cap', cost: 40, kind: 'cap', rgb: [34, 48, 96], trim: [22, 32, 66] },
  cap_black: { slot: 'hat', label: 'Black cap', cost: 40, kind: 'cap', rgb: [34, 34, 38], trim: [20, 20, 24] },
  cap_orange: { slot: 'hat', label: 'Blaze cap', cost: 50, kind: 'cap', rgb: [226, 112, 30], trim: [166, 74, 18] },
  cap_trucker: { slot: 'hat', label: 'Trucker cap', cost: 60, kind: 'cap', rgb: [224, 224, 224], trim: [24, 80, 144] },
  hat_visor: { slot: 'hat', label: 'Sun visor', cost: 60, kind: 'visor', rgb: [236, 232, 222], trim: [44, 46, 50] },
  hat_beanie: { slot: 'hat', label: 'Knit beanie', cost: 70, kind: 'beanie', rgb: [56, 56, 60], trim: [214, 206, 186] },
  hat_straw: { slot: 'hat', label: 'Straw hat', cost: 80, kind: 'straw', rgb: [208, 152, 80], trim: [36, 74, 128] },
  hat_bucket: { slot: 'hat', label: 'Bucket hat', cost: 90, kind: 'bucket', rgb: [144, 112, 64], trim: [86, 64, 36] },
  hat_boonie: { slot: 'hat', label: 'Field boonie', cost: 90, kind: 'bucket', rgb: [128, 120, 80], trim: [78, 72, 46] },
  hat_cowboy: { slot: 'hat', label: 'Cowboy hat', cost: 120, kind: 'cowboy', rgb: [126, 82, 46], trim: [68, 42, 22] },
  shirt_grey: { slot: 'shirt', label: 'Work shirt', cost: 0, tint: null },
  shirt_white: { slot: 'shirt', label: 'White tee', cost: 40, tint: [236, 236, 238] },
  shirt_navy: { slot: 'shirt', label: 'Navy tee', cost: 40, tint: [56, 72, 112] },
  shirt_red: { slot: 'shirt', label: 'Flannel red', cost: 50, tint: [168, 62, 54] },
  shirt_olive: { slot: 'shirt', label: 'Olive tee', cost: 50, tint: [104, 116, 74] },
  rod_graphite: { slot: 'rod', label: 'Graphite rod', cost: 0, tint: null },
  rod_red: { slot: 'rod', label: 'Red rod', cost: 50, tint: [196, 44, 44] },
  rod_blue: { slot: 'rod', label: 'Blue rod', cost: 50, tint: [44, 96, 204] },
  rod_white: { slot: 'rod', label: 'White rod', cost: 50, tint: [226, 226, 226] },
  rod_gold: { slot: 'rod', label: 'Gold rod', cost: 80, tint: [222, 172, 52] },
  boots_green: { slot: 'boots', label: 'Deck boots', cost: 0, tint: null },
  boots_black: { slot: 'boots', label: 'Black boots', cost: 40, tint: [12, 12, 14] },
  boots_brown: { slot: 'boots', label: 'Leather boots', cost: 40, tint: [112, 72, 42] },
  boots_yellow: { slot: 'boots', label: 'Yellow boots', cost: 60, tint: [196, 160, 44] },
  boots_red: { slot: 'boots', label: 'Red boots', cost: 60, tint: [184, 44, 44] },
  waders_khaki: { slot: 'waders', label: 'Field waders', cost: 0, tint: null },
  waders_olive: { slot: 'waders', label: 'Olive waders', cost: 60, tint: [112, 118, 72] },
  waders_grey: { slot: 'waders', label: 'Grey waders', cost: 60, tint: [124, 128, 134] },
  waders_navy: { slot: 'waders', label: 'Navy waders', cost: 70, tint: [52, 66, 112] },
  waders_brown: { slot: 'waders', label: 'Brown waders', cost: 60, tint: [122, 82, 52] },
};

export const SLOTS = ['hat', 'shirt', 'rod', 'boots', 'waders'];
export const SLOT_LABELS = { hat: 'Hats', shirt: 'Shirts', rod: 'Rods', boots: 'Boots', waders: 'Waders' };
export const WARDROBE_LIST = Object.entries(WARDROBE).map(([key, item]) => ({ key, ...item }));
export const itemsFor = (slot) => WARDROBE_LIST.filter((item) => item.slot === slot);

export const DEFAULT_LOOK = { skin: 'medium', hairstyle: 'bald', hair: 'brown', beard: 'none', hat: 'hat_none', shirt: 'shirt_grey', rod: 'rod_graphite', boots: 'boots_green', waders: 'waders_khaki' };
const LOOK_FIELDS = ['skin', 'hairstyle', 'hair', 'beard', 'hat', 'shirt', 'rod', 'boots', 'waders'];

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

// The parts a pixel can belong to (the mask's red channel), and the colour each is painted in
// the art: the mid-tone the shading is measured against when it's retinted.
export const PART = { skin: 1, shirt: 2, waders: 3, boots: 4, rod: 5, outline: 6 };
export const PART_BASE = {
  [PART.skin]: [208, 136, 88],
  [PART.shirt]: [186, 191, 206],
  [PART.waders]: [128, 112, 80],
  [PART.boots]: [42, 42, 47],
  [PART.rod]: [72, 56, 40],
};

// Everything the painter needs for a look: what each dyed part goes to (null = leave the art
// alone), and the head plan — what sits on the skull (`crown`: nothing, hair, or a hat of its
// own `kind`), how far down the head the hair reaches, whether it hangs down the back, and
// what shape of beard the jaw gets.
export function paletteFor(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  const hat = WARDROBE[safe.hat];
  const hair = HAIR_COLORS[safe.hair].rgb;
  const skin = SKIN_TONES[safe.skin].rgb;
  const style = HAIR_STYLES[safe.hairstyle];
  const beard = BEARD_STYLES[safe.beard];
  // A visor is a band and a peak: the crown it sits on is whatever the hairstyle gives.
  const crowned = hat.kind !== 'none' && hat.kind !== 'visor';
  return {
    look: safe,
    skin,
    hair,
    targets: {
      [PART.skin]: safe.skin === DEFAULT_LOOK.skin ? null : skin,
      [PART.shirt]: WARDROBE[safe.shirt].tint,
      [PART.waders]: WARDROBE[safe.waders].tint,
      [PART.boots]: WARDROBE[safe.boots].tint,
      [PART.rod]: WARDROBE[safe.rod].tint,
    },
    head: {
      crown: crowned ? 'hat' : style.depth ? 'hair' : 'bare',
      hat: hat.kind === 'none' ? null : { kind: hat.kind, rgb: hat.rgb, trim: hat.trim },
      hairDepth: style.depth,
      hairBack: style.back,
      beard: { ...beard },
    },
  };
}

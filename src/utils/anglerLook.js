// How an angler looks in Cast & Catch, and the wardrobe Marina's Outfitters sells.
//
// The angler is not a drawing any more: it's a rig (utils/anglerRig.js) rendered part by part
// (utils/anglerDraw.js) — skin, hair, facial hair, hat, jacket, waders, boots and rod are each
// their own layer with their own colours, so a look is simply the palette and the styles the
// renderer is handed. This module owns that model: the free choices (skin tone, hair style and
// colour, facial hair), the racks (hats, rods, boots, waders — bought once with tackle points,
// `wardrobe` on game_profiles, worn from `look`, migration 0022), and `paletteFor`, the pure
// look → colours step the renderer and its tests share. Every slot has a free default, so a
// look can always be worn even after a refund or a bad save.
export const SKIN_TONES = {
  fair: { label: 'Fair', rgb: [246, 208, 176] },
  light: { label: 'Light', rgb: [236, 176, 128] },
  medium: { label: 'Medium', rgb: [220, 150, 100] },
  olive: { label: 'Olive', rgb: [186, 132, 80] },
  brown: { label: 'Brown', rgb: [140, 85, 50] },
  deep: { label: 'Deep', rgb: [86, 52, 34] },
};

export const HAIR_COLORS = {
  auburn: { label: 'Auburn', rgb: [110, 52, 24] },
  brown: { label: 'Brown', rgb: [70, 48, 32] },
  black: { label: 'Black', rgb: [30, 26, 24] },
  blond: { label: 'Blond', rgb: [206, 166, 84] },
  red: { label: 'Red', rgb: [178, 72, 30] },
  grey: { label: 'Grey', rgb: [160, 160, 156] },
};

export const HAIR_STYLES = {
  short: { label: 'Short' },
  long: { label: 'Long' },
  bald: { label: 'Bald' },
};

export const BEARD_STYLES = {
  full: { label: 'Full beard' },
  goatee: { label: 'Goatee' },
  mustache: { label: 'Mustache' },
  stubble: { label: 'Stubble' },
  none: { label: 'Clean shaven' },
};

// The racks. `tint` is the colour the slot's part is drawn in; hats also carry a `style` the
// renderer draws (a cap has a cream front panel; everything else is its own shape).
export const WARDROBE = {
  cap_green: { slot: 'hat', label: 'Club cap', cost: 0, style: 'cap', tint: [30, 66, 58] },
  hat_none: { slot: 'hat', label: 'Bare head', cost: 0, style: 'none', tint: null },
  cap_red: { slot: 'hat', label: 'Red cap', cost: 40, style: 'cap', tint: [176, 42, 40] },
  cap_navy: { slot: 'hat', label: 'Navy cap', cost: 40, style: 'cap', tint: [34, 48, 96] },
  cap_black: { slot: 'hat', label: 'Black cap', cost: 40, style: 'cap', tint: [34, 34, 38] },
  cap_orange: { slot: 'hat', label: 'Blaze cap', cost: 50, style: 'cap', tint: [226, 112, 30] },
  hat_visor: { slot: 'hat', label: 'Sun visor', cost: 60, style: 'visor', tint: [232, 232, 226] },
  hat_beanie: { slot: 'hat', label: 'Knit beanie', cost: 70, style: 'beanie', tint: [150, 40, 44] },
  hat_straw: { slot: 'hat', label: 'Straw hat', cost: 80, style: 'straw', tint: [214, 178, 96] },
  hat_bucket: { slot: 'hat', label: 'Bucket hat', cost: 90, style: 'bucket', tint: [104, 110, 78] },
  hat_cowboy: { slot: 'hat', label: 'Cowboy hat', cost: 120, style: 'cowboy', tint: [116, 74, 42] },
  rod_graphite: { slot: 'rod', label: 'Graphite rod', cost: 0, tint: [58, 58, 62] },
  rod_red: { slot: 'rod', label: 'Red rod', cost: 50, tint: [196, 44, 44] },
  rod_blue: { slot: 'rod', label: 'Blue rod', cost: 50, tint: [44, 96, 204] },
  rod_white: { slot: 'rod', label: 'White rod', cost: 50, tint: [226, 226, 226] },
  rod_gold: { slot: 'rod', label: 'Gold rod', cost: 80, tint: [222, 172, 52] },
  boots_green: { slot: 'boots', label: 'Dock boots', cost: 0, tint: [38, 48, 42] },
  boots_black: { slot: 'boots', label: 'Black boots', cost: 40, tint: [24, 24, 28] },
  boots_brown: { slot: 'boots', label: 'Leather boots', cost: 40, tint: [112, 72, 42] },
  boots_yellow: { slot: 'boots', label: 'Yellow boots', cost: 60, tint: [232, 192, 52] },
  boots_red: { slot: 'boots', label: 'Red boots', cost: 60, tint: [184, 44, 44] },
  waders_khaki: { slot: 'waders', label: 'Khaki waders', cost: 0, tint: [176, 140, 98] },
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

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
export const shade = (rgb, factor) => rgb.map((channel) => clamp(channel * factor));
export const mix = (a, b, t) => a.map((channel, index) => clamp(channel + (b[index] - channel) * t));

// The three tones every part is drawn in: its colour, the shadow side, and a highlight.
const tones = (rgb, dark = 0.74, light = 1.18) => ({ base: rgb, shade: shade(rgb, dark), light: shade(rgb, light) });

// Fixed colours: the jacket everyone wears, the reel, the cork grip and the sticker outline.
export const FIXED = {
  jacket: [88, 86, 52],
  pack: [64, 60, 40],
  cork: [126, 86, 52],
  reel: [78, 80, 86],
  panel: [226, 212, 178],
  eye: [22, 16, 12],
  mouth: [126, 42, 40],
  teeth: [240, 236, 226],
  outline: [26, 18, 10],
};

// Everything the renderer needs to draw a look: tones per part plus the styles it switches on.
export function paletteFor(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  const hat = WARDROBE[safe.hat];
  const hair = HAIR_COLORS[safe.hair].rgb;
  const skin = SKIN_TONES[safe.skin].rgb;
  return {
    look: safe,
    skin: tones(skin, 0.8, 1.1),
    hair: tones(hair, 0.72, 1.25),
    stubble: mix(shade(skin, 0.8), hair, 0.5),
    hairstyle: safe.hairstyle,
    beard: safe.beard,
    hatStyle: hat.style,
    hat: hat.tint ? tones(hat.tint) : null,
    panel: tones(FIXED.panel, 0.84, 1.04),
    jacket: tones(FIXED.jacket, 0.72, 1.2),
    pack: tones(FIXED.pack),
    waders: tones(WARDROBE[safe.waders].tint),
    boots: tones(WARDROBE[safe.boots].tint, 0.7, 1.3),
    rod: tones(WARDROBE[safe.rod].tint, 0.7, 1.3),
    cork: tones(FIXED.cork),
    reel: tones(FIXED.reel, 0.7, 1.4),
    eye: FIXED.eye,
    mouth: FIXED.mouth,
    teeth: FIXED.teeth,
    outline: FIXED.outline,
  };
}

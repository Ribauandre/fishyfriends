// How an angler looks in Cast & Catch, and the wardrobe Marina's Outfitters sells.
//
// The angler is the pixel-art sprite sheet in assets/angler, sliced from art/angler-pixel-sheet.png
// by scripts/anglerPixelSlice.mjs: a small character — thirty-odd pixels tall — drawn in a cap, a
// beard, a cream shirt, an olive vest, blue jeans and brown boots. He is drawn wearing all of it,
// and there is no version of him without, so **every cosmetic here is a colour**. That is the whole
// model now: the painter recolours what the artist drew and never invents a shape.
//
// This replaced a system that built cosmetics out of overlays lifted off a dozen sheets of the same
// character in the same poses. That worked, but it needed a sheet per garment and every one of them
// had to change exactly one thing; when a sheet changed two, or drew him in a hat the lift could not
// tell from his beard, the result was flecks and patches on the finished sprite. A recolour cannot
// have that class of bug: the shape is the artist's in every frame, and a dye can only be wrong
// about a colour.
//
// Which pixels are which garment comes from the part masks in assets/angler/masks, built by
// scripts/anglerPixelMasks.mjs — at this size the sheet reuses one colour for several things (cream
// is the cap's crown *and* the shirt; brown is his hair, his boots *and* the rod), so the masks are
// what separate them, once, offline, where they can be looked at. assets/angler/paint.json carries
// the measured colour each part is painted in, which is what its dye is reckoned against.
//
// Two kinds of recolour, and the difference matters. Gear is *dyed*: `tintPixel` keeps how light or
// dark a pixel was against its part's mid-tone and reapplies that to the target, so the artist's
// folds and highlights survive. Skin is not dyed — a dye keeps only brightness and rebuilds the
// colour, which flattens a face and turns its deepest tone grey. Instead a skin pixel is *moved*
// from its band in his own ramp to the same band in the ramp being worn, and the five ramps it can
// be moved to are real drawn skin: the previous sheet's artist drew a row of five separate heads,
// one per tone, and utils/skinRamps.json is what was measured off them. They are still the only
// measured skin tones in this repo, which is why they outlived the sheet they came from.
//
// Wardrobe keys are stable across art swaps. Every key that existed before this sheet still exists,
// pointing at whatever it now is and relabelled to match — a knitted beanie is not a beanie once
// the art has no beanie in it, so it is a cap in that colour. Nobody's purchase is orphaned, and
// relabelling is how that promise is kept when the art changes out from under a name.
import skinRamps from './skinRamps.json';
import paint from '../assets/angler/paint.json';

// The parts a pixel can belong to — the mask's red channel, and the contract with
// scripts/anglerPixelMasks.mjs. `outline` is his keyline and nothing recolours it; a pixel in no
// part at all (the reel, a caught fish) is left exactly as drawn.
export const PART = { outline: 1, skin: 2, cap: 3, hair: 4, shirt: 5, vest: 6, jeans: 7, boots: 8, rod: 9 };

// What each part is painted in, measured off the art by the mask script.
export const PART_BASE = {
  [PART.skin]: paint.base.skin,
  [PART.cap]: paint.base.cap,
  [PART.hair]: paint.base.hair,
  [PART.shirt]: paint.base.shirt,
  [PART.vest]: paint.base.vest,
  [PART.jeans]: paint.base.jeans,
  [PART.boots]: paint.base.boots,
  [PART.rod]: paint.base.rod,
};

// His own skin, as a ramp, and the five the other artist drew.
export const SKIN_BODY = paint.body;
// Each dyed part's drawn shades, darkest first, and which of them it is mostly drawn in — the
// table a dye swaps through (see anglerPaint's swapShade).
export const PART_SHADES = Object.fromEntries(Object.entries(paint.shades || {}).map(([name, s]) => [PART[name], s]));
export const SKIN_TONES = {
  fair: { label: 'Fair', rgb: [248, 176, 128], tone: 0 },
  light: { label: 'Light', rgb: [232, 164, 112], tone: 1 },
  medium: { label: 'Medium', rgb: [208, 136, 88], tone: 2 },
  olive: { label: 'Olive', rgb: [186, 120, 80], tone: [2, 3, 0.53] },
  brown: { label: 'Brown', rgb: [168, 104, 72], tone: 3 },
  deep: { label: 'Deep', rgb: [104, 72, 56], tone: 4 },
};

// The ramp a tone wears: one the artist drew, or a mix of two of them. Olive is the one tone with
// no head of its own, mixed from the two either side at the ratio that lands it on its swatch.
export function skinRampFor(key) {
  const tone = (SKIN_TONES[key] || SKIN_TONES[DEFAULT_LOOK.skin]).tone;
  if (!Array.isArray(tone)) return skinRamps.tones[tone];
  const [from, to, t] = tone;
  return skinRamps.tones[from].map((band, i) => band.map((v, k) => Math.round(v + (skinRamps.tones[to][i][k] - v) * t)));
}

// Hair and beard together: the sheet draws one head of hair and one beard, so what is chosen is
// their colour. Free, like the skin tone.
export const HAIR_COLORS = {
  auburn: { label: 'Auburn', rgb: [116, 58, 30] },
  brown: { label: 'Brown', rgb: [74, 50, 34] },
  black: { label: 'Black', rgb: [30, 26, 24] },
  blond: { label: 'Blond', rgb: [186, 152, 96] },
  red: { label: 'Red', rgb: [180, 74, 32] },
  grey: { label: 'Grey', rgb: [156, 156, 156] },
};

// The racks. `tint` null is the art's own colour, which is what the free item in every rack is —
// so the free defaults together are the sheet exactly as drawn, and the stock strips can show
// unpainted.
//
// The cap rack carries every key the old hat rack had. There were twenty-three hats then, drawn as
// shapes — beanies, buckets, a sou'wester — and this sheet has one cap. So each key is now that cap
// in the colour nearest what it used to be, named for the colour rather than for a hat that is no
// longer there. `hat_none` is the exception it has to be: there is no bare head to go back to, so
// it is an alias rather than an item (see ALIASES).
export const WARDROBE = {
  cap_green: { slot: 'hat', label: 'Club cap', cost: 0, tint: null },
  cap_red: { slot: 'hat', label: 'Red cap', cost: 40, tint: [186, 62, 52] },
  cap_navy: { slot: 'hat', label: 'Navy cap', cost: 40, tint: [48, 62, 108] },
  cap_black: { slot: 'hat', label: 'Black cap', cost: 40, tint: [46, 46, 50] },
  cap_orange: { slot: 'hat', label: 'Blaze cap', cost: 50, tint: [214, 108, 32] },
  cap_brown: { slot: 'hat', label: 'Field cap', cost: 50, tint: [110, 82, 54] },
  cap_camo: { slot: 'hat', label: 'Moss cap', cost: 60, tint: [66, 78, 48] },
  hat_beanie: { slot: 'hat', label: 'Charcoal cap', cost: 60, tint: [70, 70, 76] },
  hat_beanie_olive: { slot: 'hat', label: 'Olive cap', cost: 60, tint: [96, 108, 60] },
  hat_beanie_red: { slot: 'hat', label: 'Crimson cap', cost: 60, tint: [170, 50, 44] },
  hat_beanie_navy: { slot: 'hat', label: 'Steel cap', cost: 60, tint: [52, 68, 116] },
  hat_beanie_grey: { slot: 'hat', label: 'Grey cap', cost: 60, tint: [132, 134, 140] },
  hat_visor: { slot: 'hat', label: 'Bone cap', cost: 70, tint: [206, 198, 172] },
  hat_bucket: { slot: 'hat', label: 'Tan cap', cost: 80, tint: [168, 140, 96] },
  hat_boonie: { slot: 'hat', label: 'Umber cap', cost: 90, tint: [118, 88, 58] },
  hat_straw: { slot: 'hat', label: 'Straw cap', cost: 90, tint: [198, 170, 110] },
  hat_straw_red: { slot: 'hat', label: 'Rust cap', cost: 90, tint: [126, 96, 62] },
  hat_wide_olive: { slot: 'hat', label: 'Sage cap', cost: 100, tint: [104, 116, 66] },
  hat_wide_navy: { slot: 'hat', label: 'Slate cap', cost: 100, tint: [54, 70, 118] },
  hat_cowboy: { slot: 'hat', label: 'Amber cap', cost: 120, tint: [198, 147, 45] },
  // Actually white: the dye keeps a pixel's shade against the crown's own mid-tone, so a target
  // of 214 came out as the light grey it is. A white cap needs a white target.
  hat_boonie_white: { slot: 'hat', label: 'White cap', cost: 130, tint: [242, 242, 238] },
  hat_boonie_olive: { slot: 'hat', label: 'Guide cap', cost: 130, tint: [78, 88, 52] },

  shirt_grey: { slot: 'shirt', label: 'Work shirt', cost: 0, tint: null },
  shirt_white: { slot: 'shirt', label: 'White tee', cost: 40, tint: [236, 236, 238] },
  shirt_navy: { slot: 'shirt', label: 'Navy tee', cost: 40, tint: [56, 72, 112] },
  shirt_red: { slot: 'shirt', label: 'Flannel red', cost: 50, tint: [168, 62, 54] },
  shirt_olive: { slot: 'shirt', label: 'Olive tee', cost: 50, tint: [104, 116, 74] },

  // The vest is new: the old sheet had no garment over the shirt, so these keys are new too and
  // nothing had to be repointed onto them.
  vest_olive: { slot: 'vest', label: 'Guide vest', cost: 0, tint: null },
  vest_tan: { slot: 'vest', label: 'Tan vest', cost: 40, tint: [170, 142, 98] },
  vest_rust: { slot: 'vest', label: 'Rust vest', cost: 50, tint: [158, 78, 44] },
  vest_navy: { slot: 'vest', label: 'Navy vest', cost: 50, tint: [50, 66, 104] },
  vest_black: { slot: 'vest', label: 'Black vest', cost: 60, tint: [44, 44, 48] },

  rod_graphite: { slot: 'rod', label: 'Graphite rod', cost: 0, tint: null },
  rod_red: { slot: 'rod', label: 'Red rod', cost: 50, tint: [196, 44, 44] },
  rod_blue: { slot: 'rod', label: 'Blue rod', cost: 50, tint: [44, 96, 204] },
  rod_white: { slot: 'rod', label: 'White rod', cost: 50, tint: [226, 226, 226] },
  rod_gold: { slot: 'rod', label: 'Gold rod', cost: 80, tint: [222, 172, 52] },

  boots_green: { slot: 'boots', label: 'Deck boots', cost: 0, tint: null },
  boots_black: { slot: 'boots', label: 'Black boots', cost: 40, tint: [12, 12, 14] },
  boots_brown: { slot: 'boots', label: 'Leather boots', cost: 40, tint: [124, 84, 48] },
  boots_yellow: { slot: 'boots', label: 'Yellow boots', cost: 60, tint: [196, 160, 44] },
  boots_red: { slot: 'boots', label: 'Red boots', cost: 60, tint: [184, 44, 44] },

  // He wears jeans, not waders. The slot keeps the name it is stored under on game_profiles so
  // that looks saved before this sheet still load; only the labels say what it is.
  waders_khaki: { slot: 'waders', label: 'Blue jeans', cost: 0, tint: null },
  waders_jeans: { slot: 'waders', label: 'Indigo jeans', cost: 80, tint: [58, 66, 116] },
  waders_olive: { slot: 'waders', label: 'Olive trousers', cost: 60, tint: [112, 118, 72] },
  waders_grey: { slot: 'waders', label: 'Grey trousers', cost: 60, tint: [124, 128, 134] },
  waders_navy: { slot: 'waders', label: 'Navy trousers', cost: 70, tint: [52, 66, 112] },
  waders_brown: { slot: 'waders', label: 'Brown trousers', cost: 60, tint: [122, 82, 52] },
};

// Keys that no longer name anything wearable, and what they become. `hat_none` was a bare head,
// and this character is drawn in a cap — so someone who saved a look with no hat on gets the free
// cap rather than a look that refuses to load.
const ALIASES = { hat_none: 'cap_green' };

export const SLOTS = ['hat', 'shirt', 'vest', 'rod', 'boots', 'waders'];
export const SLOT_LABELS = { hat: 'Caps', shirt: 'Shirts', vest: 'Vests', rod: 'Rods', boots: 'Boots', waders: 'Jeans' };
export const WARDROBE_LIST = Object.entries(WARDROBE).map(([key, item]) => ({ key, ...item }));
export const itemsFor = (slot) => WARDROBE_LIST.filter((item) => item.slot === slot);

export const DEFAULT_LOOK = {
  skin: 'medium', hair: 'brown',
  hat: 'cap_green', shirt: 'shirt_grey', vest: 'vest_olive', rod: 'rod_graphite', boots: 'boots_green', waders: 'waders_khaki',
};
const LOOK_FIELDS = ['skin', 'hair', ...SLOTS];

export function isOwned(itemKey, wardrobe = []) {
  const item = WARDROBE[itemKey];
  return Boolean(item) && (item.cost === 0 || wardrobe.includes(itemKey));
}

// A look you can actually wear: unknown or unowned choices fall back to the free defaults, and a
// retired key is read as whatever replaced it. Looks saved against the old sheet carry `hairstyle`
// and `beard` as well; this sheet draws one of each, so those are simply ignored rather than
// rejected — the rest of the look still loads.
export function normalizeLook(look, wardrobe = []) {
  const safe = { ...DEFAULT_LOOK };
  if (!look || typeof look !== 'object') return safe;
  if (SKIN_TONES[look.skin]) safe.skin = look.skin;
  if (HAIR_COLORS[look.hair]) safe.hair = look.hair;
  SLOTS.forEach((slot) => {
    const key = ALIASES[look[slot]] || look[slot];
    if (WARDROBE[key]?.slot === slot && isOwned(key, wardrobe)) safe[slot] = key;
  });
  return safe;
}

export function lookKey(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  return LOOK_FIELDS.map((field) => safe[field]).join('|');
}

export const isDefaultLook = (look) => lookKey(look) === lookKey(DEFAULT_LOOK);

// Everything the painter needs for a look: what each part goes to, null meaning leave the art
// alone. `skinRamp` is null for the stock tone for the same reason — his own skin is already his.
export function paletteFor(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  return {
    look: safe,
    skin: SKIN_TONES[safe.skin].rgb,
    hair: HAIR_COLORS[safe.hair].rgb,
    skinRamp: safe.skin === DEFAULT_LOOK.skin ? null : skinRampFor(safe.skin),
    targets: {
      [PART.cap]: WARDROBE[safe.hat].tint,
      [PART.shirt]: WARDROBE[safe.shirt].tint,
      [PART.vest]: WARDROBE[safe.vest].tint,
      [PART.rod]: WARDROBE[safe.rod].tint,
      [PART.boots]: WARDROBE[safe.boots].tint,
      [PART.jeans]: WARDROBE[safe.waders].tint,
      // His hair and beard are one drawing and take the hair colour, which is always set — there
      // is no "as drawn" for it, because brown *is* the drawn colour and dyeing to it is a no-op.
      [PART.hair]: safe.hair === DEFAULT_LOOK.hair ? null : HAIR_COLORS[safe.hair].rgb,
    },
  };
}

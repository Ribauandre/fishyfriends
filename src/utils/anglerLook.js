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
  blond: { label: 'Blond', rgb: [186, 152, 96] },
  red: { label: 'Red', rgb: [180, 74, 32] },
  grey: { label: 'Grey', rgb: [156, 156, 156] },
};

// The sheet draws the head bald, so a hairstyle is drawn hair put on it, and there are two
// kinds. `overlay` is the artist's own, lifted pose by pose off art/angler-haired-sheet.png into
// assets/angler/hair/*.png — it lies pixel-for-pixel on the strip, so it is right at every angle
// the sheet draws, including the heads thrown back mid-cast and bowed on a loss. The rest are
// `sprite`s: generated front-on hairpieces in assets/angler/hair.png, stamped on the crown. The
// overlay is the better of the two and there is only one of it; the sprites are the variety.
// `bald` is the art as it comes.
export const HAIR_STYLES = {
  bald: { label: 'Bald' },
  short: { label: 'Short', overlay: true },
  sweep: { label: 'Swept', sprite: 'side_part' },
  crew: { label: 'Crew cut', sprite: 'crew' },
  mop: { label: 'Mop', sprite: 'mop' },
  curls: { label: 'Curls', sprite: 'curls' },
  receding: { label: "Widow's peak", sprite: 'widows_peak' },
  long: { label: 'Long', sprite: 'long' },
  topknot: { label: 'Top knot', sprite: 'top_knot' },
  shaggy: { label: 'Shaggy', sprite: 'shaggy' },
};

// A beard is the artist's own, lifted pose by pose off the dressed sheet into the overlays in
// assets/angler/beard, so a style is only which part of it to keep: `all`, the `chin` below the
// mouth, or the `lip` above it. `dither` thins what is kept to stubble.
export const BEARD_STYLES = {
  none: { label: 'Clean shaven', keep: 'none' },
  stubble: { label: 'Stubble', keep: 'all', dither: true },
  mustache: { label: 'Moustache', keep: 'lip' },
  goatee: { label: 'Goatee', keep: 'chin' },
  full: { label: 'Full beard', keep: 'all' },
};

// The racks. A waders item is normally a dye, but `overlay` marks the one that is a whole
// drawn outfit instead — lifted pose by pose off art/angler-outfit-sheet.png, so it can change
// the garment's shape and not just its colour, which no dye can. It leaves the sleeves alone,
// so the shirt rack still works underneath it.
// A hat is one of the twenty drawn in assets/angler/hats.png, named by its `sprite`
// (see utils/hatSprites.json) — the painter stamps it, it does not build it. A few are the same
// drawing taken in another colour, which is what `tint` is for: it re-dyes the sprite against
// `base`, the colour that drawing is painted in. Shirts, rods, boots and waders are dyes on the
// character himself: `tint` null means the art's own colour, which is what the free item in
// every rack is.
const CAP_OLIVE = [96, 108, 56];

export const WARDROBE = {
  hat_none: { slot: 'hat', label: 'Bare head', cost: 0, sprite: null },
  cap_green: { slot: 'hat', label: 'Club cap', cost: 0, sprite: 'cap_olive' },
  cap_red: { slot: 'hat', label: 'Angler cap, red', cost: 40, sprite: 'cap_fish_red' },
  cap_navy: { slot: 'hat', label: 'Angler cap, blue', cost: 40, sprite: 'cap_fish_navy' },
  cap_black: { slot: 'hat', label: 'Black cap', cost: 40, sprite: 'cap_olive', base: CAP_OLIVE, tint: [46, 46, 50] },
  cap_orange: { slot: 'hat', label: 'Blaze cap', cost: 50, sprite: 'cap_olive', base: CAP_OLIVE, tint: [214, 108, 32] },
  cap_brown: { slot: 'hat', label: 'Field cap', cost: 50, sprite: 'cap_brown' },
  cap_camo: { slot: 'hat', label: 'Camo cap', cost: 60, sprite: 'cap_camo' },
  hat_beanie: { slot: 'hat', label: 'Knit beanie', cost: 60, sprite: 'beanie_black' },
  hat_beanie_olive: { slot: 'hat', label: 'Olive beanie', cost: 60, sprite: 'beanie_olive' },
  hat_beanie_red: { slot: 'hat', label: 'Red beanie', cost: 60, sprite: 'beanie_red' },
  hat_beanie_navy: { slot: 'hat', label: 'Navy beanie', cost: 60, sprite: 'beanie_navy' },
  hat_beanie_grey: { slot: 'hat', label: 'Grey beanie', cost: 60, sprite: 'beanie_grey' },
  hat_visor: { slot: 'hat', label: 'Canvas bucket', cost: 70, sprite: 'bucket_canvas' },
  hat_bucket: { slot: 'hat', label: 'Bucket hat', cost: 80, sprite: 'bucket_tan' },
  hat_boonie: { slot: 'hat', label: 'Camo boonie', cost: 90, sprite: 'bucket_camo' },
  hat_straw: { slot: 'hat', label: 'Straw hat', cost: 90, sprite: 'straw_blue' },
  hat_straw_red: { slot: 'hat', label: 'Straw hat, red band', cost: 90, sprite: 'straw_red' },
  hat_wide_olive: { slot: 'hat', label: 'Olive rain hat', cost: 100, sprite: 'wide_olive' },
  hat_wide_navy: { slot: 'hat', label: 'Navy rain hat', cost: 100, sprite: 'wide_navy' },
  hat_cowboy: { slot: 'hat', label: "Sou'wester", cost: 120, sprite: 'souwester' },
  hat_boonie_white: { slot: 'hat', label: 'Flats boonie', cost: 130, sprite: 'boonie_white' },
  hat_boonie_olive: { slot: 'hat', label: 'Guide boonie', cost: 130, sprite: 'boonie_olive' },
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
  boots_brown: { slot: 'boots', label: 'Leather boots', cost: 40, overlay: true },
  boots_yellow: { slot: 'boots', label: 'Yellow boots', cost: 60, tint: [196, 160, 44] },
  boots_red: { slot: 'boots', label: 'Red boots', cost: 60, tint: [184, 44, 44] },
  waders_khaki: { slot: 'waders', label: 'Field waders', cost: 0, tint: null },
  waders_jeans: { slot: 'waders', label: 'Vest and jeans', cost: 80, overlay: true },
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
// The mid-tones the art is painted in, which its dyes are measured against. Each is read off
// the lighter strands rather than the middle, so that dyeing a pale colour onto them lands under
// white instead of blowing out. DRAWN_BASE covers everything lifted off a pose sheet — the
// beard and the hair overlays, which are the same hand and the same palette; HAIR_SPRITE_BASE
// is the generated hairpieces, which came out lighter.
export const DRAWN_BASE = [112, 72, 48];
export const HAIR_SPRITE_BASE = [132, 84, 44];

export const PART_BASE = {
  [PART.skin]: [208, 136, 88],
  [PART.shirt]: [186, 191, 206],
  [PART.waders]: [128, 112, 80],
  [PART.boots]: [42, 42, 47],
  [PART.rod]: [72, 56, 40],
};

// Everything the painter needs for a look: what each dyed part goes to (null = leave the art
// alone), and the head plan — whether there is hair on the skull and how far down it reaches,
// whether it hangs down the back, which drawn hat to stamp, and which part of the drawn beard
// to keep.
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
      [PART.shirt]: WARDROBE[safe.shirt].tint,
      // A drawn outfit covers the waders, so dyeing them underneath it would do nothing.
      [PART.waders]: WARDROBE[safe.waders].overlay ? null : WARDROBE[safe.waders].tint,
      // Drawn boots cover the painted ones, so dyeing those underneath would do nothing.
      [PART.boots]: WARDROBE[safe.boots].overlay ? null : WARDROBE[safe.boots].tint,
      [PART.rod]: WARDROBE[safe.rod].tint,
    },
    outfit: WARDROBE[safe.waders].overlay ? { overlay: true } : null,
    boots: WARDROBE[safe.boots].overlay ? { overlay: true } : null,
    head: {
      // Hair goes on whether or not a hat does: a cap leaves plenty of it showing.
      hair: style.overlay ? { overlay: true } : style.sprite ? { sprite: style.sprite } : null,
      hat: hat.sprite ? { sprite: hat.sprite, base: hat.base || null, tint: hat.tint || null } : null,
      beard: { ...beard },
    },
  };
}

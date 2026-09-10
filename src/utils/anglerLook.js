// How an angler looks in Cast & Catch, and the wardrobe Marina's Outfitters sells. The sprite
// strips in assets/angler are one drawing; a look is applied by recolouring regions of it —
// each strip has a mask (assets/angler/masks) whose red channel says which part a pixel is
// (skin, beard, hat, cap panel, jacket, waders, boots, rod) — and, for the hats that aren't a
// cap, by drawing an overlay on the head at each frame's hat anchor (utils/anglerAnchors.json,
// both generated offline from the art). paintPixels here is the pure recolour so it can be
// unit-tested on plain arrays; utils/anglerPaint.js does the canvas work at runtime.
//
// Skin tone, facial hair and hair colour are yours to set for free. Hats, rod colours, boots
// and waders are bought once with tackle points (`wardrobe` on game_profiles) and worn from
// the look (`look` on game_profiles, migration 0022). Every slot has a free default, so a look
// can always be worn even after a refund or a bad save.
export const PART = { skin: 1, beard: 2, hat: 3, panel: 4, jacket: 5, waders: 6, boots: 7, rod: 8, outline: 9 };

// The colour each part is painted in the original strips: the mid-tone the shading is
// measured against when a pixel is retinted.
const PART_BASE = {
  [PART.skin]: [220, 103, 38],
  [PART.beard]: [80, 40, 20],
  [PART.hat]: [23, 57, 52],
  [PART.panel]: [207, 184, 153],
  [PART.jacket]: [86, 83, 50],
  [PART.waders]: [179, 138, 100],
  [PART.boots]: [24, 26, 27],
  [PART.rod]: [48, 48, 48],
};

export const SKIN_TONES = {
  fair: { label: 'Fair', rgb: [246, 208, 176] },
  light: { label: 'Light', rgb: [236, 176, 128] },
  medium: { label: 'Medium', rgb: [220, 103, 38] },
  olive: { label: 'Olive', rgb: [186, 132, 80] },
  brown: { label: 'Brown', rgb: [140, 85, 50] },
  deep: { label: 'Deep', rgb: [86, 52, 34] },
};

export const BEARD_STYLES = {
  full: { label: 'Full beard' },
  goatee: { label: 'Goatee' },
  none: { label: 'Clean shaven' },
};

export const HAIR_COLORS = {
  auburn: { label: 'Auburn', rgb: [80, 40, 20] },
  brown: { label: 'Brown', rgb: [70, 48, 32] },
  black: { label: 'Black', rgb: [26, 22, 20] },
  blond: { label: 'Blond', rgb: [196, 156, 84] },
  grey: { label: 'Grey', rgb: [150, 150, 150] },
};

// The racks. `tint` recolours the slot's region; `overlay` (hats) is a drawing on the head that
// replaces the cap, with the cap underneath dyed to the hair colour so nothing green peeks out.
export const WARDROBE = {
  cap_green: { slot: 'hat', label: 'Club cap', cost: 0, tint: [23, 57, 52] },
  cap_red: { slot: 'hat', label: 'Red cap', cost: 40, tint: [176, 42, 40] },
  cap_navy: { slot: 'hat', label: 'Navy cap', cost: 40, tint: [34, 48, 96] },
  cap_black: { slot: 'hat', label: 'Black cap', cost: 40, tint: [30, 30, 34] },
  cap_orange: { slot: 'hat', label: 'Blaze cap', cost: 50, tint: [226, 112, 30] },
  hat_bucket: { slot: 'hat', label: 'Bucket hat', cost: 90, overlay: 'bucket' },
  hat_beanie: { slot: 'hat', label: 'Knit beanie', cost: 70, overlay: 'beanie' },
  hat_straw: { slot: 'hat', label: 'Straw hat', cost: 80, overlay: 'straw' },
  hat_visor: { slot: 'hat', label: 'Sun visor', cost: 60, overlay: 'visor' },
  hat_cowboy: { slot: 'hat', label: 'Cowboy hat', cost: 120, overlay: 'cowboy' },
  rod_graphite: { slot: 'rod', label: 'Graphite rod', cost: 0, tint: [48, 48, 48] },
  rod_red: { slot: 'rod', label: 'Red rod', cost: 50, tint: [196, 44, 44] },
  rod_blue: { slot: 'rod', label: 'Blue rod', cost: 50, tint: [44, 96, 204] },
  rod_white: { slot: 'rod', label: 'White rod', cost: 50, tint: [226, 226, 226] },
  rod_gold: { slot: 'rod', label: 'Gold rod', cost: 80, tint: [222, 172, 52] },
  boots_green: { slot: 'boots', label: 'Dock boots', cost: 0, tint: [24, 26, 27] },
  boots_black: { slot: 'boots', label: 'Black boots', cost: 40, tint: [12, 12, 14] },
  boots_brown: { slot: 'boots', label: 'Leather boots', cost: 40, tint: [112, 72, 42] },
  boots_yellow: { slot: 'boots', label: 'Yellow boots', cost: 60, tint: [232, 192, 52] },
  boots_red: { slot: 'boots', label: 'Red boots', cost: 60, tint: [184, 44, 44] },
  waders_khaki: { slot: 'waders', label: 'Khaki waders', cost: 0, tint: [179, 138, 100] },
  waders_olive: { slot: 'waders', label: 'Olive waders', cost: 60, tint: [112, 118, 72] },
  waders_grey: { slot: 'waders', label: 'Grey waders', cost: 60, tint: [124, 128, 134] },
  waders_navy: { slot: 'waders', label: 'Navy waders', cost: 70, tint: [52, 66, 112] },
  waders_brown: { slot: 'waders', label: 'Brown waders', cost: 60, tint: [122, 82, 52] },
};

export const SLOTS = ['hat', 'rod', 'boots', 'waders'];
export const SLOT_LABELS = { hat: 'Hats', rod: 'Rods', boots: 'Boots', waders: 'Waders' };
export const WARDROBE_LIST = Object.entries(WARDROBE).map(([key, item]) => ({ key, ...item }));
export const itemsFor = (slot) => WARDROBE_LIST.filter((item) => item.slot === slot);

export const DEFAULT_LOOK = { skin: 'medium', beard: 'full', hair: 'auburn', hat: 'cap_green', rod: 'rod_graphite', boots: 'boots_green', waders: 'waders_khaki' };

export function isOwned(itemKey, wardrobe = []) {
  const item = WARDROBE[itemKey];
  return Boolean(item) && (item.cost === 0 || wardrobe.includes(itemKey));
}

// A look you can actually wear: unknown or unowned choices fall back to the free defaults.
export function normalizeLook(look = {}, wardrobe = []) {
  const safe = { ...DEFAULT_LOOK };
  if (SKIN_TONES[look.skin]) safe.skin = look.skin;
  if (BEARD_STYLES[look.beard]) safe.beard = look.beard;
  if (HAIR_COLORS[look.hair]) safe.hair = look.hair;
  SLOTS.forEach((slot) => { const key = look[slot]; if (WARDROBE[key]?.slot === slot && isOwned(key, wardrobe)) safe[slot] = key; });
  return safe;
}

export function lookKey(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  return ['skin', 'beard', 'hair', 'hat', 'rod', 'boots', 'waders'].map((field) => safe[field]).join('|');
}

export const isDefaultLook = (look) => lookKey(look) === lookKey(DEFAULT_LOOK);

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const luminance = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Retint one pixel: keep how light or dark it was relative to the part's painted mid-tone
// and reapply that shading to the target colour, so highlights and folds survive the dye.
export function tintPixel(rgb, base, target) {
  const shade = Math.max(0.3, Math.min(1.7, luminance(...rgb) / luminance(...base)));
  return [clamp(target[0] * shade), clamp(target[1] * shade), clamp(target[2] * shade)];
}

// What colour each part is dyed for a look (null = leave the art alone).
export function partTargets(look) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  const hat = WARDROBE[safe.hat];
  const hair = HAIR_COLORS[safe.hair].rgb;
  return {
    [PART.skin]: SKIN_TONES[safe.skin].rgb,
    [PART.beard]: hair,
    // Under an overlay hat the cap becomes hair, so whatever peeks past the brim reads as hair.
    [PART.hat]: hat.overlay ? hair : hat.tint,
    [PART.panel]: hat.overlay ? hair : null,
    [PART.rod]: WARDROBE[safe.rod].tint,
    [PART.boots]: WARDROBE[safe.boots].tint,
    [PART.waders]: WARDROBE[safe.waders].tint,
    [PART.jacket]: null,
  };
}

// Recolour a strip in place. `pixels` is RGBA for the whole strip, `mask` the matching
// mask's RGBA (red = part id), `anchors` the per-frame boxes so a goatee can keep only the
// middle of the beard and a clean shave can turn the rest into face.
export function paintPixels({ pixels, mask, width, height, frameWidth, anchors = [], look }) {
  const safe = normalizeLook(look, Object.keys(WARDROBE));
  const targets = partTargets(safe);
  const skin = SKIN_TONES[safe.skin].rgb;
  const skinFlat = tintPixel(PART_BASE[PART.skin], PART_BASE[PART.skin], skin).map((v) => clamp(v * 0.92));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const part = mask[i];
      if (!part || pixels[i + 3] === 0) continue;
      let target = targets[part];
      if (part === PART.beard && safe.beard !== 'full') {
        const frame = Math.floor(x / frameWidth);
        const box = anchors[frame]?.beard;
        const keep = safe.beard === 'goatee' && box && x - frame * frameWidth >= box.x0 + (box.x1 - box.x0) * 0.32 && x - frame * frameWidth <= box.x0 + (box.x1 - box.x0) * 0.68 && y >= box.y0 + (box.y1 - box.y0) * 0.35;
        if (!keep) { pixels[i] = skinFlat[0]; pixels[i + 1] = skinFlat[1]; pixels[i + 2] = skinFlat[2]; continue; }
      }
      if (!target) continue;
      const out = tintPixel([pixels[i], pixels[i + 1], pixels[i + 2]], PART_BASE[part], target);
      pixels[i] = out[0]; pixels[i + 1] = out[1]; pixels[i + 2] = out[2];
    }
  }
  return pixels;
}

// Where an overlay hat sits on a frame: centred on the cap, a little wider than it, resting
// on the cap's brim line. In frame pixels.
export function hatPlacement(anchor, overlayAspect = 1) {
  if (!anchor) return null;
  const capW = anchor.x1 - anchor.x0 + 1;
  const w = capW * 1.3;
  const h = w / overlayAspect;
  return { x: anchor.x0 + capW / 2 - w / 2, y: anchor.y1 + 4 - h, w, h };
}

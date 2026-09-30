// Where everything on the Cast & Catch stage sits, per painting. The backdrops are 480 x 270
// "painting units" and every anchor here — the angler's feet, the deck slots the crew take,
// where a cast can land, the water the fight happens in, the sky the clouds cross, the lamp —
// is read off the painting itself, so nothing ends up standing on a gunwale wall or swimming
// under the dock. The stage element is rarely 16:9: phones show it taller (the painting is
// fitted to the height and its right side cropped), wide windows show it wider (fitted to the
// width, top and bottom cropped). frameFor() describes that crop as a scale `k` and a
// `cropTop`, and stageX/stageY turn painting units into the stage's own coordinate system
// (viewW x 270), which is what GameScene draws in. Pure, so the geometry is testable.
export const PAINT_W = 480;
export const PAINT_H = 270;
// One art pixel for the whole world: every raster on the stage — the painting, the angler, the
// pets, the props, the critters — is stored at its native art resolution and drawn at
// rows x ART_PX painting units, pixelated, so a pixel on the angler is the same size as a pixel
// on the dock he stands on. The painting is 360 art pixels across (WORLD_COLS) and 203 down
// (BACKDROP_ROWS: 270 units is 202.5 art pixels, so the last row hangs two thirds of a unit
// below the painting and the stage's overflow crops it).
export const ART_PX = 4 / 3;
export const WORLD_COLS = PAINT_W / ART_PX;
export const BACKDROP_ROWS = Math.ceil(PAINT_H / ART_PX);
// Rounds a painting-unit position onto the art grid, so a sprite's blocks line up with the
// painting's instead of straddling them.
export const snapArt = (p) => Math.round(Math.round(p / ART_PX) * ART_PX * 100) / 100;
export const VIEW_W_MIN = 300;
export const VIEW_W_MAX = 960;

// Who stands where. The angler's feet are `angler`; each club member on the ground takes a slot,
// `crew` (x offsets from his feet) on a row `crewY` units behind his (0: the same line). Pets
// sit beside their owner (`pets.you`, and `pets.crew` per slot, x offsets from the owner's
// feet, one art pixel nearer; null where the painting has no room and that pet stays home),
// and a bought decoration stands at `decor` (its base). Every slot is read off the painting so
// that, standing idle, no two of them share floor: a pet never sits inside somebody's boots
// (sceneLayout.test measures the art and holds this on every ground), and where a row cannot
// take another figure the slot is not there — anyone past the last one is counted on a tag.
// Positions are snapped onto the art grid when placed (placements), so the numbers here are
// the painting's, not the grid's.
//
// The five shore paintings share one dock: the deck runs y 115-140 and ends at the rope post at
// x 213, with the crate and barrel in its first 50 units and the lamp post at x 5-20. The deck
// holds the angler, his pet, one club member and the decoration by the barrel, and no more.
const DOCK = {
  crop: 'center',
  angler: { x: 178, y: 136 },
  crew: [-86.67],
  crewY: 0,
  pets: { you: -41.33, crew: [null] },
  spriteH: 92,
  cast: { min: 255, max: 400, y: 143 },
  water: { x0: 246, x1: 470, y0: 150, y1: 228 },
  fishY: 178,
  sparkle: { x0: 240, y0: 60, x1: 480, y1: 270 },
  // The lamp head, where the painting draws its glass (day and night paintings agree to a unit or two).
  lamp: { x: 36, y: 40, r: 14, pool: { x: 52, y: 132, rx: 46, ry: 9 } },
  // Where a bought decoration stands (utils/dockDecor.js): on the open deck past the barrel.
  decor: { x: 53.33, y: 137.33 },
  sky: [],
  gulls: null,
  dragonflies: [],
  tagAbove: false,
  // Light painted into the picture itself (canyon: sunset; creek: golden hour), which the
  // real-clock tint must not lay a second dusk over.
  light: null,
};

export const SCENE_LAYOUTS = {
  river: { ...DOCK, sky: [{ y0: 3, y1: 20, from: 235 }], dragonflies: [{ x: 24, y: 206 }] },
  mountainlake: { ...DOCK, sky: [{ y0: 3, y1: 22, from: 100 }, { y0: 24, y1: 34, from: 330 }], dragonflies: [{ x: 30, y: 200 }] },
  swamp: { ...DOCK, dragonflies: [{ x: 30, y: 212 }, { x: 330, y: 226 }] },
  bay: { ...DOCK, sky: [{ y0: 4, y1: 24, from: -22 }, { y0: 22, y1: 44, from: -22 }], gulls: { y0: 10, y1: 45 } },
  // The beach runs up from the bottom left of the water to its far right (sand starts at x 455
  // on y 165 and at x 246 on y 228), so the fight stays in the water above that line.
  shoreline: {
    ...DOCK,
    cast: { min: 255, max: 380, y: 143 },
    water: { x0: 246, x1: 390, y0: 148, y1: 196 },
    fishY: 170,
    sky: [{ y0: 4, y1: 26, from: -22 }, { y0: 24, y1: 48, from: -22 }],
    gulls: { y0: 10, y1: 45 },
  },
  // Baja, painted over the flats painting so the skiff's bow platform (x 0-205 at the angler's
  // line) is where it was; deep Pacific blue to the right, the sea-lion rock over the bow at
  // (95, 75) and the headland with the fish camp along the top right, which the water box
  // stays under. The bow takes the angler, his pet, one guest and the decoration at its left.
  baja: {
    crop: 'center',
    angler: { x: 150, y: 195 },
    crew: [-86.67],
    crewY: 0,
    pets: { you: -41.33, crew: [null] },
    spriteH: 92,
    cast: { min: 270, max: 450, y: 150 },
    water: { x0: 250, x1: 470, y0: 92, y1: 258 },
    fishY: 165,
    sparkle: { x0: 240, y0: 60, x1: 480, y1: 270 },
    lamp: null,
    decor: { x: 25.33, y: 195 },
    sky: [{ y0: 3, y1: 14, from: -22 }],
    gulls: { y0: 10, y1: 36 },
    dragonflies: [],
    tagAbove: false,
    light: null,
  },
  // The pier's end: a wide, deep deck (x 20-250, y 80-185, rail at the back left, the trash
  // can at its front left, barrel and rope posts at its end), grey-green swell to the right and
  // a strip of beach in the bottom right corner, which the water box stops above. Deep enough
  // for two rows: the angler and his pet on the front one, a guest and theirs further back.
  pier: {
    crop: 'center',
    angler: { x: 170, y: 176 },
    crew: [-78.67],
    crewY: -40,
    pets: { you: -41.33, crew: [-41.33] },
    spriteH: 92,
    cast: { min: 290, max: 440, y: 150 },
    water: { x0: 275, x1: 470, y0: 95, y1: 225 },
    fishY: 165,
    sparkle: { x0: 260, y0: 90, x1: 480, y1: 235 },
    // The lamp on the rail post nearest the angler (by day at 84, 29; the night painting's lit
    // lamp at 79, 27).
    lamp: { x: 82, y: 28, r: 14, pool: { x: 88, y: 118, rx: 52, ry: 14 } },
    decor: { x: 131.33, y: 136 },
    sky: [{ y0: 4, y1: 24, from: -22 }, { y0: 22, y1: 44, from: -22 }],
    gulls: { y0: 8, y1: 42 },
    dragonflies: [],
    tagAbove: false,
    light: null,
  },
  // The marsh creek: a short dock (x 0-200) seen from above enough to have depth (its planks
  // run y 115-155), the creek's channel right of it (x 210-330 below y 150) with mud and crabs
  // beyond, the egret and the osprey pole on the far bank. The angler stands at the front edge,
  // a guest and their pet on the back boards, the decoration at the front by the post.
  creek: {
    crop: 'center',
    angler: { x: 140, y: 155 },
    crew: [-81.33],
    crewY: -33.33,
    pets: { you: -41.33, crew: [null] },
    spriteH: 92,
    cast: { min: 225, max: 320, y: 175 },
    water: { x0: 212, x1: 328, y0: 150, y1: 262 },
    fishY: 205,
    sparkle: { x0: 200, y0: 95, x1: 340, y1: 270 },
    lamp: { x: 14, y: 26, r: 14, pool: { x: 40, y: 136, rx: 44, ry: 12 } },
    decor: { x: 52, y: 157.33 },
    sky: [{ y0: 4, y1: 22, from: -22 }],
    gulls: { y0: 10, y1: 40 },
    dragonflies: [{ x: 420, y: 150 }],
    tagAbove: false,
    light: 'golden',
  },
  // The mountain lake frozen over (winter only): the snowed-in dock ends at x 200 with a barrel
  // at 12-40, and the open lead runs x 215-430, y 150-255; everything else is ice. The
  // decoration stands on the barrel's lid.
  'mountainlake:winter': {
    crop: 'center',
    angler: { x: 165, y: 150 },
    crew: [-86.67],
    crewY: 0,
    pets: { you: -41.33, crew: [null] },
    spriteH: 92,
    cast: { min: 250, max: 400, y: 162 },
    water: { x0: 240, x1: 430, y0: 156, y1: 250 },
    fishY: 200,
    sparkle: { x0: 215, y0: 150, x1: 435, y1: 258 },
    lamp: { x: 26, y: 62, r: 14, pool: { x: 50, y: 140, rx: 46, ry: 9 } },
    decor: { x: 26.67, y: 112 },
    sky: [{ y0: 3, y1: 20, from: 100 }],
    gulls: null,
    dragonflies: [],
    tagAbove: false,
    light: null,
  },
  // The charter: the angler stands at the stern corner on the gunwale line (y 176), which runs
  // from the painted cooler (x 0-45) to the transom at x 125 — room for him and his pet and
  // nobody else, so a guest is counted on the tag. The decoration stands on the cooler's lid.
  offshore: {
    crop: 'center',
    angler: { x: 101.33, y: 176 },
    crew: [],
    crewY: 0,
    pets: { you: -41.33, crew: [] },
    spriteH: 92,
    cast: { min: 200, max: 400, y: 150 },
    water: { x0: 150, x1: 470, y0: 120, y1: 232 },
    fishY: 172,
    sparkle: { x0: 130, y0: 78, x1: 480, y1: 270 },
    lamp: null,
    decor: { x: 22.67, y: 152 },
    sky: [{ y0: 8, y1: 38, from: -22 }, { y0: 36, y1: 62, from: -22 }],
    gulls: { y0: 15, y1: 60 },
    dragonflies: [],
    tagAbove: false,
    light: null,
  },
  // The Canyon at dusk, from the charter's open stern cockpit: the deck fills the lower left
  // (the big cooler at x 75-180), the gunwale corner is at (295, 180) and the water runs from the
  // transom to the headland on the horizon (y 88). A wide stage keeps the bottom of this
  // painting, so the deck and the horizon both stay in shot and only high sky is cropped. The
  // guest stands left of the cooler, the decoration on the deck in front of it.
  canyon: {
    crop: 'bottom',
    angler: { x: 215, y: 250 },
    crew: [-170.67],
    crewY: 0,
    pets: { you: -41.33, crew: [null] },
    spriteH: 92,
    cast: { min: 320, max: 440, y: 168 },
    water: { x0: 302, x1: 470, y0: 96, y1: 258 },
    fishY: 190,
    sparkle: { x0: 300, y0: 92, x1: 480, y1: 270 },
    lamp: null,
    decor: { x: 118.67, y: 262.67 },
    sky: [{ y0: 8, y1: 30, from: -22 }, { y0: 28, y1: 42, from: -22 }],
    gulls: { y0: 12, y1: 42 },
    dragonflies: [],
    // The cockpit floor runs to the painting's foot, so names go over heads here.
    tagAbove: true,
    light: 'dusk',
  },
  // The Flats from the skiff: the bow's casting platform fills the lower left (its flat top
  // runs y 150-200, the cockpit with the cooler and the rope below it), the hull's edge runs
  // from the bow tip at (120, 127) down to (235, 200), and skinny water fills everything else
  // out to the mangrove line at y 40-55 on the right. The platform takes the angler and his pet,
  // a guest and theirs, and the decoration at its left end; the fish comes up past the bow.
  flats: {
    crop: 'center',
    angler: { x: 196, y: 196 },
    crew: [-86.67],
    crewY: 0,
    pets: { you: -41.33, crew: [-41.33] },
    spriteH: 92,
    cast: { min: 310, max: 450, y: 150 },
    water: { x0: 300, x1: 470, y0: 62, y1: 258 },
    fishY: 165,
    sparkle: { x0: 270, y0: 55, x1: 480, y1: 270 },
    lamp: null,
    decor: { x: 32, y: 196 },
    sky: [{ y0: 4, y1: 22, from: -22 }, { y0: 20, y1: 34, from: -22 }],
    gulls: { y0: 8, y1: 40 },
    dragonflies: [],
    tagAbove: false,
    light: null,
  },
};

// Which painting and layout a ground uses this season: only the mountain lake changes (it
// freezes), and only in winter.
export function sceneKeyFor(biome, season) {
  return biome === 'mountainlake' && season === 'winter' ? 'mountainlake:winter' : biome;
}

export function layoutFor(biome, season = null) { return SCENE_LAYOUTS[sceneKeyFor(biome, season)] || SCENE_LAYOUTS[biome] || SCENE_LAYOUTS.river; }

const round2 = (value) => Math.round(value * 100) / 100;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

// Everybody's feet, on the art grid, in painting units: the angler, his pet, each crew slot
// (with its pet, or null) and the decoration's base. A pet sits one art pixel nearer than its
// owner, so it is drawn over the deck line he stands on rather than into it.
const petOffset = (entry) => (entry === null || entry === undefined ? null : entry);
export function placements(layout) {
  const you = { x: snapArt(layout.angler.x), y: snapArt(layout.angler.y) };
  const petBy = (owner, dx) => (petOffset(dx) === null ? null : { x: snapArt(owner.x + dx), y: round2(owner.y + ART_PX) });
  const crewY = snapArt(you.y + (layout.crewY || 0));
  const crew = layout.crew.map((dx, index) => {
    const feet = { x: snapArt(you.x + dx), y: crewY };
    return { ...feet, pet: petBy(feet, layout.pets?.crew?.[index]) };
  });
  return {
    you,
    pet: petBy(you, layout.pets?.you ?? -41.33),
    crew,
    decor: layout.decor ? { x: snapArt(layout.decor.x), y: snapArt(layout.decor.y) } : null,
  };
}

// The fight's band on the water: the frame the fish is held in, FIGHT_HALF either side of the
// fish's row (54 art pixels, room for the biggest shadow with a margin), moved to lie inside the
// water box, or the whole box where the water is shallower than that. The zone is judged along
// x alone, so its height is only how it reads; a band the same height on every ground keeps the
// fight the same shape everywhere (on the flats it was once the whole 196-unit water box) and
// small enough for the camera to hold whole.
export const FIGHT_HALF = 36;
export function fightBand(layout) {
  const { y0, y1 } = layout.water;
  if (y1 - y0 <= 2 * FIGHT_HALF) return [y0, y1];
  const top = snapArt(clamp(layout.fishY - FIGHT_HALF, y0, y1 - 2 * FIGHT_HALF));
  return [top, round2(top + 2 * FIGHT_HALF)];
}
// What has to be in shot around that band while a fish is on: the progress gauge hung above
// it with the fish mark's pointer (FIGHT_ABOVE: the gauge is 8 art pixels tall, one clear of
// the pointer, which stands on the zone's top cap), and below it the bottom cap and a line's
// room for the callout sign at the foot of the stage, so the sign never lies over the zone
// (FIGHT_BELOW).
export const FIGHT_ABOVE = 15 * ART_PX;
export const FIGHT_BELOW = 21 * ART_PX;
export function fightBox(layout) {
  const [top, bottom] = fightBand(layout);
  return [round2(top - FIGHT_ABOVE), round2(bottom + FIGHT_BELOW)];
}

// The stage's visible width in stage units, from its box: a 16:9 box is 480 wide, a phone's
// 5:4 box about 338, a wide window up to 960.
export function viewWidthFor(width, height) {
  if (!(width > 0) || !(height > 0)) return PAINT_W;
  return Math.max(VIEW_W_MIN, Math.min(VIEW_W_MAX, Math.round((PAINT_H * width) / height)));
}

// How the painting sits in a stage this wide (object-fit: cover): k painting->stage scale and
// which painting row lands at the top of the stage.
export function frameFor(viewW, crop = 'center') {
  const k = Math.max(1, viewW / PAINT_W);
  const visibleH = PAINT_H / k;
  const cropTop = k === 1 ? 0 : crop === 'bottom' ? PAINT_H - visibleH : crop === 'top' ? 0 : (PAINT_H - visibleH) / 2;
  return { viewW, k, cropTop, visibleRight: viewW / k };
}

export const stageX = (px, frame) => round2(px * frame.k);
export const stageY = (py, frame) => round2((py - frame.cropTop) * frame.k);
export const stageLen = (p, frame) => round2(p * frame.k);
export const pctX = (sx, frame) => `${round2((sx / frame.viewW) * 100)}%`;
export const pctY = (sy) => `${round2((sy / PAINT_H) * 100)}%`;
export const pctW = (p, frame) => pctX(stageLen(p, frame), frame);
export const pctH = (p, frame) => pctY(stageLen(p, frame));

// The camera for a layout on a stage: the angler's feet, his height and the fight's box turned
// into stage units, with the painting's own top and bottom (a wide stage crops them, and the
// camera may show what the crop hides).
export function cameraForLayout(phase, layout, frame, { room = 0, roomH = 0 } = {}) {
  const feet = placements(layout).you;
  const [fightTop, fightBottom] = fightBox(layout);
  return cameraFor(phase, {
    anglerX: stageX(feet.x, frame),
    anglerY: stageY(feet.y, frame),
    spriteH: stageLen(layout.spriteH, frame),
    fight: [stageY(fightTop, frame), stageY(fightBottom, frame)],
    paint: [stageY(0, frame), stageY(PAINT_H, frame)],
    room,
    roomH,
  }, frame.viewW);
}

// The water this stage can actually show: a narrow stage crops the painting's right side.
// The painting the cast camera shows, in painting units. Everything the player fishes has to
// sit inside it, because that is the frame the cast, the line and the fight are played in —
// and on a phone, which crops the painting hard, it is a good deal more than the stage shows
// at rest.
export function castWindow(layout, frame) {
  const camera = cameraForLayout('casting', layout, frame);
  return [round2(camera.x / frame.k), round2((camera.x + frame.viewW / camera.scale) / frame.k)];
}
export function waterSpan(layout, frame) {
  const x1 = Math.min(layout.water.x1, castWindow(layout, frame)[1] - 10);
  return [stageX(layout.water.x0, frame), stageX(Math.max(layout.water.x0 + 40, x1), frame)];
}

// Where a cast lands: meter power 0-100 across the landing range, squeezed to what's visible.
export function landingX(layout, power, frame) {
  const max = Math.min(layout.cast.max, castWindow(layout, frame)[1] - 24);
  const p = Math.max(0, Math.min(100, power)) / 100;
  return stageX(layout.cast.min + p * Math.max(0, max - layout.cast.min), frame);
}

// A reel position 0-100 across the visible water, in stage units.
export function reelX(layout, pos, frame) {
  const [a, z] = waterSpan(layout, frame);
  return round2(a + (Math.max(0, Math.min(100, pos)) / 100) * (z - a));
}

// The camera. At rest the stage shows the whole painting. Pressing Cast pans the camera to the
// water: the world is pushed in until the angler can sit just inside the left edge with
// everything else water, and it stays there while the line is out (waiting/hookset/reeling) —
// one frame for the cast and the fight, so there is no second move once the line is out. The
// push is what a painting 480 wide allows — the camera can go no further right than the
// painting's edge, so the zoom is whatever puts that edge at the right of the frame with the
// angler at the margin, within limits: a wide stage needs less, and a phone, which shows only
// the painting's left on the deck, pans across the rest of it rather than staying where the crop
// put it. Vertically the angler's hat sits just under the top edge, so the frame is his rod and
// the water below it.
//
// The fight has to be in that frame whole — the zone from its pointer to its bottom cap, the
// fish's row, the progress gauge — on every ground at every width, so `fight` (its top and
// bottom, stage units) wins: the push eases off until the angler's hat and the fight's bottom
// both fit, and where even the unpushed frame cannot hold both (a wide stage crops the painting
// to a strip), the fight's bottom sets the frame and the hat may leave the top. `paint` is the
// painting's top and bottom in stage units, which is as far as the frame may go.
//
// A landed fish keeps that frame ('result' with a `room`: the stage units the catch needs right
// of the angler's feet, and `roomH`, the height it and its plaque need), so the reveal lands
// beside him over the water with no camera move, and the push eases off further where a phone
// would not have the width for it, or a wide stage the height.
//
// The margin at his back is where the cast and tension meters stand.
export const FIGHT_PHASES = new Set(['waiting', 'hookset', 'reeling']);
const CAMERA_ZOOM = [1.3, 1.5];
export const CAMERA_ANGLER_MARGIN = 44;
const CAMERA_HEADROOM = 8;
const CAMERA_FEET_ROOM = 6;
export const REST_CAMERA = { x: 0, y: 0, scale: 1 };
const floor2 = (value) => Math.floor(value * 100) / 100;

export function cameraFor(phase, { anglerX, anglerY, spriteH, fight = null, paint = null, room = 0, roomH = 0 }, viewW) {
  if (phase !== 'casting' && !FIGHT_PHASES.has(phase) && !(phase === 'result' && room > 0)) return REST_CAMERA;
  // The painting runs to PAINT_W in stage units however narrow the stage is — a phone crops
  // it, it does not shorten it — so that, not the stage, is how far right the camera can go.
  const paintRight = Math.max(viewW, PAINT_W);
  const [paintTop, paintBottom] = paint || [0, PAINT_H];
  const headY = anglerY - spriteH - 6 - CAMERA_HEADROOM;
  let scale = round2(clamp(viewW / (paintRight - anglerX + CAMERA_ANGLER_MARGIN), CAMERA_ZOOM[0], CAMERA_ZOOM[1]));
  if (fight) {
    const top = Math.min(headY, fight[0]);
    const bottom = Math.max(anglerY + CAMERA_FEET_ROOM, fight[1]);
    scale = Math.max(1, Math.min(scale, floor2(PAINT_H / (bottom - top))));
  }
  if (room > 0) scale = Math.max(1, Math.min(scale, floor2(viewW / (CAMERA_ANGLER_MARGIN + room))));
  if (roomH > 0) scale = Math.max(1, Math.min(scale, floor2(PAINT_H / roomH)));
  const w = viewW / scale;
  const h = PAINT_H / scale;
  let y = fight ? Math.min(headY, fight[0]) : headY;
  if (fight && y + h < fight[1]) y = fight[1] - h;
  y = round2(clamp(y, fight ? paintTop : 0, (fight ? paintBottom : PAINT_H) - h));
  const x = round2(Math.max(0, Math.min(paintRight - w, anglerX - CAMERA_ANGLER_MARGIN)));
  return { x, y, scale };
}

export const cameraTransform = ({ x, y, scale }, viewW) => `scale(${scale}) translate(${round2(-(x / viewW) * 100)}%, ${round2(-(y / PAINT_H) * 100)}%)`;

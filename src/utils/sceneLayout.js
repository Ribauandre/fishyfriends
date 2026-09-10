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
export const VIEW_W_MIN = 300;
export const VIEW_W_MAX = 960;

// The five shore paintings share one dock: the deck runs y 120-150 and ends at x 240, with a
// crate and barrel in the first 45 units and posts at x 90-115 and 215-240.
const DOCK = {
  crop: 'center',
  angler: { x: 178, y: 136 },
  crew: [-58, -112],
  spriteH: 92,
  cast: { min: 255, max: 400, y: 143 },
  water: { x0: 246, x1: 470, y0: 150, y1: 228 },
  fishY: 178,
  sparkle: { x0: 240, y0: 60, x1: 480, y1: 270 },
  lamp: { x: 32, y: 36, r: 26 },
  sky: [],
  gulls: null,
  dragonflies: [],
  // The dock's loose gear (art in gameProps.DOCK_PROPS): x is the piece's centre, y its
  // bottom, w its width, all painting units. `front` puts it in the near water, in front of
  // the fish. The deck itself is spoken for — the angler stands at 178 and the crew fill the
  // rest — so nothing goes on it: pieces perch on the far post (its cap is at y 107) or float
  // in the near water, which is empty in every painting — and stay inside x 300, so a phone,
  // which crops the painting's right side, still shows them whole.
  props: [{ art: 'rocks', x: 288, y: 228, w: 42, front: true }],
  tagAbove: false,
};

export const SCENE_LAYOUTS = {
  river: { ...DOCK, sky: [{ y0: 3, y1: 20, from: 235 }], dragonflies: [{ x: 24, y: 206 }] },
  mountainlake: { ...DOCK, sky: [{ y0: 3, y1: 22, from: 100 }, { y0: 24, y1: 34, from: 330 }], dragonflies: [{ x: 30, y: 200 }], props: [{ art: 'buoy', x: 276, y: 224, w: 22, front: true }] },
  swamp: { ...DOCK, dragonflies: [{ x: 30, y: 212 }, { x: 330, y: 226 }], props: [{ art: 'rocks', x: 278, y: 230, w: 42, front: true }] },
  bay: { ...DOCK, sky: [{ y0: 4, y1: 24, from: -22 }, { y0: 22, y1: 44, from: -22 }], gulls: { y0: 10, y1: 45 }, props: [{ art: 'gull', x: 220, y: 111, w: 11 }, { art: 'buoy', x: 282, y: 224, w: 24, front: true }] },
  shoreline: { ...DOCK, sky: [{ y0: 4, y1: 26, from: -22 }, { y0: 24, y1: 48, from: -22 }], gulls: { y0: 10, y1: 45 }, props: [{ art: 'gull', x: 220, y: 111, w: 11 }, { art: 'buoy', x: 268, y: 204, w: 20, front: true }] },
  // The charter: the angler stands on the cockpit floor by the transom; the cooler is the crew's spot.
  offshore: {
    crop: 'center',
    angler: { x: 92, y: 176 },
    crew: [-46],
    spriteH: 92,
    cast: { min: 200, max: 400, y: 150 },
    water: { x0: 150, x1: 470, y0: 120, y1: 232 },
    fishY: 172,
    sparkle: { x0: 130, y0: 78, x1: 480, y1: 270 },
    lamp: null,
    sky: [{ y0: 8, y1: 38, from: -22 }, { y0: 36, y1: 62, from: -22 }],
    gulls: { y0: 15, y1: 60 },
    dragonflies: [],
    props: [],
    tagAbove: false,
  },
  // The Canyon at dusk, from the charter's open stern cockpit: the deck fills the lower left
  // (cooler at x 75-180), the gunwale corner is at (295, 180) and the water runs from the
  // transom to the headland on the horizon (y 88). A wide stage keeps the bottom of this
  // painting, so the deck and the horizon both stay in shot and only high sky is cropped.
  canyon: {
    crop: 'bottom',
    angler: { x: 215, y: 250 },
    crew: [-170],
    spriteH: 92,
    cast: { min: 320, max: 440, y: 168 },
    water: { x0: 302, x1: 470, y0: 96, y1: 258 },
    fishY: 190,
    sparkle: { x0: 300, y0: 92, x1: 480, y1: 270 },
    lamp: null,
    sky: [{ y0: 8, y1: 30, from: -22 }, { y0: 28, y1: 42, from: -22 }],
    gulls: { y0: 12, y1: 42 },
    dragonflies: [],
    props: [],
    tagAbove: false,
  },
};

export function layoutFor(biome) { return SCENE_LAYOUTS[biome] || SCENE_LAYOUTS.river; }

const round2 = (value) => Math.round(value * 100) / 100;

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

// The water this stage can actually show: a narrow stage crops the painting's right side.
// The painting the cast camera shows, in painting units. Everything the player fishes has to
// sit inside it, because that is the frame the cast, the line and the fight are played in —
// and on a phone, which crops the painting hard, it is a good deal more than the stage shows
// at rest.
export function castWindow(layout, frame) {
  const camera = cameraFor('casting', { anglerX: stageX(layout.angler.x, frame), anglerY: stageY(layout.angler.y, frame), spriteH: stageLen(layout.spriteH, frame) }, frame.viewW);
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

// The camera. At rest the stage shows the whole painting. Pressing Cast pushes in and centres
// the angler and the water just past his rod; once the line is in the water the push-in pans
// right toward the fight, keeping the angler (and the meter beside him) just inside the left
// edge. Everything is in stage units: x/y is the top-left of the visible window, scale how
// much closer it is. Vertically the angler's hat keeps its resting height, so the push-in
// grows the water downward instead of lifting him into the signage.
export const FIGHT_PHASES = new Set(['waiting', 'hookset', 'reeling']);
// Pressing Cast pans the camera to the water: the world is pushed in until the angler can sit
// just inside the left edge with everything else water, and it stays there while the line is
// out (waiting/hookset/reeling). The push is what a painting 480 wide allows — the camera can
// go no further right than the painting's edge, so the zoom is whatever puts that edge at the
// right of the frame with the angler at the margin, within limits: a wide stage needs less,
// and a phone, which shows only the painting's left on the deck, pans across the rest of it
// rather than staying where the crop put it. Vertically the angler's hat
// sits just under the top edge, so the frame is his rod and the water below it.
const CAMERA_ZOOM = [1.3, 1.5];
const CAMERA_ANGLER_MARGIN = 30;
const CAMERA_HEADROOM = 8;
export const REST_CAMERA = { x: 0, y: 0, scale: 1 };

export function cameraFor(phase, { anglerX, anglerY, spriteH }, viewW) {
  if (phase !== 'casting' && !FIGHT_PHASES.has(phase)) return REST_CAMERA;
  // The painting runs to PAINT_W in stage units however narrow the stage is — a phone crops
  // it, it does not shorten it — so that, not the stage, is how far right the camera can go.
  const paintRight = Math.max(viewW, PAINT_W);
  const scale = round2(Math.max(CAMERA_ZOOM[0], Math.min(CAMERA_ZOOM[1], viewW / (paintRight - anglerX + CAMERA_ANGLER_MARGIN))));
  const w = viewW / scale;
  const h = PAINT_H / scale;
  const x = round2(Math.max(0, Math.min(paintRight - w, anglerX - CAMERA_ANGLER_MARGIN)));
  const headY = anglerY - spriteH - 6;
  const y = round2(Math.max(0, Math.min(PAINT_H - h, headY - CAMERA_HEADROOM)));
  return { x, y, scale };
}

export const cameraTransform = ({ x, y, scale }, viewW) => `scale(${scale}) translate(${round2(-(x / viewW) * 100)}%, ${round2(-(y / PAINT_H) * 100)}%)`;

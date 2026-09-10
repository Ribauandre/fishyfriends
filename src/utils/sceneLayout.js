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

// The five shore paintings are open water now — the dock is not painted into any of them.
// It is a sprite the stage lays on top (utils/dockKit.js, components/game/DockPlatform.js),
// so all five share one `dock`: the plank line `y`, the depth `h` of the band of planks and
// beam, and `x1`, where the deck ends and the post with the rope stands. The angler stands on
// the planks, the crew take slots back along them, and everything to the right of x1 is water.
// Change those three numbers and the dock moves or grows; nothing has to be repainted.
const DOCK = {
  crop: 'center',
  dock: { x1: 212, y: 150, h: 30 },
  angler: { x: 180, y: 170 },
  crew: [-56, -108],
  spriteH: 86,
  cast: { min: 250, max: 400, y: 178 },
  water: { x0: 220, x1: 470, y0: 180, y1: 262 },
  fishY: 210,
  sparkle: { x0: 216, y0: 90, x1: 480, y1: 270 },
  lamp: { x: 30, y: 140, r: 26 },
  sky: [],
  gulls: null,
  dragonflies: [],
  // The dock's loose gear (art in gameProps.DOCK_PROPS): x is the piece's centre, y its
  // bottom, w its width, all painting units. `front` puts it in the near water, in front of
  // the fish. The lamp post, barrel and crate dress the deck's far end, away from the crew
  // slots; the floating pieces stay inside x 300, so a phone, which crops the painting's
  // right side, still shows them whole.
  props: [
    { art: 'lamppost', x: 26, y: 200, w: 42 },
    { art: 'crate', x: 10, y: 168, w: 17 },
    { art: 'barrel', x: 44, y: 167, w: 16 },
  ],
  tagAbove: false,
};

export const SCENE_LAYOUTS = {
  river: { ...DOCK, sky: [{ y0: 3, y1: 20, from: 235 }], dragonflies: [{ x: 24, y: 206 }], props: [...DOCK.props, { art: 'rocks', x: 288, y: 236, w: 42, front: true }] },
  mountainlake: { ...DOCK, sky: [{ y0: 3, y1: 22, from: 100 }, { y0: 24, y1: 34, from: 330 }], dragonflies: [{ x: 30, y: 200 }], props: [...DOCK.props, { art: 'buoy', x: 276, y: 232, w: 22, front: true }] },
  swamp: { ...DOCK, dragonflies: [{ x: 30, y: 212 }, { x: 330, y: 226 }], props: [...DOCK.props, { art: 'rocks', x: 278, y: 240, w: 42, front: true }] },
  bay: { ...DOCK, sky: [{ y0: 4, y1: 24, from: -22 }, { y0: 22, y1: 44, from: -22 }], gulls: { y0: 10, y1: 45 }, props: [...DOCK.props, { art: 'buoy', x: 282, y: 234, w: 24, front: true }] },
  shoreline: { ...DOCK, sky: [{ y0: 4, y1: 26, from: -22 }, { y0: 24, y1: 48, from: -22 }], gulls: { y0: 10, y1: 45 }, props: [...DOCK.props, { art: 'buoy', x: 268, y: 228, w: 20, front: true }] },
  // The charter: the angler stands on the cockpit floor by the transom; the cooler is the crew's spot.
  offshore: {
    crop: 'center',
    dock: null,
    angler: { x: 92, y: 176 },
    crew: [-46],
    spriteH: 86,
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
    dock: null,
    angler: { x: 215, y: 250 },
    crew: [-170],
    spriteH: 86,
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
export function waterSpan(layout, frame) {
  const x1 = Math.min(layout.water.x1, frame.visibleRight - 10);
  return [stageX(layout.water.x0, frame), stageX(Math.max(layout.water.x0 + 40, x1), frame)];
}

// Where a cast lands: meter power 0-100 across the landing range, squeezed to what's visible.
export function landingX(layout, power, frame) {
  const max = Math.min(layout.cast.max, frame.visibleRight - 24);
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
const CAMERA_ZOOM = [1.15, 1.25];
const CAST_FOCUS_OFFSET = 30;
const CAST_ZOOM = [1.3, 1.4];
const CAMERA_ANGLER_MARGIN = 58;
export const REST_CAMERA = { x: 0, y: 0, scale: 1 };

export function cameraFor(phase, { anglerX, anglerY, spriteH }, viewW) {
  const casting = phase === 'casting';
  if (!casting && !FIGHT_PHASES.has(phase)) return REST_CAMERA;
  const focusX = anglerX + CAST_FOCUS_OFFSET;
  const scale = casting
    ? round2(Math.max(CAST_ZOOM[0], Math.min(CAST_ZOOM[1], viewW / (2 * focusX))))
    : round2(Math.max(CAMERA_ZOOM[0], Math.min(CAMERA_ZOOM[1], viewW / (viewW - anglerX + CAMERA_ANGLER_MARGIN))));
  const w = viewW / scale;
  const h = PAINT_H / scale;
  const wanted = casting ? focusX - w / 2 : Math.min(viewW - w, anglerX - CAMERA_ANGLER_MARGIN);
  const x = round2(Math.max(0, Math.min(viewW - w, wanted)));
  const headY = anglerY - spriteH - 6;
  const y = round2(Math.max(0, Math.min(PAINT_H - h, headY * (1 - 1 / scale))));
  return { x, y, scale };
}

export const cameraTransform = ({ x, y, scale }, viewW) => `scale(${scale}) translate(${round2(-(x / viewW) * 100)}%, ${round2(-(y / PAINT_H) * 100)}%)`;

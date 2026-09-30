// What keeps each Cast & Catch stage alive between the player's own actions. The paintings
// are not the same place and they do not breathe the same way, so every ground has its own
// plan here, read off its own painting: the river runs down past the riffles with a leaf on
// it, the mountain lake rings and its reflection shivers under the mist, the swamp hangs moss
// and bubbles up from the mud, the bay's rollers lap the pilings, the surf washes up the beach
// along the line the sand actually runs, the charter grounds whitecap and churn at the stern,
// the canyon's dusk swell glints along the horizon, the flats' light nets move over the sand,
// the pier stands in the chop with the beach breaking behind it, the creek ebbs past swaying
// marsh grass, Baja's swell rolls in under the sea lions' rock, and snow falls on the frozen
// lake. On top of that each ground has whatever sky its backdrop actually has, gulls over
// salt water and dragonflies over fresh. This is the one place in the app with ambient looping
// motion, on purpose: the stage is a game world, not UI chrome, and it's the only thing that
// loops.
//
// All of it is pixel art on the world's one art pixel (sceneLayout's ART_PX): every piece is a
// box of whole art pixels at a whole art-pixel position, drawn as hard-edged blocks in colours
// sampled from its own painting (`day`/`night` below — never pure white, never a blur or a soft
// gradient; a half-tone is a dither), and it moves in steps of whole art pixels, no more than
// eight a second (TICK_MS), or it steps through a flipbook of cells on that same clock. After
// dark every ground switches to the colours of its own moonlit painting at reduced strength,
// so nothing out there outshines the moon path. The plans are in painting units (480 x 270,
// read off the painting's grid) and every planner turns them into art pixels; SceneAmbience
// draws them. No fish is ever drawn out there: the only one on the water is the one the player
// is fighting. Every planner is pure and deterministic, so a ground always breathes the same
// way.
import { BIOMES } from './gameBiomes';
import { layoutFor, sceneKeyFor, ART_PX, PAINT_W, PAINT_H } from './sceneLayout';
import { AMBIENT_SPRITES } from './gameProps';

// The stage's one clock: nothing here changes faster than eight times a second, and every
// flipbook cell is held a whole number of these.
export const TICK_MS = 125;
export const MAX_STEPS_PER_S = 1000 / TICK_MS;
// The painting in art pixels: 360 columns, 202.5 rows (the backdrop is 203 and its last half
// row falls outside the 270-unit box).
export const ART_COLS = Math.round(PAINT_W / ART_PX);
export const ART_ROWS = PAINT_H / ART_PX;

const TICK = TICK_MS / 1000;
const toPx = (units) => Math.round(units / ART_PX);
const round3 = (value) => Math.round(value * 1000) / 1000;
// A length of time on the clock: a whole number of ticks, and a whole multiple of `unit` ticks
// (a flipbook whose cells must each be a whole number of ticks needs that).
const onClock = (seconds, unit = 1) => round3(Math.max(unit, Math.round(seconds / TICK / unit) * unit) * TICK);
// A start part-way through a loop, on the clock, so nothing waits for its first pass.
const startAt = (duration, fraction) => {
  const ticks = Math.round((duration / TICK) * (((fraction % 1) + 1) % 1));
  return ticks === 0 ? 0 : -round3(ticks * TICK);
};
// Deterministic scatter: the same ground always lays out the same way.
export function hash(...values) {
  let h = 2166136261;
  values.forEach((value) => { h ^= Math.round(value * 997) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 15; });
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const spread = (n, index) => (index + 0.5) / n;
const lerp = (a, b, t) => a + (b - a) * t;
const pair = (value, t) => (Array.isArray(value) ? lerp(value[0], value[1], t) : value);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

// Flipbook rhythms (the @keyframes in App.css): 'loop' runs the cells round and round; the
// others run them once in the first half, quarter or eighth of the cycle and hold the last
// cell (always a blank one) for the rest, so a thing can flash and then rest.
export const RHYTHMS = { loop: 1, 50: 0.5, 25: 0.25, 12: 0.125 };
// The cycle, on the clock, for `cells` cells in `rhythm`, so every cell is held whole ticks.
const flipCycle = (seconds, cells, rhythm) => onClock(seconds, Math.round(cells / RHYTHMS[rhythm]));

// Colours. Every ground's water, by day and by night, is sampled from its own painting
// (src/assets/scenes/<ground>.webp and <ground>_night.webp — the colours of its water listed by
// brightness and count; the sampling script is in the session scratchpad): `foam` the
// painting's lightest foam or glint, `hi` its highlight, `mid` the next tone down and `shade` a
// deep water tone. The night set is the moon path's own ramp, drawn at `strength`. Extras for
// the grounds that need them: leaves, moss, grass, mist, the surf's lace, the horizon gleam,
// snow, and the four tones the sky's clouds are repainted in (`cloud`, lightest first).
const NIGHT_STRENGTH = 0.7;
const STAR_TONES = { star0: '#d2e8e1', star1: '#93adc2', star2: '#4e7591' };
const FIREFLY_TONES = { fly0: '#d9ec8a', fly1: '#a6c450', fly2: '#5d7a2c' };

const CRITTERS = {
  river: 'dragonfly', mountainlake: 'dragonfly', swamp: 'dragonfly',
  bay: 'seagull', shoreline: 'seagull', offshore: 'seagull', canyon: 'seagull', flats: 'seagull', pier: 'seagull', creek: 'seagull', baja: 'seagull',
};
const GULL_COUNT = { bay: 2, shoreline: 2, offshore: 3, canyon: 2, flats: 2, pier: 3, creek: 1, baja: 4 };

// The named effects a ground can run (what "no two grounds move the same way" is judged on):
//   current  — streaks running with the flow, each along its own lane (x, y, heading, travel)
//   leaves   — the odd leaf riding the current
//   glass    — light sliding across a mirror-calm reflection
//   waves    — rollers crossing an area toward the shore, in rows with perspective
//   caps     — whitecaps breaking and dissolving across an area
//   wash     — surf running up a shoreline (a line read off the painting's wet line) and back
//   foam     — churn in one place: riffles at rocks, a wake, a rock the swell hits
//   rings    — rises opening on still water
//   bubbles  — mud gas surfacing
//   mist     — dithered bands lying on the water
//   moss     — strands hanging from the canopy
//   grass    — marsh blades swaying at the bank
//   fireflies — after dark only, over the water
//   caustics — the light net moving over a sand bottom
//   gleam    — the last light glinting along the horizon
//   snow     — falling over everything
export const EFFECTS = ['current', 'leaves', 'glass', 'waves', 'caps', 'wash', 'foam', 'rings', 'bubbles', 'mist', 'moss', 'grass', 'fireflies', 'caustics', 'gleam', 'snow'];

// Each ground, in painting units. Besides its effects: `glitter`, how much sun glint its water
// catches (a river's broken surface little, a bay a lot), scattered over `clip` (the water
// where the sparkle box crosses sand, rock or hull) or the layout's sparkle box; `moon`, the
// moon path after dark, where the glints go then; `stars`, a few painted stars that twinkle;
// `cloud`, the four tones sprite clouds are repainted in to cross the painting's sky — or
// false where the painting's sky is its own: full of painted cumulus (the bay, the beach, the
// charter grounds, the flats), a sunset, or a clear desert sky.
const SCENES = {
  // The river comes down out of the narrows at the top right, breaks white over the rocks and
  // runs down past the dock toward the viewer, so everything on it heads down and left.
  river: {
    day: { foam: '#d2e2ef', hi: '#aed0ee', mid: '#7eafcf', shade: '#215976', leaf0: '#8aa342', leaf1: '#58702f' },
    night: { foam: '#4e7591', hi: '#3c6685', mid: '#244c6e', shade: '#000918', leaf0: '#233918', leaf1: '#172a14' },
    cloud: ['#d2e2ef', '#aed0ee', '#96c0e6', '#76b8f4'],
    glitter: 0.12,
    moon: [314, 58, 346, 222],
    stars: [[365.33, 1.33], [250.67, 12], [280, 17.33]],
    current: { seconds: 12, lanes: [
      { x: 468, y: 104, w: 26, heading: 168, travel: 60 },
      { x: 318, y: 118, w: 22, heading: 175, travel: 44 },
      { x: 466, y: 142, w: 34, heading: 152, travel: 110 },
      { x: 402, y: 170, w: 40, heading: 156, travel: 120 },
      { x: 476, y: 196, w: 46, heading: 155, travel: 150 },
      { x: 352, y: 206, w: 36, heading: 162, travel: 90 },
      { x: 462, y: 234, w: 50, heading: 158, travel: 150 },
    ] },
    foam: { seconds: 1.5, spots: [[332, 90, 14], [372, 98, 12], [442, 108, 18], [400, 133, 16], [452, 132, 14], [420, 158, 12], [320, 122, 10]] },
    leaves: { seconds: 18, lanes: [
      { x: 478, y: 185, heading: 156, travel: 210 },
      { x: 440, y: 135, heading: 155, travel: 180 },
    ] },
  },
  // Mirror-calm: the peaks reflected in the middle (x 200-400, y 95-180), mist lying along the
  // far shore, and a trout dimpling it now and then.
  mountainlake: {
    day: { foam: '#d3d2ce', hi: '#b6c8db', mid: '#9fbcdd', shade: '#1766a0', mist0: '#d3d2ce', mist1: '#b6c8db' },
    night: { foam: '#597ca1', hi: '#476c93', mid: '#345880', shade: '#010c21', mist0: '#345880', mist1: '#284970' },
    cloud: ['#e7e7e5', '#d3d2ce', '#b6c8db', '#9fbcdd'],
    glitter: 0.3,
    moon: [322, 86, 362, 200],
    stars: [[297.33, 4], [149.33, 9.33], [366.67, 14.67]],
    rings: { seconds: 12, spots: [[300, 150, 26], [398, 120, 18], [425, 205, 34], [275, 220, 36]] },
    mist: { seconds: 10, bands: [{ x0: 190, x1: 480, y0: 82, y1: 94 }, { x0: 250, x1: 470, y0: 92, y1: 104 }] },
    glass: { seconds: 20, lanes: [
      { x: 210, y: 118, w: 70, heading: 0, travel: 120 },
      { x: 230, y: 142, w: 90, heading: 0, travel: 150 },
      { x: 200, y: 168, w: 80, heading: 0, travel: 170 },
    ] },
  },
  // Under the canopy: moss swinging from it where the painting grows it, gas bubbling up round
  // the cypress knees, rings at the lily pads, and after dark the fireflies.
  swamp: {
    day: { foam: '#cdc9ba', hi: '#b0ab92', mid: '#889492', shade: '#27290f', moss0: '#cdc9ba', moss1: '#b0ab92', moss2: '#969070' },
    night: { foam: '#40658b', hi: '#32577d', mid: '#1c4064', shade: '#000615', moss0: '#07264c', moss1: '#021836', moss2: '#01112a' },
    cloud: false,
    glitter: 0.06,
    moon: [276, 76, 312, 196],
    stars: [[274.67, 6.67], [313.33, 10.67]],
    moss: { seconds: 3, strands: [[58, 14, 36], [106, 4, 32], [136, 12, 44], [176, 6, 30], [214, 14, 36], [322, 6, 40], [362, 14, 40], [420, 10, 36], [456, 8, 44]] },
    rings: { seconds: 15, spots: [[140, 238, 24], [330, 222, 26], [402, 208, 30], [262, 180, 18]] },
    bubbles: { seconds: 7.5, spots: [[322, 122, 4], [346, 134, 3], [252, 188, 4], [412, 204, 3], [180, 215, 3]] },
    fireflies: { count: 10, seconds: 6 },
  },
  // Sheltered water: low rollers coming in toward the dock and lapping at its pilings; the
  // sun path glitters under the lighthouse. The sky is full of the painting's own cumulus.
  bay: {
    day: { foam: '#e6e4d7', hi: '#cec3be', mid: '#a1bad8', shade: '#185c87' },
    night: { foam: '#4b748f', hi: '#376688', mid: '#1f4b71', shade: '#000a25' },
    cloud: false,
    glitter: 0.4,
    clip: [[240, 60], [480, 60], [480, 195], [430, 215], [400, 245], [370, 270], [240, 270]],
    moon: [262, 56, 306, 230],
    stars: [[326.67, 26.67], [249.33, 2.67], [120, 8]],
    waves: { seconds: 10, area: { x0: 250, x1: 480, y0: 105, y1: 250 }, rows: 5, perRow: 2, heading: 92, travel: 26, width: [30, 90] },
    foam: { seconds: 1.5, spots: [[232, 178, 12], [114, 176, 10], [20, 172, 9]] },
  },
  // The beach: the wet line runs from the bottom left corner up to the point on the right,
  // scalloped where the foam comes up; the surf runs up the sand below it and drains back, and
  // rollers stack up behind it.
  shoreline: {
    day: { foam: '#f3f1eb', hi: '#c4f1f6', mid: '#97daed', shade: '#0f72b3', lace: '#d9d1d8' },
    night: { foam: '#4e7797', hi: '#41678a', mid: '#28496d', shade: '#010918', lace: '#28496d' },
    cloud: false,
    glitter: 0.28,
    clip: [[240, 60], [480, 60], [480, 162], [240, 196]],
    moon: [330, 56, 382, 150],
    stars: [[212, 9.33], [116, 2.67], [440, 12]],
    wash: { seconds: 8, reach: 12, beach: 1, line: [[0, 250], [40, 245], [80, 238], [120, 229], [160, 223], [200, 219], [240, 214], [280, 209], [320, 204], [360, 197], [400, 189], [440, 179], [480, 170]] },
    waves: { seconds: 8, area: { x0: 250, x1: 480, y0: 95, y1: 155 }, rows: 3, perRow: 2, heading: 92, travel: 20, width: [40, 100] },
  },
  // Blue water: whitecaps breaking everywhere, and the stern wash churning at the transom.
  offshore: {
    day: { foam: '#f3fafa', hi: '#dbf4ff', mid: '#b7d0ec', shade: '#013b6e' },
    night: { foam: '#506683', hi: '#405673', mid: '#2e4360', shade: '#000513' },
    cloud: false,
    glitter: 0.35,
    clip: [[140, 78], [480, 78], [480, 270], [200, 270], [160, 230], [140, 200]],
    moon: [280, 76, 342, 160],
    stars: [[132, 17.33], [382.67, 25.33], [200, 6.67]],
    caps: { seconds: 4.5, area: { x0: 140, x1: 480, y0: 100, y1: 265 }, count: 10, width: [14, 40] },
    foam: { seconds: 1.5, spots: [[126, 214, 18], [142, 236, 16], [118, 252, 22], [170, 258, 18], [210, 262, 16]] },
  },
  // Dusk: a long, low swell you see more than hear, and the last light glinting along the
  // horizon left of the cliffs. The water shows left of the gunwale high up and right of it
  // below. The sky is the painting's own sunset: no sprite clouds cross it.
  canyon: {
    day: { foam: '#513d81', hi: '#473b84', mid: '#373276', shade: '#1b214e', gleam0: '#ee7946', gleam1: '#e5683a', gleam2: '#c76b64' },
    night: { foam: '#4f6e90', hi: '#426082', mid: '#304a6a', shade: '#010817', gleam0: '#4f6e90', gleam1: '#426082', gleam2: '#304a6a' },
    cloud: false,
    glitter: 0.2,
    clip: [[300, 90], [480, 90], [480, 270], [300, 270]],
    moon: [290, 80, 350, 210],
    stars: [[253.33, 26.67], [105.33, 57.33], [180, 16]],
    waves: { seconds: 13, area: { x0: [210, 305], x1: 480, y0: 105, y1: 255 }, rows: 5, perRow: 1, heading: 92, travel: 28, width: [50, 120], opacity: 0.8 },
    gleam: { seconds: 5, count: 12, box: { x0: 60, x1: 340, y0: 88, y1: 99 } },
  },
  // Skinny water over sand: the light net on the bottom is what moves, and nervous water
  // rings where something pushed.
  flats: {
    day: { foam: '#c8eabf', hi: '#95e6c1', mid: '#7cd6af', shade: '#137c6d' },
    night: { foam: '#477d92', hi: '#3a6f88', mid: '#24526f', shade: '#000812' },
    cloud: false,
    glitter: 0.3,
    clip: [[235, 128], [240, 55], [480, 55], [480, 270], [272, 270]],
    moon: [200, 44, 282, 166],
    stars: [[42.67, 24], [418.67, 22.67], [149.33, 18.67], [280, 9.33]],
    caustics: { seconds: 16, opacity: 0.3, clip: [[262, 112], [480, 112], [480, 270], [283, 270]] },
    rings: { seconds: 9, spots: [[332, 96, 16], [424, 132, 20], [386, 200, 28], [450, 240, 32]] },
  },
  // The pier's end: grey-green chop running to the beach in the corner, surf on that beach,
  // and the swell slapping the pilings.
  pier: {
    day: { foam: '#dddac2', hi: '#cec7ac', mid: '#b8b090', shade: '#525541', lace: '#c3c2ae' },
    night: { foam: '#487490', hi: '#3d6685', mid: '#28516f', shade: '#000a1e', lace: '#28516f' },
    cloud: ['#d7d0b5', '#cec7ac', '#c3c2ae', '#aaa88d'],
    glitter: 0.22,
    clip: [[260, 90], [480, 90], [480, 190], [340, 262], [260, 262]],
    moon: [294, 50, 346, 122],
    stars: [[212, 10.67], [376, 8], [150, 30]],
    caps: { seconds: 5, area: { x0: 262, x1: 478, y0: 100, y1: 232 }, count: 9, width: [12, 34] },
    wash: { seconds: 8, reach: 12, beach: 1, line: [[314, 262], [326, 252], [340, 246], [360, 239], [380, 232], [400, 228], [420, 224], [440, 216], [460, 207], [480, 202]] },
    foam: { seconds: 1.5, spots: [[258, 262, 14], [158, 264, 12], [224, 236, 9]] },
  },
  // The marsh creek on the ebb: the channel bends down from the far bend past the dock and
  // the tide slides down it as ripple lines drifting toward the viewer (the channel is narrow
  // at the bend and opens out below, so the area's edges follow it); the grass on both banks
  // moves in the breeze, rooted in the grass the painting grows.
  creek: {
    day: { foam: '#d39538', hi: '#c8821d', mid: '#a66d1a', shade: '#623a0a', grass0: '#d98e1a', grass1: '#b46b0b', grass2: '#7e430b' },
    night: { foam: '#3f6a87', hi: '#325d7a', mid: '#1b4768', shade: '#010913', grass0: '#061626', grass1: '#020f1d', grass2: '#00060f' },
    cloud: ['#f9d87f', '#fdc25d', '#f1b255', '#ebaa4e'],
    glitter: 0.12,
    clip: [[262, 124], [302, 124], [300, 150], [288, 178], [336, 196], [372, 206], [338, 232], [300, 262], [200, 262], [200, 190], [232, 168], [212, 150]],
    moon: [282, 110, 320, 214],
    stars: [[377.33, 9.33], [453.33, 2.67], [120, 12]],
    waves: { seconds: 16, area: { x0: [268, 210], x1: [298, 340], y0: 132, y1: 258 }, rows: 6, perRow: 1, heading: 92, travel: 18, width: [12, 56], rowsTall: 1 },
    rings: { seconds: 12, spots: [[110, 214, 20], [300, 240, 22]] },
    grass: { seconds: 3, blades: [[22, 116, 22], [58, 116, 26], [96, 115, 24], [134, 114, 28], [160, 114, 22], [388, 138, 30], [410, 136, 34], [432, 138, 30], [456, 134, 36], [474, 136, 28], [438, 270, 30], [460, 268, 36]] },
  },
  // The Pacific: a long swell rolling in past the bow (the hull's edge runs (232,128) to
  // (252,270), so the swell starts just right of it) toward the beach under the headland,
  // breaking white on the sea lions' rock, and a thin surf line on that far beach, which lies
  // above its wet line. The sky is clear desert blue: no sprite clouds.
  baja: {
    day: { foam: '#f3f5e9', hi: '#1b83ad', mid: '#0b4d89', shade: '#022751', lace: '#c1c5b8' },
    night: { foam: '#5f81a5', hi: '#3a658b', mid: '#1b4267', shade: '#000a18', lace: '#3a658b' },
    cloud: false,
    glitter: 0.5,
    clip: [[240, 95], [480, 95], [480, 270], [252, 270], [232, 128]],
    moon: [352, 64, 398, 264],
    stars: [[293.33, 2.67], [60, 5.33], [120, 16]],
    waves: { seconds: 11, area: { x0: [228, 254], x1: 480, y0: 105, y1: 255 }, rows: 5, perRow: 2, heading: 90, travel: 32, width: [40, 110] },
    wash: { seconds: 12, reach: 4, beach: -1, line: [[252, 66], [280, 67], [320, 68.5], [360, 70.5], [400, 72.5], [440, 74.5], [480, 76.5]] },
    foam: { seconds: 1.5, spots: [[60, 88, 14], [104, 92, 16], [86, 96, 10]] },
  },
  // The lake frozen over: mist lying over the open lead, and snow coming down on all of it.
  'mountainlake:winter': {
    day: { foam: '#edeae4', hi: '#dcdcda', mid: '#c5cfd9', shade: '#17232d', mist0: '#d6d7d4', mist1: '#c4c8cb', snow0: '#edeae4', snow1: '#c4c8cb' },
    night: { foam: '#4e7993', hi: '#436781', mid: '#294f70', shade: '#000206', mist0: '#294f70', mist1: '#1d4465', snow0: '#658ba1', snow1: '#305979' },
    cloud: ['#edeae4', '#dcdcda', '#d0d2d4', '#c4c8cb'],
    glitter: 0.1,
    clip: [[214, 150], [262, 140], [298, 150], [346, 138], [394, 150], [432, 160], [424, 198], [398, 240], [346, 256], [282, 262], [222, 238], [200, 206], [212, 190]],
    moon: [264, 90, 292, 200],
    stars: [[192, 6.67], [145.33, 2.67], [233.33, 12]],
    mist: { seconds: 12, bands: [{ x0: 200, x1: 440, y0: 138, y1: 156 }, { x0: 230, x1: 430, y0: 196, y1: 212 }] },
    snow: { seconds: 8, opacity: 0.9 },
  },
};

// The sky of each painting, read off it (the colours that fill a box of open sky, flood-filled
// from that box and stopped at the horizon, pinholes closed; the script is in the session
// scratchpad): per art-pixel row "y:x0-x1,x2-x3". The clouds and gulls fly inside it, so they
// pass behind the lamp posts, the pines, the peaks and the headland rather than over them.
// Night paintings are registered to their day ones, so one mask serves both. A repainted
// ground needs its mask read again.
const SKY = {
  river: '0:141-325;1:141-145,148-325;2:134-135,141-141,148-323;3:134-136,148-156,159-304,307-322;4:134-137,141-141,144-155,160-304,307-317,321-322;5:135-138,141-155,160-304,308-317,321-325;6:136-155,161-303,308-317,322-326;7:137-155,162-302,309-316,322-326;8:138-140,143-154,162-178,181-302,309-316,323-326;9:138-140,143-154,162-178,181-301,309-316,326-326;10:140-140,142-147,151-154,162-177,181-301,309-315,326-327;11:151-154,162-177,182-301,309-315,326-327;12:151-154,162-177,183-290,293-300,310-311,326-327;13:149-154,162-177,183-241,249-290,294-300;14:135-136,149-154,168-175,183-238,252-289,294-296;15:135-136,140-141,168-175,184-234,255-288;16:136-136,140-141,169-174,184-190,197-231,258-287;17:140-144,170-173,184-188,200-226,261-287;18:141-144,171-172,204-223,266-282;19:209-218,269-273,276-278;20:210-215,276-277',
  mountainlake: '0:84-359;1:84-359;2:84-206,210-359;3:85-206,211-359;4:86-206,212-359;5:86-206,214-355,358-359;6:85-207,219-355;7:84-200,204-207,220-355;8:84-199,204-207,221-299,302-354;9:86-199,204-207,221-299,302-343,348-351;10:87-199,206-207,222-299,302-343,348-350;11:87-197,226-299,302-336,348-349;12:86-173,176-197,226-227,233-284,305-306,309-333;13:85-114,119-164,170-173,176-196,233-283,311-325;14:85-114,120-127,130-134,140-141,157-160,173-195,234-248,253-278,311-322;15:87-91,94-110,130-134,177-194,304-306,312-322;16:89-91,94-110,130-134,186-189,193-194,303-308,312-322;17:94-95,99-109,127-135,303-322;18:99-105,127-136,305-322;19:129-136,305-321;20:304-318;21:304-316;22:306-315;23:306-307,310-312;24:306-307,310-311',
  bay: '0:0-359;1:0-359;2:0-359;3:0-359;4:0-359;5:0-359;6:0-359;7:0-359;8:0-359;9:0-359;10:0-359;11:0-359;12:0-359;13:0-359;14:0-6,16-359;15:0-6,16-359;16:0-5,17-78,82-359;17:0-5,18-78,82-359;18:0-5,18-19,27-80,82-359;19:0-5,28-79,83-359;20:0-5,29-79,84-359;21:0-5,29-79,84-317,320-359;22:0-5,29-79,84-317,321-359;23:0-3,30-79,84-316,322-359;24:0-3,31-80,84-316,322-359;25:0-3,31-81,83-316,322-359;26:0-3,32-80,83-316,324-359;27:0-3,33-80,83-314,324-359;28:0-3,34-314,324-350,356-359;29:0-4,34-315,323-348;30:0-5,34-316,323-337,340-347;31:0-5,33-316,320-335,342-346;32:0-5,31-315,320-333;33:0-5,31-315,320-326,329-331;34:0-5,31-79,84-315,320-326',
  shoreline: '0:0-359;1:0-359;2:0-359;3:0-359;4:0-359;5:0-359;6:0-359;7:0-359;8:0-359;9:0-359;10:0-359;11:0-6,14-359;12:0-5,16-359;13:0-4,17-359;14:0-4,17-359;15:0-4,17-19,27-359;16:0-4,17-18,28-359;17:0-4,28-359;18:0-4,28-359;19:0-4,29-359;20:0-4,29-359;21:0-2,30-359;22:0-2,31-359;23:0-2,31-336,339-359;24:0-2,32-335,339-359;25:0-2,33-335,340-359;26:0-3,34-334,340-359;27:0-4,34-334,340-359;28:0-4,34-334,340-359;29:0-4,33-334,340-356;30:0-4,31-334,340-351;31:0-4,31-334,340-346;32:0-4,31-334,340-343;33:0-4,31-334,341-343',
  offshore: '0:41-359;1:41-359;2:41-359;3:41-359;4:41-359;5:41-359;6:41-359;7:41-359;8:41-359;9:41-359;10:41-359;11:41-359;12:41-359;13:41-359;14:41-359;15:41-285,289-359;16:41-285,289-359;17:41-189,192-359;18:41-189,192-359;19:41-359;20:41-359;21:41-177,182-182,190-359;22:41-177,183-183,190-272,275-276,279-359;23:41-179,182-272,279-359;24:41-273,278-359;25:41-273,277-359;26:41-359;27:41-359;28:41-359;29:41-359;30:41-359;31:41-110,112-359;32:41-359;33:41-359;34:45-334,336-359;35:45-125,128-351,353-359;36:45-94,97-125,129-347,352-352;37:45-94,97-124,131-249,252-317,320-347;38:46-57,60-93,96-124,131-246,252-317,320-346;39:46-56,60-91,95-125,135-246,251-317,320-346,349-350;40:45-49,52-56,59-90,95-126,135-146,150-246,250-280,286-350;41:45-48,52-56,59-90,94-127,135-146,150-231,236-237,243-247,250-252,256-280,286-336,339-343,345-350;42:51-89,93-116,120-127,135-146,150-228,243-252,255-255,257-280,286-317,320-336,339-339,345-349;43:50-66,71-88,93-114,120-125,138-146,150-228,243-252,255-278,286-304,309-311,316-317,320-333,336-339,342-342,345-348;44:50-53,58-66,71-88,93-110,119-124,139-219,225-228,238-272,286-303,309-311,322-333,336-342;45:50-52,59-65,71-77,80-81,85-88,92-105,109-110,119-123,139-191,194-198,207-209,217-218,225-227,238-243,247-265,269-270,283-290,296-300,322-344;46:51-52,59-64,72-73,80-81,92-98,102-104,109-110,119-123,148-155,158-171,175-191,194-198,226-227,238-243,248-253,257-264,289-290,331-344',
  flats: '0:0-316,319-359;1:0-359;2:0-359;3:0-359;4:0-359;5:0-359;6:0-359;7:0-359;8:0-359;9:0-359;10:0-359;11:0-359;12:0-359;13:0-359;14:0-359;15:0-359;16:0-118,121-359;17:0-118,123-359;18:0-118,124-359;19:0-118,124-359;20:0-118,124-262,265-358;21:1-5,13-17,20-118,124-262,265-355;22:1-2,13-17,20-107,110-121,126-140,144-154,157-167,171-227,231-252,255-341;23:0-2,14-101,105-106,114-121,127-131,138-140,144-154,157-161,175-177,182-184,193-202,205-207,218-226,244-252,255-341;24:0-4,14-101,145-161,193-202,244-334,337-341;25:0-4,13-101,145-162,192-205,244-321;26:0-5,13-102,145-162,191-209,244-260,298-303;27:0-7,21-40,66-108,144-163,190-209,253-259,300-300;28:0-7,35-36,84-108,144-164,190-191,201-203',
  pier: '0:13-18,28-359;1:12-18,28-359;2:11-18,28-359;3:10-18,28-56,61-359;4:9-17,28-56,62-359;5:8-16,29-54,63-359;6:7-16,30-53,57-60,64-359;7:7-15,32-53,56-60,64-359;8:5-14,33-52,56-61,64-359;9:5-13,34-52,56-61,64-359;10:2-12,34-52,55-61,64-359;11:2-12,34-52,55-61,64-359;12:2-14,31-52,55-61,65-359;13:2-17,30-52,55-60,66-359;14:2-17,29-52,56-60,66-359;15:2-17,29-52,56-60,66-326,330-359;16:2-18,29-51,56-60,67-82,86-215,219-326,331-359;17:2-18,28-50,56-59,67-81,87-215,219-325,332-359;18:2-18,27-50,56-58,68-80,88-325,332-359;19:2-20,25-50,56-57,69-79,83-86,89-325,332-359;20:2-50,55-57,69-79,82-86,89-326,332-359;21:2-50,55-58,68-79,82-86,89-324,332-359;22:2-50,55-59,67-79,82-86,89-324,333-359;23:2-50,55-60,66-79,82-86,89-324,333-359;24:2-50,55-60,66-79,82-85,90-324,333-359;25:2-50,55-61,65-79,82-85,90-326,333-359;26:2-50,55-78,82-85,90-328,333-359;27:2-50,55-78,82-84,91-328,333-359;28:2-50,55-79,82-83,92-328,333-359;29:2-51,55-79,82-83,92-327,333-359;30:2-51,55-79,82-84,90-324,327-327,333-359;31:2-51,55-79,82-85,90-237,239-324,327-327,333-359;32:2-51,55-79,82-86,90-237,244-327,333-351,354-355;33:2-51,55-79,82-238,244-327,333-350;34:2-51,55-79,82-238,244-326,333-347',
  creek: '0:12-359;1:12-359;2:5-6,13-359;3:4-7,13-359;4:1-7,14-359;5:0-7,14-359;6:0-7,15-359;7:0-7,16-359;8:0-7,16-359;9:0-7,16-359;10:0-7,16-359;11:0-6,16-359;12:0-5,17-359;13:0-5,17-359;14:0-3,18-359;15:0-3,19-359;16:0-2,21-359;17:0-2,21-359;18:0-3,20-359;19:0-5,17-359;20:0-5,17-359;21:0-5,17-359;22:0-5,17-359;23:0-5,16-359;24:0-6,16-359;25:0-7,15-359;26:0-8,14-359;27:0-359;28:0-359;29:0-359;30:0-359;31:0-359;32:0-359;33:0-239,242-243,247-359',
  baja: '0:0-240;1:0-240;2:0-240;3:0-240;4:0-240;5:0-170,177-238;6:0-166,184-238;7:0-164,190-238;8:0-162,196-238;9:0-161,198-238;10:0-158,201-238;11:0-156,203-238;12:0-152,207-238;13:0-150,211-237;14:0-147,213-232;15:0-146,219-230;16:0-143,222-225;17:0-142;18:0-141;19:0-141;20:0-141;21:0-141;22:0-141;23:0-141;24:0-141;25:0-140;26:0-140;27:0-140;28:0-139;29:0-138;30:0-136;31:0-136;32:0-136;33:0-17,29-71,81-135;34:0-2,12-14,29-71,81-135',
  'mountainlake:winter': '0:27-192;1:27-192;2:27-191;3:27-190;4:27-189;5:27-189;6:27-189;7:27-37,40-188;8:27-37,40-187;9:27-37,41-186;10:29-36,42-174,177-183;11:30-35,42-173,180-181;12:30-35,42-173;13:30-36,42-172;14:30-36,41-117,121-172;15:30-36,41-50,53-116,121-171;16:30-34,42-50,54-116,121-169;17:30-33,43-50,54-115,121-168;18:32-33,44-50,54-114,122-168;19:32-33,45-50,54-112,122-123,127-166;20:45-50,54-112,122-123,127-166;21:46-49,55-111,120-164;22:46-49,56-110,120-147,153-163;23:45-49,57-108,120-126,129-146,153-154,157-161;24:45-50,57-108,120-125,135-146,153-153,157-160;25:45-50,57-107,121-126,135-144;26:44-49,57-61,64-97,100-106,122-126,135-136,139-144;27:44-48,57-61,64-96,100-105,122-127,135-136,143-145;28:45-48,57-60,65-95,101-105,122-127,131-135,144-145;29:47-48,56-60,65-94,102-104,123-127,131-134,144-145;30:47-48,56-60,65-70,74-79,84-93,102-103,124-126,131-133',
  canyon: '0:8-135,141-359;1:8-359;2:8-359;3:8-359;4:8-359;5:8-359;6:8-359;7:9-359;8:9-359;9:9-359;10:10-359;11:10-359;12:10-359;13:11-359;14:11-359;15:11-359;16:11-359;17:12-359;18:12-359;19:12-359;20:12-359;21:13-359;22:13-359;23:13-359;24:14-359;25:14-359;26:14-359;27:14-359;28:14-359;29:15-359;30:15-359;31:15-348;32:15-343;33:16-340;34:16-339;35:16-324;36:16-319;37:16-315;38:17-314;39:17-313;40:17-312;41:17-312;42:18-310;43:18-310;44:18-292,298-302,307-309;45:18-287;46:19-281;47:19-278;48:19-277;49:20-276;50:21-276;51:21-275;52:21-274;53:21-274;54:22-274;55:22-273;56:22-273;57:23-271;58:23-264;59:25-263;60:26-261;61:26-260;62:27-259;63:28-258;64:68-69,81-93,137-138,151-155,177-180,255-258',
};

// The layers that are a box rather than a list of things.
export const LAYER_EFFECTS = ['caustics', 'snow'];

export { sceneKeyFor };

export function ambienceFor(biome, season = null) {
  const key = BIOMES[biome] ? biome : 'river';
  const layout = layoutFor(key, season);
  const sceneKey = sceneKeyFor(key, season);
  const scene = SCENES[sceneKey] || SCENES[key] || SCENES.river;
  // No dragonflies over fresh water in winter, and none over the ice.
  const critter = CRITTERS[key] || 'dragonfly';
  const dragonflies = critter === 'dragonfly' && season === 'winter' ? [] : layout.dragonflies;
  const effects = Object.fromEntries(EFFECTS.filter((name) => scene[name]).map((name) => [name, scene[name]]));
  return {
    biome: key,
    sceneKey,
    critter,
    critters: critter === 'seagull' ? (GULL_COUNT[key] || 2) : dragonflies.length,
    // Sprite clouds cross the lanes the layout gives the painting's sky, unless the painting's
    // own sky is full of its own (a sunset) or has none (a clear desert sky).
    clouds: scene.cloud ? layout.sky : [],
    gulls: layout.gulls,
    dragonflies,
    lamp: layout.lamp,
    sparkle: layout.sparkle,
    water: layout.water,
    glitter: scene.glitter,
    clip: scene.clip || null,
    moon: scene.moon,
    stars: scene.stars || [],
    sky: SKY[sceneKey] || SKY[key] || '',
    cloudTones: scene.cloud || null,
    effects,
  };
}

// The named effects a ground runs — what "no two grounds move the same way" is judged on.
export function effectNames(biome, season = null) {
  return Object.keys(ambienceFor(biome, season).effects).sort();
}

// The colours a ground's ambience is drawn in at this hour: its painting's own by day, dawn and
// dusk (the stage's tint grades them with the painting), its moonlit painting's after dark.
export function paletteFor(biome, season = null, period = 'day') {
  const key = BIOMES[biome] ? biome : 'river';
  const scene = SCENES[sceneKeyFor(key, season)] || SCENES[key] || SCENES.river;
  const night = period === 'night';
  return { ...STAR_TONES, ...FIREFLY_TONES, ...(night ? scene.night : scene.day), strength: night ? NIGHT_STRENGTH : 1 };
}

// ---------------------------------------------------------------------------------------------
// Pixel shapes. A shape is `cells`, one per flipbook frame, each a list of pixels [x, y, tone]
// on a w x h grid of art pixels (a tone is a palette key); a dithered block is
// ['dither', x, y, w, h, level, tone] (level 1 is a checker, 2 a quarter, 3 an eighth).

const shape = (w, h, cells) => ({ w, h, cells });

// A line of pixels between two art-pixel points (Bresenham).
export function linePixels(x0, y0, x1, y1) {
  const out = [];
  let x = Math.round(x0); let y = Math.round(y0);
  const xe = Math.round(x1); const ye = Math.round(y1);
  const dx = Math.abs(xe - x); const dy = -Math.abs(ye - y);
  const sx = x < xe ? 1 : -1; const sy = y < ye ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x, y]);
    if (x === xe && y === ye) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

// An ellipse outline of whole art pixels round (0, 0).
export function ellipsePixels(rx, ry) {
  const seen = new Set();
  const out = [];
  const add = (x, y) => { const k = `${x},${y}`; if (!seen.has(k)) { seen.add(k); out.push([x, y]); } };
  if (rx < 1) { add(0, 0); return out; }
  for (let x = -rx; x <= rx; x += 1) { const y = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2))); add(x, y); add(x, -y); }
  if (ry >= 1) for (let y = -ry; y <= ry; y += 1) { const x = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2))); add(x, y); add(-x, y); }
  return out;
}

// A streak of the current: a dash one art pixel tall, its bright head leading.
export function dashShape(length, dir) {
  const px = [];
  for (let i = 0; i < length; i += 1) px.push([dir < 0 ? i : length - 1 - i, 0, i === 0 ? 'foam' : i >= length - 2 ? 'mid' : 'hi']);
  return shape(length, 1, [px]);
}

// A leaf, tumbling between two faces as it rides the current.
export function leafShape() {
  return shape(3, 2, [
    [[1, 0, 'leaf0'], [2, 0, 'leaf0'], [0, 1, 'leaf1'], [1, 1, 'leaf0']],
    [[0, 0, 'leaf0'], [1, 0, 'leaf1'], [1, 1, 'leaf0'], [2, 1, 'leaf0']],
  ]);
}

// A bar of reflected light on still water: one pixel tall, dithered out at both ends.
export function glassShape(length, seed) {
  const px = [];
  for (let x = 0; x < length; x += 1) {
    const edge = Math.min(x, length - 1 - x);
    if (edge < 3 && x % 2) continue;
    px.push([x, 0, edge < 3 ? 'mid' : hash(seed, x) > 0.86 ? 'foam' : 'hi']);
  }
  return shape(length, 1, [px]);
}

// A roller's crest: a lit row, broken here and there and dithered out at the ends, over a row
// of its face; the near rows catch a little foam.
export function crestShape(length, seed, rows = 2, near = 0) {
  const px = [];
  for (let x = 0; x < length; x += 1) {
    const edge = Math.min(x, length - 1 - x);
    const r = hash(seed, x);
    if (edge < 3 && x % 2) continue;
    if (edge >= 3 && r < 0.1) continue;
    px.push([x, 0, near > 0.5 && edge > length * 0.2 && r > 0.82 ? 'foam' : 'hi']);
  }
  // the trough under the crest, a tone of the painting's deep water, so the crest stands up
  if (rows > 1) for (let x = 2; x < length - 2; x += 1) if (hash(seed, x, 7) > 0.45) px.push([x, 1, 'shade']);
  return shape(length, rows, [px]);
}

// A whitecap, breaking and dissolving where it is: a crest running along the swell with a
// ragged top (each column a pixel up or not), spray thrown a pixel or two over it as it breaks,
// the break spreading into foam that sinks as it goes, and a blank cell to rest on (it runs in
// the '50' rhythm).
export function capShape(length, seed) {
  const w = length + 2;
  const h = 5;
  const top = (x) => (hash(seed, x, 20) > 0.68 ? 1 : 2);
  const at = (dy, tone, keep, salt, from = 0, to = w - 1) => {
    const px = [];
    for (let x = from; x <= to; x += 1) {
      const edge = Math.min(x - from, to - x);
      if (edge < 2 && (x + dy) % 2) continue;
      if (hash(seed, x, dy, salt) < keep) px.push([x, clamp(top(x) + dy, 0, h - 1), tone]);
    }
    return px;
  };
  const third = Math.max(1, Math.floor(w / 3));
  return shape(w, h, [
    at(0, 'mid', 0.8, 1, third, w - 1 - third),
    [...at(0, 'hi', 0.9, 2, 1, w - 2), ...at(1, 'mid', 0.4, 3, 1, w - 2)],
    [...at(0, 'foam', 0.85, 4), ...at(-1, 'hi', 0.3, 5, 1, w - 2), ...at(1, 'hi', 0.5, 6), ...at(-2, 'foam', 0.12, 7, 2, w - 3)],
    [...at(1, 'foam', 0.6, 8), ...at(0, 'hi', 0.4, 9), ...at(2, 'mid', 0.4, 10)],
    [...at(2, 'hi', 0.35, 11), ...at(1, 'mid', 0.3, 12)],
    [],
  ]);
}

// Churn in one place: a cluster of foam round a lit core, in three shapes it steps through.
export function foamShape(size, seed) {
  const w = Math.max(3, size);
  const h = Math.max(2, Math.round(size * 0.55));
  const cx = (w - 1) / 2; const cy = (h - 1) / 2;
  const cell = (salt) => {
    const px = [];
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const r = Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2));
      const p = hash(seed, x, y, salt);
      if (r < 0.45 && p < 0.85) px.push([x, y, 'foam']);
      else if (r < 0.78 && p < 0.55) px.push([x, y, 'hi']);
      else if (r < 1 && p < 0.25) px.push([x, y, 'mid']);
    }
    return px;
  };
  const a = cell(1); const b = cell(2); const c = cell(3);
  return shape(w, h, [a, b, c, b]);
}

// A rise: a dimple, then a ring opening in steps (lit on its far side, its near side a tone
// down), the widest dithered as it fades, and a blank cell.
export function ringShape(size) {
  const rx = Math.max(3, Math.round(size / 2));
  const ry = Math.max(1, Math.round(rx * 0.42));
  const w = rx * 2 + 1; const h = ry * 2 + 1;
  const ring = (f, dither = false) => {
    const a = Math.max(1, Math.round(rx * f)); const b = Math.max(1, Math.round(ry * f));
    return ellipsePixels(a, b).filter(([x, y]) => !dither || (x + y) % 2 === 0).map(([x, y]) => [x + rx, y + ry, y < 0 ? 'hi' : 'mid']);
  };
  return shape(w, h, [
    [[rx - 1, ry, 'hi'], [rx, ry, 'hi'], [rx, ry + 1 > h - 1 ? ry : ry + 1, 'shade']],
    ring(0.3), ring(0.55), ring(0.8), ring(1, true), [],
  ]);
}

// Mud gas: a dot on the surface, swelling to a bubble with a lit cap, popping, gone.
export function bubbleShape(size) {
  const big = size >= 4;
  return shape(5, 4, [
    [[2, 3, 'mid']],
    [[2, 2, 'hi'], [2, 3, 'mid']],
    big ? [[2, 1, 'foam'], [1, 2, 'hi'], [3, 2, 'hi'], [2, 3, 'mid'], [1, 3, 'mid'], [3, 3, 'mid']] : [[2, 1, 'foam'], [1, 2, 'hi'], [3, 2, 'hi'], [2, 3, 'mid']],
    [[0, 2, 'mid'], [4, 2, 'mid'], [2, 0, 'hi'], [1, 3, 'mid'], [3, 3, 'mid']],
    [],
  ]);
}

// A band of mist: long streaks one pixel tall lying along the water (the paintings' own haze is
// horizontal strokes), close together at the band's heart and sparse at its edges and ends,
// their tips dithered. One cell; it drifts a pixel at a time. `thin` (after dark) keeps every
// other pixel.
export function mistShape(w, h, seed, thin = false) {
  const px = [];
  for (let y = 0; y < h; y += 1) {
    const heart = Math.min(y + 0.5, h - 0.5 - y) / (h / 2);
    let x = Math.floor(hash(seed, y) * 10);
    for (let k = 0; x < w; k += 1) {
      const len = 6 + Math.floor(hash(seed, y, k, 1) * 20);
      const gap = 3 + Math.floor(hash(seed, y, k, 2) * 10) + Math.round((1 - heart) * 14);
      for (let i = 0; i < len && x + i < w; i += 1) {
        const at = x + i;
        const end = Math.min(at + 0.5, w - 0.5 - at) / (w / 2);
        if (end < 0.2 && hash(seed, at, y, 3) > end / 0.2) continue;
        if ((i < 2 || i >= len - 2) && (at + y) % 2) continue;
        if (thin && (at + y) % 2) continue;
        px.push([at, y, (y + k) % 3 === 0 ? 'mist1' : 'mist0']);
      }
      x += len + gap;
    }
  }
  return shape(w, h, [px]);
}

// Something hanging (a clump of moss) or standing (a tuft of grass) that sways: strands a pixel
// or two wide from one fixed end, whose free ends shift a pixel, then two, and back, each way in
// turn — the fixed end never moves, the middle a pixel. `from` is the fixed end ('top' for
// moss, 'bottom' for grass). A strand: its column from the clump's middle, its length, a lean
// of its own at the free end (a tuft fans out), and whether it is two pixels wide (a shade
// pixel beside it). `tones`: [free end, middle, fixed end, shade].
export const SWAY = [0, 1, 2, 1, 0, -1, -2, -1];
export function swayShape(strands, seed, from, tones) {
  const h = Math.max(...strands.map((s) => s.length));
  const reach = Math.max(...strands.map((s) => Math.abs(s.col) + Math.abs(s.lean || 0) + (s.wide ? 1 : 0))) + 2;
  const w = reach * 2 + 1; const mid = reach;
  const cell = (a) => {
    const px = [];
    strands.forEach((s, n) => {
      for (let i = 0; i < s.length; i += 1) {
        const t = s.length > 1 ? i / (s.length - 1) : 1;
        const y = from === 'top' ? i : h - 1 - i;
        const sway = Math.sign(a) * (t > 0.8 ? Math.abs(a) : t > 0.45 ? Math.min(1, Math.abs(a)) : 0);
        const own = Math.round((s.lean || 0) * t * t);
        const jag = t > 0.2 && hash(seed, n, i) > 0.86 ? (hash(seed, n, i, 1) > 0.5 ? 1 : -1) : 0;
        const x = clamp(mid + s.col + own + sway + jag, 0, w - 1);
        px.push([x, y, t > 0.8 ? tones[0] : t > 0.3 ? tones[1] : tones[2]]);
        if (s.wide && t < 0.85) px.push([clamp(x + 1, 0, w - 1), y, tones[3]]);
      }
    });
    return px;
  };
  return shape(w, h, SWAY.map(cell));
}
// A clump of moss: a long two-pixel strand with a shorter one each side.
export const mossClump = (length) => [{ col: 0, length, wide: true }, { col: 3, length: Math.round(length * 0.62) }, { col: -2, length: Math.round(length * 0.42) }];
// A tuft of marsh grass: a tall blade and three shorter ones leaning out a little from one root.
export const grassTuft = (height) => [{ col: 0, length: height, lean: 0 }, { col: -2, length: Math.round(height * 0.7), lean: -1 }, { col: 2, length: Math.round(height * 0.82), lean: 1 }, { col: 1, length: Math.round(height * 0.5), lean: 2 }];

// A glint: a fleck of the painting's light that flashes and is gone.
export function glintShape(wide) {
  return wide
    ? shape(3, 1, [[[1, 0, 'hi']], [[0, 0, 'hi'], [1, 0, 'foam'], [2, 0, 'hi']], [[1, 0, 'mid']], []])
    : shape(1, 1, [[[0, 0, 'mid']], [[0, 0, 'foam']], [[0, 0, 'hi']], []]);
}

// A star twinkling on a painted one: one pixel, mostly dim, brightening now and then.
export function starShape() {
  return shape(1, 1, ['star2', 'star2', 'star1', 'star0', 'star1', 'star2', 'star2', 'star2'].map((tone) => [[0, 0, tone]]));
}

// A firefly: one pixel that lights, glows, dims and goes dark.
export function fireflyShape() {
  return shape(1, 1, [[[0, 0, 'fly2']], [[0, 0, 'fly1']], [[0, 0, 'fly0']], [[0, 0, 'fly0']], [[0, 0, 'fly1']], []]);
}

// The last light on the horizon: a dash that lights, runs a pixel along and goes.
export function gleamShape() {
  return shape(6, 1, [
    [[2, 0, 'gleam2'], [3, 0, 'gleam2']],
    [[1, 0, 'gleam1'], [2, 0, 'gleam0'], [3, 0, 'gleam0'], [4, 0, 'gleam1']],
    [[2, 0, 'gleam1'], [3, 0, 'gleam0'], [4, 0, 'gleam0'], [5, 0, 'gleam1']],
    [[3, 0, 'gleam2'], [4, 0, 'gleam2']],
    [],
  ]);
}

// ---------------------------------------------------------------------------------------------
// Planners. Each returns pieces in art pixels: { x, y } the box's top-left, { w, h } its size,
// `shape` what is drawn in it, and its clock: `duration` and `delay` (seconds, on the tick,
// the delay part-way through so nothing waits for its first pass), `rhythm` for a flipbook.

const piece = (base) => ({ opacity: 1, ...base, x: Math.round(base.x), y: Math.round(base.y) });

// Things that travel: a streak, a leaf, a bar of light, a roller. Each lies along the painting's
// rows (the paintings' own water is horizontal dashes) and runs along its lane in whole art
// pixels: `tx` across and `ty` down, each axis stepping a pixel at a time on its own count
// (which is how a pixel line is drawn), never more than eight steps a second.
const travelDuration = (seconds, tx, ty) => {
  const least = Math.ceil(Math.max(Math.abs(tx), Math.abs(ty)) / MAX_STEPS_PER_S / (16 * TICK)) * 16 * TICK;
  return round3(Math.max(onClock(seconds, 16), least));
};
const laneTravel = (heading, travel) => {
  const rad = (heading * Math.PI) / 180;
  return { tx: toPx(Math.cos(rad) * travel), ty: toPx(Math.sin(rad) * travel) };
};

export function planMovers(biome, season = null) {
  const { effects } = ambienceFor(biome, season);
  const movers = [];
  if (effects.current) {
    const { lanes, seconds } = effects.current;
    lanes.forEach((lane, index) => {
      const { tx, ty } = laneTravel(lane.heading, lane.travel);
      const length = clamp(Math.round(toPx(lane.w) / 5), 3, 8);
      [0, 1].forEach((second) => {
        const duration = travelDuration(seconds * (0.85 + ((index * 3) % 4) / 10), tx, ty);
        movers.push(piece({
          kind: 'current', x: toPx(lane.x) - (tx < 0 ? 0 : length), y: toPx(lane.y) + second * 2, w: length, h: 1,
          shape: dashShape(length - second, tx < 0 ? -1 : 1), tx, ty, duration,
          delay: startAt(duration, spread(lanes.length, index) + second / 2), opacity: second ? 0.7 : 0.9,
        }));
      });
    });
  }
  if (effects.leaves) {
    const { lanes, seconds } = effects.leaves;
    lanes.forEach((lane, index) => {
      const { tx, ty } = laneTravel(lane.heading, lane.travel);
      const duration = travelDuration(seconds * (1 + index * 0.25), tx, ty);
      movers.push(piece({ kind: 'leaf', x: toPx(lane.x), y: toPx(lane.y), w: 3, h: 2, shape: leafShape(), tx, ty, duration, delay: startAt(duration, 0.3 + index * 0.45), flipSeconds: onClock(1, 2) }));
    });
  }
  if (effects.glass) {
    const { lanes, seconds } = effects.glass;
    lanes.forEach((lane, index) => {
      const { tx, ty } = laneTravel(lane.heading, lane.travel);
      const length = Math.round(toPx(lane.w) / 2.6);
      const duration = travelDuration(seconds * (0.85 + ((index * 3) % 4) / 10), tx, ty);
      movers.push(piece({ kind: 'glass', x: toPx(lane.x), y: toPx(lane.y), w: length, h: 1, shape: glassShape(length, index + 1), tx, ty, duration, delay: startAt(duration, spread(lanes.length, index)), opacity: 0.8 - 0.1 * (index % 2) }));
    });
  }
  if (effects.waves) movers.push(...areaMovers('roller', effects.waves));
  return movers;
}

// Rows of rollers across an area with perspective: the far rows short, the near ones long,
// each row's pieces offset so no two line up, all coming toward the viewer.
function areaMovers(kind, spec) {
  const { area } = spec;
  const rows = spec.rows || Math.ceil(spec.count / 2);
  const perRow = spec.perRow || Math.ceil(spec.count / rows);
  const pieces = [];
  for (let row = 0; row < rows; row += 1) {
    const t = spread(rows, row);
    const y = lerp(area.y0, area.y1, t);
    const x0 = pair(area.x0, t);
    const x1 = pair(area.x1, t);
    const length = Math.max(4, Math.round(toPx(lerp(spec.width[0], spec.width[1], t)) / 2));
    for (let n = 0; n < perRow; n += 1) {
      const index = row * perRow + n;
      if (spec.count && index >= spec.count) break;
      const slot = ((index * 0.37 + 0.15 + n * 0.5) % 1);
      const { tx, ty } = laneTravel(spec.heading, spec.travel * (0.8 + 0.4 * t));
      const duration = travelDuration(spec.seconds * (0.8 + ((index * 3) % 5) / 10), tx, ty);
      pieces.push(piece({
        kind,
        x: toPx(x0 + Math.max(0, x1 - x0 - length * ART_PX) * slot),
        y: toPx(y + ((index % 2) * 2 - 1) * (area.y1 - area.y0) * 0.02),
        w: length, h: spec.rowsTall || 2,
        shape: crestShape(length, index + 1, spec.rowsTall || 2, t),
        tx, ty, duration,
        delay: startAt(duration, index * 0.61 + 0.2),
        opacity: round3((spec.opacity || 1) * (0.7 + 0.3 * t)),
      }));
    }
  }
  return pieces;
}

// Whitecaps: each breaks and dissolves in place, scattered over the area in perspective rows.
export function planCaps(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.caps;
  if (!spec) return [];
  const { area, count } = spec;
  return Array.from({ length: count }, (_, index) => {
    const t = spread(count, index);
    const y = lerp(area.y0, area.y1, (index * 0.53 + 0.1) % 1);
    const depth = (y - area.y0) / (area.y1 - area.y0);
    const length = Math.max(4, Math.round(toPx(lerp(spec.width[0], spec.width[1], depth)) / 2));
    const duration = flipCycle(spec.seconds * (0.8 + ((index * 3) % 5) / 10), 6, '50');
    return piece({
      kind: 'cap', x: toPx(lerp(area.x0, area.x1, (index * 0.37 + t * 0.5) % 1)) - Math.round(length / 2), y: toPx(y),
      w: length + 2, h: 5, shape: capShape(length, index + 1), rhythm: '50', duration, delay: startAt(duration, index * 0.29 + 0.1),
    });
  });
}

// Churn pulsing in place.
export function planFoam(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.foam;
  if (!spec) return [];
  return spec.spots.map(([x, y, size], index, all) => {
    const s = foamShape(toPx(size), index + 1);
    const duration = flipCycle(spec.seconds * (0.8 + ((index * 3) % 4) / 5), 4, 'loop');
    return piece({ kind: 'foam', x: toPx(x) - Math.floor(s.w / 2), y: toPx(y) - Math.floor(s.h / 2), w: s.w, h: s.h, shape: s, rhythm: 'loop', duration, delay: startAt(duration, spread(all.length, index)) });
  });
}

// Rings opening on still water, each where the painting has a reason for one.
export function planRings(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.rings;
  if (!spec) return [];
  return spec.spots.map(([x, y, size], index, all) => {
    const s = ringShape(toPx(size));
    const duration = flipCycle(spec.seconds * (0.8 + (index % 3) / 5), 6, '25');
    return piece({ kind: 'ring', x: toPx(x) - Math.floor(s.w / 2), y: toPx(y) - Math.floor(s.h / 2), w: s.w, h: s.h, shape: s, rhythm: '25', duration, delay: startAt(duration, spread(all.length, index)) });
  });
}

// Surf running up the shore. The wet line is read off the painting as a polyline and drawn as
// a pixel line of foam (the lip) with a dithered sheet of water behind it, and the whole line
// runs up the beach a step at a time, holds, and drains back as it fades — one piece, so it
// never shows a seam. A second, smaller one follows half a cycle behind. `beach` is the side
// the sand is on (1 below the line, -1 above it).
// A long run goes up in six steps, a short one (a thin beach) in three.
export const WASH_LEVELS = { long: 6, short: 3 };
export function planWash(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.wash;
  if (!spec) return [];
  const points = spec.line.map(([x, y]) => [clamp(toPx(x), 0, ART_COLS - 1), toPx(y)]);
  const lip = [];
  for (let i = 1; i < points.length; i += 1) lip.push(...linePixels(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]));
  const seen = new Set();
  const line = lip.filter(([x, y]) => { const k = `${x},${y}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const xs = line.map(([x]) => x); const ys = line.map(([, y]) => y);
  const pad = 3;
  const x0 = Math.min(...xs); const y0 = Math.min(...ys) - pad;
  const w = Math.max(...xs) - x0 + 1; const h = Math.max(...ys) - Math.min(...ys) + 1 + pad * 2;
  const reach = toPx(spec.reach);
  return [0, 1].map((second) => {
    const px = [];
    line.forEach(([x, y]) => {
      const r = hash(second + 1, x, y);
      if (r < (second ? 0.3 : 0.08)) return;
      px.push([x - x0, y - y0, second ? 'lace' : 'foam']);
      // the foam behind the lip, on the sea side: broken, then lace
      const behind = hash(second + 3, x, y);
      if (!second && behind > 0.4) px.push([x - x0, y - y0 - spec.beach, behind > 0.75 ? 'foam' : 'lace']);
      if (!second && hash(second + 5, x, y) > 0.8) px.push([x - x0, y - y0 - 2 * spec.beach, 'lace']);
    });
    const duration = onClock(spec.seconds * (second ? 1.25 : 1), 32);
    const run = second ? Math.round(reach * 0.6) : reach;
    const levels = run >= WASH_LEVELS.long ? 'long' : 'short';
    return piece({
      kind: 'wash', x: x0, y: y0, w, h, shape: shape(w, h, [px]), levels,
      step: Math.max(1, Math.round(run / WASH_LEVELS[levels])) * spec.beach,
      duration, delay: startAt(duration, second ? 0.5 : 0.1), opacity: second ? 0.7 : 1,
    });
  });
}

// Mist lying on the water in dithered bands, drifting a pixel at a time.
export function planMist(biome, season = null, period = 'day') {
  const spec = ambienceFor(biome, season).effects.mist;
  if (!spec) return [];
  return spec.bands.map((band, index) => {
    const w = toPx(band.x1 - band.x0); const h = toPx(band.y1 - band.y0);
    const duration = onClock(spec.seconds * (1 + index * 0.35), 4);
    return piece({ kind: 'mist', x: toPx(band.x0), y: toPx(band.y0), w, h, shape: mistShape(w, h, index + 1, period === 'night'), duration, delay: startAt(duration, index * 0.4), opacity: 0.6 });
  });
}

// Moss hanging from the canopy where the painting grows it, each clump swaying from where it
// hangs.
export function planMoss(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.moss;
  if (!spec) return [];
  return spec.strands.map(([x, y, length], index, all) => {
    const s = swayShape(mossClump(toPx(length)), index + 1, 'top', ['moss2', 'moss1', 'moss0', 'moss2']);
    const duration = flipCycle(spec.seconds * (0.8 + ((index * 3) % 5) / 8), 8, 'loop');
    return piece({ kind: 'moss', x: toPx(x) - Math.floor(s.w / 2), y: toPx(y), w: s.w, h: s.h, shape: s, rhythm: 'loop', duration, delay: startAt(duration, spread(all.length, index)) });
  });
}

// Marsh grass at the bank, each tuft rooted where the painting grows it.
export function planGrass(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.grass;
  if (!spec) return [];
  return spec.blades.map(([x, y, height], index, all) => {
    const s = swayShape(grassTuft(toPx(height)), index + 11, 'bottom', ['grass0', 'grass1', 'grass2', 'grass2']);
    const duration = flipCycle(spec.seconds * (0.8 + ((index * 3) % 5) / 10), 8, 'loop');
    return piece({ kind: 'grass', x: toPx(x) - Math.floor(s.w / 2), y: toPx(y) - s.h, w: s.w, h: s.h, shape: s, rhythm: 'loop', duration, delay: startAt(duration, spread(all.length, index)) });
  });
}

// Gas surfacing from the mud, small and in the same few places.
export function planBubbles(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.bubbles;
  if (!spec) return [];
  return spec.spots.map(([x, y, size], index, all) => {
    const s = bubbleShape(size);
    const duration = flipCycle(spec.seconds * (0.7 + ((index * 3) % 4) / 6), 5, '25');
    return piece({ kind: 'bubble', x: toPx(x) - 2, y: toPx(y) - 3, w: s.w, h: s.h, shape: s, rhythm: '25', duration, delay: startAt(duration, spread(all.length, index)) });
  });
}

// Fireflies over the water after dark, each wandering a few pixels as it blinks.
export function planFireflies(biome, season = null, period = 'night') {
  const { effects, water } = ambienceFor(biome, season);
  const spec = effects.fireflies;
  if (!spec || period !== 'night') return [];
  const span = water.y1 - water.y0;
  return Array.from({ length: spec.count }, (_, index) => {
    const duration = flipCycle(spec.seconds * (0.7 + (index % 4) / 6), 6, '25');
    const wander = onClock(12 + (index % 3) * 3, 8);
    return piece({
      kind: 'firefly',
      x: toPx(water.x0 - 40 + (water.x1 - water.x0 + 40) * ((index * 0.41 + 0.1) % 1)),
      y: toPx(water.y0 - 30 + (span + 30) * ((index * 0.29 + 0.35) % 1)),
      w: 1, h: 1, shape: fireflyShape(), rhythm: '25', duration, delay: startAt(duration, spread(spec.count, index)),
      wander, wanderDelay: startAt(wander, index * 0.37),
    });
  });
}

// Whether a point in painting units lies inside a polygon.
export function inside(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i]; const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const boxPolygon = (b) => (Array.isArray(b) ? [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]] : [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]);

// Scatter n points over a polygon, a few pixels apart, the same way every time.
function scatter(polygon, n, seed, minGap = 4) {
  const xs = polygon.map(([x]) => x); const ys = polygon.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out = [];
  for (let i = 0, tries = 0; out.length < n && tries < n * 40; tries += 1, i += 1) {
    const x = lerp(x0, x1, hash(seed, i, 1)); const y = lerp(y0, y1, hash(seed, i, 2));
    if (!inside(polygon, x, y)) continue;
    const px = toPx(x); const py = toPx(y);
    if (out.some(([ax, ay]) => Math.abs(ax - px) < minGap && Math.abs(ay - py) < minGap / 2)) continue;
    out.push([px, py]);
  }
  return out;
}

// The sun on the water: flecks of the painting's own light flashing over its water by day,
// and after dark only down the moon path. `glitter` is how many.
export function planGlints(biome, season = null, period = 'day') {
  const config = ambienceFor(biome, season);
  const night = period === 'night';
  const region = night ? boxPolygon(config.moon) : config.clip || boxPolygon(config.sparkle);
  const count = night ? 10 : Math.round(config.glitter * 60);
  return scatter(region, count, night ? 7 : 3).map(([x, y], index) => {
    const wide = hash(index, 5) > 0.45;
    const duration = flipCycle(index % 3 === 0 ? 4 : 2, 4, '25');
    return piece({ kind: 'glint', x: x - (wide ? 1 : 0), y, w: wide ? 3 : 1, h: 1, shape: glintShape(wide), rhythm: '25', duration, delay: startAt(duration, hash(index, 9)) });
  });
}

// After dark, a few of the painting's own stars twinkle.
export function planStars(biome, season = null, period = 'night') {
  if (period !== 'night') return [];
  return ambienceFor(biome, season).stars.map(([x, y], index) => {
    const duration = flipCycle(3 + (index % 3), 8, 'loop');
    return piece({ kind: 'star', x: toPx(x), y: toPx(y), w: 1, h: 1, shape: starShape(), rhythm: 'loop', duration, delay: startAt(duration, index * 0.37) });
  });
}

// The horizon's last light: dashes that glint along the band where the sky meets the water.
export function planGleam(biome, season = null, period = 'day') {
  const spec = ambienceFor(biome, season).effects.gleam;
  if (!spec || period === 'night') return [];
  return scatter(boxPolygon(spec.box), spec.count, 11, 10).map(([x, y], index) => {
    const duration = flipCycle(spec.seconds * (index % 2 ? 1 : 0.5), 5, '50');
    return piece({ kind: 'gleam', x: x - 3, y, w: 6, h: 1, shape: gleamShape(), rhythm: '50', duration, delay: startAt(duration, hash(index, 13)) });
  });
}

// A tile of the light net on a sand bottom, drawn the way the painting draws its own: diamonds
// of two-to-one pixel lines (the lie of the water squashes them), their corners nudged so the
// lattice is not a grid and their sides broken here and there. The tile wraps: the corners on
// its edges are shared with the next tile's.
export function causticTile(w, h, seed) {
  const nudge = (i) => Math.round((hash(seed, i) - 0.5) * 4);
  const left = [0, Math.round(h / 2) + nudge(1)]; const right = [w, left[1]];
  const top = [Math.round(w / 2) + nudge(2), 0]; const bottom = [top[0], h];
  const inner = [Math.round(w / 2) + nudge(3), Math.round(h / 2) + nudge(4)];
  const seen = new Set();
  const px = [];
  const side = (a, b, n) => linePixels(a[0], a[1], b[0], b[1]).forEach(([x, y], i) => {
    const wx = ((x % w) + w) % w; const wy = ((y % h) + h) % h;
    if (hash(seed, n, Math.floor(i / 3)) < 0.18 || seen.has(`${wx},${wy}`)) return;
    seen.add(`${wx},${wy}`);
    px.push([wx, wy, hash(seed, n, i, 1) > 0.7 ? 'foam' : 'hi']);
  });
  side(left, top, 1); side(top, right, 2); side(right, bottom, 3); side(bottom, left, 4);
  // a crossing through the middle of some diamonds, as the painting's net has
  side(inner, [inner[0] + Math.round(w / 6), inner[1] + Math.round(h / 6)], 5);
  return shape(w, h, [px]);
}

// Tiled layers (the flats' light net, the winter lake's snow): each tile moves by exactly its
// own size per loop, a pixel a step on each axis, so a loop never jumps.
export function planTiles(biome, season = null, period = 'day') {
  const { effects } = ambienceFor(biome, season);
  const night = period === 'night';
  if (effects.caustics && !night) {
    const spec = effects.caustics;
    return { kind: 'caustics', clip: spec.clip, opacity: spec.opacity, layers: [
      { tile: causticTile(40, 20, 1), x: 40, y: 20, seconds: [onClock(spec.seconds, 8), onClock(spec.seconds * 0.75, 8)] },
      { tile: causticTile(56, 28, 2), x: -56, y: 28, seconds: [onClock(spec.seconds * 1.5, 8), onClock(spec.seconds * 1.25, 8)] },
    ] };
  }
  if (effects.snow) {
    const spec = effects.snow;
    const flakes = (w, h, n, seed, tone) => shape(w, h, [Array.from({ length: n }, (_, i) => [Math.floor(hash(seed, i, 1) * w), Math.floor(hash(seed, i, 2) * h), tone])]);
    return { kind: 'snow', clip: null, opacity: spec.opacity, layers: [
      { tile: flakes(36, 36, 7, 3, 'snow0'), x: 36, y: 36, seconds: [onClock(spec.seconds * 3.75, 8), onClock(spec.seconds, 8)] },
      { tile: flakes(24, 24, 5, 4, 'snow1'), x: -24, y: 24, seconds: [onClock(spec.seconds * 4.5, 8), onClock(spec.seconds * 1.25, 8)] },
    ] };
  }
  return null;
}

// The sky's clouds, by day: each lane's cloud at its own size (never stretched to the lane),
// crossing the whole painting a pixel at a time, started part-way across so the sky is never
// empty. None after dark: every night painting has its own sky.
export function planClouds(biome, season = null, period = 'day') {
  const config = ambienceFor(biome, season);
  if (period === 'night') return [];
  const speeds = [2.5, 1.8, 2.2];
  return config.clouds.map((lane, index) => {
    const sprite = AMBIENT_SPRITES.clouds[index % AMBIENT_SPRITES.clouds.length];
    const travel = ART_COLS + sprite.w;
    const duration = onClock(travel / speeds[index % speeds.length]);
    // Where it is when the loop is where the delay puts it (and where it stays, with motion off):
    // the lane's own start, or somewhere along the sky.
    const from = Math.round(lane.from > 0 ? toPx(lane.from) : ART_COLS * (0.3 + index * 0.35));
    return piece({ kind: 'cloud', x: from, y: toPx(lane.y0), w: sprite.w, h: sprite.h, src: sprite.src, tx0: -(from + sprite.w), tx: travel, duration, delay: startAt(duration, (from + sprite.w) / travel) });
  });
}

// Gulls over salt water by day (they roost after dark): one size, flapping on the stage's
// clock, gliding across two pixels a step and bobbing a pixel up and down.
export function planGulls(biome, season = null, period = 'day') {
  const config = ambienceFor(biome, season);
  if (config.critter !== 'seagull' || period === 'night' || !config.gulls) return [];
  const { gull } = AMBIENT_SPRITES;
  const travel = ART_COLS + gull.w * 2;
  return Array.from({ length: config.critters }, (_, index) => {
    const stride = 2;
    const duration = onClock(travel / (15 - (index % 4) * 1.5), 2);
    const y = config.gulls.y0 + ((config.gulls.y1 - config.gulls.y0) * index) / Math.max(1, config.critters - 1);
    return piece({
      kind: 'gull', x: -gull.w, y: toPx(y), w: gull.w, h: gull.h, src: gull.src, frames: gull.frames, tx: travel, stride, duration,
      delay: startAt(duration, 0.2 + index * 0.37), flap: onClock(0.375), bob: onClock(2 + (index % 3) * 0.5, 4),
    });
  });
}

// Dragonflies over fresh water by day: each hovers, darts a few pixels in three quick steps,
// hovers again and turns back, beating its wings on the stage's clock.
export function planDragonflies(biome, season = null, period = 'day') {
  const config = ambienceFor(biome, season);
  if (config.critter !== 'dragonfly' || period === 'night') return [];
  const { dragonfly } = AMBIENT_SPRITES;
  return config.dragonflies.map((spot, index) => {
    const duration = onClock(12.5, 100);
    return piece({ kind: 'dragonfly', x: toPx(spot.x), y: toPx(spot.y), w: dragonfly.w, h: dragonfly.h, src: dragonfly.src, frames: dragonfly.frames, duration, delay: startAt(duration, index * 0.35), wings: onClock(0.25, 2) });
  });
}

// Everything a ground runs at this hour, in one plan.
export function planAmbience(biome, season = null, period = 'day') {
  const config = ambienceFor(biome, season);
  return {
    config,
    palette: paletteFor(biome, season, period),
    clouds: planClouds(biome, season, period),
    gulls: planGulls(biome, season, period),
    dragonflies: planDragonflies(biome, season, period),
    stars: planStars(biome, season, period),
    glints: planGlints(biome, season, period),
    gleam: planGleam(biome, season, period),
    tiles: planTiles(biome, season, period),
    movers: planMovers(biome, season),
    caps: planCaps(biome, season),
    wash: planWash(biome, season),
    foam: planFoam(biome, season),
    rings: planRings(biome, season),
    bubbles: planBubbles(biome, season),
    mist: planMist(biome, season, period),
    moss: planMoss(biome, season),
    grass: planGrass(biome, season),
    fireflies: planFireflies(biome, season, period),
  };
}

// ---------------------------------------------------------------------------------------------
// Drawing: a shape as an SVG strip (its cells side by side, one SVG unit to one art pixel,
// hard-edged), a mask of art-pixel row runs, a polygon rasterised to art-pixel runs, and the
// table that repaints the sky's clouds in a painting's own four tones.

const DITHER = {
  1: (x, y) => (x + y) % 2 === 0,
  2: (x, y) => x % 2 === 0 && y % 2 === 0,
  3: (x, y) => x % 4 === 0 && y % 2 === 0,
};
const svgUrl = (w, h, body) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges">${body}</svg>`)}")`;

// Pixels by colour, merged into horizontal runs, as one path per colour.
function pathsFor(pixels) {
  const byColour = new Map();
  pixels.forEach(([x, y, colour]) => { if (!byColour.has(colour)) byColour.set(colour, new Set()); byColour.get(colour).add(`${x},${y}`); });
  let body = '';
  byColour.forEach((set, colour) => {
    const pts = [...set].map((k) => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    let d = '';
    for (let i = 0; i < pts.length;) {
      const [x, y] = pts[i];
      let n = 1;
      while (i + n < pts.length && pts[i + n][1] === y && pts[i + n][0] === x + n) n += 1;
      d += `M${x} ${y}h${n}v1h-${n}z`;
      i += n;
    }
    body += `<path fill="${colour}" d="${d}"/>`;
  });
  return body;
}

export function shapePixels(s, colours) {
  const out = [];
  s.cells.forEach((cell, i) => cell.forEach((item) => {
    if (item[0] === 'dither') {
      const [, x, y, w, h, level, tone] = item;
      const on = DITHER[level];
      if (!on) return;
      for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) if (on(xx, yy)) out.push([xx + i * s.w, yy, colours[tone] || tone]);
      return;
    }
    const [x, y, tone] = item;
    out.push([x + i * s.w, y, colours[tone] || tone]);
  }));
  return out;
}

export function svgStrip(s, colours) {
  return svgUrl(s.w * s.cells.length, s.h, pathsFor(shapePixels(s, colours)));
}

// Row runs "y:x0-x1,…;…" → rectangles [x, y, w, h], runs that repeat row after row merged.
export function maskRects(runs) {
  if (!runs) return [];
  const rects = [];
  let open = new Map();
  runs.split(';').forEach((row) => {
    const [yText, list] = row.split(':');
    const y = Number(yText);
    const next = new Map();
    list.split(',').forEach((run) => {
      const [a, b] = run.split('-').map(Number);
      const key = `${a}-${b}`;
      const prev = open.get(key);
      if (prev && prev[1] + prev[3] === y) { prev[3] += 1; next.set(key, prev); } else { const r = [a, y, b - a + 1, 1]; rects.push(r); next.set(key, r); }
    });
    open = next;
  });
  return rects;
}

// A polygon in painting units as art-pixel row runs (a pixel is in when its centre is).
export function polygonRuns(points) {
  const rows = [];
  for (let y = 0; y < Math.ceil(ART_ROWS); y += 1) {
    const runs = [];
    let start = -1;
    for (let x = 0; x <= ART_COLS; x += 1) {
      const on = x < ART_COLS && inside(points, (x + 0.5) * ART_PX, (y + 0.5) * ART_PX);
      if (on && start < 0) start = x;
      if (!on && start >= 0) { runs.push(`${start}-${x - 1}`); start = -1; }
    }
    if (runs.length) rows.push(`${y}:${runs.join(',')}`);
  }
  return rows.join(';');
}

// The mask image for row runs over the whole painting.
export function maskUrl(runs) {
  const d = maskRects(runs).map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('');
  return svgUrl(ART_COLS, ART_ROWS, `<path fill="#000" d="${d}"/>`);
}

// The sky's clouds are drawn in four tones (AMBIENT_SPRITES' art: lightest first). Each tone
// falls in its own sixteenth of every channel, so a discrete transfer table per channel repaints
// each one exactly in the painting's own tone; the sixteenths no tone falls in take their
// nearest tone's value.
export const CLOUD_ART_TONES = ['#f7f9f8', '#e1e8ea', '#b8c6ce', '#8d9fab'];
export function cloudTables(tones) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const from = CLOUD_ART_TONES.map(rgb);
  const to = tones.map(rgb);
  return [0, 1, 2].map((channel) => {
    const bins = from.map((c) => Math.min(15, Math.floor((c[channel] / 255) * 16)));
    return Array.from({ length: 16 }, (_, bin) => {
      let best = 0;
      bins.forEach((b, i) => { if (Math.abs(b - bin) < Math.abs(bins[best] - bin)) best = i; });
      return round3(to[best][channel] / 255);
    }).join(' ');
  });
}

// What keeps each Cast & Catch stage alive between the player's own actions. The paintings
// are not the same place and they do not breathe the same way, so every ground has its own
// plan here, read off its own painting: the river runs down past the riffles with a leaf on
// it, the mountain lake rings and its reflection shivers under the mist, the swamp hangs moss
// and bubbles up from the mud, the bay's rollers lap the pilings, the surf washes up the beach
// along the line the sand actually runs, the charter grounds whitecap and churn at the stern,
// the canyon's dusk swell gleams along the horizon, the flats' light nets move over the sand,
// the pier stands in the chop with the beach breaking behind it, the creek ebbs past swaying
// marsh grass, Baja's swell rolls in under the sea lions' rock, and snow falls on the frozen
// lake. On top of that each ground has whatever sky its backdrop actually has, gulls over
// salt water and dragonflies over fresh. This is the one place in the app with ambient looping
// motion, on purpose: the stage is a game world, not UI chrome, and it's the only thing that
// loops. Everything here is planned in painting units (480 x 270, utils/sceneLayout.js) — every
// streak, ring and foam puff is placed against the painting itself, so the surf is on the
// sand line and the wake is at the transom whatever the stage's crop — and SceneAmbience turns
// the plans into stage positions. No fish is ever drawn out there: the only one on the water is
// the one the player is fighting. Every planner is pure and deterministic, so a ground always
// breathes the same way.
import { BIOMES } from './gameBiomes';
import { layoutFor, sceneKeyFor } from './sceneLayout';

// Cloud lanes: how long a crossing takes and where in the loop each starts, per lane.
const LANE_MOTION = [{ duration: 95, delay: -20 }, { duration: 130, delay: -75 }, { duration: 110, delay: -45 }];

const CRITTERS = {
  river: 'dragonfly', mountainlake: 'dragonfly', swamp: 'dragonfly',
  bay: 'seagull', shoreline: 'seagull', offshore: 'seagull', canyon: 'seagull', flats: 'seagull', pier: 'seagull', creek: 'seagull', baja: 'seagull',
};
const GULL_COUNT = { bay: 2, shoreline: 2, offshore: 3, canyon: 2, flats: 2, pier: 3, creek: 1, baja: 4 };

// Each ground's water and what moves on it, in painting units. `glitter` is how much of the
// sun-glint layer to run over the layout's sparkle box (a river's broken surface catches
// little of it, a bay a lot), with an optional `clip` polygon where that box overlaps sand,
// rock or hull. Everything else is a named effect one of the planners below lays out:
//   current  — streaks running with the flow, each along its own lane (x, y, heading, travel)
//   leaves   — the odd leaf riding the current
//   glass    — light sliding across a mirror-calm reflection
//   waves    — rollers crossing an area toward the shore, in rows with perspective
//   caps     — whitecaps breaking and dissolving across an area
//   wash     — surf running up a shoreline (a line across the painting) and back
//   foam     — churn pulsing in one place: riffles at rocks, a wake, a rock the swell hits
//   rings    — rises opening on still water
//   bubbles  — mud gas surfacing
//   mist     — bands lying on the water
//   moss     — strands hanging from the canopy
//   grass    — marsh blades swaying at the bank
//   fireflies — after dark only, over the water
//   caustics — the light net moving over a sand bottom
//   gleam    — the last light along the horizon
//   snow     — falling over everything
const SCENES = {
  // The river comes down out of the narrows at the top right, breaks white over the rocks and
  // runs down past the dock toward the viewer, so everything on it heads down and left.
  river: {
    glitter: 0.12,
    current: { seconds: 12, lanes: [
      { x: 468, y: 104, w: 26, h: 2.5, heading: 168, travel: 60 },
      { x: 318, y: 118, w: 22, h: 2.5, heading: 175, travel: 44 },
      { x: 466, y: 142, w: 34, h: 3, heading: 152, travel: 110 },
      { x: 402, y: 170, w: 40, h: 3, heading: 156, travel: 120 },
      { x: 476, y: 196, w: 46, h: 3.5, heading: 155, travel: 150 },
      { x: 352, y: 206, w: 36, h: 3, heading: 162, travel: 90 },
      { x: 462, y: 234, w: 50, h: 3.5, heading: 158, travel: 150 },
    ] },
    foam: { seconds: 2.8, spots: [[332, 90, 14], [372, 98, 12], [442, 108, 18], [400, 133, 16], [452, 132, 14], [420, 158, 12], [320, 122, 10]] },
    leaves: { seconds: 15, lanes: [
      { x: 478, y: 185, w: 6, h: 4, heading: 156, travel: 210 },
      { x: 440, y: 135, w: 5, h: 3.5, heading: 155, travel: 180 },
    ] },
  },
  // Mirror-calm: the peaks reflected in the middle (x 200-400, y 95-180), mist lying along the
  // far shore, and a trout dimpling it now and then.
  mountainlake: {
    glitter: 0.3,
    rings: { seconds: 11, spots: [[300, 150, 26], [398, 120, 18], [425, 205, 34], [275, 220, 36]] },
    mist: { seconds: 22, bands: [{ x0: 190, x1: 480, y0: 80, y1: 96 }, { x0: 250, x1: 470, y0: 88, y1: 106 }] },
    glass: { seconds: 20, lanes: [
      { x: 210, y: 118, w: 70, h: 1.6, heading: 0, travel: 120 },
      { x: 230, y: 142, w: 90, h: 1.8, heading: 0, travel: 150 },
      { x: 200, y: 168, w: 80, h: 1.6, heading: 0, travel: 170 },
    ] },
  },
  // Under the canopy: moss swinging from it, gas bubbling up round the cypress knees, rings at
  // the lily pads, and after dark the fireflies.
  swamp: {
    glitter: 0.06,
    moss: { count: 9, seconds: 6, y: 6 },
    rings: { seconds: 14, spots: [[140, 238, 24], [330, 222, 26], [402, 208, 30], [262, 180, 18]] },
    bubbles: { seconds: 7, spots: [[322, 122, 4], [346, 134, 3], [252, 188, 4], [412, 204, 3], [180, 215, 3]] },
    fireflies: { count: 10, seconds: 15 },
  },
  // Sheltered water: low rollers coming in toward the dock and lapping at its pilings.
  bay: {
    glitter: 0.4,
    clip: [[240, 60], [480, 60], [480, 195], [430, 215], [400, 245], [370, 270], [240, 270]],
    waves: { seconds: 10, area: { x0: 250, x1: 480, y0: 105, y1: 250 }, rows: 5, perRow: 2, heading: 92, travel: 26, width: [30, 90], height: [2.5, 5] },
    foam: { seconds: 3.6, spots: [[232, 178, 12], [114, 176, 10], [20, 172, 9]] },
  },
  // The beach: the wet line runs from the bottom left corner up to the point on the right,
  // and the surf runs up it and drains back; rollers stack up behind it.
  shoreline: {
    glitter: 0.28,
    clip: [[240, 60], [480, 60], [480, 172], [240, 205]],
    wash: { seconds: 7, line: [[0, 238], [480, 172]], reach: 16, segments: 3 },
    waves: { seconds: 8, area: { x0: 250, x1: 480, y0: 95, y1: 160 }, rows: 3, perRow: 2, heading: 92, travel: 20, width: [40, 100], height: [2.5, 4.5] },
  },
  // Blue water: whitecaps breaking everywhere, and the stern wash churning at the transom.
  offshore: {
    glitter: 0.35,
    caps: { seconds: 5, area: { x0: 140, x1: 480, y0: 100, y1: 265 }, count: 10, heading: 94, travel: 10, width: [14, 40], height: [2.5, 4.5] },
    foam: { seconds: 3, spots: [[126, 214, 18], [142, 236, 16], [118, 252, 22], [170, 258, 18], [210, 262, 16]] },
  },
  // Dusk: a long, low swell you see more than hear, and the afterglow on the horizon left of
  // the cliffs. The water shows left of the gunwale high up and right of it below.
  canyon: {
    glitter: 0.2,
    waves: { seconds: 13, area: { x0: [210, 305], x1: 480, y0: 105, y1: 255 }, rows: 5, perRow: 1, heading: 92, travel: 28, width: [50, 120], height: [3, 6], opacity: 0.32 },
    gleam: { seconds: 9, box: { x0: 200, x1: 352, y0: 86, y1: 99 } },
  },
  // Skinny water over sand: the light net on the bottom is what moves, and nervous water
  // rings where something pushed.
  flats: {
    glitter: 0.3,
    clip: [[235, 128], [240, 55], [480, 55], [480, 270], [272, 270]],
    caustics: { seconds: 14, opacity: 0.24 },
    rings: { seconds: 9, spots: [[332, 96, 16], [424, 132, 20], [386, 200, 28], [450, 240, 32]] },
  },
  // The pier's end: grey-green chop running to the beach in the corner, surf on that beach,
  // and the swell slapping the pilings.
  pier: {
    glitter: 0.22,
    clip: [[260, 90], [480, 90], [480, 190], [340, 270], [260, 270]],
    caps: { seconds: 5.5, area: { x0: 262, x1: 478, y0: 100, y1: 232 }, count: 9, heading: 94, travel: 12, width: [12, 34], height: [2.5, 4] },
    wash: { seconds: 6.5, line: [[336, 268], [480, 192]], reach: 10, segments: 2 },
    foam: { seconds: 3.2, spots: [[258, 262, 14], [158, 264, 12], [224, 236, 9]] },
  },
  // The marsh creek on the ebb: the channel bends down from the far bend past the dock and
  // the tide slides down it as ripple lines drifting toward the viewer (the channel is narrow
  // at the bend and opens out below, so the area's edges follow it); the grass on both banks
  // moves in the breeze.
  creek: {
    glitter: 0.12,
    clip: [[262, 124], [302, 124], [300, 150], [288, 178], [336, 196], [372, 206], [338, 232], [300, 262], [200, 262], [200, 190], [232, 168], [212, 150]],
    waves: { seconds: 16, area: { x0: [268, 210], x1: [298, 340], y0: 132, y1: 258 }, rows: 6, perRow: 1, heading: 92, travel: 18, width: [12, 56], height: [1.5, 3], opacity: 0.45 },
    rings: { seconds: 13, spots: [[110, 214, 20], [300, 240, 22]] },
    grass: { seconds: 4.5, blades: [[40, 100, 16], [80, 96, 20], [120, 98, 18], [170, 94, 20], [210, 98, 18], [250, 96, 16], [350, 140, 18], [392, 150, 22], [430, 160, 20], [462, 148, 24], [400, 190, 18], [450, 186, 22]] },
  },
  // The Pacific: a long swell rolling in past the bow (the hull's edge runs (232,128) to
  // (252,270), so the swell starts just right of it) toward the beach under the headland,
  // breaking white on the sea lions' rock, and a thin surf line on that far beach.
  baja: {
    glitter: 0.5,
    clip: [[240, 95], [480, 95], [480, 270], [252, 270], [232, 128]],
    waves: { seconds: 11, area: { x0: [228, 254], x1: 480, y0: 105, y1: 255 }, rows: 5, perRow: 2, heading: 90, travel: 32, width: [40, 110], height: [3, 6] },
    wash: { seconds: 8, line: [[480, 92], [142, 64]], reach: 5, segments: 3 },
    foam: { seconds: 3.4, spots: [[60, 88, 14], [104, 92, 16], [86, 96, 10]] },
  },
  // The lake frozen over: mist lying over the open lead, and snow coming down on all of it.
  'mountainlake:winter': {
    glitter: 0.1,
    clip: [[214, 150], [262, 140], [298, 150], [346, 138], [394, 150], [432, 160], [424, 198], [398, 240], [346, 256], [282, 262], [222, 238], [200, 206], [212, 190]],
    mist: { seconds: 26, bands: [{ x0: 200, x1: 440, y0: 138, y1: 160 }, { x0: 230, x1: 430, y0: 196, y1: 216 }] },
    snow: { seconds: 11, opacity: 0.75 },
  },
};

// The layers that are a box rather than a list of things: keyed off `effects` directly.
export const LAYER_EFFECTS = ['glitter', 'caustics', 'gleam', 'snow'];

export { sceneKeyFor };

const round2 = (value) => Math.round(value * 100) / 100;
// Spread n things evenly across a span, each a little out of step with the last, without a
// random number in sight: the same ground always breathes the same way.
const spread = (n, index) => (index + 0.5) / n;
const lerp = (a, b, t) => a + (b - a) * t;
const pair = (value, t) => (Array.isArray(value) ? lerp(value[0], value[1], t) : value);

export function ambienceFor(biome, season = null) {
  const key = BIOMES[biome] ? biome : 'river';
  const layout = layoutFor(key, season);
  const sceneKey = sceneKeyFor(key, season);
  // No dragonflies over fresh water in winter, and none over the ice.
  const critter = CRITTERS[key] || 'dragonfly';
  const dragonflies = critter === 'dragonfly' && season === 'winter' ? [] : layout.dragonflies;
  return {
    biome: key,
    critter,
    critters: critter === 'seagull' ? (GULL_COUNT[key] || 2) : dragonflies.length,
    clouds: layout.sky.map((lane, index) => ({ ...lane, ...LANE_MOTION[index % LANE_MOTION.length] })),
    gulls: layout.gulls,
    dragonflies,
    lamp: layout.lamp,
    sparkle: layout.sparkle,
    water: layout.water,
    effects: SCENES[sceneKey] || SCENES[key] || SCENES.river,
  };
}

// The named effects a ground runs (the sun glint, which most water has some of, aside) —
// what "no two grounds move the same way" is judged on.
export function effectNames(biome, season = null) {
  return Object.keys(ambienceFor(biome, season).effects).filter((key) => key !== 'clip' && key !== 'glitter').sort();
}

// Things that travel: a streak, a leaf, a bar of light, a roller, a whitecap. Each is a
// lane — where it starts, how big it is, which way it heads (degrees, 0 = right, 90 = down)
// and how far it goes — that SceneAmbience rotates into place and runs along. A streak or a
// leaf lies along its travel; a roller or a whitecap lies `across` it (a crest is at right
// angles to the way the wave is going), so its `w` is the crest's length and its `h` its
// depth along the lane.
const laneMover = (kind, lane, spec, index, count, opacity) => {
  const t = spread(count, index);
  return {
    kind,
    x: lane.x, y: lane.y, w: lane.w, h: lane.h, heading: lane.heading, travel: lane.travel,
    duration: round2(spec.seconds * (0.85 + ((index * 3) % 4) / 10)),
    delay: round2(-spec.seconds * t),
    opacity: round2(opacity - 0.08 * (index % 3)),
  };
};

// Rows across an area with perspective: the far rows are short and narrow, the near ones long
// and wide, each row's pieces offset so no two line up, all heading the same way.
const areaMovers = (kind, spec, opacity) => {
  const { area } = spec;
  const rows = spec.rows || Math.ceil(spec.count / 2);
  const perRow = spec.perRow || Math.ceil(spec.count / rows);
  const pieces = [];
  for (let row = 0; row < rows; row += 1) {
    const t = spread(rows, row);
    const y = lerp(area.y0, area.y1, t);
    const x0 = pair(area.x0, t);
    const x1 = pair(area.x1, t);
    const w = round2(lerp(spec.width[0], spec.width[1], t));
    const h = round2(lerp(spec.height[0], spec.height[1], t));
    for (let n = 0; n < perRow; n += 1) {
      const index = row * perRow + n;
      if (spec.count && index >= spec.count) break;
      const slot = ((index * 0.37 + 0.15 + n * 0.5) % 1);
      pieces.push({
        kind,
        across: true,
        x: round2(x0 + Math.max(0, x1 - x0 - w) * slot),
        y: round2(y + ((index % 2) * 2 - 1) * (area.y1 - area.y0) * 0.02),
        w, h,
        heading: spec.heading,
        travel: spec.travel,
        duration: round2(spec.seconds * (0.8 + ((index * 5) % 5) / 10)),
        delay: round2(-spec.seconds * ((index * 0.61 + 0.2) % 1)),
        opacity: round2((spec.opacity || opacity) * (0.7 + 0.3 * t)),
      });
    }
  }
  return pieces;
};

export function planMovers(biome, season = null) {
  const { effects } = ambienceFor(biome, season);
  const movers = [];
  if (effects.current) effects.current.lanes.forEach((lane, index, all) => movers.push(laneMover('current', lane, effects.current, index, all.length, 0.7)));
  if (effects.leaves) effects.leaves.lanes.forEach((lane, index, all) => movers.push(laneMover('leaf', lane, effects.leaves, index, all.length, 0.95)));
  if (effects.glass) effects.glass.lanes.forEach((lane, index, all) => movers.push(laneMover('glass', lane, effects.glass, index, all.length, 0.5)));
  if (effects.waves) movers.push(...areaMovers('wave', effects.waves, 0.6));
  if (effects.caps) movers.push(...areaMovers('cap', effects.caps, 0.9));
  return movers;
}

// Churn pulsing in place.
export function planFoam(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.foam;
  if (!spec) return [];
  return spec.spots.map(([x, y, size], index, all) => ({
    x, y, size,
    duration: round2(spec.seconds * (0.85 + ((index * 3) % 4) / 10)),
    delay: round2(-spec.seconds * spread(all.length, index)),
  }));
}

// Rings opening on still water, each where the painting has a reason for one.
export function planRings(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.rings;
  if (!spec) return [];
  return spec.spots.map(([x, y, size], index, all) => ({
    x, y, size,
    duration: round2(spec.seconds * (0.9 + (index % 3) / 8)),
    delay: round2(-spec.seconds * spread(all.length, index)),
  }));
}

// Surf running up the shore: the wet line is a segment across the painting, cut into pieces
// that each run `reach` units up the beach and drain back, one after another. The pieces
// overlap a third and fade at their ends (SceneAmbience masks them), so a piece at full run
// beside one draining back never shows a seam. The beach is on the line's right-hand side
// looking from its first point to its second, so a beach that lies above its wet line
// (Baja's, under the headland) has its line written right to left.
const WASH_OVERLAP = 0.34;
export function planWash(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.wash;
  if (!spec) return [];
  const [[x0, y0], [x1, y1]] = spec.line;
  const length = Math.hypot(x1 - x0, y1 - y0);
  const angle = round2((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI);
  return Array.from({ length: spec.segments }, (_, index) => {
    const from = Math.max(0, (index - WASH_OVERLAP) / spec.segments);
    const to = Math.min(1, (index + 1 + WASH_OVERLAP) / spec.segments);
    return {
      x: round2(lerp(x0, x1, from)), y: round2(lerp(y0, y1, from)),
      length: round2(length * (to - from)),
      reach: spec.reach,
      angle,
      duration: round2(spec.seconds * (0.9 + (index % 2) / 6)),
      delay: round2(-spec.seconds * spread(spec.segments, index)),
    };
  });
}

// Mist lying on the water in bands.
export function planMist(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.mist;
  if (!spec) return [];
  return spec.bands.map((band, index) => ({
    x: band.x0, y: band.y0, w: band.x1 - band.x0, h: band.y1 - band.y0,
    duration: round2(spec.seconds * (0.8 + index * 0.35)),
    delay: round2(-spec.seconds * index * 0.4),
  }));
}

// Moss hanging from the canopy, over the moss the painting already has, so the whole tree
// line sways rather than a strip of it. `y` is where the canopy's own moss starts.
export function planMoss(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.moss;
  if (!spec) return [];
  return Array.from({ length: spec.count }, (_, index) => {
    const t = spread(spec.count, index);
    return {
      x: round2(20 + 440 * t),
      y: spec.y + ((index * 7) % 12),
      length: 34 + ((index * 13) % 40),
      duration: round2(spec.seconds * (0.85 + ((index * 5) % 5) / 8)),
      delay: round2(-spec.seconds * t),
    };
  });
}

// Marsh grass at the bank, each blade rooted where the painting grows it.
export function planGrass(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.grass;
  if (!spec) return [];
  return spec.blades.map(([x, y, height], index, all) => ({
    x, y, height,
    duration: round2(spec.seconds * (0.8 + ((index * 3) % 5) / 10)),
    delay: round2(-spec.seconds * spread(all.length, index)),
  }));
}

// Gas surfacing from the mud, small and in the same few places.
export function planBubbles(biome, season = null) {
  const spec = ambienceFor(biome, season).effects.bubbles;
  if (!spec) return [];
  return spec.spots.map(([x, y, size], index, all) => ({
    x, y, size,
    duration: round2(spec.seconds * (0.7 + ((index * 3) % 4) / 8)),
    delay: round2(-spec.seconds * spread(all.length, index)),
  }));
}

// Fireflies over the water after dark.
export function planFireflies(biome, season = null) {
  const { effects, water } = ambienceFor(biome, season);
  const spec = effects.fireflies;
  if (!spec) return [];
  const span = water.y1 - water.y0;
  return Array.from({ length: spec.count }, (_, index) => {
    const t = spread(spec.count, index);
    return {
      x: round2(water.x0 - 40 + (water.x1 - water.x0 + 40) * ((index * 0.41 + 0.1) % 1)),
      y: round2(water.y0 - 30 + (span + 30) * ((index * 0.29 + 0.35) % 1)),
      size: 3 + (index % 2),
      duration: round2(spec.seconds * (0.8 + (index % 4) / 6)),
      delay: round2(-spec.seconds * t),
    };
  });
}

// A clip polygon in painting units as percentages of a box, for the layers that would
// otherwise glint on sand or hull.
export function clipFor(points, box) {
  if (!points) return undefined;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  return `polygon(${points.map(([x, y]) => `${round2(((x - box.x0) / w) * 100)}% ${round2(((y - box.y0) / h) * 100)}%`).join(', ')})`;
}

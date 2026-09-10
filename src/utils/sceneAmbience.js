// What keeps each Cast & Catch stage alive between the player's own actions. The paintings
// are not the same place and they do not breathe the same way: the river runs, the mountain
// lake sits still and rings, the swamp hangs and blinks, the beach breaks, and the bay and
// the charter grounds ride the swell. On top of that each ground has whatever sky its
// backdrop actually has, gulls over salt water and dragonflies over fresh, the dock lamp's
// glow, and the occasional fish jumping in the distance — always a species that really lives
// in that biome, so the world quietly shows you what's in it. This is the one place in the app with ambient looping motion, on
// purpose: the stage is a game world, not UI chrome, and it's the only thing that loops.
// Everything here is planned in painting units from the scene's layout (utils/sceneLayout.js),
// so the shadows really are in the water and the dragonfly really is over the reeds, whatever
// the stage's crop; SceneAmbience turns them into stage positions.
import { BIOMES } from './gameBiomes';
import { layoutFor } from './sceneLayout';

// Cloud lanes: how long a crossing takes and where in the loop each starts, per lane.
const LANE_MOTION = [{ duration: 95, delay: -20 }, { duration: 130, delay: -75 }, { duration: 110, delay: -45 }];

const CRITTERS = {
  river: 'dragonfly', mountainlake: 'dragonfly', swamp: 'dragonfly',
  bay: 'seagull', shoreline: 'seagull', offshore: 'seagull', canyon: 'seagull',
};
const GULL_COUNT = { bay: 2, shoreline: 2, offshore: 3, canyon: 2 };

// The water each ground moves in. `sparkle` is how much of the shimmer layer to run: a
// river's broken surface catches little of it, a bay's swell a lot. Everything else is a
// named effect the planners below lay out in painting units.
const SCENES = {
  river: { current: { lines: 6, seconds: 13, band: [0.04, 0.5] }, sparkle: 0.2 },
  mountainlake: { rings: { count: 3, seconds: 10 }, mist: { y: 0.02, height: 9, seconds: 26 }, sparkle: 0.42 },
  swamp: { moss: { count: 7, seconds: 6, y: 14 }, fireflies: { count: 8, seconds: 15 }, rings: { count: 2, seconds: 15 }, sparkle: 0.14 },
  shoreline: { surf: { count: 3, seconds: 6.5 }, sparkle: 0.28 },
  bay: { swell: { seconds: 9 }, sparkle: 0.44 },
  offshore: { swell: { seconds: 6.5 }, sparkle: 0.4 },
  canyon: { current: { lines: 4, seconds: 19, band: [0.08, 0.42] }, sparkle: 0.24 },
};

const round2 = (value) => Math.round(value * 100) / 100;
// Spread n things evenly across a span, each a little out of step with the last, without a
// random number in sight: the same ground always breathes the same way.
const spread = (n, index) => (index + 0.5) / n;

export function ambienceFor(biome) {
  const key = BIOMES[biome] ? biome : 'river';
  const layout = layoutFor(key);
  const critter = CRITTERS[key] || 'dragonfly';
  return {
    biome: key,
    critter,
    critters: critter === 'seagull' ? (GULL_COUNT[key] || 2) : layout.dragonflies.length,
    clouds: layout.sky.map((lane, index) => ({ ...lane, ...LANE_MOTION[index % LANE_MOTION.length] })),
    gulls: layout.gulls,
    dragonflies: layout.dragonflies,
    lamp: layout.lamp,
    sparkle: layout.sparkle,
    water: layout.water,
    effects: SCENES[key] || SCENES.river,
  };
}

// Streaks running downstream across the water, staggered so they never line up.
export function planCurrent(biome) {
  const { effects, water } = ambienceFor(biome);
  const spec = effects.current;
  if (!spec) return [];
  const span = water.y1 - water.y0;
  const [from, to] = spec.band;
  return Array.from({ length: spec.lines }, (_, index) => {
    const t = spread(spec.lines, index);
    return {
      y: round2(water.y0 + span * (from + t * (to - from))),
      width: 34 + ((index * 23) % 40),
      duration: round2(spec.seconds * (0.85 + ((index * 3) % 4) / 10)),
      delay: round2(-spec.seconds * t),
      opacity: round2(0.55 - 0.08 * (index % 3)),
    };
  });
}

// Rings opening on still water, spread across it and out of step with each other.
export function planRings(biome) {
  const { effects, water } = ambienceFor(biome);
  const spec = effects.rings;
  if (!spec) return [];
  const span = water.y1 - water.y0;
  return Array.from({ length: spec.count }, (_, index) => {
    const t = spread(spec.count, index);
    return {
      x: round2(water.x0 + 24 + (water.x1 - water.x0 - 48) * ((index * 0.37 + 0.2) % 1)),
      y: round2(water.y0 + span * (0.25 + 0.5 * t)),
      size: 18 + (index % 3) * 7,
      duration: round2(spec.seconds * (0.9 + (index % 3) / 8)),
      delay: round2(-spec.seconds * t),
    };
  });
}

// Surf breaking up the sand, each line a little further along than the one before it.
export function planSurf(biome) {
  const { effects, water } = ambienceFor(biome);
  const spec = effects.surf;
  if (!spec) return [];
  const span = water.y1 - water.y0;
  return Array.from({ length: spec.count }, (_, index) => {
    const t = spread(spec.count, index);
    return {
      x: round2(water.x0 + (water.x1 - water.x0) * (0.12 + 0.34 * t)),
      y: round2(water.y0 + span * (0.2 + 0.42 * t)),
      width: round2((water.x1 - water.x0) * (0.5 + 0.18 * t)),
      height: round2(span * 0.16),
      duration: round2(spec.seconds * (0.9 + (index % 2) / 6)),
      delay: round2(-spec.seconds * t),
    };
  });
}

// Moss hanging from the canopy, over the moss the painting already has, so the whole tree
// line sways rather than a strip of it. `y` is where the canopy's own moss starts.
export function planMoss(biome) {
  const spec = ambienceFor(biome).effects.moss;
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

// Fireflies over the water after dark.
export function planFireflies(biome) {
  const { effects, water } = ambienceFor(biome);
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

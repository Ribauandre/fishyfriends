// What keeps each Cast & Catch stage alive between the player's own actions: clouds in
// whatever sky the backdrop actually has, gulls over salt water and dragonflies over fresh,
// the dock lamp's glow, a sparkle layer over open water, and the occasional fish jumping in
// the distance — always a species that really lives in that biome, so the world quietly
// shows you what's in it. This is the one place in the app with ambient looping motion, on
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
  };
}

// A distant jump every so often; long enough apart that it reads as a sighting, not a loop.
export const JUMP_GAP_MS = [7000, 15000];
export const JUMP_DURATION_MS = 1300;

export function nextJumpDelay(random = Math.random) {
  return Math.round(JUMP_GAP_MS[0] + random() * (JUMP_GAP_MS[1] - JUMP_GAP_MS[0]));
}

// Where and what the next jump is: a species from the biome's own roster, out in the far
// part of the fishable water (its upper band), sized small because it's far away. Painting
// units; `visibleRight` keeps it on a narrow stage.
export function planJump(biome, random = Math.random, visibleRight = 480) {
  const { water } = ambienceFor(biome);
  const roster = BIOMES[biome]?.species || BIOMES.river.species;
  const species = roster[Math.min(roster.length - 1, Math.floor(random() * roster.length))];
  const right = Math.max(water.x0 + 30, Math.min(water.x1, visibleRight) - 16);
  const x = Math.round(water.x0 + 12 + random() * (right - water.x0 - 12));
  const y = Math.round(water.y0 + 4 + random() * Math.min(24, (water.y1 - water.y0) * 0.4));
  return { species, x, y, width: 18 + Math.round(random() * 8) };
}

// Fish shadows cruising under the bobber while you wait — two of the biome's species,
// different ones when the roster allows, so the same shape isn't circling twice. Painting units.
export function planShadows(biome, random = Math.random) {
  const { water } = ambienceFor(biome);
  const roster = BIOMES[biome]?.species || BIOMES.river.species;
  const first = Math.floor(random() * roster.length);
  const second = roster.length > 1 ? (first + 1 + Math.floor(random() * (roster.length - 1))) % roster.length : first;
  const span = water.y1 - water.y0;
  return [
    { species: roster[first], x: water.x0 + 12, y: water.y0 + span * 0.3, width: 36, duration: 11, delay: -3 },
    { species: roster[second], x: water.x0 + 58, y: water.y0 + span * 0.6, width: 30, duration: 14, delay: -9 },
  ];
}

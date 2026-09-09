// What keeps each Cast & Catch stage alive between the player's own actions: clouds in
// whatever sky the backdrop actually has, gulls over salt water and dragonflies over fresh,
// the dock lamp's glow, a sparkle layer over open water, and the occasional fish jumping in
// the distance — always a species that really lives in that biome, so the world quietly
// shows you what's in it. This is the one place in the app with ambient looping motion, on
// purpose: the stage is a game world, not UI chrome, and it's the only thing that loops.
// Positions are percentages of the 16:9 stage.
import { BIOMES } from './gameBiomes';

// Cloud "lanes" per backdrop: the top and height of the sky band clouds can drift through, and
// where along the frame the sky actually starts (the river's is boxed in by trees on the left).
// Swamp has a closed canopy, so it gets no clouds and a second dragonfly instead.
const THIN_SKY = [{ top: 1, height: 6, duration: 90, delay: -30, from: 44 }];
const OPEN_SKY = [
  { top: 2, height: 9, duration: 95, delay: -20 },
  { top: 10, height: 7, duration: 130, delay: -75 },
];
const BIG_SKY = [
  { top: 3, height: 11, duration: 100, delay: -55 },
  { top: 14, height: 8, duration: 140, delay: -10 },
];

export const AMBIENCE = {
  river: { clouds: THIN_SKY, critter: 'dragonfly', critters: 1, lamp: true, water: { left: 48, top: 34 }, jumpY: [40, 47] },
  mountainlake: { clouds: OPEN_SKY, critter: 'dragonfly', critters: 1, lamp: true, water: { left: 48, top: 34 }, jumpY: [38, 45] },
  swamp: { clouds: [], critter: 'dragonfly', critters: 2, lamp: true, water: { left: 48, top: 34 }, jumpY: [42, 50] },
  bay: { clouds: OPEN_SKY, critter: 'seagull', critters: 2, lamp: true, water: { left: 48, top: 30 }, jumpY: [36, 46] },
  shoreline: { clouds: OPEN_SKY, critter: 'seagull', critters: 2, lamp: true, water: { left: 48, top: 26 }, jumpY: [34, 44] },
  offshore: { clouds: BIG_SKY, critter: 'seagull', critters: 3, lamp: false, water: { left: 28, top: 30 }, jumpY: [36, 50] },
};

export function ambienceFor(biome) { return AMBIENCE[biome] || AMBIENCE.river; }

// A distant jump every so often; long enough apart that it reads as a sighting, not a loop.
export const JUMP_GAP_MS = [7000, 15000];
export const JUMP_DURATION_MS = 1300;

export function nextJumpDelay(random = Math.random) {
  return Math.round(JUMP_GAP_MS[0] + random() * (JUMP_GAP_MS[1] - JUMP_GAP_MS[0]));
}

// Where and what the next jump is: a species from the biome's own roster, out in the far
// water (right of the dock), sized small because it's far away.
export function planJump(biome, random = Math.random) {
  const config = ambienceFor(biome);
  const roster = BIOMES[biome]?.species || BIOMES.river.species;
  const species = roster[Math.min(roster.length - 1, Math.floor(random() * roster.length))];
  const x = Math.round(config.water.left + 8 + random() * (88 - config.water.left));
  const y = Math.round(config.jumpY[0] + random() * (config.jumpY[1] - config.jumpY[0]));
  return { species, x, y, width: 4 + Math.round(random() * 2) };
}

// Fish shadows cruising under the bobber while you wait — two of the biome's species,
// different ones when the roster allows, so the same shape isn't circling twice.
export function planShadows(biome, random = Math.random) {
  const roster = BIOMES[biome]?.species || BIOMES.river.species;
  const first = Math.floor(random() * roster.length);
  const second = roster.length > 1 ? (first + 1 + Math.floor(random() * (roster.length - 1))) % roster.length : first;
  return [
    { species: roster[first], left: 52, top: 62, duration: 11, delay: -3 },
    { species: roster[second], left: 70, top: 70, duration: 14, delay: -9 },
  ];
}

import { rollSpecies, rollSize, isNewRecord, sizeLabel, NOCTURNAL, SPECIES_SIZE, speciesWeight, rarityOf } from './gameSpecies';
import { BIOMES, biomeUnlocked, CANYON_CHARTER_COST } from './gameBiomes';
import { LURES, FLIES, FLY_ROD, luresFor, lureAllowedOn, hatchMatch, isFly } from './gameLures';

// A random source that returns the given values in order (and the last one forever after).
const sequence = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

test('night leans the roll toward the fish that feed after dark, day leans away', () => {
  // River commons: smallmouth, yellowperch, catfish, carp, chainpickerel, trout — only catfish is nocturnal.
  const commons = BIOMES.river.species.filter((species) => rarityOf(species) === 'common');
  expect(commons).toContain('catfish');
  const weightAt = (period) => commons.map((species) => speciesWeight(species, period));
  expect(Math.max(...weightAt('night'))).toBe(3);
  expect(Math.min(...weightAt('day'))).toBe(0.6);
  // First random picks the common tier; the second walks the species weights. At night a pick
  // landing past the day-weight range still falls on catfish; by day it would have moved on.
  const catfishIndex = commons.indexOf('catfish');
  const before = commons.slice(0, catfishIndex).length; // species ahead of catfish, weight 1 each
  const pick = before + 1.5; // 1.5 into catfish's slot
  const night = rollSpecies(1, BIOMES.river.species, { period: 'night', random: sequence(0, pick / (before + 3 + (commons.length - catfishIndex - 1))) });
  const day = rollSpecies(1, BIOMES.river.species, { period: 'day', random: sequence(0, pick / (before + 0.6 + (commons.length - catfishIndex - 1))) });
  expect(night.species).toBe('catfish');
  expect(day.species).not.toBe('catfish');
  expect(NOCTURNAL).toContain('swordfish');
});

test('sizes come from the species, skewed small, and read as inches', () => {
  expect(rollSize('bluegill', () => 0)).toBe(SPECIES_SIZE.bluegill[0]);
  expect(rollSize('bluegill', () => 1)).toBe(SPECIES_SIZE.bluegill[1]);
  expect(rollSize('shark', () => 0.5)).toBeLessThan((SPECIES_SIZE.shark[0] + SPECIES_SIZE.shark[1]) / 2);
  expect(rollSize('shark', () => 0.5)).toBeGreaterThan(SPECIES_SIZE.shark[0]);
  expect(sizeLabel(23.46)).toBe('23.5 in');
  expect(rollSize('mystery', () => 0)).toBe(6);
});

test('the first of a species is a record, and only a bigger one beats it', () => {
  expect(isNewRecord({}, 'walleye', 18)).toBe(true);
  expect(isNewRecord({ walleye: { size_in: 18 } }, 'walleye', 18)).toBe(false);
  expect(isNewRecord({ walleye: { size_in: '18.0' } }, 'walleye', 18.1)).toBe(true);
});

test('the canyon and the flats are the locked grounds, each dearer than the last, and each the only water for its fish', () => {
  expect(biomeUnlocked('canyon', {})).toBe(false);
  expect(biomeUnlocked('canyon', { rays_proving: { done: true } })).toBe(true);
  expect(biomeUnlocked('flats', { rays_proving: { done: true } })).toBe(false);
  expect(biomeUnlocked('flats', { rays_southern_run: { done: true } })).toBe(true);
  expect(Object.values(BIOMES).filter((biome) => biome.requiresQuest).map((biome) => biome.key)).toEqual(['canyon', 'flats']);
  expect(BIOMES.canyon.charterCost).toBe(CANYON_CHARTER_COST);
  expect(BIOMES.canyon.charterCost).toBeGreaterThan(BIOMES.offshore.charterCost);
  expect(BIOMES.flats.charterCost).toBeGreaterThan(BIOMES.canyon.charterCost);
  const watersFor = (species) => Object.values(BIOMES).filter((biome) => biome.species.includes(species)).map((biome) => biome.key);
  expect(watersFor('swordfish')).toEqual(['canyon']);
  expect(watersFor('bluemarlin')).toEqual(['canyon']);
  ['tarpon', 'permit', 'bonefish'].forEach((species) => expect(watersFor(species)).toEqual(['flats']));
  // Every species on every ground has a fixed rarity and a size range of its own.
  const all = new Set(Object.values(BIOMES).flatMap((biome) => biome.species));
  expect(all.size).toBe(46);
  all.forEach((species) => { expect(SPECIES_SIZE[species]).toBeDefined(); expect(rarityOf(species)).toBeDefined(); });
});

test('the fly box only opens on fly water, only with the fly rod, and holds the flies for that water', () => {
  expect(FLIES.map((fly) => fly.key)).toEqual(['dryfly', 'nymph', 'streamer', 'shrimpfly']);
  expect(FLY_ROD.cost).toBeGreaterThan(0);
  expect(BIOMES.river.flyWater).toBe('fresh');
  expect(BIOMES.mountainlake.flyWater).toBe('fresh');
  expect(BIOMES.flats.flyWater).toBe('salt');
  expect(BIOMES.bay.flyWater).toBeUndefined();
  expect(luresFor('river', { fly_rod: false }).map((lure) => lure.key)).toEqual(['livebait', 'jerkbait', 'crankbait']);
  expect(luresFor('river', { fly_rod: true }).map((lure) => lure.key)).toEqual(['livebait', 'jerkbait', 'crankbait', 'dryfly', 'nymph', 'streamer']);
  // The salt box: the shrimp fly on the flats, and none of the trout flies.
  expect(luresFor('flats', { fly_rod: true }).map((lure) => lure.key)).toEqual(['livebait', 'jerkbait', 'crankbait', 'shrimpfly']);
  expect(luresFor('bay', { fly_rod: true }).map((lure) => lure.key)).toEqual(['livebait', 'jerkbait', 'crankbait']);
  expect(lureAllowedOn('dryfly', 'bay')).toBe(false);
  expect(lureAllowedOn('dryfly', 'flats')).toBe(false);
  expect(lureAllowedOn('shrimpfly', 'river')).toBe(false);
  expect(lureAllowedOn('shrimpfly', 'flats')).toBe(true);
  expect(lureAllowedOn('dryfly', 'mountainlake')).toBe(true);
  expect(lureAllowedOn('crankbait', 'bay')).toBe(true);
  expect(isFly('nymph')).toBe(true);
  expect(isFly('jerkbait')).toBe(false);
});

test('each fly matches the hatch at its own hours, and the streamer is tied for the big browns', () => {
  expect(hatchMatch('dryfly', 'dusk')).toBe(true);
  expect(hatchMatch('dryfly', 'day')).toBe(false);
  expect(hatchMatch('nymph', 'day')).toBe(true);
  expect(hatchMatch('streamer', 'night')).toBe(true);
  expect(hatchMatch('streamer', 'dawn')).toBe(false);
  expect(hatchMatch('livebait', 'day')).toBe(false);
  expect(LURES.streamer.favors).toEqual(['browntrout', 'laketrout']);
});

test('a lure\'s favoured species roll heavier within their tier', () => {
  // Mountain lake uncommons: brooktrout, rainbowtrout, browntrout — weight 1 each, browntrout x2.5 on a streamer.
  const uncommons = BIOMES.mountainlake.species.filter((species) => rarityOf(species) === 'uncommon');
  expect(uncommons).toEqual(['brooktrout', 'rainbowtrout', 'browntrout']);
  const tierPick = 0.6; // 54 of 90: the uncommon tier at bait level 1 (common 46 / uncommon 28 / rare 16)
  const plain = rollSpecies(1, BIOMES.mountainlake.species, { random: sequence(tierPick, 2.2 / 3) });
  const favored = rollSpecies(1, BIOMES.mountainlake.species, { random: sequence(tierPick, 2.2 / 4.5), favor: ['browntrout'] });
  expect(plain.rarity).toBe('uncommon');
  expect(favored.rarity).toBe('uncommon');
  expect(plain.species).toBe('browntrout');
  expect(favored.species).toBe('browntrout');
  // Same 2.2 into the pool, but with the extra weight on the first fish the pick lands on it instead.
  const shifted = rollSpecies(1, BIOMES.mountainlake.species, { random: sequence(tierPick, 2.2 / 4.5), favor: ['brooktrout'] });
  expect(shifted.species).toBe('brooktrout');
});

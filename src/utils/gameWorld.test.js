import { rollSpecies, rollSize, isNewRecord, sizeLabel, NOCTURNAL, SPECIES_SIZE, speciesWeight, rarityOf } from './gameSpecies';
import { BIOMES, biomeUnlocked, CANYON_CHARTER_COST } from './gameBiomes';

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

test('the canyon is the only locked ground, costs more, and is the only swordfish water', () => {
  expect(biomeUnlocked('canyon', {})).toBe(false);
  expect(biomeUnlocked('canyon', { rays_proving: { done: true } })).toBe(true);
  expect(BIOMES.canyon.charterCost).toBe(CANYON_CHARTER_COST);
  expect(BIOMES.canyon.charterCost).toBeGreaterThan(BIOMES.offshore.charterCost);
  const swordfishWaters = Object.values(BIOMES).filter((biome) => biome.species.includes('swordfish')).map((biome) => biome.key);
  expect(swordfishWaters).toEqual(['canyon']);
});

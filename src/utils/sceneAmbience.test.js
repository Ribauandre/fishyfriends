import { ambienceFor, planCurrent, planRings, planSurf, planMoss, planFireflies } from './sceneAmbience';
import { BIOMES } from './gameBiomes';

test('every biome has an ambience plan, and unknown ones fall back to the river', () => {
  Object.keys(BIOMES).forEach((biome) => expect(ambienceFor(biome)).toBeTruthy());
  expect(ambienceFor('canyon')).not.toBe(ambienceFor('river'));
  expect(ambienceFor('canyon').critter).toBe('seagull');
  expect(ambienceFor('nowhere')).toEqual(ambienceFor('river'));
});



test('no two grounds move the same way, and every effect is laid out on its own water', () => {
  const named = (biome) => Object.keys(ambienceFor(biome).effects).filter((key) => key !== 'sparkle').sort().join(',');
  const shapes = Object.keys(BIOMES).map(named);
  // The river runs, the lake rings and mists, the swamp hangs and blinks, the beach breaks,
  // the bay swells — a ground's set is its own, bar the two charter grounds that share water.
  expect(new Set(shapes).size).toBeGreaterThanOrEqual(5);
  expect(named('river')).toBe('current');
  expect(named('mountainlake')).toBe('mist,rings');
  expect(named('swamp')).toBe('fireflies,moss,rings');
  expect(named('shoreline')).toBe('surf');
  expect(named('bay')).toBe('swell');

  Object.keys(BIOMES).forEach((biome) => {
    const { water, effects } = ambienceFor(biome);
    expect(effects.sparkle).toBeGreaterThan(0);
    [...planCurrent(biome), ...planRings(biome), ...planSurf(biome)].forEach((piece) => {
      expect(piece.y).toBeGreaterThanOrEqual(water.y0 - 1);
      expect(piece.y).toBeLessThanOrEqual(water.y1);
      expect(piece.duration).toBeGreaterThan(0);
      // Started part-way through, so nothing waits for its first pass.
      expect(piece.delay).toBeLessThanOrEqual(0);
    });
    // Everything is a still ground's business only where its plan asks for it.
    if (!effects.current) expect(planCurrent(biome)).toEqual([]);
    if (!effects.moss) expect(planMoss(biome)).toEqual([]);
    if (!effects.fireflies) expect(planFireflies(biome)).toEqual([]);
  });
  // The swamp's moss hangs from the top of the painting, across it.
  const moss = planMoss('swamp');
  expect(moss.length).toBe(7);
  expect(Math.min(...moss.map((m) => m.x))).toBeGreaterThan(0);
  expect(Math.max(...moss.map((m) => m.x))).toBeLessThan(480);
  // It hangs from the canopy, over the moss the painting already has.
  moss.forEach((strand) => { expect(strand.y).toBeGreaterThan(0); expect(strand.y + strand.length).toBeLessThan(ambienceFor('swamp').water.y0); });
  expect(planFireflies('swamp').length).toBe(8);
});

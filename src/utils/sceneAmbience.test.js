import { planJump, planShadows, nextJumpDelay, jumpGapFor, ambienceFor, planCurrent, planRings, planSurf, planMoss, planFireflies } from './sceneAmbience';
import { BIOMES } from './gameBiomes';

test('every biome has an ambience plan, and unknown ones fall back to the river', () => {
  Object.keys(BIOMES).forEach((biome) => expect(ambienceFor(biome)).toBeTruthy());
  expect(ambienceFor('canyon')).not.toBe(ambienceFor('river'));
  expect(ambienceFor('canyon').critter).toBe('seagull');
  expect(ambienceFor('nowhere')).toEqual(ambienceFor('river'));
});

test('a jump is always one of the biome\'s own species, out in the open water', () => {
  Object.keys(BIOMES).forEach((biome) => {
    for (const roll of [0, 0.25, 0.5, 0.99]) {
      const jump = planJump(biome, () => roll);
      expect(BIOMES[biome].species).toContain(jump.species);
      const { water } = ambienceFor(biome);
      expect(jump.x).toBeGreaterThanOrEqual(water.x0);
      expect(jump.x).toBeLessThanOrEqual(water.x1);
      expect(jump.y).toBeGreaterThanOrEqual(water.y0);
      expect(jump.y).toBeLessThanOrEqual(water.y1);
      // A narrow stage keeps the jump on screen.
      expect(planJump(biome, () => roll, 338).x).toBeLessThanOrEqual(338 - 16);
    }
  });
});

test('shadows pick two different species when the roster allows', () => {
  const shadows = planShadows('river', () => 0);
  expect(shadows.length).toBe(2);
  expect(shadows[0].species).not.toBe(shadows[1].species);
  shadows.forEach((shadow) => expect(BIOMES.river.species).toContain(shadow.species));
  // In the painted water, past the dock's end.
  shadows.forEach((shadow) => { expect(shadow.x).toBeGreaterThanOrEqual(246); expect(shadow.y).toBeGreaterThanOrEqual(150); });
});

test('jumps are spaced out inside the ground\'s own gap, and a running river shows more of them', () => {
  Object.keys(BIOMES).forEach((biome) => {
    const [from, to] = jumpGapFor(biome);
    expect(nextJumpDelay(biome, () => 0)).toBe(from);
    expect(nextJumpDelay(biome, () => 1)).toBe(to);
  });
  expect(jumpGapFor('river')[0]).toBeLessThan(jumpGapFor('swamp')[0]);
});

test('no two grounds move the same way, and every effect is laid out on its own water', () => {
  const named = (biome) => Object.keys(ambienceFor(biome).effects).filter((key) => key !== 'jump' && key !== 'sparkle').sort().join(',');
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

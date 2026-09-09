import { planJump, planShadows, nextJumpDelay, JUMP_GAP_MS, ambienceFor } from './sceneAmbience';
import { BIOMES } from './gameBiomes';

test('every biome has an ambience plan, and unknown ones fall back to the river', () => {
  Object.keys(BIOMES).forEach((biome) => expect(ambienceFor(biome)).toBeTruthy());
  expect(ambienceFor('canyon')).not.toBe(ambienceFor('river'));
  expect(ambienceFor('canyon').critter).toBe('seagull');
  expect(ambienceFor('nowhere')).toBe(ambienceFor('river'));
});

test('a jump is always one of the biome\'s own species, out in the open water', () => {
  Object.keys(BIOMES).forEach((biome) => {
    for (const roll of [0, 0.25, 0.5, 0.99]) {
      const jump = planJump(biome, () => roll);
      expect(BIOMES[biome].species).toContain(jump.species);
      expect(jump.x).toBeGreaterThanOrEqual(ambienceFor(biome).water.left);
      expect(jump.x).toBeLessThanOrEqual(96);
    }
  });
});

test('shadows pick two different species when the roster allows', () => {
  const shadows = planShadows('river', () => 0);
  expect(shadows.length).toBe(2);
  expect(shadows[0].species).not.toBe(shadows[1].species);
  shadows.forEach((shadow) => expect(BIOMES.river.species).toContain(shadow.species));
});

test('jumps are spaced out inside the configured gap', () => {
  expect(nextJumpDelay(() => 0)).toBe(JUMP_GAP_MS[0]);
  expect(nextJumpDelay(() => 1)).toBe(JUMP_GAP_MS[1]);
});

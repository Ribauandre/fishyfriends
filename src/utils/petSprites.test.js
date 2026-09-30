import path from 'node:path';
import { PET_SPRITES, PET_H, stripUnits, petSprite } from './petSprites';
import { ART_PX } from './sceneLayout';
import pets from '../assets/pets/pets.json';
import { readPng, measure, mainColour, saturation } from '../test-utils/pixelArt';

// The pets are checked off the files themselves, like the angler's strips (anglerSprites.test.js):
// jsdom has no canvas, so nothing at runtime would notice a strip whose box, pixel size or colours
// stopped agreeing with this module.
const PETS = path.join(__dirname, '..', 'assets', 'pets');
const strip = (name) => readPng(path.join(PETS, `${name}.png`));
const frameOf = (img, meta, i) => ({ x0: i * meta.w, y0: 0, w: meta.w, h: meta.h });

const STRIPS = ['dog', 'dog_cheer', 'cat', 'cat_cheer'];

describe.each(STRIPS)('%s', (name) => {
  const meta = pets[name];
  const img = strip(name);

  test('the strip on disk is exactly frames x the box pets.json records, one file pixel to one art pixel', () => {
    expect(img.width).toBe(meta.frames * meta.w);
    expect(img.height).toBe(meta.h);
    expect(meta.feetY).toBe(meta.h);
    expect(meta.feetX).toBeGreaterThan(0);
    expect(meta.feetX).toBeLessThan(meta.w);
  });

  test('it is drawn at its rows x ART_PX, so its pixel is the world\'s art pixel', () => {
    expect(stripUnits(name)).toBeCloseTo(meta.h * ART_PX, 2);
  });

  test('flat pixel art: hard alpha, a small palette, the world\'s keyline on every edge and no other near-black', () => {
    const stats = measure(img);
    expect(stats.soft).toBe(0);
    expect(stats.colors.size).toBeLessThanOrEqual(12);
    expect(stats.colors.has('130f0c')).toBe(true);
    expect(stats.strayDark).toBe(0);
    for (let i = 0; i < meta.frames; i += 1) expect(measure(img, frameOf(img, meta, i)).edgeKeyShare).toBe(1);
  });
});

test('both moods of a pet draw at the same pixel size (the cheer used to be a non-square pixel a third taller)', () => {
  Object.values(PET_SPRITES).forEach(({ idle, cheer }) => {
    expect(idle.unitH / idle.h).toBeCloseTo(ART_PX, 5);
    expect(cheer.unitH / cheer.h).toBeCloseTo(ART_PX, 5);
  });
});

test('the dog sits about a third of the angler\'s 69 rows, and the cat is a little smaller than the dog', () => {
  expect(pets.dog.h).toBeGreaterThanOrEqual(22);
  expect(pets.dog.h).toBeLessThanOrEqual(23);
  expect(PET_H).toBeCloseTo(pets.dog.h * ART_PX, 2);
  expect(pets.cat.h).toBeLessThan(pets.dog.h);
  expect(pets.cat.h).toBeGreaterThanOrEqual(18);
});

test('a pet keeps its coat when it cheers (the dog\'s cheer was drawn a redder brown)', () => {
  expect(mainColour(measure(strip('dog_cheer')))).toBe(mainColour(measure(strip('dog'))));
  const catIdle = new Set(measure(strip('cat')).colors.keys());
  measure(strip('cat_cheer')).colors.forEach((n, c) => expect(catIdle.has(c)).toBe(true));
});

test('the cat is brought down from near-pure orange toward the angler\'s and the painting\'s saturation', () => {
  expect(saturation(strip('cat'))).toBeLessThan(0.75);
  expect(saturation(strip('cat_cheer'))).toBeLessThan(0.75);
});

// The flick is the one move on the deck the player did not cause; it has to move the tail and not
// the animal. The old slicer hung each frame from the middle of a box the swept tail widened, and
// the whole cat hopped four art pixels twice a cycle.
test.each(['dog', 'cat'])('the %s\'s idle frames are registered on its body', (name) => {
  const meta = pets[name];
  const img = strip(name);
  const on = (f, x, y) => x >= 0 && x < meta.w && img.data[(y * img.width + f * meta.w + x) * 4 + 3] > 0;
  for (let f = 1; f < meta.frames; f += 1) {
    let both = 0, first = 0;
    for (let y = 0; y < meta.h; y += 1) for (let x = 0; x < meta.w; x += 1) {
      if (on(0, x, y)) { first += 1; if (on(f, x, y)) both += 1; }
    }
    expect(both / first).toBeGreaterThan(0.85);
  }
});

test('every pet animation runs on the world\'s clock: whole multiples of 125 ms a frame', () => {
  Object.values(PET_SPRITES).forEach(({ idle, cheer }) => {
    // pet-idle (App.css) shows the flick in two windows of 4% of the cycle, after holding 80%.
    expect((idle.cycleMs * 0.04) % 125).toBe(0);
    expect((idle.cycleMs * 0.8) % 125).toBe(0);
    expect((cheer.durationMs / cheer.play) % 125).toBe(0);
    expect(cheer.play).toBeLessThanOrEqual(cheer.frames);
  });
});

test('petSprite names a pet or nothing', () => {
  expect(petSprite('pet_dog')).toBe(PET_SPRITES.pet_dog);
  expect(petSprite('pet_none')).toBeNull();
});

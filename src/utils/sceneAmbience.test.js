import { sceneKeyFor, ambienceFor, effectNames, planMovers, planFoam, planRings, planWash, planMist, planMoss, planGrass, planBubbles, planFireflies, clipFor } from './sceneAmbience';
import { BIOMES } from './gameBiomes';
import { PAINT_W, PAINT_H } from './sceneLayout';

const GROUNDS = Object.keys(BIOMES).map((biome) => [biome, null]).concat([['mountainlake', 'winter']]);

test('every biome has an ambience plan, and unknown ones fall back to the river', () => {
  Object.keys(BIOMES).forEach((biome) => expect(ambienceFor(biome)).toBeTruthy());
  expect(ambienceFor('canyon')).not.toBe(ambienceFor('river'));
  expect(ambienceFor('canyon').critter).toBe('seagull');
  expect(ambienceFor('nowhere')).toEqual(ambienceFor('river'));
});

test('no two grounds move the same way', () => {
  const named = (biome, season) => effectNames(biome, season).join(',');
  // Each ground's water is its own: what runs, breaks, rings, rolls, lies or falls on it.
  expect(named('river')).toBe('current,foam,leaves');
  expect(named('mountainlake')).toBe('glass,mist,rings');
  expect(named('swamp')).toBe('bubbles,fireflies,moss,rings');
  expect(named('bay')).toBe('foam,waves');
  expect(named('shoreline')).toBe('wash,waves');
  expect(named('offshore')).toBe('caps,foam');
  expect(named('canyon')).toBe('gleam,waves');
  expect(named('flats')).toBe('caustics,rings');
  expect(named('pier')).toBe('caps,foam,wash');
  expect(named('creek')).toBe('grass,rings,waves');
  expect(named('baja')).toBe('foam,wash,waves');
  // The frozen lake: mist over the lead and snow on all of it, and no dragonflies in winter.
  expect(named('mountainlake', 'winter')).toBe('mist,snow');
  expect(new Set(GROUNDS.map(([biome, season]) => named(biome, season))).size).toBe(GROUNDS.length);
  expect(ambienceFor('mountainlake', 'winter').dragonflies).toEqual([]);
  expect(ambienceFor('mountainlake', 'summer').dragonflies.length).toBeGreaterThan(0);
  expect(planRings('mountainlake', 'winter')).toEqual([]);
  expect(sceneKeyFor('mountainlake', 'winter')).toBe('mountainlake:winter');
  expect(sceneKeyFor('mountainlake', 'summer')).toBe('mountainlake');
  expect(sceneKeyFor('river', 'winter')).toBe('river');
});

test('everything is laid out on the painting, started part-way through its loop', () => {
  GROUNDS.forEach(([biome, season]) => {
    const { effects } = ambienceFor(biome, season);
    expect(effects.glitter).toBeGreaterThan(0);
    const pieces = [
      ...planMovers(biome, season), ...planFoam(biome, season), ...planRings(biome, season), ...planWash(biome, season),
      ...planMist(biome, season), ...planMoss(biome, season), ...planGrass(biome, season), ...planBubbles(biome, season), ...planFireflies(biome, season),
    ];
    pieces.forEach((piece) => {
      expect(piece.x).toBeGreaterThanOrEqual(-40);
      expect(piece.x).toBeLessThanOrEqual(PAINT_W);
      expect(piece.y).toBeGreaterThanOrEqual(0);
      expect(piece.y).toBeLessThanOrEqual(PAINT_H);
      expect(piece.duration).toBeGreaterThan(0);
      // Started part-way through, so nothing waits for its first pass.
      expect(piece.delay).toBeLessThanOrEqual(0);
    });
    planMovers(biome, season).forEach((piece) => {
      expect(piece.travel).toBeGreaterThan(0);
      expect(piece.w).toBeGreaterThan(0);
      expect(piece.h).toBeGreaterThan(0);
      expect(piece.opacity).toBeGreaterThan(0);
      expect(piece.opacity).toBeLessThanOrEqual(1);
    });
    // A ground only has what its plan asks for.
    if (!effects.foam) expect(planFoam(biome, season)).toEqual([]);
    if (!effects.wash) expect(planWash(biome, season)).toEqual([]);
    if (!effects.moss) expect(planMoss(biome, season)).toEqual([]);
    if (!effects.grass) expect(planGrass(biome, season)).toEqual([]);
    if (!effects.bubbles) expect(planBubbles(biome, season)).toEqual([]);
    if (!effects.fireflies) expect(planFireflies(biome, season)).toEqual([]);
    if (!effects.mist) expect(planMist(biome, season)).toEqual([]);
  });
});

test('the river runs down and left out of the narrows, with a leaf on it, and breaks white at the rocks', () => {
  const movers = planMovers('river');
  const current = movers.filter((piece) => piece.kind === 'current');
  expect(current.length).toBe(7);
  // A streak lies along its travel; every one heads down and to the left (90 = down, 180 = left).
  current.forEach((piece) => { expect(piece.across).toBeUndefined(); expect(piece.heading).toBeGreaterThan(120); expect(piece.heading).toBeLessThan(180); });
  expect(movers.filter((piece) => piece.kind === 'leaf').length).toBe(2);
  expect(planFoam('river').length).toBe(7);
  planFoam('river').forEach((spot) => expect(spot.size).toBeGreaterThan(0));
});

test('rollers and whitecaps lie across their travel and come toward the viewer', () => {
  ['bay', 'shoreline', 'offshore', 'canyon', 'pier', 'creek', 'baja'].forEach((biome) => {
    const crests = planMovers(biome).filter((piece) => piece.kind === 'wave' || piece.kind === 'cap');
    expect(crests.length).toBeGreaterThan(0);
    crests.forEach((piece) => { expect(piece.across).toBe(true); expect(piece.heading).toBeGreaterThanOrEqual(90); expect(piece.heading).toBeLessThan(100); });
  });
  // The near rows are longer than the far ones (perspective), and Baja's swell starts right
  // of the skiff's hull rather than over the bow.
  const baja = planMovers('baja');
  expect(Math.max(...baja.map((piece) => piece.w))).toBeGreaterThan(Math.min(...baja.map((piece) => piece.w)));
  baja.forEach((piece) => expect(piece.x).toBeGreaterThanOrEqual(228));
  // The creek's ripples stay in the channel: narrow at the bend, wider below.
  planMovers('creek').forEach((piece) => { expect(piece.x).toBeGreaterThanOrEqual(200); expect(piece.x + piece.w).toBeLessThanOrEqual(345); });
});

test('the surf follows the line the sand runs, in overlapping pieces', () => {
  const wash = planWash('shoreline');
  expect(wash.length).toBe(3);
  // The wet line rises from the bottom left to the point on the right, so the bar tilts up.
  wash.forEach((piece) => { expect(piece.angle).toBeLessThan(0); expect(piece.angle).toBeGreaterThan(-15); expect(piece.reach).toBe(16); expect(piece.length).toBeGreaterThan(0); });
  expect(wash[0].x).toBe(0);
  expect(wash[0].y).toBe(238);
  // The second piece starts before the first ends.
  expect(wash[1].x).toBeLessThan(wash[0].x + wash[0].length * Math.cos((wash[0].angle * Math.PI) / 180));
  // Baja's beach lies above its wet line, so its line runs right to left and the bar points
  // the other way.
  planWash('baja').forEach((piece) => expect(Math.abs(piece.angle)).toBeGreaterThan(90));
  // The pier's surf is on the beach in the corner, below the water box.
  planWash('pier').forEach((piece) => expect(piece.y).toBeGreaterThan(190));
});

test('the swamp hangs moss from the canopy, bubbles from the mud, and lights up after dark', () => {
  const moss = planMoss('swamp');
  expect(moss.length).toBe(9);
  expect(Math.min(...moss.map((m) => m.x))).toBeGreaterThan(0);
  expect(Math.max(...moss.map((m) => m.x))).toBeLessThan(PAINT_W);
  moss.forEach((strand) => { expect(strand.y).toBeGreaterThan(0); expect(strand.y + strand.length).toBeLessThan(ambienceFor('swamp').water.y0); });
  expect(planBubbles('swamp').length).toBe(5);
  expect(planFireflies('swamp').length).toBe(10);
  expect(planFireflies('river')).toEqual([]);
});

test('the lake mists along the far shore, the creek grows grass at the bank, and a clip is a polygon of the box', () => {
  const mist = planMist('mountainlake');
  expect(mist.length).toBe(2);
  mist.forEach((band) => { expect(band.w).toBeGreaterThan(100); expect(band.y).toBeLessThan(ambienceFor('mountainlake').water.y0); });
  expect(planMist('mountainlake', 'winter').length).toBe(2);
  const grass = planGrass('creek');
  expect(grass.length).toBe(12);
  grass.forEach((blade) => expect(blade.height).toBeGreaterThan(0));
  expect(clipFor([[240, 60], [480, 270], [360, 165]], { x0: 240, y0: 60, x1: 480, y1: 270 })).toBe('polygon(0% 0%, 100% 100%, 50% 50%)');
  expect(clipFor(undefined, { x0: 0, y0: 0, x1: 1, y1: 1 })).toBeUndefined();
});

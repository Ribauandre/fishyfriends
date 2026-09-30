import {
  sceneKeyFor, ambienceFor, effectNames, paletteFor, planAmbience, planMovers, planCaps, planFoam, planRings, planWash, planMist,
  planMoss, planGrass, planBubbles, planFireflies, planGlints, planStars, planGleam, planTiles, planClouds, planGulls, planDragonflies,
  svgStrip, maskRects, maskUrl, polygonRuns, cloudTables, linePixels, ellipsePixels, inside, CLOUD_ART_TONES, RHYTHMS, TICK_MS, MAX_STEPS_PER_S,
  ART_COLS, ART_ROWS, WASH_LEVELS, SWAY, skyShare, MIN_SKY_SHARE, holesUrl,
} from './sceneAmbience';
import { BIOMES } from './gameBiomes';
import { ART_PX } from './sceneLayout';
import { AMBIENT_SPRITES } from './gameProps';

const GROUNDS = Object.keys(BIOMES).map((biome) => [biome, null]).concat([['mountainlake', 'winter']]);
const PERIODS = ['day', 'dawn', 'dusk', 'night'];
const px = (units) => Math.round(units / ART_PX);
const onTick = (seconds) => Math.abs(Math.round(seconds * 1000) % TICK_MS) === 0 && Math.abs(seconds * 1000 - Math.round(seconds * 1000)) < 1e-6;
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const flipPieces = (plan) => [...plan.caps, ...plan.foam, ...plan.rings, ...plan.bubbles, ...plan.moss, ...plan.grass, ...plan.glints, ...plan.stars, ...plan.gleam, ...plan.fireflies];
const everyPiece = (plan) => [...flipPieces(plan), ...plan.movers, ...plan.wash, ...plan.mist, ...plan.clouds, ...plan.gulls, ...plan.dragonflies];

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

test('every piece is whole art pixels on the painting, on the stage clock, started part-way through its loop', () => {
  GROUNDS.forEach(([biome, season]) => PERIODS.forEach((period) => {
    const plan = planAmbience(biome, season, period);
    everyPiece(plan).forEach((piece) => {
      [piece.x, piece.y, piece.w, piece.h].forEach((value) => expect(Number.isInteger(value)).toBe(true));
      expect(piece.w).toBeGreaterThan(0);
      expect(piece.h).toBeGreaterThan(0);
      expect(piece.x + piece.w).toBeGreaterThanOrEqual(0);
      expect(piece.x).toBeLessThan(ART_COLS);
      expect(piece.y + piece.h).toBeGreaterThan(0);
      expect(piece.y).toBeLessThan(ART_ROWS);
      expect(piece.duration).toBeGreaterThan(0);
      expect(onTick(piece.duration)).toBe(true);
      // Started part-way through, so nothing waits for its first pass — and on the clock too.
      expect(piece.delay).toBeLessThanOrEqual(0);
      expect(onTick(piece.delay)).toBe(true);
      expect(piece.opacity).toBeGreaterThan(0);
      expect(piece.opacity).toBeLessThanOrEqual(1);
    });
    // A flipbook's cells are each held a whole number of ticks, and at most eight a second.
    flipPieces(plan).forEach((piece) => {
      const cellMs = (piece.duration * 1000 * RHYTHMS[piece.rhythm]) / piece.shape.cells.length;
      expect(Math.abs(cellMs / TICK_MS - Math.round(cellMs / TICK_MS))).toBeLessThan(1e-6);
      expect(cellMs).toBeGreaterThanOrEqual(TICK_MS);
      expect(piece.shape.w).toBe(piece.w);
      expect(piece.shape.h).toBe(piece.h);
    });
  }));
});

test('every shape is whole pixels inside its cells, in tones the ground\'s palette has, day and night', () => {
  GROUNDS.forEach(([biome, season]) => ['day', 'night'].forEach((period) => {
    const plan = planAmbience(biome, season, period);
    const shapes = [...flipPieces(plan), ...plan.movers, ...plan.wash, ...plan.mist].map((piece) => piece.shape);
    if (plan.tiles) plan.tiles.layers.forEach((layer) => shapes.push(layer.tile));
    shapes.forEach((shape) => shape.cells.forEach((cell) => cell.forEach(([x, y, tone]) => {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(shape.w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(shape.h);
      expect(plan.palette[tone]).toMatch(/^#[0-9a-f]{6}$/);
    })));
  }));
});

test('the colours are the painting\'s own: never pure white, and after dark the moonlit ones at reduced strength', () => {
  GROUNDS.forEach(([biome, season]) => {
    const day = paletteFor(biome, season, 'day');
    const night = paletteFor(biome, season, 'night');
    expect(day.strength).toBe(1);
    expect(night.strength).toBeLessThan(1);
    ['foam', 'hi', 'mid', 'shade'].forEach((tone) => {
      expect(day[tone]).not.toMatch(/^#f{6}$/i);
      // Nothing after dark is brighter than the moon path the night painting paints.
      expect(lum(night[tone])).toBeLessThan(140);
    });
    // The night water is darker than the day's, except where the day painting is dusk already.
    if (biome !== 'canyon') expect(lum(night.foam)).toBeLessThan(lum(day.foam));
    expect(paletteFor(biome, season, 'dusk')).toEqual(day);
    const config = ambienceFor(biome, season);
    if (config.cloudTones) config.cloudTones.forEach((tone) => expect(tone).not.toMatch(/^#f{6}$/i));
  });
});

test('things that travel run along the painting\'s rows a pixel a step on each axis, no faster than the clock', () => {
  GROUNDS.forEach(([biome, season]) => {
    const movers = planMovers(biome, season);
    movers.forEach((piece) => {
      expect(Number.isInteger(piece.tx) && Number.isInteger(piece.ty)).toBe(true);
      expect(Math.abs(piece.tx) + Math.abs(piece.ty)).toBeGreaterThan(0);
      expect(Math.max(Math.abs(piece.tx), Math.abs(piece.ty)) / piece.duration).toBeLessThanOrEqual(MAX_STEPS_PER_S);
      // Two-second multiples, so the fade's sixteenths fall on the clock.
      expect(Math.round(piece.duration * 1000) % 2000).toBe(0);
    });
    // No ground's pieces of one kind all share a period (the old (index * 5) % 5 did that).
    ['current', 'roller', 'glass'].forEach((kind) => {
      const periods = movers.filter((piece) => piece.kind === kind).map((piece) => piece.duration);
      if (periods.length >= 3) expect(new Set(periods).size).toBeGreaterThan(1);
    });
    [planCaps, planMoss, planFoam, planGrass].forEach((planner) => {
      const periods = planner(biome, season).map((piece) => piece.duration);
      if (periods.length >= 3) expect(new Set(periods).size).toBeGreaterThan(1);
    });
  });
});

test('the river runs down and left out of the narrows, with a leaf on it, and breaks white at the rocks', () => {
  const movers = planMovers('river');
  const current = movers.filter((piece) => piece.kind === 'current');
  expect(current.length).toBe(14);
  // A streak is a dash one pixel tall, its bright head leading; every one heads down and left.
  current.forEach((piece) => { expect(piece.h).toBe(1); expect(piece.tx).toBeLessThan(0); expect(piece.ty).toBeGreaterThan(0); expect(piece.shape.cells[0][0][2]).toBe('foam'); });
  const leaves = movers.filter((piece) => piece.kind === 'leaf');
  expect(leaves.length).toBe(2);
  leaves.forEach((piece) => { expect(piece.shape.cells.length).toBe(2); expect(piece.flipSeconds).toBeGreaterThan(0); });
  expect(planFoam('river').length).toBe(7);
  // Foam steps through three shapes, and the fourth cell is the second again.
  planFoam('river').forEach((spot) => { expect(spot.shape.cells.length).toBe(4); expect(spot.shape.cells[3]).toEqual(spot.shape.cells[1]); });
});

test('rollers come toward the viewer as broken crests; whitecaps break and dissolve where they are', () => {
  ['bay', 'shoreline', 'canyon', 'creek', 'baja'].forEach((biome) => {
    const rollers = planMovers(biome).filter((piece) => piece.kind === 'roller');
    expect(rollers.length).toBeGreaterThan(0);
    rollers.forEach((piece) => { expect(piece.ty).toBeGreaterThan(0); expect(Math.abs(piece.tx)).toBeLessThan(piece.ty); });
  });
  // The near rows are longer than the far ones (perspective), and Baja's swell starts right
  // of the skiff's hull rather than over the bow.
  const baja = planMovers('baja');
  expect(Math.max(...baja.map((piece) => piece.w))).toBeGreaterThan(Math.min(...baja.map((piece) => piece.w)));
  baja.forEach((piece) => expect(piece.x).toBeGreaterThanOrEqual(px(228)));
  // The creek's ripples stay in the channel: narrow at the bend, wider below.
  planMovers('creek').forEach((piece) => { expect(piece.x).toBeGreaterThanOrEqual(px(200)); expect(piece.x + piece.w).toBeLessThanOrEqual(px(345)); });
  ['offshore', 'pier'].forEach((biome) => {
    const caps = planCaps(biome);
    expect(caps.length).toBeGreaterThan(0);
    // Forming, cresting, breaking, dissolving, and a blank cell to rest on.
    caps.forEach((cap) => { expect(cap.rhythm).toBe('50'); expect(cap.shape.cells[cap.shape.cells.length - 1]).toEqual([]); });
  });
  expect(planCaps('bay')).toEqual([]);
});

test('the surf runs along the wet line the painting draws, up the beach a step at a time and back', () => {
  const wash = planWash('shoreline');
  expect(wash.length).toBe(2);
  wash.forEach((piece) => { expect(piece.w).toBe(ART_COLS); expect(Math.round(piece.duration * 1000) % 4000).toBe(0); expect(piece.step).toBeGreaterThan(0); });
  expect(wash[0].levels).toBe('long');
  // The lip is on the painted foam's edge: at the left edge of the painting it is at y 250.
  const lip = wash[0].shape.cells[0].filter(([x, , tone]) => x + wash[0].x === 0 && tone === 'foam').map(([, y]) => y + wash[0].y);
  expect(lip).toContain(px(250));
  // Baja's beach lies above its wet line, so its surf runs up (negative) — and on the beach
  // under the headland, not out on the water it used to sit 6-12 units off.
  planWash('baja').forEach((piece) => {
    expect(piece.step).toBeLessThan(0);
    expect(piece.levels).toBe('short');
    piece.shape.cells[0].forEach(([, y]) => { expect(y + piece.y).toBeGreaterThanOrEqual(px(62)); expect(y + piece.y).toBeLessThanOrEqual(px(80)); });
  });
  // The pier's surf is on the beach in the corner, below the water box.
  planWash('pier').forEach((piece) => expect(piece.y + piece.h).toBeGreaterThan(px(205)));
  expect(WASH_LEVELS.long).toBe(6);
  expect(planWash('bay')).toEqual([]);
});

test('the swamp hangs moss where its canopy grows it, bubbles from the mud, and lights up after dark', () => {
  const moss = planMoss('swamp');
  expect(moss.length).toBe(9);
  const water = ambienceFor('swamp').water;
  moss.forEach((clump) => {
    // Under the canopy: never in the open sky between the trees (x 235-300).
    const centre = (clump.x + clump.w / 2) * ART_PX;
    expect(centre < 235 || centre > 300).toBe(true);
    expect((clump.y + clump.h) * ART_PX).toBeLessThan(water.y0);
    // It sways: right a pixel, two, back, and the other way, the fixed end never moving.
    expect(clump.shape.cells.length).toBe(SWAY.length);
    const top = (cell) => cell.filter(([, y]) => y === 0).map(([x]) => x).sort();
    clump.shape.cells.forEach((cell) => expect(top(cell)).toEqual(top(clump.shape.cells[0])));
  });
  expect(planBubbles('swamp').length).toBe(5);
  expect(planFireflies('swamp', null, 'night').length).toBe(10);
  expect(planFireflies('swamp', null, 'day')).toEqual([]);
  expect(planFireflies('river', null, 'night')).toEqual([]);
});

test('the lake mists along the far shore in streaks, the creek grows grass where it grows, and rings open in steps', () => {
  const mist = planMist('mountainlake');
  expect(mist.length).toBe(2);
  mist.forEach((band) => {
    expect(band.w).toBeGreaterThan(px(100));
    expect(band.y * ART_PX).toBeLessThan(ambienceFor('mountainlake').water.y0);
    // Streaks one pixel tall, never a checkerboard: most of a row's pixels sit next to another.
    const cell = band.shape.cells[0];
    const set = new Set(cell.map(([x, y]) => `${x},${y}`));
    const joined = cell.filter(([x, y]) => set.has(`${x + 1},${y}`) || set.has(`${x - 1},${y}`)).length;
    expect(joined / cell.length).toBeGreaterThan(0.6);
  });
  // After dark the mist thins to half.
  expect(planMist('mountainlake', null, 'night')[0].shape.cells[0].length).toBeLessThan(mist[0].shape.cells[0].length);
  expect(planMist('mountainlake', 'winter').length).toBe(2);
  const grass = planGrass('creek');
  expect(grass.length).toBe(12);
  // Rooted in the painted grass: none on the bare mud among the crabs (x 380-470, y 170-205).
  grass.forEach((tuft) => {
    const rootX = (tuft.x + tuft.w / 2) * ART_PX; const rootY = (tuft.y + tuft.h) * ART_PX;
    expect(rootX > 380 && rootX < 470 && rootY > 165 && rootY < 210).toBe(false);
  });
  planRings('mountainlake').forEach((ring) => {
    expect(ring.rhythm).toBe('25');
    // A dimple, rings opening wider each cell, and a blank to rest on.
    const widths = ring.shape.cells.slice(1, -1).map((cell) => Math.max(...cell.map(([x]) => x)) - Math.min(...cell.map(([x]) => x)));
    widths.forEach((width, i) => { if (i) expect(width).toBeGreaterThan(widths[i - 1]); });
    expect(ring.shape.cells[ring.shape.cells.length - 1]).toEqual([]);
  });
});

test('sun glints flash over the water by day and only down the moon path after dark', () => {
  GROUNDS.forEach(([biome, season]) => {
    const config = ambienceFor(biome, season);
    const day = planGlints(biome, season, 'day');
    expect(day.length).toBe(Math.round(config.glitter * 60));
    const water = config.clip || [[config.sparkle.x0, config.sparkle.y0], [config.sparkle.x1, config.sparkle.y0], [config.sparkle.x1, config.sparkle.y1], [config.sparkle.x0, config.sparkle.y1]];
    day.forEach((glint) => expect(inside(water, (glint.x + glint.w / 2) * ART_PX, (glint.y + 0.5) * ART_PX)).toBe(true));
    const [x0, y0, x1, y1] = config.moon;
    planGlints(biome, season, 'night').forEach((glint) => {
      const x = (glint.x + glint.w / 2) * ART_PX; const y = glint.y * ART_PX;
      expect(x).toBeGreaterThanOrEqual(x0 - ART_PX * 2);
      expect(x).toBeLessThanOrEqual(x1 + ART_PX * 2);
      expect(y).toBeGreaterThanOrEqual(y0 - ART_PX);
      expect(y).toBeLessThanOrEqual(y1 + ART_PX);
    });
  });
});

test('after dark: a few painted stars twinkle, and no clouds, gulls, dragonflies, gleam or light net', () => {
  GROUNDS.forEach(([biome, season]) => {
    const night = planAmbience(biome, season, 'night');
    expect(night.clouds).toEqual([]);
    expect(night.gulls).toEqual([]);
    expect(night.dragonflies).toEqual([]);
    expect(night.gleam).toEqual([]);
    if (night.tiles) expect(night.tiles.kind).toBe('snow');
    expect(night.stars.length).toBeGreaterThan(0);
    expect(night.stars.length).toBeLessThanOrEqual(4);
    // A star is one art pixel on a painted one, stepping through three tones; a firefly too.
    night.stars.forEach((star) => { expect([star.w, star.h]).toEqual([1, 1]); expect(new Set(star.shape.cells.map((cell) => cell[0][2])).size).toBe(3); });
    night.fireflies.forEach((bug) => expect([bug.w, bug.h]).toEqual([1, 1]));
    expect(planStars(biome, season, 'day')).toEqual([]);
  });
  expect(planGleam('canyon', null, 'dusk').length).toBeGreaterThan(0);
  expect(planTiles('flats', null, 'day').kind).toBe('caustics');
  expect(planTiles('mountainlake', 'winter', 'night').kind).toBe('snow');
});

test('a tile layer moves exactly one tile per loop on each axis, a pixel a step, so it never jumps', () => {
  ['flats', ['mountainlake', 'winter']].forEach((ground) => {
    const [biome, season] = Array.isArray(ground) ? ground : [ground, null];
    const tiles = planTiles(biome, season, 'day');
    expect(tiles.layers.length).toBe(2);
    tiles.layers.forEach((layer) => {
      expect(Math.abs(layer.x)).toBe(layer.tile.w);
      expect(Math.abs(layer.y)).toBe(layer.tile.h);
      // Both axes run, each on its own animation (the second no longer cancels the first).
      expect(layer.seconds.length).toBe(2);
      expect(Math.abs(layer.x) / layer.seconds[0]).toBeLessThanOrEqual(MAX_STEPS_PER_S);
      expect(Math.abs(layer.y) / layer.seconds[1]).toBeLessThanOrEqual(MAX_STEPS_PER_S);
      layer.seconds.forEach((seconds) => expect(onTick(seconds)).toBe(true));
    });
    expect(tiles.layers[0].tile.w).not.toBe(tiles.layers[1].tile.w);
  });
});

test('the sky: clouds at their own size in the painting\'s own sky, gulls of one size, dragonflies over fresh water by day', () => {
  GROUNDS.forEach(([biome, season]) => {
    const config = ambienceFor(biome, season);
    const clouds = planClouds(biome, season, 'day');
    const gulls = planGulls(biome, season, 'day');
    if (clouds.length || gulls.length) expect(maskRects(config.sky).length).toBeGreaterThan(0);
    clouds.forEach((cloud) => {
      expect(AMBIENT_SPRITES.clouds.some((sprite) => sprite.src === cloud.src && sprite.w === cloud.w && sprite.h === cloud.h)).toBe(true);
      // Its band of the sky is open sky, not peaks with gaps for slivers of cloud.
      expect(skyShare(config.sky, cloud.y, cloud.h)).toBeGreaterThanOrEqual(MIN_SKY_SHARE);
      // Across the whole painting, a pixel a step, no faster than the clock; placed where the
      // loop starts it, so with motion off it stays in the sky rather than off the left edge.
      expect(cloud.tx).toBe(ART_COLS + cloud.w);
      expect(cloud.tx0).toBe(-(cloud.x + cloud.w));
      expect(cloud.x).toBeGreaterThanOrEqual(0);
      expect(cloud.tx / cloud.duration).toBeLessThanOrEqual(MAX_STEPS_PER_S);
      expect(config.cloudTones).toHaveLength(4);
    });
    gulls.forEach((gull) => {
      expect([gull.w, gull.h]).toEqual([AMBIENT_SPRITES.gull.w, AMBIENT_SPRITES.gull.h]);
      expect(gull.flap).toBe(0.375);
      expect(gull.tx / gull.stride / gull.duration).toBeLessThanOrEqual(MAX_STEPS_PER_S);
    });
    planDragonflies(biome, season, 'day').forEach((fly) => { expect([fly.w, fly.h]).toEqual([AMBIENT_SPRITES.dragonfly.w, AMBIENT_SPRITES.dragonfly.h]); expect(fly.duration).toBe(12.5); expect(fly.wings).toBe(0.25); });
  });
  // Where the painting's sky is its own — full of its painted cumulus, a sunset, a clear desert
  // sky — no sprite clouds cross it.
  ['bay', 'shoreline', 'offshore', 'flats', 'canyon', 'baja', 'swamp'].forEach((biome) => expect(planClouds(biome)).toEqual([]));
  // The lake's second lane lies behind the peaks: only the high one crosses.
  expect(planClouds('mountainlake').length).toBe(1);
  expect(skyShare(ambienceFor('mountainlake').sky, px(24), 16)).toBeLessThan(MIN_SKY_SHARE);
  expect(planClouds('pier').length).toBe(2);
  expect(planGulls('offshore').length).toBe(3);
  expect(planGulls('river')).toEqual([]);
  // Gulls pass behind the dock lamp and the pier's lamp posts, in front of far headlands.
  expect(ambienceFor('bay').fore.length).toBeGreaterThan(0);
  expect(ambienceFor('pier').fore.length).toBe(3);
  expect(ambienceFor('baja').fore).toEqual([]);
  const holes = decodeURIComponent(holesUrl([[4, 16, 46, 60]], '12:0-359;13:0-5,20-359').slice('url("data:image/svg+xml,'.length, -2));
  expect(holes).toMatch(/fill-rule='evenodd' d='M0,0h360v203h-360zM3,12h32v33h-32z'/);
  // Inside the lamp's rectangle the sky is given back, so the gull shows round the lamp.
  expect(holes).toMatch(/<path fill='#000' d='M3,12h32v1h-32zM3,13h3v1h-3zM20,13h15v1h-15z'\/>/);
  // The dock grounds' lamp post stands in front of the sky: its column is not sky.
  const bay = maskRects(ambienceFor('bay').sky);
  const isSky = (rects, x, y) => rects.some(([rx, ry, w, h]) => x >= rx && x < rx + w && y >= ry && y < ry + h);
  expect(isSky(bay, 10, 25)).toBe(false);
  expect(isSky(bay, 200, 5)).toBe(true);
});

test('drawing: hard-edged SVG strips, pixel masks, and the clouds repainted tone for tone', () => {
  const strip = svgStrip({ w: 2, h: 1, cells: [[[0, 0, 'foam']], [[1, 0, 'hi']]] }, { foam: '#d2e2ef', hi: '#aed0ee' });
  const svg = decodeURIComponent(strip.slice('url("data:image/svg+xml,'.length, -2));
  expect(svg).toMatch(/shape-rendering='crispEdges'/);
  expect(svg).toMatch(/viewBox='0 0 4 1'/);
  expect(svg).toMatch(/fill='#d2e2ef' d='M0,0h1v1h-1z'/);
  expect(svg).toMatch(/fill='#aed0ee' d='M3,0h1v1h-1z'/);
  // A strand one pixel wide and three tall is one rectangle, not three.
  const strand = decodeURIComponent(svgStrip({ w: 1, h: 3, cells: [[[0, 0, 'hi'], [0, 1, 'hi'], [0, 2, 'hi']]] }, { hi: '#aed0ee' }).slice('url("data:image/svg+xml,'.length, -2));
  expect(strand).toMatch(/d='M0,0h1v3h-1z'/);
  // Runs that repeat row after row merge into one rectangle.
  expect(maskRects('0:2-4;1:2-4;2:2-4,7-7')).toEqual([[2, 0, 3, 3], [7, 2, 1, 1]]);
  expect(maskUrl('0:0-1')).toMatch(/^url\("data:image\/svg\+xml,/);
  // A polygon rasterised to art-pixel runs: a pixel is in when its centre is.
  expect(polygonRuns([[0, 0], [4 * ART_PX, 0], [4 * ART_PX, 2 * ART_PX], [0, 2 * ART_PX]])).toBe('0:0-3;1:0-3');
  // The cloud art's four tones land in four different sixteenths of every channel, so a
  // discrete table maps each to the painting's tone exactly.
  const tones = ['#dcccbf', '#cec3be', '#bcbcca', '#a1bad8'];
  const tables = cloudTables(tones).map((table) => table.split(' ').map(Number));
  CLOUD_ART_TONES.forEach((art, i) => {
    [0, 1, 2].forEach((channel) => {
      const value = parseInt(art.slice(1 + channel * 2, 3 + channel * 2), 16);
      const bin = Math.min(15, Math.floor((value / 255) * 16));
      expect(Math.round(tables[channel][bin] * 255)).toBe(parseInt(tones[i].slice(1 + channel * 2, 3 + channel * 2), 16));
    });
  });
  // A two-to-one line: a pixel across every step, a pixel down every other.
  const line = linePixels(0, 0, 4, 2);
  expect(line.length).toBe(5);
  expect(line[0]).toEqual([0, 0]);
  expect(line[4]).toEqual([4, 2]);
  line.slice(1).forEach(([x, y], i) => { expect(x - line[i][0]).toBe(1); expect([0, 1]).toContain(y - line[i][1]); });
  expect(ellipsePixels(3, 1)).toEqual(expect.arrayContaining([[3, 0], [-3, 0], [0, 1], [0, -1]]));
});

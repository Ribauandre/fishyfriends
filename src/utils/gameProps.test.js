import path from 'node:path';
import {
  ICON_PX, GEAR_ICONS, LURE_ICONS, HUD_ICONS, DOCK_ICONS, LURE_SPRITES, FISH_SHADOWS, fishShadowFor, GOLDEN_PENNANT,
  PLANK, PLANK_THIN, GAME_FRAME, AMBIENT_SPRITES, VEHICLE_SPRITES, vehicleFor,
} from './gameProps';
import { ART_PX } from './sceneLayout';
import { readPng, measure } from '../test-utils/pixelArt';

// jsdom has no canvas, and CRA hands a test an imported PNG as its file name, so these read the
// files the module imports off disk (the file name is the import's basename) and check them
// against the numbers the module gives the stage.
const ASSETS = path.join(__dirname, '..', 'assets');
const PROPS = path.join(ASSETS, 'props');
const fileOf = (dir, src) => path.join(dir, path.basename(String(src)));

const ICON_FILES = ['bait', 'bell', 'book', 'coin', 'crankbait', 'crewicon', 'dryfly', 'flag', 'flyrod', 'jerkbait', 'line', 'livebait',
  'mapicon', 'nymph', 'outfit', 'questicon', 'reel', 'rod', 'shrimpfly', 'streamer', 'tacklebox', 'trophyicon'];

test('every icon the game shows is one of the set', () => {
  const shown = [...Object.values(GEAR_ICONS), ...Object.values(LURE_ICONS), ...Object.values(HUD_ICONS), ...Object.values(DOCK_ICONS)]
    .map((src) => path.basename(String(src), '.png'));
  shown.forEach((name) => expect(ICON_FILES).toContain(name));
});

describe.each(ICON_FILES)('icon %s', (name) => {
  const img = readPng(path.join(PROPS, `${name}.png`));
  const stats = measure(img);

  test('is one box of ICON_PX art pixels, with a pixel of margin round what is drawn', () => {
    expect(img.width).toBe(ICON_PX);
    expect(img.height).toBe(ICON_PX);
    expect(stats.box.x0).toBeGreaterThanOrEqual(1);
    expect(stats.box.y0).toBeGreaterThanOrEqual(1);
    expect(stats.box.x1).toBeLessThanOrEqual(ICON_PX - 1);
    expect(stats.box.y1).toBeLessThanOrEqual(ICON_PX - 1);
  });

  test('is flat pixel art in the world\'s keyline: hard alpha, twelve colours or fewer, no other near-black', () => {
    expect(stats.soft).toBe(0);
    expect(stats.colors.size).toBeLessThanOrEqual(12);
    expect(stats.colors.has('130f0c')).toBe(true);
    expect(stats.strayDark).toBe(0);
    // The one exception to a keyline on every edge is a treble's split ring, a single glint pixel.
    expect(stats.edgeKeyShare).toBeGreaterThan(0.97);
  });
});

describe.each(Object.entries(LURE_SPRITES))('the %s on the water', (name, sprite) => {
  const img = readPng(fileOf(path.join(PROPS, 'lures'), sprite.src));

  test('is its art pixels, drawn at w x h ART_PX painting units, small beside the angler', () => {
    expect(img.width).toBe(sprite.w);
    expect(img.height).toBe(sprite.h);
    expect(sprite.unitW).toBeCloseTo(sprite.w * ART_PX, 5);
    expect(sprite.unitH).toBeCloseTo(sprite.h * ART_PX, 5);
    expect(sprite.unitW).toBeLessThan(24);
  });

  test('ties on at its nose, on the left, inside the sprite', () => {
    expect(sprite.eye.x).toBeLessThan(sprite.w / 4);
    expect(sprite.eye.y).toBeGreaterThanOrEqual(0);
    expect(sprite.eye.y).toBeLessThan(sprite.h);
  });

  test('is flat pixel art with the world\'s keyline round it', () => {
    const stats = measure(img);
    expect(stats.soft).toBe(0);
    expect(stats.strayDark).toBe(0);
    expect(stats.edgeKeyShare).toBeGreaterThan(0.9);
  });
});

describe('the fish shadow', () => {
  test('comes in classes whose files are the sizes the module draws them at', () => {
    FISH_SHADOWS.forEach((shadow) => {
      const img = readPng(fileOf(path.join(PROPS, 'shadow'), shadow.src));
      expect(img.width).toBe(shadow.w);
      expect(img.height).toBe(shadow.h);
      expect(shadow.unitW).toBeCloseTo(shadow.w * ART_PX, 5);
      const stats = measure(img);
      expect(stats.soft).toBe(0);
      expect(stats.colors.size).toBe(1);
    });
  });

  test('covers every length the stage asks for (24 to 124 painting units) within a few per cent', () => {
    for (let length = 24; length <= 124; length += 1) {
      const shadow = fishShadowFor(length);
      expect(Math.abs(shadow.unitW - length) / length).toBeLessThan(0.08);
    }
    expect(fishShadowFor(5).w).toBe(FISH_SHADOWS[0].w);
    expect(fishShadowFor(500).w).toBe(FISH_SHADOWS[FISH_SHADOWS.length - 1].w);
  });

  test('grows with the fish', () => {
    const widths = FISH_SHADOWS.map((s) => s.w);
    expect([...widths].sort((a, b) => a - b)).toEqual(widths);
  });
});

test('the golden pennant is three frames drawn at their own 3:2 aspect (the CSS stretched the old one 1.38x)', () => {
  const img = readPng(fileOf(PROPS, GOLDEN_PENNANT.src));
  expect(img.width).toBe(GOLDEN_PENNANT.frames * GOLDEN_PENNANT.w);
  expect(img.height).toBe(GOLDEN_PENNANT.h);
  expect(GOLDEN_PENNANT.unitW / GOLDEN_PENNANT.unitH).toBeCloseTo(GOLDEN_PENNANT.w / GOLDEN_PENNANT.h, 5);
  const stats = measure(img);
  expect(stats.soft).toBe(0);
  for (let f = 0; f < GOLDEN_PENNANT.frames; f += 1) {
    expect(measure(img, { x0: f * GOLDEN_PENNANT.w, y0: 0, w: GOLDEN_PENNANT.w, h: GOLDEN_PENNANT.h }).edgeKeyShare).toBe(1);
  }
});

test.each([['plank', PLANK], ['plank_thin', PLANK_THIN], ['frame', GAME_FRAME]])('the %s nine-slice is whole art pixels, its slice inside it', (name, piece) => {
  const img = readPng(fileOf(PROPS, piece.src));
  expect(img.width).toBe(piece.w);
  expect(img.height).toBe(piece.h);
  expect(Number.isInteger(piece.slice)).toBe(true);
  expect(piece.slice * 2).toBeLessThan(piece.w);
  expect(measure(img).soft).toBe(0);
});

describe('the sky\'s critters', () => {
  test('the clouds are drawn at their own size in four flat tones, with no keyline', () => {
    AMBIENT_SPRITES.clouds.forEach((cloud) => {
      const img = readPng(fileOf(path.join(ASSETS, 'ambient'), cloud.src));
      expect(img.width).toBe(cloud.w);
      expect(img.height).toBe(cloud.h);
      expect(cloud.h).toBeGreaterThanOrEqual(14);
      expect(cloud.h).toBeLessThanOrEqual(24);
      const stats = measure(img);
      expect(stats.soft).toBe(0);
      expect(stats.colors.size).toBeLessThanOrEqual(4);
      expect(stats.colors.has('130f0c')).toBe(false);
    });
  });

  test.each(['gull', 'dragonfly'])('the %s is a strip of equal frames at its own size', (name) => {
    const sprite = AMBIENT_SPRITES[name];
    const img = readPng(fileOf(path.join(ASSETS, 'ambient'), sprite.src));
    expect(img.width).toBe(sprite.frames * sprite.w);
    expect(img.height).toBe(sprite.h);
    expect(measure(img).soft).toBe(0);
    if (sprite.still) {
      const still = readPng(fileOf(path.join(ASSETS, 'ambient'), sprite.still));
      expect([still.width, still.height]).toEqual([sprite.w, sprite.h]);
    }
  });

  // Frame 0 used to face backwards, and the body hopped between frames.
  test('every gull frame faces right, with its body in the same place', () => {
    const { w, h, frames } = AMBIENT_SPRITES.gull;
    const img = readPng(fileOf(path.join(ASSETS, 'ambient'), AMBIENT_SPRITES.gull.src));
    const beak = [];
    const body = [];
    for (let f = 0; f < frames; f += 1) {
      let bx = -1, sx = 0, sy = 0, n = 0;
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        const i = (y * img.width + f * w + x) * 4;
        const [r, g, b, a] = [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
        if (!a) continue;
        if (r > 200 && g > 120 && g < 170 && b < 90) bx = Math.max(bx, x);
        if (r > 235 && g > 235 && b > 225) { sx += x; sy += y; n += 1; }
      }
      beak.push(bx);
      body.push([sx / n, sy / n]);
    }
    beak.forEach((x) => expect(x).toBeGreaterThan(w * 0.7));
    body.forEach(([x, y]) => { expect(Math.abs(x - body[0][0])).toBeLessThan(1); expect(Math.abs(y - body[0][1])).toBeLessThan(1); });
  });
});

test.each(Object.entries(VEHICLE_SPRITES))('the %s is drawn at its own art pixels, to scale beside the 92-unit angler', (name, sprite) => {
  const img = readPng(fileOf(PROPS, sprite.src));
  expect(img.width).toBe(sprite.w);
  expect(img.height).toBe(sprite.h);
  expect(sprite.unitH).toBeCloseTo(sprite.h * ART_PX, 5);
  expect(sprite.unitH).toBeGreaterThan(92);
  const stats = measure(img);
  expect(stats.soft).toBe(0);
  expect(stats.strayDark).toBe(0);
  expect(stats.edgeKeyShare).toBe(1);
});

test('travel to or from a charter ground is by boat, anything else by truck', () => {
  expect(vehicleFor('river', 'bay')).toBe('truck');
  expect(vehicleFor('river', 'offshore')).toBe('boat');
  expect(vehicleFor('offshore', 'river')).toBe('boat');
});

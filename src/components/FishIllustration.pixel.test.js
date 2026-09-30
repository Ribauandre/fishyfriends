import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { render, screen, waitFor } from '@testing-library/react';
import FishIllustration, { HERO_SPECIES, PIXEL_FISH_BOX, pixelFishSize, preloadPixelFish } from './FishIllustration';
import { PIXEL_FISH } from '../assets/fish/pixel';
import PIXEL_SIZES from '../assets/fish/pixel/sizes.json';
import { BIOME_LIST } from '../utils/gameBiomes';
import { JUNK_ROSTER, JUNK_SPECIES, SPECIES_SIZE, lengthFraction } from '../utils/gameSpecies';

// The pixel variants are generated art (scripts/pixelFish.mjs) that the stage and the game's
// overlays draw instead of the stickers, and nothing at runtime notices when one is missing or
// has drifted from its manifest: a species with no variant quietly falls back to a 900-pixel
// sticker in a pixel world, and jsdom has no canvas to look at any of it. So the roster is held
// against the files here, and the files are read for what makes them pixel art on the world's
// grid: hard alpha, the box and each one's own length, and the one-pixel keyline, #e3fb14 ring
// and outer keyline.
const PIXEL = path.join(__dirname, '..', 'assets', 'fish', 'pixel');
const LOGO = path.join(__dirname, '..', 'assets', 'props', 'logo_pixel.png');
const KEYLINE = [19, 15, 12]; // #130f0c, the angler's keyline
const NEON = [227, 251, 20]; // #e3fb14

// Every species a cast can bring up: every ground's roster, and the flotsam.
const GAME_SPECIES = [...new Set([...BIOME_LIST.flatMap((biome) => biome.species), ...JUNK_ROSTER, JUNK_SPECIES, 'stick'])].sort();

// A PNG's width and height are the first two fields of its IHDR.
function sizeOf(file) {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// The pixels of an 8-bit RGBA PNG, which is what png.mjs writes.
function pixelsOf(file) {
  const buf = readFileSync(file);
  const { width, height } = sizeOf(file);
  expect(buf[24]).toBe(8); expect(buf[25]).toBe(6);
  const idat = []; let at = 8;
  while (at < buf.length) {
    const len = buf.readUInt32BE(at); const type = buf.toString('ascii', at + 4, at + 8);
    if (type === 'IDAT') idat.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = width * 4;
  const out = Buffer.alloc(stride * height); let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const type = raw[y * (stride + 1)]; const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i += 1) {
      const a = i >= 4 ? line[i - 4] : 0; const b = prev[i]; const c = i >= 4 ? prev[i - 4] : 0;
      const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
      const add = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][type];
      line[i] = (line[i] + add) & 255;
    }
    line.copy(out, y * stride); prev = line;
  }
  return { width, height, data: out };
}

const is = (data, o, [r, g, b]) => data[o] === r && data[o + 1] === g && data[o + 2] === b;

// What makes a variant pixel art on the world's grid, read off the file.
function checkPixelArt(file) {
  const { width, height, data } = pixelsOf(file);
  const colours = new Set(); let neon = 0; let edgeNotKeyline = 0; let soft = 0;
  const opaque = (x, y) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] === 255;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const o = (y * width + x) * 4; const a = data[o + 3];
    // hard alpha: nothing between drawn and not
    if (a !== 0 && a !== 255) soft += 1;
    if (!a) continue;
    colours.add(data.readUInt32BE(o));
    if (is(data, o, NEON)) neon += 1;
    // the outline is the keyline: every drawn pixel on the transparent ground is #130f0c
    const onEdge = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
    if (onEdge && !is(data, o, KEYLINE)) edgeNotKeyline += 1;
  }
  expect(soft).toBe(0);
  expect(edgeNotKeyline).toBe(0);
  expect(neon).toBeGreaterThan(width); // a whole ring of it
  // a flat palette, not a painting
  expect(colours.size).toBeLessThanOrEqual(26);
  return { width, height };
}

// First, before anything has loaded the chunk: the pixel set is not in the site's bundle, so
// the first pixel variant drawn lays out its box empty and fills it when the chunk arrives.
test('the first pixel variant drawn lays out its box, then fills it when the art arrives', async () => {
  render(<FishIllustration species="opah" variant="pixel" />);
  const img = screen.getByRole('img', { name: /^opah$/i });
  expect(img).toHaveAttribute('data-variant', 'pixel');
  expect(img).toHaveAttribute('data-loading', 'yes');
  expect(img).toHaveAttribute('width', String(PIXEL_SIZES.opah[0]));
  expect(img).toHaveAttribute('height', String(PIXEL_SIZES.opah[1]));
  expect(img.getAttribute('src')).toMatch(/^data:image\/gif/);
  await waitFor(() => expect(img).not.toHaveAttribute('data-loading'));
  expect(img.getAttribute('src')).toBe(PIXEL_FISH.opah.src);
});

test('every species a cast can land has a pixel variant on disk and in the manifest', () => {
  const missing = GAME_SPECIES.filter((key) => !PIXEL_FISH[key] || !PIXEL_SIZES[key] || !existsSync(path.join(PIXEL, `${key}.png`)));
  expect(missing).toEqual([]);
});

test('every sticker has a pixel variant, and every variant is a sticker', () => {
  expect(Object.keys(PIXEL_FISH).sort()).toEqual([...HERO_SPECIES].sort());
  expect(Object.keys(PIXEL_SIZES).sort()).toEqual([...HERO_SPECIES].sort());
});

describe('once the pixel set has loaded (the game preloads it when it opens)', () => {
  beforeAll(() => preloadPixelFish());

  test.each(GAME_SPECIES)('FishIllustration variant="pixel" renders the pixel %s at once, pixelated at its native size', (key) => {
    render(<FishIllustration species={key} variant="pixel" className="scene-trophy" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('data-species', key);
    expect(img).toHaveAttribute('data-variant', 'pixel');
    expect(img).not.toHaveAttribute('data-loading');
    expect(img.getAttribute('src')).toBe(PIXEL_FISH[key].src);
    expect(img).toHaveAttribute('width', String(PIXEL_FISH[key].w));
    expect(img).toHaveAttribute('height', String(PIXEL_FISH[key].h));
    expect(img.style.imageRendering).toBe('pixelated');
    expect(img).toHaveClass('fish-illustration', 'is-pixel', 'scene-trophy');
  });
});

test.each(Object.keys(PIXEL_FISH))('%s: the manifest size is the file, inside the box, and the file is flat pixel art with its rings', (key) => {
  const file = path.join(PIXEL, `${key}.png`);
  const { width, height } = checkPixelArt(file);
  expect({ w: width, h: height }).toEqual({ w: PIXEL_FISH[key].w, h: PIXEL_FISH[key].h });
  expect(PIXEL_SIZES[key]).toEqual([width, height]);
  expect(pixelFishSize(key)).toEqual({ w: width, h: height });
  expect(width).toBeLessThanOrEqual(PIXEL_FISH_BOX.w);
  expect(height).toBeLessThanOrEqual(PIXEL_FISH_BOX.h);
  // drawn at its own length (below): as long as the rule says, or as tall as the box allows
  const length = expectedLength(key);
  if (JUNK_LENGTHS[key]) expect(Math.max(width, height)).toBeGreaterThanOrEqual(length - 2);
  else expect(width >= length - 2 || height >= PIXEL_FISH_BOX.h - 2).toBe(true);
  expect(Math.max(width, JUNK_LENGTHS[key] ? height : 0)).toBeLessThanOrEqual(length);
});

// The catch is revealed one file pixel to one art pixel beside the angler, so a fish's size in
// the file is its size on the stage. Every one used to fill the 120 x 72 box, which drew a 5-inch
// pumpkinseed taller than the angler and as big as a 170-inch marlin. Now each is drawn at a
// length that follows its species' typical size (the middle of SPECIES_SIZE) on one compressed
// log scale — lengthFraction, stretched across the roster from 38 to 120 art pixels — and the
// flotsam at its own (scripts/pixelFish.mjs, lengthFor). The same rule, stated again here:
const JUNK_LENGTHS = { stick: 60, boot: 40, plate: 44, bottle: 36 };
const ANGLER_ROWS = 69; // the angler's idle frame, cap to boots
const typical = (key) => lengthFraction((SPECIES_SIZE[key][0] + SPECIES_SIZE[key][1]) / 2);
const FISH_KEYS = Object.keys(SPECIES_SIZE).filter((key) => !JUNK_LENGTHS[key]);
function expectedLength(key) {
  if (JUNK_LENGTHS[key]) return JUNK_LENGTHS[key];
  const fs = FISH_KEYS.map(typical); const lo = Math.min(...fs); const hi = Math.max(...fs);
  return Math.round(38 + 82 * ((typical(key) - lo) / (hi - lo)));
}

test('a fish is drawn at its species\' size: a panfish well under half the angler, a billfish the whole box', () => {
  const size = (key) => pixelFishSize(key);
  for (const panfish of ['pumpkinseed', 'bluegill', 'warmouth', 'rockbass']) {
    expect(size(panfish).h).toBeLessThanOrEqual(0.45 * ANGLER_ROWS);
    expect(size(panfish).w).toBeLessThanOrEqual(50);
  }
  expect(size('bluemarlin').w).toBeGreaterThanOrEqual(PIXEL_FISH_BOX.w - 2);
  expect(size('threshershark').h).toBe(PIXEL_FISH_BOX.h);
  // the scale runs one way: a fish whose species runs bigger is never drawn shorter
  const byTypical = [...FISH_KEYS].sort((a, b) => typical(a) - typical(b));
  byTypical.forEach((key, i) => {
    const next = byTypical[i + 1];
    if (next && typical(next) > typical(key)) expect(expectedLength(next)).toBeGreaterThanOrEqual(expectedLength(key));
  });
  expect(size('largemouth').w).toBeGreaterThan(size('bluegill').w + 15);
  expect(size('bluefintuna').w).toBeGreaterThan(size('largemouth').w + 30);
  // the flotsam at its own size: a stick longer than a boot
  expect(size('stick').w).toBeGreaterThan(Math.max(size('boot').w, size('boot').h));
});

test('the pixel logo is the same treatment at about 150 art pixels wide', () => {
  const { width, height } = checkPixelArt(LOGO);
  expect(width).toBeGreaterThanOrEqual(140);
  expect(width).toBeLessThanOrEqual(160);
  expect(height).toBeGreaterThan(width); // the logo stands taller than it is wide
});

test('without a variant the sticker renders exactly as before', () => {
  render(<FishIllustration species="pike" />);
  const img = screen.getByRole('img', { name: /northern pike/i });
  expect(img).not.toHaveAttribute('data-variant');
  expect(img).not.toHaveAttribute('width');
  expect(img.style.imageRendering).toBe('');
  expect(img).not.toHaveClass('is-pixel');
});

test('a species with no pixel variant falls back to the sticker', () => {
  render(<FishIllustration species="not-a-real-species" variant="pixel" />);
  const img = screen.getByRole('img', { name: /^trout$/i });
  expect(img).toHaveAttribute('data-variant', 'sticker');
  expect(img).toHaveAttribute('data-species', 'not-a-real-species');
  expect(img.style.imageRendering).toBe('');
  expect(pixelFishSize('not-a-real-species')).toBeNull();
});

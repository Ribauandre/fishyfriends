import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ART_PX, PAINT_H, PAINT_W, SCENE_LAYOUTS, WORLD_COLS } from './sceneLayout';

// Every ground painting, day and night, is stored on the world's art grid — one file pixel per
// art pixel — by scripts/backdropGrid.mjs, from the 960x540 paintings kept in art/scenes. Nothing
// at runtime notices a painting of the wrong size: the stage would simply stretch it, and its
// pixels would stop matching the angler's. So the files are checked here, off their headers.
const SCENES = path.join(__dirname, '..', 'assets', 'scenes');
const SOURCES = path.join(__dirname, '..', '..', 'art', 'scenes');

// A WebP's size is in its first chunk's header: VP8L (lossless) packs width-1 and height-1 into
// 14 bits each after a 0x2f signature, VP8 (lossy) has them as 14-bit fields after the start
// code, and VP8X (extended) as 24-bit fields.
function webpInfo(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${file} is not a WebP`);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) throw new Error(`${file}: bad VP8L signature`);
    const bits = b.readUInt32LE(21);
    return { chunk, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') return { chunk, width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8X') return { chunk, width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  throw new Error(`${file}: unknown WebP chunk ${chunk}`);
}

const fileFor = (sceneKey) => sceneKey.replace(':', '_');
const PAINTINGS = Object.keys(SCENE_LAYOUTS).flatMap((key) => [fileFor(key), `${fileFor(key)}_night`]);

test('the art grid is 360 x 203: a 480 x 270 painting in 4/3-unit art pixels', () => {
  expect(WORLD_COLS).toBe(360);
  expect(PAINT_W / ART_PX).toBe(WORLD_COLS);
  expect(Math.ceil(PAINT_H / ART_PX)).toBe(203);
});

describe.each(PAINTINGS)('%s', (name) => {
  test('is stored lossless at its art resolution', () => {
    expect(webpInfo(path.join(SCENES, `${name}.webp`))).toEqual({ chunk: 'VP8L', width: WORLD_COLS, height: Math.ceil(PAINT_H / ART_PX) });
  });

  test('has its 960 x 540 source in art/scenes, so the grid pass can be re-run', () => {
    const file = path.join(SOURCES, `${name}.webp`);
    expect(existsSync(file)).toBe(true);
    expect(webpInfo(file)).toMatchObject({ width: 960, height: 540 });
  });
});

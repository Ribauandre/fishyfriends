import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readPng, measure } from '../../test-utils/pixelArt';

// The chrome's paintings — the three interiors behind the overlays, the fishing-grounds map and
// the dock's deck tile — are stored at their native art resolution, one file pixel per art pixel,
// lossless, by scripts/roomGrid.mjs, and drawn pixelated. Nothing at runtime would notice a file
// of the wrong size or a lossy re-encode (the page would just scale it, and its pixels would go
// soft or uneven), so the files are checked here, off their headers.
const SCENES = path.join(__dirname, '..', '..', 'assets', 'scenes');
const SOURCES = path.join(__dirname, '..', '..', '..', 'art', 'rooms');

function webpInfo(file) {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${file} is not a WebP`);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk !== 'VP8L') return { chunk };
  const bits = b.readUInt32LE(21);
  return { chunk, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

// [file, native cols x rows, the source it is gridded from (null: drawn by the script)]
const ROOM_ART = [
  ['shop.webp', 254, 164, 'shop.webp'],
  ['outfitter.webp', 236, 120, 'outfitter.webp'],
  ['trophywall.webp', 196, 130, 'trophywall.webp'],
  ['map.webp', 396, 264, 'map.webp'],
  ['deck.webp', 192, 72, null],
];

describe.each(ROOM_ART)('%s', (file, width, height, source) => {
  test('is stored lossless at its native art resolution', () => {
    expect(webpInfo(path.join(SCENES, file))).toEqual({ chunk: 'VP8L', width, height });
  });

  if (source) {
    test('keeps its source in art/rooms, so the grid pass can be re-run', () => {
      expect(existsSync(path.join(SOURCES, source))).toBe(true);
    });
  }
});

// The deck is a tile: its every row and column must meet the opposite edge without a seam, so the
// boards' rows (keyline gap, lit edge, face, shade) repeat on the tile's own period.
test('the deck tile is whole boards: its height is a multiple of the 12-row board', () => {
  expect(webpInfo(path.join(SCENES, 'deck.webp')).height % 12).toBe(0);
});

// The captain's, Sal's and Marina's portraits are on the chrome's grid too: 64 x 64 art pixels
// (scripts/pixelGrid.mjs from the renders kept in art/npcs, art/props/chrome.json), opaque, a
// small palette, drawn pixelated at a whole multiple. The 256 px renders they replace were four
// times finer than the angler beside them.
describe.each(['captain', 'shopkeeper', 'outfitter'])('the %s portrait', (npc) => {
  test('is 64 x 64 flat pixel art, gridded from a render kept in art/npcs', () => {
    const img = readPng(path.join(__dirname, '..', '..', 'assets', 'npcs', `${npc}.png`));
    expect([img.width, img.height]).toEqual([64, 64]);
    const stats = measure(img);
    expect(stats.soft).toBe(0);
    expect(stats.drawn).toBe(64 * 64);
    expect(stats.colors.size).toBeLessThanOrEqual(32);
    expect(existsSync(path.join(__dirname, '..', '..', '..', 'art', 'npcs', `${npc}.png`))).toBe(true);
  });
});

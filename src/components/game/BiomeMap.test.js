import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BiomeMap, { HOTSPOTS, SHOP_HOTSPOT, MAP_ART_SIZE, mapFit } from './BiomeMap';
import { BIOMES } from '../../utils/gameBiomes';

const ALL_QUESTS_DONE = Object.fromEntries(Object.values(BIOMES).filter((b) => b.requiresQuest).map((b) => [b.requiresQuest, { done: true }]));

test('offers every fishing ground on the map, marks the current one, and prices the charter', () => {
  render(<BiomeMap biome="river" chartered={false} onSelect={jest.fn()} onShop={jest.fn()} />);
  expect(screen.getByRole('img', { name: /map of the fishing grounds/i })).toBeInTheDocument();
  ['Mountain Lake · Free', 'Swamp · Free', 'River · Free', 'Beach · Free', 'Bay · Free', 'The Pier · Free', 'Tidal Creek · Free', 'Offshore · Charter · 50 pts'].forEach((name) => {
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });
  ['The Canyon · Locked', 'The Flats · Locked', 'Baja · Locked'].forEach((name) => {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  });
  expect(screen.getByRole('button', { name: 'River · Free' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Bay · Free' })).toHaveAttribute('aria-pressed', 'false');
});

test('opens the far grounds once Cap\'n Ray\'s quests are done', () => {
  render(<BiomeMap biome="river" chartered={false} onSelect={jest.fn()} onShop={jest.fn()} quests={ALL_QUESTS_DONE} />);
  ['The Canyon · Charter · 80 pts', 'The Flats · Charter · 100 pts', 'Baja · Charter · 120 pts'].forEach((name) => {
    expect(screen.getByRole('button', { name })).toBeEnabled();
  });
});

// The sign on the map says the fare short (and a free ground's sign is its name alone), so every
// label stays a fifth of a phone map wide; the button's name keeps the whole of it for a screen
// reader.
test('says the fare short on each sign and in full in its name', () => {
  render(<BiomeMap biome="offshore" chartered onSelect={jest.fn()} onShop={jest.fn()} quests={ALL_QUESTS_DONE} member={false} />);
  expect(screen.getByRole('button', { name: 'Offshore · Chartered for this trip' })).toHaveTextContent(/^OffshoreChartered$/);
  expect(screen.getByRole('button', { name: 'The Canyon · Charter · 80 pts' })).toHaveTextContent(/^The Canyon80 pts$/);
  expect(screen.getByRole('button', { name: 'River · Free' })).toHaveTextContent(/^River$/);
});

test('a charter club member\'s signs say Club', () => {
  render(<BiomeMap biome="river" chartered={false} onSelect={jest.fn()} onShop={jest.fn()} member />);
  expect(screen.getByRole('button', { name: 'Offshore · Charter · club member' })).toHaveTextContent(/^OffshoreClub$/);
});

test('shows the charter as paid for once you are out there', () => {
  render(<BiomeMap biome="offshore" chartered onSelect={jest.fn()} onShop={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Offshore · Chartered for this trip' })).toHaveAttribute('aria-pressed', 'true');
});

test('picking a ground and visiting the shop call back with the right thing', async () => {
  const onSelect = jest.fn(); const onShop = jest.fn();
  render(<BiomeMap biome="river" chartered={false} onSelect={onSelect} onShop={onShop} />);
  await userEvent.click(screen.getByRole('button', { name: 'Swamp · Free' }));
  expect(onSelect).toHaveBeenCalledWith('swamp');
  await userEvent.click(screen.getByRole('button', { name: 'Tackle shop' }));
  expect(onShop).toHaveBeenCalled();
});

// The map is painted with a place for every ground, and the hotspots are read off it; a ground
// added to BIOMES without a place on the map would never be reachable.
test('has exactly one hotspot for every ground', () => {
  expect(HOTSPOTS.map((spot) => spot.biome).sort()).toEqual(Object.keys(BIOMES).sort());
});

// The painting is stored at its native art resolution (scripts/roomGrid.mjs), lossless, and the
// component's idea of its size is what the file says: the label spacing below depends on it.
test('knows the map painting\'s size', () => {
  const b = readFileSync(path.join(__dirname, '..', '..', 'assets', 'scenes', 'map.webp'));
  expect(b.toString('ascii', 12, 16)).toBe('VP8L');
  const bits = b.readUInt32LE(21);
  expect({ width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }).toEqual(MAP_ART_SIZE);
});

// The derby grounds fly the pennant from the pin, not the sign.
test('flies the derby pennant from the pin of each derby ground', () => {
  const { container } = render(<BiomeMap biome="river" chartered={false} onSelect={jest.fn()} onShop={jest.fn()} derby={{ grounds: ['bay', 'pier'] }} />);
  const flagged = [...container.querySelectorAll('.map-derby-flag')].map((flag) => flag.closest('.map-hotspot').getAttribute('aria-label'));
  expect(flagged).toEqual(['Bay · Free', 'The Pier · Free']);
  container.querySelectorAll('.map-derby-flag').forEach((flag) => expect(flag.parentElement).toHaveClass('map-stake'));
});

// The map at a whole multiple of its art pixels where that costs at most a fifth of its width, and
// filling the panel otherwise (and wherever an art pixel is already three device pixels or more).
test('draws the map at a whole number of device pixels an art pixel only where it can afford to', () => {
  expect(mapFit(344, 3)).toBeNull(); // a phone: 2.6 device px an art px, fills
  expect(mapFit(676, 2)).toBeNull(); // a tablet: 3.4, fills
  expect(mapFit(540, 1)).toBeNull(); // a 1x laptop: 1x would lose a quarter, fills at 1.36
  expect(mapFit(900, 1)).toBe(792); // a tall 1x monitor: 2x
  expect(mapFit(800, 1)).toBe(792);
  expect(mapFit(550, 1.5)).toBe(528); // 1.5x Windows: two device px an art px
  expect(mapFit(0, 1)).toBeNull();
});

// Every sign, laid out as the browser lays it out. The signs are plank signs in Jersey 10: its
// glyphs advance in whole font pixels (ADVANCE, read off the font's hmtx at 75 units a font pixel),
// the name in capitals on the first line and the fare, when there is one, on the second, each line
// 14 font px (.75em). A phone map is about 340 CSS px wide with a font pixel of 2/3 CSS px and a
// chrome pixel of 1; the smallest desktop map is 528 with a font pixel of 1 and a chrome pixel of 2.
// A sign is its text plus 3 chrome px of plank and 2 of padding each side (1 above and below, 1
// between the lines), at least 44 px wide, hung a stake of 6 chrome px from its pin on its side; its
// tap area is at least 44 px tall. The derby pennant (24 CSS px) stands on the pin, its cloth
// turned away from the sign. No sign may cover a landmark the painting draws (read off map.webp in
// percent), a pin or pennant, or another sign or its tap area, or run off the map.
const ADVANCE = { ' ': 4, "'": 3, 0: 7, 1: 4, 2: 8, 3: 8, 4: 7, 5: 7, 6: 8, 7: 7, 8: 8, 9: 8, '?': 7, A: 8, B: 8, C: 8, D: 8, E: 7, F: 7, G: 8, H: 8, I: 3, J: 7, K: 7, L: 6, M: 10, N: 9, O: 8, P: 8, Q: 8, R: 8, S: 8, T: 7, U: 8, V: 8, W: 11, X: 8, Y: 9, Z: 9, a: 8, b: 8, c: 8, d: 8, e: 8, f: 6, g: 8, h: 8, i: 3, j: 4, k: 7, l: 3, m: 11, n: 8, o: 8, p: 8, q: 8, r: 7, s: 7, t: 6, u: 8, v: 8, w: 11, x: 8, y: 7, z: 8 };
const advance = (text) => [...text].reduce((sum, ch) => sum + ADVANCE[ch], 0);
const LANDMARKS = {
  mountains: [6, 2, 26, 11], lake: [5, 15, 24, 25.5], shop: [7, 24, 20, 38], pier: [31, 49, 36.5, 66.5],
  boat: [74.5, 52, 86.5, 60.5], creekDock: [76.5, 44.5, 81, 49], bayRock: [55, 43.5, 58.5, 47.5], cactus: [4, 69, 8, 79],
};
const LAYOUTS = [{ W: 340, fp: 2 / 3, ui: 1 }, { W: 528, fp: 1, ui: 2 }];
function signTexts(key) {
  if (key === 'shop') return ['TACKLE SHOP'];
  const config = BIOMES[key];
  const name = config.label.toUpperCase();
  if (!config.charterCost) return [name];
  // Every fare the sign can say (Chartered, Club, the full fare, half as a regular) and, while
  // locked, ??? over Ask Cap'n Ray.
  const fares = ['Chartered', 'Club', `${config.charterCost} pts`];
  return config.requiresQuest ? [name, ...fares, '???', "Ask Cap'n Ray"] : [name, ...fares];
}
const inside = (a, b, pad = 0) => a[0] < b[2] + pad && b[0] < a[2] + pad && a[1] < b[3] + pad && b[1] < a[3] + pad;
function layOut({ W, fp, ui }) {
  const H = W * MAP_ART_SIZE.height / MAP_ART_SIZE.width;
  return [...HOTSPOTS.map((s) => ({ ...s, key: s.biome })), { key: 'shop', ...SHOP_HOTSPOT }].map((spot) => {
    const texts = signTexts(spot.key);
    const lines = texts.length > 1 ? 2 : 1;
    const w = Math.max(44, Math.max(...texts.map(advance)) * fp + 10 * ui);
    const h = lines * 14 * fp + (lines - 1) * ui + 8 * ui;
    const px = (spot.x / 100) * W; const py = (spot.y / 100) * H; const stake = 6 * ui;
    const sign = {
      s: [px - w / 2, py + stake, px + w / 2, py + stake + h],
      n: [px - w / 2, py - stake - h, px + w / 2, py - stake],
      e: [px + stake, py - h / 2, px + stake + w, py + h / 2],
      w: [px - stake - w, py - h / 2, px - stake, py + h / 2],
    }[spot.side];
    const midY = (sign[1] + sign[3]) / 2;
    const tap = [sign[0], Math.min(sign[1], midY - 22), sign[2], Math.max(sign[3], midY + 22)];
    const derby = spot.key !== 'shop' && !BIOMES[spot.key].requiresQuest;
    const pin = !derby ? [px - 3, py - 3, px + 3, py + 3]
      : spot.side === 'e' ? [px - 21, py - 24, px + 3, py + 3]
        : spot.side === 'n' ? [px - 3, py - 3, px + 21, py + 24] : [px - 3, py - 24, px + 21, py + 3];
    return { name: spot.key, sign, tap, pin, H };
  });
}

test('hangs every sign beside its pin, clear of the landmarks, the pins and the other signs', () => {
  const clashes = [];
  LAYOUTS.forEach((layout) => {
    const spots = layOut(layout);
    const { W } = layout; const H = spots[0].H;
    spots.forEach((a) => {
      if (a.sign[0] < 0 || a.sign[1] < 0 || a.sign[2] > W || a.sign[3] > H) clashes.push(`${W}: ${a.name} runs off the map`);
      if (inside(a.sign, a.pin)) clashes.push(`${W}: ${a.name} covers its own pin`);
      Object.entries(LANDMARKS).forEach(([landmark, box]) => {
        if (inside(a.sign, [box[0] / 100 * W, box[1] / 100 * H, box[2] / 100 * W, box[3] / 100 * H])) clashes.push(`${W}: ${a.name} covers the ${landmark}`);
      });
      spots.forEach((b) => {
        if (a === b) return;
        if (inside(a.sign, b.sign, 2)) clashes.push(`${W}: ${a.name} and ${b.name} overlap`);
        if (inside(a.tap, b.sign)) clashes.push(`${W}: ${a.name}'s tap area covers ${b.name}`);
        if (inside(a.sign, b.pin)) clashes.push(`${W}: ${a.name} covers ${b.name}'s pin`);
      });
    });
  });
  expect(clashes).toEqual([]);
});

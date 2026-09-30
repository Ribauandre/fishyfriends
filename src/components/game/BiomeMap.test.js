import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BiomeMap, { HOTSPOTS, SHOP_HOTSPOT, MAP_ART_SIZE } from './BiomeMap';
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

// The sign on the map says the fare short, so every label stays a fifth of a phone map wide; the
// button's name keeps the whole of it for a screen reader.
test('says the fare short on each sign and in full in its name', () => {
  render(<BiomeMap biome="offshore" chartered onSelect={jest.fn()} onShop={jest.fn()} quests={ALL_QUESTS_DONE} member={false} />);
  expect(screen.getByRole('button', { name: 'Offshore · Chartered for this trip' })).toHaveTextContent(/^OffshoreChartered$/);
  expect(screen.getByRole('button', { name: 'The Canyon · Charter · 80 pts' })).toHaveTextContent(/^The Canyon80 pts$/);
  expect(screen.getByRole('button', { name: 'River · Free' })).toHaveTextContent(/^RiverFree$/);
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

// On a phone the map is about 340 CSS px wide and a label is about a fifth of that. The labels
// are thin plank signs in Pixelify Sans at 10 px, two lines (the ground, then its fare said short:
// "Free", "50 pts", "Club"), measured in Chromium at 390 wide: up to 82 px wide (Mountain Lake)
// and 28 px tall, 14 px wider with the derby flag, which also hangs 6 px past the right edge. No
// two labels may overlap and none may run off the map, where the frame cuts it.
test('keeps every label clear of the others and of the map\'s edges on a phone', () => {
  const W = 340; const H = W * MAP_ART_SIZE.height / MAP_ART_SIZE.width;
  const LW = 82; const LH = 28; const FLAG = 14; const HANG = 6;
  const spots = [...HOTSPOTS, { biome: 'shop', ...SHOP_HOTSPOT }].map((s) => ({ name: s.biome, x: (s.x / 100) * W, y: (s.y / 100) * H }));
  const clashes = [];
  spots.forEach((s) => {
    if (s.x - (LW + FLAG) / 2 < 0 || s.x + (LW + FLAG) / 2 + HANG > W || s.y - LH / 2 < 0 || s.y + LH / 2 > H) clashes.push(`${s.name} runs off the map`);
  });
  spots.forEach((a, i) => spots.slice(i + 1).forEach((b) => {
    if (Math.abs(a.x - b.x) < LW + FLAG && Math.abs(a.y - b.y) < LH) clashes.push(`${a.name} and ${b.name} overlap`);
  }));
  expect(clashes).toEqual([]);
});

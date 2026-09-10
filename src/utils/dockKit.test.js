import { DOCK_KIT, PILING_GAP, pilingsFor, deckTilePct } from './dockKit';
import { SCENE_LAYOUTS } from './sceneLayout';

test('every piece of the kit is measured against the deck band, not the stage', () => {
  Object.values(DOCK_KIT).forEach((piece) => {
    expect(piece.src).toBeDefined();
    expect(piece.w).toBeGreaterThan(0);
    expect(piece.w).toBeLessThan(1);
  });
  // The end post rises above the planks and the piling hangs below them.
  expect(DOCK_KIT.end.top).toBeLessThan(0);
  expect(DOCK_KIT.piling.top).toBeGreaterThan(0);
  expect(DOCK_KIT.piling.top + DOCK_KIT.piling.h).toBeGreaterThan(1);
});

test('pilings march back from the end post at a fixed spacing, so a longer dock gets more', () => {
  const short = pilingsFor({ x1: 100, y: 150, h: 30 });
  const long = pilingsFor({ x1: 300, y: 150, h: 30 });
  expect(long.length).toBeGreaterThan(short.length);
  [short, long].forEach((row) => {
    row.forEach((x) => { expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(row === short ? 100 : 300); });
    // Evenly spaced, and the gap does not change with the dock's length.
    for (let i = 1; i < row.length; i += 1) expect(row[i - 1] - row[i]).toBeCloseTo(30 * PILING_GAP, 1);
  });
  expect(pilingsFor(null)).toEqual([]);
});

test('the deck tile is sized against the dock, which is what background-size reads it against', () => {
  const dock = { x1: 200, y: 150, h: 30 };
  expect(deckTilePct(dock)).toBeCloseTo(((30 * DOCK_KIT.deck.w) / 200) * 100, 2);
  // A deeper dock gets wider planks; a longer one gets more of them at the same size.
  expect(deckTilePct({ ...dock, h: 60 })).toBeGreaterThan(deckTilePct(dock));
  expect(deckTilePct({ ...dock, x1: 400 })).toBeLessThan(deckTilePct(dock));
});

test('the docks the shore grounds share are all the same one', () => {
  const docks = ['river', 'mountainlake', 'swamp', 'bay', 'shoreline'].map((biome) => SCENE_LAYOUTS[biome].dock);
  docks.forEach((dock) => expect(dock).toEqual(docks[0]));
  expect(pilingsFor(docks[0]).length).toBeGreaterThanOrEqual(2);
});

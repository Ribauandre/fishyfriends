import {
  stageGrid, cellAt, snapX, snapY, cellsPath, lineCells, quadPoints, ringCells, discCells, glowBands, BOBBER, spriteCells, plusCells,
} from './stagePixels';
import { ART_PX, frameFor } from './sceneLayout';

const grid = stageGrid(frameFor(480), ART_PX);

test('the stage grid is the painting\'s art grid: an art pixel of the painting, from the painting\'s corner', () => {
  expect(grid.cell).toBeCloseTo(4 / 3, 5);
  expect(grid.oy).toBe(0);
  const wide = stageGrid(frameFor(720, 'center'), ART_PX);
  expect(wide.cell).toBeCloseTo(2, 5);
  expect(wide.oy).toBe(-67.5);
  expect(snapX(grid, 10.1)).toBeCloseTo(10.67, 2);
  expect(snapY(wide, 0)).toBeCloseTo(0.5, 2);
  expect(cellAt(grid, 1.4, 2.7)).toEqual([1, 2]);
});

test('cells become one path of whole-pixel rectangles, a row\'s run merged into one', () => {
  const d = cellsPath([[0, 0], [1, 0], [2, 0], [5, 0], [0, 1]], { cell: 2, ox: 0, oy: 0 });
  expect(d).toBe('M0 0h6v2h-6zM10 0h2v2h-2zM0 2h2v2h-2z');
  expect(cellsPath([[0, 0]], { cell: 2, ox: 0, oy: 0 }, [3, 1])).toBe('M6 2h2v2h-2z');
});

test('a line is one pixel wide: it never steps as an L, and it runs end to end', () => {
  const g = { cell: 1, ox: 0, oy: 0 };
  const cells = lineCells(quadPoints([0.5, 0.5], [20, -10], [40.5, 30.5]), g);
  expect(cells[0]).toEqual([0, 0]);
  expect(cells[cells.length - 1]).toEqual([40, 30]);
  for (let n = 1; n < cells.length; n += 1) {
    // Neighbours touch (8-connected)…
    expect(Math.max(Math.abs(cells[n][0] - cells[n - 1][0]), Math.abs(cells[n][1] - cells[n - 1][1]))).toBe(1);
  }
  for (let n = 2; n < cells.length; n += 1) {
    // …and no three make an L (a, c diagonal neighbours with b between them).
    const [a, c] = [cells[n - 2], cells[n]];
    expect(Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1).toBe(false);
  }
  // A straight run is exactly its length in cells.
  expect(lineCells([[0.5, 0.5], [9.5, 0.5]], g)).toHaveLength(10);
});

test('a ring is a closed one-pixel outline, round when rx = ry, and a disc fills it', () => {
  const ring = ringCells(6, 6);
  const keys = new Set(ring.map(([i, j]) => `${i},${j}`));
  expect(keys.size).toBe(ring.length);
  // Every ring cell has a ring neighbour on each side along the outline (no gaps): at least two.
  ring.forEach(([i, j]) => {
    let near = 0;
    for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) if ((di || dj) && keys.has(`${i + di},${j + dj}`)) near += 1;
    expect(near).toBeGreaterThanOrEqual(2);
  });
  // Round: as wide as it is tall.
  const xs = ring.map(([i]) => i); const ys = ring.map(([, j]) => j);
  expect(Math.max(...xs) - Math.min(...xs)).toBe(Math.max(...ys) - Math.min(...ys));
  expect(discCells(3, 3).length).toBeGreaterThan(ring.length / 2);
});

test('a glow is bands that never overlap, the outermost a checkerboard', () => {
  const bands = glowBands(9, 6);
  expect(bands).toHaveLength(3);
  const seen = new Set();
  bands.flat().forEach(([i, j]) => { const k = `${i},${j}`; expect(seen.has(k)).toBe(false); seen.add(k); });
  bands[2].forEach(([i, j]) => expect(Math.abs((i + j) % 2)).toBe(0));
});

test('the float stands on the water: its last row is the waterline, keylined, red over white', () => {
  const key = spriteCells(BOBBER, 'k');
  expect(Math.max(...key.map(([, j]) => j))).toBe(0);
  expect(Math.min(...key.map(([, j]) => j))).toBe(-(BOBBER.length - 1));
  expect(spriteCells(BOBBER, 'r').length).toBeGreaterThan(0);
  expect(spriteCells(BOBBER, 'w').length).toBeGreaterThan(0);
  expect(plusCells(2)).toHaveLength(9);
});

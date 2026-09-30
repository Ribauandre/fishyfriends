// The stage's own marks — the line, the bobber, the rings on the water, the splash, the lamp's
// light — drawn as pixel art on the world's art grid (sceneLayout's ART_PX) rather than as
// smooth vector strokes, so they sit with the painting and the sprites instead of on top of them.
// Everything here is pure: shapes are lists of art-pixel cells, and cellsPath turns cells into
// one SVG path on a grid laid over the stage (GameScene draws it with crispEdges). A grid is
// { cell, ox, oy }: the size of an art pixel in stage units and where the painting's (0, 0) is.

const round2 = (value) => Math.round(value * 100) / 100;

// The stage grid for a frame: an art pixel is ART_PX painting units, k stage units each, and the
// painting's top-left is at x 0, y -cropTop * k.
export function stageGrid(frame, artPx) {
  return { cell: artPx * frame.k, ox: 0, oy: round2(-frame.cropTop * frame.k) || 0 };
}

// A stage point's cell, and a cell's top-left corner back in stage units.
export const cellAt = (grid, x, y) => [Math.floor((x - grid.ox) / grid.cell), Math.floor((y - grid.oy) / grid.cell)];
export const cellX = (grid, i) => round2(grid.ox + i * grid.cell);
export const cellY = (grid, j) => round2(grid.oy + j * grid.cell);
// A stage coordinate moved onto the nearest cell edge, so a mark placed there lines up with the art.
export const snapX = (grid, x) => cellX(grid, Math.round((x - grid.ox) / grid.cell));
export const snapY = (grid, y) => cellY(grid, Math.round((y - grid.oy) / grid.cell));

// One SVG path for a set of cells: each row's runs of neighbouring cells become one rectangle.
// `at` offsets the cells (a shape drawn around a point).
export function cellsPath(cells, grid, at = [0, 0]) {
  const rows = new Map();
  cells.forEach(([i, j]) => {
    const row = j + at[1];
    if (!rows.has(row)) rows.set(row, new Set());
    rows.get(row).add(i + at[0]);
  });
  const c = grid.cell;
  const parts = [];
  [...rows.keys()].sort((a, b) => a - b).forEach((j) => {
    const xs = [...rows.get(j)].sort((a, b) => a - b);
    let start = xs[0];
    for (let n = 1; n <= xs.length; n += 1) {
      if (n === xs.length || xs[n] !== xs[n - 1] + 1) {
        parts.push(`M${cellX(grid, start)} ${cellY(grid, j)}h${round2((xs[n - 1] - start + 1) * c)}v${round2(c)}h${round2(-(xs[n - 1] - start + 1) * c)}z`);
        if (n < xs.length) start = xs[n];
      }
    }
  });
  return parts.join('');
}

// The cells a stage-space path crosses, as a one-pixel line: sampled finely, every cell it
// passes through, then thinned so it never steps as an L (the corner cell of a diagonal step is
// dropped), which is how a pixel artist draws a line.
export function lineCells(points, grid) {
  const cells = [];
  const push = (cell) => {
    const last = cells[cells.length - 1];
    if (!last || last[0] !== cell[0] || last[1] !== cell[1]) cells.push(cell);
  };
  for (let n = 0; n < points.length - 1; n += 1) {
    const [x0, y0] = points[n];
    const [x1, y1] = points[n + 1];
    const steps = Math.max(1, Math.ceil((Math.hypot(x1 - x0, y1 - y0) / grid.cell) * 3));
    for (let s = 0; s <= steps; s += 1) push(cellAt(grid, x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps));
  }
  // An L — a, b, c where a and c touch diagonally — loses its corner b.
  const thin = [];
  cells.forEach((cell) => {
    thin.push(cell);
    while (thin.length >= 3) {
      const [a, , c] = thin.slice(-3);
      if (Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1) thin.splice(thin.length - 2, 1);
      else break;
    }
  });
  return thin;
}

// A quadratic curve from p0 through the control point c to p1, as a polyline.
export function quadPoints(p0, c, p1, n = 24) {
  const points = [];
  for (let s = 0; s <= n; s += 1) {
    const t = s / n;
    const u = 1 - t;
    points.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]);
  }
  return points;
}

// A one-pixel ellipse outline rx by ry art pixels round (0, 0): each column's top and bottom
// cell and each row's left and right, so the outline has no gaps at any aspect.
export function ringCells(rx, ry) {
  const seen = new Set();
  const cells = [];
  const add = (i, j) => { const key = `${i},${j}`; if (!seen.has(key)) { seen.add(key); cells.push([i, j]); } };
  for (let i = -rx; i <= rx; i += 1) {
    const dy = Math.round(ry * Math.sqrt(Math.max(0, 1 - (i / rx) ** 2)));
    add(i, dy); add(i, -dy);
  }
  for (let j = -ry; j <= ry; j += 1) {
    const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / ry) ** 2)));
    add(dx, j); add(-dx, j);
  }
  return cells;
}

// A filled ellipse, rx by ry art pixels round (0, 0).
export function discCells(rx, ry) {
  const cells = [];
  for (let j = -ry; j <= ry; j += 1) {
    const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2)));
    for (let i = -dx; i <= dx; i += 1) cells.push([i, j]);
  }
  return cells;
}

// Bands of light, brightest in the middle: nested discs with each outer band only the cells the
// inner ones do not cover, the outermost on a checkerboard — the dithered edge a pixel artist
// fades a glow out with instead of a gradient.
export function glowBands(rx, ry, bands = 3) {
  const taken = new Set();
  const out = [];
  for (let b = 1; b <= bands; b += 1) {
    const cells = discCells(Math.max(1, Math.round((rx * b) / bands)), Math.max(1, Math.round((ry * b) / bands)))
      .filter(([i, j]) => !taken.has(`${i},${j}`));
    cells.forEach(([i, j]) => taken.add(`${i},${j}`));
    out.push(b === bands ? cells.filter(([i, j]) => (i + j) % 2 === 0) : cells);
  }
  return out;
}

// The float on the water: a red-over-white bobber with the world's keyline, five art pixels
// across, standing on the surface (its last row is the waterline, cell row 0; the rest is above
// it). Colours by letter: k keyline, r red, w white, h a highlight.
export const BOBBER = [
  '..k..',
  '..k..',
  '.krk.',
  'khrrk',
  'kwwwk',
  '.kwk.',
];
export function spriteCells(rows, colour) {
  const cells = [];
  const h = rows.length;
  const w = rows[0].length;
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === colour) cells.push([i - Math.floor(w / 2), j - (h - 1)]); }));
  return cells;
}

// A glint: a plus sign `arm` art pixels out from its centre.
export function plusCells(arm) {
  const cells = [[0, 0]];
  for (let n = 1; n <= arm; n += 1) cells.push([n, 0], [-n, 0], [0, n], [0, -n]);
  return cells;
}

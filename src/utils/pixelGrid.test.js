import { gridImage, parseDrawing, toImage, outline, cloudTones, ditherEdge, hexToRgb } from '../../scripts/pixelGrid.mjs';

// scripts/pixelGrid.mjs is how every prop, critter and icon in the game got onto the world's art
// pixel; these hold the rules it is trusted for: a render at a few pixels to the art pixel comes
// back as exactly the art, in flat colours, with hard alpha and the world's keyline.
const KEY = '130f0c';
const hex = (img, x, y) => { const i = (y * img.width + x) * 4; return img.data[i + 3] ? [0, 1, 2].map((j) => img.data[i + j].toString(16).padStart(2, '0')).join('') : null; };

// A little sprite (a navy-outlined orange box with a cream stripe), rendered the way the model
// renders: every art pixel a 5 x 5 block, a softened ring of in-between colour where blocks meet,
// and a half-transparent halo round the outside.
const ART = [
  '..KKKKKK..',
  '.KooooooK.',
  'KooooooooK',
  'KccccccccK',
  'KooooooooK',
  '.KKKKKKKK.',
];
const COLOURS = { K: [30, 43, 61], o: [226, 115, 34], c: [246, 215, 158] };
function render(art, p) {
  const w = art[0].length * p, h = art.length * p;
  const data = Buffer.alloc(w * h * 4);
  const at = (x, y) => art[Math.floor(y / p)]?.[Math.floor(x / p)] || '.';
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const ch = at(x, y);
    const i = (y * w + x) * 4;
    if (ch === '.') {
      const near = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].find((c) => c !== '.');
      if (near) { data.set([...COLOURS[near], 90], i); }
      continue;
    }
    let rgb = COLOURS[ch];
    const other = [at(x + 1, y), at(x, y + 1)].find((c) => c !== '.' && c !== ch);
    if (other && (x % p === p - 1 || y % p === p - 1)) rgb = rgb.map((v, k) => Math.round((v + COLOURS[other][k]) / 2));
    data.set([...rgb, 255], i);
  }
  return { width: w, height: h, data };
}

test('a render at five pixels to the art pixel comes back as exactly the art, in the world\'s keyline', () => {
  const { image } = gridImage(render(ART, 5), { pitch: 5, colors: 2 });
  expect(image.width).toBe(ART[0].length);
  expect(image.height).toBe(ART.length);
  const o = hex(image, 3, 1), c = hex(image, 3, 3);
  ART.forEach((row, y) => [...row].forEach((ch, x) => {
    const got = hex(image, x, y);
    if (ch === '.') expect(got).toBeNull();
    else if (ch === 'K') expect(got).toBe(KEY);
    else expect(got).toBe(ch === 'o' ? o : c);
  }));
  expect(o).not.toBe(c);
});

test('a render downscaled to fewer rows keeps hard alpha and a closed one-pixel keyline', () => {
  const { image } = gridImage(render(ART, 5), { rows: 4, colors: 2 });
  expect(image.height).toBeLessThanOrEqual(4);
  for (let i = 0; i < image.width * image.height; i += 1) expect([0, 255]).toContain(image.data[i * 4 + 3]);
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (!hex(image, x, y)) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx < 0 || y + dy < 0 || x + dx >= image.width || y + dy >= image.height || !hex(image, x + dx, y + dy));
    if (edge) expect(hex(image, x, y)).toBe(KEY);
  }
});

test('an outline the vote drew two pixels thick is thinned to one, and a line meeting it is kept', () => {
  // K = keyline, o = fill; the top edge is doubled, and a line runs down the middle to meet it.
  const rows = [
    'KKKKKKK',
    'KKKKKKK',
    'KooKooK',
    'KooKooK',
    'KKKKKKK',
  ];
  const art = { width: 7, height: 5, palette: [hexToRgb(KEY), [200, 100, 50]], cls: Int16Array.from(rows.join('').split('').map((c) => (c === 'K' ? 0 : 1))) };
  outline(art, 'force');
  const img = toImage(art);
  expect([1, 2, 4, 5].map((x) => hex(img, x, 1))).toEqual(['c86432', 'c86432', 'c86432', 'c86432']);
  expect(hex(img, 3, 1)).toBe(KEY);
  [0, 1, 2, 3, 4, 5, 6].forEach((x) => expect(hex(img, x, 0)).toBe(KEY));
});

test('drawings parse to strips of equal frames, and a stray letter is an error, not a silent colour', () => {
  const frames = parseDrawing('a #ff0000\n\nKa\naK\n---\naK\nKa\n');
  expect(frames).toHaveLength(2);
  expect(hex(frames[0], 0, 0)).toBe(KEY);
  expect(hex(frames[0], 1, 0)).toBe('ff0000');
  expect(() => parseDrawing('a #ff0000\n\nKb\n')).toThrow(/unknown colour/);
  expect(() => parseDrawing('a #ff0000\n\nKa\n---\nKaa\n')).toThrow(/frame 1/);
});

test('a cloud is four flat tones and no keyline', () => {
  const art = { width: 6, height: 4, palette: [hexToRgb(KEY), [250, 250, 250]], cls: new Int16Array(24).fill(1) };
  [0, 5, 18, 23].forEach((i) => { art.cls[i] = -1; });
  cloudTones(art, ['#ffffff', '#e0e0e0', '#b0b0b0', '#808080']);
  const colours = new Set();
  art.cls.forEach((c) => { if (c >= 0) colours.add(c); });
  expect(colours.has(0)).toBe(false);
  expect(colours.size).toBeLessThanOrEqual(4);
  expect(art.cls[3 * 6 + 2]).toBe(4); // the bottom edge is the rim
  expect(art.cls[0 * 6 + 2]).toBe(1); // the top edge is lit
});

test('a dithered edge keeps only a checkerboard of the outer ring', () => {
  const art = { width: 6, height: 6, palette: [hexToRgb(KEY), [6, 14, 18]], cls: new Int16Array(36).fill(1) };
  ditherEdge(art);
  for (let y = 0; y < 6; y += 1) for (let x = 0; x < 6; x += 1) {
    const ring = x === 0 || y === 0 || x === 5 || y === 5;
    if (!ring) expect(art.cls[y * 6 + x]).toBe(1);
    else expect(art.cls[y * 6 + x] >= 0).toBe((x + y) % 2 === 0);
  }
});

import { runJob, keyBorder, onGround } from '../../scripts/pixelGrid.mjs';

// The NPC portraits (art/npcs/grid.json) are busts rendered on a flat ground: the ground is keyed
// out from the border, the shoulders run off the bottom edge, and what is left is put on the one
// plain ground all three share. These hold the three steps pixelGrid.mjs does for them.
const KEY = [19, 15, 12]; // #130f0c
const GROUND = [42, 58, 72]; // #2a3a48
const SLATE = [46, 69, 104]; // what the model painted behind the bust
const FACE = [220, 140, 80];

// A 16-cell "bust" at 8 px to the cell: slate ground, a keylined face block whose sides run off
// the bottom edge, and one cell of slate enclosed inside the face (an eye's white that happens to
// be the ground's colour — it must not be keyed out).
function bust() {
  const p = 8, cells = 16, w = cells * p; const data = Buffer.alloc(w * w * 4);
  const cellAt = (cx, cy) => {
    if (cx < 4 || cx > 11 || cy < 4) return SLATE;
    if (cx === 4 || cx === 11 || cy === 4) return KEY;
    if (cx === 7 && cy === 8) return SLATE;
    return FACE;
  };
  for (let y = 0; y < w; y += 1) for (let x = 0; x < w; x += 1) data.set([...cellAt(Math.floor(x / p), Math.floor(y / p)), 255], (y * w + x) * 4);
  return { width: w, height: w, data };
}
const at = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };

test('keyBorder takes the ground out from the edges, and leaves the same colour enclosed in the figure', () => {
  const keyed = keyBorder(bust(), 0.05);
  expect(at(keyed, 2, 2)[3]).toBe(0);
  expect(at(keyed, 2, 127)[3]).toBe(0);
  expect(at(keyed, 60, 70)[3]).toBe(255); // the face
  expect(at(keyed, 7 * 8 + 4, 8 * 8 + 4)).toEqual([...SLATE, 255]); // enclosed, kept
});

test('onGround puts one flat colour behind what is transparent and nothing else', () => {
  const img = { width: 2, height: 1, data: Buffer.from([0, 0, 0, 0, ...FACE, 255]) };
  const out = onGround(img, '2a3a48');
  expect(at(out, 0, 0)).toEqual([...GROUND, 255]);
  expect(at(out, 1, 0)).toEqual([...FACE, 255]);
});

test('a bust that bleeds off the bottom keeps its keyline on the sides and none along the cut', () => {
  const { image } = runJob({ src: bust(), rows: 16, crop: false, trim: false, colors: 4, keyBorder: 0.05, bleed: 'bottom', ground: '2a3a48' });
  expect([image.width, image.height]).toEqual([16, 16]);
  const row = (y) => [...Array(16).keys()].map((x) => at(image, x, y).slice(0, 3).join(','));
  // the ground round the figure is the shared ground, opaque everywhere
  expect(at(image, 0, 0)).toEqual([...GROUND, 255]);
  for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) expect(at(image, x, y)[3]).toBe(255);
  // the sides and top of the figure are the keyline; the bottom row of the face is face, not a line
  expect(row(10)[4]).toBe(KEY.join(','));
  expect(row(10)[11]).toBe(KEY.join(','));
  expect(row(15).slice(5, 11).every((c) => c !== KEY.join(','))).toBe(true);
});

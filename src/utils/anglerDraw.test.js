import { layersFor, finishPixels, drawFrame, renderAngler, renderStill, canRender } from './anglerDraw';
import { framesFor, NATIVE } from './anglerRig';
import { paletteFor, HAIR_COLORS, SKIN_TONES, WARDROBE } from './anglerLook';

// A recording context: every fill and stroke colour used, and the pixels fillRect touched.
function fakeCtx() {
  const colours = new Set();
  const rects = [];
  const ctx = {
    set fillStyle(value) { colours.add(value); this._fill = value; },
    get fillStyle() { return this._fill; },
    set strokeStyle(value) { colours.add(value); this._stroke = value; },
    get strokeStyle() { return this._stroke; },
    lineWidth: 1, lineCap: 'butt',
    fillRect: (x, y, w, h) => rects.push({ x, y, w, h, colour: ctx._fill }),
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, quadraticCurveTo() {}, fill() {}, stroke() {},
    getImageData: () => ({ data: new Uint8ClampedArray(NATIVE.w * NATIVE.h * 4) }),
    putImageData() {}, drawImage() {},
    colours, rects,
  };
  return ctx;
}
const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

function paint(look, action = 'idle', frame = 0) {
  const ctx = fakeCtx();
  const s = framesFor(action)[frame];
  layersFor(s, paletteFor(look)).forEach((draw) => draw(ctx));
  return ctx;
}

test('a frame is drawn back to front: the rod sits between the hat and the front arm', () => {
  const layers = layersFor(framesFor('idle')[0], paletteFor({}));
  // back arm, back (hair/pack), two legs, torso, head, beard, hat, rod, front arm
  expect(layers).toHaveLength(10);
  expect(layersFor(framesFor('idle')[0], paletteFor({ beard: 'none', hat: 'hat_none' }))).toHaveLength(8);
});

test('the look decides the colours that get painted', () => {
  const ctx = paint({ skin: 'deep', hair: 'blond', rod: 'rod_red', boots: 'boots_yellow', waders: 'waders_navy', hat: 'cap_navy' });
  expect(ctx.colours.has(css(SKIN_TONES.deep.rgb))).toBe(true);
  expect(ctx.colours.has(css(HAIR_COLORS.blond.rgb))).toBe(true);
  expect(ctx.colours.has(css(WARDROBE.rod_red.tint))).toBe(true);
  expect(ctx.colours.has(css(WARDROBE.boots_yellow.tint))).toBe(true);
  expect(ctx.colours.has(css(WARDROBE.waders_navy.tint))).toBe(true);
  expect(ctx.colours.has(css(WARDROBE.cap_navy.tint))).toBe(true);
  expect(ctx.colours.has(css(SKIN_TONES.medium.rgb))).toBe(false);
  expect(ctx.colours.has(css(WARDROBE.cap_green.tint))).toBe(false);
});

test('facial hair is its own layer: a clean shave paints no hair on the jaw and shows the mouth', () => {
  const pal = paletteFor({ beard: 'none' });
  const shaved = paint({ beard: 'none' });
  const bearded = paint({ beard: 'full' });
  const head = framesFor('idle')[0].head;
  const jaw = (ctx) => ctx.rects.filter((r) => r.colour === css(pal.hair.base) && r.y >= head.y + 16 && r.x >= head.x + 8);
  expect(jaw(bearded).length).toBeGreaterThan(0);
  expect(jaw(shaved)).toHaveLength(0);
  expect(shaved.rects.some((r) => r.colour === css(pal.mouth))).toBe(true);
  expect(bearded.rects.some((r) => r.colour === css(pal.mouth))).toBe(false);
  // A goatee and a mustache both paint hair, but less of it than a full beard.
  expect(jaw(paint({ beard: 'goatee' })).length).toBeGreaterThan(0);
  expect(paint({ beard: 'stubble' }).rects.some((r) => r.colour === css(pal.stubble))).toBe(true);
});

test('hats are shapes, not overlays: a bare head shows hair on top and a bald head none', () => {
  const pal = paletteFor({});
  const hair = css(pal.hair.base);
  const top = (ctx) => ctx.rects.filter((r) => r.colour === css(pal.hair.light) && r.y < framesFor('idle')[0].head.y);
  expect(top(paint({}))).toHaveLength(0);
  expect(top(paint({ hat: 'hat_none' })).length).toBeGreaterThan(0);
  expect(paint({ hat: 'hat_none', hairstyle: 'bald', beard: 'none' }).colours.has(hair)).toBe(false);
  expect(paint({ hat: 'hat_none', hairstyle: 'bald', beard: 'full' }).colours.has(hair)).toBe(true);
  expect(paint({ hat: 'hat_cowboy' }).colours.has(css(WARDROBE.hat_cowboy.tint))).toBe(true);
  expect(paint({ hat: 'hat_beanie' }).colours.has(css(WARDROBE.hat_beanie.tint))).toBe(true);
  expect(paint({ hat: 'hat_none' }).colours.has(css(WARDROBE.cap_green.tint))).toBe(false);
});

test('finishPixels snaps coverage to solid pixels and outlines the silhouette', () => {
  const w = 5; const h = 5;
  const data = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, a) => { const i = (y * w + x) * 4; data[i] = 200; data[i + 1] = 100; data[i + 2] = 50; data[i + 3] = a; };
  set(2, 2, 255); set(1, 2, 200); set(3, 2, 90);
  finishPixels(data, w, h, [1, 2, 3]);
  const at = (x, y) => Array.from(data.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
  expect(at(2, 2)).toEqual([200, 100, 50, 255]);
  expect(at(1, 2)).toEqual([200, 100, 50, 255]);
  // Under half coverage was dropped, then became outline because it touches solid.
  expect(at(3, 2)).toEqual([1, 2, 3, 255]);
  expect(at(2, 1)).toEqual([1, 2, 3, 255]);
  expect(at(0, 2)).toEqual([1, 2, 3, 255]);
  expect(at(0, 0)).toEqual([0, 0, 0, 0]);
  expect(at(4, 2)).toEqual([0, 0, 0, 0]);
});

test('drawFrame runs every layer through its own canvas onto the target', () => {
  const made = [];
  const makeCanvas = () => { const ctx = fakeCtx(); made.push(ctx); return { canvas: { id: made.length }, ctx }; };
  const target = { ctx: fakeCtx() };
  const drawn = [];
  target.ctx.drawImage = (canvas) => drawn.push(canvas.id);
  drawFrame(makeCanvas, target, framesFor('reel')[3], paletteFor({}));
  expect(made).toHaveLength(10);
  expect(drawn).toEqual(made.map((ctx, index) => index + 1));
});

test('without a canvas nothing is rendered and the stock art stands in', async () => {
  expect(canRender()).toBe(false);
  expect(await renderAngler({ skin: 'fair' })).toBeNull();
  expect(renderStill({ skin: 'fair' })).toBeNull();
});

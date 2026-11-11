import compressImage from './compressImage';

// What matters here: nothing leaves this function as the camera wrote it. It is the canvas
// redraw (no metadata by construction), or the original with its metadata cut out, or an
// error. It used to hand back the original, GPS and all, whenever the redraw wasn't smaller
// or couldn't be made.

const ascii = (text) => Array.from(text, (character) => character.charCodeAt(0));
const segment = (marker, payload) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
const GPS_TEXT = 'GPSLatitude 40.4461 N';
function jpegBytes({ padding = 0 } = {}) {
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, [...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, ascii(`http://ns.adobe.com/xap/1.0/\0${GPS_TEXT}`)),
    ...segment(0xdb, Array(65).fill(1)),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    ...Array(padding).fill(0x11),
    0xff, 0xd9,
  ]);
}
const fileOf = (bytes, name, type) => new File([bytes], name, { type });
async function text(file) {
  const buffer = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsArrayBuffer(file); });
  return Buffer.from(buffer).toString('latin1');
}

function fakeCanvas(blob) {
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: jest.fn() }), toBlob: (callback) => callback(blob) };
  jest.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : document.createElementNS('http://www.w3.org/1999/xhtml', tag)));
  return canvas;
}

beforeEach(() => {
  global.createImageBitmap = jest.fn().mockResolvedValue({ width: 4000, height: 3000, close: jest.fn() });
});

afterEach(() => {
  delete global.createImageBitmap;
  jest.restoreAllMocks();
});

test('a big photo goes up as the canvas redraw, scaled to 1920 and named .jpg', async () => {
  const canvas = fakeCanvas(new Blob(['small redraw'], { type: 'image/jpeg' }));
  const original = fileOf(jpegBytes({ padding: 5000 }), 'IMG_0042.JPEG', 'image/jpeg');
  const result = await compressImage(original);
  expect(result).not.toBe(original);
  expect(result.name).toBe('IMG_0042.jpg');
  expect(result.type).toBe('image/jpeg');
  expect([canvas.width, canvas.height]).toEqual([1920, 1440]);
  expect(global.createImageBitmap).toHaveBeenCalledWith(original, { imageOrientation: 'from-image' });
});

test('when the redraw is no smaller, the original goes up — with its metadata cut out', async () => {
  fakeCanvas(new Blob([new Uint8Array(50000)], { type: 'image/jpeg' }));
  const original = fileOf(jpegBytes(), 'small.jpg', 'image/jpeg');
  expect(await text(original)).toContain(GPS_TEXT);
  const result = await compressImage(original);
  expect(result.type).toBe('image/jpeg');
  expect(result.size).toBeLessThan(original.size);
  expect(await text(result)).not.toContain(GPS_TEXT);
});

test('when the browser can\'t draw it, a JPEG still goes up without its metadata', async () => {
  global.createImageBitmap = jest.fn().mockRejectedValue(new Error('cannot decode'));
  const result = await compressImage(fileOf(jpegBytes(), 'catch.jpg', 'image/jpeg'));
  expect(await text(result)).not.toContain(GPS_TEXT);
});

test('a file with nothing to remove is passed through as it is', async () => {
  global.createImageBitmap = jest.fn().mockRejectedValue(new Error('cannot decode'));
  const clean = new Uint8Array([0xff, 0xd8, ...segment(0xdb, Array(65).fill(1)), ...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x11, 0xff, 0xd9]);
  const original = fileOf(clean, 'clean.jpg', 'image/jpeg');
  expect(await compressImage(original)).toBe(original);
});

test('a mislabelled file is uploaded as what it really is', async () => {
  global.createImageBitmap = jest.fn().mockRejectedValue(new Error('cannot decode'));
  const result = await compressImage(fileOf(jpegBytes(), 'photo.heic', 'image/heic'));
  expect(result.type).toBe('image/jpeg');
  expect(result.name).toBe('photo.jpg');
});

test('a photo it can neither draw nor read is refused, never uploaded raw', async () => {
  global.createImageBitmap = jest.fn().mockRejectedValue(new Error('cannot decode'));
  const heic = fileOf(new Uint8Array([0, 0, 0, 0x18, ...ascii('ftypheic'), ...ascii(`Exif ${GPS_TEXT}`)]), 'IMG_1.heic', 'image/heic');
  await expect(compressImage(heic)).rejects.toThrow(/format this can't read/i);
});

test('a format it can draw but not strip goes up as the redraw even when that is bigger', async () => {
  fakeCanvas(new Blob([new Uint8Array(900)], { type: 'image/jpeg' }));
  const gif = fileOf(new Uint8Array([...ascii('GIF89a'), ...ascii(`comment ${GPS_TEXT}`)]), 'spin.gif', 'image/gif');
  const result = await compressImage(gif);
  expect(result.type).toBe('image/jpeg');
  expect(result.name).toBe('spin.jpg');
});

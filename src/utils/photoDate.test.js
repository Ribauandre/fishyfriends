import { parse as parseExif } from 'exifr';
import extractPhotoDate from './photoDate';

jest.mock('exifr', () => ({ parse: jest.fn() }));

const fakeFile = { name: 'catch.jpg', type: 'image/jpeg' };

beforeEach(() => {
  parseExif.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.warn.mockRestore();
});

test('prefers DateTimeOriginal when present', async () => {
  parseExif.mockResolvedValue({ DateTimeOriginal: new Date(2023, 4, 14), CreateDate: new Date(2020, 0, 1) });
  await expect(extractPhotoDate(fakeFile)).resolves.toBe('2023-05-14');
});

test('falls back to CreateDate when DateTimeOriginal is missing', async () => {
  parseExif.mockResolvedValue({ CreateDate: new Date(2021, 10, 3) });
  await expect(extractPhotoDate(fakeFile)).resolves.toBe('2021-11-03');
});

test('falls back to ModifyDate when neither DateTimeOriginal nor CreateDate is present', async () => {
  parseExif.mockResolvedValue({ ModifyDate: new Date(2019, 6, 9) });
  await expect(extractPhotoDate(fakeFile)).resolves.toBe('2019-07-09');
});

test('returns null when the photo has no date tags at all', async () => {
  parseExif.mockResolvedValue(undefined);
  await expect(extractPhotoDate(fakeFile)).resolves.toBeNull();
});

test('returns null and does not throw when exifr rejects (unsupported format)', async () => {
  parseExif.mockRejectedValue(new Error('unsupported file format'));
  await expect(extractPhotoDate(fakeFile)).resolves.toBeNull();
});

test('zero-pads single-digit month and day', async () => {
  parseExif.mockResolvedValue({ DateTimeOriginal: new Date(2024, 0, 5) });
  await expect(extractPhotoDate(fakeFile)).resolves.toBe('2024-01-05');
});

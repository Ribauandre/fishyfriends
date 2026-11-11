import { stripImageMetadata, MIME_FOR_KIND } from './stripImageMetadata';

// Gets a photo ready to upload: smaller, and with nothing in it but the picture.
//
// Most catches come straight off an iPhone camera roll — JPEGs (and HEICs, which iOS Safari
// generally converts at the file picker) in the 3-8MB range, well past what a catch photo
// needs. So the photo is redrawn on a canvas at up to 1920px and saved as a JPEG;
// imageOrientation: 'from-image' has the browser apply the photo's EXIF rotation while it
// decodes, so a portrait shot doesn't come out sideways.
//
// Redrawing also drops the file's metadata, and that matters as much as the size: a phone
// stamps each photo with where it was taken, to a few metres. This used to hand back the
// ORIGINAL file whenever the redraw came out no smaller or the browser couldn't draw it, so
// those photos went up with their GPS position in them (21 had, when it was checked). Now
// nothing reaches the upload as the camera wrote it: it is the redraw, or the original with
// its metadata cut out (stripImageMetadata — lossless, so a small photo isn't recompressed
// for nothing), or it is refused.
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
const EXTENSION_FOR_KIND = { jpeg: 'jpg', png: 'png', webp: 'webp' };

const baseName = (file) => String(file.name || 'photo').replace(/\.[^.]+$/, '');

export function readBytes(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

async function redraw(file, maxDimension, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return blob ? new File([blob], `${baseName(file)}.jpg`, { type: 'image/jpeg' }) : null;
}

// The original, minus its metadata; null if it isn't a JPEG, PNG or WebP this can read.
async function withoutMetadata(file) {
  const result = stripImageMetadata(await readBytes(file));
  if (!result) return null;
  const type = MIME_FOR_KIND[result.kind];
  if (!result.changed && file.type === type) return file;
  return new File([result.bytes], `${baseName(file)}.${EXTENSION_FOR_KIND[result.kind]}`, { type });
}

export default async function compressImage(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  const redrawn = await redraw(file, maxDimension, quality).catch(() => null);
  if (redrawn && redrawn.size < file.size) return redrawn;
  const original = await withoutMetadata(file).catch(() => null);
  if (original) return original;
  if (redrawn) return redrawn;
  throw new Error('That photo is in a format this can\'t read. Try a JPEG or PNG.');
}

// Resizes and re-encodes a photo before upload. Exists because most catches get uploaded
// straight from an iPhone camera roll — modern iPhone JPEGs (and HEICs, which iOS Safari
// generally converts to JPEG at the file picker before we ever see them) routinely land in
// the 3-8MB range, well past what a personal best or catch photo needs to look sharp in the
// app. imageOrientation: 'from-image' makes the browser apply the photo's EXIF rotation
// during decode, so a photo taken in portrait doesn't come out sideways after the resize.
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;

export default async function compressImage(file, { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY } = {}) {
  try {
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
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch (error) {
    console.warn('Could not compress photo, uploading original:', error);
    return file;
  }
}

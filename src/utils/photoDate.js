import { parse as parseExif } from 'exifr';

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Reads a photo's capture date from its EXIF metadata, as a YYYY-MM-DD string, or null if
// the photo has none (common for screenshots or photos that passed through messaging apps,
// which strip metadata).
export default async function extractPhotoDate(file) {
  try {
    const tags = await parseExif(file, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']);
    const takenAt = tags?.DateTimeOriginal || tags?.CreateDate || tags?.ModifyDate;
    if (takenAt instanceof Date && !isNaN(takenAt)) return formatLocalDate(takenAt);
  } catch (exifError) {
    console.warn('Could not read photo date metadata:', exifError);
  }
  return null;
}

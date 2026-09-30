import React from 'react';
import { petSprite } from '../../utils/petSprites';
import { PREVIEW_SCALE } from './AnglerPreview';

// How many CSS pixels an art pixel is on Marina's rack: a whole number, so the pet keeps every
// row of its keyline (a 0.2x pixelated downscale dropped them) and its own proportions — and the
// rack angler's own scale, so the pets, the props and the anglers in the next rack share one pixel
// (at 2 beside an angler at 1, the dog stood two thirds of his height).
export const RACK_PX = PREVIEW_SCALE.small;

// The box a strip's first frame fills at the rack's scale.
export function previewBox(sprite, scale = RACK_PX) {
  return { width: `${sprite.w * scale}px`, height: `${sprite.h * scale}px` };
}

// A dock pet's first sitting frame, for Marina's rack; the free "no pet" is an empty tile.
export default function PetPreview({ petKey }) {
  const sprite = petSprite(petKey)?.idle;
  if (!sprite) return <span className="pet-preview is-none" role="img" aria-label="No pet">none</span>;
  return <span
    className="pet-preview"
    role="img"
    aria-label={petKey.replace('pet_', '')}
    data-pet={petKey}
    style={{ backgroundImage: `url(${sprite.src})`, backgroundSize: `${sprite.frames * 100}% 100%`, ...previewBox(sprite) }}
  />;
}

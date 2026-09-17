import React from 'react';
import { petSprite } from '../../utils/petSprites';

// A dock pet's first sitting frame, for Marina's rack; the free "no pet" is an empty tile.
export default function PetPreview({ petKey }) {
  const sprite = petSprite(petKey);
  if (!sprite) return <span className="pet-preview is-none" role="img" aria-label="No pet">none</span>;
  return <span
    className="pet-preview"
    role="img"
    aria-label={petKey.replace('pet_', '')}
    data-pet={petKey}
    style={{ backgroundImage: `url(${sprite.src})`, backgroundSize: `${sprite.frames * 100}% 100%` }}
  />;
}

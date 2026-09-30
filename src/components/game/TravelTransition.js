import React from 'react';
import { VEHICLE_SPRITES } from '../../utils/gameProps';
import { BIOMES } from '../../utils/gameBiomes';
import { PAINT_H } from '../../utils/sceneLayout';

export const TRAVEL_MS = 1700;

// Getting from one ground to the next on the map is a trip, so the stage shows one: the new
// ground dims to a silhouette, the pickup (or the charter boat, for anything involving a charter)
// drives in, idles while the road (or its wake) runs under it, and drives off, and the new
// backdrop is waiting when the lights come back up. The vehicle is pixel art on the world's art
// pixel — drawn at its own rows in painting units (`k` is the stage's scale, so on a wide stage
// it grows with the painting) — and it moves the way everything in the world does, a step at a
// time. Purely visual: the biome has already switched underneath, and casting early just cuts
// the drive short.
export default function TravelTransition({ vehicle, toBiome, k = 1 }) {
  const label = BIOMES[toBiome]?.label || toBiome;
  const sprite = VEHICLE_SPRITES[vehicle] || VEHICLE_SPRITES.truck;
  return <div className={`scene-travel is-${vehicle}`} data-vehicle={vehicle} role="status" aria-live="polite">
    <div className="travel-road" />
    <img className="travel-vehicle" src={sprite.src} alt="" style={{ height: `${Math.round(((sprite.unitH * k) / PAINT_H) * 10000) / 100}%` }} />
    <p className="travel-label">{vehicle === 'boat' ? 'Running out to' : 'Heading to'} <strong>{label}</strong></p>
  </div>;
}

import React from 'react';
import { VEHICLES } from '../../utils/gameProps';
import { BIOMES } from '../../utils/gameBiomes';

export const TRAVEL_MS = 1700;

// Getting from one ground to the next on the map is a trip, so the stage shows one: the
// scene dims, the pickup (or the charter boat, for anything involving offshore) crosses the
// frame, and the new backdrop is waiting when the lights come back up. Purely visual — the
// biome has already switched underneath, and casting early just cuts the drive short.
export default function TravelTransition({ vehicle, toBiome }) {
  const label = BIOMES[toBiome]?.label || toBiome;
  return <div className={`scene-travel is-${vehicle}`} data-vehicle={vehicle} role="status" aria-live="polite">
    <div className="travel-road" />
    <img className="travel-vehicle" src={VEHICLES[vehicle]} alt="" />
    <p className="travel-label">{vehicle === 'boat' ? 'Running out to' : 'Heading to'} <strong>{label}</strong></p>
  </div>;
}

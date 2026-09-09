import React from 'react';
import { BIOMES } from '../../utils/gameBiomes';
import mapArt from '../../assets/scenes/map.webp';

// The fishing-grounds map is the biome picker: one hotspot per ground, laid over the map's own
// signposts (positions are percentages of the painting), plus the tackle shop, which just
// scrolls you down to Sal. Beach on the map is the 'shoreline' biome key.
const HOTSPOTS = [
  { biome: 'mountainlake', x: 22.7, y: 10.3 },
  { biome: 'swamp', x: 80.8, y: 16.9 },
  { biome: 'river', x: 61.7, y: 37.6 },
  { biome: 'shoreline', x: 36.5, y: 65 },
  { biome: 'bay', x: 80.6, y: 66.7 },
  { biome: 'offshore', x: 85, y: 89.3 },
];
const SHOP_HOTSPOT = { x: 23.3, y: 34.8 };

export default function BiomeMap({ biome, chartered, onSelect, onShop }) {
  return <div className="biome-map">
    <img className="biome-map-art" src={mapArt} alt="Map of the fishing grounds" />
    {HOTSPOTS.map((spot) => {
      const config = BIOMES[spot.biome];
      const active = biome === spot.biome;
      const cost = config.charterCost > 0 ? (chartered && active ? 'Chartered for this trip' : `Charter · ${config.charterCost} pts`) : 'Free';
      return <button
        key={spot.biome}
        type="button"
        className={`map-hotspot ${active ? 'is-active' : ''}`}
        style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
        aria-label={`${config.label} · ${cost}`}
        aria-pressed={active}
        onClick={() => onSelect(spot.biome)}
      >
        <strong>{config.label}</strong>
        <span>{cost}</span>
      </button>;
    })}
    <button
      type="button"
      className="map-hotspot map-hotspot-shop"
      style={{ left: `${SHOP_HOTSPOT.x}%`, top: `${SHOP_HOTSPOT.y}%` }}
      aria-label="Tackle shop"
      onClick={onShop}
    >
      <strong>Tackle shop</strong>
      <span>See Sal</span>
    </button>
  </div>;
}

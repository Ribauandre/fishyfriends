import React from 'react';
import { BIOMES, biomeUnlocked, charterFare, isRegular } from '../../utils/gameBiomes';
import { DERBY_FLAG } from '../../utils/gameProps';
import mapArt from '../../assets/scenes/map.webp';

// The fishing-grounds map is the biome picker: one hotspot per ground, laid over the place the
// map paints for it, plus the tackle shop, which just scrolls you down to Sal. Beach on the map
// is the 'shoreline' biome key. The map is pixel art on the world's own terms (a top-down render
// re-gridded by scripts/roomGrid.mjs onto its own 3.88 px block, stored at MAP_ART_SIZE and drawn
// pixelated) and carries no painted words at all: these labels are the only ones. North is the
// fresh water (the lake under the mountains, the river down to the bay, the swamp), the middle is
// the coast (the town and Sal's, the beach and the town pier, the bay, the salt-marsh creek, the
// charter boat), and along the bottom are the far trips: Baja's desert to the south-west, the
// turquoise Flats to the south and the Canyon's deep water out past the charter boat. The far
// three stay locked rumors until Cap'n Ray's quests are done. The week's derby grounds fly the
// pennant.
//
// Positions are percentages of the painting, read off it. On a phone the map is about 340 CSS px
// wide and a label a fifth of that, so the spots stand in three columns about a third of the map
// apart (16, 34-49, 80) and, within a column, at least 15% of the map's height apart;
// BiomeMap.test.js holds that rule for every pair.
export const MAP_ART_SIZE = { width: 396, height: 264 };
export const HOTSPOTS = [
  { biome: 'mountainlake', x: 16, y: 18 },
  { biome: 'swamp', x: 80, y: 12 },
  { biome: 'river', x: 46, y: 28 },
  { biome: 'creek', x: 80, y: 33 },
  { biome: 'bay', x: 49, y: 45 },
  { biome: 'shoreline', x: 16, y: 51 },
  { biome: 'offshore', x: 80, y: 55 },
  { biome: 'pier', x: 34, y: 67 },
  { biome: 'canyon', x: 80, y: 80 },
  { biome: 'flats', x: 48, y: 84 },
  { biome: 'baja', x: 16, y: 84 },
];
export const SHOP_HOTSPOT = { x: 16, y: 35 };

export default function BiomeMap({ biome, chartered, onSelect, onShop, quests = {}, derby = null, records = {}, member = false }) {
  return <div className="biome-map">
    <img className="biome-map-art" src={mapArt} width={MAP_ART_SIZE.width} height={MAP_ART_SIZE.height} alt="Map of the fishing grounds" />
    {HOTSPOTS.map((spot) => {
      const config = BIOMES[spot.biome];
      const active = biome === spot.biome;
      const unlocked = biomeUnlocked(spot.biome, quests);
      const derbyHere = Boolean(derby?.grounds?.includes(spot.biome));
      if (!unlocked) {
        return <button
          key={spot.biome}
          type="button"
          className="map-hotspot is-locked"
          style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          aria-label={`${config.label} · Locked`}
          disabled
        >
          <strong>???</strong>
          <span>Ask Cap'n Ray</span>
        </button>;
      }
      const cost = config.charterCost > 0 ? (chartered && active ? 'Chartered for this trip' : member ? 'Charter · club member' : `Charter · ${charterFare(config.key, records)} pts${isRegular(config.key, records) ? ' · regular' : ''}`) : 'Free';
      return <button
        key={spot.biome}
        type="button"
        className={`map-hotspot ${active ? 'is-active' : ''} ${derbyHere ? 'has-derby' : ''}`}
        style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
        aria-label={`${config.label} · ${cost}`}
        aria-pressed={active}
        onClick={() => onSelect(spot.biome)}
      >
        {derbyHere && <img className="map-derby-flag" src={DERBY_FLAG} alt="" title="Derby water this week" />}
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

import React, { useLayoutEffect, useRef, useState } from 'react';
import { BIOMES, biomeUnlocked, charterFare, isRegular } from '../../utils/gameBiomes';
import { DERBY_FLAG } from '../../utils/gameProps';
import mapArt from '../../assets/scenes/map.webp';

// The fishing-grounds map is the biome picker: one hotspot per ground, plus the tackle shop, which
// just scrolls you down to Sal. Beach on the map is the 'shoreline' biome key. The map is pixel
// art on the world's own terms (a top-down render re-gridded by scripts/roomGrid.mjs, stored at
// MAP_ART_SIZE and drawn pixelated) and carries no painted words at all: these signs are the only
// ones. North is the fresh water (the lake under the mountains, the river down to the bay, the
// swamp), the middle is the coast (the town and Sal's, the beach and the town pier, the bay, the
// salt-marsh creek, the charter boat), and along the bottom are the far trips: Baja's desert to the
// south-west, the turquoise Flats to the south and the Canyon's deep water out past the charter
// boat. The far three stay locked rumors until Cap'n Ray's quests are done.
//
// Each spot is a pin in the painting (x, y: percentages of it, read off it) and a sign hung beside
// the pin on a short stake, on the `side` given — so the sign never sits on the place it names:
// Sal's bass-roofed shop, the lake, the pier head and the charter boat all stay in view. The week's
// derby grounds fly the pennant from the pin, its cloth turned away from the sign. A free ground's
// sign is its name alone; a charter says its fare short, and a locked one says who to ask.
// BiomeMap.test.js lays every sign out as the browser does, on a phone and on the smallest desktop
// map, and holds that no sign covers a landmark, a pin, its pennant or another sign's tap area.
export const MAP_ART_SIZE = { width: 396, height: 264 };
export const HOTSPOTS = [
  { biome: 'mountainlake', x: 24, y: 20, side: 'e' },
  { biome: 'swamp', x: 70, y: 12, side: 's' },
  { biome: 'river', x: 45, y: 38, side: 'w' },
  { biome: 'creek', x: 70, y: 33, side: 'e' },
  { biome: 'bay', x: 50, y: 46, side: 's' },
  { biome: 'shoreline', x: 24, y: 52, side: 's' },
  { biome: 'offshore', x: 80.5, y: 60.5, side: 's' },
  { biome: 'pier', x: 33.5, y: 66.5, side: 's' },
  { biome: 'canyon', x: 80, y: 80, side: 's' },
  { biome: 'flats', x: 42, y: 82, side: 's' },
  { biome: 'baja', x: 15, y: 80, side: 's' },
];
export const SHOP_HOTSPOT = { x: 13.5, y: 38, side: 's' };

// The map at a whole multiple of its art pixels where that costs little, and filling the panel
// where it would not. `availW` is the CSS width the art could fill, `dpr` the device pixel ratio.
// At three or more device pixels an art pixel the one-pixel wobble of a fractional scale is
// invisible, so the map fills (phones, tablets, 2x laptops); below that it snaps down to a whole
// number of device pixels an art pixel if that keeps at least four fifths of the width (a 1x
// monitor at 792 px or so gets the 2x map), and otherwise fills — on a 1x window about 550-790 px
// wide, a 1x map would lose a quarter of its size and its signs would crowd it, so there the map is
// drawn at about 1.4-1.9x and pixelated, the one fractional raster left in the chrome.
export function mapFit(availW, dpr = 1) {
  if (!(availW > 0) || !(dpr > 0)) return null;
  const devicePerArt = (availW * dpr) / MAP_ART_SIZE.width;
  if (devicePerArt >= 3) return null;
  const k = Math.floor(devicePerArt);
  if (k < 1) return null;
  const width = (MAP_ART_SIZE.width * k) / dpr;
  return width >= availW * 0.8 ? width : null;
}

function useMapFit(ref) {
  const [width, setWidth] = useState(null);
  useLayoutEffect(() => {
    const map = ref.current;
    const parent = map?.parentElement;
    if (!map || !parent || typeof ResizeObserver === 'undefined' || typeof window.getComputedStyle !== 'function') return undefined;
    const measure = () => {
      const style = window.getComputedStyle(map);
      const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
      const cap = parseFloat(style.maxWidth);
      const outer = Math.min(parent.clientWidth, Number.isFinite(cap) ? cap : Infinity);
      const fit = mapFit(outer - border, window.devicePixelRatio || 1);
      setWidth(fit === null ? null : fit + border);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export default function BiomeMap({ biome, chartered, onSelect, onShop, quests = {}, derby = null, records = {}, member = false }) {
  const mapRef = useRef(null);
  const snapped = useMapFit(mapRef);
  return <div className={`biome-map ${snapped ? 'is-snapped' : ''}`} ref={mapRef} style={snapped ? { width: `${snapped}px` } : undefined}>
    <img className="biome-map-art" src={mapArt} width={MAP_ART_SIZE.width} height={MAP_ART_SIZE.height} alt="Map of the fishing grounds" />
    {HOTSPOTS.map((spot) => {
      const config = BIOMES[spot.biome];
      const active = biome === spot.biome;
      const unlocked = biomeUnlocked(spot.biome, quests);
      const derbyHere = Boolean(derby?.grounds?.includes(spot.biome));
      const place = { left: `${spot.x}%`, top: `${spot.y}%` };
      if (!unlocked) {
        return <button
          key={spot.biome}
          type="button"
          className={`map-hotspot is-${spot.side} is-locked`}
          style={place}
          aria-label={`${config.label} · Locked`}
          disabled
        >
          <span className="map-stake" aria-hidden="true" />
          <strong>???</strong>
          <span>Ask Cap'n Ray</span>
        </button>;
      }
      const cost = config.charterCost > 0 ? (chartered && active ? 'Chartered for this trip' : member ? 'Charter · club member' : `Charter · ${charterFare(config.key, records)} pts${isRegular(config.key, records) ? ' · regular' : ''}`) : 'Free';
      // The sign says it short (a label is a fifth of the map wide on a phone): a free ground is
      // its name alone, a charter its fare. The button's name says it all.
      const shortCost = config.charterCost > 0 ? (chartered && active ? 'Chartered' : member ? 'Club' : `${charterFare(config.key, records)} pts`) : null;
      return <button
        key={spot.biome}
        type="button"
        className={`map-hotspot is-${spot.side} ${active ? 'is-active' : ''} ${derbyHere ? 'has-derby' : ''}`}
        style={place}
        aria-label={`${config.label} · ${cost}`}
        aria-pressed={active}
        onClick={() => onSelect(spot.biome)}
      >
        <span className="map-stake" aria-hidden="true">
          {derbyHere && <img className="map-derby-flag" src={DERBY_FLAG} alt="" title="Derby water this week" />}
        </span>
        <strong>{config.label}</strong>
        {shortCost && <span>{shortCost}</span>}
      </button>;
    })}
    <button
      type="button"
      className={`map-hotspot map-hotspot-shop is-${SHOP_HOTSPOT.side}`}
      style={{ left: `${SHOP_HOTSPOT.x}%`, top: `${SHOP_HOTSPOT.y}%` }}
      aria-label="Tackle shop"
      onClick={onShop}
    >
      <span className="map-stake" aria-hidden="true" />
      <strong>Tackle shop</strong>
    </button>
  </div>;
}

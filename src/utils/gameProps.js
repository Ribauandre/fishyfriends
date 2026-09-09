// Prop art for Cast & Catch: the tackle shop's gear and lure icons, the vehicles that carry
// the angler between grounds, and the tackle box. All pixel-art renders in the same style
// as the backdrops, processed to transparent PNGs; nothing here is drawn in code.
import rod from '../assets/props/rod.png';
import line from '../assets/props/line.png';
import reel from '../assets/props/reel.png';
import bait from '../assets/props/bait.png';
import livebait from '../assets/props/livebait.png';
import jerkbait from '../assets/props/jerkbait.png';
import crankbait from '../assets/props/crankbait.png';
import truck from '../assets/props/truck.png';
import boat from '../assets/props/boat.png';
import tacklebox from '../assets/props/tacklebox.png';

export const GEAR_ICONS = { rod, line, reel, bait };
export const LURE_ICONS = { livebait, jerkbait, crankbait };
export const VEHICLES = { truck, boat };
export const TACKLE_BOX = tacklebox;

// Getting offshore (or back from it) means the charter boat; every other trip is the pickup.
export function vehicleFor(fromBiome, toBiome) {
  return fromBiome === 'offshore' || toBiome === 'offshore' ? 'boat' : 'truck';
}

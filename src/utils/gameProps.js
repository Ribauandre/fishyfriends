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
import coin from '../assets/props/coin.png';
import mapicon from '../assets/props/mapicon.png';
import trophyicon from '../assets/props/trophyicon.png';
import bell from '../assets/props/bell.png';
import book from '../assets/props/book.png';
import flag from '../assets/props/flag.png';
import pennant from '../assets/props/pennant.png';
import dryfly from '../assets/props/dryfly.png';
import nymph from '../assets/props/nymph.png';
import streamer from '../assets/props/streamer.png';
import shrimpfly from '../assets/props/shrimpfly.png';
import flyrod from '../assets/props/flyrod.png';
import outfit from '../assets/props/outfit.png';
import crewicon from '../assets/props/crewicon.png';
import questicon from '../assets/props/questicon.png';
import fishshadow from '../assets/props/fishshadow.png';
import logo from '../assets/props/logo.webp';
import { BIOMES } from './gameBiomes';


export const GEAR_ICONS = { rod, line, reel, bait };
export const LURE_ICONS = { livebait, jerkbait, crankbait, dryfly, nymph, streamer, shrimpfly };
// The fly rod on Sal's wall.
export const FLY_ROD_ICON = flyrod;
export const VEHICLES = { truck, boat };
export const TACKLE_BOX = tacklebox;
export const COIN = coin;

// The HUD's signpost buttons: the map for Travel, the tackle box for Sal's, a plaque for the case.
export const HUD_ICONS = { map: mapicon, shop: tacklebox, outfit, almanac: book, trophies: trophyicon, sound: bell };
// The deck's own signposts: who's on the water and Cap'n Ray's notice board.
export const DOCK_ICONS = { crew: crewicon, quests: questicon };
export const DERBY_FLAG = flag;
// The shape under the water while a fish is on: one silhouette for every species, so the
// fight gives nothing away and never loads a sticker — the reveal is the landing.
export const FISH_SHADOW = fishshadow;
// The game's own sticker: on the loading screen, and a beat on the stage once it's up.
export const GAME_LOGO = logo;
// The derby prize: a 3-frame golden pennant strip that flies from the champion's rod tip.
export const GOLDEN_PENNANT = { src: pennant, frames: 3 };

// Getting to a charter ground (or back from one) means Ray's boat; every other trip is the pickup.
export function vehicleFor(fromBiome, toBiome) {
  const charter = (biome) => (BIOMES[biome]?.charterCost || 0) > 0;
  return charter(fromBiome) || charter(toBiome) ? 'boat' : 'truck';
}

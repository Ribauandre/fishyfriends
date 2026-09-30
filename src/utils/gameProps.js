// Prop art for Cast & Catch: the icons (gear, lures, the HUD's and the deck's signposts), the
// lures as they sit on the water, the champion's pennant, the shadow on the line, the critters
// in the sky, the vehicles and the plank signage. Everything is pixel art on the world's one art
// pixel (sceneLayout's ART_PX): stored one file pixel to one art pixel and drawn at a whole
// multiple of it, pixelated, with the angler's own near-black (#130f0c) as the one-pixel keyline.
// The sources and the batch that writes these files are in art/props/ and art/ambient/
// (scripts/pixelGrid.mjs); nothing here is drawn in code.
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
import plank from '../assets/props/plank.png';
import plankThin from '../assets/props/plank_thin.png';
import frame from '../assets/props/frame.png';
import logoPixel from '../assets/props/logo_pixel.png';
import plankGo from '../assets/props/plank_go.png';
import glyphClose from '../assets/props/glyphs/close.png';
import glyphArrow from '../assets/props/glyphs/arrow.png';
import glyphStar from '../assets/props/glyphs/star.png';
import glyphMoon from '../assets/props/glyphs/moon.png';
import lureCrankbait from '../assets/props/lures/crankbait.png';
import lureJerkbait from '../assets/props/lures/jerkbait.png';
import lureDryfly from '../assets/props/lures/dryfly.png';
import lureNymph from '../assets/props/lures/nymph.png';
import lureStreamer from '../assets/props/lures/streamer.png';
import lureShrimpfly from '../assets/props/lures/shrimpfly.png';
import lureLivebait from '../assets/props/lures/livebait.png';
import shadow18 from '../assets/props/shadow/fishshadow_18.png';
import shadow20 from '../assets/props/shadow/fishshadow_20.png';
import shadow23 from '../assets/props/shadow/fishshadow_23.png';
import shadow26 from '../assets/props/shadow/fishshadow_26.png';
import shadow29 from '../assets/props/shadow/fishshadow_29.png';
import shadow33 from '../assets/props/shadow/fishshadow_33.png';
import shadow37 from '../assets/props/shadow/fishshadow_37.png';
import shadow42 from '../assets/props/shadow/fishshadow_42.png';
import shadow47 from '../assets/props/shadow/fishshadow_47.png';
import shadow53 from '../assets/props/shadow/fishshadow_53.png';
import shadow60 from '../assets/props/shadow/fishshadow_60.png';
import shadow67 from '../assets/props/shadow/fishshadow_67.png';
import shadow75 from '../assets/props/shadow/fishshadow_75.png';
import shadow84 from '../assets/props/shadow/fishshadow_84.png';
import shadow94 from '../assets/props/shadow/fishshadow_94.png';
import cloud1 from '../assets/ambient/cloud1.png';
import cloud2 from '../assets/ambient/cloud2.png';
import cloud3 from '../assets/ambient/cloud3.png';
import seagull from '../assets/ambient/seagull.png';
import dragonfly from '../assets/ambient/dragonfly.png';
import dragonflyWings from '../assets/ambient/dragonfly_wings.png';
import { BIOMES } from './gameBiomes';
import { ART_PX } from './sceneLayout';

const units = (px) => px * ART_PX;

// The icon set: every icon is ICON_PX x ICON_PX art pixels (content inside a pixel of margin),
// drawn at a whole multiple of that (24 CSS px is 1x, 48 is 2x), pixelated, never between.
export const ICON_PX = 24;

export const GEAR_ICONS = { rod, line, reel, bait };
export const LURE_ICONS = { livebait, jerkbait, crankbait, dryfly, nymph, streamer, shrimpfly };
// The fly rod on Sal's wall.
export const FLY_ROD_ICON = flyrod;
export const TACKLE_BOX = tacklebox;
export const COIN = coin;

// The HUD's signpost buttons: the map for Travel, the tackle box for Sal's, his vest for Marina's,
// a book for the almanac, a plaque for the case, the dock bell for sound.
export const HUD_ICONS = { map: mapicon, shop: tacklebox, outfit, almanac: book, trophies: trophyicon, sound: bell };
// The deck's own signposts: who's on the water and Cap'n Ray's notice board.
export const DOCK_ICONS = { crew: crewicon, quests: questicon };
// The derby flag: red cloth with the club emblem (the same nine-by-five fish as on the club flag
// on the dock and the champion's pennant).
export const DERBY_FLAG = flag;

// A lure as it sits on the water: much smaller than its icon (a lure on the stage is a lure next
// to a 92-unit angler, not a signpost), facing left with the line tied on at `eye` (art pixels
// in the sprite), so the line from the rod ends on the lure's nose. Live bait draws the bobber
// on the stage; its sprite completes the set.
const lureSprite = (src, w, h, eye) => ({ src, w, h, eye, unitW: units(w), unitH: units(h) });
export const LURE_SPRITES = {
  livebait: lureSprite(lureLivebait, 13, 6, { x: 0, y: 3 }),
  jerkbait: lureSprite(lureJerkbait, 17, 6, { x: 0, y: 3 }),
  crankbait: lureSprite(lureCrankbait, 16, 8, { x: 1, y: 5 }),
  dryfly: lureSprite(lureDryfly, 11, 8, { x: 0, y: 4 }),
  nymph: lureSprite(lureNymph, 12, 6, { x: 0, y: 2 }),
  streamer: lureSprite(lureStreamer, 16, 6, { x: 0, y: 2 }),
  shrimpfly: lureSprite(lureShrimpfly, 14, 6, { x: 0, y: 2 }),
};

// The shape under the water while a fish is on: one silhouette for every fish, so the fight gives
// nothing away and never loads a sticker. It is drawn at the fish's length on one scale for every
// fish (24 + 100 x lengthFraction painting units), and a pixel-art silhouette cannot be scaled to
// any length without its pixels changing size — so it comes in size classes a few per cent apart
// (hard alpha, one near-black, a dithered edge from 29 art pixels long up), and fishShadowFor
// picks the class nearest the length, drawn at its own units.
const SHADOW_CLASSES = [
  [18, 7, shadow18], [20, 8, shadow20], [23, 9, shadow23], [26, 10, shadow26], [29, 11, shadow29],
  [33, 13, shadow33], [37, 14, shadow37], [42, 16, shadow42], [47, 18, shadow47], [53, 21, shadow53],
  [60, 23, shadow60], [67, 26, shadow67], [75, 29, shadow75], [84, 32, shadow84], [94, 36, shadow94],
];
export const FISH_SHADOWS = SHADOW_CLASSES.map(([w, h, src]) => ({ src, w, h, unitW: units(w), unitH: units(h) }));
export function fishShadowFor(lengthUnits) {
  const want = lengthUnits / ART_PX;
  return FISH_SHADOWS.reduce((best, s) => (Math.abs(s.w - want) < Math.abs(best.w - want) ? s : best), FISH_SHADOWS[0]);
}

// The game's logo on the world's art pixel (scripts/pixelFish.mjs --logo, from the sticker the
// game used to show, assets/props/logo.webp, which nothing imports any more so it stays out of the
// build): 150 x 168 art pixels, on the loading screen and for a beat on the stage once the dock is
// up — drawn at a whole multiple of its pixels, pixelated, never rotated.
export const GAME_LOGO_PIXEL = logoPixel;
export const GAME_LOGO_SIZE = { w: 150, h: 168 };
// The derby prize: a golden pennant that flies from the champion's rod tip, three flutter frames
// of 18 x 12 art pixels (24 x 16 painting units — its aspect is 3:2), hoisted along its left edge.
export const GOLDEN_PENNANT = { src: pennant, frames: 3, w: 18, h: 12, unitW: units(18), unitH: units(12) };

// The plank signage, as nine-slices on the art grid: `slice` art pixels of border, the corners
// holding the nails; drawn with border-image `slice fill / (slice x CSS px per art px) round`.
export const PLANK = { src: plank, w: 24, h: 24, slice: 6 };
export const PLANK_THIN = { src: plankThin, w: 12, h: 12, slice: 3 };
// The same plank painted in the club's lime: the sign for the one thing the deck is asking for
// (Cast, and the phase buttons after it), drawn from art/props/plank_go.txt (art/props/chrome.json).
export const PLANK_GO = { src: plankGo, w: 24, h: 24, slice: 6 };
// The chrome's small marks, where a font glyph used to stand in for an icon (×, →, ★, ☾):
// GLYPH_PX x GLYPH_PX art pixels each, in the world's keyline, hand-drawn in art/props/glyphs/
// and drawn at a whole multiple, pixelated, like every other icon.
export const GLYPH_PX = 12;
export const UI_GLYPHS = { close: glyphClose, arrow: glyphArrow, star: glyphStar, moon: glyphMoon };
// The game's outer frame of lashed logs: a nine-slice of 80 x 80 art pixels, 16 of them border.
export const GAME_FRAME = { src: frame, w: 80, h: 80, slice: 16 };

// The sky's critters, at their own size (never stretched to a lane): three clouds, the gull's
// three wing beats (up, level, down, all facing right, the body still) and the dragonfly's two
// (`src`; `still` is the first alone, for anything that draws it as one image).
export const AMBIENT_SPRITES = {
  clouds: [{ src: cloud1, w: 26, h: 18 }, { src: cloud2, w: 24, h: 16 }, { src: cloud3, w: 21, h: 14 }].map((c) => ({ ...c, unitW: units(c.w), unitH: units(c.h) })),
  gull: { src: seagull, frames: 3, w: 18, h: 14, unitW: units(18), unitH: units(14) },
  dragonfly: { src: dragonflyWings, still: dragonfly, frames: 2, w: 12, h: 7, unitW: units(12), unitH: units(7) },
};

// The vehicles of the travel scene, side on, facing right, at their own size on the world grid:
// the pickup about a head taller than the 92-unit angler, as a pickup is (the old art was drawn
// at two world pixels to one of its own and at 0.72 of that), and Ray's boat half again his
// height — a tower boat is several people tall, and this is as big as the stage takes.
export const VEHICLE_SPRITES = {
  truck: { src: truck, w: 121, h: 74, unitW: units(121), unitH: units(74) },
  boat: { src: boat, w: 162, h: 101, unitW: units(162), unitH: units(101) },
};

// Getting to a charter ground (or back from one) means Ray's boat; every other trip is the pickup.
export function vehicleFor(fromBiome, toBiome) {
  const charter = (biome) => (BIOMES[biome]?.charterCost || 0) > 0;
  return charter(fromBiome) || charter(toBiome) ? 'boat' : 'truck';
}

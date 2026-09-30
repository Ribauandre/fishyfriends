// The dock decorations Marina's sells (utils/anglerLook.js, the `decor` slot): a prop drawn
// on your own deck at the layout's `decor` anchor (utils/sceneLayout.js). Each is pixel art on the
// world's one art pixel, drawn by hand in art/props/decor_*.txt (scripts/pixelGrid.mjs writes the
// PNGs): `w` x `rows` art pixels, one file pixel to one art pixel, with the angler's keyline and
// the angler's own colours — the cooler his jeans blue and shirt cream, the rod rack his cap green
// (a painted rack, so it reads as a solid thing against the brown dock and its painted crates
// rather than as a wire frame of brown sticks), the club flag the club's lime with the club fish.
// `h` is its height in painting units, rows x ART_PX, so a pixel on the cooler is a pixel on him;
// drawn at any other height its pixels would not be the world's.
import cooler from '../assets/props/decor_cooler.png';
import rodrack from '../assets/props/decor_rodrack.png';
import flag from '../assets/props/decor_flag.png';
import { ART_PX } from './sceneLayout';

const prop = (src, label, w, rows) => ({ src, label, w, rows, h: rows * ART_PX });

export const DECOR_PROPS = {
  decor_cooler: prop(cooler, 'Cooler', 21, 15),
  decor_rodrack: prop(rodrack, 'Rod rack', 19, 27),
  decor_flag: prop(flag, 'Club flag', 22, 27),
};

export const decorProp = (key) => DECOR_PROPS[key] || null;

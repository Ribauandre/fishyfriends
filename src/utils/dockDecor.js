// The dock decorations Marina's sells (utils/anglerLook.js, the `decor` slot): a prop drawn
// on your own deck at the layout's `decor` anchor (utils/sceneLayout.js), sized in painting
// units like everything else on the stage. Pixel-art renders in the backdrops' style,
// cropped to their alpha; nothing here is drawn in code.
import cooler from '../assets/props/decor_cooler.png';
import rodrack from '../assets/props/decor_rodrack.png';
import flag from '../assets/props/decor_flag.png';

// `h` is the prop's height in painting units at a layout whose decor anchor says 1; a
// layout's own `h` scales it (a boat's deck is closer than a dock's).
export const DECOR_PROPS = {
  decor_cooler: { src: cooler, label: 'Cooler', h: 20 },
  decor_rodrack: { src: rodrack, label: 'Rod rack', h: 34 },
  decor_flag: { src: flag, label: 'Club flag', h: 36 },
};

export const decorProp = (key) => DECOR_PROPS[key] || null;

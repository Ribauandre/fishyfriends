// The dock the stage builds for itself, instead of the one that used to be painted into every
// backdrop: a plank span repeated along its length, pilings set in front of it, and the
// rope-wrapped post at its end. The three pieces are cut from the dock sheet's composed dock
// by scripts/dockDeck.mjs, and every measurement here is a multiple of the deck band's height
// in that art (its 100 rows of planks and the beam under them). So a scene places a dock with
// three numbers — where the planks are, how deep the band is, and where the dock ends — and
// the pieces follow, at any length, without the art being stretched.
import deck from '../assets/props/dock/deck.png';
import piling from '../assets/props/dock/piling.png';
import deckend from '../assets/props/dock/deckend.png';

const BAND = 100;
export const DOCK_KIT = {
  // Repeated along the dock. Only its width matters; it is drawn the depth of the band.
  deck: { src: deck, w: 37 / BAND },
  // A piling stands in front of the deck with its cap level with the front planks, which is
  // where the art puts it, and hangs below into the water.
  piling: { src: piling, w: 45 / BAND, h: 113 / BAND, top: 45 / BAND },
  // The end post carries its own stretch of deck, so it lands on the span's right edge and
  // its cap rises above the planks.
  end: { src: deckend, w: 55 / BAND, h: 198 / BAND, top: -40 / BAND },
};

// How far apart the pilings stand, in deck depths — the spacing the art was drawn at.
export const PILING_GAP = 1.9;

const round2 = (value) => Math.round(value * 100) / 100;

// Where the pilings stand, in painting units, counted back from the end post so the spacing
// stays put and a longer dock gets more of them rather than wider gaps. The last one would sit
// under the end post, which brings its own, so it is skipped.
export function pilingsFor(dock, gap = PILING_GAP) {
  if (!dock) return [];
  const step = dock.h * gap;
  const out = [];
  for (let x = dock.x1 - step; x > step * 0.3; x -= step) out.push(round2(x));
  return out;
}

// The deck tile's width as a share of the dock's own width, which is what background-size
// wants: percentages there are read against the element, not the stage.
export const deckTilePct = (dock) => round2(((dock.h * DOCK_KIT.deck.w) / dock.x1) * 100);

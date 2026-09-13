// The main character's sprite strips, sliced from the angler sheet by scripts/anglerSlice.mjs.
// Every frame sits in the same box with the feet anchored at (feetX, feetY) so actions can
// swap without the figure hopping, and the box carries ten rows of headroom above the bare
// crown so a hat the painter sculpts can rise over it. Frame counts are what the sheet has,
// minus the one cast frame it drew without a rod.
import idle from '../assets/angler/idle.png';
import cast from '../assets/angler/cast.png';
import reel from '../assets/angler/reel.png';
import celebrate from '../assets/angler/celebrate.png';
import hurt from '../assets/angler/hurt.png';

export const SPRITE_FRAME = { w: 250, h: 160, feetX: 80, feetY: 154 };

// The window on a frame that a still preview shows: the figure with its headroom, without
// the run of box the rod's longest arc needs. Frame pixels, at the aspect the preview boxes
// in App.css are cut to.
export const STILL_WINDOW = { x: 0, y: 0, w: 192, h: 160 };

// rodTip is where the line leaves the rod for that strip's held pose, in frame pixels. Where
// the rod runs out of the box — the sheet draws it longer than the frame — the tip is where
// it leaves the frame, which is where the line has to start for the two to meet. Celebrate
// and hurt are drawn with the rod out of shot, so their tip is the raised fist and the
// clasped hands: nothing casts from those poses, but the champion's pennant still flies.
export const ANGLER_SPRITES = {
  idle: { src: idle, frames: 5, rodTip: { x: 118, y: 113 } },
  cast: { src: cast, frames: 4, rodTip: { x: 220, y: 8 } },
  reel: { src: reel, frames: 6, rodTip: { x: 190, y: 0 } },
  celebrate: { src: celebrate, frames: 4, rodTip: { x: 122, y: 34 } },
  hurt: { src: hurt, frames: 3, rodTip: { x: 92, y: 110 } },
};

// What the angler is doing in each phase: which strip, how many frames to step through, and
// whether it plays once (forwards) or loops. The cast swing ends on the rod held out over the
// water, so waiting holds that last frame. The hookset is the reel strip's first beats — the
// rod loading up — and a lost fish gets the sheet's own slump rather than a snap back to idle.
// `holding` only matters while reeling: the loop runs while the player is actually cranking,
// so nothing animates on its own.
export function anglerAction({ phase, result, holding }) {
  switch (phase) {
    case 'casting': return { action: 'cast', play: 4, durationMs: 600 };
    case 'waiting': return { action: 'cast', frame: 3 };
    case 'hookset': return { action: 'reel', play: 3, durationMs: 450 };
    case 'reeling': return holding ? { action: 'reel', play: 6, durationMs: 700, loop: true } : { action: 'reel', frame: 0 };
    case 'result': return result?.success ? { action: 'celebrate', play: 4, durationMs: 500 } : { action: 'hurt', play: 3, durationMs: 500 };
    default: return { action: 'idle', frame: 0 };
  }
}

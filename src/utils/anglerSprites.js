// The main character's sprite strips, sliced from the angler sheet by scripts/anglerSlice.mjs.
// Every frame sits in the same box with the feet anchored at (feetX, feetY) so actions can
// swap without the figure hopping; strips.json beside the art records that box and how many
// frames each strip got, so the two never drift apart.
import strips from '../assets/angler/strips.json';
import idle from '../assets/angler/idle.png';
import cast from '../assets/angler/cast.png';
import reel from '../assets/angler/reel.png';
import fishon from '../assets/angler/fishon.png';
import celebrate from '../assets/angler/celebrate.png';

export const SPRITE_FRAME = strips.box;

// The window on a frame that a still preview shows: the figure and a hat's worth of headroom,
// without the empty run of box the rod's longest arc needs. Frame pixels, at the aspect the
// preview boxes in App.css are cut to.
export const STILL_WINDOW = { x: 2, y: 40, w: 180, h: 150 };

// rodTip is where the line leaves the rod for that strip's held pose, in frame pixels — read
// off the rod in the mask (celebrate has no rod, so it keeps the resting one).
const SOURCES = { idle, cast, reel, fishon, celebrate };
const ROD_TIPS = {
  idle: { x: 174, y: 65 },
  cast: { x: 308, y: 60 },
  reel: { x: 180, y: 54 },
  fishon: { x: 225, y: 51 },
  celebrate: { x: 174, y: 65 },
};
export const ANGLER_SPRITES = Object.fromEntries(Object.entries(SOURCES).map(([action, src]) => [action, { src, frames: strips.actions[action].frames, rodTip: ROD_TIPS[action] }]));

// What the angler is doing in each phase: which strip, how many frames to step through, and
// whether it plays once (forwards) or loops. `holding` only matters while reeling — the loop
// runs while the player is actually cranking, so nothing animates on its own, and the frame it
// rests on between cranks is the braced one the rod tip was measured from.
export function anglerAction({ phase, result, holding }) {
  switch (phase) {
    case 'casting': return { action: 'cast', play: 8, durationMs: 620 };
    case 'waiting': return { action: 'cast', frame: 7 };
    case 'hookset': return { action: 'fishon', play: 3, durationMs: 340 };
    case 'reeling': return holding ? { action: 'reel', play: 4, durationMs: 560, loop: true } : { action: 'reel', frame: 1 };
    case 'result': return result?.success ? { action: 'celebrate', play: 2, durationMs: 420 } : { action: 'idle', frame: 0 };
    default: return { action: 'idle', frame: 0 };
  }
}

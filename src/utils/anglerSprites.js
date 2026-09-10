// The main character's sprite strips, sliced from the angler sheet. Every frame sits in the
// same box with the feet anchored at (feetX, feetY) so actions can swap without the figure
// hopping. The box carries ten rows of headroom above the tallest cap, so a hat the painter
// sculpts can rise above the crown. Frame counts are what the sheet actually has (idle and
// reel are seven).
import idle from '../assets/angler/idle.png';
import cast from '../assets/angler/cast.png';
import reel from '../assets/angler/reel.png';
import fishon from '../assets/angler/fishon.png';
import celebrate from '../assets/angler/celebrate.png';

export const SPRITE_FRAME = { w: 250, h: 160, feetX: 80, feetY: 154 };

// The window on a frame that a still preview shows: the figure with its headroom, without
// the run of box the rod's longest arc needs. Frame pixels, at the aspect the preview boxes
// in App.css are cut to.
export const STILL_WINDOW = { x: 0, y: 0, w: 192, h: 160 };

// rodTip is where the line leaves the rod for that strip's held pose, in frame pixels, read
// off the rod in that strip's own mask. In the poses that matter the rod runs out of the box
// — the sheet drew it longer than the frame — so the tip is where it leaves the frame, which
// is where the line has to start from for the two to meet.
export const ANGLER_SPRITES = {
  idle: { src: idle, frames: 7, rodTip: { x: 33, y: 14 } },
  cast: { src: cast, frames: 6, rodTip: { x: 249, y: 28 } },
  reel: { src: reel, frames: 7, rodTip: { x: 175, y: 16 } },
  fishon: { src: fishon, frames: 6, rodTip: { x: 180, y: 11 } },
  celebrate: { src: celebrate, frames: 8, rodTip: { x: 35, y: 26 } },
};

// What the angler is doing in each phase: which strip, how many frames to step through, and
// whether it plays once (forwards) or loops. `holding` only matters while reeling — the loop
// runs while the player is actually cranking, so nothing animates on its own.
export function anglerAction({ phase, result, holding }) {
  switch (phase) {
    case 'casting': return { action: 'cast', play: 6, durationMs: 600 };
    case 'waiting': return { action: 'cast', frame: 5 };
    case 'hookset': return { action: 'fishon', play: 6, durationMs: 450 };
    case 'reeling': return holding ? { action: 'reel', play: 7, durationMs: 700, loop: true } : { action: 'reel', frame: 0 };
    case 'result': return result?.success ? { action: 'celebrate', play: 4, durationMs: 500 } : { action: 'idle', frame: 0 };
    default: return { action: 'idle', frame: 0 };
  }
}

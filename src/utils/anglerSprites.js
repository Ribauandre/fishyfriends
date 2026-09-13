// The main character's sprite strips, sliced from art/angler-pixel-sheet.png by
// scripts/anglerPixelSlice.mjs. Every frame sits in the same box with the feet anchored at
// (feetX, feetY), so an action can swap without the figure hopping.
//
// He is cut at the resolution the artist drew him — the box is 232x232 — rather than averaged down
// onto a coarse grid, which an earlier pass of this did and which cost real detail: his eyes, the
// vest pockets, the rod guides and the boot laces are all finer than any such grid. The geometry
// here is all expressed against SPRITE_FRAME rather than in numbers of its own, so GameScene, which
// works in painting units and divides by these, does not move when the art's resolution changes —
// and it has changed twice now.
import idle from '../assets/angler/idle.png';
import walk from '../assets/angler/walk.png';
import cast from '../assets/angler/cast.png';
import reel from '../assets/angler/reel.png';
import celebrate from '../assets/angler/celebrate.png';

export const SPRITE_FRAME = { w: 232, h: 232, feetX: 99, feetY: 231 };

// The window on a frame that a still preview shows. The sheet draws him and his rod inside one
// square, so unlike the last one there is no run of empty box to trim off — the still is the frame.
export const STILL_WINDOW = { x: 0, y: 0, w: 232, h: 232 };

// rodTip is where the line leaves the rod for that strip's held pose, in frame pixels, measured off
// the rod in the part mask rather than guessed: the rod pixel furthest from his feet. Where the rod
// runs out of the box the tip is where it leaves the frame, which is where the line has to start
// for the two to meet.
export const ANGLER_SPRITES = {
  idle: { src: idle, frames: 4, rodTip: { x: 172, y: 30 } },
  walk: { src: walk, frames: 4, rodTip: { x: 32, y: 18 } },
  cast: { src: cast, frames: 4, rodTip: { x: 230, y: 41 } },
  reel: { src: reel, frames: 4, rodTip: { x: 231, y: 68 } },
  celebrate: { src: celebrate, frames: 4, rodTip: { x: 17, y: 6 } },
};

// What the angler is doing in each phase: which strip, how many frames to step through, and
// whether it plays once (forwards) or loops. The cast swing ends on the rod held out over the
// water, so waiting holds that last frame. The hookset is the reel strip's first beats — the rod
// loading up.
//
// A lost fish returns him to idle. The sheet before this one drew a row of him slumped, and this
// one does not — its five rows are idle, walk, cast, reel and celebrate — so rather than press
// some other pose into service as a reaction it never was, he simply straightens up. `holding`
// only matters while reeling: the loop runs while the player is actually cranking, so nothing
// animates on its own.
export function anglerAction({ phase, result, holding }) {
  switch (phase) {
    case 'casting': return { action: 'cast', play: 4, durationMs: 600 };
    case 'waiting': return { action: 'cast', frame: 3 };
    case 'hookset': return { action: 'reel', play: 3, durationMs: 450 };
    case 'reeling': return holding ? { action: 'reel', play: 4, durationMs: 700, loop: true } : { action: 'reel', frame: 0 };
    case 'result': return result?.success ? { action: 'celebrate', play: 4, durationMs: 500 } : { action: 'idle', frame: 0 };
    default: return { action: 'idle', frame: 0 };
  }
}

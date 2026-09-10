// The main character's sprite strips, sliced from the angler sheet. Every frame sits in the
// same box with the feet anchored at (feetX, feetY) so actions can swap without the figure
// hopping. Frame counts are what the sheet actually has (idle and reel are seven).
import idle from '../assets/angler/idle.png';
import cast from '../assets/angler/cast.png';
import reel from '../assets/angler/reel.png';
import fishon from '../assets/angler/fishon.png';
import celebrate from '../assets/angler/celebrate.png';

export const SPRITE_FRAME = { w: 250, h: 150, feetX: 80, feetY: 144 };

// rodTip is where the line leaves the rod for that strip's held pose, in frame pixels.
export const ANGLER_SPRITES = {
  idle: { src: idle, frames: 7, rodTip: { x: 80, y: 20 } },
  cast: { src: cast, frames: 6, rodTip: { x: 228, y: 34 } },
  reel: { src: reel, frames: 7, rodTip: { x: 176, y: 14 } },
  fishon: { src: fishon, frames: 6, rodTip: { x: 195, y: 10 } },
  celebrate: { src: celebrate, frames: 8, rodTip: { x: 80, y: 20 } },
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

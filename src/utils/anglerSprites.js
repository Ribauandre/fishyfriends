// The main character's sprite strips, sliced from the angler sheet at 75% scale. Every frame
// sits in the same box with the feet anchored at (feetX, feetY) so actions can swap without
// the figure hopping. Frame counts are what the sheet actually has (the reel row is seven).
import idle from '../assets/angler/idle.png';
import cast from '../assets/angler/cast.png';
import reel from '../assets/angler/reel.png';
import fishon from '../assets/angler/fishon.png';
import celebrate from '../assets/angler/celebrate.png';

export const SPRITE_FRAME = { w: 255, h: 188, feetX: 82, feetY: 182, rodTipX: 200, rodTipY: 46 };

export const ANGLER_SPRITES = {
  idle: { src: idle, frames: 8 },
  cast: { src: cast, frames: 6 },
  reel: { src: reel, frames: 7 },
  fishon: { src: fishon, frames: 6 },
  celebrate: { src: celebrate, frames: 8 },
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

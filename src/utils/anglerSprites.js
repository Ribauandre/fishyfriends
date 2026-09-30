// The main character's sprite strips. scripts/anglerPixelSlice.mjs cuts him out of
// art/angler-pixel-sheet.png and scripts/anglerPixelMasks.mjs labels his parts, both at the
// resolution the artist drew (art/angler/), and scripts/anglerGrid.mjs puts strips and masks, in
// lock-step, onto the world's one art pixel (sceneLayout's ART_PX): he is drawn 92 painting units
// tall, which is 69 art rows, one file pixel to one art pixel, flat colours and a one-pixel keyline,
// so a pixel on him is the size of a pixel on the dock he stands on. Every frame sits in the same
// box with the feet anchored at (feetX, feetY), so an action can swap without the figure hopping.
//
// The anchor is an edge, not a pixel: his soles stand on y = feetY, the frame's bottom edge, and
// x = feetX is the column edge in the middle of his stance — so a feet position snapped to the art
// grid puts every one of his pixels on the painting's. The box is wide because the cast wind-up
// holds the rod out well behind him. The geometry here is all expressed against SPRITE_FRAME
// rather than in numbers of its own, so GameScene, which works in painting units and divides by
// these, does not move when the art's resolution changes — and it has changed four times now.
import idle from '../assets/angler/idle.png';
import walk from '../assets/angler/walk.png';
import cast from '../assets/angler/cast.png';
import reel from '../assets/angler/reel.png';
import celebrate from '../assets/angler/celebrate.png';
import strips from '../assets/angler/strips.json';

export const SPRITE_FRAME = { w: 86, h: 69, feetX: 39, feetY: 69 };

// Every stepped sprite in the world runs on one clock: a frame lasts a multiple of FRAME_MS (8 fps).
export const FRAME_MS = 125;

// The world's keyline: his own near-black, one art pixel wide. Every line on him is exactly this
// colour (scripts/anglerGrid.mjs draws it), and it is the colour to outline anything else in the
// world with, so the pets, the props and the stage's marks sit with him.
export const KEYLINE = '#130f0c';

// The window on a frame that a still preview shows: the idle pose, rod tip to soles, with a pixel
// either side; the width the wind-up needs is empty there. In art pixels, so a preview drawn at a
// whole multiple of it is as crisp as he is on the stage.
export const STILL_WINDOW = { x: 20, y: 0, w: 47, h: 69 };

// rodTips are where the line leaves the rod, one per frame of the strip, in frame pixels (the
// centre of the tip's pixel): the rod pixel furthest from his feet, measured off the rod in each
// frame's part mask rather than guessed, because the tip moves as he plays a fish — the reel loop
// swings it twenty painting units — and a line anchored to one frame's tip left from open air in
// the others. The last celebrate frame has him holding the fish up with no rod in his hands; its
// point is the top of that raised hand and carries `hand: true`.
//
// rodTip is the tip in the frame the strip holds (the one it rests on, or ends on when it plays
// once): what a caller that draws one line per strip should use.
const HELD = { idle: 0, walk: 0, cast: 3, reel: 0, celebrate: 3 };
const sprite = (action, src) => ({
  src,
  frames: strips[action].frames,
  rodTips: strips[action].rodTips,
  rodTip: strips[action].rodTips[HELD[action]],
});
export const ANGLER_SPRITES = {
  idle: sprite('idle', idle),
  walk: sprite('walk', walk),
  cast: sprite('cast', cast),
  reel: sprite('reel', reel),
  celebrate: sprite('celebrate', celebrate),
};

// What the angler is doing in each phase: which strip, how many frames to step through, and
// whether it plays once (forwards) or loops. The cast swing ends on the rod held out over the
// water, so waiting holds that last frame. The hookset is the reel strip's first beats — the rod
// loading up. Every duration is `play` frames of FRAME_MS.
//
// A lost fish returns him to idle. The sheet before this one drew a row of him slumped, and this
// one does not — its five rows are idle, walk, cast, reel and celebrate — so rather than press
// some other pose into service as a reaction it never was, he simply straightens up. So does a
// stick on the hook: the celebrate strip ends on him holding up a bass, and the plaque says JUNK.
// `holding` only matters while reeling: the loop runs while the player is actually cranking, so
// nothing animates on its own.
export function anglerAction({ phase, result, holding }) {
  switch (phase) {
    case 'casting': return { action: 'cast', play: 4, durationMs: 4 * FRAME_MS };
    case 'waiting': return { action: 'cast', frame: 3 };
    case 'hookset': return { action: 'reel', play: 3, durationMs: 3 * FRAME_MS };
    case 'reeling': return holding ? { action: 'reel', play: 4, durationMs: 4 * FRAME_MS, loop: true } : { action: 'reel', frame: 0 };
    case 'result': return result?.success && result?.rarity !== 'junk' ? { action: 'celebrate', play: 4, durationMs: 4 * FRAME_MS } : { action: 'idle', frame: 0 };
    default: return { action: 'idle', frame: 0 };
  }
}

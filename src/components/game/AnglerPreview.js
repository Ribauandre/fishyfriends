import React, { useEffect, useState } from 'react';
import { ANGLER_SPRITES, SPRITE_FRAME, STILL_WINDOW } from '../../utils/anglerSprites';
import { renderStill } from '../../utils/anglerPaint';
import { lookKey } from '../../utils/anglerLook';

// How many screen pixels an art pixel is in each preview. Whole numbers, so every block of him is
// the same size and nearest-neighbour keeps his keyline one block wide: the outfitter's big
// preview at 2, the rack's thumbnails at 1.
export const PREVIEW_SCALE = { large: 2, small: 1 };

// Frames the still window on an image of the given size, whichever image it is — the painted still
// (one frame) or the stock strip (all of them, so the first frame is the one at x 0) — at a whole
// scale. The box is the window's own shape at that scale, set here rather than left to a
// stylesheet box of another shape: a 180x150 box stretched him 26% wide.
function windowOn(imageW, imageH, scale) {
  const { x, y, w, h } = STILL_WINDOW;
  return {
    width: `${w * scale}px`,
    height: `${h * scale}px`,
    flexShrink: 0,
    imageRendering: 'pixelated',
    backgroundSize: `${imageW * scale}px ${imageH * scale}px`,
    backgroundPosition: `${-x * scale}px ${-y * scale}px`,
  };
}

// The angler standing still in a look: the idle strip's first frame, dressed — or the stock
// strip's first frame where nothing can be painted. `small` is the rack thumbnail.
export default function AnglerPreview({ look, small = false, label = 'Your angler' }) {
  const key = lookKey(look || {});
  const [still, setStill] = useState(null);
  useEffect(() => {
    let active = true;
    renderStill(look).then((painted) => { if (active) setStill(painted); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const idle = ANGLER_SPRITES.idle;
  const scale = small ? PREVIEW_SCALE.small : PREVIEW_SCALE.large;
  return <div
    className={`angler-preview ${small ? 'is-small' : ''}`}
    role="img"
    aria-label={label}
    data-look={key}
    data-painted={still ? 'yes' : 'no'}
    style={still
      ? { backgroundImage: `url(${still})`, ...windowOn(SPRITE_FRAME.w, SPRITE_FRAME.h, scale) }
      : { backgroundImage: `url(${idle.src})`, ...windowOn(idle.frames * SPRITE_FRAME.w, SPRITE_FRAME.h, scale) }}
  />;
}

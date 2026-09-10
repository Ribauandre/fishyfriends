import React, { useEffect, useState } from 'react';
import { ANGLER_SPRITES, SPRITE_FRAME, STILL_WINDOW } from '../../utils/anglerSprites';
import { renderStill } from '../../utils/anglerPaint';
import { lookKey } from '../../utils/anglerLook';

// Frames the still window on an image of the given size, whichever image it is: the painted
// still (one frame) or the stock strip (all of them, so the first frame is the one at x 0).
// Percentage background positions line the same fraction of the image up with the same
// fraction of the box, which is where the (image - window) divisor comes from.
function windowOn(imageW, imageH) {
  const { x, y, w, h } = STILL_WINDOW;
  return {
    backgroundSize: `${(imageW / w) * 100}% ${(imageH / h) * 100}%`,
    backgroundPositionX: `${imageW === w ? 0 : (100 * x) / (imageW - w)}%`,
    backgroundPositionY: `${imageH === h ? 0 : (100 * y) / (imageH - h)}%`,
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
  return <div
    className={`angler-preview ${small ? 'is-small' : ''}`}
    role="img"
    aria-label={label}
    data-look={key}
    data-painted={still ? 'yes' : 'no'}
    style={still
      ? { backgroundImage: `url(${still})`, ...windowOn(SPRITE_FRAME.w, SPRITE_FRAME.h) }
      : { backgroundImage: `url(${idle.src})`, ...windowOn(idle.frames * SPRITE_FRAME.w, SPRITE_FRAME.h) }}
  />;
}

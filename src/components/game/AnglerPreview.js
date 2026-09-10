import React from 'react';
import { ANGLER_SPRITES } from '../../utils/anglerSprites';
import { renderStill } from '../../utils/anglerDraw';
import { lookKey } from '../../utils/anglerLook';

// The angler standing still in a look: one rendered frame (the idle strip's held frame), or
// the stock strip's first frame where nothing can be drawn. `small` is the rack thumbnail.
export default function AnglerPreview({ look, small = false, label = 'Your angler' }) {
  const still = renderStill(look || {});
  const idle = ANGLER_SPRITES.idle;
  return <div
    className={`angler-preview ${small ? 'is-small' : ''}`}
    role="img"
    aria-label={label}
    data-look={lookKey(look || {})}
    data-painted={still ? 'yes' : 'no'}
    style={still ? { backgroundImage: `url(${still})`, backgroundSize: 'contain' } : { backgroundImage: `url(${idle.src})`, backgroundSize: `${idle.frames * 100}% 100%` }}
  />;
}

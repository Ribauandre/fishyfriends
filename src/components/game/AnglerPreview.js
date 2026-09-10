import React, { useEffect, useState } from 'react';
import { ANGLER_SPRITES } from '../../utils/anglerSprites';
import { renderStill } from '../../utils/anglerPaint';
import { lookKey } from '../../utils/anglerLook';

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
    style={still ? { backgroundImage: `url(${still})`, backgroundSize: 'contain' } : { backgroundImage: `url(${idle.src})`, backgroundSize: `${idle.frames * 100}% 100%` }}
  />;
}

import React from 'react';
import useAnglerSheets from './useAnglerSheets';
import { ANGLER_SPRITES } from '../../utils/anglerSprites';
import { lookKey } from '../../utils/anglerLook';

// The angler standing still in a look: the idle strip's first frame, painted.
export default function AnglerPreview({ look }) {
  const sheets = useAnglerSheets(look);
  const idle = ANGLER_SPRITES.idle;
  return <div
    className="angler-preview"
    role="img"
    aria-label="Your angler"
    data-look={lookKey(look || {})}
    data-painted={sheets ? 'yes' : 'no'}
    style={{ backgroundImage: `url(${sheets?.idle || idle.src})`, backgroundSize: `${idle.frames * 100}% 100%` }}
  />;
}

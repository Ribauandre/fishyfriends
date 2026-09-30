import React, { useEffect } from 'react';
import { UI_GLYPHS } from '../../utils/gameProps';

// How far a room's painting is dimmed under the panel, top to bottom: enough for the cards to
// read, not so much that the room vanishes (it used to be .62 to .84, which left the trophy wall
// at a luminance of 11 — black). The dark rooms pass their own, lighter one.
export const DEFAULT_SCRIM = [0.3, 0.55];

// The panel's background: the room's painting under its scrim, or nothing (the board's own wood).
export function backdropStyle(backdrop, scrim = DEFAULT_SCRIM) {
  if (!backdrop) return undefined;
  const [top, bottom] = scrim;
  return { backgroundImage: `linear-gradient(rgba(3,8,11,${top}), rgba(3,8,11,${bottom})), url(${backdrop})` };
}

// A board that comes up inside the game frame (map, shop, trophies) so the whole game stays
// on one screen instead of stacking cards down the page. Escape or the close sign dismisses.
// `backdrop` paints a room behind the board (the shop interior, the trophy wall) so the
// overlay reads as a place you walked into rather than a form; `scrim` is how dark it goes.
export default function GameOverlay({ eyebrow, title, onClose, backdrop = null, scrim = DEFAULT_SCRIM, children }) {
  useEffect(() => {
    function onKey(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="game-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <button type="button" className="game-overlay-scrim" aria-label={`Dismiss ${title.toLowerCase()}`} onClick={onClose} />
    <div className={`game-overlay-panel ${backdrop ? 'has-backdrop' : ''}`} data-backdrop={backdrop || undefined} data-scrim={backdrop ? scrim.join(' ') : undefined} style={backdropStyle(backdrop, scrim)}>
      <div className="game-overlay-head">
        <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        <button className="game-overlay-close" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><img src={UI_GLYPHS.close} alt="" /></button>
      </div>
      <div className="game-overlay-body">{children}</div>
    </div>
  </div>;
}

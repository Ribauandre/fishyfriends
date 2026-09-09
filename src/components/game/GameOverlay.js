import React, { useEffect } from 'react';

// A panel that slides up inside the game frame (map, shop, trophies) so the whole game stays
// on one screen instead of stacking cards down the page. Escape or the close button dismisses.
// `backdrop` paints a scene behind the panel (the shop interior, the trophy wall) so the
// overlay reads as a place you walked into rather than a form.
export default function GameOverlay({ eyebrow, title, onClose, backdrop = null, children }) {
  useEffect(() => {
    function onKey(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="game-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <button type="button" className="game-overlay-scrim" aria-label={`Dismiss ${title.toLowerCase()}`} onClick={onClose} />
    <div className={`game-overlay-panel ${backdrop ? 'has-backdrop' : ''}`} data-backdrop={backdrop || undefined} style={backdrop ? { backgroundImage: `linear-gradient(rgba(3,8,11,.62), rgba(3,8,11,.84)), url(${backdrop})` } : undefined}>
      <div className="game-overlay-head">
        <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        <button className="modal-close" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>×</button>
      </div>
      <div className="game-overlay-body">{children}</div>
    </div>
  </div>;
}

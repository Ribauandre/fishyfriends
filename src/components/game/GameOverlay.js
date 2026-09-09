import React, { useEffect } from 'react';

// A panel that slides up inside the game frame (map, shop, trophies) so the whole game stays
// on one screen instead of stacking cards down the page. Escape or the close button dismisses.
export default function GameOverlay({ eyebrow, title, onClose, children }) {
  useEffect(() => {
    function onKey(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="game-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <button type="button" className="game-overlay-scrim" aria-label={`Dismiss ${title.toLowerCase()}`} onClick={onClose} />
    <div className="game-overlay-panel">
      <div className="game-overlay-head">
        <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        <button className="modal-close" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>×</button>
      </div>
      <div className="game-overlay-body">{children}</div>
    </div>
  </div>;
}

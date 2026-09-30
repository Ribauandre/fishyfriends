import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UI_GLYPHS } from '../../utils/gameProps';

// How far a room's painting is dimmed under the panel, top to bottom: enough for the cards to
// read, not so much that the room vanishes (it used to be .62 to .84, which left the trophy wall
// at a luminance of 11 — black). The dark rooms pass their own, lighter one.
export const DEFAULT_SCRIM = [0.3, 0.55];

// The smallest whole number of CSS px an art pixel at which a room's painting (artW x artH, its
// native size: one file pixel an art pixel) still covers the panel (panelW x panelH, its padding
// box, which is what the background is laid out in). `cover` scaled the paintings by 4.2-6.6, so
// their art pixels came out 4 and 5 CSS px wide side by side.
export function roomScale(panelW, panelH, artW, artH) {
  if (!(panelW > 0) || !(panelH > 0) || !(artW > 0) || !(artH > 0)) return null;
  return Math.max(1, Math.ceil(Math.max(panelW / artW, panelH / artH)));
}

// The panel's background: the room's painting under its scrim, or nothing (the board's own wood).
// With `size` (the painting's native [w, h] and the whole-pixel scale) the painting is laid out at
// that scale, centred on a whole pixel (`x`), and the scrim still spans exactly the panel; without
// it the CSS covers the panel.
export function backdropStyle(backdrop, scrim = DEFAULT_SCRIM, size = null) {
  if (!backdrop) return undefined;
  const [top, bottom] = scrim;
  const style = { backgroundImage: `linear-gradient(rgba(3,8,11,${top}), rgba(3,8,11,${bottom})), url(${backdrop})` };
  if (size) {
    style.backgroundSize = `100% 100%, ${size.w * size.k}px ${size.h * size.k}px`;
    style.backgroundPosition = `0 0, ${size.x || 0}px 0`;
  }
  return style;
}

// The painting's native size, read off the image itself (the same URL the background fetched),
// and the panel's padding box, kept up to date as the panel resizes.
function useRoomSize(panelRef, backdrop) {
  const [art, setArt] = useState(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    setArt(null);
    if (!backdrop || typeof Image === 'undefined') return undefined;
    let live = true;
    const img = new Image();
    const done = () => { if (live && img.naturalWidth > 0) setArt({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onload = done;
    img.src = backdrop;
    if (img.complete) done();
    return () => { live = false; img.onload = null; };
  }, [backdrop]);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!backdrop || !panel || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setBox({ w: panel.clientWidth, h: panel.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panelRef, backdrop]);
  const k = art && box ? roomScale(box.w, box.h, art.w, art.h) : null;
  return k ? { ...art, k, x: Math.floor((box.w - art.w * k) / 2) } : null;
}

// A board that comes up inside the game frame (map, shop, trophies) so the whole game stays
// on one screen instead of stacking cards down the page. Escape or the close sign dismisses.
// `backdrop` paints a room behind the board (the shop interior, the trophy wall) so the
// overlay reads as a place you walked into rather than a form; `scrim` is how dark it goes.
export default function GameOverlay({ eyebrow, title, onClose, backdrop = null, scrim = DEFAULT_SCRIM, children }) {
  const panelRef = useRef(null);
  const size = useRoomSize(panelRef, backdrop);
  useEffect(() => {
    function onKey(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="game-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <button type="button" className="game-overlay-scrim" aria-label={`Dismiss ${title.toLowerCase()}`} onClick={onClose} />
    <div ref={panelRef} className={`game-overlay-panel ${backdrop ? 'has-backdrop' : ''}`} data-backdrop={backdrop || undefined} data-scrim={backdrop ? scrim.join(' ') : undefined} data-room-scale={size ? size.k : undefined} style={backdropStyle(backdrop, scrim, size)}>
      <div className="game-overlay-head">
        <div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>
        <button className="game-overlay-close" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><img src={UI_GLYPHS.close} alt="" /></button>
      </div>
      <div className="game-overlay-body">{children}</div>
    </div>
  </div>;
}

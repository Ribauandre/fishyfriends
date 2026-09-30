import { useEffect, useState, useSyncExternalStore } from 'react';
import { FRAME_MS } from '../../utils/anglerSprites';

// Which frame of a sprite strip is on screen, in JS, for the things that have to follow it: the
// line leaves the rod tip and the champion's pennant flies from it, and the tip moves as he
// plays a fish (the reel loop swings it twenty painting units). The sprite itself is stepped by
// CSS (steps(play, jump-none) over play x FRAME_MS); this counts the same frames from the moment
// the strip starts — when its key changes — with requestAnimationFrame against the clock, so a
// long reel never drifts the way a setInterval would.
//
// `current` is anglerAction's answer: a held pose ({ frame }) or a strip playing once or looping
// ({ play, loop }). Under prefers-reduced-motion the sprite rests on its held frame (App.css),
// and so does this: the last frame of a strip that plays once, the first of a loop.
export function stripFrameAt(current, elapsedMs) {
  const { frame = 0, play, loop } = current;
  if (!play) return frame;
  const n = Math.max(0, Math.floor(elapsedMs / FRAME_MS));
  return loop ? n % play : Math.min(play - 1, n);
}

export function heldFrame(current) {
  const { frame = 0, play, loop } = current;
  if (!play) return frame;
  return loop ? 0 : play - 1;
}

// The preference is followed live, the way the CSS follows it: turned on mid-strip, the sprite
// drops to its held frame and so does this; turned off, the CSS starts the strip again from its
// first frame and this restarts its clock with it.
const REDUCED = '(prefers-reduced-motion: reduce)';
const reducedQuery = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED) : null);
const reducedMotion = () => Boolean(reducedQuery()?.matches);
function subscribeReduced(onChange) {
  const query = reducedQuery();
  if (!query) return () => {};
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  if (typeof query.addListener === 'function') {
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }
  return () => {};
}
const clock = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

export default function useStripFrame(current, key) {
  const { play, loop } = current;
  const reduced = useSyncExternalStore(subscribeReduced, reducedMotion, reducedMotion);
  const first = () => (play && !reduced ? 0 : heldFrame(current));
  const [state, setState] = useState(() => ({ key, frame: first(), reduced }));
  useEffect(() => {
    if (!play) return undefined;
    if (reduced || typeof requestAnimationFrame !== 'function') {
      setState({ key, frame: heldFrame({ play, loop }), reduced });
      return undefined;
    }
    const start = clock();
    let raf = 0;
    const tick = () => {
      const elapsed = clock() - start;
      const frame = stripFrameAt({ play, loop }, elapsed);
      setState((prev) => (prev.key === key && prev.frame === frame && prev.reduced === reduced ? prev : { key, frame, reduced }));
      if (loop || elapsed < play * FRAME_MS) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [key, play, loop, reduced]);
  if (!play) return heldFrame(current);
  // The first render of a new strip (or of a changed preference), before its clock has ticked:
  // its first frame, or its held one.
  return state.key === key && state.reduced === reduced ? state.frame : first();
}

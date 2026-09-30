import { useEffect, useState } from 'react';
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

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches);
const clock = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

export default function useStripFrame(current, key) {
  const { play, loop } = current;
  const first = () => (play && !reducedMotion() ? 0 : heldFrame(current));
  const [state, setState] = useState(() => ({ key, frame: first() }));
  useEffect(() => {
    if (!play) return undefined;
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') {
      setState({ key, frame: heldFrame({ play, loop }) });
      return undefined;
    }
    const start = clock();
    let raf = 0;
    const tick = () => {
      const elapsed = clock() - start;
      const frame = stripFrameAt({ play, loop }, elapsed);
      setState((prev) => (prev.key === key && prev.frame === frame ? prev : { key, frame }));
      if (loop || elapsed < play * FRAME_MS) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [key, play, loop]);
  if (!play) return heldFrame(current);
  // The first render of a new strip, before its clock has ticked: its first frame.
  return state.key === key ? state.frame : first();
}

import React, { useEffect, useRef, useState } from 'react';

// Tackle points in the HUD. Ticks from the old value to the new one and pops a +N / -N so a
// landed fish or a purchase reads as an event rather than a number silently changing. Only
// ever moves when the value does.
export default function PointsCounter({ value }) {
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState(null);
  const previousRef = useRef(value);

  useEffect(() => {
    const from = previousRef.current;
    previousRef.current = value;
    if (from === value) return undefined;
    setDelta(value - from);
    if (typeof requestAnimationFrame !== 'function') { setShown(value); return undefined; }
    const start = performance.now();
    const duration = 650;
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  useEffect(() => {
    if (delta === null) return undefined;
    const timer = setTimeout(() => setDelta(null), 1400);
    return () => clearTimeout(timer);
  }, [delta]);

  return <div className="hud-points" aria-live="polite" aria-label={`${value} tackle points`}>
    <svg viewBox="0 0 20 20" className="hud-coin" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" fill="#e3fb14" stroke="#03080b" strokeWidth="2" />
      <path d="M6 10.5 Q9 6 13.5 9.5 L12 11 Q9 8.5 6.5 12 Z" fill="#03080b" />
    </svg>
    <strong key={value} className={delta === null ? '' : 'is-bumped'}>{shown}</strong>
    {delta !== null && <em key={`${value}-delta`} className={delta > 0 ? 'is-gain' : 'is-loss'}>{delta > 0 ? `+${delta}` : delta}</em>}
  </div>;
}

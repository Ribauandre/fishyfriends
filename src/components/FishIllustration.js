import React, { useId } from 'react';

const fishDetails = {
  pike: { label: 'Northern pike', className: 'drawn-pike' },
  bass: { label: 'Largemouth bass', className: 'drawn-bass' },
  salmon: { label: 'Salmon', className: 'drawn-salmon', spots: true },
  shark: { label: 'Shark', className: 'drawn-shark' },
  trout: { label: 'Trout', className: 'drawn-trout', spots: true },
  perch: { label: 'Perch', className: 'drawn-perch' },
  tuna: { label: 'Tuna', className: 'drawn-tuna' },
};

// Hand-placed to read as natural, tattoo-flash-style spotting along the back and flank
// (brown/brook/rainbow trout and Atlantic/coho salmon are all classically spotted), not a
// scattered/random pattern.
const spotPositions = [
  [66, 42, 3.4], [90, 34, 2.8], [116, 39, 3.4], [141, 33, 2.8], [163, 42, 3.2],
  [183, 51, 2.6], [104, 57, 2.4], [76, 60, 2.2], [128, 61, 2.4], [151, 58, 2.2],
];

export default function FishIllustration({ species, className = '' }) {
  const fish = fishDetails[species] || fishDetails.pike;
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const skinId = `skin-${rawId}`;
  return <svg className={`fish-illustration ${fish.className} ${className}`} data-species={species} viewBox="0 0 240 130" role="img" aria-label={fish.label}>
    <defs>
      <filter id={skinId} x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045 0.09" numOctaves="2" seed="5" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" result="tint" />
        <feComposite in="tint" in2="SourceGraphic" operator="in" result="clipped" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="clipped" />
        </feMerge>
      </filter>
    </defs>
    <path className="fish-tail" d="M33 46 C14 30 0 14 0 4 C4 26 14 46 26 65 C14 84 4 104 0 126 C0 116 14 100 33 84Z" />
    <path className="fish-fin fish-fin-top" d="M98 44 L124 -12 L142 46Z" />
    <path className="fish-fin fish-fin-bottom" d="M108 84 L127 126 L146 80Z" />
    <g filter={`url(#${skinId})`}>
      <path className="fish-outline" d="M35 48 C75 26 130 18 172 22 C200 25 218 40 225 65 C218 90 200 105 172 108 C130 112 75 104 35 82 C28 75 28 55 35 48Z" />
      {fish.spots && spotPositions.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} className="fish-spot" cx={cx} cy={cy} r={r} />)}
    </g>
    <path className="fish-fin fish-fin-pectoral" d="M150 62 L196 96 L162 82Z" />
    <path className="fish-detail fish-gill" d="M178 35 C168 48 168 62 179 75" />
    <path className="fish-detail fish-mouth" d="M180 74 C195 79 210 78 221 70" />
    <path className="fish-teeth" d="M199 76 L203 78 L201 71Z M208 78 L212 79 L210 72Z" />
    <circle className="fish-eye" cx="196" cy="45" r="4" />
    <circle className="fish-eye-glint" cx="194.5" cy="43.5" r="1.1" />
  </svg>;
}

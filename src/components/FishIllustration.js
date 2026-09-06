import React from 'react';

const fishDetails = {
  pike: { label: 'Northern pike', className: 'drawn-pike' },
  bass: { label: 'Largemouth bass', className: 'drawn-bass' },
  salmon: { label: 'Salmon', className: 'drawn-salmon' },
  shark: { label: 'Shark', className: 'drawn-shark' },
  trout: { label: 'Trout', className: 'drawn-trout' },
  perch: { label: 'Perch', className: 'drawn-perch' },
  tuna: { label: 'Tuna', className: 'drawn-tuna' },
};

export default function FishIllustration({ species, className = '' }) {
  const fish = fishDetails[species] || fishDetails.pike;
  return <svg className={`fish-illustration ${fish.className} ${className}`} data-species={species} viewBox="0 0 240 110" role="img" aria-label={fish.label}>
    <path className="fish-outline" d="M24 56 C54 20 119 18 169 45 C187 34 207 34 222 42 C207 51 190 60 169 57 C124 88 56 91 24 56Z" />
    <path className="fish-fin fish-fin-top" d="M105 34 L125 8 L137 40" />
    <path className="fish-fin fish-fin-bottom" d="M101 76 L120 101 L135 70" />
    <path className="fish-tail" d="M26 55 L4 27 L12 56 L4 83 L28 61" />
    <path className="fish-detail fish-line" d="M54 52 C92 45 124 50 157 54" />
    <path className="fish-detail fish-gill" d="M77 38 C65 52 66 68 78 78" />
    <circle className="fish-eye" cx="190" cy="45" r="4" />
    <path className="fish-mouth" d="M219 43 L231 48 L219 53" />
    <path className="fish-teeth" d="M218 51 L222 57 L226 51" />
    <path className="fish-snout" d="M169 45 L222 42" />
    <path className="fish-stripe" d="M52 58 C92 67 129 67 164 57" />
    <path className="fish-spots" d="M77 49 L83 46 M92 56 L98 53 M109 47 L115 44 M125 58 L131 55" />
    <path className="fish-gill-slashes" d="M88 39 L94 33 M95 41 L101 35 M102 43 L108 37" />
  </svg>;
}

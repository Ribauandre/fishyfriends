import React from 'react';
import pike from '../assets/fish/pike.png';
import bass from '../assets/fish/bass.png';
import salmon from '../assets/fish/salmon.png';
import shark from '../assets/fish/shark.png';
import trout from '../assets/fish/trout.png';
import perch from '../assets/fish/perch.png';
import tuna from '../assets/fish/tuna.png';

const fishDetails = {
  pike: { label: 'Northern pike', src: pike },
  bass: { label: 'Largemouth bass', src: bass },
  salmon: { label: 'Salmon', src: salmon },
  shark: { label: 'Shark', src: shark },
  trout: { label: 'Trout', src: trout },
  perch: { label: 'Perch', src: perch },
  tuna: { label: 'Tuna', src: tuna },
};

// Bold-outline, bright color-graded engravings adapted from real 19th-century natural
// history illustrations (public domain Sherman Foote Denton watercolors for pike, bass,
// salmon, trout and perch; the shark and tuna are adapted from public engravings — see
// README for sources and the shark's CC BY-SA attribution) rather than hand-drawn from
// scratch, so proportions and fin/scale detail read as a real fish, not a cartoon.
export default function FishIllustration({ species, className = '' }) {
  const fish = fishDetails[species] || fishDetails.pike;
  return <img className={`fish-illustration ${className}`} data-species={species} src={fish.src} alt={fish.label} />;
}

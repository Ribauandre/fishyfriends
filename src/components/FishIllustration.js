import React from 'react';
import pike from '../assets/fish/pike.png';
import trout from '../assets/fish/trout.png';
import largemouth from '../assets/fish/largemouth.png';
import smallmouth from '../assets/fish/smallmouth.png';
import bluegill from '../assets/fish/bluegill.png';
import flounder from '../assets/fish/flounder.png';
import stripedbass from '../assets/fish/stripedbass.png';
import bluefish from '../assets/fish/bluefish.png';
import snakehead from '../assets/fish/snakehead.png';
import laketrout from '../assets/fish/laketrout.png';

// Bold neon-outline sticker art the user generated directly, matching the reference photos
// they shared. Every species below has its own art; anything else falls back to trout — no
// page should ever show the old hand-drawn or historical-engraving illustrations again.
const fishDetails = {
  pike: { label: 'Northern pike', src: pike },
  trout: { label: 'Trout', src: trout },
  largemouth: { label: 'Largemouth bass', src: largemouth },
  smallmouth: { label: 'Smallmouth bass', src: smallmouth },
  bluegill: { label: 'Bluegill', src: bluegill },
  flounder: { label: 'Flounder', src: flounder },
  stripedbass: { label: 'Striped bass', src: stripedbass },
  bluefish: { label: 'Bluefish', src: bluefish },
  snakehead: { label: 'Northern snakehead', src: snakehead },
  laketrout: { label: 'Lake trout', src: laketrout },
};

export const HERO_SPECIES = ['largemouth', 'smallmouth', 'bluegill', 'flounder', 'stripedbass', 'bluefish', 'snakehead', 'laketrout'];

export default function FishIllustration({ species, className = '' }) {
  const fish = fishDetails[species] || fishDetails.trout;
  return <img className={`fish-illustration ${className}`} data-species={species} src={fish.src} alt={fish.label} />;
}

import React from 'react';
import pike from '../assets/fish/pike.png';
import trout from '../assets/fish/trout.png';

// Bold neon-outline sticker art the user generated directly, matching the reference photos
// they shared. Pike/Muskie and Trout have their own art; every other species (including
// bass, until its cropped extraction is replaced with proper standalone art) falls back to
// trout — no page should ever show the old hand-drawn or historical-engraving illustrations
// again.
const fishDetails = {
  pike: { label: 'Northern pike', src: pike },
  trout: { label: 'Trout', src: trout },
};

export default function FishIllustration({ species, className = '' }) {
  const fish = fishDetails[species] || fishDetails.trout;
  return <img className={`fish-illustration ${className}`} data-species={species} src={fish.src} alt={fish.label} />;
}

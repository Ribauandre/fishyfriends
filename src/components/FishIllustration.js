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
import musky from '../assets/fish/musky.png';
import crappie from '../assets/fish/crappie.png';
import perch from '../assets/fish/perch.png';
import walleye from '../assets/fish/walleye.png';
import chainpickerel from '../assets/fish/chainpickerel.png';
import whiteperch from '../assets/fish/whiteperch.png';
import catfish from '../assets/fish/catfish.png';
import carp from '../assets/fish/carp.png';
import rainbowtrout from '../assets/fish/rainbowtrout.png';
import browntrout from '../assets/fish/browntrout.png';
import brooktrout from '../assets/fish/brooktrout.png';
import tautog from '../assets/fish/tautog.png';
import redfish from '../assets/fish/redfish.png';
import speckledtrout from '../assets/fish/speckledtrout.png';
import weakfish from '../assets/fish/weakfish.png';
import cobia from '../assets/fish/cobia.png';
import falsealbacore from '../assets/fish/falsealbacore.png';
import mahimahi from '../assets/fish/mahimahi.png';
import mackerel from '../assets/fish/mackerel.png';
import salmon from '../assets/fish/salmon.png';
import blackseabass from '../assets/fish/blackseabass.png';
import tuna from '../assets/fish/tuna.png';

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
  musky: { label: 'Musky', src: musky },
  crappie: { label: 'Crappie', src: crappie },
  perch: { label: 'Yellow perch', src: perch },
  walleye: { label: 'Walleye', src: walleye },
  chainpickerel: { label: 'Chain pickerel', src: chainpickerel },
  whiteperch: { label: 'White perch', src: whiteperch },
  catfish: { label: 'Catfish', src: catfish },
  carp: { label: 'Carp', src: carp },
  rainbowtrout: { label: 'Rainbow trout', src: rainbowtrout },
  browntrout: { label: 'Brown trout', src: browntrout },
  brooktrout: { label: 'Brook trout', src: brooktrout },
  tautog: { label: 'Tautog', src: tautog },
  redfish: { label: 'Redfish', src: redfish },
  speckledtrout: { label: 'Speckled trout', src: speckledtrout },
  weakfish: { label: 'Weakfish', src: weakfish },
  cobia: { label: 'Cobia', src: cobia },
  falsealbacore: { label: 'False albacore', src: falsealbacore },
  mahimahi: { label: 'Mahi mahi', src: mahimahi },
  mackerel: { label: 'Atlantic mackerel', src: mackerel },
  salmon: { label: 'Atlantic salmon', src: salmon },
  blackseabass: { label: 'Black sea bass', src: blackseabass },
  tuna: { label: 'Tuna', src: tuna },
};

export const HERO_SPECIES = Object.keys(fishDetails).filter((key) => key !== 'pike' && key !== 'trout');

export default function FishIllustration({ species, className = '' }) {
  const fish = fishDetails[species] || fishDetails.trout;
  return <img className={`fish-illustration ${className}`} data-species={species} src={fish.src} alt={fish.label} />;
}

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
import catfish from '../assets/fish/catfish.png';
import carp from '../assets/fish/carp.png';
import rainbowtrout from '../assets/fish/rainbowtrout.png';
import browntrout from '../assets/fish/browntrout.png';
import brooktrout from '../assets/fish/brooktrout.png';
import tautog from '../assets/fish/tautog.png';
import mahimahi from '../assets/fish/mahimahi.png';
import salmon from '../assets/fish/salmon.png';
import blackseabass from '../assets/fish/blackseabass.png';
import tuna from '../assets/fish/tuna.png';
import shark from '../assets/fish/shark.png';
import walleye from '../assets/fish/walleye.png';
import yellowperch from '../assets/fish/yellowperch.png';
import weakfish from '../assets/fish/weakfish.png';
import chainpickerel from '../assets/fish/chainpickerel.png';
import swordfish from '../assets/fish/swordfish.png';
import muskie from '../assets/fish/muskie.png';
import americanshad from '../assets/fish/americanshad.png';
import arcticchar from '../assets/fish/arcticchar.png';
import crappie from '../assets/fish/crappie.png';
import bowfin from '../assets/fish/bowfin.png';
import longnosegar from '../assets/fish/longnosegar.png';
import alligatorgar from '../assets/fish/alligatorgar.png';
import porgy from '../assets/fish/porgy.png';
import blackdrum from '../assets/fish/blackdrum.png';
import cobia from '../assets/fish/cobia.png';
import wahoo from '../assets/fish/wahoo.png';
import bluemarlin from '../assets/fish/bluemarlin.png';
import bonefish from '../assets/fish/bonefish.png';
import permit from '../assets/fish/permit.png';
import tarpon from '../assets/fish/tarpon.png';
import snook from '../assets/fish/snook.png';
import redfish from '../assets/fish/redfish.png';
import barracuda from '../assets/fish/barracuda.png';
import jackcrevalle from '../assets/fish/jackcrevalle.png';
import mangrovesnapper from '../assets/fish/mangrovesnapper.png';

// Bold neon-outline sticker art, each one its own dedicated render (never a crop pulled out
// of a shared multi-fish reference sheet — those were lower resolution and occasionally
// carried extraction artifacts). Every species below has its own art; anything else falls
// back to trout — no page should ever show the old hand-drawn or historical-engraving
// illustrations again.
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
  catfish: { label: 'Catfish', src: catfish },
  carp: { label: 'Carp', src: carp },
  rainbowtrout: { label: 'Rainbow trout', src: rainbowtrout },
  browntrout: { label: 'Brown trout', src: browntrout },
  brooktrout: { label: 'Brook trout', src: brooktrout },
  tautog: { label: 'Tautog', src: tautog },
  mahimahi: { label: 'Mahi mahi', src: mahimahi },
  salmon: { label: 'Atlantic salmon', src: salmon },
  blackseabass: { label: 'Black sea bass', src: blackseabass },
  tuna: { label: 'Tuna', src: tuna },
  shark: { label: 'Shark', src: shark },
  walleye: { label: 'Walleye', src: walleye },
  yellowperch: { label: 'Yellow perch', src: yellowperch },
  weakfish: { label: 'Weakfish', src: weakfish },
  chainpickerel: { label: 'Chain pickerel', src: chainpickerel },
  swordfish: { label: 'Swordfish', src: swordfish },
  muskie: { label: 'Muskellunge', src: muskie },
  americanshad: { label: 'American shad', src: americanshad },
  arcticchar: { label: 'Arctic char', src: arcticchar },
  crappie: { label: 'Crappie', src: crappie },
  bowfin: { label: 'Bowfin', src: bowfin },
  longnosegar: { label: 'Longnose gar', src: longnosegar },
  alligatorgar: { label: 'Alligator gar', src: alligatorgar },
  porgy: { label: 'Porgy', src: porgy },
  blackdrum: { label: 'Black drum', src: blackdrum },
  cobia: { label: 'Cobia', src: cobia },
  wahoo: { label: 'Wahoo', src: wahoo },
  bluemarlin: { label: 'Blue marlin', src: bluemarlin },
  bonefish: { label: 'Bonefish', src: bonefish },
  permit: { label: 'Permit', src: permit },
  tarpon: { label: 'Tarpon', src: tarpon },
  snook: { label: 'Snook', src: snook },
  redfish: { label: 'Redfish', src: redfish },
  barracuda: { label: 'Barracuda', src: barracuda },
  jackcrevalle: { label: 'Jack crevalle', src: jackcrevalle },
  mangrovesnapper: { label: 'Mangrove snapper', src: mangrovesnapper },
};

export const HERO_SPECIES = Object.keys(fishDetails);

export default function FishIllustration({ species, className = '', style }) {
  const fish = fishDetails[species] || fishDetails.trout;
  return <img className={`fish-illustration ${className}`} data-species={species} src={fish.src} alt={fish.label} style={style} />;
}

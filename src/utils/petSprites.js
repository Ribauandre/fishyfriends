// The dock pets Marina's sells (utils/anglerLook.js, the `pet` slot). Each has two strips,
// drawn in the angler's pixel style and put on the world's one art pixel by
// scripts/petSlice.mjs (from the hi-res strips kept in art/pets/), which records each strip's
// shared box and feet in assets/pets/pets.json — in art pixels, one file pixel to one art pixel:
//   idle  — sitting; frame 0 is the pose it holds and frame 1 the tail flick, and GameScene
//           runs it on a long cycle (cycleMs) that is still most of the time and flicks near
//           the end, so a dock with two pets on it reads as two animals dozing, not a metronome.
//           The frames are registered on the body, so a flick moves the tail and not the cat.
//   cheer — the celebration, stepped through fast (play frames in durationMs, looping) for
//           as long as its angler is celebrating a landed fish
// Like the angler, a pet is hung on its feet and sized in painting units, and every strip is
// drawn at its own rows x ART_PX: a pixel on the dog is a pixel on the angler and on the dock,
// and a pet that stands up or leaps in its cheer is the same animal at the same pixel size (the
// cheer strips were once a non-square pixel a third taller than the sitting one's). The dog sits
// 23 art rows (about a third of the angler's 69); the cat, 20.
//
// Timing is on the world's one clock, whole multiples of 125 ms a frame (8 fps): pet-idle holds
// frame 0 for 80% of the cycle and shows the flick for two 4% windows, so a cycle of 6250 ms is
// a 250 ms flick and 9375 ms a 375 ms one.
import pets from '../assets/pets/pets.json';
import dog from '../assets/pets/dog.png';
import cat from '../assets/pets/cat.png';
import dogCheer from '../assets/pets/dog_cheer.png';
import catCheer from '../assets/pets/cat_cheer.png';
import { ART_PX } from './sceneLayout';

// A strip's height in painting units: its rows at the world's art pixel.
export const stripUnits = (name) => pets[name].h * ART_PX;

// How tall the dog sits in painting units (the angler is 92), and where a pet sits: a little
// behind his heel (27 art pixels back) and one art pixel nearer, on the deck.
export const PET_H = stripUnits('dog');
export const PET_OFFSET = { x: -36, y: ART_PX };

export const PET_SPRITES = {
  pet_dog: {
    idle: { src: dog, ...pets.dog, unitH: stripUnits('dog'), cycleMs: 6250 },
    cheer: { src: dogCheer, ...pets.dog_cheer, unitH: stripUnits('dog_cheer'), play: pets.dog_cheer.frames, durationMs: 4 * 125 },
  },
  pet_cat: {
    idle: { src: cat, ...pets.cat, unitH: stripUnits('cat'), cycleMs: 9375 },
    cheer: { src: catCheer, ...pets.cat_cheer, unitH: stripUnits('cat_cheer'), play: pets.cat_cheer.frames, durationMs: 4 * 250 },
  },
};

export const petSprite = (key) => PET_SPRITES[key] || null;

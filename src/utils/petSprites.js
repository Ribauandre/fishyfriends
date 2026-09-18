// The dock pets Marina's sells (utils/anglerLook.js, the `pet` slot). Each has two strips,
// drawn in the angler's pixel style with his sheet (and then its own sitting strip, padded
// onto a wide canvas so the model copied a framing with margin) as the reference, and sliced
// by scripts/petSlice.mjs, which records each strip's shared box and feet in
// assets/pets/pets.json:
//   idle  — sitting; frame 0 is the pose it holds and frame 1 the tail flick, and GameScene
//           runs it on a long cycle (cycleMs) that is still most of the time and flicks near
//           the end, so a dock with two pets on it reads as two animals dozing, not a metronome
//   cheer — the celebration, stepped through fast (play frames in durationMs, looping) for
//           as long as its angler is celebrating a landed fish
// Like the angler, a pet is hung on its feet and sized in painting units: PET_H is the sitting
// height, and the cheer strip's `unitH` scales it by the strips' pixel heights, so an animal
// that stands or leaps in the cheer is the same animal at the same pixel size.
import pets from '../assets/pets/pets.json';
import dog from '../assets/pets/dog.png';
import cat from '../assets/pets/cat.png';
import dogCheer from '../assets/pets/dog_cheer.png';
import catCheer from '../assets/pets/cat_cheer.png';

// How tall a pet sits in painting units (the angler is 92), and where: a little behind his
// heel, on the deck.
export const PET_H = 30;
export const PET_OFFSET = { x: -36, y: 1 };

const cheerH = (name) => Math.round(PET_H * (pets[`${name}_cheer`].h / pets[name].h) * 100) / 100;

export const PET_SPRITES = {
  pet_dog: {
    idle: { src: dog, ...pets.dog, unitH: PET_H, cycleMs: 5600 },
    cheer: { src: dogCheer, ...pets.dog_cheer, unitH: cheerH('dog'), play: pets.dog_cheer.frames, durationMs: 640 },
  },
  pet_cat: {
    idle: { src: cat, ...pets.cat, unitH: PET_H, cycleMs: 7400 },
    cheer: { src: catCheer, ...pets.cat_cheer, unitH: cheerH('cat'), play: pets.cat_cheer.frames, durationMs: 720 },
  },
};

export const petSprite = (key) => PET_SPRITES[key] || null;

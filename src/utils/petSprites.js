// The dock pets Marina's sells (utils/anglerLook.js, the `pet` slot): each is one strip of
// sitting frames, drawn in the angler's pixel style with his sheet as the reference and
// sliced by scripts/petSlice.mjs, which records each strip's shared box and feet in
// assets/pets/pets.json. Like the angler, a pet is hung on its feet and sized in painting
// units (PET_H), so it stays to scale with him whatever the art's resolution.
//
// `play` is how many of the strip's frames the idle loop steps through: the model draws the
// last frame of a row a little smaller than the first, and looping back through it would
// make the animal pulse, so the cat sits and flicks its tail (two frames) rather than
// shrinking on the third.
import pets from '../assets/pets/pets.json';
import dog from '../assets/pets/dog.png';
import cat from '../assets/pets/cat.png';

// How tall a pet stands in painting units (the angler is 92), and where it sits: a little
// behind his heel, on the deck.
export const PET_H = 30;
export const PET_OFFSET = { x: -36, y: 1 };

export const PET_SPRITES = {
  pet_dog: { src: dog, ...pets.dog, play: 3, durationMs: 1400 },
  pet_cat: { src: cat, ...pets.cat, play: 2, durationMs: 1800 },
};

export const petSprite = (key) => PET_SPRITES[key] || null;

import React from 'react';
import { render } from '@testing-library/react';
import PetPreview, { RACK_PX, previewBox } from './PetPreview';
import DecorPreview from './DecorPreview';
import AnglerPreview from './AnglerPreview';
import { PET_SPRITES } from '../../utils/petSprites';
import { DECOR_PROPS } from '../../utils/dockDecor';
import { SPRITE_FRAME, STILL_WINDOW } from '../../utils/anglerSprites';

// Marina's rack draws every thumbnail at a whole number of CSS pixels an art pixel, at the art's
// own proportions: a pixelated 0.2x downscale dropped the cooler's keyline rows, and a fixed
// 54 x 48 box squashed the cat.
test('the rack scale is a whole number', () => {
  expect(Number.isInteger(RACK_PX)).toBe(true);
  expect(RACK_PX).toBeGreaterThanOrEqual(1);
});

test.each(Object.keys(PET_SPRITES))('%s sits on the rack at its own proportions, a whole multiple of its pixels', (petKey) => {
  const sprite = PET_SPRITES[petKey].idle;
  const { container } = render(<PetPreview petKey={petKey} />);
  const tile = container.querySelector('.pet-preview');
  expect(tile).toHaveAttribute('data-pet', petKey);
  expect(tile.style.width).toBe(`${sprite.w * RACK_PX}px`);
  expect(tile.style.height).toBe(`${sprite.h * RACK_PX}px`);
  expect(previewBox(sprite, 3)).toEqual({ width: `${sprite.w * 3}px`, height: `${sprite.h * 3}px` });
});

test.each(Object.keys(DECOR_PROPS))('%s sits on the rack at a whole multiple of its pixels', (decorKey) => {
  const prop = DECOR_PROPS[decorKey];
  const { container } = render(<DecorPreview decorKey={decorKey} />);
  const img = container.querySelector('.decor-preview');
  expect(img.style.width).toBe(`${prop.w * RACK_PX}px`);
  expect(img.style.height).toBe(`${prop.rows * RACK_PX}px`);
});

test('the free pet and the bare deck are empty tiles', () => {
  const { container } = render(<><PetPreview petKey="pet_none" /><DecorPreview decorKey="decor_none" /></>);
  expect(container.querySelectorAll('.pet-preview.is-none')).toHaveLength(2);
});

// The rack's swatch (App.css .rack-swatch, 76 px tall) must hold the angler at 1x whole: the
// 69-row still with its rod tip and boot soles.
test('the rack thumbnail of the angler is the 69-row still at 1x', () => {
  const { container } = render(<AnglerPreview look={{}} small label="" />);
  const still = container.querySelector('.angler-preview');
  expect(still.style.height).toBe(`${STILL_WINDOW.h}px`);
  expect(still.style.width).toBe(`${STILL_WINDOW.w}px`);
  expect(STILL_WINDOW.h).toBe(SPRITE_FRAME.h);
  expect(STILL_WINDOW.h).toBeLessThanOrEqual(76 - 4);
});

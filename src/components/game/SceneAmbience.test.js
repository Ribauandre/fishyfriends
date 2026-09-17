import React from 'react';
import { render } from '@testing-library/react';
import SceneAmbience from './SceneAmbience';

test('salt water gets gulls; the dock lamp is not the ambience\'s to draw (GameScene lights it over the tint)', () => {
  const { container, rerender } = render(<SceneAmbience biome="bay" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(2);
  expect(container.querySelector('.scene-dragonfly')).toBeNull();
  expect(container.querySelector('.scene-lamp')).toBeNull();
  expect(container.querySelectorAll('.scene-cloud').length).toBe(2);

  rerender(<SceneAmbience biome="offshore" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(3);
});

test('fresh water gets dragonflies, and the swamp canopy hides the sky', () => {
  const { container, rerender } = render(<SceneAmbience biome="river" />);
  expect(container.querySelectorAll('.scene-dragonfly').length).toBe(1);
  expect(container.querySelector('.scene-gull')).toBeNull();
  expect(container.querySelectorAll('.scene-cloud').length).toBe(1);

  rerender(<SceneAmbience biome="swamp" />);
  expect(container.querySelectorAll('.scene-dragonfly').length).toBe(2);
  expect(container.querySelector('.scene-cloud')).toBeNull();
});

test('each ground moves in its own way: the river runs, the lake rings, the beach breaks', () => {
  const { container, rerender } = render(<SceneAmbience biome="river" />);
  const streaks = container.querySelectorAll('.scene-mover.is-current');
  expect(streaks.length).toBe(7);
  // A mover is a lane turned to its heading with the piece running along it by --travel.
  expect(streaks[0].style.transform).toMatch(/rotate\(168deg\)/);
  expect(streaks[0].style.getPropertyValue('--travel')).toMatch(/%$/);
  expect(streaks[0].querySelector('i').style.animationDelay).toMatch(/^-/);
  expect(container.querySelectorAll('.scene-mover.is-leaf').length).toBe(2);
  expect(container.querySelectorAll('.scene-foam').length).toBe(7);
  expect(container.querySelector('.scene-ring')).toBeNull();
  expect(container.querySelector('.scene-wash')).toBeNull();
  expect(container.querySelector('.scene-glitter')).toBeInTheDocument();

  rerender(<SceneAmbience biome="mountainlake" />);
  expect(container.querySelector('.scene-mover.is-current')).toBeNull();
  expect(container.querySelectorAll('.scene-ring').length).toBe(4);
  expect(container.querySelectorAll('.scene-mist').length).toBe(2);
  expect(container.querySelectorAll('.scene-mover.is-glass').length).toBe(3);

  rerender(<SceneAmbience biome="shoreline" />);
  expect(container.querySelectorAll('.scene-wash').length).toBe(3);
  expect(container.querySelectorAll('.scene-mover.is-wave').length).toBe(6);
  expect(container.querySelector('.scene-mist')).toBeNull();
  // The glint is clipped off the sand.
  expect(container.querySelector('.scene-glitter').style.clipPath).toMatch(/^polygon\(/);

  rerender(<SceneAmbience biome="bay" />);
  expect(container.querySelectorAll('.scene-mover.is-wave').length).toBe(10);
  expect(container.querySelectorAll('.scene-foam').length).toBe(3);
  expect(container.querySelector('.scene-wash')).toBeNull();

  rerender(<SceneAmbience biome="offshore" />);
  expect(container.querySelectorAll('.scene-mover.is-cap').length).toBe(10);

  rerender(<SceneAmbience biome="canyon" />);
  expect(container.querySelector('.scene-gleam')).toBeInTheDocument();
  expect(container.querySelector('.scene-caustics')).toBeNull();

  rerender(<SceneAmbience biome="flats" />);
  expect(container.querySelector('.scene-caustics')).toBeInTheDocument();
  expect(container.querySelector('.scene-gleam')).toBeNull();

  rerender(<SceneAmbience biome="creek" />);
  expect(container.querySelectorAll('.scene-grass').length).toBe(12);

  // The swamp hangs moss and bubbles all year and lights up only after dark.
  rerender(<SceneAmbience biome="swamp" />);
  expect(container.querySelectorAll('.scene-moss').length).toBe(9);
  expect(container.querySelectorAll('.scene-bubble').length).toBe(5);
  expect(container.querySelector('.scene-firefly')).toBeNull();
  rerender(<SceneAmbience biome="swamp" period="night" />);
  expect(container.querySelectorAll('.scene-firefly').length).toBe(10);

  // The frozen lake: snow over everything, mist over the lead, nothing on the ice.
  rerender(<SceneAmbience biome="mountainlake" season="winter" />);
  expect(container.querySelector('.scene-snow')).toBeInTheDocument();
  expect(container.querySelectorAll('.scene-mist').length).toBe(2);
  expect(container.querySelector('.scene-ring')).toBeNull();
  expect(container.querySelector('.scene-dragonfly')).toBeNull();
});

test('after dark the gulls roost, the stars come out, and the swamp bugs keep going', () => {
  const { container, rerender } = render(<SceneAmbience biome="bay" period="night" />);
  expect(container.querySelector('.scene-gull')).toBeNull();
  expect(container.querySelector('.scene-stars')).toBeInTheDocument();
  rerender(<SceneAmbience biome="swamp" period="night" />);
  expect(container.querySelectorAll('.scene-dragonfly').length).toBe(2);
  // No sky to put stars in under the canopy.
  expect(container.querySelector('.scene-stars')).toBeNull();
  rerender(<SceneAmbience biome="bay" period="day" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(2);
  expect(container.querySelector('.scene-stars')).toBeNull();
});

test('the layer is laid out on the painting, not the stage, so a phone crop still covers the water the cast pans to', () => {
  // A phone stage is 338 units wide: the painting (480) runs past its edge, and so does the layer.
  const { container } = render(<SceneAmbience biome="river" viewW={338} />);
  const layer = container.querySelector('.scene-ambience');
  expect(parseFloat(layer.style.width)).toBeCloseTo((480 / 338) * 100, 0);
  expect(layer.style.left).toBe('0px');
  // A streak that starts on the painting's right edge is placed by the painting, whatever the crop.
  const far = Array.from(container.querySelectorAll('.scene-mover.is-current')).find((el) => el.style.left === '97.5%');
  expect(far).toBeTruthy();
  const { container: wide } = render(<SceneAmbience biome="river" viewW={480} />);
  expect(Array.from(wide.querySelectorAll('.scene-mover.is-current')).map((el) => el.style.left)).toContain('97.5%');
});

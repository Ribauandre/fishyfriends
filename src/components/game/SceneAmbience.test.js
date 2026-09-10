import React from 'react';
import { render } from '@testing-library/react';
import SceneAmbience from './SceneAmbience';

test('salt water gets gulls and the dock lamp; offshore has no dock to light', () => {
  const { container, rerender } = render(<SceneAmbience biome="bay" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(2);
  expect(container.querySelector('.scene-dragonfly')).toBeNull();
  expect(container.querySelector('.scene-lamp')).toBeInTheDocument();
  expect(container.querySelectorAll('.scene-cloud').length).toBe(2);

  rerender(<SceneAmbience biome="offshore" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(3);
  expect(container.querySelector('.scene-lamp')).toBeNull();
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
  expect(container.querySelectorAll('.scene-current').length).toBe(6);
  expect(container.querySelector('.scene-ring')).toBeNull();
  expect(container.querySelector('.scene-surf')).toBeNull();

  rerender(<SceneAmbience biome="mountainlake" />);
  expect(container.querySelector('.scene-current')).toBeNull();
  expect(container.querySelectorAll('.scene-ring').length).toBe(3);
  expect(container.querySelector('.scene-mist')).toBeInTheDocument();

  rerender(<SceneAmbience biome="shoreline" />);
  expect(container.querySelectorAll('.scene-surf').length).toBe(3);
  expect(container.querySelector('.scene-mist')).toBeNull();

  rerender(<SceneAmbience biome="bay" />);
  expect(container.querySelector('.scene-water')).toHaveClass('is-swell');
  expect(container.querySelector('.scene-surf')).toBeNull();

  // The swamp hangs moss all year and lights up only after dark.
  rerender(<SceneAmbience biome="swamp" />);
  expect(container.querySelectorAll('.scene-moss').length).toBe(7);
  expect(container.querySelector('.scene-firefly')).toBeNull();
  rerender(<SceneAmbience biome="swamp" period="night" />);
  expect(container.querySelectorAll('.scene-firefly').length).toBe(8);
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

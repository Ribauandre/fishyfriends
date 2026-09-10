import React from 'react';
import { render, act } from '@testing-library/react';
import SceneAmbience from './SceneAmbience';
import { BIOMES } from '../../utils/gameBiomes';
import { jumpGapFor, JUMP_DURATION_MS, nextJumpDelay } from '../../utils/sceneAmbience';

beforeEach(() => {
  jest.useFakeTimers({ legacyFakeTimers: true });
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  Math.random.mockRestore();
  jest.useRealTimers();
});

test('salt water gets gulls and the dock lamp; offshore has no dock to light', () => {
  const { container, rerender } = render(<SceneAmbience biome="bay" phase="ready" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(2);
  expect(container.querySelector('.scene-dragonfly')).toBeNull();
  expect(container.querySelector('.scene-lamp')).toBeInTheDocument();
  expect(container.querySelectorAll('.scene-cloud').length).toBe(2);

  rerender(<SceneAmbience biome="offshore" phase="ready" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(3);
  expect(container.querySelector('.scene-lamp')).toBeNull();
});

test('fresh water gets dragonflies, and the swamp canopy hides the sky', () => {
  const { container, rerender } = render(<SceneAmbience biome="river" phase="ready" />);
  expect(container.querySelectorAll('.scene-dragonfly').length).toBe(1);
  expect(container.querySelector('.scene-gull')).toBeNull();
  expect(container.querySelectorAll('.scene-cloud').length).toBe(1);

  rerender(<SceneAmbience biome="swamp" phase="ready" />);
  expect(container.querySelectorAll('.scene-dragonfly').length).toBe(2);
  expect(container.querySelector('.scene-cloud')).toBeNull();
});

test('a fish from the biome roster jumps in the distance now and then, then disappears', () => {
  const { container } = render(<SceneAmbience biome="mountainlake" phase="ready" />);
  expect(container.querySelector('.scene-jump')).toBeNull();

  // Math.random is pinned to 0.5, so the first jump lands exactly this far in.
  act(() => { jest.advanceTimersByTime(nextJumpDelay('mountainlake', () => 0.5)); });
  const jump = container.querySelector('.scene-jump');
  expect(jump).toBeInTheDocument();
  expect(BIOMES.mountainlake.species).toContain(jump.getAttribute('data-species'));
  expect(container.querySelector('.scene-jump-fish')).toHaveAttribute('data-species', jump.getAttribute('data-species'));

  act(() => { jest.advanceTimersByTime(JUMP_DURATION_MS); });
  expect(container.querySelector('.scene-jump')).toBeNull();
});

test('nothing jumps while a real fish is on the line', () => {
  const { container } = render(<SceneAmbience biome="river" phase="reeling" />);
  act(() => { jest.advanceTimersByTime(jumpGapFor('river')[1] * 2); });
  expect(container.querySelector('.scene-jump')).toBeNull();
});

test('fish shadows cruise under the bobber only while a line is out', () => {
  const { container, rerender } = render(<SceneAmbience biome="bay" phase="ready" />);
  expect(container.querySelector('.scene-shadow')).toBeNull();

  rerender(<SceneAmbience biome="bay" phase="waiting" />);
  const shadows = container.querySelectorAll('.scene-shadow');
  expect(shadows.length).toBe(2);
  shadows.forEach((shadow) => expect(BIOMES.bay.species).toContain(shadow.getAttribute('data-species')));

  rerender(<SceneAmbience biome="bay" phase="hookset" />);
  expect(container.querySelectorAll('.scene-shadow').length).toBe(2);

  rerender(<SceneAmbience biome="bay" phase="reeling" />);
  expect(container.querySelector('.scene-shadow')).toBeNull();
});

test('each ground moves in its own way: the river runs, the lake rings, the beach breaks', () => {
  const { container, rerender } = render(<SceneAmbience biome="river" phase="ready" />);
  expect(container.querySelectorAll('.scene-current').length).toBe(6);
  expect(container.querySelector('.scene-ring')).toBeNull();
  expect(container.querySelector('.scene-surf')).toBeNull();

  rerender(<SceneAmbience biome="mountainlake" phase="ready" />);
  expect(container.querySelector('.scene-current')).toBeNull();
  expect(container.querySelectorAll('.scene-ring').length).toBe(3);
  expect(container.querySelector('.scene-mist')).toBeInTheDocument();

  rerender(<SceneAmbience biome="shoreline" phase="ready" />);
  expect(container.querySelectorAll('.scene-surf').length).toBe(3);
  expect(container.querySelector('.scene-mist')).toBeNull();

  rerender(<SceneAmbience biome="bay" phase="ready" />);
  expect(container.querySelector('.scene-water')).toHaveClass('is-swell');
  expect(container.querySelector('.scene-surf')).toBeNull();

  // The swamp hangs moss all year and lights up only after dark.
  rerender(<SceneAmbience biome="swamp" phase="ready" />);
  expect(container.querySelectorAll('.scene-moss').length).toBe(7);
  expect(container.querySelector('.scene-firefly')).toBeNull();
  rerender(<SceneAmbience biome="swamp" phase="ready" period="night" />);
  expect(container.querySelectorAll('.scene-firefly').length).toBe(8);
});

test('after dark the gulls roost, the stars come out, and the swamp bugs keep going', () => {
  const { container, rerender } = render(<SceneAmbience biome="bay" phase="ready" period="night" />);
  expect(container.querySelector('.scene-gull')).toBeNull();
  expect(container.querySelector('.scene-stars')).toBeInTheDocument();
  rerender(<SceneAmbience biome="swamp" phase="ready" period="night" />);
  expect(container.querySelectorAll('.scene-dragonfly').length).toBe(2);
  // No sky to put stars in under the canopy.
  expect(container.querySelector('.scene-stars')).toBeNull();
  rerender(<SceneAmbience biome="bay" phase="ready" period="day" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(2);
  expect(container.querySelector('.scene-stars')).toBeNull();
});

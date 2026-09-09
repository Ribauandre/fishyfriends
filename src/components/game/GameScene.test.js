import React from 'react';
import { render, screen } from '@testing-library/react';
import GameScene from './GameScene';

test('puts the real angler on the dock with their name on the tag, idling until they cast', () => {
  const { container } = render(<GameScene biome="lake" phase="ready" displayName="Andre" />);
  expect(screen.getByText('ANDRE')).toBeInTheDocument();
  const sprite = container.querySelector('.scene-sprite');
  expect(sprite).toHaveAttribute('data-action', 'idle');
  expect(sprite.className).not.toMatch(/is-playing|is-looping/);
});

test('swaps the stand for the charter boat offshore and keeps the dock elsewhere', () => {
  const { container, rerender } = render(<GameScene biome="offshore" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-biome', 'offshore');
  rerender(<GameScene biome="bay" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-biome', 'bay');
});

test('plays the cast once, holds the rod out while waiting, and strikes on the bite', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="casting" displayName="Andre" />);
  let sprite = container.querySelector('.scene-sprite');
  expect(sprite).toHaveAttribute('data-action', 'cast');
  expect(sprite).toHaveClass('is-playing');

  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" />);
  sprite = container.querySelector('.scene-sprite');
  expect(sprite).toHaveAttribute('data-action', 'cast');
  expect(sprite).not.toHaveClass('is-playing');
  expect(container.querySelector('.scene-bobber')).toBeInTheDocument();

  rerender(<GameScene biome="river" phase="hookset" displayName="Andre" />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'fishon');
  expect(container.querySelector('.scene-splash')).toBeInTheDocument();
});

test('only loops the reel animation while the player is actually holding', () => {
  const reel = { fishPos: 40, zonePos: 45 };
  const { container, rerender } = render(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding={false} />);
  expect(container.querySelector('.scene-sprite')).not.toHaveClass('is-looping');
  const fish = container.querySelector('.scene-fish');
  expect(fish).toHaveAttribute('data-species', 'pike');
  expect(fish.style.left).toBe('40%');
  expect(container.querySelector('.scene-zone').style.width).toBe('30%');

  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding />);
  expect(container.querySelector('.scene-sprite')).toHaveClass('is-looping');
});

test('celebrates a landed fish and holds it up, but just idles after a loss', () => {
  const { container, rerender } = render(<GameScene biome="lake" phase="result" displayName="Andre" result={{ success: true, species: 'walleye' }} />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'celebrate');
  expect(container.querySelector('.scene-trophy')).toHaveAttribute('data-species', 'walleye');
  rerender(<GameScene biome="lake" phase="result" displayName="Andre" result={{ success: false, message: 'The line snapped!' }} />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'idle');
  expect(container.querySelector('.scene-trophy')).toBeNull();
});

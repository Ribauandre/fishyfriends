import React from 'react';
import { render, screen } from '@testing-library/react';
import GameScene from './GameScene';

test('puts the real angler on the dock: avatar as the face when there is one, initial otherwise', () => {
  const { container, rerender } = render(<GameScene biome="lake" phase="ready" displayName="Andre" />);
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.getByText('ANDRE')).toBeInTheDocument();
  expect(container.querySelector('image')).toBeNull();

  rerender(<GameScene biome="lake" phase="ready" displayName="Andre" avatarUrl="https://example.com/me.jpg" />);
  expect(container.querySelector('image')).toHaveAttribute('href', 'https://example.com/me.jpg');
  expect(screen.queryByText('A')).toBeNull();
});

test('swaps the stand for the charter boat offshore and keeps the dock elsewhere', () => {
  const { container, rerender } = render(<GameScene biome="offshore" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-biome', 'offshore');
  rerender(<GameScene biome="bay" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-biome', 'bay');
});

test('shows the bobber while waiting, the splash on the bite, and the real fish art while reeling', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" />);
  expect(container.querySelector('.scene-bobber')).toBeInTheDocument();
  expect(container.querySelector('.scene-splash')).toBeNull();

  rerender(<GameScene biome="river" phase="hookset" displayName="Andre" />);
  expect(container.querySelector('.scene-splash')).toBeInTheDocument();

  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 40, zonePos: 45 }} zoneWidth={30} />);
  const fish = container.querySelector('.scene-fish');
  expect(fish).toHaveAttribute('data-species', 'pike');
  expect(fish.style.left).toBe('40%');
  expect(container.querySelector('.scene-zone').style.width).toBe('30%');
  expect(container.querySelector('.scene-bobber')).toBeNull();
});

test('holds the landed fish up over the angler on a successful result only', () => {
  const { container, rerender } = render(<GameScene biome="lake" phase="result" displayName="Andre" result={{ success: true, species: 'walleye' }} />);
  expect(container.querySelector('.scene-trophy')).toHaveAttribute('data-species', 'walleye');
  rerender(<GameScene biome="lake" phase="result" displayName="Andre" result={{ success: false, message: 'The line snapped!' }} />);
  expect(container.querySelector('.scene-trophy')).toBeNull();
});

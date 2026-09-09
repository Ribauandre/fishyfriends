import React from 'react';
import { render, screen } from '@testing-library/react';
import GameScene from './GameScene';

test('puts the real angler on the dock with their name on the tag, idling until they cast', () => {
  const { container } = render(<GameScene biome="river" phase="ready" displayName="Andre" />);
  expect(screen.getByText('ANDRE')).toBeInTheDocument();
  const sprite = container.querySelector('.scene-sprite');
  expect(sprite).toHaveAttribute('data-action', 'idle');
  expect(sprite.className).not.toMatch(/is-playing|is-looping/);
});

test('paints each biome with its own backdrop and puts the angler on the charter deck offshore', () => {
  const { container, rerender } = render(<GameScene biome="mountainlake" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('mountainlake'));
  const dockFeet = container.querySelector('.scene-sprite').style.bottom;

  rerender(<GameScene biome="offshore" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('offshore'));
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-biome', 'offshore');
  // The cockpit floor sits lower in the frame than the dock deck.
  expect(parseFloat(container.querySelector('.scene-sprite').style.bottom)).toBeLessThan(parseFloat(dockFeet));
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
  // Reel positions (0-100) are mapped into the open water right of the dock (36%-98%).
  const fish = container.querySelector('.scene-fish');
  expect(fish).toHaveAttribute('data-species', 'pike');
  expect(fish.style.left).toBe('60.8%');
  expect(container.querySelector('.scene-zone').style.width).toBe('18.6%');

  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding />);
  expect(container.querySelector('.scene-sprite')).toHaveClass('is-looping');
});

test('celebrates a landed fish and holds it up, but just idles after a loss', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'walleye' }} />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'celebrate');
  expect(container.querySelector('.scene-trophy')).toHaveAttribute('data-species', 'walleye');
  rerender(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: false, message: 'The line snapped!' }} />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'idle');
  expect(container.querySelector('.scene-trophy')).toBeNull();
});

test('a landed fish gets a burst sized to its rarity', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'bluegill', rarity: 'common' }} />);
  expect(container.querySelector('.scene-sparkles')).toHaveClass('is-common');
  rerender(<GameScene biome="offshore" phase="result" displayName="Andre" result={{ success: true, species: 'shark', rarity: 'legendary' }} />);
  expect(container.querySelector('.scene-sparkles')).toHaveClass('is-legendary');
  rerender(<GameScene biome="offshore" phase="result" displayName="Andre" result={{ success: false, message: 'Gone.' }} />);
  expect(container.querySelector('.scene-sparkles')).toBeNull();
});

test('a trip between grounds drives across the stage in the right vehicle', () => {
  const { container, rerender } = render(<GameScene biome="bay" phase="ready" displayName="Andre" travel={{ to: 'bay', vehicle: 'truck' }} />);
  expect(container.querySelector('.scene-travel')).toHaveAttribute('data-vehicle', 'truck');
  expect(screen.getByText('Bay')).toBeInTheDocument();
  expect(screen.getByText(/heading to/i)).toBeInTheDocument();

  rerender(<GameScene biome="offshore" phase="ready" displayName="Andre" travel={{ to: 'offshore', vehicle: 'boat' }} />);
  expect(container.querySelector('.scene-travel')).toHaveAttribute('data-vehicle', 'boat');
  expect(screen.getByText(/running out to/i)).toBeInTheDocument();

  rerender(<GameScene biome="offshore" phase="ready" displayName="Andre" travel={null} />);
  expect(container.querySelector('.scene-travel')).toBeNull();
});

test('the world around the angler is alive for the biome they are in', () => {
  const { container } = render(<GameScene biome="shoreline" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.scene-ambience')).toHaveAttribute('data-critter', 'seagull');
  expect(container.querySelector('.scene-water')).toBeInTheDocument();
});

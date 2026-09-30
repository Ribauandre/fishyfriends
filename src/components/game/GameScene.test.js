import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameScene, { lampLight, rodTipFor, spriteFilter, NIGHT_GRADE } from './GameScene';
import {
  layoutFor, frameFor, landingX, reelX, waterSpan, castWindow, fightBand, placements, ART_PX, PAINT_H, CAMERA_ANGLER_MARGIN, stageX, stageY,
} from '../../utils/sceneLayout';
import { ANGLER_SPRITES, SPRITE_FRAME, FRAME_MS } from '../../utils/anglerSprites';
import { pixelFishSize } from '../FishIllustration';

const FULL = frameFor(480);
const pct = (value) => parseFloat(value);
// Stage units from a style percentage (x of a 480-wide stage unless said, y of 270).
const sx = (value, viewW = 480) => (pct(value) / 100) * viewW;
const sy = (value) => (pct(value) / 100) * PAINT_H;

// jsdom has no layout; drive the stage's measurement through a fake ResizeObserver and box.
function withStage(width, height, run) {
  const callbacks = [];
  const RO = class { constructor(cb) { callbacks.push(cb); } observe() {} disconnect() {} };
  const original = global.ResizeObserver;
  global.ResizeObserver = RO;
  const rect = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width, height, top: 0, left: 0, right: width, bottom: height });
  try {
    return run({ remeasure: (w, h) => { rect.mockReturnValue({ width: w, height: h, top: 0, left: 0, right: w, bottom: h }); callbacks.forEach((cb) => act(() => cb())); } });
  } finally {
    rect.mockRestore();
    global.ResizeObserver = original;
  }
}

test('puts the real angler on the dock with their name on the tag, idling until they cast', () => {
  const { container } = render(<GameScene biome="river" phase="ready" displayName="Andre" />);
  expect(screen.getByText('ANDRE')).toHaveClass('scene-name-tag', 'is-you');
  const sprite = container.querySelector('.scene-sprite');
  expect(sprite).toHaveAttribute('data-action', 'idle');
  expect(sprite.className).not.toMatch(/is-playing|is-looping/);
  // His feet are on the painting's art grid, so his pixels are its pixels.
  const feet = placements(layoutFor('river')).you;
  expect(Math.abs(feet.x / ART_PX - Math.round(feet.x / ART_PX))).toBeLessThan(0.01);
});

test('paints each biome with its own backdrop and puts the angler on the charter deck offshore', () => {
  const { container, rerender } = render(<GameScene biome="mountainlake" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('mountainlake'));
  // Drawn 203 art rows tall from the painting's top — a third of a unit past its foot.
  expect(sy(container.querySelector('.scene-backdrop').style.height)).toBeCloseTo(203 * ART_PX, 1);
  const dockFeet = container.querySelector('.scene-sprite').style.bottom;

  rerender(<GameScene biome="offshore" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('offshore'));
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-biome', 'offshore');
  // The cockpit floor sits lower in the frame than the dock deck.
  expect(pct(container.querySelector('.scene-sprite').style.bottom)).toBeLessThan(pct(dockFeet));
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
  // The float is pixel art on the water, with the line tied to it and rings opening round it.
  expect(container.querySelector('.scene-bobber path')).toBeInTheDocument();
  expect(container.querySelectorAll('.scene-ripple-ring')).toHaveLength(3);
  expect(container.querySelector('.scene-line').getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+h[\d.]+v[\d.]+/);

  rerender(<GameScene biome="river" phase="hookset" displayName="Andre" />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'reel');
  expect(container.querySelectorAll('.scene-splash-step')).toHaveLength(3);
});

test('the line leaves the rod tip of the frame on screen, and follows it round the reel loop', () => {
  jest.useFakeTimers();
  try {
    const reel = { fishPos: 40, zonePos: 45, progress: 10 };
    const { container } = render(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding />);
    const layout = layoutFor('river');
    const p = placements(layout);
    const feet = { x: stageX(p.you.x, FULL), y: stageY(p.you.y, FULL) };
    const cell = ART_PX;
    const lineStart = () => container.querySelector('.scene-line').getAttribute('d').match(/^M([\d.]+) ([\d.]+)/).slice(1).map(Number);
    const seen = new Set();
    // Look half way through each frame (the clock is read once a display frame).
    act(() => { jest.advanceTimersByTime(FRAME_MS / 2); });
    for (let f = 0; f < 4; f += 1) {
      const tip = rodTipFor(feet, layout.spriteH, 'reel', f);
      // The first cell of the line is the rod tip's cell in that frame…
      const [x, y] = lineStart();
      expect(Math.abs(x - Math.floor(tip.x / cell) * cell)).toBeLessThan(cell + 0.01);
      expect(Math.abs(y - Math.floor(tip.y / cell) * cell)).toBeLessThan(cell + 0.01);
      seen.add(`${x},${y}`);
      act(() => { jest.advanceTimersByTime(FRAME_MS); });
    }
    // …and it moves with the rod: the reel loop swings the tip twenty units.
    expect(seen.size).toBeGreaterThan(2);
    // The tips are the art's own, one per frame.
    expect(ANGLER_SPRITES.reel.rodTips).toHaveLength(ANGLER_SPRITES.reel.frames);
    expect(rodTipFor(feet, 92, 'celebrate', 3).hand).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

test('only loops the reel animation while the player is actually holding', () => {
  const reel = { fishPos: 40, zonePos: 45 };
  const { container, rerender } = render(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding={false} />);
  expect(container.querySelector('.scene-sprite')).not.toHaveClass('is-looping');
  // Reel positions (0-100) are mapped into the painted water right of the dock, never under it.
  const fish = container.querySelector('.scene-fish');
  expect(fish).toHaveAttribute('data-species', 'pike');
  // What's on the line is a shadow, not the pike's sticker: the landing is the reveal.
  expect(fish.querySelector('img')).toHaveAttribute('src', expect.stringContaining('fishshadow'));
  expect(fish.querySelector('img').getAttribute('src')).not.toContain('pike');
  // The shadow is the size of what's on the line, on the scale of every fish in the game — a size
  // class of pixel silhouette drawn at its own art pixels.
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="bluegill" reel={reel} zoneWidth={30} holding={false} catchSize={7} />);
  const small = pct(container.querySelector('.scene-fish').style.width);
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="bluemarlin" reel={reel} zoneWidth={30} holding={false} catchSize={150} />);
  expect(pct(container.querySelector('.scene-fish').style.width)).toBeGreaterThan(small * 2.5);
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding={false} />);
  const river = layoutFor('river');
  const mark = container.querySelector('.scene-fish-mark');
  expect(sx(mark.style.left)).toBeCloseTo(reelX(river, 40, FULL), 0);
  expect(sx(mark.style.left)).toBeGreaterThan(river.water.x0);
  // The mark runs through the shadow's middle.
  const shadowMid = sx(fish.style.left) + sx(fish.style.width) / 2;
  expect(Math.abs(shadowMid - (sx(mark.style.left) + ART_PX / 2))).toBeLessThan(ART_PX);
  const [a, z] = waterSpan(river, FULL);
  // (both edges on the art grid, so within a pixel of it)
  expect(Math.abs(sx(container.querySelector('.scene-zone').style.width) - 0.3 * (z - a))).toBeLessThanOrEqual(ART_PX);
  // The zone says whether the fish is inside it: mint in, coral out — and so do the mark
  // through the fish's centre and the shadow itself.
  expect(container.querySelector('.scene-zone')).toHaveClass('is-in');
  expect(container.querySelector('.scene-fish-mark')).toHaveClass('is-in');
  expect(container.querySelector('.scene-shadow')).toHaveClass('is-in');
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 80, zonePos: 45, fishVel: -2 }} zoneWidth={30} holding={false} />);
  expect(container.querySelector('.scene-zone')).toHaveClass('is-out');
  expect(container.querySelector('.scene-fish-mark')).toHaveClass('is-out');
  expect(container.querySelector('.scene-shadow')).toHaveClass('is-out');
  // Running left, the whole shadow is mirrored about its middle (the wrapper, so the mark stays on it).
  expect(container.querySelector('.scene-shadow')).toHaveClass('is-left');
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding={false} />);
  // The zone is the fight's band on the painted water, not the whole stage.
  expect(sy(container.querySelector('.scene-zone').style.top)).toBeCloseTo(fightBand(river)[0], 0);

  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding />);
  expect(container.querySelector('.scene-sprite')).toHaveClass('is-looping');
});

test('the landed fish is its pixel variant, one file pixel to one art pixel, beside the angler, with its plaque', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'bluegill', sizeIn: 5, sizeLabel: '5.0 in', rarity: 'common', pointsEarned: 6, isRecord: true }} />);
  const trophy = container.querySelector('.scene-trophy');
  expect(trophy).toHaveAttribute('data-variant', 'pixel');
  const size = pixelFishSize('bluegill');
  const catchBox = container.querySelector('.scene-catch');
  expect(sx(catchBox.style.width)).toBeCloseTo(size.w * ART_PX, 1);
  expect(sy(catchBox.style.height)).toBeCloseTo(size.h * ART_PX, 1);
  const plaque = container.querySelector('.scene-plaque');
  expect(plaque).toHaveTextContent('Bluegill');
  expect(plaque).toHaveTextContent('5.0 in');
  expect(plaque).toHaveTextContent('NEW RECORD');
  expect(plaque).toHaveTextContent('+6 tackle points');
  expect(plaque).toHaveTextContent(/tap to continue/i);
  // A record and a rarity are told apart by more than the words.
  expect(container.querySelector('.scene-plaque-tag.is-record')).toBeInTheDocument();
  expect(container.querySelector('.scene-plaque-tag.is-common')).toBeInTheDocument();
  // A bigger one of its kind is the same drawing (its size is on the plaque), never rescaled.
  rerender(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'bluegill', sizeIn: 11, sizeLabel: '11.0 in', rarity: 'common', pointsEarned: 6, derbyFish: true }} />);
  expect(sx(container.querySelector('.scene-catch').style.width)).toBeCloseTo(size.w * ART_PX, 1);
  expect(container.querySelector('.scene-plaque')).toHaveTextContent('11.0 in');
  expect(container.querySelector('.scene-plaque')).toHaveTextContent('DERBY FISH');
  expect(container.querySelector('.scene-plaque')).not.toHaveTextContent('NEW RECORD');
});

// The reveal has to be whole and clear of the celebrating angler at every stage shape: for the
// widest and tallest catches, in the camera's frame, right of his reach.
test('a landed catch never clips and never covers the angler, from a phone to a wide desktop', () => {
  const catches = ['bluegill', 'bluemarlin', 'opah', 'plate', 'stick', 'swordfish'];
  [[390, 351], [960, 540], [1404, 540]].forEach(([w, h]) => withStage(w, h, () => {
    ['river', 'offshore', 'canyon', 'flats', 'pier', 'creek'].forEach((biome) => catches.forEach((species) => {
      const { container, unmount } = render(<GameScene biome={biome} phase="result" displayName="Andre" look={{ pet: 'pet_dog' }} result={{ success: true, species, sizeIn: 10, sizeLabel: '10 in', rarity: 'common', pointsEarned: 1 }} />);
      const viewW = Number(container.querySelector('.game-scene').getAttribute('data-view-w'));
      const world = container.querySelector('.scene-world');
      const cam = { x: Number(world.getAttribute('data-camera-x')), y: Number(world.getAttribute('data-camera-y')), scale: Number(world.getAttribute('data-camera-scale')) };
      const box = container.querySelector('.scene-catch');
      const left = sx(box.style.left, viewW); const width = sx(box.style.width, viewW);
      const top = sy(box.style.top); const height = sy(box.style.height);
      const where = `${species} on ${biome} at ${w}x${h}`;
      const inside = {
        left: left >= cam.x - 0.5,
        right: left + width <= cam.x + viewW / cam.scale + 0.5,
        top: top >= cam.y - 0.5,
        bottom: top + height <= cam.y + PAINT_H / cam.scale + 0.5,
      };
      expect({ where, ...inside }).toEqual({ where, left: true, right: true, top: true, bottom: true });
      // Clear of him: right of the furthest his celebration reaches (the fish he holds up).
      const layout = layoutFor(biome);
      const frame = frameFor(viewW, layout.crop);
      const feetX = stageX(placements(layout).you.x, frame);
      expect({ where, clear: left >= feetX + 31 * ART_PX * frame.k - 0.5 }).toEqual({ where, clear: true });
      unmount();
    }));
  }));
});

test('a stick on the plaque is tagged junk and worth nothing', () => {
  const { container } = render(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'stick', rarity: 'junk', sizeIn: 14, sizeLabel: '14.0 in', pointsEarned: 0 }} />);
  expect(container.querySelector('.scene-plaque')).toHaveTextContent('JUNK');
  expect(container.querySelector('.scene-plaque')).toHaveTextContent('A stick');
  expect(container.querySelector('.scene-trophy')).toHaveAttribute('data-species', 'stick');
  // Nothing to celebrate: he stands, and so does his pet.
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'idle');
});

test('celebrates a landed fish and holds it up, and straightens up after a loss', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'walleye' }} />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'celebrate');
  expect(container.querySelector('.scene-trophy')).toHaveAttribute('data-species', 'walleye');
  rerender(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: false, message: 'The line snapped!' }} />);
  // The sheet draws idle, walk, cast, reel and celebrate, and no slump — so a lost fish simply
  // returns him to standing rather than pressing another pose into service as a reaction.
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'idle');
  expect(container.querySelector('.scene-trophy')).toBeNull();
  expect(container.querySelector('.scene-world')).toHaveAttribute('data-camera', 'rest');
});

test('a landed fish gets a burst sized to its rarity, in its rarity\'s colour, round the catch', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'bluegill', rarity: 'common' }} />);
  expect(container.querySelector('.scene-sparkles')).toHaveClass('is-common');
  expect(container.querySelector('.scene-sparkles').closest('.scene-catch')).not.toBeNull();
  rerender(<GameScene biome="offshore" phase="result" displayName="Andre" result={{ success: true, species: 'shark', rarity: 'legendary' }} />);
  expect(container.querySelector('.scene-sparkles')).toHaveClass('is-legendary');
  expect(container.querySelector('.scene-sparkles').style.color).toBe('rgb(227, 251, 20)');
  // Placed symmetrically about the catch's middle.
  const xs = [...container.querySelectorAll('.scene-sparkles span')].map((s) => pct(s.style.left));
  expect(xs.reduce((sum, x) => sum + x, 0) / xs.length).toBeCloseTo(50, 0);
  rerender(<GameScene biome="offshore" phase="result" displayName="Andre" result={{ success: false, message: 'Gone.' }} />);
  expect(container.querySelector('.scene-sparkles')).toBeNull();
});

test('a trip between grounds drives across the stage in the right vehicle, drawn to the world\'s scale', () => {
  const { container, rerender } = render(<GameScene biome="bay" phase="ready" displayName="Andre" travel={{ to: 'bay', vehicle: 'truck' }} />);
  expect(container.querySelector('.scene-travel')).toHaveAttribute('data-vehicle', 'truck');
  expect(screen.getByText('Bay')).toBeInTheDocument();
  expect(screen.getByText(/heading to/i)).toBeInTheDocument();
  // The pickup is 74 art rows tall: 98.67 painting units of the 270.
  expect(pct(container.querySelector('.travel-vehicle').style.height)).toBeCloseTo((74 * ART_PX / 270) * 100, 1);

  rerender(<GameScene biome="offshore" phase="ready" displayName="Andre" travel={{ to: 'offshore', vehicle: 'boat' }} />);
  expect(container.querySelector('.scene-travel')).toHaveAttribute('data-vehicle', 'boat');
  expect(screen.getByText(/running out to/i)).toBeInTheDocument();

  rerender(<GameScene biome="offshore" phase="ready" displayName="Andre" travel={null} />);
  expect(container.querySelector('.scene-travel')).toBeNull();
});

test('the world around the angler is alive for the biome they are in', () => {
  const { container } = render(<GameScene biome="shoreline" phase="ready" displayName="Andre" />);
  expect(container.querySelector('.scene-ambience')).toHaveAttribute('data-critter', 'seagull');
  expect(container.querySelector('.scene-glitter')).toBeInTheDocument();
});

test('the hour tints the stage, night is its own painting laid over the day one, and the canyon puts the angler on the cockpit deck', () => {
  const { container, rerender } = render(<GameScene biome="bay" phase="ready" displayName="Andre" period="night" />);
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-period', 'night');
  expect(container.querySelector('.scene-tint')).toHaveClass('is-night');
  // Night is its own painting, over the day one, faded in — the day painting stays mounted, so
  // the swap never goes through black.
  const day = container.querySelector('.scene-backdrop.is-day');
  const nightArt = container.querySelector('.scene-backdrop.is-night');
  expect(day).toHaveAttribute('src', expect.stringContaining('bay'));
  expect(nightArt).toHaveAttribute('src', expect.stringContaining('bay_night'));
  expect(nightArt).toHaveClass('is-shown');
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-night-art', 'yes');
  // The tint lies over the angler (he is lit like the dock), and under the play surfaces.
  const tint = container.querySelector('.scene-tint');
  const you = container.querySelector('.scene-sprite.is-you');
  expect(Boolean(you.compareDocumentPosition(tint) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  // The dock lamp throws its light over the tint after dark, on grounds that have one.
  const lamp = container.querySelector('.scene-lamp');
  expect(lamp).toHaveClass('is-night');
  expect(lamp.querySelector('.scene-lamp-pool')).toBeInTheDocument();
  expect(Boolean(tint.compareDocumentPosition(lamp) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  // At night he is graded down to the painting's moonlight, and the lamp's reach lifts him.
  expect(you.style.filter).toMatch(/^brightness\(0\.\d+\)/);
  rerender(<GameScene biome="bay" phase="ready" displayName="Andre" period="dusk" />);
  // Dusk: the night painting is laid ready (hidden) under the day one's tint.
  expect(container.querySelector('.scene-backdrop.is-night')).not.toHaveClass('is-shown');
  expect(container.querySelector('.scene-backdrop.is-day')).toBe(day);
  rerender(<GameScene biome="bay" phase="ready" displayName="Andre" period="day" />);
  expect(container.querySelector('.scene-lamp')).toBeNull();
  expect(container.querySelector('.scene-backdrop.is-night')).toBeNull();
  expect(container.querySelector('.scene-sprite.is-you')).not.toHaveAttribute('data-lit');
  rerender(<GameScene biome="offshore" phase="ready" displayName="Andre" period="night" />);
  expect(container.querySelector('.scene-lamp')).toBeNull();
  expect(container.querySelector('.scene-sprite.is-you')).not.toHaveAttribute('data-lit');
  // Pure: the reach falls off with distance and the hour.
  expect(lampLight({ x: 32, y: 36 }, 60, 136, 92, 'night')).toBeGreaterThan(lampLight({ x: 32, y: 36 }, 140, 136, 92, 'night'));
  expect(lampLight({ x: 32, y: 36 }, 100, 136, 92, 'night')).toBeGreaterThan(lampLight({ x: 32, y: 36 }, 100, 136, 92, 'dusk'));
  expect(lampLight({ x: 32, y: 36 }, 178, 136, 92, 'day')).toBe(0);
  expect(lampLight(null, 60, 136, 92, 'night')).toBe(0);
  expect(lampLight({ x: 32, y: 36 }, 400, 136, 92, 'night')).toBe(0);
  // Pure: the night grade, and the lamp bringing back what it reaches.
  expect(spriteFilter({ night: true })).toBe(`brightness(${NIGHT_GRADE.brightness}) sepia(0) saturate(${NIGHT_GRADE.saturate})`);
  expect(parseFloat(spriteFilter({ night: true, lit: 1 }).match(/brightness\(([\d.]+)/)[1])).toBeGreaterThan(1);
  expect(spriteFilter({})).toBeUndefined();
  expect(spriteFilter({ crew: true })).toMatch(/^brightness\(0\.92\)/);
  rerender(<GameScene biome="canyon" phase="ready" displayName="Andre" period="dusk" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('canyon'));
  expect(container.querySelector('.scene-tint')).toHaveClass('is-dusk');
  // The Canyon's sunset is painted in: the clock's dusk is only a breath over it (App.css).
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-light', 'dusk');
  rerender(<GameScene biome="flats" phase="ready" displayName="Andre" period="day" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('flats'));
  expect(container.querySelector('.game-scene')).not.toHaveAttribute('data-light');
  // The mountain lake freezes over in winter, and only then.
  rerender(<GameScene biome="mountainlake" phase="ready" displayName="Andre" period="day" season="winter" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('mountainlake_winter'));
  expect(container.querySelector('.game-scene')).not.toHaveAttribute('data-night-art');
  rerender(<GameScene biome="mountainlake" phase="ready" displayName="Andre" period="night" season="winter" />);
  expect(container.querySelector('.scene-backdrop.is-night')).toHaveAttribute('src', expect.stringContaining('mountainlake_winter_night'));
  rerender(<GameScene biome="mountainlake" phase="ready" displayName="Andre" period="day" season="summer" />);
  expect(container.querySelector('.scene-backdrop').getAttribute('src')).not.toContain('winter');
  rerender(<GameScene biome="pier" phase="ready" displayName="Andre" period="day" season="winter" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('pier'));
  expect(container.querySelector('.scene-ambience')).toHaveAttribute('data-critter', 'seagull');
});

test('the stage is the tap surface for the current phase, and the meters sit where the action is', async () => {
  const onTap = jest.fn();
  const { container, rerender } = render(<GameScene biome="river" phase="casting" displayName="Andre" interaction={{ label: 'Stop the cast', onTap }} callout="Tap to stop the cast in the sweet spot." />);
  expect(container.querySelector('.stage-meter.is-cast')).toBeInTheDocument();
  expect(screen.getByText(/tap to stop the cast/i)).toHaveClass('stage-callout');
  await userEvent.click(screen.getByRole('button', { name: 'Stop the cast' }));
  expect(onTap).toHaveBeenCalledTimes(1);

  const onHoldStart = jest.fn(); const onHoldEnd = jest.fn();
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 40, zonePos: 45, progress: 30 }} zoneWidth={30} tension={55} interaction={{ label: 'Hold to reel in', onHoldStart, onHoldEnd }} />);
  const surface = screen.getByRole('button', { name: 'Hold to reel in' });
  expect(surface).toHaveClass('is-hold');
  fireEvent.pointerDown(surface);
  expect(onHoldStart).toHaveBeenCalledTimes(1);
  fireEvent.pointerUp(surface);
  expect(onHoldEnd).toHaveBeenCalledTimes(1);
  // A phone's long press must not turn into a text-selection callout over the stage.
  expect(fireEvent.contextMenu(surface)).toBe(false);
  const tension = container.querySelector('.stage-meter.is-tension');
  expect(tension.querySelector('.stage-meter-fill').style.height).toBe('55%');
  // Strain is a colour step, not a gradient: low, then amber past 60, coral past 85.
  expect(tension).toHaveAttribute('data-strain', 'low');
  expect(container.querySelector('.stage-progress span').style.width).toBe('30%');
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 40, zonePos: 45, progress: 30 }} zoneWidth={30} tension={92} interaction={{ label: 'Hold to reel in', onHoldStart, onHoldEnd }} />);
  expect(container.querySelector('.stage-meter.is-tension')).toHaveAttribute('data-strain', 'high');
  expect(container.querySelector('.scene-line')).toHaveClass('is-strained');

  rerender(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: false, message: 'Gone.' }} />);
  expect(container.querySelector('.scene-action')).toBeNull();
});

test('a worked lure travels back toward the rod with its gauge over it, and the hookset ring lands on the strike', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" lure="jerkbait" lureDisplay={{ marker: 60, attraction: 40, lineOut: 100 }} lureFeedback="Nice twitch." />);
  const lure = container.querySelector('.scene-lure');
  expect(lure).toHaveAttribute('data-lure', 'jerkbait');
  // The lure on the water is its own small sprite, drawn at its art pixels.
  expect(sx(lure.style.width)).toBeCloseTo(17 * ART_PX, 1);
  const farLeft = pct(lure.style.left);
  expect(container.querySelector('.scene-bobber')).toBeNull();
  expect(container.querySelector('.stage-gauge')).toHaveClass('is-jerkbait');
  expect(container.querySelector('.stage-gauge-marker').style.left).toBe('60%');
  expect(container.querySelector('.stage-gauge-fill span').style.width).toBe('40%');
  expect(screen.getByText('Nice twitch.')).toHaveClass('stage-feedback');

  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" lure="jerkbait" lureDisplay={{ marker: 10, attraction: 70, lineOut: 40 }} />);
  expect(pct(container.querySelector('.scene-lure').style.left)).toBeLessThan(farLeft);

  rerender(<GameScene biome="river" phase="hookset" displayName="Andre" lure="jerkbait" lureDisplay={{ marker: 10, attraction: 100, lineOut: 40 }} hooksetWindowMs={700} />);
  expect(container.querySelector('.stage-gauge')).toBeNull();
  const ring = container.querySelector('.scene-hook-ring');
  expect(ring).toHaveAttribute('data-window-ms', '700');
  // It closes in steps across the window, the last step held.
  const steps = [...ring.querySelectorAll('.scene-hook-step')];
  expect(steps.length).toBeGreaterThan(3);
  expect(steps[steps.length - 1]).toHaveClass('is-last');
  expect(pct(steps[steps.length - 1].style.animationDelay) + pct(steps[steps.length - 1].style.animationDuration)).toBeCloseTo(700, 0);
  // On the strike: the lure's eye, where the line is tied.
  expect(Number(ring.getAttribute('data-x'))).toBeCloseTo(sx(container.querySelector('.scene-lure').style.left), 0);

  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" lure="crankbait" lureDisplay={{ speed: 52, bandCenter: 50, attraction: 20, distance: 30 }} />);
  expect(container.querySelector('.stage-gauge')).toHaveClass('is-crankbait');
  expect(container.querySelector('.scene-lure')).toHaveClass('is-wobbling');
});

test('a harder cast lands the bobber further out', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={20} />);
  const shortCast = Number(container.querySelector('.scene-bobber').getAttribute('data-x'));
  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={90} />);
  expect(Number(container.querySelector('.scene-bobber').getAttribute('data-x'))).toBeGreaterThan(shortCast);
});

test('club members on the same ground stand in the layout\'s slots in their own pose, with a bubble for a fresh catch', () => {
  const now = () => 100000;
  const others = [
    { userId: 'u3', name: 'Sam', biome: 'flats', phase: 'result', species: 'bonefish', lastCatch: { species: 'Bonefish', at: 96000 } },
    { userId: 'u2', name: 'Kevin', biome: 'flats', phase: 'reeling', species: 'tarpon' },
    { userId: 'u5', name: 'Lee', biome: 'flats', phase: 'ready' },
  ];
  const { container, rerender } = render(<GameScene biome="flats" phase="ready" displayName="Andre" others={others} now={now} />);
  // The bow takes one guest; the others are counted.
  const crew = container.querySelectorAll('.scene-sprite.is-crew:not(.scene-pet)');
  expect(crew.length).toBe(1);
  expect(crew[0]).toHaveAttribute('data-action', 'celebrate');
  expect(screen.getByText('SAM')).toHaveClass('scene-crew-tag', 'scene-name-tag', 'is-crew');
  expect(screen.getByText('Landed a bonefish!')).toHaveClass('scene-crew-bubble');
  expect(screen.getByText('+2 more')).toBeInTheDocument();
  expect(container.querySelector('.scene-sprite.is-you')).toHaveAttribute('data-action', 'idle');
  // Crew stand behind the player, further left along the deck, at the same size.
  const you = container.querySelector('.scene-sprite.is-you');
  expect(pct(crew[0].style.left)).toBeLessThan(pct(you.style.left));
  expect(crew[0].style.height).toBe(you.style.height);
  // On the pier the guest stands a row back, so their name goes over their head.
  rerender(<GameScene biome="pier" phase="ready" displayName="Andre" others={[{ userId: 'u2', name: 'Kevin', phase: 'reeling' }]} now={now} />);
  expect(container.querySelector('.scene-sprite.is-crew')).toHaveAttribute('data-action', 'reel');
  expect(container.querySelector('.scene-sprite.is-crew')).toHaveClass('is-looping');
  expect(screen.getByText('KEVIN')).toHaveClass('is-above');
  expect(screen.getByText('ANDRE')).not.toHaveClass('is-above');
  expect(screen.queryByText(/more$/)).toBeNull();
});

test('the charter has room for the angler and his pet alone: guests are counted on a sign', () => {
  const others = [{ userId: 'u2', name: 'Kevin', phase: 'ready' }, { userId: 'u3', name: 'Sam', phase: 'ready' }];
  const { container } = render(<GameScene biome="offshore" phase="ready" displayName="Andre" others={others} />);
  expect(container.querySelectorAll('.scene-sprite.is-crew').length).toBe(0);
  expect(screen.getByText('+2 more')).toBeInTheDocument();
  // The dock has room for one.
  const { container: dock } = render(<GameScene biome="river" phase="ready" displayName="Andre" others={others} />);
  expect(dock.querySelectorAll('.scene-sprite.is-crew').length).toBe(1);
});

test('a taller stage keeps the scene on the painting: positions follow the visible width', () => {
  withStage(400, 300, ({ remeasure }) => {
    const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={100} />);
    const scene = container.querySelector('.game-scene');
    expect(scene).toHaveAttribute('data-view-w', '360');
    expect(container.querySelector('.game-scene-svg')).toHaveAttribute('viewBox', '0 0 360 270');
    // The hardest cast lands inside the water the cast camera shows, which on a stage this
    // narrow reaches past the painting the deck view crops to.
    const bobber = Number(container.querySelector('.scene-bobber').getAttribute('data-x'));
    expect(bobber).toBeGreaterThan(360 - 24);
    expect(bobber).toBeLessThanOrEqual(castWindow(layoutFor('river'), frameFor(360))[1] - 24);
    // The angler's feet keep the same unit position, so as a share of a narrower stage he sits further right.
    const leftNarrow = pct(container.querySelector('.scene-sprite.is-you').style.left);
    remeasure(480, 270);
    rerender(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={100} />);
    expect(scene).toHaveAttribute('data-view-w', '480');
    expect(pct(container.querySelector('.scene-sprite.is-you').style.left)).toBeLessThan(leftNarrow);
    // Sizes on the stage are art pixels: --k is how far the painting is scaled onto it.
    expect(scene.style.getPropertyValue('--k')).toBe('1');
  });
});

test('the derby champion flies the golden pennant from the rod tip, and so does a champion on the crew', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="ready" displayName="Andre" champion />);
  const pennant = container.querySelector('.scene-pennant');
  expect(pennant).toHaveAttribute('data-cosmetic', 'golden-pennant');
  expect(screen.getByText('ANDRE')).toHaveClass('is-champion');
  // It follows the rod: the cast pose holds the rod far out to the right.
  const idleLeft = pct(pennant.style.left);
  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" champion />);
  expect(pct(container.querySelector('.scene-pennant').style.left)).toBeGreaterThan(idleLeft);
  // Drawn at its own 24 x 16 painting units (a 3:2 flag, App.css), not stretched.
  expect(sx(container.querySelector('.scene-pennant').style.width)).toBeCloseTo(24, 1);

  rerender(<GameScene biome="river" phase="ready" displayName="Andre" others={[{ userId: 'u2', name: 'Kevin', phase: 'ready', champion: true }, { userId: 'u3', name: 'Sam', phase: 'ready' }]} />);
  expect(container.querySelectorAll('.scene-pennant').length).toBe(1);
  expect(screen.getByText('KEVIN')).toHaveClass('is-champion');
});

test('holding up his catch he has no rod to fly the pennant from, so it is struck for that frame', () => {
  jest.useFakeTimers();
  try {
    const { container } = render(<GameScene biome="river" phase="result" displayName="Andre" champion result={{ success: true, species: 'pike' }} />);
    expect(container.querySelector('.scene-pennant')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(FRAME_MS * 5); });
    expect(container.querySelector('.scene-pennant')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

test('the camera pans to the water on the cast, holds there for the fight and the landing, and settles back after', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="ready" displayName="Andre" />);
  const world = () => container.querySelector('.scene-world');
  expect(world()).toHaveAttribute('data-camera', 'rest');
  expect(world().style.transform).toBe('scale(1) translate(0%, 0%)');

  // Pressing Cast pans to the water: the angler just inside the left edge and the rest water.
  rerender(<GameScene biome="river" phase="casting" displayName="Andre" />);
  expect(world()).toHaveAttribute('data-camera', 'cast');
  const castScale = Number(world().getAttribute('data-camera-scale'));
  const castX = Number(world().getAttribute('data-camera-x'));
  const feetX = placements(layoutFor('river')).you.x;
  expect(castScale).toBeGreaterThan(1.15);
  // (as far as the painting's right edge lets the frame go)
  expect(castX).toBeCloseTo(Math.min(feetX - CAMERA_ANGLER_MARGIN, 480 - 480 / castScale), 1);
  // The power meter stands at his back, in screen space, between the frame's edge and him.
  const meterPct = pct(container.querySelector('.stage-meter.is-cast').style.left);
  expect(meterPct).toBeGreaterThanOrEqual(0);
  expect(meterPct).toBeLessThan(((feetX - 24 - castX) * castScale / 480) * 100);

  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={100} />);
  expect(world()).toHaveAttribute('data-camera', 'fight');
  expect(container.querySelector('.game-scene')).toHaveClass('is-focused');
  const scale = Number(world().getAttribute('data-camera-scale'));
  const x = Number(world().getAttribute('data-camera-x'));
  expect(scale).toBe(castScale);
  expect(world().style.transform).toMatch(/^scale\(1\.\d+\) translate\(-\d+(\.\d+)?%, -\d+(\.\d+)?%\)$/);
  // The bobber lands inside the visible window, and the angler is still in shot.
  const bobberX = Number(container.querySelector('.scene-bobber').getAttribute('data-x'));
  expect(bobberX).toBeLessThan(x + 480 / scale);
  expect(x).toBeLessThan(feetX);

  // The tension meter is drawn outside the camera, so it stays on screen where the angler now is.
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 40, zonePos: 45, progress: 30 }} zoneWidth={30} tension={55} />);
  expect(world()).toHaveAttribute('data-camera', 'fight');
  const meter = container.querySelector('.stage-meter.is-tension');
  expect(meter.closest('.scene-world')).toBeNull();
  expect(pct(meter.style.left)).toBeGreaterThanOrEqual(0);
  expect(container.querySelector('.scene-fish').closest('.scene-world')).not.toBeNull();

  // The landing keeps the frame (the catch is laid out in the world beside him)…
  rerender(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'pike' }} />);
  expect(world()).toHaveAttribute('data-camera', 'result');
  expect(container.querySelector('.scene-trophy').closest('.scene-world')).not.toBeNull();
  // …and the next ready settles it back.
  rerender(<GameScene biome="river" phase="ready" displayName="Andre" />);
  expect(world()).toHaveAttribute('data-camera', 'rest');
});

test('on the boat the camera never pushes past the angler: he stays at the left edge of the fight', () => {
  const { container } = render(<GameScene biome="offshore" phase="reeling" displayName="Andre" species="tuna" reel={{ fishPos: 60, zonePos: 55, progress: 10 }} zoneWidth={20} tension={20} />);
  const world = container.querySelector('.scene-world');
  const x = Number(world.getAttribute('data-camera-x'));
  const feetX = placements(layoutFor('offshore')).you.x;
  expect(x).toBeGreaterThan(0);
  expect(x).toBeLessThanOrEqual(feetX - CAMERA_ANGLER_MARGIN + 0.01);
  // The meter stands at his back, on screen.
  const scale = Number(world.getAttribute('data-camera-scale'));
  const meterLeft = pct(container.querySelector('.stage-meter.is-tension').style.left);
  expect(meterLeft).toBeGreaterThanOrEqual(0);
  expect(meterLeft).toBeLessThan(((feetX - x) * scale / 480) * 100);
});

test('the fly rod aims at the rise: the ring sits where the fly will land and the meter band moves to it', () => {
  const { container, rerender } = render(<GameScene biome="mountainlake" phase="casting" displayName="Andre" lure="dryfly" castBand={[52, 68]} rise={60} interaction={{ label: 'Stop the cast', onTap: () => {} }} />);
  const band = container.querySelector('.stage-meter-band');
  expect(band.style.bottom).toBe('52%');
  expect(band.style.height).toBe('16%');
  const ring = container.querySelector('.scene-rise');
  expect(ring).toHaveAttribute('data-rise', '60');
  // Same spot a cast of that power lands (on the art grid).
  expect(Math.abs(Number(ring.getAttribute('data-x')) - landingX(layoutFor('mountainlake'), 60, FULL))).toBeLessThanOrEqual(ART_PX);
  expect(ring.querySelectorAll('.scene-rise-ring')).toHaveLength(3);

  // On the drift the fly moves down the run from where it landed, with the drag gauge over it.
  rerender(<GameScene biome="mountainlake" phase="waiting" displayName="Andre" lure="dryfly" castDistance={60} rise={60} lureDisplay={{ drag: 50, drift: 50, attraction: 30 }} />);
  const fly = container.querySelector('.scene-lure');
  expect(fly).toHaveAttribute('data-lure', 'dryfly');
  expect(sx(fly.style.left)).toBeGreaterThan(landingX(layoutFor('mountainlake'), 60, FULL));
  expect(container.querySelector('.stage-gauge')).toHaveClass('is-dryfly');
  expect(container.querySelector('.stage-gauge-marker').style.left).toBe('50%');

  // No ring, no gauge, once the fish is on.
  rerender(<GameScene biome="mountainlake" phase="reeling" displayName="Andre" lure="dryfly" species="browntrout" reel={{ fishPos: 40, zonePos: 45 }} zoneWidth={30} />);
  expect(container.querySelector('.scene-rise')).toBeNull();
  expect(container.querySelector('.stage-gauge')).toBeNull();
});

test('the angler wears the look he is given, and so does the crew (stock art where there is no canvas)', () => {
  const others = [{ userId: 'u2', name: 'Kevin', phase: 'ready', look: { hat: 'cap_red', skin: 'deep' } }];
  const { container } = render(<GameScene biome="river" phase="ready" displayName="Andre" look={{ skin: 'fair', boots: 'boots_yellow' }} others={others} />);
  const you = container.querySelector('.scene-sprite.is-you');
  expect(you.getAttribute('data-look')).toContain('fair');
  expect(you).toHaveAttribute('data-painted', 'no');
  expect(you.style.backgroundImage).toContain('idle');
  expect(container.querySelector('.scene-sprite.is-crew').getAttribute('data-look')).toContain('cap_red');
});

test('a dock pet sits in the layout\'s spot beside its angler, the crew bring theirs where there is room, and a pet nobody owns stays home', () => {
  const others = [{ userId: 'u2', name: 'Kevin', phase: 'ready', look: { pet: 'pet_cat' } }];
  const { container, rerender } = render(<GameScene biome="pier" phase="ready" displayName="Andre" look={{ pet: 'pet_dog' }} others={others} />);
  const mine = container.querySelector('.scene-pet.is-you');
  expect(mine).toHaveAttribute('data-pet', 'pet_dog');
  expect(mine.style.backgroundImage).toContain('dog');
  // Behind him: further left than his own sprite's box, and smaller.
  const me = container.querySelector('.scene-sprite.is-you:not(.scene-pet)');
  expect(pct(mine.style.left)).toBeLessThan(pct(me.style.left) + 20);
  expect(pct(mine.style.height)).toBeLessThan(pct(me.style.height));
  const theirs = container.querySelectorAll('.scene-pet.is-crew');
  expect(theirs.length).toBe(1);
  expect(theirs[0]).toHaveAttribute('data-pet', 'pet_cat');
  // At rest the pet idles: a long cycle that holds the sitting frame and flicks the tail
  // (pet-idle in App.css), started at an offset of its own so two pets never flick together.
  expect(mine).toHaveAttribute('data-mood', 'idle');
  expect(mine).toHaveClass('is-idle');
  expect(mine.style.getPropertyValue('--pet-flick')).toMatch(/%$/);
  expect(pct(mine.style.animationDuration)).toBeGreaterThan(4000);
  expect(mine.style.animationDelay).toMatch(/^-/);
  expect(mine.style.animationDelay).not.toBe(theirs[0].style.animationDelay);
  // The dock has room for a guest but not their pet: it stays home rather than sit in somebody.
  rerender(<GameScene biome="river" phase="ready" displayName="Andre" look={{ pet: 'pet_dog' }} others={others} />);
  expect(container.querySelectorAll('.scene-pet.is-crew').length).toBe(0);
  expect(container.querySelector('.scene-pet.is-you')).toBeInTheDocument();

  rerender(<GameScene biome="river" phase="ready" displayName="Andre" look={{ pet: 'pet_none' }} others={[]} />);
  expect(container.querySelector('.scene-pet')).toBeNull();
  // At night the pet near the post is lit by the lamp.
  rerender(<GameScene biome="river" phase="ready" displayName="Andre" look={{ pet: 'pet_dog' }} period="night" />);
  expect(container.querySelector('.scene-pet.is-you')).toHaveAttribute('data-lit');
});

test('when a fish is landed the pet celebrates with its angler, and settles again after', () => {
  const others = [{ userId: 'u2', name: 'Kevin', phase: 'result', species: 'trout', look: { pet: 'pet_cat' } }];
  const { container, rerender } = render(<GameScene biome="flats" phase="result" result={{ success: true, species: 'bonefish' }} displayName="Andre" look={{ pet: 'pet_dog' }} others={others} />);
  const mine = container.querySelector('.scene-pet.is-you');
  expect(mine).toHaveAttribute('data-mood', 'cheer');
  expect(mine.style.backgroundImage).toContain('dog_cheer');
  // The cheer strip is stepped through on a fast loop, and the animal keeps its pixel size
  // (the strip is taller than the sitting one, so the box is too).
  expect(mine.style.animationTimingFunction).toMatch(/^steps\(/);
  expect(pct(mine.style.animationDuration)).toBeLessThan(1000);
  expect(container.querySelector('.scene-pet.is-crew')).toHaveAttribute('data-mood', 'cheer');
  // Sal lost his fish: no celebration, and his dog stays sat.
  rerender(<GameScene biome="flats" phase="result" result={{ success: true, species: 'bonefish' }} displayName="Andre" look={{ pet: 'pet_dog' }} others={[{ userId: 'u3', name: 'Sal', phase: 'result', species: null, look: { pet: 'pet_dog' } }]} />);
  expect(container.querySelector('.scene-pet.is-crew')).toHaveAttribute('data-mood', 'idle');

  rerender(<GameScene biome="flats" phase="result" result={{ success: false }} displayName="Andre" look={{ pet: 'pet_dog' }} others={[]} />);
  expect(container.querySelector('.scene-pet.is-you')).toHaveAttribute('data-mood', 'idle');
  rerender(<GameScene biome="flats" phase="ready" displayName="Andre" look={{ pet: 'pet_dog' }} others={[]} />);
  expect(container.querySelector('.scene-pet.is-you').style.backgroundImage).not.toContain('cheer');
});

test('a bought decoration stands on your own deck at the layout\'s anchor at its own size, and a crew mate\'s does not', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="ready" displayName="Andre" look={{ decor: 'decor_flag' }} others={[{ userId: 'u2', name: 'Kevin', phase: 'ready', look: { decor: 'decor_cooler' } }]} />);
  const props = container.querySelectorAll('.scene-decor');
  expect(props.length).toBe(1);
  expect(props[0]).toHaveAttribute('data-decor', 'decor_flag');
  expect(props[0].getAttribute('src')).toContain('decor_flag');
  // Its own rows of art pixels (27 for the flag), never scaled to the ground.
  expect(sy(props[0].style.height)).toBeCloseTo(27 * ART_PX, 1);
  rerender(<GameScene biome="river" phase="ready" displayName="Andre" look={{ decor: 'decor_none' }} />);
  expect(container.querySelector('.scene-decor')).toBeNull();
  // Every ground has somewhere to put one.
  rerender(<GameScene biome="offshore" phase="ready" displayName="Andre" look={{ decor: 'decor_cooler' }} />);
  expect(container.querySelector('.scene-decor')).toHaveAttribute('data-decor', 'decor_cooler');
});

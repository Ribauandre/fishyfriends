import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameScene from './GameScene';
import { layoutFor, frameFor, landingX, reelX, waterSpan, castWindow } from '../../utils/sceneLayout';

const FULL = frameFor(480);

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
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'reel');
  expect(container.querySelector('.scene-splash')).toBeInTheDocument();
});

test('only loops the reel animation while the player is actually holding', () => {
  const reel = { fishPos: 40, zonePos: 45 };
  const { container, rerender } = render(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding={false} />);
  expect(container.querySelector('.scene-sprite')).not.toHaveClass('is-looping');
  // Reel positions (0-100) are mapped into the painted water right of the dock, never under it.
  const fish = container.querySelector('.scene-fish');
  expect(fish).toHaveAttribute('data-species', 'pike');
  const river = layoutFor('river');
  expect(parseFloat(fish.style.left)).toBeCloseTo((reelX(river, 40, FULL) / 480) * 100, 1);
  expect(parseFloat(fish.style.left)).toBeGreaterThan((river.water.x0 / 480) * 100);
  const [a, z] = waterSpan(river, FULL);
  expect(parseFloat(container.querySelector('.scene-zone').style.width)).toBeCloseTo((0.3 * (z - a) / 480) * 100, 1);
  // The zone is the painted water, not the whole stage.
  expect(parseFloat(container.querySelector('.scene-zone').style.top)).toBeCloseTo((river.water.y0 / 270) * 100, 1);

  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={reel} zoneWidth={30} holding />);
  expect(container.querySelector('.scene-sprite')).toHaveClass('is-looping');
});

test('celebrates a landed fish and holds it up, but slumps after a loss', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'walleye' }} />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'celebrate');
  expect(container.querySelector('.scene-trophy')).toHaveAttribute('data-species', 'walleye');
  rerender(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: false, message: 'The line snapped!' }} />);
  expect(container.querySelector('.scene-sprite')).toHaveAttribute('data-action', 'hurt');
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

test('the hour tints the stage and the canyon puts the angler on the cockpit deck', () => {
  const { container, rerender } = render(<GameScene biome="bay" phase="ready" displayName="Andre" period="night" />);
  expect(container.querySelector('.game-scene')).toHaveAttribute('data-period', 'night');
  expect(container.querySelector('.scene-tint')).toHaveClass('is-night');
  rerender(<GameScene biome="canyon" phase="ready" displayName="Andre" period="dusk" />);
  expect(container.querySelector('.scene-backdrop')).toHaveAttribute('src', expect.stringContaining('canyon'));
  expect(container.querySelector('.scene-tint')).toHaveClass('is-dusk');
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
  expect(container.querySelector('.stage-meter.is-tension .stage-meter-fill').style.height).toBe('55%');
  expect(container.querySelector('.stage-progress span').style.width).toBe('30%');

  rerender(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: false, message: 'Gone.' }} />);
  expect(container.querySelector('.scene-action')).toBeNull();
});

test('a worked lure travels back toward the rod with its gauge over it, and the hookset ring lands on the strike', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" lure="jerkbait" lureDisplay={{ marker: 60, attraction: 40, lineOut: 100 }} lureFeedback="Nice twitch." />);
  const lure = container.querySelector('.scene-lure');
  expect(lure).toHaveAttribute('data-lure', 'jerkbait');
  const farLeft = parseFloat(lure.style.left);
  expect(container.querySelector('.scene-bobber')).toBeNull();
  expect(container.querySelector('.stage-gauge')).toHaveClass('is-jerkbait');
  expect(container.querySelector('.stage-gauge-marker').style.left).toBe('60%');
  expect(container.querySelector('.stage-gauge-fill span').style.width).toBe('40%');
  expect(screen.getByText('Nice twitch.')).toHaveClass('stage-feedback');

  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" lure="jerkbait" lureDisplay={{ marker: 10, attraction: 70, lineOut: 40 }} />);
  expect(parseFloat(container.querySelector('.scene-lure').style.left)).toBeLessThan(farLeft);

  rerender(<GameScene biome="river" phase="hookset" displayName="Andre" lure="jerkbait" lureDisplay={{ marker: 10, attraction: 100, lineOut: 40 }} hooksetWindowMs={700} />);
  expect(container.querySelector('.stage-gauge')).toBeNull();
  const ring = container.querySelector('.scene-hook-ring');
  expect(ring.style.animationDuration).toBe('700ms');
  expect(ring.style.left).toBe(container.querySelector('.scene-lure').style.left);

  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" lure="crankbait" lureDisplay={{ speed: 52, bandCenter: 50, attraction: 20, distance: 30 }} />);
  expect(container.querySelector('.stage-gauge')).toHaveClass('is-crankbait');
  expect(container.querySelector('.scene-lure')).toHaveClass('is-wobbling');
});

test('a harder cast lands the bobber further out', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={20} />);
  const shortCast = parseFloat(container.querySelector('.scene-bobber').getAttribute('cx'));
  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={90} />);
  expect(parseFloat(container.querySelector('.scene-bobber').getAttribute('cx'))).toBeGreaterThan(shortCast);
});

test('club members on the same ground stand on the deck in their own pose, with a bubble for a fresh catch', () => {
  const now = () => 100000;
  const others = [
    { userId: 'u2', name: 'Kevin', biome: 'river', phase: 'reeling', species: 'pike' },
    { userId: 'u3', name: 'Sam', biome: 'river', phase: 'result', species: 'walleye', lastCatch: { species: 'Walleye', at: 96000 } },
    { userId: 'u4', name: 'Priya', biome: 'river', phase: 'waiting', lastCatch: { species: 'Carp', at: 10000 } },
    { userId: 'u5', name: 'Lee', biome: 'river', phase: 'ready' },
  ];
  const { container } = render(<GameScene biome="river" phase="ready" displayName="Andre" others={others} now={now} />);
  // The dock has room for two behind the player (the crate and barrel take the rest); the others are counted.
  const crew = container.querySelectorAll('.scene-sprite.is-crew');
  expect(crew.length).toBe(2);
  expect(crew[0]).toHaveAttribute('data-action', 'reel');
  expect(crew[0]).toHaveClass('is-looping');
  expect(crew[1]).toHaveAttribute('data-action', 'celebrate');
  expect(screen.getByText('KEVIN')).toHaveClass('scene-crew-tag');
  expect(screen.getByText('Landed a walleye!')).toHaveClass('scene-crew-bubble');
  expect(screen.queryByText(/landed a carp/i)).toBeNull();
  expect(screen.getByText('+2 more')).toBeInTheDocument();
  expect(container.querySelector('.scene-sprite.is-you')).toHaveAttribute('data-action', 'idle');
  // Crew stand behind the player, further left along the deck.
  const you = parseFloat(container.querySelector('.scene-sprite.is-you').style.left);
  crew.forEach((sprite) => expect(parseFloat(sprite.style.left)).toBeLessThan(you));
});

test('the boat only has room for one guest', () => {
  const others = [{ userId: 'u2', name: 'Kevin', phase: 'ready' }, { userId: 'u3', name: 'Sam', phase: 'ready' }];
  const { container } = render(<GameScene biome="offshore" phase="ready" displayName="Andre" others={others} />);
  expect(container.querySelectorAll('.scene-sprite.is-crew').length).toBe(1);
  expect(screen.getByText('+1 more')).toBeInTheDocument();
});

test('a taller stage keeps the scene on the painting: positions follow the visible width', () => {
  // jsdom has no layout; drive the measurement through a fake ResizeObserver and a fake box.
  const callbacks = [];
  const RO = class { constructor(cb) { callbacks.push(cb); } observe() {} disconnect() {} };
  const original = global.ResizeObserver;
  global.ResizeObserver = RO;
  const rect = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300 });
  try {
    const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={100} />);
    const scene = container.querySelector('.game-scene');
    expect(scene).toHaveAttribute('data-view-w', '360');
    expect(container.querySelector('.game-scene-svg')).toHaveAttribute('viewBox', '0 0 360 270');
    // The hardest cast lands inside the water the cast camera shows, which on a stage this
    // narrow reaches past the painting the deck view crops to.
    const bobber = parseFloat(container.querySelector('.scene-bobber').getAttribute('cx'));
    expect(bobber).toBeGreaterThan(360 - 24);
    expect(bobber).toBeLessThanOrEqual(castWindow(layoutFor('river'), frameFor(360))[1] - 24);
    // The angler's feet keep the same unit position, so as a share of a narrower stage he sits further right.
    const you = container.querySelector('.scene-sprite.is-you');
    const leftNarrow = parseFloat(you.style.left);
    rect.mockReturnValue({ width: 480, height: 270, top: 0, left: 0, right: 480, bottom: 270 });
    callbacks.forEach((cb) => act(() => cb()));
    rerender(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={100} />);
    expect(scene).toHaveAttribute('data-view-w', '480');
    expect(parseFloat(container.querySelector('.scene-sprite.is-you').style.left)).toBeLessThan(leftNarrow);
  } finally {
    rect.mockRestore();
    global.ResizeObserver = original;
  }
});

test('the derby champion flies the golden pennant from the rod tip, and so does a champion on the crew', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="ready" displayName="Andre" champion />);
  const pennant = container.querySelector('.scene-pennant');
  expect(pennant).toHaveAttribute('data-cosmetic', 'golden-pennant');
  expect(container.querySelector('text.is-champion')).toBeInTheDocument();
  // It follows the rod: the cast pose holds the rod far out to the right.
  const idleLeft = parseFloat(pennant.style.left);
  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" champion />);
  expect(parseFloat(container.querySelector('.scene-pennant').style.left)).toBeGreaterThan(idleLeft);

  rerender(<GameScene biome="river" phase="ready" displayName="Andre" others={[{ userId: 'u2', name: 'Kevin', phase: 'ready', champion: true }, { userId: 'u3', name: 'Sam', phase: 'ready' }]} />);
  expect(container.querySelectorAll('.scene-pennant').length).toBe(1);
  expect(screen.getByText('KEVIN')).toHaveClass('is-champion');
  expect(screen.getByText('SAM')).not.toHaveClass('is-champion');
});

test('the camera pans to the water on the cast, holds there for the fight, and settles back after', () => {
  const { container, rerender } = render(<GameScene biome="river" phase="ready" displayName="Andre" />);
  const world = () => container.querySelector('.scene-world');
  expect(world()).toHaveAttribute('data-camera', 'rest');
  expect(world().style.transform).toBe('scale(1) translate(0%, 0%)');

  // Pressing Cast pans to the water: the angler sits just inside the left edge and the rest is water.
  rerender(<GameScene biome="river" phase="casting" displayName="Andre" />);
  expect(world()).toHaveAttribute('data-camera', 'cast');
  const castScale = parseFloat(world().getAttribute('data-camera-scale'));
  const castX = parseFloat(world().getAttribute('data-camera-x'));
  expect(castScale).toBeGreaterThanOrEqual(1.3);
  expect(castX).toBe(178 - 30);
  expect(480 - (castX + 480 / castScale)).toBeLessThan(2);
  // The power meter is still drawn beside him, in screen space — past his front foot now, since
  // the camera leaves no room at his back.
  const meterPct = parseFloat(container.querySelector('.stage-meter.is-cast').style.left);
  expect(meterPct).toBeGreaterThan(((178 - castX) * castScale / 480) * 100);
  expect(meterPct).toBeLessThan(30);

  rerender(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={100} />);
  expect(world()).toHaveAttribute('data-camera', 'fight');
  expect(container.querySelector('.game-scene')).toHaveClass('is-focused');
  const scale = parseFloat(world().getAttribute('data-camera-scale'));
  const x = parseFloat(world().getAttribute('data-camera-x'));
  expect(scale).toBeGreaterThan(1);
  expect(x).toBeGreaterThan(0);
  expect(world().style.transform).toMatch(/^scale\(1\.\d+\) translate\(-\d+(\.\d+)?%, -\d+(\.\d+)?%\)$/);
  // The bobber lands inside the visible window, and the angler is still in shot.
  const bobberX = parseFloat(container.querySelector('.scene-bobber').getAttribute('cx'));
  expect(bobberX).toBeLessThan(x + 480 / scale);
  expect(x).toBeLessThan(178);

  // The tension meter is drawn outside the camera, so it stays on screen where the angler now is.
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 40, zonePos: 45, progress: 30 }} zoneWidth={30} tension={55} />);
  expect(world()).toHaveAttribute('data-camera', 'fight');
  const meter = container.querySelector('.stage-meter.is-tension');
  expect(meter.closest('.scene-world')).toBeNull();
  expect(parseFloat(meter.style.left)).toBeGreaterThan(0);
  expect(container.querySelector('.scene-fish').closest('.scene-world')).not.toBeNull();

  rerender(<GameScene biome="river" phase="result" displayName="Andre" result={{ success: true, species: 'pike' }} />);
  expect(world()).toHaveAttribute('data-camera', 'rest');
  expect(container.querySelector('.scene-trophy').closest('.scene-world')).toBeNull();
});

test('on the boat the camera never pushes past the angler: he stays at the left edge of the fight', () => {
  const { container } = render(<GameScene biome="offshore" phase="reeling" displayName="Andre" species="tuna" reel={{ fishPos: 60, zonePos: 55, progress: 10 }} zoneWidth={20} tension={20} />);
  const world = container.querySelector('.scene-world');
  const x = parseFloat(world.getAttribute('data-camera-x'));
  expect(x).toBeGreaterThan(0);
  expect(x).toBeLessThanOrEqual(92 - 30);
  // With no room at his back the meter stands past his front foot, still on screen.
  const scale = parseFloat(world.getAttribute('data-camera-scale'));
  const meterLeft = parseFloat(container.querySelector('.stage-meter.is-tension').style.left);
  expect(meterLeft).toBeGreaterThan(((92 - x) * scale / 480) * 100);
  expect(meterLeft).toBeLessThan(30);
});

test('the fly rod aims at the rise: the ring sits where the fly will land and the meter band moves to it', () => {
  const { container, rerender } = render(<GameScene biome="mountainlake" phase="casting" displayName="Andre" lure="dryfly" castBand={[52, 68]} rise={60} interaction={{ label: 'Stop the cast', onTap: () => {} }} />);
  const band = container.querySelector('.stage-meter-band');
  expect(band.style.bottom).toBe('52%');
  expect(band.style.height).toBe('16%');
  const ring = container.querySelector('.scene-rise');
  expect(ring).toHaveAttribute('data-rise', '60');
  const ringX = parseFloat(ring.querySelector('circle').getAttribute('cx'));
  // Same spot a cast of that power lands.
  expect(ringX).toBe(landingX(layoutFor('mountainlake'), 60, FULL));

  // On the drift the fly moves down the run from where it landed, with the drag gauge over it.
  rerender(<GameScene biome="mountainlake" phase="waiting" displayName="Andre" lure="dryfly" castDistance={60} rise={60} lureDisplay={{ drag: 50, drift: 50, attraction: 30 }} />);
  const fly = container.querySelector('.scene-lure');
  expect(fly).toHaveAttribute('data-lure', 'dryfly');
  expect(parseFloat(fly.style.left)).toBeGreaterThan((landingX(layoutFor('mountainlake'), 60, FULL) / 480) * 100);
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

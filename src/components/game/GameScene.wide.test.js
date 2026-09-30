import React from 'react';
import { render } from '@testing-library/react';
import GameScene from './GameScene';
import { layoutFor, placements, fightBox, frameFor, stageY, PAINT_H } from '../../utils/sceneLayout';

// A stage wider than the painting (a desktop window): the backdrop is fitted to the width,
// so everything painted into the scene — the dock's end, the angler's spot, the water — sits
// proportionally further right than its 480-unit position. The cast must still land in water,
// and the fight — which a 2.6:1 frame crops the painting's top and bottom off — must be on
// screen whole.
function wide(width, height, run) {
  const RO = class { constructor(cb) { this.cb = cb; } observe() {} disconnect() {} };
  const original = global.ResizeObserver;
  global.ResizeObserver = RO;
  const rect = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width, height, top: 0, left: 0, right: width, bottom: height });
  try { run(); } finally { rect.mockRestore(); global.ResizeObserver = original; }
}

test('on a wide stage the angler, the water and the cast follow the stretched painting', () => wide(1380, 435, () => {
  const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={0} rise={0} />);
  const scene = container.querySelector('.game-scene');
  const viewW = Number(scene.getAttribute('data-view-w'));
  expect(viewW).toBeGreaterThan(480);
  const k = viewW / 480;
  // The weakest cast lands past the painted dock's end (240 painting units), not on the planks.
  const river = layoutFor('river');
  const bobberX = Number(container.querySelector('.scene-bobber').getAttribute('data-x'));
  expect(bobberX).toBeCloseTo(river.cast.min * k, -0.5);
  expect(bobberX).toBeGreaterThan(240 * k);
  expect(Number(container.querySelector('.scene-rise').getAttribute('data-x'))).toBeCloseTo(bobberX, 0);
  // The angler stands at his painted spot, scaled with the painting, and is drawn to scale with it.
  const tag = container.querySelector('.scene-name-tag.is-you');
  expect((parseFloat(tag.style.left) / 100) * viewW).toBeCloseTo(placements(river).you.x * k, 0);
  expect(parseFloat(container.querySelector('.scene-sprite.is-you').style.height)).toBeCloseTo((river.spriteH * k / 270) * 100, 0);
  rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 0, zonePos: 50 }} zoneWidth={20} />);
  // Reel position 0 is the start of the water, which is past the dock too.
  expect((parseFloat(container.querySelector('.scene-fish-mark').style.left) / 100) * viewW).toBeCloseTo(river.water.x0 * k, -0.5);
}));

test('at 2.6:1 the fight camera holds the whole zone, the fish\'s row and the progress gauge', () => wide(1404, 540, () => {
  ['river', 'creek', 'flats', 'canyon', 'baja'].forEach((biome) => {
    const { container, unmount } = render(<GameScene biome={biome} phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 50, zonePos: 50, progress: 40 }} zoneWidth={20} />);
    const viewW = Number(container.querySelector('.game-scene').getAttribute('data-view-w'));
    const world = container.querySelector('.scene-world');
    const y = Number(world.getAttribute('data-camera-y'));
    const bottom = y + PAINT_H / Number(world.getAttribute('data-camera-scale'));
    const sy = (el) => (parseFloat(el.style.top) / 100) * PAINT_H;
    const zone = container.querySelector('.scene-zone');
    const zoneBottom = sy(zone) + (parseFloat(zone.style.height) / 100) * PAINT_H;
    expect({ biome, zoneTop: sy(zone) >= y, zoneBottom: zoneBottom <= bottom }).toEqual({ biome, zoneTop: true, zoneBottom: true });
    expect(sy(container.querySelector('.stage-progress'))).toBeGreaterThanOrEqual(y);
    expect(sy(container.querySelector('.scene-fish'))).toBeGreaterThanOrEqual(y);
    // Including the room below the zone for the callout sign.
    expect(stageY(fightBox(layoutFor(biome))[1], frameFor(viewW, layoutFor(biome).crop))).toBeLessThanOrEqual(bottom + 0.01);
    unmount();
  });
}));

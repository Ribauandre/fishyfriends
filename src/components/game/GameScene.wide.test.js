import React from 'react';
import { render, act } from '@testing-library/react';
import GameScene from './GameScene';
import { layoutFor } from '../../utils/sceneLayout';

// A stage wider than the painting (a desktop window): the backdrop is fitted to the width,
// so everything painted into the scene — the dock's end, the angler's spot, the water — sits
// proportionally further right than its 480-unit position. The cast must still land in water.
test('on a wide stage the angler, the water and the cast follow the stretched painting', () => {
  const callbacks = [];
  const RO = class { constructor(cb) { callbacks.push(cb); } observe() {} disconnect() {} };
  const original = global.ResizeObserver;
  global.ResizeObserver = RO;
  const rect = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1380, height: 435, top: 0, left: 0, right: 1380, bottom: 435 });
  try {
    const { container, rerender } = render(<GameScene biome="river" phase="waiting" displayName="Andre" castDistance={0} rise={0} />);
    const scene = container.querySelector('.game-scene');
    const viewW = Number(scene.getAttribute('data-view-w'));
    expect(viewW).toBeGreaterThan(480);
    const k = viewW / 480;
    // The weakest cast lands past the painted dock's end (240 painting units), not on the planks.
    const river = layoutFor('river');
    const bobberX = parseFloat(container.querySelector('.scene-bobber').getAttribute('cx'));
    expect(bobberX).toBeCloseTo(river.cast.min * k, 0);
    expect(bobberX).toBeGreaterThan(240 * k);
    expect(parseFloat(container.querySelector('.scene-rise circle').getAttribute('cx'))).toBeCloseTo(bobberX, 0);
    // The angler stands at his painted spot, scaled with the painting, and is drawn to scale with it.
    const tag = container.querySelector('text');
    expect(parseFloat(tag.getAttribute('x'))).toBeCloseTo(river.angler.x * k, 0);
    expect(parseFloat(container.querySelector('.scene-sprite.is-you').style.height)).toBeCloseTo((river.spriteH * k / 270) * 100, 0);
    rerender(<GameScene biome="river" phase="reeling" displayName="Andre" species="pike" reel={{ fishPos: 0, zonePos: 50 }} zoneWidth={20} />);
    // Reel position 0 is the start of the water, which is past the dock too.
    expect(parseFloat(container.querySelector('.scene-fish').style.left)).toBeCloseTo((river.water.x0 * k) / viewW * 100, 0);
  } finally {
    rect.mockRestore();
    global.ResizeObserver = original;
  }
});

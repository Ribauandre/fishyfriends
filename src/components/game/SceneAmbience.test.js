import React from 'react';
import { render } from '@testing-library/react';
import SceneAmbience from './SceneAmbience';
import { AMBIENT_SPRITES } from '../../utils/gameProps';
import { ART_COLS, ART_ROWS } from '../../utils/sceneAmbience';

const pct = (value) => parseFloat(value);
const svgOf = (el) => decodeURIComponent(el.style.backgroundImage.replace(/^url\("data:image\/svg\+xml,/, '').replace(/"\)$/, ''));

test('salt water gets gulls in the painting\'s own sky; the dock lamp is not the ambience\'s to draw (GameScene lights it over the tint)', () => {
  const { container, rerender } = render(<SceneAmbience biome="bay" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(2);
  expect(container.querySelector('.scene-dragonfly')).toBeNull();
  expect(container.querySelector('.scene-lamp')).toBeNull();
  // The bay's sky is full of its own painted cumulus: no sprite clouds over it.
  expect(container.querySelector('.scene-cloud')).toBeNull();
  // Clouds and gulls fly inside the sky the painting has, masked by it.
  const sky = container.querySelector('.scene-sky');
  expect(sky.style.maskImage || sky.style.webkitMaskImage).toMatch(/^url\("data:image\/svg\+xml,/);
  sky.querySelectorAll('.scene-cloud, .scene-gull').forEach((el) => expect(el.closest('.scene-sky')).toBe(sky));
  // One gull, one size: its own art pixels, never shrunk per index.
  container.querySelectorAll('.scene-gull').forEach((gull) => expect(pct(gull.style.width)).toBeCloseTo((AMBIENT_SPRITES.gull.w / ART_COLS) * 100, 3));

  rerender(<SceneAmbience biome="offshore" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(3);
});

test('clouds are drawn at their own size, a pixel a step, repainted in the ground\'s own cloud tones', () => {
  const { container } = render(<SceneAmbience biome="pier" />);
  const clouds = container.querySelectorAll('.scene-cloud');
  clouds.forEach((cloud, index) => {
    const sprite = AMBIENT_SPRITES.clouds[index % AMBIENT_SPRITES.clouds.length];
    expect(pct(cloud.style.width)).toBeCloseTo((sprite.w / ART_COLS) * 100, 3);
    expect(pct(cloud.style.height)).toBeCloseTo((sprite.h / ART_ROWS) * 100, 3);
    // Across the painting and its own width, one art pixel a step.
    expect(cloud.style.animationTimingFunction).toBe(`steps(${ART_COLS + sprite.w})`);
    expect(cloud.style.filter).toMatch(/^url\(#scene-cloud-tones-pier\)$/);
    // Where the loop has it: with motion off it stays in the sky, not off the left edge.
    expect(pct(cloud.style.left)).toBeGreaterThanOrEqual(0);
    expect(cloud.style.getPropertyValue('--mx0')).toMatch(/^-/);
  });
  expect(clouds.length).toBe(2);
  const filter = container.querySelector('filter#scene-cloud-tones-pier');
  expect(filter).toBeInTheDocument();
  expect(filter.querySelectorAll('feFuncR, feFuncG, feFuncB').length).toBe(3);
  filter.querySelectorAll('feFuncR').forEach((fn) => expect(fn.getAttribute('tableValues').split(' ').length).toBe(16));
});

test('fresh water gets dragonflies, and the swamp canopy hides the sky', () => {
  const { container, rerender } = render(<SceneAmbience biome="river" />);
  expect(container.querySelectorAll('.scene-dragonfly').length).toBe(1);
  expect(container.querySelector('.scene-gull')).toBeNull();
  expect(container.querySelectorAll('.scene-cloud').length).toBe(1);
  // Two wing frames, on the clock.
  const wings = container.querySelector('.scene-dragonfly > i');
  expect(wings.style.backgroundSize).toBe('200% 100%');
  expect(wings.style.animationDuration).toBe('0.25s');

  rerender(<SceneAmbience biome="swamp" />);
  expect(container.querySelectorAll('.scene-dragonfly').length).toBe(2);
  expect(container.querySelector('.scene-cloud')).toBeNull();
  expect(container.querySelector('.scene-sky')).toBeNull();
});

test('each ground moves in its own way: the river runs, the lake rings, the beach breaks', () => {
  const { container, rerender } = render(<SceneAmbience biome="river" />);
  const streaks = container.querySelectorAll('.scene-mover.is-current');
  expect(streaks.length).toBe(14);
  // A streak runs across and down a whole art pixel a step on each axis.
  const streak = streaks[0];
  const across = streak.querySelector('i');
  const down = streak.querySelector('i > b');
  expect(streak.style.getPropertyValue('--mx')).toMatch(/^-\d/);
  expect(streak.style.getPropertyValue('--my')).toMatch(/^\d/);
  expect(across.style.animationTimingFunction).toMatch(/^steps\(\d+\)$/);
  expect(down.style.animationTimingFunction).toMatch(/^steps\(\d+\), step-end$/);
  expect(across.style.animationDelay).toMatch(/^-/);
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
  expect(container.querySelectorAll('.scene-wash').length).toBe(2);
  expect(container.querySelector('.scene-wash.is-long').style.getPropertyValue('--wy')).toMatch(/%$/);
  expect(container.querySelectorAll('.scene-mover.is-roller').length).toBe(6);
  expect(container.querySelector('.scene-mist')).toBeNull();

  rerender(<SceneAmbience biome="bay" />);
  expect(container.querySelectorAll('.scene-mover.is-roller').length).toBe(10);
  expect(container.querySelectorAll('.scene-foam').length).toBe(3);
  expect(container.querySelector('.scene-wash')).toBeNull();

  rerender(<SceneAmbience biome="offshore" />);
  expect(container.querySelectorAll('.scene-cap').length).toBe(10);

  rerender(<SceneAmbience biome="canyon" />);
  expect(container.querySelectorAll('.scene-gleam').length).toBeGreaterThan(0);
  expect(container.querySelector('.scene-caustics')).toBeNull();
  expect(container.querySelector('.scene-cloud')).toBeNull();

  rerender(<SceneAmbience biome="flats" />);
  const net = container.querySelector('.scene-caustics');
  expect(net).toBeInTheDocument();
  // Two layers, each on its own element with its own two animations (x and y).
  expect(net.querySelectorAll('i').length).toBe(2);
  net.querySelectorAll('i').forEach((layer) => expect(layer.style.animationDuration.split(',').length).toBe(2));
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

test('every piece is pixel art: a hard-edged SVG in the painting\'s colours, stepped through its cells', () => {
  const { container } = render(<SceneAmbience biome="river" />);
  const pieces = container.querySelectorAll('.scene-px');
  expect(pieces.length).toBeGreaterThan(10);
  pieces.forEach((el) => {
    const svg = svgOf(el);
    expect(svg).toMatch(/shape-rendering='crispEdges'/);
    // No pure white, no gradients, no blur.
    expect(svg).not.toMatch(/#fff(fff)?'/i);
    expect(svg).not.toMatch(/Gradient|feGaussianBlur/);
  });
  container.querySelectorAll('.scene-px[class*="amb-flip-"]').forEach((el) => {
    const cells = Math.round(pct(el.style.backgroundSize) / 100);
    expect(el.style.animationTimingFunction).toBe(`steps(${cells}, jump-none)`);
  });
  // The river's foam is the painting's own foam colour.
  expect(svgOf(container.querySelector('.scene-foam'))).toMatch(/#d2e2ef/);
});

test('after dark the gulls roost, a few painted stars twinkle, and the glints keep to the moon path', () => {
  const { container, rerender } = render(<SceneAmbience biome="bay" period="night" />);
  expect(container.querySelector('.scene-gull')).toBeNull();
  expect(container.querySelector('.scene-cloud')).toBeNull();
  const stars = container.querySelectorAll('.scene-star');
  expect(stars.length).toBeGreaterThan(0);
  expect(stars.length).toBeLessThanOrEqual(4);
  expect(container.querySelector('.scene-glitter')).toBeNull();
  expect(container.querySelector('.scene-moonpath')).toBeInTheDocument();
  // Moonlit colours, at reduced strength.
  container.querySelectorAll('.scene-glint').forEach((glint) => expect(parseFloat(glint.style.opacity)).toBeLessThan(1));
  expect(svgOf(container.querySelector('.scene-foam'))).toMatch(/#4b748f/);
  rerender(<SceneAmbience biome="swamp" period="night" />);
  // The canopy has no sky for clouds, but the dragonflies are down for the night too.
  expect(container.querySelector('.scene-dragonfly')).toBeNull();
  rerender(<SceneAmbience biome="bay" period="day" />);
  expect(container.querySelectorAll('.scene-gull').length).toBe(2);
  expect(container.querySelector('.scene-star')).toBeNull();
  expect(container.querySelector('.scene-glitter')).toBeInTheDocument();
});

test('the layer is laid out on the painting, not the stage, so a phone crop still covers the water the cast pans to', () => {
  // A phone stage is 338 units wide: the painting (480) runs past its edge, and so does the layer.
  const { container } = render(<SceneAmbience biome="river" viewW={338} />);
  const layer = container.querySelector('.scene-ambience');
  expect(parseFloat(layer.style.width)).toBeCloseTo((480 / 338) * 100, 0);
  expect(layer.style.left).toBe('0px');
  // A streak that starts on the painting's right edge is placed by the painting, whatever the crop.
  const lefts = (root) => Array.from(root.querySelectorAll('.scene-mover.is-current')).map((el) => el.style.left);
  expect(lefts(container)).toContain(`${Math.round((351 / ART_COLS) * 1000000) / 10000}%`);
  const { container: wide } = render(<SceneAmbience biome="river" viewW={480} />);
  expect(lefts(wide)).toEqual(lefts(container));
});

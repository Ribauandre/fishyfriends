import path from 'node:path';
import { DECOR_PROPS, decorProp } from './dockDecor';
import { ART_PX } from './sceneLayout';
import { readPng, measure } from '../test-utils/pixelArt';

const PROPS = path.join(__dirname, '..', 'assets', 'props');
const KEYS = Object.keys(DECOR_PROPS);

describe.each(KEYS)('%s', (key) => {
  const prop = DECOR_PROPS[key];
  const img = readPng(path.join(PROPS, `${key}.png`));

  test('the file is its art pixels, and it is drawn at rows x ART_PX painting units', () => {
    expect(img.width).toBe(prop.w);
    expect(img.height).toBe(prop.rows);
    expect(prop.h).toBeCloseTo(prop.rows * ART_PX, 5);
  });

  test('flat pixel art in the world\'s keyline: hard alpha, a small palette, every edge the keyline', () => {
    const stats = measure(img);
    expect(stats.soft).toBe(0);
    expect(stats.colors.size).toBeLessThanOrEqual(16);
    expect(stats.strayDark).toBe(0);
    expect(stats.edgeKeyShare).toBe(1);
  });
});

// The rack used to be brown wood a few ΔE from the painted crate behind it on the shared dock, so
// only its keyline survived and it read as a wire frame; it is painted now.
test('the rod rack is mostly not dock-brown', () => {
  const stats = measure(readPng(path.join(PROPS, 'decor_rodrack.png')));
  const brownish = [...stats.colors.entries()].filter(([c]) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
    return r > g && g > b && r - b > 40 && r < 200;
  }).reduce((s, [, n]) => s + n, 0);
  expect(brownish / stats.drawn).toBeLessThan(0.15);
});

test('decorProp names a decoration or nothing', () => {
  expect(decorProp('decor_cooler')).toBe(DECOR_PROPS.decor_cooler);
  expect(decorProp('decor_none')).toBeNull();
});

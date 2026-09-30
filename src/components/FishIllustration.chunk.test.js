import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import FishIllustration, { preloadPixelFish } from './FishIllustration';

// The pixel set loads as a chunk of its own (FishIllustration's preloadPixelFish). On a phone
// that chunk can fail to arrive — a dropped connection, a deploy that replaced the chunk's hash
// mid-visit — and it used to take every fish with it: the rejected import was kept as the one
// load for the session, no caller caught it (an unhandled rejection per fish drawn), and every
// pixel variant stayed a transparent box until the page was reloaded. A failed load now draws
// the sticker, and the next call tries the chunk again.
let mockAttempts = 0;
jest.mock('../assets/fish/pixel', () => {
  mockAttempts += 1;
  if (mockAttempts === 1) throw new Error('Loading chunk 123 failed.');
  return { PIXEL_FISH: { bluegill: { src: 'bluegill-pixel.png', w: 44, h: 29 } } };
});

describe('when the pixel chunk fails to load', () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  beforeAll(() => process.on('unhandledRejection', onUnhandled));
  afterAll(() => process.off('unhandledRejection', onUnhandled));

  // In order: the first load fails, the second arrives.
  test('a fish drawn while it fails shows its sticker, with no unhandled rejection', async () => {
    render(<FishIllustration species="bluegill" variant="pixel" />);
    const img = screen.getByRole('img', { name: /bluegill/i });
    await waitFor(() => expect(img).toHaveAttribute('data-variant', 'sticker'));
    expect(img).not.toHaveAttribute('data-loading');
    expect(img.getAttribute('src')).not.toMatch(/^data:image\/gif/);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(unhandled).toEqual([]);
    expect(mockAttempts).toBe(1);
  });

  test('the next call tries the chunk again, and a fish drawn after that is the pixel variant', async () => {
    await expect(preloadPixelFish()).resolves.toHaveProperty('bluegill');
    expect(mockAttempts).toBe(2);
    render(<FishIllustration species="bluegill" variant="pixel" />);
    const img = screen.getByRole('img', { name: /bluegill/i });
    expect(img).toHaveAttribute('data-variant', 'pixel');
    expect(img.getAttribute('src')).toBe('bluegill-pixel.png');
  });
});

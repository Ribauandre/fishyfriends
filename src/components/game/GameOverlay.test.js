import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameOverlay, { DEFAULT_SCRIM, backdropStyle, roomScale } from './GameOverlay';

// The room behind a board is dimmed by its own scrim: the default is for a bright room (Sal's
// shop), and a dark room passes a lighter one. It used to be .62 to .84 for every room, which left
// the trophy wall at a luminance of 11 — black.
test('lays the room under its scrim, the default one or the room\'s own', () => {
  expect(backdropStyle(null)).toBeUndefined();
  expect(DEFAULT_SCRIM).toEqual([0.3, 0.55]);
  expect(backdropStyle('shop.webp').backgroundImage).toBe('linear-gradient(rgba(3,8,11,0.3), rgba(3,8,11,0.55)), url(shop.webp)');
  expect(backdropStyle('wall.webp', [0.15, 0.45]).backgroundImage).toBe('linear-gradient(rgba(3,8,11,0.15), rgba(3,8,11,0.45)), url(wall.webp)');
});

test('is a dialog with the pixel close sign, closing on the sign, the scrim and Escape', async () => {
  const onClose = jest.fn();
  render(<GameOverlay eyebrow="Trophy case" title="Real bests" backdrop="wall.webp" scrim={[0.15, 0.45]} onClose={onClose}><p>inside</p></GameOverlay>);
  expect(screen.getByRole('dialog', { name: 'Real bests' })).toBeInTheDocument();
  const panel = document.querySelector('.game-overlay-panel');
  expect(panel).toHaveClass('has-backdrop');
  expect(panel).toHaveAttribute('data-scrim', '0.15 0.45');
  // The close mark is the chrome's pixel glyph, not a × in a font.
  const close = screen.getByRole('button', { name: 'Close real bests' });
  expect(close).not.toHaveTextContent('×');
  expect(close.querySelector('img')).toHaveAttribute('src', expect.stringContaining('close'));
  await userEvent.click(close);
  await userEvent.click(screen.getByRole('button', { name: 'Dismiss real bests' }));
  await userEvent.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(3);
});

test('a board with no room behind it carries no scrim', () => {
  render(<GameOverlay eyebrow="Travel" title="Fishing grounds" onClose={jest.fn()}><p>map</p></GameOverlay>);
  const panel = document.querySelector('.game-overlay-panel');
  expect(panel).not.toHaveClass('has-backdrop');
  expect(panel).not.toHaveAttribute('data-scrim');
});

// A room's painting is drawn at the smallest whole number of CSS px an art pixel that still covers
// the panel — `cover` scaled Sal's shop by 4.68, so its art pixels came out 4 and 5 px wide side by
// side — with the scrim sized to the panel, not to the oversized painting.
test('lays a room out at a whole number of pixels an art pixel, the scrim still the panel\'s', () => {
  expect(roomScale(1188, 520, 254, 164)).toBe(5); // the shop on a desktop: cover would be 4.68
  expect(roomScale(362, 688, 254, 164)).toBe(5); // on a phone: 4.2
  expect(roomScale(1188, 520, 196, 130)).toBe(7); // the trophy wall: 6.06
  expect(roomScale(100, 50, 254, 164)).toBe(1);
  expect(roomScale(0, 520, 254, 164)).toBeNull();
  const style = backdropStyle('shop.webp', DEFAULT_SCRIM, { w: 254, h: 164, k: 5, x: -41 });
  expect(style.backgroundSize).toBe('100% 100%, 1270px 820px');
  expect(style.backgroundPosition).toBe('0 0, -41px 0');
});

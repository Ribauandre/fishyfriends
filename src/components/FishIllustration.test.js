import React from 'react';
import { render, screen } from '@testing-library/react';
import FishIllustration from './FishIllustration';

test('renders the matching species image and accessible label', () => {
  render(<FishIllustration species="shark" />);
  const img = screen.getByRole('img', { name: /shark/i });
  expect(img).toHaveAttribute('data-species', 'shark');
  expect(img.getAttribute('src')).toBeTruthy();
});

test('falls back to pike for an unrecognized species instead of rendering blank', () => {
  render(<FishIllustration species="not-a-real-species" />);
  const img = screen.getByRole('img', { name: /northern pike/i });
  expect(img).toHaveAttribute('data-species', 'not-a-real-species');
});

test('merges in an extra className without dropping the base ones', () => {
  render(<FishIllustration species="bass" className="angler-best-fish" />);
  const img = screen.getByRole('img', { name: /bass/i });
  expect(img).toHaveClass('fish-illustration', 'angler-best-fish');
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import FishIllustration from './FishIllustration';

test('renders the matching species class and accessible label', () => {
  render(<FishIllustration species="shark" />);
  const svg = screen.getByRole('img', { name: /shark/i });
  expect(svg).toHaveClass('drawn-shark');
  expect(svg).toHaveAttribute('data-species', 'shark');
});

test('falls back to pike for an unrecognized species instead of rendering blank', () => {
  render(<FishIllustration species="not-a-real-species" />);
  const svg = screen.getByRole('img', { name: /northern pike/i });
  expect(svg).toHaveClass('drawn-pike');
});

test('merges in an extra className without dropping the base ones', () => {
  render(<FishIllustration species="bass" className="angler-best-fish" />);
  const svg = screen.getByRole('img', { name: /bass/i });
  expect(svg).toHaveClass('fish-illustration', 'drawn-bass', 'angler-best-fish');
});

test('two instances on the same page get distinct filter ids (no SVG id collisions)', () => {
  render(<><FishIllustration species="tuna" /><FishIllustration species="tuna" /></>);
  const filterIds = Array.from(document.querySelectorAll('filter')).map((el) => el.id);
  expect(new Set(filterIds).size).toBe(filterIds.length);
});

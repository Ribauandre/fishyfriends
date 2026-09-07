import React from 'react';
import { render, screen } from '@testing-library/react';
import FishIllustration from './FishIllustration';

test('renders the matching species image and accessible label', () => {
  render(<FishIllustration species="pike" />);
  const img = screen.getByRole('img', { name: /northern pike/i });
  expect(img).toHaveAttribute('data-species', 'pike');
  expect(img.getAttribute('src')).toBeTruthy();
});

test('falls back to trout for a species without its own art yet', () => {
  render(<FishIllustration species="bass" />);
  const img = screen.getByRole('img', { name: /^trout$/i });
  expect(img).toHaveAttribute('data-species', 'bass');
});

test.each([
  ['largemouth', /largemouth bass/i],
  ['smallmouth', /smallmouth bass/i],
  ['bluegill', /bluegill/i],
  ['flounder', /flounder/i],
  ['stripedbass', /striped bass/i],
  ['bluefish', /bluefish/i],
  ['snakehead', /northern snakehead/i],
  ['laketrout', /lake trout/i],
  ['catfish', /catfish/i],
  ['carp', /carp/i],
  ['rainbowtrout', /rainbow trout/i],
  ['browntrout', /brown trout/i],
  ['brooktrout', /brook trout/i],
  ['tautog', /tautog/i],
  ['mahimahi', /mahi mahi/i],
  ['salmon', /atlantic salmon/i],
  ['blackseabass', /black sea bass/i],
  ['tuna', /^tuna$/i],
])('renders its own art for %s', (species, nameMatcher) => {
  render(<FishIllustration species={species} />);
  const img = screen.getByRole('img', { name: nameMatcher });
  expect(img).toHaveAttribute('data-species', species);
  expect(img.getAttribute('src')).toBeTruthy();
});

test('falls back to trout for an unrecognized species instead of rendering blank', () => {
  render(<FishIllustration species="not-a-real-species" />);
  const img = screen.getByRole('img', { name: /^trout$/i });
  expect(img).toHaveAttribute('data-species', 'not-a-real-species');
});

test('merges in an extra className without dropping the base ones', () => {
  render(<FishIllustration species="trout" className="angler-best-fish" />);
  const img = screen.getByRole('img', { name: /^trout$/i });
  expect(img).toHaveClass('fish-illustration', 'angler-best-fish');
});

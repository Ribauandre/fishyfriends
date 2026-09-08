import React from 'react';
import { render, screen } from '@testing-library/react';
import SpeciesChecklist from './SpeciesChecklist';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

test('shows every canonical species and how many the angler has caught', () => {
  render(<SpeciesChecklist personalBests={[]} />);
  expect(screen.getByText(`0 of ${SPECIES_OPTIONS.length} species caught`)).toBeInTheDocument();
  for (const option of SPECIES_OPTIONS) expect(screen.getByText(option.label)).toBeInTheDocument();
});

test('marks a species caught only when a personal best matches its exact canonical label', () => {
  render(<SpeciesChecklist personalBests={[{ id: 'pb-1', species: 'Largemouth Bass' }]} />);
  expect(screen.getByText(`1 of ${SPECIES_OPTIONS.length} species caught`)).toBeInTheDocument();
  expect(screen.getByText('Largemouth Bass').closest('.species-cell')).toHaveClass('is-caught');
  expect(screen.getByText('Smallmouth Bass').closest('.species-cell')).toHaveClass('is-missing');
});

test('matching is case-insensitive and trims whitespace', () => {
  render(<SpeciesChecklist personalBests={[{ id: 'pb-1', species: '  largemouth bass  ' }]} />);
  expect(screen.getByText('Largemouth Bass').closest('.species-cell')).toHaveClass('is-caught');
});

test('does not credit a species for a close relative that only shares icon art', () => {
  // Steelhead and plain Trout both render the trout icon, but catching one is not catching
  // the other — the checklist must compare canonical labels, not icons.
  render(<SpeciesChecklist personalBests={[{ id: 'pb-1', species: 'Steelhead' }]} />);
  expect(screen.getByText('Steelhead').closest('.species-cell')).toHaveClass('is-caught');
  expect(screen.getByText('Brown Trout').closest('.species-cell')).toHaveClass('is-missing');
});

test('a custom, non-canonical species logged as a personal best does not throw or double count', () => {
  render(<SpeciesChecklist personalBests={[{ id: 'pb-1', species: 'Mystery Fish' }]} />);
  expect(screen.getByText(`0 of ${SPECIES_OPTIONS.length} species caught`)).toBeInTheDocument();
});

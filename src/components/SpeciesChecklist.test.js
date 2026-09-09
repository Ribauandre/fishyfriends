import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeciesChecklist from './SpeciesChecklist';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

async function expand() {
  await userEvent.click(screen.getByRole('button', { name: /species checklist/i }));
}

test('shows a caught-count summary even while collapsed', () => {
  render(<SpeciesChecklist personalBests={[]} />);
  expect(screen.getByText(`0 of ${SPECIES_OPTIONS.length} species caught`)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /species checklist/i })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(SPECIES_OPTIONS[0].label)).not.toBeInTheDocument();
});

test('expanding shows every canonical species', async () => {
  render(<SpeciesChecklist personalBests={[]} />);
  await expand();
  for (const option of SPECIES_OPTIONS) expect(screen.getByText(option.label)).toBeInTheDocument();
});

test('marks a species caught only when a personal best matches its exact canonical label', async () => {
  render(<SpeciesChecklist personalBests={[{ id: 'pb-1', species: 'Largemouth Bass' }]} />);
  expect(screen.getByText(`1 of ${SPECIES_OPTIONS.length} species caught`)).toBeInTheDocument();
  await expand();
  expect(screen.getByText('Largemouth Bass').closest('.species-cell')).toHaveClass('is-caught');
  expect(screen.getByText('Smallmouth Bass').closest('.species-cell')).toHaveClass('is-missing');
});

test('matching is case-insensitive and trims whitespace', async () => {
  render(<SpeciesChecklist personalBests={[{ id: 'pb-1', species: '  largemouth bass  ' }]} />);
  await expand();
  expect(screen.getByText('Largemouth Bass').closest('.species-cell')).toHaveClass('is-caught');
});

test('does not credit a species for a close relative that only shares icon art', async () => {
  // Steelhead and plain Trout both render the trout icon, but catching one is not catching
  // the other — the checklist must compare canonical labels, not icons.
  render(<SpeciesChecklist personalBests={[{ id: 'pb-1', species: 'Steelhead' }]} />);
  await expand();
  expect(screen.getByText('Steelhead').closest('.species-cell')).toHaveClass('is-caught');
  expect(screen.getByText('Brown Trout').closest('.species-cell')).toHaveClass('is-missing');
});

test('a custom, non-canonical species logged as a personal best does not throw or double count', () => {
  render(<SpeciesChecklist personalBests={[{ id: 'pb-1', species: 'Mystery Fish' }]} />);
  expect(screen.getByText(`0 of ${SPECIES_OPTIONS.length} species caught`)).toBeInTheDocument();
});

test('credits a species caught only as a Fish Year catch, with no personal best logged', async () => {
  render(<SpeciesChecklist personalBests={[]} fishYearCatches={[{ id: 'fy-1', species: 'Carp' }]} />);
  expect(screen.getByText(`1 of ${SPECIES_OPTIONS.length} species caught`)).toBeInTheDocument();
  await expand();
  expect(screen.getByText('Carp').closest('.species-cell')).toHaveClass('is-caught');
});

test('the same species logged in both a personal best and a Fish Year catch counts once', () => {
  render(<SpeciesChecklist
    personalBests={[{ id: 'pb-1', species: 'Carp' }]}
    fishYearCatches={[{ id: 'fy-1', species: 'Carp' }, { id: 'fy-2', species: 'Carp' }]}
  />);
  expect(screen.getByText(`1 of ${SPECIES_OPTIONS.length} species caught`)).toBeInTheDocument();
});

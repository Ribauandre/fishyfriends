import React, { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeciesSelect from './SpeciesSelect';
import renderWithProviders from '../test-utils/renderWithProviders';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

function ControlledSpeciesSelect() {
  const [value, setValue] = useState('');
  return <SpeciesSelect value={value} onChange={setValue} />;
}

test('shows the full alphabetized species list on focus, before typing anything', async () => {
  renderWithProviders(<ControlledSpeciesSelect />);
  await userEvent.click(screen.getByRole('combobox'));
  const options = screen.getAllByRole('option').map((option) => option.textContent);
  expect(options).toHaveLength(SPECIES_OPTIONS.length);
  expect(options).toEqual([...options].sort((a, b) => a.localeCompare(b)));
});

test('typing narrows the list to matching species', async () => {
  renderWithProviders(<ControlledSpeciesSelect />);
  await userEvent.type(screen.getByRole('combobox'), 'tro');
  const options = screen.getAllByRole('option').map((option) => option.textContent);
  expect(options).toEqual(['Brook Trout', 'Brown Trout', 'Rainbow Trout']);
});

test('the list is case-insensitive', async () => {
  renderWithProviders(<ControlledSpeciesSelect />);
  await userEvent.type(screen.getByRole('combobox'), 'PIKE');
  expect(screen.getByRole('option', { name: 'Northern Pike' })).toBeInTheDocument();
});

test('clicking an option selects it and closes the dropdown', async () => {
  renderWithProviders(<ControlledSpeciesSelect />);
  await userEvent.type(screen.getByRole('combobox'), 'wall');
  await userEvent.click(screen.getByRole('option', { name: 'Walleye' }));
  expect(screen.getByRole('combobox')).toHaveValue('Walleye');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('allows typing a species that is not on the list at all (free text)', async () => {
  renderWithProviders(<ControlledSpeciesSelect />);
  await userEvent.type(screen.getByRole('combobox'), 'Chupacabra Fish');
  expect(screen.getByRole('combobox')).toHaveValue('Chupacabra Fish');
  // no known species contains that substring, so the dropdown has nothing to show
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('Escape closes the dropdown without changing the value', async () => {
  renderWithProviders(<ControlledSpeciesSelect />);
  const input = screen.getByRole('combobox');
  await userEvent.type(input, 'bass');
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(input).toHaveValue('bass');
});

test('ArrowDown then Enter selects the highlighted option', async () => {
  renderWithProviders(<ControlledSpeciesSelect />);
  const input = screen.getByRole('combobox');
  await userEvent.type(input, 'trout');
  await userEvent.keyboard('{ArrowDown}');
  await userEvent.keyboard('{Enter}');
  expect(input).toHaveValue('Brook Trout');
});

test('the field is required by default', () => {
  renderWithProviders(<SpeciesSelect value="" onChange={jest.fn()} />);
  expect(screen.getByRole('combobox')).toBeRequired();
});

test('the field can be marked optional', () => {
  renderWithProviders(<SpeciesSelect value="" onChange={jest.fn()} required={false} />);
  expect(screen.getByRole('combobox')).not.toBeRequired();
});

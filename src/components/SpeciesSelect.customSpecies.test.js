import React, { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeciesSelect from './SpeciesSelect';
import renderWithProviders from '../test-utils/renderWithProviders';

jest.mock('../lib/supabase');
// eslint-disable-next-line import/first
import { __mock } from '../lib/supabase';

function Harness() {
  const [value, setValue] = useState('');
  return <SpeciesSelect value={value} onChange={setValue} />;
}

// The shared list is members-only now, so it loads once a member is signed in.
beforeEach(() => {
  __mock.reset();
  __mock.setResponse('profiles', { data: { id: 'user-1', display_name: 'Andre' }, error: null });
  __mock.setResponse('personal_bests', { data: [], error: null });
  __mock.current.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1', email: 'andre@example.com' } } } });
});

test('merges a species from the shared custom_species table into the dropdown, sorted alongside the built-ins', async () => {
  __mock.setResponse('custom_species', { data: [{ name: 'Wahoo' }], error: null });
  renderWithProviders(<Harness />);
  await userEvent.click(screen.getByRole('combobox'));
  await waitFor(() => expect(screen.getByRole('option', { name: 'Wahoo' })).toBeInTheDocument());
  const options = screen.getAllByRole('option').map((option) => option.textContent);
  expect(options).toEqual([...options].sort((a, b) => a.localeCompare(b)));
});

test('renders normally with no custom species when the table is empty', async () => {
  __mock.setResponse('custom_species', { data: [], error: null });
  renderWithProviders(<Harness />);
  await userEvent.click(screen.getByRole('combobox'));
  expect(screen.queryByRole('option', { name: 'Wahoo' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Northern Pike' })).toBeInTheDocument();
});

test('someone signed out, or not let in yet, is never sent the shared list', async () => {
  __mock.setResponse('custom_species', { data: [{ name: 'Wahoo' }], error: null });
  __mock.setResponse('rpc:my_membership', { data: { status: 'pending', is_admin: false }, error: null });
  renderWithProviders(<Harness />);
  await userEvent.click(screen.getByRole('combobox'));
  await waitFor(() => expect(__mock.current.rpc).toHaveBeenCalledWith('my_membership'));
  expect(screen.queryByRole('option', { name: 'Wahoo' })).not.toBeInTheDocument();
  expect(__mock.current.fromCalls).not.toContain('custom_species');
});

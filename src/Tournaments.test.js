import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Tournaments from './Tournaments';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderTournaments() {
  return render(<MemoryRouter initialEntries={['/tournaments']}>
    <Routes>
      <Route path="/tournaments" element={<><Tournaments /><LocationProbe /></>} />
      <Route path="/tournaments/:tournamentId" element={<LocationProbe />} />
    </Routes>
  </MemoryRouter>);
}

function makeBaseAuth(overrides = {}) {
  return {
    listTournaments: jest.fn().mockResolvedValue([]),
    createTournament: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('shows a loading state, then an empty state once tournaments resolve', async () => {
  renderTournaments();
  expect(screen.getByText(/loading tournaments/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/no tournaments yet/i)).toBeInTheDocument());
});

test('groups tournaments into active, upcoming, and archived sections', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listTournaments: jest.fn().mockResolvedValue([
      { id: 't-active', name: 'Fall Classic', rules: '', unit: 'in', starts_on: '2020-01-01', ends_on: '2999-01-01', created_by: 'u1', created_by_name: 'Andre' },
      { id: 't-upcoming', name: 'Winter Open', rules: '', unit: 'in', starts_on: '2999-01-01', ends_on: '2999-02-01', created_by: 'u1', created_by_name: 'Andre' },
      { id: 't-ended', name: 'Summer Bash', rules: '', unit: 'in', starts_on: '2000-01-01', ends_on: '2000-02-01', created_by: 'u1', created_by_name: 'Andre' },
    ]),
  }));
  renderTournaments();
  await waitFor(() => expect(screen.getByText('Fall Classic')).toBeInTheDocument());
  expect(screen.getByText('HAPPENING NOW').closest('.tournaments-section')).toHaveTextContent('Fall Classic');
  expect(screen.getByText('COMING UP').closest('.tournaments-section')).toHaveTextContent('Winter Open');
  expect(screen.getByText('ARCHIVE').closest('.tournaments-section')).toHaveTextContent('Summer Bash');
});

test('starting a tournament calls createTournament and navigates to the new tournament', async () => {
  const createTournament = jest.fn().mockResolvedValue({ error: null, tournament: { id: 't-new', name: 'New One' } });
  useAuth.mockReturnValue(makeBaseAuth({ createTournament }));
  renderTournaments();
  await waitFor(() => expect(screen.getByText(/no tournaments yet/i)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /start a tournament/i }));
  await userEvent.type(screen.getByLabelText(/^name$/i), 'New One');
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));
  await waitFor(() => expect(createTournament).toHaveBeenCalledWith(expect.objectContaining({ name: 'New One' })));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tournaments/t-new'));
});

test('shows the server error message and keeps the modal open when creating fails', async () => {
  const createTournament = jest.fn().mockResolvedValue({ error: new Error('That name is taken.') });
  useAuth.mockReturnValue(makeBaseAuth({ createTournament }));
  renderTournaments();
  await waitFor(() => expect(screen.getByText(/no tournaments yet/i)).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /start a tournament/i }));
  await userEvent.type(screen.getByLabelText(/^name$/i), 'Fall Classic');
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));
  expect(await screen.findByText(/that name is taken/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /make it official/i })).toBeInTheDocument();
});

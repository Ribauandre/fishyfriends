import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import TournamentDetail from './TournamentDetail';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderDetail(route = '/tournaments/t-1') {
  return render(<MemoryRouter initialEntries={[route]}>
    <Routes>
      <Route path="/tournaments/:tournamentId" element={<><TournamentDetail /><LocationProbe /></>} />
      <Route path="/tournaments" element={<LocationProbe />} />
    </Routes>
  </MemoryRouter>);
}

const baseTournament = { id: 't-1', name: 'Fall Fluke Classic', rules: 'Biggest fish wins.', unit: 'in', starts_on: '2020-01-01', ends_on: '2999-01-01', created_by: 'u1', created_by_name: 'Andre' };

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1' },
    customSpecies: [],
    getTournament: jest.fn().mockResolvedValue(baseTournament),
    listTournamentEntries: jest.fn().mockResolvedValue([]),
    submitTournamentEntry: jest.fn(),
    deleteTournamentEntry: jest.fn(),
    deleteTournament: jest.fn(),
    listLikes: jest.fn().mockResolvedValue([]),
    likeTarget: jest.fn().mockResolvedValue({ error: null }),
    unlikeTarget: jest.fn().mockResolvedValue({ error: null }),
    listTournamentEntryComments: jest.fn().mockResolvedValue([]),
    addTournamentEntryComment: jest.fn(),
    deleteTournamentEntryComment: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('shows a loading state, then the tournament name and rules', async () => {
  renderDetail();
  expect(screen.getByText(/loading the tournament/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Fall Fluke Classic' })).toBeInTheDocument());
  expect(screen.getByText('Biggest fish wins.')).toBeInTheDocument();
});

test('shows a not-found state for a missing or removed tournament', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getTournament: jest.fn().mockResolvedValue(null) }));
  renderDetail();
  expect(await screen.findByText(/doesn't exist/i)).toBeInTheDocument();
});

test('lists entries ranked by size, biggest first', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listTournamentEntries: jest.fn().mockResolvedValue([
      { id: 'e-1', tournament_id: 't-1', user_id: 'user-1', angler_name: 'Andre', species: 'Fluke', size: 20, caught_at: '2026-07-16', photo_url: '' },
      { id: 'e-2', tournament_id: 't-1', user_id: 'user-2', angler_name: 'Kevin', species: 'Fluke', size: 18.25, caught_at: '2026-08-02', photo_url: '' },
    ]),
  }));
  renderDetail();
  const rows = await screen.findAllByRole('button', { name: /Andre|Kevin/ });
  expect(rows[0]).toHaveTextContent('Andre');
  expect(rows[1]).toHaveTextContent('Kevin');
});

test('logging an entry calls submitTournamentEntry and adds it to the board', async () => {
  const submitTournamentEntry = jest.fn().mockResolvedValue({ error: null, entry: { id: 'e-new', tournament_id: 't-1', user_id: 'user-1', angler_name: 'Me', species: 'Carp', size: 12, caught_at: '2026-03-15', photo_url: '' } });
  useAuth.mockReturnValue(makeBaseAuth({ submitTournamentEntry }));
  renderDetail();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Fall Fluke Classic' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /log an entry/i }));

  await userEvent.type(screen.getByRole('combobox'), 'Carp');
  await userEvent.click(screen.getByRole('option', { name: 'Carp' }));
  await userEvent.type(screen.getByLabelText(/size/i), '12');
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));

  await waitFor(() => expect(submitTournamentEntry).toHaveBeenCalledWith(expect.objectContaining({ tournamentId: 't-1', species: 'Carp', size: '12' })));
  expect(await screen.findByText('Carp')).toBeInTheDocument();
});

test('shows the server error message and keeps the modal open when logging fails', async () => {
  const submitTournamentEntry = jest.fn().mockResolvedValue({ error: new Error('Catch photos must be smaller than 5 MB.') });
  useAuth.mockReturnValue(makeBaseAuth({ submitTournamentEntry }));
  renderDetail();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Fall Fluke Classic' })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /log an entry/i }));
  await userEvent.type(screen.getByRole('combobox'), 'Carp');
  await userEvent.type(screen.getByLabelText(/size/i), '12');
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));
  expect(await screen.findByText(/smaller than 5 mb/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /make it official/i })).toBeInTheDocument();
});

test('the delete-tournament link is only shown to the tournament\'s creator', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'u1' } }));
  renderDetail();
  expect(await screen.findByRole('button', { name: /delete this tournament/i })).toBeInTheDocument();
});

test('a non-creator does not see the delete-tournament link', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'someone-else' } }));
  renderDetail();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Fall Fluke Classic' })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /delete this tournament/i })).not.toBeInTheDocument();
});

test('deleting the tournament navigates back to the tournaments list', async () => {
  const deleteTournament = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'u1' }, deleteTournament }));
  renderDetail();
  await userEvent.click(await screen.findByRole('button', { name: /delete this tournament/i }));
  expect(deleteTournament).toHaveBeenCalledWith('t-1');
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tournaments'));
});

test('passes the ?entry= query param through so the linked entry is highlighted', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listTournamentEntries: jest.fn().mockResolvedValue([
      { id: 'e-1', tournament_id: 't-1', user_id: 'user-1', angler_name: 'Andre', species: 'Fluke', size: 20, caught_at: '2026-07-16', photo_url: '' },
    ]),
  }));
  renderDetail('/tournaments/t-1?entry=e-1');
  await waitFor(() => expect(document.querySelector('.leaderboard-entry.is-shared-highlight')).toBeInTheDocument());
  // Landing here from a notification/share link should open the entry's comments too, not
  // just scroll to and highlight the row.
  expect(screen.getByRole('button', { name: /hide comments/i })).toBeInTheDocument();
});

test('also passes a ?comment= query param through so the specific comment is highlighted', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listTournamentEntries: jest.fn().mockResolvedValue([
      { id: 'e-1', tournament_id: 't-1', user_id: 'user-1', angler_name: 'Andre', species: 'Fluke', size: 20, caught_at: '2026-07-16', photo_url: '' },
    ]),
    listTournamentEntryComments: jest.fn().mockResolvedValue([
      { id: 'c-1', user_id: 'user-2', author_name: 'Kevin', body: 'Great catch!' },
      { id: 'c-2', user_id: 'user-3', author_name: 'Sam', body: 'Huge!' },
    ]),
  }));
  renderDetail('/tournaments/t-1?entry=e-1&comment=c-2');
  await waitFor(() => expect(screen.getByText('Huge!').closest('.comment-row')).toHaveClass('is-shared-highlight'));
  expect(screen.getByText('Great catch!').closest('.comment-row')).not.toHaveClass('is-shared-highlight');
});

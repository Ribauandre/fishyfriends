import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>);
}

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1' },
    profile: { display_name: 'Andre' },
    listFishYearCatches: jest.fn().mockResolvedValue([]),
    listRecentActivity: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

test('shows 0 / 12 months logged when the current user has no catches yet', async () => {
  useAuth.mockReturnValue(makeBaseAuth());
  renderHome();
  expect(await screen.findByText('0 / 12 months logged')).toBeInTheDocument();
  expect(document.querySelectorAll('.tally-row .tally-filled')).toHaveLength(0);
});

test('reflects the real count of the current user\'s distinct caught months', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listFishYearCatches: jest.fn().mockResolvedValue([
      { id: 'fy-1', user_id: 'user-1', month: 'January', species: 'Bass' },
      { id: 'fy-2', user_id: 'user-1', month: 'February', species: 'Trout' },
      // a second catch in the same month must not double-count
      { id: 'fy-3', user_id: 'user-1', month: 'February', species: 'Pike' },
    ]),
  }));
  renderHome();
  expect(await screen.findByText('2 / 12 months logged')).toBeInTheDocument();
  await waitFor(() => expect(document.querySelectorAll('.tally-row .tally-filled')).toHaveLength(2));
});

test('does not count another angler\'s catches toward the current user\'s progress', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listFishYearCatches: jest.fn().mockResolvedValue([
      { id: 'fy-1', user_id: 'someone-else', month: 'January', species: 'Bass' },
    ]),
  }));
  renderHome();
  expect(await screen.findByText('0 / 12 months logged')).toBeInTheDocument();
});

test('the shaky headline still exposes one readable sentence to assistive tech', () => {
  useAuth.mockReturnValue(makeBaseAuth());
  renderHome();
  // The letters are split into individual decorative spans for the per-letter shake, so the
  // accessible name has to come from aria-label rather than the (now fragmented) text nodes.
  expect(screen.getByRole('heading', { name: 'Look who dragged themselves in, Andre.' })).toBeInTheDocument();
});

test('shows an empty state when nobody has posted any activity yet', async () => {
  useAuth.mockReturnValue(makeBaseAuth());
  renderHome();
  expect(await screen.findByText(/nothing posted yet/i)).toBeInTheDocument();
});

test('lists recent crew activity across catches, personal bests, and tournament entries', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listRecentActivity: jest.fn().mockResolvedValue([
      { kind: 'fish_year_catch', id: 'fy-1', userId: 'user-2', anglerName: 'Kevin', avatarUrl: '', species: 'Bass', photoUrl: '', caughtAt: '2026-03-01', createdAt: '2026-03-01T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-1' },
      { kind: 'personal_best', id: 'pb-1', userId: 'user-3', anglerName: 'Sam', avatarUrl: '', species: 'Carp', photoUrl: '', caughtAt: '2026-02-01', createdAt: '2026-02-01T12:00:00Z', sizeLabel: '30 in', href: '/anglers?best=pb-1' },
      { kind: 'tournament_entry', id: 'te-1', userId: 'user-4', anglerName: 'Andres', avatarUrl: '', species: 'Fluke', photoUrl: '', caughtAt: '2026-01-01', createdAt: '2026-01-01T12:00:00Z', size: 19.5, unit: 'in', tournamentName: 'Summer Fluke Classic', href: '/tournaments/t-1?entry=te-1' },
    ]),
  }));
  renderHome();
  expect(await screen.findByText(/logged a bass for fish year/i)).toBeInTheDocument();
  expect(screen.getByText(/logged a personal best — 30 in/i)).toBeInTheDocument();
  expect(screen.getByText(/entered a 19\.5in fluke into summer fluke classic/i)).toBeInTheDocument();
});

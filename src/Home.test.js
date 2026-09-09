import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    listRecentActivity: jest.fn().mockResolvedValue([]),
    subscribeToActivity: jest.fn(() => () => {}),
    listFishYearCatches: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

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

test('squashes a bulk upload from the same angler into one row with an "and X more" summary', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listRecentActivity: jest.fn().mockResolvedValue([
      { kind: 'fish_year_catch', id: 'fy-1', userId: 'user-2', anglerName: 'Kevin', avatarUrl: '', species: 'Bass', photoUrl: '', caughtAt: '2026-03-03', createdAt: '2026-03-03T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-1' },
      { kind: 'fish_year_catch', id: 'fy-2', userId: 'user-2', anglerName: 'Kevin', avatarUrl: '', species: 'Trout', photoUrl: '', caughtAt: '2026-03-02', createdAt: '2026-03-02T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-2' },
      { kind: 'fish_year_catch', id: 'fy-3', userId: 'user-2', anglerName: 'Kevin', avatarUrl: '', species: 'Carp', photoUrl: '', caughtAt: '2026-03-01', createdAt: '2026-03-01T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-3' },
    ]),
  }));
  renderHome();
  expect(await screen.findByText(/and 2 more/i)).toBeInTheDocument();
  expect(screen.getByText(/logged a bass for fish year/i)).toBeInTheDocument();
  expect(screen.queryByText(/logged a trout for fish year/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/logged a carp for fish year/i)).not.toBeInTheDocument();
});

test('tapping a squashed row expands it to show every individual action', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listRecentActivity: jest.fn().mockResolvedValue([
      { kind: 'fish_year_catch', id: 'fy-1', userId: 'user-2', anglerName: 'Kevin', avatarUrl: '', species: 'Bass', photoUrl: '', caughtAt: '2026-03-03', createdAt: '2026-03-03T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-1' },
      { kind: 'fish_year_catch', id: 'fy-2', userId: 'user-2', anglerName: 'Kevin', avatarUrl: '', species: 'Trout', photoUrl: '', caughtAt: '2026-03-02', createdAt: '2026-03-02T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-2' },
    ]),
  }));
  renderHome();
  const squashedRow = await screen.findByRole('button', { name: /and 1 more/i });
  expect(squashedRow).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(squashedRow);
  expect(squashedRow).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/logged a trout for fish year/i)).toBeInTheDocument();
  await userEvent.click(squashedRow);
  expect(squashedRow).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/logged a trout for fish year/i)).not.toBeInTheDocument();
});

test('does not squash activity from different anglers, even when interleaved', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listRecentActivity: jest.fn().mockResolvedValue([
      { kind: 'fish_year_catch', id: 'fy-1', userId: 'user-2', anglerName: 'Kevin', avatarUrl: '', species: 'Bass', photoUrl: '', caughtAt: '2026-03-03', createdAt: '2026-03-03T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-1' },
      { kind: 'fish_year_catch', id: 'fy-2', userId: 'user-3', anglerName: 'Sam', avatarUrl: '', species: 'Trout', photoUrl: '', caughtAt: '2026-03-02', createdAt: '2026-03-02T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-2' },
    ]),
  }));
  renderHome();
  expect(await screen.findByText(/logged a bass for fish year/i)).toBeInTheDocument();
  expect(screen.getByText(/logged a trout for fish year/i)).toBeInTheDocument();
  expect(screen.queryByText(/and \d+ more/i)).not.toBeInTheDocument();
});

test('shows a season recap with crew-wide totals and the top species, not just the current user\'s', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listFishYearCatches: jest.fn().mockResolvedValue([
      { id: 'fy-1', user_id: 'user-1', month: 'March', species: 'Bass', angler_name: 'Me', caught_at: '2026-03-01', photo_url: '' },
      { id: 'fy-2', user_id: 'someone-else', month: 'June', species: 'Bass', angler_name: 'Kevin', caught_at: '2026-06-01', photo_url: '' },
      { id: 'fy-3', user_id: 'someone-else', month: 'June', species: 'Trout', angler_name: 'Kevin', caught_at: '2026-06-15', photo_url: '' },
    ]),
  }));
  renderHome();
  await waitFor(() => expect(screen.getByText('catches logged').previousSibling).toHaveTextContent('3'));
  expect(screen.getByText('months covered').previousSibling).toHaveTextContent('2');
  expect(screen.getByText('anglers on the board').previousSibling).toHaveTextContent('2');
  expect(screen.getByText('top species').previousSibling).toHaveTextContent('Bass');
});

test('shows a dash for top species in the season recap when nobody has logged a catch yet', async () => {
  useAuth.mockReturnValue(makeBaseAuth());
  renderHome();
  expect(await screen.findByText('catches logged')).toBeInTheDocument();
  expect(screen.getByText('catches logged').previousSibling).toHaveTextContent('0');
  expect(screen.getByText('top species').previousSibling).toHaveTextContent('—');
});

test('merges a live-pushed activity item into the feed without waiting for a refetch', async () => {
  let pushActivity;
  const subscribeToActivity = jest.fn((onInsert) => { pushActivity = onInsert; return jest.fn(); });
  useAuth.mockReturnValue(makeBaseAuth({
    listRecentActivity: jest.fn().mockResolvedValue([
      { kind: 'fish_year_catch', id: 'fy-1', userId: 'user-2', anglerName: 'Kevin', avatarUrl: '', species: 'Bass', photoUrl: '', caughtAt: '2026-03-01', createdAt: '2026-03-01T12:00:00Z', month: 'March', href: '/fish-year?catch=fy-1' },
    ]),
    subscribeToActivity,
  }));
  renderHome();
  await screen.findByText(/logged a bass for fish year/i);

  act(() => {
    pushActivity({ kind: 'personal_best', id: 'pb-2', userId: 'user-5', anglerName: 'Priya', avatarUrl: '', species: 'Tuna', photoUrl: '', caughtAt: '2026-04-01', createdAt: '2026-04-01T12:00:00Z', sizeLabel: '40 in', href: '/anglers?best=pb-2' });
  });

  expect(await screen.findByText(/logged a personal best — 40 in/i)).toBeInTheDocument();
  // The original fetched item is still there — the live item was merged in, not swapped in.
  expect(screen.getByText(/logged a bass for fish year/i)).toBeInTheDocument();
});

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

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
    listFishingLicenses: jest.fn().mockResolvedValue([]),
    listMyWaypointInvites: jest.fn().mockResolvedValue([]),
    listTrips: jest.fn().mockResolvedValue([]),
    listTournaments: jest.fn().mockResolvedValue([]),
    listTournamentEntries: jest.fn().mockResolvedValue([]),
    personalBests: [],
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

test('On your plate lists what needs you, each going where it gets done', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listMyWaypointInvites: jest.fn().mockResolvedValue([{ id: 'inv-1', map_name: 'Backwater Spots', inviterName: 'Kevin' }]),
  }));
  renderHome();
  const invite = await screen.findByRole('link', { name: /kevin shared a waypoint map/i });
  expect(invite).toHaveAttribute('href', '/waypoints');
  expect(invite).toHaveTextContent('Backwater Spots');
  expect(screen.getByRole('link', { name: /finish your profile/i })).toHaveAttribute('href', '/profile');
});

test('says so when nothing needs you', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    profile: { display_name: 'Andre', avatar_url: 'a.jpg', home_water: 'Barnegat Bay' },
    // A catch this month, so Fish Year isn't asking either.
    listFishYearCatches: jest.fn().mockResolvedValue([{ id: 'fy-1', user_id: 'user-1', month: new Date().toLocaleString('en-US', { month: 'long' }), species: 'Carp' }]),
  }));
  renderHome();
  expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
});

test('Log a catch on the banner opens the one catch form', async () => {
  renderHome();
  await userEvent.click(screen.getAllByRole('button', { name: /log a catch/i })[0]);
  expect(screen.getByRole('dialog', { name: /log a catch/i })).toBeInTheDocument();
});

test('the dock report carries today\'s date, not a fixed one', () => {
  renderHome();
  const label = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();
  expect(screen.getByText(`DOCK REPORT · ${label}`)).toBeInTheDocument();
});

describe('fishing conditions', () => {
  afterEach(() => { delete global.fetch; });

  test('shows conditions on the dashboard once home water geocodes', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ latitude: 40.47, longitude: -74.27, name: 'Raritan Bay', admin1: 'New Jersey' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ current: { temperature_2m: 61.8, wind_speed_10m: 17.9, wind_direction_10m: 0, cloud_cover: 100, weather_code: 3 } }) });
    useAuth.mockReturnValue(makeBaseAuth({ profile: { display_name: 'Andre', home_water: 'Raritan Bay' } }));
    renderHome();
    expect(await screen.findByText('Fishing conditions')).toBeInTheDocument();
    expect(screen.getByText('62°F')).toBeInTheDocument();
  });

  test('does not render anything when the profile has no home water', async () => {
    global.fetch = jest.fn();
    useAuth.mockReturnValue(makeBaseAuth());
    renderHome();
    await waitFor(() => expect(screen.queryByText(/loading the feed/i)).not.toBeInTheDocument());
    expect(screen.queryByText('Fishing conditions')).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

test('does not show a license reminder banner when every license is comfortably valid', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listFishingLicenses: jest.fn().mockResolvedValue([{ id: 'lic-1', state: 'New Jersey', expires_at: '2099-01-01' }]),
  }));
  renderHome();
  await waitFor(() => expect(screen.queryByText(/loading the feed/i)).not.toBeInTheDocument());
  expect(screen.queryByText(/manage licenses/i)).not.toBeInTheDocument();
});

test('shows a license reminder banner for an expiring license', async () => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 10);
  useAuth.mockReturnValue(makeBaseAuth({
    listFishingLicenses: jest.fn().mockResolvedValue([{ id: 'lic-1', state: 'New Jersey', expires_at: soon.toISOString().slice(0, 10) }]),
  }));
  renderHome();
  expect(await screen.findByText(/manage licenses/i)).toBeInTheDocument();
  expect(screen.getByText(/manage licenses/i).closest('a')).toHaveAttribute('href', '/profile#licenses');
  expect(screen.getByText('New Jersey')).toBeInTheDocument();
});

test('shows a license reminder banner for an already-expired license', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listFishingLicenses: jest.fn().mockResolvedValue([{ id: 'lic-1', state: 'New York', expires_at: '2020-01-01' }]),
  }));
  renderHome();
  expect(await screen.findByText(/has expired/i)).toBeInTheDocument();
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

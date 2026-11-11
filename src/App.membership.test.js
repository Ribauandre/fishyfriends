import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

jest.mock('./lib/supabase');
// eslint-disable-next-line import/first
import { __mock } from './lib/supabase';

// The database decides what an account can read; this is what the app shows around that.
// An account the admin hasn't approved gets the waiting room on every route, with no nav.

function signIn(membership) {
  __mock.reset();
  // The first read is the account's own row; every later one is a list (the roster).
  __mock.setResponse('profiles', [{ data: { id: 'user-1', display_name: 'Andre', tour_completed_at: '2026-01-01T00:00:00Z' }, error: null }, { data: [], error: null }]);
  __mock.setResponse('rpc:my_membership', { data: membership, error: null });
  __mock.current.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1', email: 'andre@example.com' } } } });
}

afterEach(() => {
  window.history.pushState({}, '', '/');
  window.localStorage.clear();
});

describe.each(['/home', '/anglers', '/trips', '/waypoints', '/profile', '/admin', '/fishing-game'])('%s', (path) => {
  test('someone waiting sees the waiting room, with no nav and no page', async () => {
    signIn({ status: 'pending', is_admin: false });
    window.history.pushState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: /you're on the list/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    // Nothing behind the door was asked for.
    for (const table of ['fish_year_catches', 'trips', 'waypoint_maps', 'notifications', 'bug_reports', 'custom_species']) {
      expect(__mock.current.fromCalls).not.toContain(table);
    }
  });
});

test('someone removed sees that they are out', async () => {
  signIn({ status: 'declined', is_admin: false });
  window.history.pushState({}, '', '/home');
  render(<App />);
  expect(await screen.findByRole('heading', { name: /isn't in the club/i })).toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('a member gets the app', async () => {
  signIn({ status: 'approved', is_admin: false });
  window.history.pushState({}, '', '/anglers');
  render(<App />);
  expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: /you're on the list/i })).not.toBeInTheDocument();
});

test('a member who is not the admin is sent home from the admin page', async () => {
  signIn({ status: 'approved', is_admin: false });
  window.history.pushState({}, '', '/admin');
  render(<App />);
  await screen.findByRole('navigation', { name: 'Main' });
  await waitFor(() => expect(window.location.pathname).toBe('/home'));
  expect(__mock.current.rpc).not.toHaveBeenCalledWith('list_club_accounts');
});

test('the old bug-report address lands on the admin page', async () => {
  signIn({ status: 'approved', is_admin: true });
  window.history.pushState({}, '', '/admin/bugs');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Club admin' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/admin');
});

describe('arriving by a password-reset link', () => {
  // eslint-disable-next-line global-require
  const { arrivedBy } = require('./lib/supabase');
  afterEach(() => { arrivedBy.recovery = false; window.sessionStorage.clear(); });

  test.each(['/home', '/profile', '/admin'])('a member on %s gets the new-password form and nothing else', async (path) => {
    signIn({ status: 'approved', is_admin: true });
    arrivedBy.recovery = true;
    window.history.pushState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    for (const table of ['fish_year_catches', 'trips', 'waypoint_maps', 'notifications', 'bug_reports']) {
      expect(__mock.current.fromCalls).not.toContain(table);
    }
  });

  test('so does an account still waiting to be let in', async () => {
    signIn({ status: 'pending', is_admin: false });
    arrivedBy.recovery = true;
    window.history.pushState({}, '', '/home');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /you're on the list/i })).not.toBeInTheDocument();
  });
});

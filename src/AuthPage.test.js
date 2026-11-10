import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AuthPage from './AuthPage';
import { useAuth } from './context/AuthContext';
import { rememberReturnTo } from './utils/returnTo';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderAt(entry) {
  render(<MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/account" element={<AuthPage />} />
    <Route path="*" element={<Where />} />
  </Routes></MemoryRouter>);
}

async function signIn() {
  await userEvent.type(screen.getByLabelText(/email/i), 'andre@example.com');
  await userEvent.type(screen.getByLabelText(/password/i), 'hunter22');
  await userEvent.click(screen.getByRole('button', { name: /enter the club/i }));
}

beforeEach(() => {
  window.localStorage.clear();
  useAuth.mockReturnValue({ signIn: jest.fn().mockResolvedValue({ error: null }), signUp: jest.fn(), isSupabaseConfigured: true, notice: '' });
});

test('signing in after opening a shared link lands on that link', async () => {
  renderAt({ pathname: '/account', state: { from: '/trips/t1?x=1' } });
  await signIn();
  expect(await screen.findByTestId('where')).toHaveTextContent('/trips/t1?x=1');
});

test('a link opened before signing up is picked up from storage', async () => {
  rememberReturnTo('/tournaments/t9');
  renderAt('/account');
  await signIn();
  expect(await screen.findByTestId('where')).toHaveTextContent('/tournaments/t9');
});

test('with no link, it goes Home; and never off the site', async () => {
  renderAt({ pathname: '/account', state: { from: '//evil.example/phish' } });
  await signIn();
  expect(await screen.findByTestId('where')).toHaveTextContent('/home');
});

test('shows the club\'s live totals, not a fixed figure', async () => {
  useAuth.mockReturnValue({ signIn: jest.fn(), signUp: jest.fn(), isSupabaseConfigured: true, notice: '', getClubStats: jest.fn().mockResolvedValue({ anglers: 14, fish: 37, year: 2026 }) });
  renderAt('/account');
  const row = await screen.findByTestId('club-stats');
  expect(row).toHaveTextContent('14anglers currently bragging');
  expect(row).toHaveTextContent('37fish logged in 2026');
  expect(row).not.toHaveTextContent('08');
});

test('leaves the totals out when they can\'t be loaded', async () => {
  const getClubStats = jest.fn().mockResolvedValue(null);
  useAuth.mockReturnValue({ signIn: jest.fn(), signUp: jest.fn(), isSupabaseConfigured: true, notice: '', getClubStats });
  renderAt('/account');
  await screen.findByRole('button', { name: /enter the club/i });
  expect(getClubStats).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('club-stats')).not.toBeInTheDocument();
  expect(screen.queryByText(/currently bragging/)).not.toBeInTheDocument();
});

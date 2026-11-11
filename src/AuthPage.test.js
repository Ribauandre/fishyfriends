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

describe('passwords', () => {
  function auth(overrides = {}) {
    const value = { signIn: jest.fn().mockResolvedValue({ error: null }), signUp: jest.fn().mockResolvedValue({ error: null }), requestPasswordReset: jest.fn().mockResolvedValue({ error: null }), isSupabaseConfigured: true, notice: '', ...overrides };
    useAuth.mockReturnValue(value);
    return value;
  }

  test('forgot password asks only for the email and answers the same whoever it is', async () => {
    const value = auth();
    renderAt('/account');
    await userEvent.click(screen.getByRole('button', { name: /forgot your password/i }));
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/email/i), 'andre@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(value.requestPasswordReset).toHaveBeenCalledWith('andre@example.com');
    const panel = await screen.findByRole('status');
    expect(panel).toHaveTextContent(/if andre@example\.com has an account here/i);
    expect(value.signIn).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /back to sign in/i }));
    expect(screen.getByRole('heading', { name: 'Sign in to your dock' })).toBeInTheDocument();
  });

  test('a failure to send (too many tries) is shown on the form', async () => {
    auth({ requestPasswordReset: jest.fn().mockResolvedValue({ error: new Error('For security purposes, you can only request this after 48 seconds.') }) });
    renderAt('/account');
    await userEvent.click(screen.getByRole('button', { name: /forgot your password/i }));
    await userEvent.type(screen.getByLabelText(/email/i), 'andre@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/only request this after 48 seconds/i)).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('signing in takes any password that exists; signing up asks for ten characters', async () => {
    auth();
    renderAt('/account');
    const signInField = screen.getByLabelText(/^password/i);
    expect(signInField).toHaveAttribute('autocomplete', 'current-password');
    expect(signInField).not.toHaveAttribute('minlength');
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('autocomplete', 'username');

    await userEvent.click(screen.getByRole('button', { name: /join up/i }));
    const signUpField = screen.getByLabelText(/^password/i);
    expect(signUpField).toHaveAttribute('autocomplete', 'new-password');
    expect(signUpField).toHaveAttribute('minlength', '10');
    expect(signUpField).toHaveAttribute('placeholder', 'At least 10 characters');
  });

  test('a password the provider refuses at sign-up is said on the form', async () => {
    const value = auth({ signUp: jest.fn().mockResolvedValue({ error: new Error('That password has turned up in data breaches (9 times), so it\'s on the lists people try first. Pick another.') }) });
    renderAt('/account');
    await userEvent.click(screen.getByRole('button', { name: /join up/i }));
    await userEvent.type(screen.getByLabelText(/display name/i), 'Newcomer');
    await userEvent.type(screen.getByLabelText(/email/i), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/^password/i), 'password1234');
    await userEvent.click(screen.getByRole('button', { name: /count me in/i }));
    expect(await screen.findByText(/turned up in data breaches/i)).toBeInTheDocument();
    expect(value.signUp).toHaveBeenCalledWith('new@example.com', 'password1234', 'Newcomer');
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });

  test('a dead email link is explained where they land', () => {
    auth({ notice: 'That email link has expired or was already used. Ask for a new one.' });
    renderAt('/account');
    expect(screen.getByText(/expired or was already used/i)).toBeInTheDocument();
  });
});

test('a message from one form does not follow to the next', async () => {
  const setNotice = jest.fn();
  useAuth.mockReturnValue({ signIn: jest.fn().mockResolvedValue({ error: new Error('Invalid login credentials') }), signUp: jest.fn(), requestPasswordReset: jest.fn(), isSupabaseConfigured: true, notice: '', setNotice });
  renderAt('/account');
  await signIn();
  expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /forgot your password/i }));
  expect(screen.queryByText('Invalid login credentials')).not.toBeInTheDocument();
  expect(setNotice).toHaveBeenCalledWith('');
});

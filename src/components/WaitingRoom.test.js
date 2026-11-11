import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WaitingRoom from './WaitingRoom';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

let auth;
function renderRoom(overrides = {}) {
  auth = {
    user: { id: 'u9', email: 'new@example.com' },
    membershipStatus: 'pending',
    refreshMembership: jest.fn().mockResolvedValue({ status: 'pending' }),
    signOut: jest.fn(),
    ...overrides,
  };
  useAuth.mockReturnValue(auth);
  return render(<WaitingRoom />);
}

afterEach(() => { jest.useRealTimers(); });

test('someone waiting is told the admin lets people in, and which account they are on', () => {
  renderRoom();
  expect(screen.getByRole('heading', { name: /you're on the list/i })).toBeInTheDocument();
  expect(screen.getByText(/lets each new angler in/i)).toBeInTheDocument();
  expect(screen.getByText('new@example.com')).toBeInTheDocument();
});

test('"Check again" asks, and says so when they are still waiting', async () => {
  renderRoom();
  await userEvent.click(screen.getByRole('button', { name: /check again/i }));
  expect(auth.refreshMembership).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/still waiting/i)).toBeInTheDocument();
});

test('it keeps checking by itself, so being approved needs no reload', () => {
  jest.useFakeTimers();
  renderRoom();
  expect(auth.refreshMembership).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(30000); });
  act(() => { jest.advanceTimersByTime(30000); });
  expect(auth.refreshMembership).toHaveBeenCalledTimes(2);
});

test('someone turned down is told so, with no retry and no polling', () => {
  jest.useFakeTimers();
  renderRoom({ membershipStatus: 'declined' });
  expect(screen.getByRole('heading', { name: /isn't in the club/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /check again|try again/i })).not.toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(120000); });
  expect(auth.refreshMembership).not.toHaveBeenCalled();
});

test('when membership couldn\'t be checked it says that, not "waiting"', () => {
  renderRoom({ membershipStatus: 'unknown' });
  expect(screen.getByRole('heading', { name: /couldn't check your membership/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
});

test('signing out is always there', async () => {
  renderRoom({ membershipStatus: 'declined' });
  await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
  expect(auth.signOut).toHaveBeenCalled();
});

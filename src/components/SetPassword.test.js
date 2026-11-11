import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetPassword from './SetPassword';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

let auth;
function renderScreen(overrides = {}) {
  auth = { user: { id: 'user-1', email: 'andre@example.com' }, setRecoveredPassword: jest.fn().mockResolvedValue({ error: null }), signOut: jest.fn(), ...overrides };
  useAuth.mockReturnValue(auth);
  return render(<SetPassword />);
}

test('asks for a new password twice and saves it', async () => {
  renderScreen();
  expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
  expect(screen.getByText('andre@example.com')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('New password'), 'tight-lines-42');
  await userEvent.type(screen.getByLabelText('And again'), 'tight-lines-42');
  await userEvent.click(screen.getByRole('button', { name: /save and enter/i }));
  await waitFor(() => expect(auth.setRecoveredPassword).toHaveBeenCalledWith('tight-lines-42'));
});

test('two different entries are caught before anything is sent', async () => {
  renderScreen();
  await userEvent.type(screen.getByLabelText('New password'), 'tight-lines-42');
  await userEvent.type(screen.getByLabelText('And again'), 'tight-lines-43');
  await userEvent.click(screen.getByRole('button', { name: /save and enter/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/don't match/i);
  expect(auth.setRecoveredPassword).not.toHaveBeenCalled();
});

test('a refusal (too weak, in a breach) is shown and the form can be tried again', async () => {
  renderScreen({ setRecoveredPassword: jest.fn().mockResolvedValue({ error: new Error('That password has turned up in data breaches (12 times), so it\'s on the lists people try first. Pick another.') }) });
  await userEvent.type(screen.getByLabelText('New password'), 'password1234');
  await userEvent.type(screen.getByLabelText('And again'), 'password1234');
  await userEvent.click(screen.getByRole('button', { name: /save and enter/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/data breaches/i);
  expect(screen.getByRole('button', { name: /save and enter/i })).toBeEnabled();
});

test('password fields are marked as a new password for this account, so a manager can save it', () => {
  const { container } = renderScreen();
  expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
  expect(screen.getByLabelText('New password')).toHaveAttribute('minlength', '10');
  expect(container.querySelector('input[autocomplete="username"]')).toHaveValue('andre@example.com');
});

test('backing out signs the account out rather than leaving the reset link\'s session open', async () => {
  renderScreen();
  await userEvent.click(screen.getByRole('button', { name: /cancel and sign out/i }));
  expect(auth.signOut).toHaveBeenCalledTimes(1);
});

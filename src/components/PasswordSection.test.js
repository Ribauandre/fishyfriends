import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PasswordSection from './PasswordSection';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

let auth;
function renderSection(overrides = {}) {
  auth = {
    user: { id: 'user-1', email: 'andre@example.com' },
    passwordWarning: false,
    changePassword: jest.fn().mockResolvedValue({ error: null }),
    signOutEverywhere: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  useAuth.mockReturnValue(auth);
  return render(<MemoryRouter initialEntries={['/profile']}><Routes>
    <Route path="/profile" element={<PasswordSection />} />
    <Route path="/account" element={<div>Sign-in page</div>} />
  </Routes></MemoryRouter>);
}

async function fill(current, next, again = next) {
  await userEvent.type(screen.getByLabelText('Current password'), current);
  await userEvent.type(screen.getByLabelText('New password'), next);
  await userEvent.type(screen.getByLabelText(/new password again/i), again);
}

test('changes the password with the current one, then clears the form', async () => {
  renderSection();
  await fill('old-password-1', 'tight-lines-42');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  await waitFor(() => expect(auth.changePassword).toHaveBeenCalledWith('old-password-1', 'tight-lines-42'));
  expect(await screen.findByRole('status')).toHaveTextContent('Password changed');
  expect(screen.getByLabelText('Current password')).toHaveValue('');
  expect(screen.getByLabelText('New password')).toHaveValue('');
});

test('two different new passwords are caught before anything is sent', async () => {
  renderSection();
  await fill('old-password-1', 'tight-lines-42', 'tight-lines-24');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/don't match/i);
  expect(auth.changePassword).not.toHaveBeenCalled();
});

test('a wrong current password is said, and what was typed is kept', async () => {
  renderSection({ changePassword: jest.fn().mockResolvedValue({ error: new Error('That isn\'t your current password.') }) });
  await fill('wrong', 'tight-lines-42');
  await userEvent.click(screen.getByRole('button', { name: /change password/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/isn't your current password/i);
  expect(screen.getByLabelText('New password')).toHaveValue('tight-lines-42');
});

test('says so when the password that signed them in is in breach dumps', () => {
  renderSection({ passwordWarning: true });
  expect(screen.getByRole('alert')).toHaveTextContent(/turned up in data breaches/i);
});

test('signing out everywhere takes a second, deliberate tap, then leaves for the sign-in page', async () => {
  renderSection();
  await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  expect(auth.signOutEverywhere).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: /keep me in/i }));
  expect(screen.getByRole('button', { name: 'Sign out everywhere' })).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  await userEvent.click(screen.getByRole('button', { name: /yes, sign out everywhere/i }));
  expect(await screen.findByText('Sign-in page')).toBeInTheDocument();
  expect(auth.signOutEverywhere).toHaveBeenCalledTimes(1);
});

test('a failure to sign out everywhere is shown and the page stays', async () => {
  renderSection({ signOutEverywhere: jest.fn().mockResolvedValue({ error: new Error('Network down') }) });
  await userEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
  await userEvent.click(screen.getByRole('button', { name: /yes, sign out everywhere/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
  expect(screen.queryByText('Sign-in page')).not.toBeInTheDocument();
});

test('the fields tell a password manager which is which', () => {
  const { container } = renderSection();
  expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password');
  expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
  expect(container.querySelector('input[autocomplete="username"]')).toHaveValue('andre@example.com');
  expect(container.querySelector('section')).toHaveAttribute('id', 'password');
});

test('signed in but can\'t remember the password: a reset link goes to the account\'s own email', async () => {
  renderSection({ requestPasswordReset: jest.fn().mockResolvedValue({ error: null }) });
  await userEvent.click(screen.getByRole('button', { name: /email me a reset link/i }));
  expect(auth.requestPasswordReset).toHaveBeenCalledWith('andre@example.com');
  expect(await screen.findByRole('status')).toHaveTextContent(/reset link sent to andre@example\.com/i);
  expect(auth.changePassword).not.toHaveBeenCalled();
});

test('a reset link that can\'t be sent says why', async () => {
  renderSection({ requestPasswordReset: jest.fn().mockResolvedValue({ error: new Error('For security purposes, you can only request this after 48 seconds.') }) });
  await userEvent.click(screen.getByRole('button', { name: /email me a reset link/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/after 48 seconds/i);
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Profile from './Profile';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderProfile() {
  return render(<MemoryRouter><Profile /></MemoryRouter>);
}

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1', email: 'andre@example.com' },
    profile: { display_name: 'Andre', home_water: '', favorite_species: '', bio: '', avatar_url: '' },
    personalBests: [],
    customSpecies: [],
    updateProfile: jest.fn(),
    uploadAvatar: jest.fn(),
    signOut: jest.fn(),
    notice: '',
    setNotice: jest.fn(),
    submitBugReport: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('submitting a bug report clears the field and shows a thank-you message', async () => {
  const submitBugReport = jest.fn().mockResolvedValue({ error: null, report: { id: 'br-1' } });
  useAuth.mockReturnValue(makeBaseAuth({ submitBugReport }));
  renderProfile();

  const field = screen.getByLabelText(/what happened/i);
  await userEvent.type(field, 'The like button does nothing.');
  await userEvent.click(screen.getByRole('button', { name: /reel it in/i }));

  await waitFor(() => expect(submitBugReport).toHaveBeenCalledWith({ body: 'The like button does nothing.' }));
  expect(await screen.findByText(/we'll get it untangled/i)).toBeInTheDocument();
  expect(field).toHaveValue('');
});

test('shows the server error message and keeps the description when reporting fails', async () => {
  const submitBugReport = jest.fn().mockResolvedValue({ error: new Error('Sign in before reporting a bug.') });
  useAuth.mockReturnValue(makeBaseAuth({ submitBugReport }));
  renderProfile();

  const field = screen.getByLabelText(/what happened/i);
  await userEvent.type(field, 'Broken thing');
  await userEvent.click(screen.getByRole('button', { name: /reel it in/i }));

  expect(await screen.findByText(/sign in before reporting a bug/i)).toBeInTheDocument();
  expect(field).toHaveValue('Broken thing');
});

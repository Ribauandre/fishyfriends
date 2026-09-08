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

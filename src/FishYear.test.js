import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import FishYear from './FishYear';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderFishYear(route = '/fish-year') {
  return render(<MemoryRouter initialEntries={[route]}><FishYear /></MemoryRouter>);
}

function makeBaseAuth() {
  return {
    user: { id: 'user-1' },
    customSpecies: [],
    listFishYearCatches: jest.fn().mockResolvedValue([]),
    logFishYearCatch: jest.fn(),
    deleteFishYearCatch: jest.fn(),
    listLikes: jest.fn().mockResolvedValue([]),
    likeTarget: jest.fn().mockResolvedValue({ error: null }),
    unlikeTarget: jest.fn().mockResolvedValue({ error: null }),
    listFishYearComments: jest.fn().mockResolvedValue([]),
    addFishYearComment: jest.fn(),
    deleteFishYearComment: jest.fn(),
  };
}
beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('shows a loading state, then the board once catches resolve', async () => {
  renderFishYear();
  expect(screen.getByText(/loading the board/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText(/loading the board/i)).not.toBeInTheDocument());
});

test('marks a month as caught only for the current user\'s own catches', async () => {
  useAuth.mockReturnValue({
    ...makeBaseAuth(),
    listFishYearCatches: jest.fn().mockResolvedValue([
      { id: 'fy-1', user_id: 'user-1', month: 'March', species: 'Bass', angler_name: 'Me', caught_at: '2026-03-01', photo_url: '' },
      { id: 'fy-2', user_id: 'someone-else', month: 'June', species: 'Trout', angler_name: 'Kevin', caught_at: '2026-06-01', photo_url: '' },
    ]),
  });
  renderFishYear();
  await waitFor(() => expect(screen.getByText('1 of 12 months caught')).toBeInTheDocument());
  // March (mine) is caught; June (someone else's) should not count toward my personal board.
  expect(screen.getByText('Mar').closest('.year-month')).toHaveClass('is-caught');
  expect(screen.getByText('Jun').closest('.year-month')).toHaveClass('is-missing');
});

test('opens the log-a-catch modal with fields in Photo, Date, Species order', async () => {
  renderFishYear();
  await waitFor(() => expect(screen.queryByText(/loading the board/i)).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /log a catch/i }));
  const labels = screen.getAllByText(/^(Photo|Date|Species)$/).map((el) => el.textContent);
  expect(labels).toEqual(['Photo', 'Date', 'Species']);
});

test('submitting logs the catch with the month derived from the date, and adds it to the board', async () => {
  const logFishYearCatch = jest.fn().mockResolvedValue({ error: null, catchEntry: { id: 'fy-new', user_id: 'user-1', month: 'March', species: 'Carp', angler_name: 'Me', caught_at: '2026-03-15', photo_url: '' } });
  useAuth.mockReturnValue({ ...makeBaseAuth(), logFishYearCatch });
  renderFishYear();
  await waitFor(() => expect(screen.queryByText(/loading the board/i)).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /log a catch/i }));

  const dateInput = document.querySelector('.catch-modal input[type="date"]');
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, '2026-03-15');
  await userEvent.type(screen.getByRole('combobox'), 'Carp');
  await userEvent.click(screen.getByRole('option', { name: 'Carp' }));
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));

  await waitFor(() => expect(logFishYearCatch).toHaveBeenCalledWith(expect.objectContaining({
    year: 2026,
    month: 'March',
    species: 'Carp',
    caughtAt: '2026-03-15',
  })));
  await waitFor(() => expect(screen.queryByRole('button', { name: /make it official/i })).not.toBeInTheDocument());
});

test('shows the server error message and keeps the modal open when logging fails', async () => {
  const logFishYearCatch = jest.fn().mockResolvedValue({ error: new Error('Catch photos must be smaller than 5 MB.') });
  useAuth.mockReturnValue({ ...makeBaseAuth(), logFishYearCatch });
  renderFishYear();
  await waitFor(() => expect(screen.queryByText(/loading the board/i)).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /log a catch/i }));
  await userEvent.type(screen.getByRole('combobox'), 'Carp');
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));
  expect(await screen.findByText(/smaller than 5 mb/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /make it official/i })).toBeInTheDocument();
});

test('a rapid double-tap on the submit button only logs the catch once', async () => {
  let resolveLog;
  const logFishYearCatch = jest.fn(() => new Promise((resolve) => { resolveLog = resolve; }));
  useAuth.mockReturnValue({ ...makeBaseAuth(), logFishYearCatch });
  renderFishYear();
  await waitFor(() => expect(screen.queryByText(/loading the board/i)).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /log a catch/i }));
  await userEvent.type(screen.getByRole('combobox'), 'Carp');
  await userEvent.click(screen.getByRole('option', { name: 'Carp' }));

  const submitButton = screen.getByRole('button', { name: /make it official/i });
  userEvent.click(submitButton);
  userEvent.click(submitButton);
  expect(logFishYearCatch).toHaveBeenCalledTimes(1);

  resolveLog({ error: null, catchEntry: { id: 'fy-new', user_id: 'user-1', month: 'March', species: 'Carp', angler_name: 'Me', caught_at: '2026-03-15', photo_url: '' } });
  await waitFor(() => expect(screen.queryByRole('button', { name: /make it official/i })).not.toBeInTheDocument());
});

test('passes the ?catch= query param through so the linked catch is highlighted and its comments open', async () => {
  useAuth.mockReturnValue({
    ...makeBaseAuth(),
    listFishYearCatches: jest.fn().mockResolvedValue([
      { id: 'fy-1', user_id: 'user-1', month: 'March', species: 'Bass', angler_name: 'Me', caught_at: '2026-03-01', photo_url: '' },
    ]),
  });
  renderFishYear('/fish-year?catch=fy-1');
  await waitFor(() => expect(screen.queryByText(/loading the board/i)).not.toBeInTheDocument());
  await waitFor(() => expect(document.querySelector('.catch-card.is-shared-highlight')).toBeInTheDocument());
  // A notification/share link about this specific catch should land on its comments open,
  // not just scrolled to the card — otherwise "take me to the comment" only gets you halfway.
  expect(screen.getByRole('button', { name: /hide comments/i })).toBeInTheDocument();
});

test('also passes a ?comment= query param through so the specific comment is highlighted', async () => {
  useAuth.mockReturnValue({
    ...makeBaseAuth(),
    listFishYearCatches: jest.fn().mockResolvedValue([
      { id: 'fy-1', user_id: 'user-1', month: 'March', species: 'Bass', angler_name: 'Me', caught_at: '2026-03-01', photo_url: '' },
    ]),
    listFishYearComments: jest.fn().mockResolvedValue([
      { id: 'c-1', user_id: 'user-2', author_name: 'Kevin', body: 'Nice bass!' },
      { id: 'c-2', user_id: 'user-3', author_name: 'Sam', body: 'Wow!' },
    ]),
  });
  renderFishYear('/fish-year?catch=fy-1&comment=c-2');
  await waitFor(() => expect(screen.queryByText(/loading the board/i)).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByText('Wow!').closest('.comment-row')).toHaveClass('is-shared-highlight'));
  expect(screen.getByText('Nice bass!').closest('.comment-row')).not.toHaveClass('is-shared-highlight');
});

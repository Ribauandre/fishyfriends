import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Anglers from './Anglers';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderAnglers(route = '/anglers') {
  return render(<MemoryRouter initialEntries={[route]}><Anglers /></MemoryRouter>);
}

const roster = [
  { profile: { id: 'user-1', display_name: 'Andre', home_water: 'Raritan Bay', favorite_species: 'Striped Bass' }, personalBests: [{ id: 'pb-1', species: 'Striped Bass', size_label: '38 in', caught_at: '2026-06-12', photo_url: '' }] },
  { profile: { id: 'user-2', display_name: 'Kevin', home_water: 'Delaware River', favorite_species: 'Steelhead' }, personalBests: [{ id: 'pb-2', species: 'Steelhead', size_label: '30 in', caught_at: '2026-01-16', photo_url: '' }] },
];

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1' },
    listAnglers: jest.fn().mockResolvedValue(roster),
    deletePersonalBest: jest.fn(),
    uploadPersonalBest: jest.fn(),
    listFishYearCatches: jest.fn().mockResolvedValue([]),
    listComments: jest.fn().mockResolvedValue([]),
    addComment: jest.fn(),
    deleteComment: jest.fn(),
    listLikes: jest.fn().mockResolvedValue([]),
    likeTarget: jest.fn().mockResolvedValue({ error: null }),
    unlikeTarget: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('shows a loading state, then every angler once the roster resolves', async () => {
  renderAnglers();
  expect(screen.getByText(/rounding up the crew/i)).toBeInTheDocument();
  expect(await screen.findByText('Andre')).toBeInTheDocument();
  expect(screen.getByText('Kevin')).toBeInTheDocument();
});

test('marks the current user\'s own card', async () => {
  renderAnglers();
  const card = (await screen.findByText('Andre')).closest('.angler-card');
  expect(card).toHaveClass('is-you');
  const othersCard = screen.getByText('Kevin').closest('.angler-card');
  expect(othersCard).not.toHaveClass('is-you');
});

test('search filters by angler name', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'kevin');
  expect(screen.queryByText('Andre')).not.toBeInTheDocument();
  expect(screen.getByText('Kevin')).toBeInTheDocument();
});

test('search filters by home water', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'delaware');
  expect(screen.getByText('Kevin')).toBeInTheDocument();
  expect(screen.queryByText('Andre')).not.toBeInTheDocument();
});

test('search filters by a personal best species', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'steelhead');
  expect(screen.getByText('Kevin')).toBeInTheDocument();
  expect(screen.queryByText('Andre')).not.toBeInTheDocument();
});

test('shows a friendly message when nothing matches the search', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'nobody has this water');
  expect(screen.getByText(/nobody matches that/i)).toBeInTheDocument();
});

async function expandCard(name) {
  await userEvent.click(screen.getByText(name).closest('.angler-card-head'));
}

test('personal bests are collapsed by default, with a count on the card header', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  const andreCard = screen.getByText('Andre').closest('.angler-card');
  expect(andreCard.querySelector('.personal-best-tag')).not.toBeInTheDocument();
  expect(andreCard).toHaveTextContent('1 PB');
  expect(andreCard.querySelector('.angler-card-head')).toHaveAttribute('aria-expanded', 'false');
});

test('tapping a card expands it to show personal bests', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  await expandCard('Andre');
  const andreCard = screen.getByText('Andre').closest('.angler-card');
  expect(within(andreCard).getByText('Striped Bass')).toBeInTheDocument();
  expect(screen.getAllByText(/personal best/i).length).toBeGreaterThan(0);
});

test('only the owner\'s personal best gets a Delete option', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  await expandCard('Andre');
  await expandCard('Kevin');
  const menus = await screen.findAllByRole('button', { name: /more options/i });
  await userEvent.click(menus[0]); // Andre's own card — user-1 is viewing
  expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  await userEvent.click(menus[0]); // close it
  await userEvent.click(menus[1]); // Kevin's card
  expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
});

test('deleting a personal best removes it from the current user\'s card only', async () => {
  const deletePersonalBest = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeBaseAuth({ deletePersonalBest }));
  renderAnglers();
  await screen.findByText('Andre');
  await expandCard('Andre');
  const menus = await screen.findAllByRole('button', { name: /more options/i });
  await userEvent.click(menus[0]);
  await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
  expect(deletePersonalBest).toHaveBeenCalledWith('pb-1');
  await waitFor(() => expect(screen.getByText('Andre').closest('.angler-card')).toHaveTextContent(/no personal bests logged yet/i));
});

test('tapping a personal best photo opens a lightbox, and closing it works', async () => {
  const rosterWithPhoto = [
    { profile: { id: 'user-1', display_name: 'Andre', home_water: 'Raritan Bay' }, personalBests: [{ id: 'pb-1', species: 'Striped Bass', size_label: '38 in', caught_at: '2026-06-12', photo_url: 'https://example.com/bass.jpg' }] },
  ];
  useAuth.mockReturnValue(makeBaseAuth({ listAnglers: jest.fn().mockResolvedValue(rosterWithPhoto) }));
  renderAnglers();
  await screen.findByText('Andre');
  await expandCard('Andre');
  await userEvent.click(screen.getByRole('button', { name: /expand andre's striped bass photo/i }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /close expanded image/i }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a ?best= query param auto-expands and highlights the matching card', async () => {
  renderAnglers('/anglers?best=pb-2');
  await screen.findByText('Andre');
  await waitFor(() => expect(document.querySelector('.angler-best.is-shared-highlight')).toBeInTheDocument());
  const kevinCard = screen.getByText('Kevin').closest('.angler-card');
  expect(kevinCard.querySelector('.angler-card-head')).toHaveAttribute('aria-expanded', 'true');
  expect(kevinCard.querySelector('.angler-best')).toHaveClass('is-shared-highlight');
  // Landing here from a notification/share link should open the comments on that specific
  // best, not just scroll to the card.
  expect(within(kevinCard.querySelector('.angler-best')).getByRole('button', { name: /hide comments/i })).toBeInTheDocument();
});

test('also passes a ?comment= query param through so the specific comment is highlighted', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listComments: jest.fn().mockResolvedValue([
      { id: 'c-1', user_id: 'user-3', author_name: 'Andre', body: 'Nice fish!' },
      { id: 'c-2', user_id: 'user-4', author_name: 'Sam', body: 'Beat that.' },
    ]),
  }));
  renderAnglers('/anglers?best=pb-2&comment=c-2');
  await screen.findByText('Andre');
  await waitFor(() => expect(screen.getByText('Beat that.').closest('.comment-row')).toHaveClass('is-shared-highlight'));
  expect(screen.getByText('Nice fish!').closest('.comment-row')).not.toHaveClass('is-shared-highlight');
});

test('shows a form for logging a new personal best, now that it lives here instead of on Profile', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  expect(screen.getByRole('heading', { name: /log a new personal best/i })).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toBeInTheDocument();
});

test('logging a new personal best adds it to the current user\'s own card', async () => {
  const uploadPersonalBest = jest.fn().mockResolvedValue({ error: null, bestEntry: { id: 'pb-new', species: 'Carp', size_label: '', caught_at: '', photo_url: '' } });
  useAuth.mockReturnValue(makeBaseAuth({ uploadPersonalBest }));
  renderAnglers();
  await screen.findByText('Andre');
  await userEvent.type(screen.getByRole('combobox'), 'Carp');
  await userEvent.click(screen.getByRole('option', { name: 'Carp' }));
  await userEvent.click(screen.getByRole('button', { name: /log personal best/i }));
  await waitFor(() => expect(uploadPersonalBest).toHaveBeenCalled());
  await expandCard('Andre');
  const andreCard = screen.getByText('Andre').closest('.angler-card');
  expect(within(andreCard).getByText('Carp')).toBeInTheDocument();
});

test('shows a species checklist reflecting the current user\'s own personal bests', async () => {
  renderAnglers();
  await screen.findByText('Andre');
  expect(await screen.findByText(/species caught/i)).toBeInTheDocument();
  expect(screen.getByText('Striped Bass').closest('.species-cell')).toHaveClass('is-caught');
});

test('also credits the checklist for species logged as Fish Year catches, not just personal bests', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listFishYearCatches: jest.fn().mockResolvedValue([
      { id: 'fy-1', user_id: 'user-1', month: 'March', species: 'Carp' },
      { id: 'fy-2', user_id: 'user-2', month: 'April', species: 'Bluegill' },
    ]),
  }));
  renderAnglers();
  await screen.findByText('Andre');
  await screen.findByText(/species caught/i);
  expect(screen.getByText('Carp').closest('.species-cell')).toHaveClass('is-caught');
  // Kevin's (user-2) Fish Year catch shouldn't count toward the current user's checklist.
  expect(screen.getByText('Bluegill').closest('.species-cell')).toHaveClass('is-missing');
});

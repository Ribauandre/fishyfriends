import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

test('only the owner\'s personal best gets a Delete option', async () => {
  renderAnglers();
  await screen.findByText('Andre');
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
  const menus = await screen.findAllByRole('button', { name: /more options/i });
  await userEvent.click(menus[0]);
  await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
  expect(deletePersonalBest).toHaveBeenCalledWith('pb-1');
  await waitFor(() => expect(screen.getByText('Andre').closest('.angler-card')).toHaveTextContent(/no personal bests logged yet/i));
});

test('a ?best= query param highlights the matching card', async () => {
  renderAnglers('/anglers?best=pb-2');
  await screen.findByText('Andre');
  await waitFor(() => expect(document.querySelector('.angler-best.is-shared-highlight')).toBeInTheDocument());
  const kevinCard = screen.getByText('Kevin').closest('.angler-card');
  expect(kevinCard.querySelector('.angler-best')).toHaveClass('is-shared-highlight');
});

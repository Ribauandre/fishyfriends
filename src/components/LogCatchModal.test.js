import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LogCatchModal from './LogCatchModal';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const derby = { id: 't1', name: 'Fluke Derby', unit: 'in', starts_on: '2026-07-01', ends_on: '2026-07-31' };
const montauk = { id: 'trip-1', name: 'Montauk run', starts_on: '2026-07-10', ends_on: '2026-07-12', attendees: [{ user_id: 'me' }] };

function makeAuth(overrides = {}) {
  return {
    user: { id: 'me' },
    customSpecies: [],
    personalBests: [],
    listTournaments: jest.fn().mockResolvedValue([derby]),
    listTrips: jest.fn().mockResolvedValue([montauk]),
    logFishYearCatch: jest.fn().mockResolvedValue({ error: null, catchEntry: { id: 'fy-1' } }),
    uploadPersonalBest: jest.fn().mockResolvedValue({ error: null, bestEntry: { id: 'pb-1' } }),
    submitTournamentEntry: jest.fn().mockResolvedValue({ error: null, entry: { id: 'e-1' } }),
    logTripCatch: jest.fn().mockResolvedValue({ error: null, tripCatch: { id: 'c-1' } }),
    ...overrides,
  };
}

async function fillCatch({ date = '2026-07-11', species = 'Carp' } = {}) {
  const dateInput = document.querySelector('input[type="date"]');
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, date);
  if (!species) return;
  await userEvent.type(screen.getByRole('combobox'), species);
  await userEvent.click(screen.getByRole('option', { name: species }));
}

function renderModal(props = {}) {
  const onLogged = jest.fn();
  render(<MemoryRouter><LogCatchModal onClose={jest.fn()} onLogged={onLogged} {...props} /></MemoryRouter>);
  return { onLogged };
}

test('one fish, logged once, lands everywhere it was ticked', async () => {
  const auth = makeAuth();
  useAuth.mockReturnValue(auth);
  const { onLogged } = renderModal();
  await fillCatch();
  expect(screen.getByRole('checkbox', { name: /fish year 2026/i })).toBeChecked();
  await userEvent.click(screen.getByRole('checkbox', { name: /personal best/i }));
  await userEvent.click(await screen.findByRole('checkbox', { name: /fluke derby/i }));
  await userEvent.click(screen.getByRole('checkbox', { name: /montauk run/i }));
  await userEvent.type(screen.getByLabelText(/length/i), '22');
  await userEvent.type(screen.getByLabelText(/weight/i), '4.5');
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));

  const done = await screen.findByRole('dialog', { name: /catch logged/i });
  expect(auth.logFishYearCatch).toHaveBeenCalledWith(expect.objectContaining({ year: 2026, month: 'July', species: 'Carp', caughtAt: '2026-07-11' }));
  expect(auth.uploadPersonalBest).toHaveBeenCalledWith(expect.objectContaining({ species: 'Carp', sizeLabel: '22 in · 4.5 lb', caughtAt: '2026-07-11' }));
  expect(auth.submitTournamentEntry).toHaveBeenCalledWith(expect.objectContaining({ tournamentId: 't1', size: 22 }));
  expect(auth.logTripCatch).toHaveBeenCalledWith(expect.objectContaining({ tripId: 'trip-1', lengthIn: 22 }));
  expect(within(done).getByRole('link', { name: /fish year 2026/i })).toHaveAttribute('href', '/fish-year?catch=fy-1');
  expect(within(done).getByRole('link', { name: /personal best/i })).toHaveAttribute('href', '/profile?best=pb-1');
  expect(within(done).getByRole('link', { name: /fluke derby/i })).toHaveAttribute('href', '/tournaments/t1?entry=e-1');
  expect(within(done).getByRole('link', { name: /montauk run/i })).toHaveAttribute('href', '/trips/trip-1');
  expect(onLogged.mock.calls[0][0].map((entry) => entry.key)).toEqual(['fishYear', 'personalBest', 'tournament:t1', 'trip:trip-1']);
});

test('only tournaments and trips running on the catch date are offered', async () => {
  useAuth.mockReturnValue(makeAuth());
  renderModal();
  await fillCatch({ date: '2026-07-20' });
  expect(await screen.findByRole('checkbox', { name: /fluke derby/i })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: /montauk run/i })).not.toBeInTheDocument();
  await fillCatch({ date: '2025-12-30', species: null });
  expect(screen.getByRole('checkbox', { name: /fish year 2026/i })).toBeDisabled();
  expect(screen.getByText(/only 2026 catches count/i)).toBeInTheDocument();
});

test('when one place fails, the rest stay logged and a retry only sends what failed', async () => {
  const submitTournamentEntry = jest.fn()
    .mockResolvedValueOnce({ error: new Error('Network hiccup.') })
    .mockResolvedValueOnce({ error: null, entry: { id: 'e-1' } });
  const auth = makeAuth({ submitTournamentEntry });
  useAuth.mockReturnValue(auth);
  renderModal();
  await fillCatch();
  await userEvent.click(await screen.findByRole('checkbox', { name: /fluke derby/i }));
  await userEvent.type(screen.getByLabelText(/length/i), '22');
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));

  expect(await screen.findByText('Fluke Derby: Network hiccup.')).toBeInTheDocument();
  expect(screen.getByText(/already logged: fish year 2026/i)).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /fish year 2026/i })).not.toBeChecked();

  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));
  await screen.findByRole('dialog', { name: /catch logged/i });
  expect(auth.logFishYearCatch).toHaveBeenCalledTimes(1);
  expect(submitTournamentEntry).toHaveBeenCalledTimes(2);
});

test('a tournament measured in pounds asks for the weight before sending anything', async () => {
  const auth = makeAuth({ listTournaments: jest.fn().mockResolvedValue([{ ...derby, unit: 'lb' }]) });
  useAuth.mockReturnValue(auth);
  renderModal({ preset: { tournamentId: 't1' } });
  await fillCatch();
  expect(await screen.findByRole('checkbox', { name: /fluke derby/i })).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: /make it official/i }));
  expect(screen.getByText(/measured in pounds — add the weight/i)).toBeInTheDocument();
  expect(auth.submitTournamentEntry).not.toHaveBeenCalled();
});

test('ticking personal best says which best it replaces', async () => {
  useAuth.mockReturnValue(makeAuth({ personalBests: [{ id: 'pb-0', species: 'Carp', size_label: '19 in' }] }));
  renderModal({ preset: { personalBest: true } });
  await fillCatch();
  expect(screen.getByText('Replaces your Carp best (19 in)')).toBeInTheDocument();
});

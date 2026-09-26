import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Trips from './Trips';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderTrips() {
  return render(<MemoryRouter initialEntries={['/trips']}>
    <Routes>
      <Route path="/trips" element={<Trips />} />
      <Route path="/trips/:tripId" element={<div>Trip page</div>} />
    </Routes>
  </MemoryRouter>);
}

const attendee = (id, userId, minute) => ({ id, user_id: userId, created_at: `2026-09-01T10:0${minute}:00Z` });
const trip = (overrides) => ({ id: 't', name: 'Trip', location: '', starts_on: '2099-06-01', ends_on: '2099-06-03', target_species: [], max_spots: null, attendees: [], ...overrides });

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'me' },
    listTrips: jest.fn().mockResolvedValue([]),
    createTrip: jest.fn(),
    customSpecies: [],
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('shows an empty state with no trips', async () => {
  renderTrips();
  expect(await screen.findByText(/no trips planned yet/i)).toBeInTheDocument();
});

test('badges each trip by where the viewer stands, and splits upcoming from past', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listTrips: jest.fn().mockResolvedValue([
      trip({ id: 't1', name: 'Going trip', attendees: [attendee('a1', 'me', 1)] }),
      trip({ id: 't2', name: 'Waitlist trip', max_spots: 1, attendees: [attendee('a2', 'kevin', 1), attendee('a3', 'me', 2)] }),
      trip({ id: 't3', name: 'Full trip', max_spots: 1, attendees: [attendee('a4', 'kevin', 1)] }),
      trip({ id: 't4', name: 'Open trip', target_species: ['Striped Bass', 'Bluefish'] }),
      trip({ id: 't5', name: 'Old trip', starts_on: '2020-06-01', ends_on: '2020-06-02' }),
    ]),
  }));
  renderTrips();

  expect(await screen.findByText('Going trip')).toBeInTheDocument();
  expect(screen.getByText("YOU'RE GOING")).toBeInTheDocument();
  expect(screen.getByText('WAITLISTED')).toBeInTheDocument();
  expect(screen.getByText('FULL')).toBeInTheDocument();
  expect(screen.getAllByText('OPEN').length).toBeGreaterThan(0);
  expect(screen.getByText('Striped Bass · Bluefish')).toBeInTheDocument();
  expect(screen.getByText('1 waiting')).toBeInTheDocument();
  expect(screen.getByText('PAST TRIPS')).toBeInTheDocument();
  expect(screen.getByText('Old trip')).toBeInTheDocument();
});

test('planning a trip calls createTrip and opens it', async () => {
  const createTrip = jest.fn().mockResolvedValue({ error: null, trip: { id: 'new-trip' } });
  useAuth.mockReturnValue(makeBaseAuth({ createTrip }));
  renderTrips();
  await screen.findByText(/no trips planned yet/i);

  await userEvent.click(screen.getByRole('button', { name: /plan a trip/i }));
  await userEvent.type(screen.getByLabelText(/trip name/i), 'Montauk run');
  await userEvent.type(screen.getByLabelText(/where we're staying/i), 'Beach house');
  await userEvent.click(screen.getByRole('button', { name: /create trip/i }));

  await waitFor(() => expect(createTrip).toHaveBeenCalledWith(expect.objectContaining({ name: 'Montauk run', accommodation: 'Beach house' })));
  expect(await screen.findByText('Trip page')).toBeInTheDocument();
});

test('keeps the form open and shows why when a trip fails to save', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ createTrip: jest.fn().mockResolvedValue({ error: new Error('The accommodation link has to be a web address.') }) }));
  renderTrips();
  await screen.findByText(/no trips planned yet/i);

  await userEvent.click(screen.getByRole('button', { name: /plan a trip/i }));
  await userEvent.type(screen.getByLabelText(/trip name/i), 'X');
  await userEvent.click(screen.getByRole('button', { name: /create trip/i }));

  expect(await screen.findByText(/has to be a web address/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/trip name/i)).toBeInTheDocument();
});

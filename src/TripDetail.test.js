import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TripDetail from './TripDetail';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderDetail() {
  return render(<MemoryRouter initialEntries={['/trips/trip-1']}>
    <Routes>
      <Route path="/trips/:tripId" element={<TripDetail />} />
      <Route path="/trips" element={<div>All trips page</div>} />
    </Routes>
  </MemoryRouter>);
}

const baseTrip = {
  id: 'trip-1', name: 'Montauk run', created_by: 'andre', created_by_name: 'Andre', location: 'Montauk Point', state: 'New York',
  starts_on: '2099-10-10', ends_on: '2099-10-12', target_species: ['Striped Bass'], accommodation: 'Beach house',
  accommodation_url: 'https://www.airbnb.com/rooms/1', notes: 'Meet at 5am', max_spots: null,
};
const att = (id, userId, name, minute) => ({ id, trip_id: 'trip-1', user_id: userId, angler_name: name, created_at: `2026-09-01T10:0${minute}:00Z` });
const andre = att('a1', 'andre', 'Andre', 1);
const kevin = att('a2', 'kevin', 'Kevin', 2);
const sam = att('a3', 'sam', 'Sam', 3);

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'kevin' },
    customSpecies: [],
    getTrip: jest.fn().mockResolvedValue(baseTrip),
    updateTrip: jest.fn(),
    deleteTrip: jest.fn(),
    listTripAttendees: jest.fn().mockResolvedValue([andre, kevin]),
    joinTrip: jest.fn(),
    leaveTrip: jest.fn(),
    removeTripAttendee: jest.fn(),
    listTripExpenses: jest.fn().mockResolvedValue([]),
    addTripExpense: jest.fn(),
    deleteTripExpense: jest.fn(),
    listTripSettlements: jest.fn().mockResolvedValue([]),
    recordTripSettlement: jest.fn(),
    deleteTripSettlement: jest.fn(),
    listFishingLicenses: jest.fn().mockResolvedValue([{ state: 'New York', expires_at: '2100-01-01' }]),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('shows the plan: dates, place, species, where we are staying, and a safe booking link', async () => {
  renderDetail();
  expect(await screen.findByRole('heading', { name: 'Montauk run' })).toBeInTheDocument();
  expect(screen.getByText('PLANNED BY ANDRE')).toBeInTheDocument();
  expect(screen.getByText(/2099-10-10 — 2099-10-12 · Montauk Point · New York/)).toBeInTheDocument();
  expect(screen.getByText('Striped Bass')).toBeInTheDocument();
  const link = screen.getByRole('link', { name: /view listing/i });
  expect(link).toHaveAttribute('href', 'https://www.airbnb.com/rooms/1');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getByText('Meet at 5am')).toBeInTheDocument();
});

test('shows a not-found state for a deleted trip', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getTrip: jest.fn().mockResolvedValue(null) }));
  renderDetail();
  expect(await screen.findByText(/doesn't exist anymore/i)).toBeInTheDocument();
});

describe('someone not on the trip', () => {
  const outsider = () => makeBaseAuth({ user: { id: 'sam' } });

  test('can opt in, but sees no money and loads none until they do', async () => {
    const auth = outsider();
    useAuth.mockReturnValue(auth);
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });

    expect(screen.getByText(/join the trip to see and add expenses/i)).toBeInTheDocument();
    expect(auth.listTripExpenses).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /i can't make it/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit trip/i })).not.toBeInTheDocument();
  });

  test('opting in adds them to the roster and loads the money', async () => {
    const auth = { ...outsider(), joinTrip: jest.fn().mockResolvedValue({ error: null, attendee: sam }) };
    useAuth.mockReturnValue(auth);
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });

    await userEvent.click(screen.getByRole('button', { name: /i'm in/i }));

    await waitFor(() => expect(auth.joinTrip).toHaveBeenCalledWith('trip-1'));
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    await waitFor(() => expect(auth.listTripExpenses).toHaveBeenCalledWith('trip-1'));
    expect(screen.getByText('3 going')).toBeInTheDocument();
  });

  test('a full trip offers the waitlist instead', async () => {
    useAuth.mockReturnValue({ ...outsider(), getTrip: jest.fn().mockResolvedValue({ ...baseTrip, max_spots: 2 }) });
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });
    expect(screen.getByRole('button', { name: /join the waitlist/i })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 going')).toBeInTheDocument();
  });
});

test('people past the spot limit are shown on the waitlist', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getTrip: jest.fn().mockResolvedValue({ ...baseTrip, max_spots: 2 }), listTripAttendees: jest.fn().mockResolvedValue([sam, andre, kevin]) }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Montauk run' });
  const waitlist = document.querySelector('.trip-roster-waitlist');
  expect(within(waitlist).getByText('Sam')).toBeInTheDocument();
  expect(screen.getByText(/next person on the waitlist moves up/i)).toBeInTheDocument();
});

test('someone going can leave the trip', async () => {
  const auth = makeBaseAuth({ leaveTrip: jest.fn().mockResolvedValue({ error: null }) });
  useAuth.mockReturnValue(auth);
  renderDetail();
  await screen.findByRole('heading', { name: 'Montauk run' });

  await userEvent.click(screen.getByRole('button', { name: /i can't make it/i }));

  await waitFor(() => expect(auth.leaveTrip).toHaveBeenCalledWith('trip-1'));
  await waitFor(() => expect(screen.queryByRole('button', { name: /remove kevin/i })).not.toBeInTheDocument());
  expect(await screen.findByRole('button', { name: /i'm in/i })).toBeInTheDocument();
});

describe('the creator', () => {
  const creator = (overrides = {}) => makeBaseAuth({ user: { id: 'andre' }, ...overrides });

  test('can remove others but not themselves, and cannot "leave" their own trip', async () => {
    const auth = creator({ removeTripAttendee: jest.fn().mockResolvedValue({ error: null }) });
    useAuth.mockReturnValue(auth);
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });

    expect(screen.getByText('YOUR TRIP')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove andre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i can't make it/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /remove kevin/i }));
    await waitFor(() => expect(auth.removeTripAttendee).toHaveBeenCalledWith('a2'));
    await waitFor(() => expect(screen.queryByText('Kevin')).not.toBeInTheDocument());
  });

  test('a non-creator cannot remove anyone', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  test('can edit the trip', async () => {
    const auth = creator({ updateTrip: jest.fn().mockResolvedValue({ error: null, trip: { ...baseTrip, accommodation: 'Motel on 27' } }) });
    useAuth.mockReturnValue(auth);
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });

    await userEvent.click(screen.getByRole('button', { name: /edit trip/i }));
    const field = screen.getByLabelText(/where we're staying/i);
    await userEvent.clear(field);
    await userEvent.type(field, 'Motel on 27');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(auth.updateTrip).toHaveBeenCalledWith('trip-1', expect.objectContaining({ accommodation: 'Motel on 27', name: 'Montauk run' })));
    expect(await screen.findByText(/Motel on 27/)).toBeInTheDocument();
  });

  test('deleting the trip confirms first, then goes back to all trips', async () => {
    const auth = creator({ deleteTrip: jest.fn().mockResolvedValue({ error: null }) });
    useAuth.mockReturnValue(auth);
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });

    await userEvent.click(screen.getByRole('button', { name: /delete this trip/i }));
    expect(await screen.findByText(/are you sure/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^delete trip$/i }));

    await waitFor(() => expect(auth.deleteTrip).toHaveBeenCalledWith('trip-1'));
    expect(await screen.findByText('All trips page')).toBeInTheDocument();
  });
});

describe('money', () => {
  const house = { id: 'e1', paid_by: 'andre', paid_by_name: 'Andre', description: 'Beach house', amount_cents: 60000 };

  test('shows the total, the per-person price, what you owe, and who pays whom', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ listTripExpenses: jest.fn().mockResolvedValue([house]) }));
    renderDetail();
    await screen.findByText('Beach house', { selector: 'strong' });

    expect(screen.getByText('Total').nextSibling).toHaveTextContent('$600.00');
    expect(screen.getByText('Per person (2 going)').nextSibling).toHaveTextContent('$300.00');
    expect(screen.getByText('owe $300.00')).toBeInTheDocument();
    const transfer = document.querySelector('.trip-transfer-list li');
    expect(transfer).toHaveTextContent('Kevin pays Andre $300.00');
  });

  test('marking a payment records it and clears it from settle-up', async () => {
    const recordTripSettlement = jest.fn().mockResolvedValue({
      error: null,
      settlement: { id: 's1', from_user: 'kevin', from_name: 'Kevin', to_user: 'andre', to_name: 'Andre', amount_cents: 30000, created_by: 'kevin' },
    });
    useAuth.mockReturnValue(makeBaseAuth({ listTripExpenses: jest.fn().mockResolvedValue([house]), recordTripSettlement }));
    renderDetail();
    await screen.findByText('Beach house', { selector: 'strong' });

    await userEvent.click(screen.getByRole('button', { name: /mark paid/i }));

    await waitFor(() => expect(recordTripSettlement).toHaveBeenCalledWith({
      tripId: 'trip-1', from: { userId: 'kevin', name: 'Kevin' }, to: { userId: 'andre', name: 'Andre' }, amountCents: 30000,
    }));
    expect(await screen.findByText("Everyone's square.")).toBeInTheDocument();
    expect(screen.getByText('Kevin paid Andre $300.00')).toBeInTheDocument();
    expect(screen.getByText('are square')).toBeInTheDocument();
  });

  test('only the two people in a payment get a "mark paid" button', async () => {
    useAuth.mockReturnValue(makeBaseAuth({
      user: { id: 'sam' },
      listTripAttendees: jest.fn().mockResolvedValue([andre, kevin, sam]),
      listTripExpenses: jest.fn().mockResolvedValue([{ ...house, amount_cents: 60000 }, { id: 'e2', paid_by: 'sam', paid_by_name: 'Sam', description: 'Bait', amount_cents: 20000 }]),
    }));
    renderDetail();
    await screen.findByText('Beach house', { selector: 'strong' });
    // total 80000, 26667/26667/26666 → Kevin owes Andre, Sam owes Andre a little
    const rows = [...document.querySelectorAll('.trip-transfer-list li')];
    const kevinRow = rows.find((row) => row.textContent.startsWith('Kevin'));
    const samRow = rows.find((row) => row.textContent.startsWith('Sam'));
    expect(within(kevinRow).queryByRole('button', { name: /mark paid/i })).not.toBeInTheDocument();
    expect(within(samRow).getByRole('button', { name: /mark paid/i })).toBeInTheDocument();
  });

  test('adding an expense takes a dollar amount and records it in cents', async () => {
    const addTripExpense = jest.fn().mockResolvedValue({ error: null, expense: { id: 'e9', paid_by: 'kevin', paid_by_name: 'Kevin', description: 'Bait', amount_cents: 4550 } });
    useAuth.mockReturnValue(makeBaseAuth({ addTripExpense }));
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });

    await userEvent.type(screen.getByLabelText(/what it was for/i), 'Bait');
    await userEvent.type(screen.getByLabelText(/amount you paid/i), '$45.50');
    await userEvent.click(screen.getByRole('button', { name: /i paid this/i }));

    await waitFor(() => expect(addTripExpense).toHaveBeenCalledWith({ tripId: 'trip-1', description: 'Bait', amountCents: 4550 }));
    expect(await screen.findByText('Bait', { selector: 'strong' })).toBeInTheDocument();
  });

  test('refuses an amount that is not a dollar figure without saving', async () => {
    const addTripExpense = jest.fn();
    useAuth.mockReturnValue(makeBaseAuth({ addTripExpense }));
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });

    await userEvent.type(screen.getByLabelText(/what it was for/i), 'Bait');
    await userEvent.type(screen.getByLabelText(/amount you paid/i), 'lots');
    await userEvent.click(screen.getByRole('button', { name: /i paid this/i }));

    expect(await screen.findByText(/enter an amount like 85/i)).toBeInTheDocument();
    expect(addTripExpense).not.toHaveBeenCalled();
  });

  test('only the payer or the creator can delete an expense', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ listTripExpenses: jest.fn().mockResolvedValue([house]) }));
    renderDetail();
    await screen.findByText('Beach house', { selector: 'strong' });
    expect(screen.queryByRole('button', { name: /delete beach house/i })).not.toBeInTheDocument();
  });
});

describe('license check', () => {
  test('warns someone going when they have no license for the trip state', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ listFishingLicenses: jest.fn().mockResolvedValue([{ state: 'New Jersey', expires_at: '2100-01-01' }]) }));
    renderDetail();
    expect(await screen.findByText(/don't have a New York fishing license on file/i)).toBeInTheDocument();
  });

  test('says nothing when their license covers the trip', async () => {
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('says nothing to someone who is not going', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'sam' }, listFishingLicenses: jest.fn().mockResolvedValue([]) }));
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });
    expect(screen.queryByText(/fishing license on file/i)).not.toBeInTheDocument();
  });
});

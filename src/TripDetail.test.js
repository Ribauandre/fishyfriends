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
    listVenmoHandles: jest.fn().mockResolvedValue({}),
    listPaymentContacts: jest.fn().mockResolvedValue({}),
    listTripItems: jest.fn().mockResolvedValue([]),
    addTripItem: jest.fn(),
    setTripItemClaim: jest.fn(),
    deleteTripItem: jest.fn(),
    listTripCatches: jest.fn().mockResolvedValue([]),
    logTripCatch: jest.fn(),
    deleteTripCatch: jest.fn(),
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

    await waitFor(() => expect(auth.joinTrip).toHaveBeenCalledWith('trip-1', { creatorId: 'andre', tripName: 'Montauk run' }));
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

    await waitFor(() => expect(addTripExpense).toHaveBeenCalledWith({ tripId: 'trip-1', description: 'Bait', amountCents: 4550, notifyUserIds: ['andre', 'kevin'] }));
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

describe('RSVP deadline', () => {
  test('before the deadline, shows it and still lets people in', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'sam' }, getTrip: jest.fn().mockResolvedValue({ ...baseTrip, rsvp_by: '2099-10-01' }) }));
    renderDetail();
    expect(await screen.findByText('RSVP by 2099-10-01')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /i'm in/i })).toBeInTheDocument();
  });

  test('after the deadline, sign-ups are closed for everyone but the creator', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'sam' }, getTrip: jest.fn().mockResolvedValue({ ...baseTrip, rsvp_by: '2020-01-01' }) }));
    renderDetail();
    expect(await screen.findByText('RSVPs closed 2020-01-01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i'm in|waitlist/i })).not.toBeInTheDocument();
  });

  test('the creator can still get back on their own closed trip', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'andre' }, getTrip: jest.fn().mockResolvedValue({ ...baseTrip, rsvp_by: '2020-01-01' }), listTripAttendees: jest.fn().mockResolvedValue([kevin]) }));
    renderDetail();
    await screen.findByText('RSVPs closed 2020-01-01');
    expect(screen.getByRole('button', { name: /i'm in/i })).toBeInTheDocument();
  });
});

describe('Venmo', () => {
  const house = { id: 'e1', paid_by: 'andre', paid_by_name: 'Andre', description: 'Beach house', amount_cents: 60000 };

  test('whoever owes gets a Venmo link to the person they owe, with the amount filled in', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ listTripExpenses: jest.fn().mockResolvedValue([house]), listVenmoHandles: jest.fn().mockResolvedValue({ andre: 'Andre-R' }) }));
    renderDetail();
    const link = await screen.findByRole('link', { name: /pay on venmo/i });
    expect(link).toHaveAttribute('href', 'https://venmo.com/Andre-R?txn=pay&amount=300.00&note=Montauk%20run%3A%20trip%20share');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('no link when the person owed has no Venmo username, and none for the person owed', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ listTripExpenses: jest.fn().mockResolvedValue([house]) }));
    renderDetail();
    await screen.findByText('Beach house', { selector: 'strong' });
    expect(screen.queryByRole('link', { name: /pay on venmo/i })).not.toBeInTheDocument();
  });

  test('someone owed money with no way to be paid is nudged to add one', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'andre' }, listTripExpenses: jest.fn().mockResolvedValue([house]), listVenmoHandles: jest.fn().mockResolvedValue({}) }));
    renderDetail();
    expect(await screen.findByText(/add venmo, zelle or apple cash/i)).toBeInTheDocument();
  });
});

describe('packing list', () => {
  test('only people on the trip see it', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'sam' } }));
    renderDetail();
    await screen.findByRole('heading', { name: 'Montauk run' });
    expect(screen.queryByRole('heading', { name: /packing list/i })).not.toBeInTheDocument();
  });

  test('claim an unclaimed item; see who has the rest; only your own claim can be let go', async () => {
    const setTripItemClaim = jest.fn().mockResolvedValue({ error: null, item: { id: 'i1', name: 'Cooler', created_by: 'andre', claimed_by: 'kevin', claimed_by_name: 'Kevin' } });
    useAuth.mockReturnValue(makeBaseAuth({
      setTripItemClaim,
      listTripItems: jest.fn().mockResolvedValue([
        { id: 'i1', name: 'Cooler', created_by: 'andre', claimed_by: null, claimed_by_name: '' },
        { id: 'i2', name: 'Boat', created_by: 'andre', claimed_by: 'andre', claimed_by_name: 'Andre' },
      ]),
    }));
    renderDetail();
    expect(await screen.findByText('Andre is bringing it')).toBeInTheDocument();
    expect(screen.getByText('1 UNCLAIMED')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /never mind/i })).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: /i'll bring it/i }));

    await waitFor(() => expect(setTripItemClaim).toHaveBeenCalledWith('i1', true));
    expect(await screen.findByText('You are bringing it')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /never mind/i })).toBeInTheDocument();
    expect(screen.getByText('ALL COVERED')).toBeInTheDocument();
  });

  test('adding an item puts it on the list', async () => {
    const addTripItem = jest.fn().mockResolvedValue({ error: null, item: { id: 'i9', name: 'Bait', created_by: 'kevin', claimed_by: null, claimed_by_name: '' } });
    useAuth.mockReturnValue(makeBaseAuth({ addTripItem }));
    renderDetail();
    await screen.findByRole('heading', { name: /packing list/i });
    await userEvent.type(screen.getByLabelText(/item to add/i), 'Bait');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(addTripItem).toHaveBeenCalledWith({ tripId: 'trip-1', name: 'Bait' }));
    expect(await screen.findByText('Bait')).toBeInTheDocument();
  });
});

describe('trip catches', () => {
  const started = { ...baseTrip, starts_on: '2020-10-10', ends_on: '2099-10-12' };

  test('before the trip starts, nobody can log yet', async () => {
    renderDetail();
    expect(await screen.findByText(/catches can be logged once the trip starts/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log a fish/i })).not.toBeInTheDocument();
  });

  test('someone on a trip that has started can log a fish', async () => {
    const logTripCatch = jest.fn().mockResolvedValue({ error: null, tripCatch: { id: 'c1', user_id: 'kevin', angler_name: 'Kevin', species: 'Bluefish', length_in: 22, created_at: '2026-10-10T10:00:00Z' } });
    useAuth.mockReturnValue(makeBaseAuth({ getTrip: jest.fn().mockResolvedValue(started), logTripCatch }));
    renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: /log a fish/i }));
    await userEvent.type(screen.getByLabelText(/length in inches/i), '22');
    await userEvent.click(screen.getByRole('button', { name: /log it/i }));
    await waitFor(() => expect(logTripCatch).toHaveBeenCalledWith(expect.objectContaining({ tripId: 'trip-1', lengthIn: '22' })));
    expect(await screen.findByText('Bluefish · 22"')).toBeInTheDocument();
  });

  test('someone not on the trip sees the recap but cannot log', async () => {
    useAuth.mockReturnValue(makeBaseAuth({
      user: { id: 'sam' },
      getTrip: jest.fn().mockResolvedValue(started),
      listTripCatches: jest.fn().mockResolvedValue([
        { id: 'c1', user_id: 'kevin', angler_name: 'Kevin', species: 'Striped Bass', length_in: 31, created_at: '2026-10-10T10:00:00Z' },
        { id: 'c2', user_id: 'kevin', angler_name: 'Kevin', species: 'Bluefish', length_in: null, created_at: '2026-10-10T11:00:00Z' },
        { id: 'c3', user_id: 'andre', angler_name: 'Andre', species: 'Striped Bass', length_in: 27, created_at: '2026-10-10T12:00:00Z' },
      ]),
    }));
    renderDetail();
    expect(await screen.findByText('Most fish (3 total)')).toBeInTheDocument();
    const board = screen.getByText('Most fish (3 total)').nextSibling;
    expect(board.firstChild).toHaveTextContent('Kevin2 fish');
    expect(screen.getByText('31" · Kevin')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log a fish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete kevin's/i })).not.toBeInTheDocument();
  });
});

describe('Zelle and Apple Cash', () => {
  const house = { id: 'e1', paid_by: 'andre', paid_by_name: 'Andre', description: 'Beach house', amount_cents: 60000 };

  test('the payer can open the Zelle details to copy, and an Apple Cash link to Messages', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    useAuth.mockReturnValue(makeBaseAuth({
      listTripExpenses: jest.fn().mockResolvedValue([house]),
      listPaymentContacts: jest.fn().mockResolvedValue({ andre: { zelle: '+15555550101', appleCashPhone: '+15555550199' } }),
    }));
    renderDetail();
    const apple = await screen.findByRole('link', { name: /apple cash/i });
    expect(apple).toHaveAttribute('href', 'sms:+15555550199&body=Sending%20%24300.00%20by%20Apple%20Cash%20for%20Montauk%20run');

    await userEvent.click(screen.getByRole('button', { name: /^zelle$/i }));
    expect(screen.getByText('(555) 555-0101')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /copy andre's zelle/i }));
    expect(writeText).toHaveBeenCalledWith('(555) 555-0101');
    await userEvent.click(screen.getByRole('button', { name: /copy amount/i }));
    expect(writeText).toHaveBeenCalledWith('300.00');
  });

  test('only offers what the person owed has set up, and nothing to the person owed', async () => {
    useAuth.mockReturnValue(makeBaseAuth({
      user: { id: 'andre' },
      listTripExpenses: jest.fn().mockResolvedValue([house]),
      listPaymentContacts: jest.fn().mockResolvedValue({ andre: { zelle: 'andre@example.com', appleCashPhone: '' } }),
    }));
    renderDetail();
    await screen.findByText('Beach house', { selector: 'strong' });
    expect(screen.queryByRole('button', { name: /^zelle$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /apple cash/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/so people can pay you back/i)).not.toBeInTheDocument();
  });
});

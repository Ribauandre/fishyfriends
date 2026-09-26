import { splitRoster, parseDollars, formatCents, perPersonCents, balances, settleUp, licenseWarning, rsvpClosed, catchRecap } from './tripMath';

const at = (id, userId, name, minute) => ({ id, user_id: userId, angler_name: name, created_at: `2026-09-01T10:${String(minute).padStart(2, '0')}:00Z` });
const andre = at('a1', 'u-andre', 'Andre', 0);
const kevin = at('a2', 'u-kevin', 'Kevin', 5);
const sam = at('a3', 'u-sam', 'Sam', 9);

describe('splitRoster', () => {
  test('with no spot limit everyone is going', () => {
    expect(splitRoster([sam, andre, kevin], null)).toEqual({ going: [andre, kevin, sam], waitlist: [] });
  });

  test('the first to join fill the spots and the rest wait in join order', () => {
    expect(splitRoster([sam, kevin, andre], 2)).toEqual({ going: [andre, kevin], waitlist: [sam] });
  });

  test('someone leaving promotes the next person on the waitlist', () => {
    expect(splitRoster([andre, sam], 2).going).toEqual([andre, sam]);
  });
});

describe('parseDollars / formatCents', () => {
  test.each([['85', 8500], ['85.5', 8550], ['$1,200.50', 120050], [' 0.01 ', 1]])('%s -> %i cents', (input, cents) => {
    expect(parseDollars(input)).toBe(cents);
  });

  test.each(['', 'abc', '-5', '0', '0.00', '1.234', '1.2.3'])('rejects %p', (input) => {
    expect(parseDollars(input)).toBeNull();
  });

  test('formats cents as dollars', () => {
    expect(formatCents(120050)).toBe('$1,200.50');
    expect(formatCents(0)).toBe('$0.00');
  });
});

describe('perPersonCents', () => {
  test('divides the total by everyone going', () => {
    expect(perPersonCents([{ amount_cents: 60000 }, { amount_cents: 15000 }], 3)).toBe(25000);
  });

  test('is zero with nobody going', () => {
    expect(perPersonCents([{ amount_cents: 60000 }], 0)).toBe(0);
  });
});

describe('balances + settleUp', () => {
  const house = { paid_by: 'u-andre', paid_by_name: 'Andre', amount_cents: 60000 };
  const bait = { paid_by: 'u-kevin', paid_by_name: 'Kevin', amount_cents: 3000 };

  test('everyone going owes an equal share of every expense', () => {
    const list = balances({ going: [andre, kevin, sam], expenses: [house, bait] });
    // total 63000, 21000 each
    expect(list).toEqual([
      { userId: 'u-andre', name: 'Andre', cents: 60000 - 21000 },
      { userId: 'u-kevin', name: 'Kevin', cents: 3000 - 21000 },
      { userId: 'u-sam', name: 'Sam', cents: -21000 },
    ]);
  });

  test('balances always net to zero, with leftover cents going to the earliest joiners', () => {
    const list = balances({ going: [andre, kevin, sam], expenses: [{ paid_by: 'u-andre', paid_by_name: 'Andre', amount_cents: 100 }] });
    expect(list.reduce((sum, b) => sum + b.cents, 0)).toBe(0);
    expect(list.map((b) => b.cents)).toEqual([100 - 34, -33, -33]);
  });

  test('settle-up uses the fewest payments', () => {
    const transfers = settleUp(balances({ going: [andre, kevin, sam], expenses: [house, bait] }));
    expect(transfers).toEqual([
      { from: { userId: 'u-sam', name: 'Sam' }, to: { userId: 'u-andre', name: 'Andre' }, cents: 21000 },
      { from: { userId: 'u-kevin', name: 'Kevin' }, to: { userId: 'u-andre', name: 'Andre' }, cents: 18000 },
    ]);
  });

  test('a recorded payment reduces what is still owed, and a full one clears it', () => {
    const partial = { from_user: 'u-sam', from_name: 'Sam', to_user: 'u-andre', to_name: 'Andre', amount_cents: 20000 };
    expect(settleUp(balances({ going: [andre, kevin, sam], expenses: [house, bait], settlements: [partial] }))).toEqual([
      { from: { userId: 'u-kevin', name: 'Kevin' }, to: { userId: 'u-andre', name: 'Andre' }, cents: 18000 },
      { from: { userId: 'u-sam', name: 'Sam' }, to: { userId: 'u-andre', name: 'Andre' }, cents: 1000 },
    ]);
    const full = { ...partial, amount_cents: 21000 };
    const kevinPaid = { from_user: 'u-kevin', from_name: 'Kevin', to_user: 'u-andre', to_name: 'Andre', amount_cents: 18000 };
    expect(settleUp(balances({ going: [andre, kevin, sam], expenses: [house, bait], settlements: [full, kevinPaid] }))).toEqual([]);
  });

  test('someone who paid and then left is still owed back in full, and waitlisted people owe nothing', () => {
    // Andre paid, then left; Kevin and Sam are the ones going.
    const list = balances({ going: [kevin, sam], expenses: [house] });
    expect(list).toEqual([
      { userId: 'u-kevin', name: 'Kevin', cents: -30000 },
      { userId: 'u-sam', name: 'Sam', cents: -30000 },
      { userId: 'u-andre', name: 'Andre', cents: 60000 },
    ]);
  });

  test('nothing to settle with no expenses', () => {
    expect(settleUp(balances({ going: [andre, kevin], expenses: [] }))).toEqual([]);
  });
});

describe('licenseWarning', () => {
  const trip = { state: 'New York', starts_on: '2026-10-10', ends_on: '2026-10-12' };
  const today = new Date(2026, 8, 26);

  test('no warning when the trip has no state', () => {
    expect(licenseWarning([], { ...trip, state: '' }, today)).toBeNull();
  });

  test('warns when there is no license for the trip state', () => {
    expect(licenseWarning([{ state: 'New Jersey', expires_at: '2027-01-01' }], trip, today)).toMatch(/don't have a New York fishing license on file/);
  });

  test('no warning when a license covers the whole trip', () => {
    expect(licenseWarning([{ state: 'New York', expires_at: '2026-10-12' }], trip, today)).toBeNull();
  });

  test('warns when the newest license lapses before the trip ends', () => {
    expect(licenseWarning([{ state: 'New York', expires_at: '2026-10-11' }], trip, today)).toMatch(/expires on 2026-10-11, before this trip ends/);
  });

  test('says expired when it already has', () => {
    expect(licenseWarning([{ state: 'New York', expires_at: '2026-09-01' }], trip, today)).toMatch(/expired on 2026-09-01/);
  });

  test('uses the newest of several licenses for the state', () => {
    expect(licenseWarning([{ state: 'New York', expires_at: '2026-09-01' }, { state: 'New York', expires_at: '2027-09-01' }], trip, today)).toBeNull();
  });

  test('stays quiet once the trip is over', () => {
    expect(licenseWarning([], trip, new Date(2026, 9, 20))).toBeNull();
  });
});

describe('rsvpClosed', () => {
  test('open with no deadline, through the deadline day, closed the day after', () => {
    expect(rsvpClosed({ rsvp_by: null }, new Date(2026, 9, 1))).toBe(false);
    expect(rsvpClosed({ rsvp_by: '2026-10-01' }, new Date(2026, 9, 1, 23, 59))).toBe(false);
    expect(rsvpClosed({ rsvp_by: '2026-10-01' }, new Date(2026, 9, 2))).toBe(true);
  });
});

describe('catchRecap', () => {
  const c = (id, userId, name, species, length, minute) => ({ id, user_id: userId, angler_name: name, species, length_in: length, created_at: `2026-10-10T10:${String(minute).padStart(2, '0')}:00Z` });

  test('ranks anglers by fish caught, ties going to whoever got there first', () => {
    const recap = catchRecap([c('1', 'sam', 'Sam', 'Bluefish', null, 5), c('2', 'kev', 'Kevin', 'Bluefish', 20, 1), c('3', 'sam', 'Sam', 'Bluefish', null, 7), c('4', 'andre', 'Andre', 'Striped Bass', 28, 2), c('5', 'kev', 'Kevin', 'Striped Bass', 31, 9)]);
    expect(recap.total).toBe(5);
    expect(recap.leaderboard).toEqual([
      { userId: 'kev', name: 'Kevin', count: 2 },
      { userId: 'sam', name: 'Sam', count: 2 },
      { userId: 'andre', name: 'Andre', count: 1 },
    ]);
  });

  test('keeps the biggest measured fish of each species, biggest first', () => {
    const recap = catchRecap([c('1', 'kev', 'Kevin', 'Bluefish', 20, 1), c('2', 'andre', 'Andre', 'Striped Bass', 28, 2), c('3', 'kev', 'Kevin', 'Striped Bass', '31.5', 3), c('4', 'sam', 'Sam', 'Bluefish', null, 4)]);
    expect(recap.biggest.map((b) => [b.species, b.angler_name])).toEqual([['Striped Bass', 'Kevin'], ['Bluefish', 'Kevin']]);
  });

  test('is empty with no catches', () => {
    expect(catchRecap([])).toEqual({ total: 0, leaderboard: [], biggest: [] });
  });
});

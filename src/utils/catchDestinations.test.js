import { checkCatch, dateWithin, eligibleDestinations, monthFromDate, sizeLabel } from './catchDestinations';

const derby = { id: 't1', name: 'Fluke Derby', unit: 'in', starts_on: '2026-07-01', ends_on: '2026-07-31' };
const heavy = { id: 't2', name: 'Tuna Shootout', unit: 'lb', starts_on: '2026-07-10', ends_on: '2026-07-12' };
const montauk = { id: 'trip-1', name: 'Montauk run', starts_on: '2026-07-10', ends_on: '2026-07-12', attendees: [{ user_id: 'me' }] };
const notMine = { id: 'trip-2', name: 'Their trip', starts_on: '2026-07-01', ends_on: '2026-07-31', attendees: [{ user_id: 'kevin' }] };
const none = { fishYear: false, personalBest: false, tournamentIds: [], tripIds: [] };

test('a catch date decides which tournaments and trips it can go to', () => {
  const on11th = eligibleDestinations({ date: '2026-07-11', fishYear: 2026, tournaments: [derby, heavy], trips: [montauk, notMine], userId: 'me' });
  expect(on11th.fishYear).toBe(true);
  expect(on11th.tournaments.map((t) => t.id)).toEqual(['t1', 't2']);
  expect(on11th.trips.map((t) => t.id)).toEqual(['trip-1']);

  const on20th = eligibleDestinations({ date: '2026-07-20', fishYear: 2026, tournaments: [derby, heavy], trips: [montauk], userId: 'me' });
  expect(on20th.tournaments.map((t) => t.id)).toEqual(['t1']);
  expect(on20th.trips).toEqual([]);

  expect(eligibleDestinations({ date: '2025-12-31', fishYear: 2026 }).fishYear).toBe(false);
});

test('months and sizes', () => {
  expect(monthFromDate('2026-03-15')).toBe('March');
  expect(sizeLabel(38, 12.5)).toBe('38 in · 12.5 lb');
  expect(sizeLabel(null, 12)).toBe('12 lb');
  expect(sizeLabel(null, null)).toBe('');
});

test('opening from a tournament or trip outside its dates starts the date inside them', () => {
  expect(dateWithin('2026-08-02', '2026-07-01', '2026-07-31')).toBe('2026-07-31');
  expect(dateWithin('2026-06-20', '2026-07-01', '2026-07-31')).toBe('2026-07-01');
  expect(dateWithin('2026-07-15', '2026-07-01', '2026-07-31')).toBe('2026-07-15');
});

describe('checkCatch', () => {
  test('needs a species and somewhere to count', () => {
    expect(checkCatch({ species: '', picks: { ...none, fishYear: true } }).error).toMatch(/species/);
    expect(checkCatch({ species: 'Carp', picks: none }).error).toMatch(/at least one/);
    expect(checkCatch({ species: 'Carp', picks: { ...none, fishYear: true } })).toMatchObject({ lengthIn: null, weightLb: null, tournaments: [] });
  });

  test('a tournament needs a size in its own unit', () => {
    const picks = { ...none, tournamentIds: ['t1', 't2'] };
    expect(checkCatch({ species: 'Fluke', picks, tournaments: [derby, heavy], length: '22' }).error).toMatch(/Tuna Shootout is measured in pounds/);
    expect(checkCatch({ species: 'Fluke', picks, tournaments: [derby, heavy], weight: '5' }).error).toMatch(/Fluke Derby is measured in inches/);
    expect(checkCatch({ species: 'Fluke', picks, tournaments: [derby, heavy], length: '22', weight: '5' })).toMatchObject({ lengthIn: 22, weightLb: 5 });
  });

  test('rejects a size that is not a positive number', () => {
    expect(checkCatch({ species: 'Carp', picks: { ...none, fishYear: true }, length: 'big' }).error).toMatch(/Length/);
    expect(checkCatch({ species: 'Carp', picks: { ...none, fishYear: true }, weight: '-2' }).error).toMatch(/Weight/);
  });
});

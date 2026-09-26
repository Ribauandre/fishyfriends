import { daysBetween, homeAgenda } from './homeAgenda';

const base = { today: '2026-07-20', userId: 'me', fishYear: 2026, profile: { avatar_url: 'a.jpg', home_water: 'Barnegat Bay' } };
const keys = (items) => items.map((item) => item.key);

test('days between two local dates', () => {
  expect(daysBetween('2026-07-20', '2026-07-25')).toBe(5);
  expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
});

test('nothing to do is an empty list', () => {
  expect(homeAgenda({ ...base, myFishYearCatches: [{ month: 'July' }] })).toEqual([]);
});

test('asks for this month\'s Fish Year fish until there is one, and it opens the catch form', () => {
  const [item] = homeAgenda(base);
  expect(item).toMatchObject({ key: 'fish-year', title: 'No fish logged for July yet', action: 'log' });
  expect(item.detail).toMatch(/11 days left/);
  expect(homeAgenda({ ...base, today: '2027-01-05' }).map((i) => i.key)).not.toContain('fish-year');
});

test('map invites, your trips, RSVPs closing soon and running tournaments', () => {
  const items = homeAgenda({
    ...base,
    myFishYearCatches: [{ month: 'July' }],
    invites: [{ id: 'i1', inviterName: 'Kevin', map_name: 'Backwater Spots' }],
    trips: [
      { id: 'mine', name: 'Montauk run', starts_on: '2026-07-25', ends_on: '2026-07-27', location: 'Montauk', attendees: [{ user_id: 'me' }] },
      { id: 'past', name: 'Old trip', starts_on: '2026-06-01', ends_on: '2026-06-02', attendees: [{ user_id: 'me' }] },
      { id: 'open', name: 'Canyon trip', starts_on: '2026-08-10', ends_on: '2026-08-11', rsvp_by: '2026-07-22', created_by: 'kevin', attendees: [] },
      { id: 'later', name: 'Fall trip', starts_on: '2026-10-10', ends_on: '2026-10-11', rsvp_by: '2026-09-30', created_by: 'kevin', attendees: [] },
    ],
    tournaments: [
      { id: 't1', name: 'Fluke Derby', starts_on: '2026-07-01', ends_on: '2026-07-31' },
      { id: 't2', name: 'Spring Classic', starts_on: '2026-04-01', ends_on: '2026-04-30' },
    ],
    myTournamentIds: [],
  });
  expect(keys(items)).toEqual(['invite-i1', 'trip-mine', 'rsvp-open', 'tournament-t1']);
  expect(items[0]).toMatchObject({ title: 'Kevin shared a waypoint map', to: '/waypoints' });
  expect(items[1]).toMatchObject({ title: 'Montauk run in 5 days', to: '/trips/mine' });
  expect(items[2].title).toBe('RSVP for Canyon trip closes in 2 days');
  expect(items[3]).toMatchObject({ title: 'Fluke Derby ends in 11 days', detail: 'You haven\'t entered yet.' });
});

test('a trip that is on says so, and an entered tournament says you are on the board', () => {
  const items = homeAgenda({
    ...base,
    myFishYearCatches: [{ month: 'July' }],
    trips: [{ id: 'now', name: 'Montauk run', starts_on: '2026-07-19', ends_on: '2026-07-21', attendees: [{ user_id: 'me' }] }],
    tournaments: [{ id: 't1', name: 'Fluke Derby', starts_on: '2026-07-01', ends_on: '2026-07-20' }],
    myTournamentIds: ['t1'],
  });
  expect(items.map((item) => item.title)).toEqual(['Montauk run is on', 'Fluke Derby ends today']);
  expect(items[1].detail).toMatch(/on the board/);
});

test('an unfinished profile gets a nudge', () => {
  expect(keys(homeAgenda({ ...base, myFishYearCatches: [{ month: 'July' }], profile: { home_water: '' } }))).toEqual(['profile']);
});

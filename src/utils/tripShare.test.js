import { messagesUrl, shortDate, tripDates, tripShareText, tripUrl } from './tripShare';

const trip = { id: 'trip-1', name: 'Montauk run', location: 'Montauk Point', state: 'New York', starts_on: '2026-10-10', ends_on: '2026-10-12', target_species: ['Striped Bass', 'Bluefish'], rsvp_by: '2026-10-01' };

test('dates read like a text message', () => {
  expect(shortDate('2026-10-01')).toBe('Oct 1');
  expect(tripDates('2026-10-10', '2026-10-12')).toBe('Oct 10–12');
  expect(tripDates('2026-10-30', '2026-11-02')).toBe('Oct 30 – Nov 2');
  expect(tripDates('2026-10-10', '2026-10-10')).toBe('Oct 10');
});

test('the message carries the details someone needs to decide', () => {
  expect(tripShareText(trip, { perPersonCents: 28000, spotsLeft: 2 })).toBe(
    'Montauk run · Oct 10–12 · Montauk Point, New York\n'
    + 'Going after Striped Bass, Bluefish. About $280.00 a person so far. 2 spots left. RSVP by Oct 1.\n'
    + 'Who\'s in?',
  );
});

test('leaves out what isn\'t known, and says when it\'s full', () => {
  const bare = { id: 't', name: 'Canal night', location: '', state: '', starts_on: '2026-08-01', ends_on: '2026-08-01' };
  expect(tripShareText(bare)).toBe('Canal night · Aug 1\nWho\'s in?');
  expect(tripShareText(bare, { spotsLeft: 0 })).toMatch(/Full, but there's a waitlist\./);
});

test('the Messages link opens a new text with the message and the link filled in', () => {
  const url = tripUrl('https://www.fishyfriends.club', 'trip-1');
  expect(url).toBe('https://www.fishyfriends.club/trips/trip-1');
  expect(messagesUrl('Montauk run · Oct 10–12\nWho\'s in?', url)).toBe(`sms:?&body=${encodeURIComponent('Montauk run · Oct 10–12\nWho\'s in?\nhttps://www.fishyfriends.club/trips/trip-1')}`);
});

import timeAgo from './timeAgo';

const NOW = new Date('2026-03-15T12:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function minutesAgo(minutes) {
  return new Date(NOW.getTime() - minutes * 60000).toISOString();
}

test('a moment ago reads as "just now"', () => {
  expect(timeAgo(minutesAgo(0))).toBe('just now');
});

test('under an hour reads in minutes', () => {
  expect(timeAgo(minutesAgo(45))).toBe('45m ago');
});

test('under a day reads in hours', () => {
  expect(timeAgo(minutesAgo(60 * 5))).toBe('5h ago');
});

test('under a week reads in days', () => {
  expect(timeAgo(minutesAgo(60 * 24 * 3))).toBe('3d ago');
});

test('under five weeks reads in weeks', () => {
  expect(timeAgo(minutesAgo(60 * 24 * 14))).toBe('2w ago');
});

test('far enough back reads in months', () => {
  expect(timeAgo(minutesAgo(60 * 24 * 90))).toBe('3mo ago');
});

import { bestStreak, currentStreak } from './fishYearStreak';

test('bestStreak finds the longest consecutive run anywhere in the year', () => {
  // Jan, Feb, Mar (0-2) then a gap then May, Jun, Jul, Aug (4-7)
  expect(bestStreak([0, 1, 2, 4, 5, 6, 7])).toBe(4);
});

test('bestStreak is 0 with no catches', () => {
  expect(bestStreak([])).toBe(0);
});

test('bestStreak counts a single caught month as a streak of 1', () => {
  expect(bestStreak([5])).toBe(1);
});

test('currentStreak counts back from the reference month while unbroken', () => {
  // Caught Jun, Jul, Aug (5-7); reference is August (7)
  expect(currentStreak([5, 6, 7], 7)).toBe(3);
});

test('currentStreak is 0 when the reference month itself was not caught', () => {
  expect(currentStreak([5, 6], 7)).toBe(0);
});

test('currentStreak stops at a gap rather than counting an earlier run', () => {
  // Caught Jan-Mar (0-2), gap, then June (5); reference is June
  expect(currentStreak([0, 1, 2, 5], 5)).toBe(1);
});

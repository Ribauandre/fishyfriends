import { periodFor, msUntilNextPeriod, isDark, PERIODS } from './gameClock';

const at = (hour, minute = 0) => new Date(2026, 5, 15, hour, minute, 0);

test('the real clock decides the period on the dock', () => {
  expect(periodFor(at(5))).toBe('dawn');
  expect(periodFor(at(6, 59))).toBe('dawn');
  expect(periodFor(at(7))).toBe('day');
  expect(periodFor(at(12))).toBe('day');
  expect(periodFor(at(17, 59))).toBe('day');
  expect(periodFor(at(18))).toBe('dusk');
  expect(periodFor(at(20, 29))).toBe('dusk');
  expect(periodFor(at(20, 30))).toBe('night');
  expect(periodFor(at(23))).toBe('night');
  expect(periodFor(at(2))).toBe('night');
  expect(periodFor(at(4, 59))).toBe('night');
  PERIODS.forEach((period) => expect(typeof period).toBe('string'));
});

test('dusk and night are dark; dawn and day are not', () => {
  expect(isDark('night')).toBe(true);
  expect(isDark('dusk')).toBe(true);
  expect(isDark('dawn')).toBe(false);
  expect(isDark('day')).toBe(false);
});

test('the scene knows exactly how long until the next re-tint', () => {
  expect(msUntilNextPeriod(at(6, 30))).toBe(30 * 60 * 1000);
  expect(msUntilNextPeriod(at(17, 0))).toBe(60 * 60 * 1000);
  expect(msUntilNextPeriod(at(20, 0))).toBe(30 * 60 * 1000);
  // Late at night the next boundary is 5am tomorrow.
  expect(msUntilNextPeriod(at(23, 0))).toBe(6 * 60 * 60 * 1000);
});

import { derbyFor, weekKey, weekStart, rankDerby, DERBY_POOL, dateOfWeekKey, previousDerby, isChampion } from './gameDerby';
import { BIOMES } from './gameBiomes';

test('the week is ISO and Monday-based, in UTC', () => {
  expect(weekKey(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
  expect(weekKey(new Date('2026-09-09T12:00:00Z'))).toBe('2026-W37');
  expect(weekStart(new Date('2026-09-09T12:00:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
  expect(weekStart(new Date('2026-09-13T23:59:00Z')).toISOString()).toBe('2026-09-07T00:00:00.000Z');
  expect(weekStart(new Date('2026-09-14T00:00:00Z')).toISOString()).toBe('2026-09-14T00:00:00.000Z');
});

test('everyone gets the same target all week, from open grounds only, and it changes next week', () => {
  const monday = derbyFor(new Date('2026-09-07T03:00:00Z'));
  const sunday = derbyFor(new Date('2026-09-13T22:00:00Z'));
  expect(sunday.species).toBe(monday.species);
  expect(DERBY_POOL).toContain(monday.species);
  expect(DERBY_POOL).not.toContain('swordfish');
  expect(monday.grounds.length).toBeGreaterThan(0);
  monday.grounds.forEach((ground) => expect(BIOMES[ground].species).toContain(monday.species));
  const targets = new Set(Array.from({ length: 12 }, (_, week) => derbyFor(new Date(Date.UTC(2026, 0, 5 + week * 7))).species));
  expect(targets.size).toBeGreaterThan(3);
});

test('the leaderboard keeps one row per angler, biggest fish first, ties to the earlier catch', () => {
  const rows = [
    { id: 'a', user_id: 'u1', angler_name: 'Andre', size_in: '21.5', created_at: '2026-09-08T10:00:00Z' },
    { id: 'b', user_id: 'u2', angler_name: 'Kevin', size_in: '24.0', created_at: '2026-09-08T11:00:00Z' },
    { id: 'c', user_id: 'u1', angler_name: 'Andre', size_in: '26.0', created_at: '2026-09-09T10:00:00Z' },
    { id: 'd', user_id: 'u3', angler_name: 'Sam', size_in: '24.0', created_at: '2026-09-07T09:00:00Z' },
  ];
  const ranked = rankDerby(rows);
  expect(ranked.map((row) => [row.anglerName, row.sizeIn, row.catchId])).toEqual([['Andre', 26, 'c'], ['Sam', 24, 'd'], ['Kevin', 24, 'b']]);
});

test('a stored week key turns back into its Monday, and last week\'s derby is the one that pays out', () => {
  expect(dateOfWeekKey('2026-W37').toISOString()).toBe('2026-09-07T00:00:00.000Z');
  expect(dateOfWeekKey('2026-W01').toISOString()).toBe('2025-12-29T00:00:00.000Z');
  expect(dateOfWeekKey('nope')).toBeNull();
  const wednesday = new Date('2026-09-09T12:00:00Z');
  const last = previousDerby(wednesday);
  expect(last.key).toBe('2026-W36');
  expect(last.since).toBe('2026-08-31T00:00:00.000Z');
  expect(last.until).toBe('2026-09-07T00:00:00.000Z');
  expect(last.species).toBe(derbyFor(new Date('2026-09-02T00:00:00Z')).species);
});

test('the pennant is worn only during the week right after the win', () => {
  const wins = ['2026-W36'];
  expect(isChampion(wins, new Date('2026-09-09T12:00:00Z'))).toBe(true);
  expect(isChampion(wins, new Date('2026-09-16T12:00:00Z'))).toBe(false);
  expect(isChampion([], new Date('2026-09-09T12:00:00Z'))).toBe(false);
});

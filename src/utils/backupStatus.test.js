import { backupConcern, backupDay, backupSize, BACKUP_STALE_DAYS } from './backupStatus';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
const key = (days) => ({ fingerprint: 'ab'.repeat(32), createdAt: daysAgo(days) });
const run = (days) => ({ finishedAt: daysAgo(days), rows: 10, bytes: 2048, tables: 3, fingerprint: 'ab'.repeat(32) });

describe('backupConcern', () => {
  test('nothing to go on is unknown, and no key is no backups', () => {
    expect(backupConcern(null, NOW)).toBe('unknown');
    expect(backupConcern(undefined, NOW)).toBe('unknown');
    expect(backupConcern({ key: null, lastRun: null, runs30d: 0 }, NOW)).toBe('no-key');
  });

  test('a new key is given a few nights before "never" is said', () => {
    expect(backupConcern({ key: key(0.5), lastRun: null }, NOW)).toBe('waiting');
    expect(backupConcern({ key: key(BACKUP_STALE_DAYS - 0.1), lastRun: null }, NOW)).toBe('waiting');
    expect(backupConcern({ key: key(BACKUP_STALE_DAYS + 0.1), lastRun: null }, NOW)).toBe('never');
  });

  test('one missed night is fine; several is stopped', () => {
    expect(backupConcern({ key: key(40), lastRun: run(0.2) }, NOW)).toBe('fine');
    expect(backupConcern({ key: key(40), lastRun: run(2) }, NOW)).toBe('fine');
    expect(backupConcern({ key: key(40), lastRun: run(BACKUP_STALE_DAYS + 0.1) }, NOW)).toBe('stale');
  });

  test('a key replaced today doesn\'t hide that the backups stopped last week', () => {
    expect(backupConcern({ key: key(0), lastRun: run(8) }, NOW)).toBe('stale');
  });

  test('dates that can\'t be read are not mistaken for recent ones', () => {
    expect(backupConcern({ key: { fingerprint: 'x', createdAt: 'yesterday-ish' }, lastRun: null }, NOW)).toBe('waiting');
    expect(backupConcern({ key: key(40), lastRun: { finishedAt: '' } }, NOW)).toBe('never');
  });
});

test('a backup\'s day and size, in words', () => {
  expect(backupDay('2026-11-25T08:23:10Z')).toMatch(/Nov 2\d, 2026/);
  expect(backupDay('')).toBe('');
  expect(backupDay(undefined)).toBe('');
  expect(backupSize(7054)).toBe('7 KB');
  expect(backupSize(10)).toBe('1 KB');
  expect(backupSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
  expect(backupSize(undefined)).toBe('1 KB');
});

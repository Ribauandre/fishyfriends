import { licenseStatus, EXPIRING_SOON_DAYS } from './licenseStatus';

const today = new Date(2026, 5, 15);

test('is valid when well beyond the expiring-soon window', () => {
  expect(licenseStatus('2026-12-31', today).status).toBe('valid');
});

test('is expiring right at the edge of the window', () => {
  const result = licenseStatus('2026-07-15', today);
  expect(result.status).toBe('expiring');
  expect(result.daysLeft).toBe(EXPIRING_SOON_DAYS);
});

test('is valid one day past the edge of the window', () => {
  expect(licenseStatus('2026-07-16', today).status).toBe('valid');
});

test('is expiring today', () => {
  const result = licenseStatus('2026-06-15', today);
  expect(result.status).toBe('expiring');
  expect(result.label).toMatch(/expires today/i);
});

test('is expired once the date has passed', () => {
  const result = licenseStatus('2026-06-01', today);
  expect(result.status).toBe('expired');
  expect(result.daysLeft).toBeLessThan(0);
});

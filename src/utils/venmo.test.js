import { normalizeVenmoHandle, venmoPayUrl } from './venmo';

test.each([
  ['Andre-Ribau', 'Andre-Ribau'],
  ['@Andre-Ribau', 'Andre-Ribau'],
  ['  @andre_r  ', 'andre_r'],
  ['https://venmo.com/u/Andre-Ribau', 'Andre-Ribau'],
  ['https://account.venmo.com/u/Andre-Ribau', 'Andre-Ribau'],
  ['', ''],
])('normalizes %p', (input, expected) => {
  const result = normalizeVenmoHandle(input);
  if (expected === null) expect(result.error).toBeTruthy();
  else expect(result).toEqual({ handle: expected });
});

test.each(['abc', 'has space', 'a'.repeat(31), 'semi;colon', 'javascript:alert(1)'])('rejects %p', (input) => {
  expect(normalizeVenmoHandle(input).error).toMatch(/5–30 letters/);
});

test('builds a pay link with the amount and an encoded note', () => {
  expect(venmoPayUrl('Andre-Ribau', 16163, 'Montauk run & bait')).toBe('https://venmo.com/Andre-Ribau?txn=pay&amount=161.63&note=Montauk%20run%20%26%20bait');
});

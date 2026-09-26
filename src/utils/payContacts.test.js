import { normalizeUsPhone, normalizeZelle, formatPhone, displayZelle, appleCashMessageUrl } from './payContacts';

describe('normalizeUsPhone', () => {
  test.each([
    ['(555) 555-0101', '+15555550101'],
    ['555.555.0101', '+15555550101'],
    ['+1 555 555 0101', '+15555550101'],
    ['15555550101', '+15555550101'],
    ['', ''],
  ])('%p -> %p', (input, phone) => {
    expect(normalizeUsPhone(input)).toEqual({ phone });
  });

  test.each(['555-0101', '555555010199', '+44 20 7946 0958', 'call me', '555-555-0101 ext 2'])('rejects %p', (input) => {
    expect(normalizeUsPhone(input).error).toMatch(/10-digit US phone/);
  });
});

describe('normalizeZelle', () => {
  test('takes an email, lower-cased', () => {
    expect(normalizeZelle(' Andre@Example.com ')).toEqual({ zelle: 'andre@example.com' });
  });

  test('takes a US phone number', () => {
    expect(normalizeZelle('(555) 555-0101')).toEqual({ zelle: '+15555550101' });
  });

  test('empty clears it', () => {
    expect(normalizeZelle('')).toEqual({ zelle: '' });
  });

  test.each(['andre@', 'not an email', '12345'])('rejects %p', (input) => {
    expect(normalizeZelle(input).error).toMatch(/email or US phone/);
  });
});

test('formats phones for display and leaves emails alone', () => {
  expect(formatPhone('+15555550101')).toBe('(555) 555-0101');
  expect(displayZelle('+15555550101')).toBe('(555) 555-0101');
  expect(displayZelle('andre@example.com')).toBe('andre@example.com');
});

test('the Apple Cash link opens Messages to them with what the money is for', () => {
  expect(appleCashMessageUrl('+15555550101', 28000, 'Montauk run')).toBe('sms:+15555550101&body=Sending%20%24280.00%20by%20Apple%20Cash%20for%20Montauk%20run');
});

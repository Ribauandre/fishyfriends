import { passwordProblem, breachCount, breachMessage, MIN_PASSWORD_LENGTH } from './passwordCheck';

const { webcrypto } = require('crypto');
const { TextEncoder: NodeTextEncoder } = require('util');

describe('passwordProblem', () => {
  test('a long password with nothing of the account in it is fine', () => {
    expect(passwordProblem('tight-lines-42', { email: 'andre@example.com', displayName: 'Andre' })).toBe('');
    expect(passwordProblem('correct horse battery staple')).toBe('');
  });

  test('too short is refused, with the length it has to be', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(passwordProblem('hunter2')).toMatch(/at least 10 characters/i);
    expect(passwordProblem('')).toMatch(/at least 10 characters/i);
    expect(passwordProblem(undefined)).toMatch(/at least 10 characters/i);
  });

  test('one or two characters repeated is refused however long it is', () => {
    expect(passwordProblem('aaaaaaaaaaaa')).toMatch(/repeated/i);
    expect(passwordProblem('abababababab')).toMatch(/repeated/i);
  });

  test('a password built from the name or the email is refused', () => {
    expect(passwordProblem('Andre2026!!!!', { email: 'someone@example.com', displayName: 'Andre' })).toMatch(/name or email/i);
    expect(passwordProblem('kevinsmith-fish', { email: 'KevinSmith@example.com', displayName: 'Kev' })).toMatch(/name or email/i);
    // A three-letter name is in too many ordinary words to hold against anyone.
    expect(passwordProblem('keyboard-walrus', { email: 'k@example.com', displayName: 'Key' })).toBe('');
  });
});

describe('breachCount', () => {
  const RealCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
  const RealEncoder = global.TextEncoder;
  beforeEach(() => {
    Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
    global.TextEncoder = NodeTextEncoder;
  });
  afterEach(() => {
    if (RealCrypto) Object.defineProperty(window, 'crypto', RealCrypto); else delete window.crypto;
    global.TextEncoder = RealEncoder;
  });

  // SHA-1('password') = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const PREFIX = '5BAA6';
  const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
  const answer = (body, ok = true) => jest.fn(async () => ({ ok, text: async () => body }));

  test('sends only the first five characters of the hash, and asks for padding', async () => {
    const fetchImpl = answer(`0018A45C4D1DEF81644B54AB7F969B88D65:9\r\n${SUFFIX}:52256179\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2`);
    await expect(breachCount('password', { fetchImpl })).resolves.toBe(52256179);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(url).not.toContain(SUFFIX);
    expect(options.headers).toEqual({ 'Add-Padding': 'true' });
    expect(options.body).toBeUndefined();
  });

  test('a password that is not in the list is a zero, and a padding row is not a hit', async () => {
    await expect(breachCount('password', { fetchImpl: answer('0018A45C4D1DEF81644B54AB7F969B88D65:9\r\n00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2') })).resolves.toBe(0);
    await expect(breachCount('password', { fetchImpl: answer(`${SUFFIX}:0`) })).resolves.toBe(0);
  });

  test('when it can\'t be checked the answer is null, never an exception', async () => {
    await expect(breachCount('password', { fetchImpl: answer('', false) })).resolves.toBeNull();
    await expect(breachCount('password', { fetchImpl: jest.fn().mockRejectedValue(new Error('offline')) })).resolves.toBeNull();
    delete window.crypto;
    await expect(breachCount('password', { fetchImpl: answer(`${SUFFIX}:5`) })).resolves.toBeNull();
  });

  test('says how many times, in words for the form', () => {
    expect(breachMessage(1)).toMatch(/\(1 time\)/);
    expect(breachMessage(52256179)).toMatch(/52,256,179 times/);
  });
});

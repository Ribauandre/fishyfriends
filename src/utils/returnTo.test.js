import { rememberReturnTo, safePath, takeReturnTo } from './returnTo';

beforeEach(() => window.localStorage.clear());

test('only in-app paths are kept', () => {
  expect(safePath('/trips/t1?x=1#y')).toBe('/trips/t1?x=1#y');
  expect(safePath('//evil.example/phish')).toBeNull();
  expect(safePath('https://evil.example')).toBeNull();
  expect(safePath('/account')).toBeNull();
  expect(safePath('/')).toBeNull();
  expect(safePath(undefined)).toBeNull();
});

test('a remembered link is handed back once, then forgotten', () => {
  rememberReturnTo('/trips/t1', 1000);
  expect(takeReturnTo(2000)).toBe('/trips/t1');
  expect(takeReturnTo(3000)).toBeNull();
});

test('an old one expires instead of surprising someone days later', () => {
  rememberReturnTo('/trips/t1', 0);
  expect(takeReturnTo(25 * 60 * 60 * 1000)).toBeNull();
});

import { safePath } from './returnTo';
import { appleCashMessageUrl } from './payContacts';
import { venmoPayUrl } from './venmo';
import { webAddress } from '../TripDetail';

// Links built from something another person typed (or wrote straight through the API,
// past the forms that check it). Each of these only ever makes a link of one known shape.

describe('where sign-in sends you back to', () => {
  test('an in-app path is kept', () => {
    expect(safePath('/trips/abc?x=1#money')).toBe('/trips/abc?x=1#money');
  });

  test('anything a browser could read as another site is dropped', () => {
    for (const path of ['//evil.example', '/\\evil.example', '/\\/evil.example', '/trips\\..\\evil', 'https://evil.example', 'javascript:alert(1)', '', null, undefined, 42]) {
      expect(safePath(path)).toBeNull();
    }
  });
});

describe('a trip\'s listing link', () => {
  test('a web address is a link', () => {
    expect(webAddress('https://www.airbnb.com/rooms/123')).toBe('https://www.airbnb.com/rooms/123');
    expect(webAddress('http://example.com/cabin')).toBe('http://example.com/cabin');
  });

  test('nothing else is', () => {
    for (const value of ['javascript:alert(document.cookie)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', 'airbnb.com/rooms/1', ' https://example.com', 'https://exa mple.com', '', null, undefined]) {
      expect(webAddress(value)).toBeNull();
    }
  });
});

describe('the Apple Cash link', () => {
  test('a number in the shape the app saves opens a Messages thread to it', () => {
    expect(appleCashMessageUrl('+15551234567', 4250, 'Montauk')).toBe(`sms:+15551234567&body=${encodeURIComponent('Sending $42.50 by Apple Cash for Montauk')}`);
  });

  test('anything else makes no link', () => {
    for (const phone of ['+15551234567,+19005550100', '+15551234567&body=send%20more', '5551234567', '+1555123456', 'tel:+15551234567', 'javascript:alert(1)', '', null, undefined]) {
      expect(appleCashMessageUrl(phone, 4250, 'Montauk')).toBeNull();
    }
  });

  test('the trip name can\'t add to the address', () => {
    expect(appleCashMessageUrl('+15551234567', 100, 'x&body=other?to=someone')).not.toContain('&body=other');
  });
});

test('a Venmo name is one path segment, whatever it contains', () => {
  const url = new URL(venmoPayUrl('kev/../evil?x=1#frag', 4250, 'Montauk: trip share'));
  expect(url.origin).toBe('https://venmo.com');
  expect(url.pathname).toBe('/kev%2F..%2Fevil%3Fx%3D1%23frag');
  expect(url.searchParams.get('amount')).toBe('42.50');
  expect(url.hash).toBe('');
});

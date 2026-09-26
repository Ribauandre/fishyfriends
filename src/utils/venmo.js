// Venmo usernames are 5–30 letters, numbers, hyphens or underscores; people often type
// them with the "@" or paste their profile link, so both are accepted and stripped.
const HANDLE = /^[A-Za-z0-9_-]{5,30}$/;

export function normalizeVenmoHandle(input) {
  const trimmed = String(input ?? '').trim().replace(/^https?:\/\/([a-z]+\.)?venmo\.com\/(u\/)?/i, '').replace(/^@/, '').replace(/\/$/, '');
  if (!trimmed) return { handle: '' };
  if (!HANDLE.test(trimmed)) return { error: 'A Venmo username is 5–30 letters, numbers, hyphens or underscores.' };
  return { handle: trimmed };
}

// Opens Venmo (the app on a phone) with the payment filled in; the payer still confirms it
// there, and nothing about the payment passes through this app.
export function venmoPayUrl(handle, cents, note) {
  const amount = (cents / 100).toFixed(2);
  return `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`;
}

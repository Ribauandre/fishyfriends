// How urgently a license needs attention, driven off calendar days rather than a fixed
// cutoff so "expiring soon" reads the same regardless of when someone opens the app.
export const EXPIRING_SOON_DAYS = 30;

function daysUntil(expiresAt, today = new Date()) {
  const expiry = new Date(`${expiresAt}T00:00:00`);
  const reference = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiry - reference) / (24 * 60 * 60 * 1000));
}

export function licenseStatus(expiresAt, today = new Date()) {
  const daysLeft = daysUntil(expiresAt, today);
  if (daysLeft < 0) return { status: 'expired', daysLeft, label: 'Expired' };
  if (daysLeft === 0) return { status: 'expiring', daysLeft, label: 'Expires today' };
  if (daysLeft <= EXPIRING_SOON_DAYS) return { status: 'expiring', daysLeft, label: `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` };
  return { status: 'valid', daysLeft, label: `Valid through ${expiresAt}` };
}

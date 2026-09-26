// Zelle and Apple Cash have no link that fills in a payment, so the app stores how to reach
// someone and helps with the rest: Zelle details to copy into a bank app, and a Messages
// thread to open for Apple Cash. Phone numbers are US-only and kept as +1XXXXXXXXXX.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeUsPhone(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { phone: '' };
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10 || /[^\d\s()+.-]/.test(raw)) return { error: 'Enter a 10-digit US phone number.' };
  return { phone: `+1${digits}` };
}

export function normalizeZelle(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { zelle: '' };
  if (raw.includes('@')) return EMAIL.test(raw) ? { zelle: raw.toLowerCase() } : { error: 'Enter the email or US phone number your Zelle uses.' };
  const phone = normalizeUsPhone(raw);
  return phone.error ? { error: 'Enter the email or US phone number your Zelle uses.' } : { zelle: phone.phone };
}

export function formatPhone(e164) {
  const digits = String(e164 || '').replace(/^\+1/, '');
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : e164;
}

export function displayZelle(zelle) {
  return zelle?.startsWith('+1') ? formatPhone(zelle) : zelle;
}

// Opens a Messages thread with them (iMessage on an iPhone), with a line saying what the
// money is for; the payer then sends it with Apple Cash from that thread.
export function appleCashMessageUrl(phone, cents, tripName) {
  const body = `Sending $${(cents / 100).toFixed(2)} by Apple Cash for ${tripName}`;
  return `sms:${phone}&body=${encodeURIComponent(body)}`;
}

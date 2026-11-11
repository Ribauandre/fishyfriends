// What a new password has to get past before it is sent anywhere: long enough, not built from
// the account's own name or address, and not one that is already sitting in breach dumps.
// None of this replaces the server's own rules; it stops an honest person choosing a password
// that a list of ten thousand guesses would find.

export const MIN_PASSWORD_LENGTH = 10;

// '' when the password is fine to try, else what is wrong with it, in words for the form.
export function passwordProblem(password, { email = '', displayName = '' } = {}) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words works well.`;
  if (new Set(value.toLowerCase()).size < 4) return 'That\'s one or two characters repeated. Pick something harder to guess.';
  const lowered = value.toLowerCase();
  const own = [String(email).split('@')[0], String(displayName)].map((part) => part.trim().toLowerCase()).filter((part) => part.length >= 4);
  if (own.some((part) => lowered.includes(part))) return 'Don\'t build it from your name or email: that\'s the first thing anyone would try.';
  return '';
}

async function sha1Hex(text) {
  const digest = await window.crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// How many times this password appears in known data breaches, by Have I Been Pwned's range
// lookup: the password is hashed here, and only the first five characters of the hash are
// sent — the answer is every breached hash starting with those five (hundreds of them, padded
// with decoys), and the comparison happens on this device. Neither the password nor its hash
// ever leaves it. 0 is "not found"; null is "couldn't be checked" (offline, blocked, a browser
// with no crypto), which callers treat as no objection rather than as a failure to sign in.
export async function breachCount(password, { fetchImpl } = {}) {
  try {
    const hash = await sha1Hex(String(password));
    const request = fetchImpl || window.fetch.bind(window);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 6000) : null;
    let response;
    try {
      response = await request(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' }, ...(controller ? { signal: controller.signal } : {}) });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!response.ok) return null;
    const suffix = hash.slice(5);
    const match = (await response.text()).split('\n').find((line) => line.slice(0, suffix.length).toUpperCase() === suffix);
    return match ? Number(match.split(':')[1]) || 0 : 0;
  } catch (lookupError) {
    return null;
  }
}

export function breachMessage(count) {
  return `That password has turned up in data breaches (${count.toLocaleString()} time${count === 1 ? '' : 's'}), so it's on the lists people try first. Pick another.`;
}

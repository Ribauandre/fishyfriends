// The club's backup key, made in the admin's browser.
//
// The nightly backups are kept where anyone with a GitHub account can download them, so
// each is sealed to a key pair made here (supabase/backup/format.mjs has the envelope). The
// PUBLIC half goes to the database, where the nightly job reads it and encrypts to it. The
// PRIVATE half is shown once, to be saved by the admin, and is never sent anywhere: not to
// the database, not to GitHub. Whoever holds it can read every backup made with it, and
// without it a backup is noise — to the club as much as to anyone else, so losing it means
// the backups made so far can't be opened.
//
// Everything here is the browser's own cryptography (WebCrypto): RSA-OAEP with SHA-256, the
// same pieces Node and OpenSSL implement, in the standard PEM text form. No imports, on
// purpose: supabase/backup/drill.mjs loads this very file to prove that a key made here
// opens a backup made there.

export const BACKUP_KEY_BITS = 4096;

// The browser's global object — or Node's, when the restore drill loads this file.
const root = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : {};

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return root.btoa(binary);
}

const pem = (label, buffer) => `-----BEGIN ${label}-----\n${base64(buffer).match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

// { publicKey, privateKey } as PEM text and the key's fingerprint: SHA-256 of the public key
// in its standard binary form, the same sixty-four characters the database works out when
// the key is saved and the nightly job prints.
export async function makeBackupKey({ bits = BACKUP_KEY_BITS, subtle = root.crypto?.subtle } = {}) {
  if (!subtle) throw new Error('This browser can\'t make a key. Try a current Safari, Chrome or Firefox.');
  const pair = await subtle.generateKey({ name: 'RSA-OAEP', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const spki = await subtle.exportKey('spki', pair.publicKey);
  const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey);
  return { publicKey: pem('PUBLIC KEY', spki), privateKey: pem('PRIVATE KEY', pkcs8), fingerprint: hex(await subtle.digest('SHA-256', spki)) };
}

// The first sixteen characters, in fours: enough to tell two keys apart by eye.
export const shortFingerprint = (fingerprint) => String(fingerprint || '').slice(0, 16).match(/.{1,4}/g)?.join(' ') || '';

export const keyFileName = (fingerprint) => `fishyfriends-backup-key-${String(fingerprint || '').slice(0, 8)}.txt`;

// What the admin saves: the private key with a few plain words above it saying what it is.
// The restore tool finds the key block wherever it sits, so the words do no harm, and a copy
// pasted into a password manager's notes still works if its line breaks get flattened.
export function keyFileText({ privateKey, fingerprint, madeOn = new Date() }) {
  const day = madeOn.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  return [
    'Fishy Friends backup key',
    `Made ${day}. Fingerprint: ${shortFingerprint(fingerprint)}`,
    '',
    'This is the only thing that opens the club\'s database backups. Keep it private and keep',
    'it safe: anyone holding it can read every backup made with it, and if it is lost those',
    'backups can\'t be opened by anybody. It is not stored on the site, in the database or on',
    'GitHub. To use it: supabase/backup/restore.mjs in the site\'s code.',
    '',
    privateKey.trim(),
    '',
  ].join('\n');
}

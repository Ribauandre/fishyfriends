// What a backup file is, and how it is sealed and opened.
//
// The copies are kept where anyone with a GitHub account can download them (the artifacts
// of a public repository), so a copy is only as private as its encryption. It is sealed to
// a PUBLIC key: the job that makes it never holds anything that opens it. The private key
// was made in the admin's browser and has only ever been in their hands.
//
//   plain    gzip of newline-delimited JSON (export.mjs writes it, restore.mjs reads it)
//   sealed   "FFBK1\n" + one line of JSON (the header) + "\n" + AES-256-GCM(plain) + tag
//
// The AES key is random per file and wrapped with RSA-OAEP (SHA-256) to the public key; the
// header carries the wrapped key, the nonce, the fingerprint of the key it was sealed to and
// a SHA-256 of the plain bytes. The header is authenticated with the data (it is the GCM
// "additional data"), so a file whose header was edited does not open. Every piece is a
// standard one that Node, a browser (WebCrypto) and OpenSSL all implement; there is no
// cryptography of this project's own here, only the envelope.

import crypto from 'node:crypto';

export const MAGIC = Buffer.from('FFBK1\n', 'latin1');
export const ALGORITHM = 'RSA-OAEP-256+A256GCM';
export const MIN_KEY_BITS = 3072;

// A PEM block out of whatever it was pasted into. A password manager's note field may have
// turned the line breaks into spaces, and the key file the admin page writes has a few lines
// of plain words above the block: both are fine.
export function pemBlock(text, label) {
  const match = String(text || '').match(new RegExp(`-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+)-----END ${label}-----`));
  if (!match) return null;
  const body = match[1].replace(/\s+/g, '');
  if (!body) return null;
  return `-----BEGIN ${label}-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END ${label}-----\n`;
}

// SHA-256 of the public key in its standard binary form (SPKI DER), in hex: the same sixty-
// four characters the database works out in set_backup_key() and the browser shows.
export function fingerprintOf(publicKey) {
  const key = typeof publicKey === 'string' ? crypto.createPublicKey(publicKey) : publicKey;
  return crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

// The public key the copies are sealed to, or an Error saying why it won't do.
export function readPublicKey(text) {
  const pem = pemBlock(text, 'PUBLIC KEY');
  if (!pem) throw new Error('The backup key is not a public key in PEM form.');
  let key;
  try { key = crypto.createPublicKey(pem); } catch (problem) { throw new Error('The backup key could not be read as a public key.'); }
  if (key.asymmetricKeyType !== 'rsa') throw new Error(`The backup key is a ${key.asymmetricKeyType} key; an RSA key is expected.`);
  const bits = key.asymmetricKeyDetails?.modulusLength || 0;
  if (bits < MIN_KEY_BITS) throw new Error(`The backup key is ${bits} bits; at least ${MIN_KEY_BITS} are needed.`);
  return key;
}

// The private key the admin kept, from their key file or from what they pasted.
export function readPrivateKey(text) {
  const pem = pemBlock(text, 'PRIVATE KEY');
  if (!pem) throw new Error('No private key found in that file. It should contain a block that starts -----BEGIN PRIVATE KEY-----.');
  try { return crypto.createPrivateKey(pem); } catch (problem) { throw new Error('The private key could not be read. Is the whole block there, first line to last?'); }
}

export function seal(plain, publicKey, { takenAt = new Date().toISOString(), note = {} } = {}) {
  const key = typeof publicKey === 'string' ? readPublicKey(publicKey) : publicKey;
  const dataKey = crypto.randomBytes(32);
  const nonce = crypto.randomBytes(12);
  const header = {
    format: 'fishyfriends-backup',
    version: 1,
    algorithm: ALGORITHM,
    fingerprint: fingerprintOf(key),
    wrappedKey: crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, dataKey).toString('base64'),
    nonce: nonce.toString('base64'),
    takenAt,
    plain: { bytes: plain.length, sha256: crypto.createHash('sha256').update(plain).digest('hex') },
    ...note,
  };
  const prefix = Buffer.concat([MAGIC, Buffer.from(`${JSON.stringify(header)}\n`, 'utf8')]);
  const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, nonce);
  cipher.setAAD(prefix);
  const sealed = Buffer.concat([prefix, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  dataKey.fill(0);
  return { sealed, header };
}

// The header alone, without a key: what a file says about itself (when it was taken, which
// key opens it). Nothing in it is secret, and nothing in it is to be believed until the
// file has been opened — the header is only proven by the key.
export function peek(sealed) {
  if (sealed.length < MAGIC.length || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('That is not a Fishy Friends backup file.');
  const end = sealed.indexOf(0x0a, MAGIC.length);
  if (end < 0 || end > 16384) throw new Error('That backup file has no header.');
  let header;
  try { header = JSON.parse(sealed.subarray(MAGIC.length, end).toString('utf8')); } catch (problem) { throw new Error('That backup file\'s header can\'t be read.'); }
  if (header.format !== 'fishyfriends-backup' || header.version !== 1 || header.algorithm !== ALGORITHM) throw new Error('That backup file is in a format this version doesn\'t know.');
  return { header, bodyAt: end + 1 };
}

export function open(sealed, privateKey) {
  const { header, bodyAt } = peek(sealed);
  const key = typeof privateKey === 'string' ? readPrivateKey(privateKey) : privateKey;
  const mine = fingerprintOf(crypto.createPublicKey(key));
  if (mine !== header.fingerprint) {
    throw new Error(`This backup was sealed to a different key (it wants ${header.fingerprint.slice(0, 16)}…, this key is ${mine.slice(0, 16)}…). If the backup key was replaced since, the older key file opens it.`);
  }
  let dataKey;
  try {
    dataKey = crypto.privateDecrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(header.wrappedKey, 'base64'));
  } catch (problem) {
    throw new Error('The key did not open this backup.');
  }
  if (sealed.length < bodyAt + 16) throw new Error('That backup file is cut short.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, Buffer.from(header.nonce, 'base64'));
  decipher.setAAD(sealed.subarray(0, bodyAt));
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  let plain;
  try {
    plain = Buffer.concat([decipher.update(sealed.subarray(bodyAt, sealed.length - 16)), decipher.final()]);
  } catch (problem) {
    throw new Error('This backup file has been altered or damaged: it does not check out against its key.');
  } finally {
    dataKey.fill(0);
  }
  if (crypto.createHash('sha256').update(plain).digest('hex') !== header.plain?.sha256) throw new Error('This backup opened, but its contents do not match its own checksum.');
  return { plain, header };
}

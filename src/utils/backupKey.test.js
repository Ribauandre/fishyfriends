import nodeCrypto from 'crypto';
import { makeBackupKey, keyFileName, keyFileText, shortFingerprint, BACKUP_KEY_BITS } from './backupKey';

// jsdom has no WebCrypto; Node's is the same interface the browser's is. A 2048-bit key keeps
// the test quick — the real size is checked as a number, and supabase/backup/drill.mjs makes
// a full-size one with this same file and opens a real backup with it.
const subtle = nodeCrypto.webcrypto.subtle;

describe('makeBackupKey', () => {
  let pair;
  beforeAll(async () => { pair = await makeBackupKey({ bits: 2048, subtle }); });

  test('asks for a key long enough for the nightly job to accept', () => {
    expect(BACKUP_KEY_BITS).toBeGreaterThanOrEqual(3072);
  });

  test('gives both halves as standard PEM text', () => {
    expect(pair.publicKey).toMatch(/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PUBLIC KEY-----\n$/);
    expect(pair.privateKey).toMatch(/^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PRIVATE KEY-----\n$/);
    expect(pair.publicKey.split('\n').every((line) => line.length <= 64)).toBe(true);
    // The two halves are a pair, readable by the tools a restore uses.
    const publicKey = nodeCrypto.createPublicKey(pair.publicKey);
    expect(publicKey.asymmetricKeyType).toBe('rsa');
    expect(nodeCrypto.createPublicKey(nodeCrypto.createPrivateKey(pair.privateKey)).export({ type: 'spki', format: 'pem' })).toBe(pair.publicKey);
  });

  test('the fingerprint is SHA-256 of the public key, as the database and the job work it out', () => {
    const der = nodeCrypto.createPublicKey(pair.publicKey).export({ type: 'spki', format: 'der' });
    expect(pair.fingerprint).toBe(nodeCrypto.createHash('sha256').update(der).digest('hex'));
    expect(pair.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test('what is sealed to the public half opens with the private half, the way a backup is', () => {
    const secret = nodeCrypto.randomBytes(32);
    const wrapped = nodeCrypto.publicEncrypt({ key: pair.publicKey, padding: nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, secret);
    const opened = nodeCrypto.privateDecrypt({ key: pair.privateKey, padding: nodeCrypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
    expect(opened.equals(secret)).toBe(true);
  });

  test('two keys are never the same key', async () => {
    const other = await makeBackupKey({ bits: 2048, subtle });
    expect(other.fingerprint).not.toBe(pair.fingerprint);
    expect(other.privateKey).not.toBe(pair.privateKey);
  });

  test('says so plainly where the browser can\'t make one', async () => {
    await expect(makeBackupKey({ subtle: undefined })).rejects.toThrow(/can't make a key/);
  });

  test('the key file says what it is and carries the whole private key, and nothing of the public one', () => {
    const text = keyFileText({ privateKey: pair.privateKey, fingerprint: pair.fingerprint, madeOn: new Date('2026-11-25T12:00:00Z') });
    expect(text).toMatch(/^Fishy Friends backup key\nMade November 2\d, 2026\. Fingerprint: ([0-9a-f]{4} ){3}[0-9a-f]{4}\n/);
    expect(text).toContain(pair.privateKey.trim());
    expect(text).toContain('only thing that opens');
    expect(text).not.toContain('PUBLIC KEY');
    // A restore finds the key block among the words.
    const block = text.match(/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/)[0];
    expect(nodeCrypto.createPrivateKey(block).asymmetricKeyType).toBe('rsa');
  });
});

test('a fingerprint is shown short, in fours, and names the key file', () => {
  const print = '526eff9f8879e7eb'.padEnd(64, '0');
  expect(shortFingerprint(print)).toBe('526e ff9f 8879 e7eb');
  expect(shortFingerprint('')).toBe('');
  expect(shortFingerprint(undefined)).toBe('');
  expect(keyFileName(print)).toBe('fishyfriends-backup-key-526eff9f.txt');
});

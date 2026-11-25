// The one way anything in this folder reaches the database: the migration runner on every
// deploy, and the nightly backup. Both hold the database password, so both go through here.
//
// The connection is always encrypted. Whether the server at the other end is really
// Supabase is a second question: until November 2026 nothing asked it, so anything sitting
// between the build machine and the database could have answered and been handed the
// database password. Supabase's database certificates are signed by its own authority
// (supabase/security/supabase-ca-2021.crt, a public file from the dashboard's Database
// settings), which is trusted here next to the usual ones. Each run says whether the
// certificate verified. Deploy #194 (11 November 2026) said it does, so from here on a
// server that can't prove itself is refused before anything is sent to it. A local replay is
// never held to it. If Supabase ever changes its authority, the failure says what to do.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REQUIRE_VERIFIED_TLS = true;

export function isLocal(connectionString) {
  try { return ['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(new URL(connectionString).hostname); } catch { return false; }
}

// Says only whether the certificate verified and, if not, the standard reason code: never
// the host, the project or anything else from the connection string (this log is public).
export function describeTls(client) {
  const stream = client.connection && client.connection.stream;
  if (!stream || typeof stream.getPeerCertificate !== 'function') return 'Database connection: NOT encrypted.';
  if (stream.authorized) return 'Database connection: encrypted, and the server\'s certificate verified.';
  return `Database connection: encrypted, but the server's certificate did not verify (${stream.authorizationError || 'no reason given'}). Nothing was refused: REQUIRE_VERIFIED_TLS is off.`;
  // (With REQUIRE_VERIFIED_TLS on, a certificate that doesn't verify never gets this far.)
}

// A connected client, or an error that says nothing was sent. `carrying` names what the
// caller was about to send, for that message ("a migration", "a backup request").
export async function connectVerified(connectionString, { carrying = 'a query', quiet = false } = {}) {
  const supabaseCa = await readFile(path.join(__dirname, 'security', 'supabase-ca-2021.crt'), 'utf8').catch(() => null);
  const local = isLocal(connectionString);
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: REQUIRE_VERIFIED_TLS && !local, ...(supabaseCa ? { ca: [...tls.rootCertificates, supabaseCa] } : {}) },
  });
  try {
    await client.connect();
  } catch (error) {
    if (REQUIRE_VERIFIED_TLS && !local && /CERT|SELF_SIGNED|ALTNAME|ISSUER|LEAF_SIGNATURE|HOSTNAME/.test(String(error.code || ''))) {
      // The handshake comes before the password, so nothing has been sent. Only the standard
      // reason code is printed: the error's own text can name the host.
      throw new Error(`The database's certificate did not verify (${error.code}), so nothing was sent to it: not the password, not ${carrying}. If Supabase has changed its certificate authority, replace supabase/security/supabase-ca-2021.crt with the certificate from the dashboard (Project Settings > Database > SSL Configuration). To run without this check, set REQUIRE_VERIFIED_TLS to false in supabase/db.mjs.`);
    }
    throw error;
  }
  if (!local && !quiet) console.log(describeTls(client));
  return client;
}

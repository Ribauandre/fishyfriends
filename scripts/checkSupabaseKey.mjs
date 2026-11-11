// Run by the deploy workflow before anything is built: the key that gets compiled into the
// public bundle has to be the one meant for browsers.
//
// Create React App bakes REACT_APP_* values into JavaScript every visitor downloads, so a
// secret key there is a full breach: it skips row-level security entirely. Two formats
// exist. The current ones say what they are in their prefix (sb_publishable_… / sb_secret_…).
// The legacy ones are both JWTs that look alike ("eyJ…") — the anon key and the
// service_role key differ only in a `role` claim inside — so a look at the prefix can't
// tell them apart, and the old check here waved any JWT through. This reads the claim.
//
// Usage: SUPABASE_URL=… SUPABASE_KEY=… node scripts/checkSupabaseKey.mjs
// Prints why it refused, never the key.

export function checkSupabaseKey(key) {
  const value = String(key || '').trim();
  if (!value) return 'Missing REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY.';
  if (value.startsWith('sb_publishable_')) return null;
  if (value.startsWith('sb_secret_')) return 'The selected value is a Supabase SECRET key. Only the publishable key belongs in REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY; rotate the secret key now if this value was ever saved as a plain Variable.';
  const parts = value.split('.');
  if (value.startsWith('eyJ') && parts.length === 3) {
    let claims;
    try { claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch (error) { return 'The selected Supabase key looks like a JWT but its claims can\'t be read.'; }
    if (claims?.role === 'anon') return null;
    if (claims?.role === 'service_role') return 'The selected value is the Supabase service_role key. It bypasses row-level security and must never be in a browser bundle; use the anon / publishable key, and rotate the service_role key if this value was ever saved as a plain Variable.';
    return 'The selected Supabase key is a JWT whose role is not "anon". Only the anon / publishable key belongs in a browser bundle.';
  }
  return 'The selected Supabase key is not a recognized publishable/anon key format.';
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  if (!process.env.SUPABASE_URL) {
    console.error('Missing REACT_APP_SUPABASE_URL.');
    process.exit(1);
  }
  const problem = checkSupabaseKey(process.env.SUPABASE_KEY);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  console.log('The Supabase key selected for the bundle is a publishable / anon key.');
}

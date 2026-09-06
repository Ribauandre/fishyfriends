// Empties the avatars and personal-bests storage buckets. Supabase blocks direct
// `delete from storage.objects` in SQL (see storage.protect_delete()), so this has to
// go through the Storage API instead — this script does that.
//
// Run from the project root (uses the @supabase/supabase-js dependency already
// installed there):
//
//   SUPABASE_URL=https://your-project.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
//   node supabase/reset-storage.mjs
//
// The service role key is the secret key from Settings -> API in the Supabase
// dashboard (NOT the publishable/anon key the app uses) — it's required here because
// this needs to remove every user's files, not just your own. Never commit it or put
// it in .env.local; only export it in your shell for this one command, then close
// the terminal or unset it.

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this script.');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function emptyBucket(bucket) {
  const { data: topLevel, error: listError } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (listError) throw listError;

  const paths = [];
  for (const entry of topLevel || []) {
    // Every upload in this app is saved as `{user id}/{filename}`, so each top-level
    // entry is a per-user folder — list inside it to get the actual file paths.
    const { data: files, error: fileError } = await supabase.storage.from(bucket).list(entry.name, { limit: 1000 });
    if (fileError) throw fileError;
    for (const file of files || []) paths.push(`${entry.name}/${file.name}`);
  }

  if (paths.length === 0) {
    console.log(`${bucket}: already empty.`);
    return;
  }

  const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
  if (removeError) throw removeError;
  console.log(`${bucket}: removed ${paths.length} file(s).`);
}

for (const bucket of ['avatars', 'personal-bests']) {
  await emptyBucket(bucket);
}

console.log('Done.');

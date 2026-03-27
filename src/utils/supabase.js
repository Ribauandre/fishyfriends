import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.FISHY_SUPABASE_URL || '';
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY || process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.FISHY_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and key are required. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY (or REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY) to .env.local and restart the dev server.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function setSupabaseJwtFromEnv() {
  const jwt = process.env.REACT_APP_SUPABASE_JWT;
  const refreshToken = process.env.REACT_APP_SUPABASE_REFRESH_TOKEN || '';
  if (!jwt) return;

  const { error } = await supabase.auth.setSession({ access_token: jwt, refresh_token: refreshToken });
  if (error) {
    console.warn('Supabase JWT session setup failed:', error.message);
  }
}

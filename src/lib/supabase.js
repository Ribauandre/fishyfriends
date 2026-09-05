import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.FISHY_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY
	|| process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY
	|| process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY
	|| process.env.FISHY_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
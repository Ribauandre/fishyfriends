import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.FISHY_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY
	|| process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY
	|| process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY
	|| process.env.FISHY_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// How this visit arrived, read before the client exists: it takes the tokens out of the
// address as soon as it has used them. `recovery` is a password-reset link (the app then
// asks for a new password before showing anything else); `problem` is a link that had
// expired or was already used.
function readArrival() {
	try {
		const params = new URLSearchParams(`${window.location.hash.replace(/^#/, '')}&${window.location.search.replace(/^\?/, '')}`);
		return { recovery: params.get('type') === 'recovery', problem: params.get('error_code') || (params.get('error_description') ? 'error' : '') };
	} catch (readError) {
		return { recovery: false, problem: '' };
	}
}
export const arrivedBy = readArrival();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
// Where this project's stored photos live: utils/photoLinks.js tells one of ours from an
// address somewhere else by it.
export const supabaseProjectUrl = supabaseUrl || '';
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
	},
}) : null;
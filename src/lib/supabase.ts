import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** False until the Supabase URL and publishable key are set (.env.local or GitHub variables). */
export const isSupabaseConfigured = Boolean(url && key);

// The publishable key is meant to be public: Row Level Security decides what each user may do.
export const supabase = createClient<Database>(url || 'http://localhost:54321', key || 'not-configured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // password login only; with HashRouter the URL hash is ours
    detectSessionInUrl: false,
  },
});

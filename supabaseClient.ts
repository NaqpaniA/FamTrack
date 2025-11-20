
import { createClient } from '@supabase/supabase-js';

// Environment variables should be used here in production.
// For this phase, we define placeholders.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY || 'your-anon-key';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    }
});

export const isSupabaseConfigured = () => {
    return SUPABASE_URL !== 'https://your-project.supabase.co' && SUPABASE_ANON_KEY !== 'your-anon-key';
};

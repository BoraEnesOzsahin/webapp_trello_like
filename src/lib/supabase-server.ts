import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _supabaseAdmin: ReturnType<typeof createClient> | null = null;

if (url && serviceKey) {
  _supabaseAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export const supabaseAdmin = _supabaseAdmin;

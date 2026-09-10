import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Session-aware Supabase client for the admin area only. The public site never
 * uses this: it talks to PostgREST/Edge Functions with the anon key via
 * `supabaseFetch` (see lib/supabase.ts). This client additionally persists an
 * authenticated user's session so that RLS policies gated on `auth.uid()` and
 * `has_staff_role(...)` apply.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client;
  const { url, anonKey } = getSupabasePublicConfig();
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

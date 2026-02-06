// lib/supabaseAdmin.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Admin (Service Role) client for SERVER-ONLY usage.
 * - Uses SUPABASE_SERVICE_ROLE_KEY (never expose to the browser)
 * - persistSession disabled (API routes / server functions only)
 */

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}

// Optional alias if you prefer importing a constant-like getter name
export const getSupabaseAdmin = supabaseAdmin;

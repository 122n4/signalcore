import { createClient } from "@supabase/supabase-js";

let investingSupabaseAdmin: ReturnType<typeof createClient> | null = null;

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

export function assertInvestingServerEnv(env: NodeJS.ProcessEnv = process.env) {
  const missing = ["SUPABASE_SERVICE_ROLE_KEY"].filter((key) => !String(env[key] || "").trim());
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (!url) missing.push("SUPABASE_URL");
  if (missing.length) {
    throw new Error(`investing_server_env_missing:${missing.join(",")}`);
  }
}

export function getInvestingSupabaseAdmin() {
  if (typeof window !== "undefined") {
    throw new Error("investing_admin_client_server_only");
  }
  if (investingSupabaseAdmin) return investingSupabaseAdmin;
  assertInvestingServerEnv();
  const url = readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  investingSupabaseAdmin = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return investingSupabaseAdmin;
}

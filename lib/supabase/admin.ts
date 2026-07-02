import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

let _client: any = null;
let _envBootstrapped = false;

function hasSupabaseAdminEnv() {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  return url.length > 0 && key.length > 0;
}

function loadOptionalEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureSupabaseAdminEnv() {
  if (_envBootstrapped || hasSupabaseAdminEnv()) {
    _envBootstrapped = true;
    return;
  }

  loadEnvConfig(process.cwd());
  if (!hasSupabaseAdminEnv()) {
    loadOptionalEnvFile(path.join(process.cwd(), ".env.research"));
  }

  _envBootstrapped = true;
}

export function getSupabaseAdmin() {
  if (_client) return _client;
  ensureSupabaseAdminEnv();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}

// compat (se houver imports antigos)
export const supabaseAdmin = getSupabaseAdmin;

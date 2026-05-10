import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUserStore, setUserStore } from "@/lib/signalcore/mvpStore";
import type { BrokerConnection } from "@/lib/broker/shared";
import {
  buildDisconnectedConnection,
  normalizeBrokerConnection,
  normalizeModeValue,
  sanitizeConnectionForClient,
} from "@/lib/broker/shared";

const MEMORY_KEY = "broker_connection_v1";
const JOURNAL_TYPE = "broker_connection_state";

function canUseMemoryFallback() {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_MEMORY_FALLBACK === "1";
}

function isMissingSchemaError(msg: string) {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("relation") ||
    m.includes("unknown column") ||
    m.includes("column") ||
    m.includes("schema cache")
  );
}

function parseMaybeJSON(v: any) {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v !== "string") return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function readMemory(userId: string) {
  const store = getUserStore(userId);
  const raw = parseMaybeJSON(store?.[MEMORY_KEY]);
  if (!raw) return null;
  return normalizeBrokerConnection(raw, userId, "memory");
}

function writeMemory(userId: string, conn: BrokerConnection) {
  setUserStore(userId, {
    [MEMORY_KEY]: conn,
  });
}

function getSbOrNull() {
  try {
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

async function readFromUserSettings(sb: any, userId: string) {
  try {
    const { data, error } = await sb.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const payload = parseMaybeJSON((data as any).broker_connection);
    if (!payload) return null;

    return normalizeBrokerConnection(payload, userId, "user_settings");
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (isMissingSchemaError(msg)) return null;
    throw e;
  }
}

async function writeToUserSettings(sb: any, userId: string, conn: BrokerConnection) {
  const row = {
    user_id: userId,
    broker_connection: conn,
    updated_at: new Date().toISOString(),
  } as any;

  try {
    const { error } = await sb.from("user_settings").upsert(row, { onConflict: "user_id" });
    if (error) throw error;
    return true;
  } catch (e: any) {
    if (isMissingSchemaError(String(e?.message || ""))) return false;
    throw e;
  }
}

async function writeToJournal(sb: any, userId: string, conn: BrokerConnection, event: string) {
  const mode = normalizeModeValue(conn.snapshot?.mode || "investing");
  const row = {
    user_id: userId,
    mode,
    type: JOURNAL_TYPE,
    title: "Broker connection state",
    details: {
      event,
      connection: conn,
      summary: sanitizeConnectionForClient(conn),
    },
    created_at: new Date().toISOString(),
  };
  const { error } = await sb.from("journal_entries").insert(row as any);
  if (error) throw new Error(error.message || "journal_write_failed");
}

async function tryPersistSetupMode(sb: any, userId: string, setupMode: "offline" | "broker") {
  try {
    const row = {
      user_id: userId,
      setup_mode: setupMode,
      setup_status: "complete",
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("user_settings").upsert(row as any, { onConflict: "user_id" });
    if (error && !isMissingSchemaError(error.message || "")) throw error;
  } catch {
    // non-blocking
  }
}

export async function loadBrokerConnection(userId: string): Promise<BrokerConnection> {
  const sb = getSbOrNull();
  if (sb) {
    const fromSettings = await readFromUserSettings(sb, userId);
    if (fromSettings) {
      writeMemory(userId, fromSettings);
      return fromSettings;
    }
  }

  if (!canUseMemoryFallback()) {
    throw new Error("broker_persistence_unavailable");
  }

  const fromMemory = readMemory(userId);
  if (fromMemory) return fromMemory;

  return buildDisconnectedConnection(userId, "none");
}

export async function saveBrokerConnection(userId: string, next: BrokerConnection, event = "update") {
  const normalized = normalizeBrokerConnection(next as any, userId, next.source || "memory");
  writeMemory(userId, normalized);

  const sb = getSbOrNull();
  if (!sb) {
    if (!canUseMemoryFallback()) {
      throw new Error("broker_persistence_unavailable");
    }
    return normalized;
  }

  let persistedToSettings = false;
  let journalLogged = false;
  try {
    persistedToSettings = await writeToUserSettings(sb, userId, normalized);
  } catch {
    // fall through to audit log and memory fallback
  }

  try {
    await writeToJournal(sb, userId, normalized, event);
    journalLogged = true;
  } catch {
    // non-blocking
  }

  try {
    await tryPersistSetupMode(sb, userId, normalized.connected ? "broker" : "offline");
  } catch {
    // non-blocking
  }

  // journal_entries is audit trail only, not a canonical connection store.
  if (!persistedToSettings && !canUseMemoryFallback()) {
    throw new Error("broker_persistence_failed");
  }

  if (persistedToSettings) return normalizeBrokerConnection(normalized as any, userId, "user_settings");
  if (!journalLogged && !canUseMemoryFallback()) {
    throw new Error("broker_persistence_failed");
  }
  return normalizeBrokerConnection(normalized as any, userId, "memory");
}

export async function patchBrokerConnection(userId: string, patch: Partial<BrokerConnection>, event = "update") {
  const current = await loadBrokerConnection(userId);
  const merged = normalizeBrokerConnection(
    {
      ...current,
      ...patch,
      userId,
      updatedAt: new Date().toISOString(),
    },
    userId,
    current.source || "memory"
  );
  return saveBrokerConnection(userId, merged, event);
}

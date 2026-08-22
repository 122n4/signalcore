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

async function writeToJournal(sb: any, userId: string, conn: BrokerConnection, event: string) {
  const mode = normalizeModeValue(conn.snapshot?.mode || "trading");
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

export async function loadBrokerConnection(userId: string): Promise<BrokerConnection> {
  const fromMemory = readMemory(userId);
  if (fromMemory) return fromMemory;

  if (!canUseMemoryFallback()) {
    throw new Error("broker_persistence_unavailable");
  }

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

  let journalLogged = false;
  try {
    await writeToJournal(sb, userId, normalized, event);
    journalLogged = true;
  } catch {
    // non-blocking
  }

  if (!journalLogged && !canUseMemoryFallback()) {
    throw new Error("broker_persistence_failed");
  }
  return normalizeBrokerConnection(normalized as any, userId, journalLogged ? "journal" : "memory");
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

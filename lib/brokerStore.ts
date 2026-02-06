// lib/brokerStore.ts
import type { BrokerProvider } from "@/lib/brokers/types";

export type BrokerStatus = "active" | "revoked" | "needs_attention" | "error";

export type BrokerConnection = {
  userId: string;
  provider: BrokerProvider; // "snaptrade"
  status: BrokerStatus;

  accountLabel?: string | null;

  // Tokens (nomes comuns que já vi no teu código)
  access_token?: string | null;
  refresh_token?: string | null;
  token_expires_at?: string | null;

  // alias fields (para compat)
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;

  meta?: Record<string, any>;
  updatedAt?: string | null;
};

export type BrokerSnapshotRecord = {
  userId: string;
  provider: BrokerProvider;
  accountId?: string | null;
  asOf: string;
  snapshot: any;
  metrics?: any;
};

// ---- In-memory fallback (build-safe) ----
const MEM_CONN = new Map<string, BrokerConnection>();
const MEM_SNAP = new Map<string, BrokerSnapshotRecord>();

function connKey(userId: string, provider: BrokerProvider) {
  return `${provider}:${userId}`;
}
function snapKey(userId: string, provider: BrokerProvider, accountId?: string | null) {
  return `${provider}:${userId}:${accountId ?? "default"}`;
}

export async function upsertConnection(input: BrokerConnection) {
  const key = connKey(input.userId, input.provider);
  const now = new Date().toISOString();

  const normalized: BrokerConnection = {
    ...input,
    status: input.status,
    access_token: input.access_token ?? input.accessToken ?? null,
    refresh_token: input.refresh_token ?? input.refreshToken ?? null,
    token_expires_at: input.token_expires_at ?? input.tokenExpiresAt ?? null,
    updatedAt: now,
  };

  MEM_CONN.set(key, normalized);
  return normalized;
}

export async function getConnection(userId: string, provider: BrokerProvider) {
  return MEM_CONN.get(connKey(userId, provider)) ?? null;
}

export async function getBrokerStatus(userId: string, provider: BrokerProvider = "snaptrade") {
  const c = await getConnection(userId, provider);
  return {
    provider,
    connected: !!c && c.status === "active",
    status: c?.status ?? "error",
    accountLabel: c?.accountLabel ?? null,
    updatedAt: c?.updatedAt ?? null,
  };
}

export async function upsertSnapshot(input: BrokerSnapshotRecord) {
  MEM_SNAP.set(snapKey(input.userId, input.provider, input.accountId), input);
  return input;
}

// Compat: algumas rotas chamam getLatestSnapshot(userId) apenas
export async function getLatestSnapshot(arg: string | { userId: string; provider?: BrokerProvider; accountId?: string | null }) {
  const userId = typeof arg === "string" ? arg : arg.userId;
  const provider = typeof arg === "string" ? "snaptrade" : (arg.provider ?? "snaptrade");
  const accountId = typeof arg === "string" ? null : (arg.accountId ?? null);

  // tenta accountId específico, senão default
  const exact = MEM_SNAP.get(snapKey(userId, provider, accountId));
  if (exact) return exact.snapshot;

  const def = MEM_SNAP.get(snapKey(userId, provider, "default"));
  if (def) return def.snapshot;

  // se não houver, retorna null
  return null;
}
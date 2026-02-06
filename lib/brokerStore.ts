// lib/brokerStore.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type BrokerProvider = "snaptrade";

export type BrokerConnectionStatus =
  | "active"
  | "revoked"
  | "needs_attention"
  | "error";

export type BrokerConnection = {
  userId: string;
  provider: BrokerProvider;
  status: BrokerConnectionStatus;

  accountLabel?: string | null;

  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null; // ISO string

  meta?: Record<string, any> | null;
  updatedAt?: string | null;
};

export type BrokerSnapshot = {
  userId: string;
  provider: BrokerProvider;
  accountId?: string | null;

  // normalized payload (whatever your adapters return)
  snapshot: any;

  // optional derived metrics
  metrics?: any;

  createdAt: string; // ISO
};

const CONN_TABLE = "broker_connections";
const SNAP_TABLE = "broker_snapshots";

/**
 * Read a connection row. Supports snake_case OR camelCase schemas.
 */
export async function getConnection(
  userId: string,
  provider: BrokerProvider
): Promise<
  | (BrokerConnection & {
      access_token?: string | null;
      refresh_token?: string | null;
      token_expires_at?: string | null;
    })
  | null
> {
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from(CONN_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const accessToken = (data as any).access_token ?? (data as any).accessToken ?? null;
  const refreshToken = (data as any).refresh_token ?? (data as any).refreshToken ?? null;
  const tokenExpiresAt =
    (data as any).token_expires_at ?? (data as any).tokenExpiresAt ?? null;

  return {
    userId: (data as any).user_id ?? userId,
    provider: (data as any).provider ?? provider,
    status: ((data as any).status ?? "needs_attention") as BrokerConnectionStatus,
    accountLabel: (data as any).account_label ?? (data as any).accountLabel ?? null,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    meta: (data as any).meta ?? null,
    updatedAt: (data as any).updated_at ?? (data as any).updatedAt ?? null,

    // keep legacy keys for older callsites
    access_token: (data as any).access_token ?? null,
    refresh_token: (data as any).refresh_token ?? null,
    token_expires_at: (data as any).token_expires_at ?? null,
  };
}

export async function upsertConnection(params: {
  userId: string;
  provider: BrokerProvider;
  status: BrokerConnectionStatus;

  accountLabel?: string | null;

  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;

  meta?: Record<string, any> | null;
}) {
  const sb = supabaseAdmin();

  const row: any = {
    user_id: params.userId,
    provider: params.provider,
    status: params.status,
    account_label: params.accountLabel ?? null,

    access_token: params.accessToken ?? null,
    refresh_token: params.refreshToken ?? null,
    token_expires_at: params.tokenExpiresAt ?? null,

    meta: params.meta ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from(CONN_TABLE)
    .upsert(row, { onConflict: "user_id,provider" })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? row;
}

export async function revokeConnection(userId: string, provider: BrokerProvider) {
  const sb = supabaseAdmin();

  const { error } = await sb
    .from(CONN_TABLE)
    .update({
      status: "revoked",
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);

  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * Save a broker snapshot (portfolio holdings + balances etc).
 * Your engine can use this as the "truth" source.
 */
export async function saveSnapshot(params: {
  userId: string;
  provider: BrokerProvider;
  accountId?: string | null;
  snapshot: any;
  metrics?: any;
}) {
  const sb = supabaseAdmin();

  const now = new Date().toISOString();

  const row: any = {
    user_id: params.userId,
    provider: params.provider,
    account_id: params.accountId ?? null,
    snapshot: params.snapshot,
    metrics: params.metrics ?? null,
    created_at: now,
  };

  const { error } = await sb.from(SNAP_TABLE).insert(row);
  if (error) throw new Error(error.message);

  return { ok: true, createdAt: now };
}

/**
 * ✅ This is what your /api/portfolio and other routes are asking for.
 * Returns the most recent snapshot row.
 */
export async function getLatestSnapshot(params: {
  userId: string;
  provider?: BrokerProvider;
  accountId?: string | null;
}): Promise<BrokerSnapshot | null> {
  const sb = supabaseAdmin();

  const provider = params.provider ?? "snaptrade";

  let q = sb
    .from(SNAP_TABLE)
    .select("*")
    .eq("user_id", params.userId)
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(1);

  if (params.accountId) q = q.eq("account_id", params.accountId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) && data.length ? data[0] : null;
  if (!row) return null;

  return {
    userId: (row as any).user_id ?? params.userId,
    provider: (row as any).provider ?? provider,
    accountId: (row as any).account_id ?? null,
    snapshot: (row as any).snapshot ?? null,
    metrics: (row as any).metrics ?? null,
    createdAt: (row as any).created_at ?? new Date().toISOString(),
  };
}
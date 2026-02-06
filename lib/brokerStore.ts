import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { BrokerProvider, BrokerStatus, PortfolioSnapshot } from "@/lib/brokers/types";

export async function getActiveConnection(userId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("broker_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertConnection(params: {
  userId: string;
  provider: BrokerProvider;
  status: "active" | "revoked" | "error" | "needs_attention";
  accountLabel?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: string | null;
  meta?: Record<string, any>;
}) {
  const sb = supabaseAdmin();

  const row = {
    user_id: params.userId,
    provider: params.provider,
    status: params.status,
    account_label: params.accountLabel ?? null,
    access_token: params.accessToken ?? null,
    refresh_token: params.refreshToken ?? null,
    token_expires_at: params.tokenExpiresAt ?? null,
    meta: params.meta ?? {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("broker_connections")
    .upsert(row, { onConflict: "user_id,provider" as any })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function insertSnapshot(params: {
  userId: string;
  provider: BrokerProvider;
  connectionId?: string | null;
  asOf: string;
  hash: string;
  holdings: any[];
  cash: any;
  trades: any[];
  metrics: any;
}) {
  const sb = supabaseAdmin();

  const row = {
    user_id: params.userId,
    provider: params.provider,
    connection_id: params.connectionId ?? null,
    as_of: params.asOf,
    hash: params.hash,
    holdings: params.holdings ?? [],
    cash: params.cash ?? {},
    trades: params.trades ?? [],
    metrics: params.metrics ?? {},
  };

  const { data, error } = await sb
    .from("portfolio_snapshots")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getLatestSnapshot(userId: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("portfolio_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getBrokerStatus(userId: string): Promise<BrokerStatus> {
  const conn = await getActiveConnection(userId);
  if (!conn) return { connected: false, lastSyncAt: null };

  const snap = await getLatestSnapshot(userId);
  return {
    connected: true,
    provider: conn.provider,
    status: conn.status,
    accountLabel: conn.account_label ?? null,
    lastSyncAt: snap?.as_of ?? null,
  };
}
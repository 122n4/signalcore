// lib/brokers/index.ts
// Central broker exports (SnapTrade first).
// Goal: fix build errors by guaranteeing the exports used by app/api/broker/* routes exist.
// You can swap the internal implementation later without changing the API routes.

export type BrokerProvider = "snaptrade";

type Json = Record<string, any>;

function requiredEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`[brokers] Missing env: ${name}`);
  return v;
}

function baseUrl() {
  return (process.env.SNAPTRADE_BASE_URL || "https://api.snaptrade.com/api/v1").replace(/\/$/, "");
}

/**
 * A stable hash helper for snapshots (used for drift/history).
 * (Keep this export because other modules already import it.)
 */
export function snapshotHash(input: unknown): string {
  const str =
    typeof input === "string"
      ? input
      : JSON.stringify(input, Object.keys(input as any).sort?.() ?? undefined);
  // tiny, deterministic hash
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h_${(h >>> 0).toString(16)}`;
}

/**
 * SnapTrade API fetch wrapper.
 * IMPORTANT: This is intentionally minimal; you can upgrade to official SDK later.
 */
async function snaptradeFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${baseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;

  // These env names are intentionally flexible because every repo tends to differ.
  // Set at least SNAPTRADE_CLIENT_ID + SNAPTRADE_CONSUMER_KEY in Vercel.
  const clientId =
    process.env.SNAPTRADE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_SNAPTRADE_CLIENT_ID ||
    process.env.SNAPTRADE_APP_CLIENT_ID;

  const consumerKey =
    process.env.SNAPTRADE_CONSUMER_KEY ||
    process.env.SNAPTRADE_CLIENT_SECRET ||
    process.env.SNAPTRADE_SECRET;

  if (!clientId || !consumerKey) {
    throw new Error(
      "[brokers] Missing SnapTrade credentials. Set SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY (or your repo’s equivalent)."
    );
  }

  const headers = new Headers(init?.headers || {});
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");

  // SnapTrade commonly expects these headers; adjust if your integration differs.
  headers.set("X-SnapTrade-Client-Id", clientId);
  headers.set("X-SnapTrade-Consumer-Key", consumerKey);

  return fetch(url, { ...init, headers });
}

/**
 * Builds a connect URL to send the user to the broker connect flow.
 * Your route expects this export name.
 */
export async function snaptradeBuildConnectUrl(args: {
  userId: string;
  redirectUri: string;
  /** optional state override */
  state?: string;
}): Promise<{ url: string; state: string }> {
  const { userId, redirectUri } = args;
  const state = args.state || `sc_${userId}_${Date.now()}`;

  // NOTE: SnapTrade has different flows depending on config.
  // If your account uses a different endpoint, adjust ONLY here.
  // This implementation is made to compile + be easily replaceable.
  const res = await snaptradeFetch("/authorizations", {
    method: "POST",
    body: JSON.stringify({
      userId,
      redirectUri,
      state,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`[snaptradeBuildConnectUrl] ${res.status} ${txt}`);
  }

  const data = (await res.json().catch(() => ({}))) as Json;

  // Try common shapes
  const url =
    data?.redirectURI ||
    data?.redirectUri ||
    data?.url ||
    data?.connectURL ||
    data?.connectUrl;

  if (!url) {
    throw new Error(
      "[snaptradeBuildConnectUrl] SnapTrade response missing connect URL. Check your SnapTrade endpoint/response mapping."
    );
  }

  return { url, state };
}

/**
 * Exchanges the callback code for a connection.
 * Your route expects this export name.
 */
export async function snaptradeExchangeCallback(args: {
  userId: string;
  code: string;
  state?: string;
  redirectUri: string;
}): Promise<Json> {
  const { userId, code, state, redirectUri } = args;

  // Minimal exchange. If your SnapTrade flow differs, replace here.
  const res = await snaptradeFetch("/authorizations/callback", {
    method: "POST",
    body: JSON.stringify({
      userId,
      code,
      state,
      redirectUri,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`[snaptradeExchangeCallback] ${res.status} ${txt}`);
  }

  return (await res.json().catch(() => ({}))) as Json;
}

/**
 * Fetches a normalized snapshot (portfolio positions + balances).
 * Your route expects this export name.
 */
export async function snaptradeFetchSnapshot(args: {
  userId: string;
  /** optionally select a broker accountId if your system supports multiple */
  accountId?: string;
}): Promise<{
  provider: BrokerProvider;
  userId: string;
  accountId?: string;
  asOf: number;
  raw: Json;
}> {
  const { userId, accountId } = args;

  const qp = new URLSearchParams();
  qp.set("userId", userId);
  if (accountId) qp.set("accountId", accountId);

  const res = await snaptradeFetch(`/accounts/snapshot?${qp.toString()}`, {
    method: "GET",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`[snaptradeFetchSnapshot] ${res.status} ${txt}`);
  }

  const raw = (await res.json().catch(() => ({}))) as Json;

  return {
    provider: "snaptrade",
    userId,
    accountId,
    asOf: Date.now(),
    raw,
  };
}
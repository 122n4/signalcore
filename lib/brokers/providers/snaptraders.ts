import type { PortfolioSnapshot } from "../types";

/**
 * SnapTrade Provider (read-only)
 * V2: Implement connect URL, callback token exchange, and data fetch.
 *
 * Env:
 *  - SNAPTRADE_CLIENT_ID
 *  - SNAPTRADE_CONSUMER_KEY
 *  - SNAPTRADE_REDIRECT_URL
 *
 * NOTE: This file is “ready”, but you must implement the real API calls
 * once you create the SnapTrade app and have credentials.
 */

export function snaptradeEnv() {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  const redirectUrl = process.env.SNAPTRADE_REDIRECT_URL;

  if (!clientId || !consumerKey || !redirectUrl) {
    throw new Error("Missing SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY / SNAPTRADE_REDIRECT_URL");
  }
  return { clientId, consumerKey, redirectUrl };
}

export async function snaptradeBuildConnectUrl(userId: string): Promise<string> {
  const { redirectUrl } = snaptradeEnv();
  // TODO: create a real connect URL with SnapTrade.
  // Return a placeholder for now:
  const qs = new URLSearchParams({ user_id: userId, redirect: redirectUrl });
  return `/app?tab=planning&snaptrade=todo&${qs.toString()}`;
}

export async function snaptradeExchangeCallback(_params: Record<string, string>) {
  // TODO: exchange OAuth code for tokens.
  // Return { access_token, refresh_token, expires_at, account_label }
  return {
    access_token: "TODO",
    refresh_token: "TODO",
    token_expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
    account_label: "SnapTrade Account",
    meta: {},
  };
}

export async function snaptradeFetchSnapshot(_args: {
  userId: string;
  accessToken: string;
}): Promise<PortfolioSnapshot> {
  // TODO: fetch holdings/cash/trades from SnapTrade and normalize.
  // For now return an empty snapshot (so the system compiles).
  return {
    userId: _args.userId,
    provider: "snaptrade",
    connectionId: null,
    asOf: new Date().toISOString(),
    holdings: [],
    cash: [],
    trades: [],
    metrics: {},
  };
}
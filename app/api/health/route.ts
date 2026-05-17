import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  inspectTradingLightScanner,
  summarizeTradingLightScannerDiagnostics,
} from "@/lib/trading/lightScanner";
import { getTwelveDataApiKeys } from "@/lib/market/providers/twelvedataKeyPool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkSupabase() {
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("user_settings").select("user_id").limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e.message || "supabase_unavailable") };
  }
}

async function inspectTradingScannerForHealth(args: { asOf: string; liveFetch: boolean }) {
  const firstPass = await inspectTradingLightScanner({
    asOf: args.asOf,
    liveFetch: args.liveFetch,
    openMarketsOnlyLiveFetch: true,
  }).catch(() => []);
  const firstSummary = summarizeTradingLightScannerDiagnostics(firstPass);
  const needsHardRefresh =
    args.liveFetch &&
    firstSummary.openMarketCount > 0 &&
    firstSummary.freshOpenMarketCount === 0;

  if (!needsHardRefresh) return firstPass;

  return inspectTradingLightScanner({
    asOf: args.asOf,
    liveFetch: true,
    forceProviderRefresh: true,
    openMarketsOnlyLiveFetch: true,
  }).catch(() => firstPass);
}

function buildTradingScannerAlert(
  summary: ReturnType<typeof summarizeTradingLightScannerDiagnostics>,
) {
  const ok = summary.openMarketCount === 0 || summary.freshOpenMarketCount > 0;

  if (summary.openMarketCount === 0) {
    return {
      ok: true,
      severity: "idle",
      message: "No open trading market requires a live scanner snapshot right now.",
      actionRequired: null,
    };
  }

  if (!ok) {
    return {
      ok: false,
      severity: "critical",
      message: "Open trading markets have no fresh scanner snapshot.",
      actionRequired: "Refresh /api/trading/scanner-refresh before broker execution.",
    };
  }

  if (summary.staleOpenMarketCount > 0) {
    return {
      ok: true,
      severity: "watch",
      message: "At least one open market has a fresh scanner snapshot; stale open markets stay blocked.",
      actionRequired: null,
    };
  }

  return {
    ok: true,
    severity: "ok",
    message: "Open trading markets have fresh scanner snapshots.",
    actionRequired: null,
  };
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const liveFetch = url.searchParams.get("live") !== "0";
  const asOf = new Date().toISOString();
  const [supabase, tradingScannerDiagnostics] = await Promise.all([
    checkSupabase(),
    inspectTradingScannerForHealth({ asOf, liveFetch }),
  ]);
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  const exposeErrors = process.env.NODE_ENV !== "production";
  const twelveDataKeyCount = getTwelveDataApiKeys().length;
  const keyedMarketDataConfigured = Boolean(
    twelveDataKeyCount > 0 ||
      String(process.env.FINNHUB_API_KEY || "").trim() ||
      String(process.env.FMP_API_KEY || process.env.FINANCIAL_MODELING_PREP_API_KEY || "").trim() ||
      String(process.env.ALPHAVANTAGE_API_KEY || process.env.ALPHA_VANTAGE_API_KEY || "").trim(),
  );
  const publicCryptoMarketDataConfigured = true;
  const marketDataConfigured = keyedMarketDataConfigured || publicCryptoMarketDataConfigured;
  const tradingScannerSummary = summarizeTradingLightScannerDiagnostics(
    tradingScannerDiagnostics,
  );
  const tradingScannerAlert = buildTradingScannerAlert(tradingScannerSummary);
  const tradingScannerHealthy =
    tradingScannerSummary.openMarketCount === 0 ||
    tradingScannerSummary.freshOpenMarketCount > 0;
  const warningReasons = [
    !keyedMarketDataConfigured
      ? "keyed_market_data_provider_missing_for_forex_indices_metals"
      : null,
    !tradingScannerHealthy ? "open_markets_without_fresh_scanner_snapshot" : null,
  ].filter((reason): reason is string => Boolean(reason));

  const coreDegraded = !supabase.ok || !stripeConfigured || !clerkConfigured;
  const tradingLiveDegraded = warningReasons.length > 0;
  const status = coreDegraded ? "degraded" : tradingLiveDegraded ? "warning" : "ok";
  const supabaseCheck = exposeErrors
    ? supabase
    : supabase.ok
      ? { ok: true }
      : { ok: false, error: "supabase_unavailable" };
  const tradingScannerCheck = exposeErrors
    ? {
      ok: tradingScannerHealthy,
      summary: tradingScannerSummary,
      alert: tradingScannerAlert,
      }
    : {
      ok: tradingScannerHealthy,
        summary: {
          instrumentCount: tradingScannerSummary.instrumentCount,
          openMarketCount: tradingScannerSummary.openMarketCount,
          freshOpenMarketCount: tradingScannerSummary.freshOpenMarketCount,
          staleOpenMarketCount: tradingScannerSummary.staleOpenMarketCount,
          actionableSnapshotCount: tradingScannerSummary.actionableSnapshotCount,
        },
        alert: tradingScannerAlert,
      };

  return NextResponse.json(
    {
      ok: !coreDegraded,
      status,
      warningReasons,
      checks: {
        supabase: supabaseCheck,
        stripeConfigured,
        clerkConfigured,
        marketDataConfigured,
        keyedMarketDataConfigured,
        publicCryptoMarketDataConfigured,
        tradingScanner: tradingScannerCheck,
      },
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    },
    {
      status: coreDegraded ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

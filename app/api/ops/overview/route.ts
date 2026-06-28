import { getRequestUserId } from "@/lib/auth/requestUser";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { buildPremiumAuditReport } from "@/lib/billing/premiumAuditService";
import { getMarketProviderStatuses } from "@/lib/market/providerStatus";
import {
  buildApiRequestContext,
  jsonWithRequestContext,
  logApiEvent,
  toErrorMessage,
} from "@/lib/ops/apiObservability";
import { loadTradingScannerOperationalDiagnostics } from "@/lib/ops/tradingScannerStatus";
import { buildProductReadinessReport } from "@/lib/ops/productReadiness";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { computeOwnerLoopKpis } from "@/lib/signalcore/ownerLoopKpis";
import { buildOwnerOpsOverview } from "@/lib/signalcore/ownerObservability";
import { buildResearchRuntimeHealth } from "@/lib/trading/research/runtimeHealth";
import { summarizeTradingLightScannerDiagnostics } from "@/lib/trading/lightScanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function inspectTradingScannerForOps(asOf: string) {
  return loadTradingScannerOperationalDiagnostics({ asOf, liveFetch: false });
}

export async function GET(req: Request) {
  const context = buildApiRequestContext(req);
  try {
    const userId = await getRequestUserId(req);
    if (!userId) {
      return jsonWithRequestContext(context, { ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!isOwnerUserId(userId) && !isLocalQaUserId(userId)) {
      return jsonWithRequestContext(context, { ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const asOf = new Date().toISOString();
    const sb = getSupabaseAdmin();

    const [conversionQuery, engineQuery, snapshotQuery, scannerDiagnostics, researchLab, billingAudit] =
      await Promise.all([
        sb
          .from("journal_entries")
          .select("user_id,title,details,created_at")
          .eq("type", "conversion_event")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(20000),
        sb
          .from("journal_entries")
          .select("user_id,title,details,created_at")
          .eq("type", "engine_event")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(20000),
        sb
          .from("daily_snapshots")
          .select("user_id,day_key,created_at,mode")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(20000),
        inspectTradingScannerForOps(asOf),
        buildResearchRuntimeHealth().catch((error) => ({
          ok: false,
          severity: "warn" as const,
          generatedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })),
        buildPremiumAuditReport({ limit: 1000 }).catch((error) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })),
      ]);

    if (conversionQuery.error) {
      return jsonWithRequestContext(context, { ok: false, error: conversionQuery.error.message }, { status: 500 });
    }
    if (engineQuery.error) {
      return jsonWithRequestContext(context, { ok: false, error: engineQuery.error.message }, { status: 500 });
    }
    if (snapshotQuery.error) {
      return jsonWithRequestContext(context, { ok: false, error: snapshotQuery.error.message }, { status: 500 });
    }

    const scannerSummary = summarizeTradingLightScannerDiagnostics(scannerDiagnostics);
    const marketProviders = getMarketProviderStatuses();
    const researchForReadiness = "queue" in researchLab ? researchLab : null;
    const billingForReadiness = "summary" in billingAudit ? billingAudit : null;
    const readiness = buildProductReadinessReport({
      billing: billingForReadiness,
      billingError: "error" in billingAudit ? billingAudit.error : null,
      marketProviders,
      research: researchForReadiness,
      researchError: "error" in researchLab ? researchLab.error : null,
      scanner: scannerSummary,
    });
    const loopKpis = computeOwnerLoopKpis({
      days,
      conversionEvents: Array.isArray(conversionQuery.data) ? (conversionQuery.data as any[]) : [],
      dailySnapshots: Array.isArray(snapshotQuery.data) ? (snapshotQuery.data as any[]) : [],
    });

    const overview = buildOwnerOpsOverview({
      generatedAt: new Date().toISOString(),
      conversionRows: Array.isArray(conversionQuery.data) ? (conversionQuery.data as any[]) : [],
      engineRows: Array.isArray(engineQuery.data) ? (engineQuery.data as any[]) : [],
      loopKpis,
      tradingLiveOk:
        scannerSummary.openMarketCount === 0 ||
        scannerSummary.freshOpenMarketCount > 0,
      scannerFreshOpenMarketCount: scannerSummary.freshOpenMarketCount,
      scannerOpenMarketCount: scannerSummary.openMarketCount,
      providerErrorCounts: scannerSummary.providerErrorCounts,
    });

    return jsonWithRequestContext(
      context,
      {
        ok: true,
        days,
        since,
        scannerSummary,
        researchLab,
        marketProviders,
        readiness,
        overview,
      },
      { status: 200 },
    );
  } catch (error) {
    logApiEvent({
      scope: "ops.overview",
      level: "error",
      context,
      details: { error: toErrorMessage(error, "ops_overview_failed") },
    });
    return jsonWithRequestContext(
      context,
      {
        ok: false,
        error: "ops_overview_failed",
        message: toErrorMessage(error, "Unknown"),
      },
      { status: 500 },
    );
  }
}

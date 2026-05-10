import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/auth/requestUser";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isLocalQaUserId } from "@/lib/auth/localQaAuth";
import { isOwnerUserId } from "@/lib/signalcore/owner";
import { computeOwnerLoopKpis } from "@/lib/signalcore/ownerLoopKpis";
import { buildOwnerOpsOverview } from "@/lib/signalcore/ownerObservability";
import { buildResearchRuntimeHealth } from "@/lib/trading/research/runtimeHealth";
import {
  inspectTradingLightScanner,
  summarizeTradingLightScannerDiagnostics,
} from "@/lib/trading/lightScanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

async function inspectTradingScannerForOps(asOf: string) {
  const firstPass = await inspectTradingLightScanner({
    asOf,
    liveFetch: true,
    openMarketsOnlyLiveFetch: true,
  });
  const firstSummary = summarizeTradingLightScannerDiagnostics(firstPass);
  const needsHardRefresh =
    firstSummary.openMarketCount > 0 &&
    firstSummary.freshOpenMarketCount === 0;

  if (!needsHardRefresh) return firstPass;

  return inspectTradingLightScanner({
    asOf,
    liveFetch: true,
    forceProviderRefresh: true,
    openMarketsOnlyLiveFetch: true,
  }).catch(() => firstPass);
}

export async function GET(req: Request) {
  try {
    const userId = await getRequestUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!isOwnerUserId(userId) && !isLocalQaUserId(userId)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const asOf = new Date().toISOString();
    const sb = getSupabaseAdmin();

    const [conversionQuery, engineQuery, snapshotQuery, scannerDiagnostics, researchLab] =
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
      ]);

    if (conversionQuery.error) {
      return NextResponse.json({ ok: false, error: conversionQuery.error.message }, { status: 500 });
    }
    if (engineQuery.error) {
      return NextResponse.json({ ok: false, error: engineQuery.error.message }, { status: 500 });
    }
    if (snapshotQuery.error) {
      return NextResponse.json({ ok: false, error: snapshotQuery.error.message }, { status: 500 });
    }

    const scannerSummary = summarizeTradingLightScannerDiagnostics(scannerDiagnostics);
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

    return NextResponse.json(
      {
        ok: true,
        days,
        since,
        scannerSummary,
        researchLab,
        overview,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "ops_overview_failed",
        message: e?.message || "Unknown",
      },
      { status: 500 },
    );
  }
}

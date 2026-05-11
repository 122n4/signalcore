import { NextResponse } from "next/server";

import { isEngineLoopAuthorized } from "@/lib/engine/loopAuth";
import { buildTradingLightScannerInputs } from "@/lib/trading/lightScanner";
import {
  readFreshTradingScannerSnapshots,
  writeTradingScannerSnapshots,
} from "@/lib/trading/scannerSnapshotStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request) {
  return isEngineLoopAuthorized({ headers: req.headers, env: process.env });
}

function summarizeInputs(
  inputs: Awaited<ReturnType<typeof buildTradingLightScannerInputs>>,
) {
  const sourceCounts: Record<string, number> = {};
  let marketOpenCount = 0;
  let freshOpenMarketCount = 0;
  let actionableSnapshotCount = 0;
  let staleOpenMarketCount = 0;
  const freshOpenInstruments: string[] = [];
  const staleOpenInstruments: string[] = [];

  for (const input of inputs) {
    const source = input.scannerSnapshot?.source ?? "unknown";
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    if (input.market.session.marketOpen) {
      marketOpenCount += 1;
      if (!input.scannerSnapshot?.actionableFreshness) {
        staleOpenMarketCount += 1;
        staleOpenInstruments.push(input.snapshot.instrument);
      } else {
        freshOpenMarketCount += 1;
        freshOpenInstruments.push(input.snapshot.instrument);
      }
    }
    if (input.scannerSnapshot?.actionableFreshness) {
      actionableSnapshotCount += 1;
    }
  }

  return {
    inputCount: inputs.length,
    marketOpenCount,
    freshOpenMarketCount,
    actionableSnapshotCount,
    staleOpenMarketCount,
    freshOpenInstruments,
    staleOpenInstruments,
    sourceCounts,
    instruments: inputs.map((input) => ({
      instrument: input.snapshot.instrument,
      snapshotAt: input.snapshot.snapshotAt,
      marketOpen: input.market.session.marketOpen,
      source: input.scannerSnapshot?.source ?? "unknown",
      actionableFreshness: input.scannerSnapshot?.actionableFreshness ?? false,
      providerError: input.scannerSnapshot?.providerError ?? null,
      staleReason: input.scannerSnapshot?.staleReason ?? null,
    })),
  };
}

async function handleRefresh(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const asOf = new Date().toISOString();

  try {
    const storedScannerSnapshots = await readFreshTradingScannerSnapshots({ asOf });
    const inputs = await buildTradingLightScannerInputs({
      asOf,
      forceRefresh: true,
      forceProviderRefresh: true,
      includeInactiveMarkets: true,
      storedInputs: storedScannerSnapshots.inputs,
    });
    const persist = await writeTradingScannerSnapshots({
      inputs,
      generatedAt: asOf,
    });
    const summary = summarizeInputs(inputs);
    const scannerHealthy = summary.marketOpenCount === 0 || summary.staleOpenMarketCount === 0;
    const storageHealthy = persist.schemaReady || persist.persisted;
    const refreshCompleted = storageHealthy;
    const executionReady = scannerHealthy && storageHealthy;
    const scannerAlert =
      summary.marketOpenCount === 0
        ? {
            ok: true,
            severity: "idle",
            message: "No open trading market requires a live scanner snapshot right now.",
            actionRequired: null,
          }
        : scannerHealthy
          ? {
              ok: true,
              severity: "ok",
              message: "Open trading markets refreshed with actionable snapshots.",
              actionRequired: null,
            }
          : {
              ok: false,
              severity: "critical",
              message: "At least one open trading market still has a stale scanner snapshot.",
              actionRequired: "Retry refresh before broker execution.",
            };
    const warningReasons = [
      !scannerHealthy ? "open_markets_without_fresh_scanner_snapshot" : null,
      persist.skippedStaleOpenCount > 0 ? "stale_open_market_snapshots_not_persisted" : null,
      !storageHealthy ? "trading_scanner_snapshot_store_unavailable" : null,
    ].filter((reason): reason is string => Boolean(reason));

    return NextResponse.json(
      {
        ok: refreshCompleted,
        asOf,
        healthy: scannerHealthy,
        executionReady,
        warningReasons,
        persisted: persist.persisted,
        schemaReady: persist.schemaReady,
        persistedCount: persist.count,
        skippedStaleOpenCount: persist.skippedStaleOpenCount,
        persistError: persist.error,
        alert: scannerAlert,
        summary,
      },
      {
        status: refreshCompleted ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        asOf,
        error: error?.message ?? "trading_scanner_refresh_failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function GET(req: Request) {
  return handleRefresh(req);
}

export async function POST(req: Request) {
  return handleRefresh(req);
}

import { NextResponse } from "next/server";

import { isEngineLoopAuthorized } from "@/lib/engine/loopAuth";
import { createTradingMarketDataSnapshot } from "@/lib/trading/data";
import { readSession } from "@/lib/trading/market";
import {
  TRADING_LIGHT_SCANNER_ACTIONABLE_MAX_AGE_MS,
  TRADING_LIGHT_SCANNER_INSTRUMENTS,
  buildTradingLightScannerInputs,
} from "@/lib/trading/lightScanner";
import {
  readLatestTradingScannerSnapshots,
  writeTradingScannerSnapshots,
} from "@/lib/trading/scannerSnapshotStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request) {
  return isEngineLoopAuthorized({ headers: req.headers, env: process.env });
}

const PRIORITY_REFRESH_ORDER = [
  "BTCUSD",
  "ETHUSD",
  "XAUUSD",
  "EURUSD",
  "NAS100",
  "US500",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "EURJPY",
  "GBPJPY",
  "USDCHF",
  "EURGBP",
  "AUDJPY",
  "NZDUSD",
  "NZDJPY",
  "EURCHF",
  "XAGUSD",
];

function positiveIntegerFromSearch(
  url: URL,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(url.searchParams.get(key));
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function positiveIntegerFromEnv(key: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[key]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function orderedScannerInstruments() {
  const configured = new Set(
    TRADING_LIGHT_SCANNER_INSTRUMENTS.map((config) => config.instrument.trim().toUpperCase()),
  );
  const priority = PRIORITY_REFRESH_ORDER.filter((instrument) => configured.has(instrument));
  const remaining = TRADING_LIGHT_SCANNER_INSTRUMENTS.map((config) =>
    config.instrument.trim().toUpperCase(),
  ).filter((instrument) => !priority.includes(instrument));

  return [...priority, ...remaining];
}

function normalizeInstrument(input: unknown) {
  return String(input ?? "")
    .trim()
    .toUpperCase();
}

function isFreshStoredScannerInput(input: any, asOf: string) {
  if (input?.scannerSnapshot?.actionableFreshness !== true) {
    return false;
  }

  const asOfMs = Date.parse(asOf);
  const snapshotAtMs = Date.parse(String(input?.snapshot?.snapshotAt ?? ""));

  if (!Number.isFinite(asOfMs) || !Number.isFinite(snapshotAtMs)) {
    return false;
  }

  return Math.max(0, asOfMs - snapshotAtMs) <= TRADING_LIGHT_SCANNER_ACTIONABLE_MAX_AGE_MS;
}

function resolveOpenStalePriorityInstruments(args: {
  asOf: string;
  storedInputs: Awaited<ReturnType<typeof readLatestTradingScannerSnapshots>>["inputs"];
}) {
  const storedByInstrument = new Map(
    args.storedInputs.map((input) => [normalizeInstrument(input?.snapshot?.instrument), input]),
  );

  return TRADING_LIGHT_SCANNER_INSTRUMENTS.filter((config) => {
    const session = readSession(
      createTradingMarketDataSnapshot({
        instrument: config.instrument,
        marketType: config.marketType,
        sessionProfile: config.sessionProfile,
        snapshotAt: args.asOf,
        timeframes: {},
      }),
    );

    if (!session.marketOpen) {
      return false;
    }

    const storedInput = storedByInstrument.get(config.instrument);
    return !isFreshStoredScannerInput(storedInput, args.asOf);
  }).map((config) => config.instrument);
}

function resolveRefreshBatch(args: {
  asOf: string;
  url: URL;
  storedInputs: Awaited<ReturnType<typeof readLatestTradingScannerSnapshots>>["inputs"];
}) {
  const ordered = orderedScannerInstruments();
  const manualInstruments = String(args.url.searchParams.get("instruments") || "")
    .split(",")
    .map((instrument) => instrument.trim().toUpperCase())
    .filter((instrument) => ordered.includes(instrument));

  if (manualInstruments.length > 0) {
    return {
      mode: "manual",
      batchSize: manualInstruments.length,
      batchIndex: 0,
      batchCount: 1,
      refreshEveryMinutes: null,
      instruments: Array.from(new Set(manualInstruments)),
    };
  }

  const batchSize = positiveIntegerFromSearch(
    args.url,
    "batchSize",
    positiveIntegerFromEnv("TRADING_SCANNER_REFRESH_BATCH_SIZE", 1, 1, ordered.length),
    1,
    ordered.length,
  );
  const refreshEveryMinutes = positiveIntegerFromSearch(
    args.url,
    "batchMinutes",
    positiveIntegerFromEnv("TRADING_SCANNER_REFRESH_BATCH_MINUTES", 2, 1, 15),
    1,
    15,
  );
  const batchCount = Math.max(1, Math.ceil(ordered.length / batchSize));
  const asOfMs = Date.parse(args.asOf);
  const bucket = Number.isFinite(asOfMs)
    ? Math.floor(asOfMs / (refreshEveryMinutes * 60_000))
    : Math.floor(Date.now() / (refreshEveryMinutes * 60_000));
  const batchIndex = ((bucket % batchCount) + batchCount) % batchCount;
  const start = batchIndex * batchSize;
  const scheduled = ordered.slice(start, start + batchSize);
  const storedInstrumentSet = new Set(
    args.storedInputs.map((input) => input.snapshot.instrument.trim().toUpperCase()),
  );
  const staleOpenPriority = resolveOpenStalePriorityInstruments(args).filter(
    (instrument) => !scheduled.includes(instrument),
  );
  const missingPriority = ordered
    .filter((instrument) => !storedInstrumentSet.has(instrument))
    .filter((instrument) => !scheduled.includes(instrument))
    .filter((instrument) => !staleOpenPriority.includes(instrument))
    .slice(0, Math.max(0, batchSize - scheduled.length));

  return {
    mode: "rotating",
    batchSize,
    batchIndex,
    batchCount,
    refreshEveryMinutes,
    staleOpenPriority,
    instruments: Array.from(new Set([...scheduled, ...staleOpenPriority, ...missingPriority])),
  };
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

async function maybeRunPaperBot() {
  return {
    enabled: false,
    reason: "scanner_refresh_is_snapshot_only",
    results: [],
  };
}

async function handleRefresh(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const asOf = new Date().toISOString();
  const url = new URL(req.url);

  try {
    const storedScannerSnapshots = await readLatestTradingScannerSnapshots({ asOf });
    const refreshBatch = resolveRefreshBatch({
      asOf,
      url,
      storedInputs: storedScannerSnapshots.inputs,
    });
    const inputs = await buildTradingLightScannerInputs({
      asOf,
      forceRefresh: true,
      forceProviderRefresh: url.searchParams.get("force") === "1",
      includeInactiveMarkets: true,
      liveFetchInstruments: refreshBatch.instruments,
      storedInputs: storedScannerSnapshots.inputs,
    });
    const persist = await writeTradingScannerSnapshots({
      inputs,
      generatedAt: asOf,
    });
    const summary = summarizeInputs(inputs);
    const paperBot = await maybeRunPaperBot();
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
        refreshBatch,
        paperBot,
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

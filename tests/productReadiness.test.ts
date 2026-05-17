import { describe, expect, it } from "vitest";

import { buildProductReadinessReport } from "@/lib/ops/productReadiness";
import type { MarketProviderStatus } from "@/lib/market/providerStatus";

const providers: MarketProviderStatus[] = [
  {
    provider: "coinbase",
    label: "Coinbase",
    configured: true,
    publicAccess: true,
    role: "primary",
    markets: ["crypto"],
    detail: "public",
  },
  {
    provider: "binance",
    label: "Binance",
    configured: true,
    publicAccess: true,
    role: "primary",
    markets: ["crypto"],
    detail: "public",
  },
  {
    provider: "twelvedata",
    label: "Twelve Data",
    configured: true,
    publicAccess: false,
    role: "primary",
    markets: ["forex", "equities"],
    detail: "configured",
  },
  {
    provider: "fmp",
    label: "FMP",
    configured: true,
    publicAccess: false,
    role: "fallback",
    markets: ["forex", "equities"],
    detail: "configured",
  },
];

describe("product readiness", () => {
  it("fails when open markets have no fresh scanner snapshots", () => {
    const report = buildProductReadinessReport({
      billing: null,
      billingError: "not checked",
      marketProviders: providers,
      research: null,
      scanner: {
        instrumentCount: 10,
        openMarketCount: 3,
        freshOpenMarketCount: 0,
        staleOpenMarketCount: 3,
        actionableSnapshotCount: 0,
        sourceCounts: { provider: 0, cache: 0, catalog: 0, empty: 10 },
        coverageCounts: { coverage_backed: 10, staged_only: 0, live_only: 0 },
        providerErrorCounts: {},
      },
    });

    expect(report.severity).toBe("fail");
    expect(report.checks.map((check) => check.id)).toContain("scanner-no-fresh-open-markets");
  });

  it("returns ok when scanner, providers, billing and research are clear", () => {
    const report = buildProductReadinessReport({
      billing: {
        ok: true,
        generatedAt: new Date().toISOString(),
        filteredByEmails: null,
        summary: {
          checked: 1,
          premium: 1,
          warn: 0,
          fail: 0,
          manualMetadataPremium: 0,
          stripePremium: 1,
          ownerOverridePremium: 0,
        },
        users: [],
      },
      marketProviders: providers,
      research: {
        ok: true,
        severity: "ok",
        generatedAt: new Date().toISOString(),
        queue: { activeRunId: null, idleReason: null, pending: 0, running: 0, awaitingDecision: 0, failed: 0 },
        lock: { present: false, health: "missing", heartbeatAt: null, heartbeatAgeMs: null, stage: null, runnerPid: null },
        activeRun: {
          runId: null,
          taskId: null,
          status: null,
          stage: null,
          startedAt: null,
          updatedAt: null,
          stageStartedAt: null,
          stageElapsedMs: null,
          stageWarnMs: 1,
          stageHardTimeoutMs: 2,
          stageHealth: "unknown",
          statusPath: null,
        },
        backfill: { generatedAt: null, existing: 10, missingDownloadable: 0, missingManual: 0, reportPath: "report.json" },
        alerts: [],
      },
      scanner: {
        instrumentCount: 10,
        openMarketCount: 2,
        freshOpenMarketCount: 2,
        staleOpenMarketCount: 0,
        actionableSnapshotCount: 2,
        sourceCounts: { provider: 2, cache: 8, catalog: 0, empty: 0 },
        coverageCounts: { coverage_backed: 10, staged_only: 0, live_only: 0 },
        providerErrorCounts: {},
      },
    });

    expect(report.severity).toBe("ok");
    expect(report.score).toBe(100);
  });
});

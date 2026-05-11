import { describe, expect, it } from "vitest";

import { composeTradingWatchlistEntry } from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

describe("trading workspace snapshot", () => {
  it("attaches market, setup, decision, playbook, execution, and performance blocks per asset", () => {
    const input = createTradingLiveDecisionInput();
    input.snapshot.instrument = "EURUSD";
    input.market.instrument = "EURUSD";
    input.decisionCore.decision.currentState = "TRADE_VALID";

    const entry = composeTradingWatchlistEntry(input);

    expect(entry.workspace.instrument).toBe("EURUSD");
    expect(entry.workspace.market.structure.state).toBe(input.market.structure.state);
    expect(entry.workspace.setupCore.setup.type).toBe(input.setupCore.setup.type);
    expect(entry.workspace.decisionCore.decision.currentState).toBe("TRADE_VALID");
    expect(entry.workspace.playbook.definition?.name).toBe("Core Trading Playbook");
    expect(entry.workspace.playbook.check?.executionAllowed).toBe(true);
    expect(entry.workspace.execution.executionStatus.executionStatus).toBe(
      entry.liveDecision.executionStatus,
    );
    expect(entry.operationalReadiness.status).toBe("watch_only");
    expect(entry.operationalReadiness.brokerReady).toBe(false);
    expect(entry.workspace.performance.eventCount).toBe(entry.liveDecision.feed.length);
    expect(entry.workspace.whySummary.whyNow).toBe("Setup aligned");
    expect(entry.workspace.whySummary.whyNotNow).toBeNull();
  });

  it("marks only fresh coverage-backed allowed setups as broker-ready", () => {
    const input = createTradingLiveDecisionInput();
    input.snapshot.instrument = "EURUSD";
    input.market.instrument = "EURUSD";
    input.scannerSnapshot = {
      source: "provider",
      providerError: null,
      dataSymbol: "EUR/USD",
      dataRelation: "direct",
      snapshotAgeMs: 60_000,
      actionableFreshness: true,
      staleReason: null,
    };
    input.scannerCoverage = {
      status: "coverage_backed",
      label: "Coverage-backed",
      detail: "Backed by the curated Syntrake market coverage catalog.",
      source: "dataset_health",
    };

    const entry = composeTradingWatchlistEntry(input);

    expect(entry.operationalReadiness).toMatchObject({
      status: "broker_ready",
      label: "Ready to execute",
      brokerReady: true,
      tone: "good",
    });
  });

  it("marks stale or unavailable live data as provider-limited", () => {
    const input = createTradingLiveDecisionInput();
    input.snapshot.instrument = "NAS100";
    input.market.instrument = "NAS100";
    input.scannerSnapshot = {
      source: "empty",
      providerError: "twelvedata:You have run out of API credits for the current minute.",
      dataSymbol: "NDX",
      dataRelation: "direct",
      snapshotAgeMs: null,
      actionableFreshness: false,
      staleReason: "Live market data is unavailable. Refresh live market data before executing.",
    };
    input.scannerCoverage = {
      status: "coverage_backed",
      label: "Coverage-backed",
      detail: "Backed by the curated Syntrake market coverage catalog.",
      source: "dataset_health",
    };

    const entry = composeTradingWatchlistEntry(input);

    expect(entry.operationalReadiness).toMatchObject({
      status: "provider_limited",
      label: "Provider limited",
      brokerReady: false,
      tone: "bad",
    });
  });
});

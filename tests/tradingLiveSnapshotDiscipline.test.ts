import { describe, expect, it } from "vitest";

import {
  TRADING_LIVE_SNAPSHOT_MAX_AGE_MS,
  applyTradingLiveSnapshotDiscipline,
  assessTradingLiveSnapshot,
} from "@/lib/trading/liveSnapshotDiscipline";
import { composeDecisionEnvelope } from "@/lib/decision/composeDecisionEnvelope";
import type { TradingWatchlistEntry } from "@/lib/trading/state";
import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

function buildEntry(snapshotAt: string): TradingWatchlistEntry {
  return {
    instrument: "EURUSD",
    currentState: "TRADE_VALID",
    currentHeadline: "Clean trigger and execution aligned.",
    executionStatus: "allowed",
    operationalReadiness: {
      status: "broker_ready",
      label: "Ready to execute",
      detail: "Live data, research coverage, and execution gate are aligned.",
      brokerReady: true,
      tone: "good",
    },
    contextSummary: {
      sessionLabel: "London / NY overlap",
      contextLabel: "Trend continuation with open market.",
      marketOpen: true,
      coverageStatus: "coverage_backed",
      coverageLabel: "Coverage-backed",
    },
    liveDecision: {
      currentState: "TRADE_VALID",
      currentHeadline: "Clean trigger and execution aligned.",
      currentBody: "Execute only on trigger.",
      instrument: "EURUSD",
      direction: "long",
      triggerLevel: 1.105,
      entryZoneLow: 1.104,
      entryZoneHigh: 1.106,
      invalidationLevel: 1.099,
      targetZone: "1.1120-1.1140",
      riskPct: 0.5,
      executionStatus: "allowed",
      reasons: ["Playbook aligned."],
      nextDisciplineStep: "Execute only on trigger.",
      feed: [],
    },
    chart: {
      instrument: "EURUSD",
      timeframe: "15m",
      snapshotAt,
      candles: [],
    },
    workspace: {
      instrument: "EURUSD",
      contextSummary: {
        sessionLabel: "London / NY overlap",
        contextLabel: "Trend continuation with open market.",
        marketOpen: true,
        coverageStatus: "coverage_backed",
        coverageLabel: "Coverage-backed",
      },
      whySummary: {
        whyNow: "Momentum and structure are aligned.",
        whyNotNow: null,
      },
      market: {} as any,
      setupCore: {} as any,
      decisionCore: {} as any,
      playbook: {} as any,
      execution: {
        entryZone: {
          triggerType: "break",
          triggerLevel: 1.105,
          entryZoneLow: 1.104,
          entryZoneHigh: 1.106,
        },
        invalidation: {
          invalidationLevel: 1.099,
          invalidationType: "hard",
          confidence: 82,
        },
        tradePath: {
          targetZone: "1.1120-1.1140",
        },
        riskFraming: {
          riskPct: 0.5,
          sizeAdjustment: 1,
          riskMode: "normal",
        },
        executionStatus: {
          executionStatus: "allowed",
          reasons: ["Playbook aligned."],
          nextDisciplineStep: "Execute only on trigger.",
        },
      },
      performance: {
        sessionId: "eurusd:2026-03-31:london_ny_overlap",
        instrument: "EURUSD",
        startedAt: snapshotAt,
        latestTimestamp: snapshotAt,
        latestHeadline: "Clean trigger and execution aligned.",
        latestState: "TRADE_VALID",
        eventCount: 1,
        stateCounts: { TRADE_VALID: 1 },
      },
    },
    watchlistPlacement: {
      sectionKey: "look_first",
      sectionTitle: "Look first",
      sectionDescription: "Start here.",
      rankInSection: 0,
      isLeadEntry: true,
      isSessionFocus: true,
    },
  };
}

describe("trading live snapshot discipline", () => {
  it("treats an open-market snapshot older than 5 minutes as blocked", () => {
    const now = "2026-03-31T23:28:00.000Z";
    const snapshotAt = "2026-03-31T23:17:00.000Z";

    const result = assessTradingLiveSnapshot({
      snapshotAt,
      marketOpen: true,
      now,
    });

    expect(result.blocked).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.reason).toContain("stale");
  });

  it("keeps a recent open-market snapshot valid", () => {
    const now = "2026-03-31T23:28:00.000Z";
    const snapshotAt = new Date(
      Date.parse(now) - (TRADING_LIVE_SNAPSHOT_MAX_AGE_MS - 60_000),
    ).toISOString();

    const result = assessTradingLiveSnapshot({
      snapshotAt,
      marketOpen: true,
      now,
    });

    expect(result.blocked).toBe(false);
    expect(result.stale).toBe(false);
  });

  it("downgrades a stale TRADE_VALID entry to WAIT/restricted in the client", () => {
    const entry = buildEntry("2026-03-31T03:50:00.000Z");

    const result = applyTradingLiveSnapshotDiscipline(
      entry,
      "2026-03-31T23:28:00.000Z",
    );

    expect(result.currentState).toBe("WAIT");
    expect(result.executionStatus).toBe("restricted");
    expect(result.liveDecision.currentState).toBe("WAIT");
    expect(result.liveDecision.executionStatus).toBe("restricted");
    expect(result.liveDecision.nextDisciplineStep).toContain("stale");
    expect(result.workspace.execution.executionStatus.executionStatus).toBe("restricted");
    expect(result.workspace.whySummary.whyNotNow).toContain("stale");
  });

  it("applies stale live snapshot discipline before publishing the trading watchlist", () => {
    const input = createTradingLiveDecisionInput();
    input.snapshot.instrument = "BTCUSD";
    input.market.instrument = "BTCUSD";
    input.decisionCore.decision.currentState = "TRADE_VALID";
    input.snapshot.snapshotAt = "2026-05-10T06:55:00.000Z";
    input.market.session.marketOpen = true;

    const envelope = composeDecisionEnvelope({
      mode: "investing",
      asOf: "2026-05-10T07:10:00.000Z",
      branch: "success",
      branchReason: null,
      nextBestAction: null,
      whyNow: null,
      operationalAction: null,
      decisionGovernance: null,
      actionGate: null,
      riskPolicyEval: null,
      capitalStatus: null,
      decisionScores: null,
      diagnostics: null,
      engineV4: null,
      tradingWatchlistInputs: [input],
    });

    const entry = envelope.support.trading?.watchlistSections[0]?.entries[0];

    expect(entry?.currentState).toBe("WAIT");
    expect(entry?.executionStatus).toBe("restricted");
    expect(entry?.liveDecision.nextDisciplineStep).toContain("stale");
  });
});

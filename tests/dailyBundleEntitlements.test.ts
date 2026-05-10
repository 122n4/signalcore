import { describe, expect, it } from "vitest";

import { attachDecisionEnvelopeToDailyBundleRouteResponse } from "@/app/api/daily-bundle/route";
import { applyDailyBundleEntitlements } from "@/lib/signalcore/dailyBundleEntitlements";
import { getEntitlementsForTier } from "@/lib/signalcore/entitlements";
import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

function makeTradingResponse() {
  return {
    ok: true,
    mode: "trading" as const,
    asOf: "2026-03-23T12:00:00.000Z",
    plan: { id: "plan_trading", status: "active" },
    portfolio: { cash: 10_000, items: [] },
    daily: {
      opportunities: [
        { instrument: "EURUSD" },
        { instrument: "GBPUSD" },
        { instrument: "USDJPY" },
        { instrument: "US500" },
      ],
      top_opportunities: [
        { instrument: "EURUSD" },
        { instrument: "GBPUSD" },
        { instrument: "USDJPY" },
        { instrument: "US500" },
      ],
      opportunities_dashboard: [
        { instrument: "EURUSD" },
        { instrument: "GBPUSD" },
        { instrument: "USDJPY" },
        { instrument: "US500" },
      ],
      opportunityQueue: {
        generatedAt: "2026-03-23T12:00:00.000Z",
        topPriority: 83,
        items: [
          { instrument: "EURUSD", priority: 83 },
          { instrument: "GBPUSD", priority: 74 },
          { instrument: "USDJPY", priority: 68 },
          { instrument: "US500", priority: 62 },
        ],
      },
      decisionGovernance: {
        top_opportunities: [
          { instrument: "EURUSD" },
          { instrument: "GBPUSD" },
          { instrument: "USDJPY" },
          { instrument: "US500" },
        ],
        opportunities: [
          { instrument: "EURUSD" },
          { instrument: "GBPUSD" },
          { instrument: "USDJPY" },
          { instrument: "US500" },
        ],
      },
    },
    derived: {},
  };
}

function makeTradingInput(instrument: string, state: "WAIT" | "TRADE_VALID" | "TRADE_ACTIVE") {
  const input = createTradingLiveDecisionInput();
  input.snapshot.instrument = instrument;
  input.market.instrument = instrument;
  input.decisionCore.decision.currentState = state;
  return input;
}

describe("daily bundle server entitlements", () => {
  it("trims trading discovery payloads on the server for free users", () => {
    const response = attachDecisionEnvelopeToDailyBundleRouteResponse({
      response: makeTradingResponse(),
      branch: "success",
      branchReason: null,
      tradingWatchlistInputs: [
        makeTradingInput("EURUSD", "TRADE_VALID"),
        makeTradingInput("GBPUSD", "TRADE_VALID"),
        makeTradingInput("USDJPY", "WAIT"),
        makeTradingInput("US500", "WAIT"),
      ],
    });

    const trading = response.daily.decisionEnvelope.support.trading!;
    const leadEntry = trading.watchlist[0]!;

    leadEntry.liveDecision.feed = [
      {
        id: "old",
        timestamp: "2026-03-01T12:00:00.000Z",
        state: leadEntry.liveDecision.currentState,
        headline: "Old event",
      },
      {
        id: "new",
        timestamp: "2026-03-23T11:45:00.000Z",
        state: leadEntry.liveDecision.currentState,
        headline: "Fresh event",
      },
    ];
    leadEntry.chart = {
      instrument: leadEntry.instrument,
      timeframe: "15m",
      snapshotAt: "2026-03-23T12:00:00.000Z",
      candles: [
        {
          timestamp: "2026-03-01T12:00:00.000Z",
          open: 1,
          high: 1.1,
          low: 0.9,
          close: 1.02,
          volume: 10,
        },
        {
          timestamp: "2026-03-23T11:45:00.000Z",
          open: 1.02,
          high: 1.12,
          low: 0.98,
          close: 1.08,
          volume: 12,
        },
      ],
    };
    trading.liveDecision = leadEntry.liveDecision;
    trading.chart = leadEntry.chart;

    const out = applyDailyBundleEntitlements(response, {
      mode: "trading",
      tier: "free",
      entitlements: getEntitlementsForTier("free"),
      asOf: response.asOf,
    });

    expect((out.daily as any).tradingAccess).toMatchObject({
      tier: "free",
      discoveryInstrumentLimit: 3,
      weeklyOpportunityBudget: 3,
      executionEnabled: false,
      discoveryApplied: true,
    });
    expect((out.derived as any).tradingAccess).toMatchObject({
      tier: "free",
      lockedTradingViews: ["execution", "risk", "journal", "alerts"],
    });
    expect(out.daily.decisionEnvelope.support.trading?.watchlist.length).toBe(3);
    expect(
      out.daily.decisionEnvelope.support.trading?.watchlistSections.flatMap((section) => section.entries)
        .length,
    ).toBe(3);
    expect(out.daily.decisionEnvelope.support.trading?.marketCoverageSummary).toEqual({
      coverageBackedCount: 0,
      stagedOnlyCount: 0,
      liveOnlyCount: 3,
    });
    expect(out.daily.decisionEnvelope.support.trading?.liveDecision.feed).toHaveLength(1);
    expect(out.daily.decisionEnvelope.support.trading?.chart?.candles).toHaveLength(1);
    expect(out.daily.opportunities).toHaveLength(3);
    expect(out.daily.top_opportunities).toHaveLength(3);
    expect(out.daily.opportunities_dashboard).toHaveLength(3);
    expect(out.daily.opportunityQueue.items).toHaveLength(3);
    expect(out.daily.decisionGovernance.top_opportunities).toHaveLength(3);
    expect(out.daily.decisionGovernance.opportunities).toHaveLength(3);
  });

  it("keeps the full trading payload for trial and pro tiers", () => {
    const response = attachDecisionEnvelopeToDailyBundleRouteResponse({
      response: makeTradingResponse(),
      branch: "success",
      branchReason: null,
      tradingWatchlistInputs: [
        makeTradingInput("EURUSD", "TRADE_VALID"),
        makeTradingInput("GBPUSD", "TRADE_VALID"),
        makeTradingInput("USDJPY", "WAIT"),
        makeTradingInput("US500", "WAIT"),
      ],
    });

    const out = applyDailyBundleEntitlements(response, {
      mode: "trading",
      tier: "trial",
      entitlements: getEntitlementsForTier("trial"),
      asOf: response.asOf,
    });

    expect((out.daily as any).tradingAccess).toMatchObject({
      tier: "trial",
      executionEnabled: true,
      discoveryApplied: false,
    });
    expect(out.daily.decisionEnvelope.support.trading?.watchlist.length).toBeGreaterThanOrEqual(4);
    expect(out.daily.opportunities).toHaveLength(4);
    expect(out.daily.opportunityQueue.items).toHaveLength(4);
  });
});

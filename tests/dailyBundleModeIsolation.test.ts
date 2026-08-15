import { describe, expect, it } from "vitest";

import {
  buildDailyPaywallState,
  finalizeDailyBundleResponse,
  isolateInvestingCompatibilityAuthorityResponse,
  shouldLoadTradingWatchlistForDailyBundle,
} from "@/app/api/daily-bundle/route";
import { pickActivePlan } from "@/lib/signalcore/planRepo";

const freeBilling = {
  plan: "free" as const,
  trialActive: false,
  trialEndsAt: null,
  proActive: false,
  trialStarted: false,
  trialExpired: false,
  source: "test_free",
};

const readyDailyNode = {
  nextBestAction: {
    type: "BUY",
    reason: "Portfolio is ready for a controlled investing action.",
  },
  capitalStatus: {
    posture: "STABLE",
    nextEvaluationAt: "2026-05-10T18:00:00.000Z",
  },
  actionGate: {
    status: "ready",
    allowExecution: true,
  },
};

describe("daily bundle mode isolation", () => {
  it("does not load trading scanner inputs for investing mode", () => {
    expect(shouldLoadTradingWatchlistForDailyBundle("investing")).toBe(false);
    expect(shouldLoadTradingWatchlistForDailyBundle("trading")).toBe(true);
  });

  it("keeps investing daily decisions fully visible for free users", () => {
    const state = buildDailyPaywallState({
      asOf: "2026-05-10T12:00:00.000Z",
      mode: "investing",
      billing: freeBilling,
      dailyNode: readyDailyNode,
      perfectLoop: {
        paywallActivation: {
          eligibleNow: true,
        },
      },
      receiptsCount: 3,
      doneToday: false,
      hasPlan: true,
      hasHoldings: true,
      actionGate: readyDailyNode.actionGate,
    });

    expect(state.paywall.show).toBe(false);
    expect(state.paywall.decisionExposure).toBe("FULL");
    expect(state.paywall.continuityPolicy).toBe("investing_free_forever");
    expect(state.nextBestActionPreview.status).toBe("READY");
  });

  it("keeps the trading continuity activation boundary for free users", () => {
    const state = buildDailyPaywallState({
      asOf: "2026-05-10T12:00:00.000Z",
      mode: "trading",
      billing: freeBilling,
      dailyNode: readyDailyNode,
      perfectLoop: {
        paywallActivation: {
          eligibleNow: true,
        },
      },
      receiptsCount: 3,
      doneToday: false,
      hasPlan: true,
      hasHoldings: true,
      actionGate: readyDailyNode.actionGate,
    });

    expect(state.paywall.show).toBe(true);
    expect(state.paywall.decisionExposure).toBe("PREVIEW_ONLY");
    expect(state.paywall.continuityPolicy).toBe("continuity_first");
  });

  it("structurally suppresses legacy investing decision authority fields", () => {
    const isolated = isolateInvestingCompatibilityAuthorityResponse({
      mode: "investing" as const,
      asOf: "2026-05-10T12:00:00.000Z",
      daily: {
        daily_decision: { decision: "BUY", recommended_position_pct: 12 },
        decision_confidence: 0.93,
        operationalAction: { type: "ENTER", symbol: "ABC" },
        riskPolicy: { policy: { maxSinglePositionPct: 22 } },
        investingEngine: {
          construction: { targetAllocations: [{ symbol: "ABC", weight: 0.5 }] },
          rebalance: { actions: [{ action: "buy", symbol: "ABC" }] },
        },
        opportunities: [{ symbol: "ABC", side: "BUY", why: "legacy score" }],
        top_opportunities: [{ symbol: "ABC", side: "BUY" }],
        opportunities_dashboard: [{ symbol: "ABC", action: "BUY" }],
        starterPack: [{ symbol: "ABC", valueEur: 1000 }],
        nba: { title: "Buy ABC" },
        nextBestAction: { type: "BUY" },
        actionGate: { status: "ready", allowExecution: true },
        execution: { queue: { id: "q1" } },
        approvals: { required: true },
      },
      derived: {
        daily_decision: { decision: "SELL" },
        decision_confidence: 0.88,
        operationalAction: { type: "REDUCE" },
        riskPolicy: { evaluation: { status: "pass" } },
        investingEngine: { rebalance: { actions: [{ action: "sell", symbol: "XYZ" }] } },
        targetAllocations: [{ symbol: "XYZ", weight: 1 }],
        executionRecommendations: [{ symbol: "XYZ", side: "SELL" }],
      },
    });

    expect(isolated.authorityBoundary).toMatchObject({
      source: "legacy_compatibility",
      canonicalDecisionAuthority: false,
      mandateAuthority: false,
      executionAuthority: false,
    });
    expect(isolated.daily.daily_decision).toBeNull();
    expect(isolated.daily.decision_confidence).toBeNull();
    expect(isolated.daily.operationalAction).toBeNull();
    expect(isolated.daily.riskPolicy).toBeNull();
    expect(isolated.daily.investingEngine).toBeNull();
    expect(isolated.daily.opportunities).toEqual([]);
    expect(isolated.daily.top_opportunities).toEqual([]);
    expect(isolated.daily.opportunities_dashboard).toEqual([]);
    expect(isolated.daily.starterPack).toEqual([]);
    expect(isolated.daily.actionGate.allowExecution).toBe(false);
    expect((isolated.daily.execution as any).availability).toBe("UNAVAILABLE");
    expect(isolated.derived?.daily_decision).toBeNull();
    expect(isolated.derived?.targetAllocations).toEqual([]);
    expect(JSON.stringify(isolated)).not.toContain("recommended_position_pct");
  });

  it("does not let legacy active or id-only plan fallback grant R5 authority", () => {
    const idOnlyPlan = pickActivePlan([{ id: "legacy-id-only-plan" }]);
    const listFallbackPlan = pickActivePlan([{ goal: "draft without status" }]);

    for (const plan of [idOnlyPlan, listFallbackPlan]) {
      const isolated = isolateInvestingCompatibilityAuthorityResponse({
        mode: "investing" as const,
        asOf: "2026-05-10T12:00:00.000Z",
        plan,
        daily: {
          daily_decision: { decision: "BUY" },
          investingEngine: { construction: { targetAllocations: [{ symbol: "ABC" }] } },
        },
        derived: {
          hasPlan: Boolean(plan),
          daily_decision: { decision: "BUY" },
        },
      });

      expect(isolated.plan).toBe(plan);
      expect(isolated.authorityBoundary.canonicalDecisionAuthority).toBe(false);
      expect(isolated.daily.daily_decision).toBeNull();
      expect(isolated.daily.investingEngine).toBeNull();
      expect(isolated.derived?.daily_decision).toBeNull();
    }
  });

  it("does not apply the investing compatibility boundary to trading-shaped responses", () => {
    const tradingResponse = finalizeDailyBundleResponse({
      mode: "trading" as const,
      asOf: "2026-05-10T12:00:00.000Z",
      daily: {
        daily_decision: { decision: "BUY" },
        decision_confidence: 0.72,
        operationalAction: { type: "ENTER" },
      },
    }, {
      mode: "trading",
      asOf: "2026-05-10T12:00:00.000Z",
      accessTier: "free",
      dataRefreshAccess: null,
    });

    expect(tradingResponse.daily.daily_decision).toEqual({ decision: "BUY" });
    expect(tradingResponse.daily.decision_confidence).toBe(0.72);
    expect(tradingResponse.daily.operationalAction).toEqual({ type: "ENTER" });
    expect((tradingResponse as any).authorityBoundary).toBeUndefined();
    expect((tradingResponse.daily as any).authorityBoundary).toBeUndefined();
  });
});

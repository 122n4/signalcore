import { describe, expect, it } from "vitest";

import {
  attachDecisionEnvelopeToDailyBundleRouteResponse,
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

const decisionBearingCompatibilityFields = [
  "decisionEnvelope",
  "daily_decision",
  "decision_confidence",
  "operationalAction",
  "riskPolicy",
  "investingEngine",
  "nba",
  "nextBestAction",
  "nextBestActionPreview",
  "scores",
  "opportunities",
  "top_opportunities",
  "opportunities_dashboard",
  "opportunityQueue",
  "starterPack",
  "starterPackMeta",
  "actionGate",
  "execution",
  "approval",
  "approvals",
  "decisionGovernance",
  "preTradeSafetyCheck",
  "preExecutionSimulation",
  "cashDeploymentPolicy",
  "riskEnvelope",
  "decisionSources",
  "daily_briefing",
  "whyNow",
  "engineV4",
  "engineV5",
  "syntrakeStack",
  "perfectLoop",
  "suitability",
  "followUp",
  "executionCoach",
  "targetAllocation",
  "targetAllocations",
  "allocation",
  "allocations",
  "rebalance",
  "rebalanceRecommendations",
  "executionRecommendations",
  "killSwitch",
  "actionGateAlert",
  "capitalProtectionSummary",
  "priorityNotifications",
  "portfolio_risk",
  "growthReadiness",
  "weeklyValue",
  "weeklyPremiumReport",
  "antiChurn",
  "portfolioScore",
  "proof",
  "activation",
  "trends",
  "narrative",
  "continuitySignals",
  "planTrack",
  "executionEvidence",
  "starterWarmup",
  "futureLegacyDecisionNode",
  "futureDecisionNode",
  "futureAuthorityNode",
  "futureActionNode",
  "decisionExposure",
  "day0OperationalAllowed",
] as const;

function expectAbsentFields(node: Record<string, any>, fields = decisionBearingCompatibilityFields) {
  for (const field of fields) {
    expect(Object.prototype.hasOwnProperty.call(node, field), field).toBe(false);
  }
}

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

  it("projects investing compatibility responses through an authority allowlist", () => {
    const dangerousDataRefreshAccess = {
      tier: "free",
      tradingLiveRefresh: {
        requested: true,
        allowed: false,
        sharedSnapshotOnly: true,
        dailyLimit: 1,
        cooldownSeconds: 900,
        usedToday: 0,
        remainingToday: 1,
        resetAt: null,
        blockedReason: null,
        retryAfterSeconds: null,
        trackingReady: true,
        futureActionNode: { recommendedPositionPct: 50 },
      },
      futureActionNode: { recommendedPositionPct: 50 },
    };

    const isolated = isolateInvestingCompatibilityAuthorityResponse({
      mode: "investing" as const,
      asOf: "2026-05-10T12:00:00.000Z",
      plan: { id: "legacy-active-plan", status: "active" },
      portfolio: { items: [{ symbol: "ABC", targetAllocation: 0.4 }] },
      daily: {
        billing: {
          plan: "free",
          source: "test",
          futureAuthorityNode: { allowNewRisk: true },
        },
        paywall: {
          show: false,
          cta: "START_TRIAL",
          continuityPolicy: "investing_free_forever",
          decisionExposure: "FULL",
          day0OperationalAllowed: true,
          copy: {
            title: "Investing stays open.",
            subtitle: "Daily investing decisions stay visible without requiring a paid trading subscription.",
          },
          futureDecisionNode: { decision: "BUY", allowExecution: true },
        },
        dataRefreshAccess: dangerousDataRefreshAccess,
        unlockedMode: "investing",
        lastSnapshotAt: "2026-05-10T11:00:00.000Z",
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
        nextBestActionPreview: { status: "READY", action: "BUY" },
        scores: { decisionConfidence: 93 },
        opportunityQueue: { items: [{ symbol: "ABC", side: "BUY" }] },
        actionGate: { status: "ready", allowExecution: true },
        execution: { queue: { id: "q1" } },
        approvals: { required: true },
        preTradeSafetyCheck: { status: "pass", allowExecution: true },
        preExecutionSimulation: { brokerInstruction: "Buy ABC through broker" },
        cashDeploymentPolicy: { decision: "BUY", recommendedPositionPct: 12 },
        riskEnvelope: { decision: "BUY" },
        decisionSources: { workflow: "engine_v4" },
        daily_briefing: { decision: "BUY" },
        whyNow: { rationale: "Buy setup is active" },
        engineV4: { decision: { nextBestAction: { title: "Buy ABC" } } },
        engineV5: { decision: "BUY" },
        syntrakeStack: { decision: "BUY" },
        perfectLoop: { status: "execute" },
        suitability: { decision: "BUY" },
        followUp: { nextAction: "ENTER" },
        executionCoach: { todayRule: "Execute the buy" },
        killSwitch: {
          allowNewRisk: true,
          state: "clear",
          reason: "Policy and gate are clear.",
          trigger: "none",
          releaseRule: "Syntrake allows only reduced-risk actions.",
        },
        actionGateAlert: { triggered: false, nextStep: "Execute" },
        capitalProtectionSummary: { summary: "New risk is allowed.", killSwitchState: "clear" },
        priorityNotifications: [{ title: "Buy ABC", detail: "Execute now" }],
        portfolio_risk: { riskBandwidth: "open" },
        growthReadiness: { nextFocus: "Deploy cash" },
        weeklyValue: { summary: "Ready to invest" },
        weeklyPremiumReport: { focusNextWeek: ["BUY"] },
        antiChurn: { interventions: [{ detail: "Take action" }] },
        portfolioScore: { ready: true },
        proof: { whatChanged: ["Action ready"] },
        activation: { decisionPreviewState: { decisionPrepared: true } },
        trends: { decisionConfidence: { direction: "up" } },
        narrative: "BUY is ready.",
        continuitySignals: { continuity: { decisionPrepared: true } },
        planTrack: { microStep: "Execute" },
        executionEvidence: { latestAt: "2026-05-10T10:00:00.000Z" },
        starterWarmup: { active: true },
        futureLegacyDecisionNode: { allowNewRisk: true, decision: "BUY" },
      },
      derived: {
        billing: {
          plan: "pro",
          source: "derived-test",
          futureAuthorityNode: { allowNewRisk: true },
        },
        paywall: {
          show: true,
          cta: "UPGRADE",
          continuityPolicy: "continuity_first",
          decisionExposure: "FULL",
          day0OperationalAllowed: true,
          copy: {
            subtitle: "Activate Pro to receive continuous daily decisions.",
          },
          futureDecisionNode: { decision: "SELL", allowExecution: true },
        },
        dataRefreshAccess: dangerousDataRefreshAccess,
        hasPlan: true,
        hasHoldings: true,
        receiptsCount: 2,
        doneToday: false,
        daily_decision: { decision: "SELL" },
        decision_confidence: 0.88,
        operationalAction: { type: "REDUCE" },
        riskPolicy: { evaluation: { status: "pass" } },
        investingEngine: { rebalance: { actions: [{ action: "sell", symbol: "XYZ" }] } },
        targetAllocations: [{ symbol: "XYZ", weight: 1 }],
        executionRecommendations: [{ symbol: "XYZ", side: "SELL" }],
        killSwitch: { allowNewRisk: true, state: "clear" },
        actionGateAlert: { message: "Syntrake allows only reduced-risk actions." },
        futureLegacyDecisionNode: { allowNewRisk: true, decision: "BUY" },
      },
    });

    expect(isolated.authorityBoundary).toMatchObject({
      source: "legacy_compatibility",
      canonicalDecisionAuthority: false,
      mandateAuthority: false,
      executionAuthority: false,
    });
    expect((isolated as any).plan).toBeUndefined();
    expect((isolated as any).portfolio).toBeUndefined();
    expect(isolated.daily).toMatchObject({
      authorityBoundary: {
        canonicalDecisionAuthority: false,
        mandateAuthority: false,
        executionAuthority: false,
      },
      billing: { plan: "free", source: "test" },
      paywall: { show: false, cta: "START_TRIAL", continuityPolicy: "investing_free_forever" },
      dataRefreshAccess: {
        tier: "free",
        tradingLiveRefresh: {
          requested: true,
          allowed: false,
          sharedSnapshotOnly: true,
          dailyLimit: 1,
          cooldownSeconds: 900,
          usedToday: 0,
          remainingToday: 1,
          resetAt: null,
          blockedReason: null,
          retryAfterSeconds: null,
          trackingReady: true,
        },
      },
      unlockedMode: "investing",
      lastSnapshotAt: "2026-05-10T11:00:00.000Z",
    });
    expect(isolated.derived).toMatchObject({
      authorityBoundary: {
        canonicalDecisionAuthority: false,
        mandateAuthority: false,
        executionAuthority: false,
      },
      hasPlan: true,
      hasHoldings: true,
      receiptsCount: 2,
      doneToday: false,
      billing: { plan: "pro", source: "derived-test" },
      paywall: { show: true, cta: "UPGRADE", continuityPolicy: "continuity_first" },
    });
    expectAbsentFields(isolated.daily);
    expectAbsentFields(isolated.derived ?? {});
    const serialized = JSON.stringify(isolated);
    expect(serialized).not.toContain("allowExecution");
    expect(serialized).not.toContain("allowNewRisk");
    expect(serialized).not.toContain("recommendedPositionPct");
    expect(serialized).not.toContain("recommended_position_pct");
    expect(serialized).not.toContain("decisionExposure");
    expect(serialized).not.toContain("day0OperationalAllowed");
    expect(serialized).not.toContain("Daily investing decisions stay visible");
    expect(serialized).not.toContain("continuous daily decisions");
    expect(serialized).not.toContain("Policy and gate are clear");
    expect(serialized).not.toContain("BUY");
    expect(serialized).not.toContain("SELL");
    expect(serialized).not.toContain("ENTER");
    expect(serialized).not.toContain("REDUCE");
    expect(serialized).not.toContain('"decision":"BUY"');
    expect(serialized).not.toContain('"decision":"SELL"');
    expect(serialized).not.toContain('"type":"ENTER"');
    expect(serialized).not.toContain('"type":"REDUCE"');
  });

  it("suppresses an attached decision envelope from investing compatibility responses", () => {
    const asOf = "2026-05-10T12:00:00.000Z";
    const composed = attachDecisionEnvelopeToDailyBundleRouteResponse({
      response: {
        mode: "investing" as const,
        asOf,
        daily: {
          nextBestAction: {
            type: "ENTER",
            instruction: "ENTER ABC with immediate broker execution",
            summary: "Enter ABC",
            reason: "Adversarial investing authority fixture",
            cta: { label: "Enter", action: "enter", href: "/trade/ABC" },
            source: "engine_v4",
            engineVersion: "test-engine",
            rawAction: "ENTER",
          },
          decisionGovernance: {
            daily_decision: {
              asset: "ABC",
              decision: "BUY",
              legacy_action_type: "ADD",
              confidence_pct: 99,
              recommended_position_pct: 42,
              reason_codes: ["adversarial_buy"],
            },
            decision_confidence: 0.99,
          },
          operationalAction: {
            category: "DEPLOY",
            brokerInstruction: "Route market BUY for ABC through broker",
            capitalImpact: "Deploy 42 percent of capital",
            riskImpact: "Increase equity risk immediately",
            expectedOutcomeWindow: "today",
          },
          actionGate: { status: "ready", allowExecution: true },
          scores: { decisionConfidence: 99, autopilotScore: 98 },
          opportunityQueue: { items: [{ symbol: "ABC", side: "BUY", instruction: "ENTER" }] },
          preTradeSafetyCheck: { status: "pass", allowExecution: true },
          preExecutionSimulation: { brokerInstruction: "Simulated broker BUY ABC" },
          cashDeploymentPolicy: { recommendedPositionPct: 42, decision: "BUY" },
          riskEnvelope: { riskImpact: "Increase equity risk immediately" },
          decisionSources: { workflow: "engine_v4", execution: "daily_enhancements" },
          daily_briefing: { instruction: "ENTER ABC" },
          whyNow: {
            driverKey: "momentum",
            driverTitle: "Momentum buy",
            severity: "high",
            rationale: "Adversarial rationale says BUY now",
            evidence: ["breakout"],
            expectedOutcome: "upside",
            counterfactual: "miss trade",
          },
          engineV4: { decision: { nextBestAction: { title: "ENTER ABC", desc: "BUY ABC" } } },
          engineV5: { decision: "BUY" },
          syntrakeStack: { decision: "BUY" },
          perfectLoop: { decision: "BUY" },
          suitability: { decision: "BUY" },
          followUp: { nextAction: "ENTER" },
          executionCoach: { todayRule: "Execute BUY now" },
        },
        derived: {
          daily_decision: { decision: "BUY", recommended_position_pct: 42 },
          operationalAction: { brokerInstruction: "Derived broker BUY" },
        },
      },
      branch: "success",
      branchReason: null,
    });

    expect(composed.daily.decisionEnvelope.workflowDecision.type).toBe("ENTER");
    expect(composed.daily.decisionEnvelope.portfolioStance.decision).toBe("BUY");
    expect(composed.daily.decisionEnvelope.portfolioStance.recommendedPositionPct).toBe(42);
    expect(composed.daily.decisionEnvelope.executionInstruction.brokerInstruction).toContain("broker");
    expect(composed.daily.decisionEnvelope.executionInstruction.allowExecution).toBe(true);

    const finalized = finalizeDailyBundleResponse(composed, {
      mode: "investing",
      asOf,
      accessTier: "free",
      dataRefreshAccess: {
        tier: "free",
        tradingLiveRefresh: {
          requested: true,
          allowed: false,
          sharedSnapshotOnly: true,
          dailyLimit: 1,
          cooldownSeconds: 900,
          usedToday: 0,
          remainingToday: 1,
          resetAt: null,
          blockedReason: null,
          retryAfterSeconds: null,
          trackingReady: true,
          futureActionNode: { recommendedPositionPct: 50 },
        },
        futureActionNode: { recommendedPositionPct: 50 },
      } as any,
    }) as any;

    expect(finalized.authorityBoundary.canonicalDecisionAuthority).toBe(false);
    expectAbsentFields(finalized.daily);
    expectAbsentFields(finalized.derived);

    const serialized = JSON.stringify(finalized);
    expect(serialized).not.toContain("workflowDecision");
    expect(serialized).not.toContain("portfolioStance");
    expect(serialized).not.toContain("executionInstruction");
    expect(serialized).not.toContain("recommendedPositionPct");
    expect(serialized).not.toContain("recommended_position_pct");
    expect(serialized).not.toContain("Route market BUY");
    expect(serialized).not.toContain("BUY");
    expect(serialized).not.toContain("SELL");
    expect(serialized).not.toContain("ENTER");
    expect(serialized).not.toContain("REDUCE");
    expect(serialized).not.toContain('"allowExecution":true');
    expect(serialized).not.toContain("futureActionNode");
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

      expect((isolated as any).plan).toBeUndefined();
      expect(isolated.authorityBoundary.canonicalDecisionAuthority).toBe(false);
      expectAbsentFields(isolated.daily);
      expectAbsentFields(isolated.derived ?? {});
    }
  });

  it("does not apply the investing compatibility boundary to trading-shaped responses", () => {
    const tradingBilling = {
      plan: "free",
      source: "test",
      futureAuthorityNode: { allowNewRisk: true },
    };
    const tradingPaywall = {
      show: false,
      continuityPolicy: "investing_free_forever",
      decisionExposure: "FULL",
      day0OperationalAllowed: true,
      copy: {
        subtitle: "Daily investing decisions stay visible without requiring a paid trading subscription.",
      },
      futureDecisionNode: { decision: "BUY", allowExecution: true },
    };
    const tradingDataRefreshAccess = {
      tier: "free",
      tradingLiveRefresh: {
        requested: true,
        allowed: true,
        sharedSnapshotOnly: false,
        dailyLimit: 3,
        cooldownSeconds: 0,
        usedToday: 1,
        remainingToday: 2,
        resetAt: null,
        blockedReason: null,
        retryAfterSeconds: null,
        trackingReady: true,
      },
      futureActionNode: { recommendedPositionPct: 50 },
    };
    const tradingResponse = finalizeDailyBundleResponse({
      mode: "trading" as const,
      asOf: "2026-05-10T12:00:00.000Z",
      daily: {
        billing: tradingBilling,
        paywall: tradingPaywall,
        dataRefreshAccess: tradingDataRefreshAccess,
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
    expect(tradingResponse.daily.billing).toEqual(tradingBilling);
    expect(tradingResponse.daily.paywall).toEqual(tradingPaywall);
    expect(tradingResponse.daily.dataRefreshAccess).toEqual(tradingDataRefreshAccess);
    expect((tradingResponse as any).authorityBoundary).toBeUndefined();
    expect((tradingResponse.daily as any).authorityBoundary).toBeUndefined();
  });
});

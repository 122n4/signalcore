import { describe, expect, it } from "vitest";

import {
  buildDailyPaywallState,
  shouldLoadTradingWatchlistForDailyBundle,
} from "@/app/api/daily-bundle/route";

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
});

import { describe, expect, it } from "vitest";

import { buildInvestingExecutionPlan } from "@/lib/investing";

describe("investing execution plan", () => {
  it("blocks execution when governance kill switch is active", () => {
    const plan = buildInvestingExecutionPlan({
      engine: {
        governancePolicy: {
          killSwitchActive: true,
          executionClearance: "blocked",
          approvalRequired: true,
          overrideAllowed: false,
          maxDeployablePct: 0,
          manualReviewReasons: ["blocked_symbol_present"],
        },
        rebalance: {
          actions: [{ symbol: "SPY", action: "buy" }],
        },
      },
      totalEur: 10_000,
      cashEur: 2_000,
      asOf: "2026-07-17T10:00:00.000Z",
    });

    expect(plan.decision).toBe("blocked");
    expect(plan.approvalStatus).toBe("rejected");
    expect(plan.blockingReasons).toContain("blocked_symbol_present");
  });

  it("keeps hold decisions out of approval workflow", () => {
    const plan = buildInvestingExecutionPlan({
      engine: {
        governancePolicy: {
          killSwitchActive: false,
          executionClearance: "cleared",
          approvalRequired: false,
          overrideAllowed: true,
          maxDeployablePct: 100,
          manualReviewReasons: [],
        },
        rebalance: {
          actions: [{ symbol: "SPY", action: "hold" }],
        },
      },
      totalEur: 10_000,
      cashEur: 2_000,
      asOf: "2026-07-17T10:00:00.000Z",
    });

    expect(plan.decision).toBe("hold");
    expect(plan.approvalStatus).toBe("not_required");
    expect(plan.expiresAt).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { reconcileBrokerSnapshotAgainstInvestingIntent } from "@/lib/investing";

describe("investing intent reconciliation", () => {
  it("flags missing target positions and orphan broker holdings", () => {
    const result = reconcileBrokerSnapshotAgainstInvestingIntent({
      snapshot: {
        mode: "investing",
        asOf: "2026-07-18T10:00:00.000Z",
        positions: [
          { symbol: "SPY", qty: 10, valueEur: 5_000 },
          { symbol: "GLD", qty: 2, valueEur: 400 },
        ],
        cashEur: 600,
        totalEur: 6_000,
        source: "broker",
      },
      targetPortfolio: [
        { symbol: "SPY", targetWeightPct: 60, targetValueEur: 3_600, assetClass: "equity" },
        { symbol: "AGGH", targetWeightPct: 35, targetValueEur: 2_100, assetClass: "bond" },
      ],
      rebalanceActions: [
        { symbol: "AGGH", action: "buy" },
        { symbol: "GLD", action: "sell" },
      ],
      decisionFingerprint: "a".repeat(64),
      intentAsOf: "2026-07-18T09:55:00.000Z",
    });

    expect(result.status).toBe("critical");
    expect(result.mismatchCount).toBeGreaterThanOrEqual(2);
    expect(result.mismatches.some((entry) => entry.type === "missing_target_in_broker")).toBe(true);
    expect(result.mismatches.some((entry) => entry.type === "orphan_broker_position")).toBe(true);
  });
});


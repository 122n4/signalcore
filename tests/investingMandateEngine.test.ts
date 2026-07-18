import { describe, expect, it } from "vitest";

import { buildMandatePolicy } from "@/lib/investing/mandate";

describe("investing mandate engine", () => {
  it("builds a defensive preservation mandate with explicit cash reserve", () => {
    const out = buildMandatePolicy({
      objective: "preservation",
      riskProfile: "Conservative",
      horizon: "Short",
    });

    expect(out.cashReservePct).toBeGreaterThanOrEqual(10);
    expect(out.assetClassTargets.bond).toBeGreaterThan(out.assetClassTargets.equity);
    expect(out.maxTurnoverPct).toBe(8);
  });

  it("builds a growth mandate tilted to equities", () => {
    const out = buildMandatePolicy({
      objective: "growth",
      riskProfile: "Aggressive",
      horizon: "Long",
      allowsGold: true,
    });

    expect(out.assetClassTargets.equity).toBeGreaterThanOrEqual(80);
    expect(out.maxSinglePositionPct).toBe(20);
    expect(out.driftBandPct).toBe(7);
  });
});

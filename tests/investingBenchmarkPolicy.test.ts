import { describe, expect, it } from "vitest";

import { buildBenchmarkPolicy } from "@/lib/investing/benchmark";

describe("investing benchmark policy", () => {
  it("builds a growth benchmark anchored in equities", () => {
    const out = buildBenchmarkPolicy({
      objective: "growth",
      riskProfile: "Aggressive",
      horizon: "Long",
      baseCurrency: "EUR",
      allowsGold: true,
    });

    expect(out.expectedUse).toBe("mandate_anchor");
    expect(out.components.reduce((sum, row) => sum + row.weightPct, 0)).toBe(100);
    expect(out.components.filter((row) => row.assetClass === "equity").reduce((sum, row) => sum + row.weightPct, 0)).toBeGreaterThan(70);
  });

  it("builds a preservation benchmark with meaningful ballast and reserve", () => {
    const out = buildBenchmarkPolicy({
      objective: "preservation",
      riskProfile: "Conservative",
      horizon: "Short",
      baseCurrency: "EUR",
      allowsGold: false,
    });

    const bondWeight = out.components
      .filter((row) => row.assetClass === "bond")
      .reduce((sum, row) => sum + row.weightPct, 0);
    const cashWeight = out.components
      .filter((row) => row.assetClass === "cash")
      .reduce((sum, row) => sum + row.weightPct, 0);

    expect(bondWeight).toBeGreaterThanOrEqual(50);
    expect(cashWeight).toBeGreaterThanOrEqual(20);
  });
});

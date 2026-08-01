import { describe, expect, it } from "vitest";
import { resolveOverviewTopRiskLeak } from "../app/app/tabs/overviewRiskTruth";

describe("Investing Overview risk truth", () => {
  it("preserves the canonical Advisor leak", () => {
    const canonical = { key: "pricing_low", severity: "high" };
    expect(resolveOverviewTopRiskLeak({
      canonicalTopLeak: canonical,
      holdings: [{ symbol: "VWCE", valueEur: 650 }, { symbol: "EUNA", valueEur: 350 }],
      maxSinglePositionPct: 8,
    })).toBe(canonical);
  });

  it("fails closed when portfolio concentration exceeds the plan but diagnostics are empty", () => {
    const leak = resolveOverviewTopRiskLeak({
      canonicalTopLeak: null,
      holdings: [
        { symbol: "VWCE", valueEur: 650 },
        { symbol: "EUNA", valueEur: 200 },
        { symbol: "CASHX", valueEur: 150 },
      ],
      maxSinglePositionPct: 8,
    });

    expect(leak).toMatchObject({
      key: "concentration_high",
      severity: "high",
      title: "VWCE above concentration limit",
      source: "portfolio_structure_fallback",
    });
    expect(leak?.detail).toContain("65%");
    expect(leak?.detail).toContain("8% plan limit");
  });

  it("does not invent a blocker when all holdings respect the plan limit", () => {
    expect(resolveOverviewTopRiskLeak({
      canonicalTopLeak: null,
      holdings: [
        { symbol: "A", valueEur: 300 },
        { symbol: "B", valueEur: 300 },
        { symbol: "C", valueEur: 400 },
      ],
      maxSinglePositionPct: 40,
    })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { buildInvestingAccountingPerformance } from "@/lib/investing/performance/accounting";

describe("Investing accounting performance", () => {
  it("does not classify a deposit as profit", () => {
    const result = buildInvestingAccountingPerformance({
      currentTotalEur: 5_000,
      movements: [{ id: "d1", movement_type: "deposit", amount: 5_000, currency: "EUR" }],
    });
    expect(result.totalResultEur).toBe(0);
    expect(result.totalResultPct).toBe(0);
  });

  it("adjusts the result for withdrawals and separates income and costs", () => {
    const result = buildInvestingAccountingPerformance({
      currentTotalEur: 9_900,
      movements: [
        { id: "d1", movement_type: "deposit", amount: 10_000, currency: "EUR" },
        { id: "w1", movement_type: "withdrawal", amount: -1_000, currency: "EUR" },
        { id: "dv1", movement_type: "dividend", amount: 120, currency: "EUR" },
      ],
      fills: [{ fee_amount: 15, tax_amount: 5, currency: "EUR" }],
    });
    expect(result.netContributionsEur).toBe(9_000);
    expect(result.totalResultEur).toBe(900);
    expect(result.totalResultPct).toBe(10);
    expect(result.dividendsEur).toBe(120);
    expect(result.feesEur).toBe(15);
    expect(result.taxesEur).toBe(5);
  });

  it("excludes a reversed external movement", () => {
    const result = buildInvestingAccountingPerformance({
      currentTotalEur: 0,
      movements: [
        { id: "d1", movement_type: "deposit", amount: 1_000, currency: "EUR" },
        { id: "r1", movement_type: "reversal", amount: -1_000, currency: "EUR", reversal_of: "d1" },
      ],
    });
    expect(result.status).toBe("building_history");
    expect(result.depositsEur).toBe(0);
    expect(result.totalResultEur).toBeNull();
  });
});

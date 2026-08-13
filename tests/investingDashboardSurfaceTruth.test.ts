import { describe, expect, it } from "vitest";

import { buildInvestingDashboardSurfaceViewModel } from "@/app/app/tabs/InvestingDashboardSurface";

describe("InvestingDashboardSurface customer truth", () => {
  it("does not render an unavailable holding weight as zero percent", () => {
    const vm = buildInvestingDashboardSurfaceViewModel({
      portfolio: {
        cash: { amountEur: 700, availability: "REAL" },
        totalEur: null,
        valuation: { totalEur: null, availability: "UNAVAILABLE", source: "unavailable" },
        items: [
          {
            symbol: "VWCE",
            valueEur: null,
            value_eur: null,
            valuationAvailability: "UNAVAILABLE",
            priceAvailability: "REAL",
          },
        ],
      },
      derived: { decisionAvailability: "UNAVAILABLE" },
    });

    expect(vm.holdingRows[0]).toMatchObject({
      symbol: "VWCE",
      value: null,
      valueText: "Dados indisponiveis neste momento",
      weightPct: null,
      weightText: "Unavailable",
    });
    expect(vm.holdingRows[0].weightText).not.toBe("0.0%");
  });

  it("does not derive partial current weights when one active holding is unavailable", () => {
    const vm = buildInvestingDashboardSurfaceViewModel({
      portfolio: {
        cash: { amountEur: 700, availability: "REAL" },
        totalEur: null,
        valuation: { totalEur: null, availability: "UNAVAILABLE", source: "unavailable" },
        items: [
          {
            symbol: "VWCE",
            valueEur: 300,
            valuationAvailability: "REAL",
            priceAvailability: "REAL",
          },
          {
            symbol: "IWDA",
            valueEur: null,
            valuationAvailability: "UNAVAILABLE",
            priceAvailability: "REAL",
          },
        ],
      },
      derived: { decisionAvailability: "UNAVAILABLE" },
    });

    expect(vm.holdingRows.map((row) => row.weightPct)).toEqual([null, null]);
    expect(vm.holdingRows.map((row) => row.weightText)).toEqual(["Unavailable", "Unavailable"]);
    expect(vm.allocationRows.find((row) => row.asset === "equity")).toMatchObject({
      currentValueEur: 300,
      currentWeight: null,
      drift: null,
    });
  });

  it("preserves normal weights for a complete EUR-valued portfolio", () => {
    const vm = buildInvestingDashboardSurfaceViewModel({
      portfolio: {
        cash: { amountEur: 700, availability: "REAL" },
        totalEur: 1000,
        valuation: { totalEur: 1000, availability: "REAL", source: "market_quotes" },
        items: [
          {
            symbol: "VWCE",
            valueEur: 300,
            valuationAvailability: "REAL",
            priceAvailability: "REAL",
          },
        ],
      },
      derived: { decisionAvailability: "UNAVAILABLE" },
    });

    expect(vm.holdingRows[0]).toMatchObject({
      symbol: "VWCE",
      weightPct: 30,
      weightText: "30.0%",
    });
    expect(vm.allocationRows.find((row) => row.asset === "equity")).toMatchObject({
      currentWeight: 30,
      drift: 30,
    });
  });
});

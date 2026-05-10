import { describe, expect, it } from "vitest";

import {
  createTradingHistoricalBlockPeriods,
  createTradingHistoricalYearPeriods,
} from "@/lib/trading/backtest";

describe("trading historical periods", () => {
  it("creates yearly periods with stable labels", () => {
    const periods = createTradingHistoricalYearPeriods({
      startYear: 2023,
      endYear: 2024,
    });

    expect(periods).toEqual([
      {
        label: "2023",
        from: "2023-01-01T00:00:00.000Z",
        to: "2023-12-31T23:59:59.000Z",
      },
      {
        label: "2024",
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-12-31T23:59:59.000Z",
      },
    ]);
  });

  it("creates block periods for arbitrary ranges", () => {
    const periods = createTradingHistoricalBlockPeriods({
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-07-01T00:00:00.000Z",
      blockMonths: 3,
    });

    expect(periods).toHaveLength(2);
    expect(periods[0].label).toBe("block_01");
    expect(periods[1].label).toBe("block_02");
  });
});

import { describe, expect, it } from "vitest";

import { createWalkForwardPlan } from "@/lib/trading/backtest";
import { createTradingMarketDataSnapshot } from "@/lib/trading/data";

import { createBacktestDatasetFixture } from "./helpers/tradingBacktestFixtures";

describe("trading walk-forward plan", () => {
  it("creates rolling windows from normalized candles", () => {
    const dataset = createBacktestDatasetFixture();
    const snapshot = createTradingMarketDataSnapshot(dataset);
    const candles = snapshot.timeframes["15m"] ?? [];
    const plan = createWalkForwardPlan({
      instrument: dataset.instrument,
      primaryTimeframe: "15m",
      candles,
      config: {
        trainBars: 8,
        testBars: 4,
        stepBars: 4,
      },
    });

    expect(plan.windows).toHaveLength(6);
    expect(plan.windows[0].trainStart).toBe(0);
    expect(plan.windows[0].testStart).toBe(8);
    expect(plan.windows[1].trainStart).toBe(4);
  });
});

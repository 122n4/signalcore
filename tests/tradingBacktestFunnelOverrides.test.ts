import { describe, expect, it } from "vitest";

import {
  assessBacktestOpportunityWindow,
  assessBacktestSetupMaturity,
  resolveBacktestTradeValidEdgeThreshold,
} from "@/lib/trading/backtest";

import { createSetupInput } from "./helpers/tradingSetupFixtures";

describe("trading backtest funnel overrides", () => {
  it("relaxes setup maturity thresholds only when an override is provided", () => {
    const input = createSetupInput();
    const setup = {
      type: "trend_pullback" as const,
      direction: "long" as const,
      triggerLevel: 104.2,
      invalidationLevel: 100,
      confidence: 82,
    };

    const relaxed = assessBacktestSetupMaturity(input, setup, {
      defaultReady: 0.88,
    });

    expect(relaxed.state).toBe("ready");
  });

  it("can promote an opening window to active in the backtest study layer", () => {
    const input = createSetupInput();
    const setup = {
      type: "trend_pullback" as const,
      direction: "long" as const,
      triggerLevel: 104.2,
      invalidationLevel: 100,
      confidence: 82,
    };
    const maturity = {
      state: "developing" as const,
      score: 58,
      confidence: 72,
    };

    const promoted = assessBacktestOpportunityWindow(input, setup, maturity, {
      promoteOpeningToActive: true,
    });

    expect(promoted.state).toBe("active");
  });

  it("resolves study-specific weighted edge thresholds by setup type", () => {
    expect(
      resolveBacktestTradeValidEdgeThreshold({
        setupType: "breakout_continuation",
        overrides: {
          breakoutTradeValid: 56,
        },
      }),
    ).toBe(56);

    expect(
      resolveBacktestTradeValidEdgeThreshold({
        setupType: "trend_pullback",
        overrides: {
          defaultTradeValid: 60,
        },
      }),
    ).toBe(60);
  });
});

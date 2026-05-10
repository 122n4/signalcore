import { describe, expect, it } from "vitest";

import { analyzeTradingBacktestFunnel } from "@/lib/trading/backtest";

import { createBacktestDatasetFixture } from "./helpers/tradingBacktestFixtures";

function sumValues(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

describe("trading backtest funnel diagnostics", () => {
  it("builds a consistent funnel report from the current engine without storing full steps", () => {
    const report = analyzeTradingBacktestFunnel(createBacktestDatasetFixture(), {
      warmupBars: 8,
    });

    expect(report.instrument).toBe("EURUSD");
    expect(report.period.barsProcessed).toBeGreaterThan(0);
    expect(report.period.evaluatedBars).toBeGreaterThan(0);
    expect(sumValues(report.counts.setupTypes)).toBe(report.period.evaluatedBars);
    expect(sumValues(report.counts.maturityStates)).toBe(report.period.evaluatedBars);
    expect(sumValues(report.counts.opportunityWindowStates)).toBe(report.period.evaluatedBars);
    expect(sumValues(report.counts.decisionStates)).toBe(report.period.evaluatedBars);
    expect(sumValues(report.counts.executionStatuses)).toBe(report.period.evaluatedBars);
    expect(report.counts.tradesOpened).toBeGreaterThanOrEqual(0);
    expect(report.counts.signalsGenerated).toBeGreaterThanOrEqual(0);
    expect(report.highlights.topDecisionBlockers.length).toBeGreaterThan(0);
  });
});

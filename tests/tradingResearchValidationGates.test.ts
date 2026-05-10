import { describe, expect, it } from "vitest";

import { evaluateResearchValidationGates } from "@/lib/trading/research";

import { createMetricSummary } from "./helpers/tradingResearchFixtures";

describe("trading research validation gates", () => {
  it("treats holdout, final holdout, perturbation, monte carlo, and cost stress as extra hard gates when configured", () => {
    const result = evaluateResearchValidationGates({
      aggregateBaseline: createMetricSummary(),
      aggregateCurrent: createMetricSummary({ profitFactor: 1.6, maxDrawdown: 3.9 }),
      crisisBaseline: createMetricSummary({ expectancy: -0.05, profitFactor: 0.98, maxDrawdown: 5 }),
      crisisCurrent: createMetricSummary({ expectancy: -0.02, profitFactor: 1.02, maxDrawdown: 4.8 }),
      walkForwardBaseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
      walkForwardCurrent: createMetricSummary({ expectancy: 0.06, profitFactor: 1.02, maxDrawdown: 2.3 }),
      holdoutBaseline: createMetricSummary({ expectancy: 0.04, profitFactor: 1.01, maxDrawdown: 2.5 }),
      holdoutCurrent: createMetricSummary({ expectancy: -0.01, profitFactor: 0.99, maxDrawdown: 2.6 }),
      finalHoldoutBaseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.03, maxDrawdown: 2.4 }),
      finalHoldoutCurrent: createMetricSummary({ expectancy: 0.03, profitFactor: 1.01, maxDrawdown: 2.3 }),
      perturbationBaseline: createMetricSummary({ expectancy: 0.03, profitFactor: 1.01, maxDrawdown: 2.5 }),
      perturbationCurrent: createMetricSummary({ expectancy: 0.04, profitFactor: 1.02, maxDrawdown: 2.4 }),
      monteCarloBaseline: createMetricSummary({ expectancy: 0.02, profitFactor: 1.01, maxDrawdown: 2.7 }),
      monteCarloCurrent: createMetricSummary({ expectancy: 0.03, profitFactor: 1.02, maxDrawdown: 2.6 }),
      costStressBaseline: createMetricSummary({ expectancy: 0.01, profitFactor: 1.01, maxDrawdown: 2.8 }),
      costStressCurrent: createMetricSummary({ expectancy: -0.02, profitFactor: 0.98, maxDrawdown: 2.9 }),
      thresholds: {
        epsilon: 0.0001,
        aggregateExpectancyMinDelta: 0.005,
        aggregateProfitFactorMinDelta: 0.01,
        crisisExpectancyMinDelta: 0.005,
        crisisProfitFactorMinDelta: 0.01,
        maxDrawdownMinImprovement: 0.1,
        requireWalkForwardBreakEven: true,
        requireHoldoutBreakEven: true,
        requireFinalHoldoutBreakEven: true,
        requirePerturbationBreakEven: true,
        requireMonteCarloBreakEven: true,
        requireCostStressBreakEven: true,
      },
    });

    expect(result.holdoutBreakEvenOrBetter).toBe(false);
    expect(result.finalHoldoutBreakEvenOrBetter).toBe(true);
    expect(result.perturbationBreakEvenOrBetter).toBe(true);
    expect(result.monteCarloBreakEvenOrBetter).toBe(true);
    expect(result.costStressBreakEvenOrBetter).toBe(false);
    expect(result.allHardGatesPass).toBe(false);
  });
});

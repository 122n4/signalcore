import { describe, expect, it } from "vitest";

import { evaluateResearchValidationGates } from "@/lib/trading/research";

import { createMetricSummary } from "./helpers/tradingResearchFixtures";

describe("trading research validation gates", () => {
  it("withholds promotion when crisis does not improve or trade cadence leaves the paid-product range", () => {
    const thresholds = {
      epsilon: 0.0001,
      aggregateExpectancyMinDelta: 0.005,
      aggregateProfitFactorMinDelta: 0.01,
      crisisExpectancyMinDelta: 0.005,
      crisisProfitFactorMinDelta: 0.01,
      maxDrawdownMinImprovement: 0.1,
      requireWalkForwardBreakEven: true,
      minAggregateTrades: 220,
      maxAggregateTrades: 320,
      minAggregateTradeRetentionPct: 0.9,
      requireCrisisImprovementForPromotion: true,
    };

    const crisisOnlyStable = evaluateResearchValidationGates({
      aggregateBaseline: createMetricSummary({ totalTrades: 243, expectancy: 0.2, profitFactor: 1.69 }),
      aggregateCurrent: createMetricSummary({ totalTrades: 244, expectancy: 0.23, profitFactor: 1.72 }),
      crisisBaseline: createMetricSummary({ totalTrades: 88, expectancy: -0.068, profitFactor: 1.0576, maxDrawdown: 4.38 }),
      crisisCurrent: createMetricSummary({ totalTrades: 89, expectancy: -0.0679, profitFactor: 1.0577, maxDrawdown: 4.38 }),
      walkForwardBaseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
      walkForwardCurrent: createMetricSummary({ expectancy: 0.06, profitFactor: 1.02, maxDrawdown: 2.3 }),
      thresholds,
    });

    expect(crisisOnlyStable.allHardGatesPass).toBe(true);
    expect(crisisOnlyStable.aggregatePromotionThresholdMet).toBe(true);
    expect(crisisOnlyStable.crisisPromotionThresholdMet).toBe(false);
    expect(crisisOnlyStable.aggregateTradeCadencePass).toBe(true);
    expect(crisisOnlyStable.promotionThresholdMet).toBe(false);

    const tooFewTrades = evaluateResearchValidationGates({
      aggregateBaseline: createMetricSummary({ totalTrades: 243, expectancy: 0.2, profitFactor: 1.69 }),
      aggregateCurrent: createMetricSummary({ totalTrades: 190, expectancy: 0.23, profitFactor: 1.72 }),
      crisisBaseline: createMetricSummary({ totalTrades: 88, expectancy: -0.068, profitFactor: 1.0576, maxDrawdown: 4.38 }),
      crisisCurrent: createMetricSummary({ totalTrades: 80, expectancy: -0.05, profitFactor: 1.08, maxDrawdown: 4.2 }),
      walkForwardBaseline: createMetricSummary({ expectancy: 0.05, profitFactor: 1.01, maxDrawdown: 2.4 }),
      walkForwardCurrent: createMetricSummary({ expectancy: 0.06, profitFactor: 1.02, maxDrawdown: 2.3 }),
      thresholds,
    });

    expect(tooFewTrades.aggregateTradeCountStable).toBe(false);
    expect(tooFewTrades.aggregateTradeCadencePass).toBe(false);
    expect(tooFewTrades.allHardGatesPass).toBe(false);
    expect(tooFewTrades.promotionThresholdMet).toBe(false);
  });

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

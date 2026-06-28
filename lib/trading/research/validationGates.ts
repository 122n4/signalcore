import type { ResearchGateEvaluation, ResearchMetricSummary, ResearchValidationThresholds } from "./types";

function positiveStable(current: number | null, baseline: number | null, epsilon: number): boolean {
  return (current ?? Number.NEGATIVE_INFINITY) >= (baseline ?? Number.NEGATIVE_INFINITY) - epsilon;
}

function inverseStable(current: number | null, baseline: number | null, epsilon: number): boolean {
  return (current ?? Number.POSITIVE_INFINITY) <= (baseline ?? Number.POSITIVE_INFINITY) + epsilon;
}

function normalizeRetentionPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const bounded = Math.max(0, Number(value));
  return bounded > 1 ? bounded / 100 : bounded;
}

export function evaluateResearchValidationGates(args: {
  aggregateBaseline: ResearchMetricSummary;
  aggregateCurrent: ResearchMetricSummary;
  crisisBaseline: ResearchMetricSummary;
  crisisCurrent: ResearchMetricSummary;
  walkForwardBaseline: ResearchMetricSummary;
  walkForwardCurrent: ResearchMetricSummary;
  holdoutBaseline?: ResearchMetricSummary | null;
  holdoutCurrent?: ResearchMetricSummary | null;
  finalHoldoutBaseline?: ResearchMetricSummary | null;
  finalHoldoutCurrent?: ResearchMetricSummary | null;
  perturbationBaseline?: ResearchMetricSummary | null;
  perturbationCurrent?: ResearchMetricSummary | null;
  monteCarloBaseline?: ResearchMetricSummary | null;
  monteCarloCurrent?: ResearchMetricSummary | null;
  costStressBaseline?: ResearchMetricSummary | null;
  costStressCurrent?: ResearchMetricSummary | null;
  statisticalValidation?: {
    deflated_sharpe_ratio: number | null;
    pbo: { value: number | null };
    white_reality_check: { adjusted_p_value: number | null };
  } | null;
  thresholds: ResearchValidationThresholds;
}): ResearchGateEvaluation {
  const epsilon = args.thresholds.epsilon;

  const aggregateExpectancyStable = positiveStable(
    args.aggregateCurrent.expectancy,
    args.aggregateBaseline.expectancy,
    epsilon,
  );
  const aggregateProfitFactorStable = positiveStable(
    args.aggregateCurrent.profitFactor,
    args.aggregateBaseline.profitFactor,
    epsilon,
  );
  const aggregateDrawdownStable = inverseStable(
    args.aggregateCurrent.maxDrawdown,
    args.aggregateBaseline.maxDrawdown,
    epsilon,
  );
  const tradeRetentionPct = normalizeRetentionPct(args.thresholds.minAggregateTradeRetentionPct);
  const minTrades = args.thresholds.minAggregateTrades;
  const maxTrades = args.thresholds.maxAggregateTrades;
  const aggregateTradeCountStable =
    tradeRetentionPct == null
      ? true
      : args.aggregateCurrent.totalTrades >=
        Math.floor(args.aggregateBaseline.totalTrades * tradeRetentionPct);
  const aggregateTradeCadencePass =
    aggregateTradeCountStable &&
    (minTrades == null || args.aggregateCurrent.totalTrades >= minTrades) &&
    (maxTrades == null || args.aggregateCurrent.totalTrades <= maxTrades);

  const crisisExpectancyStable = positiveStable(
    args.crisisCurrent.expectancy,
    args.crisisBaseline.expectancy,
    epsilon,
  );
  const crisisProfitFactorStable = positiveStable(
    args.crisisCurrent.profitFactor,
    args.crisisBaseline.profitFactor,
    epsilon,
  );
  const crisisDrawdownStable = inverseStable(
    args.crisisCurrent.maxDrawdown,
    args.crisisBaseline.maxDrawdown,
    epsilon,
  );

  const walkForwardExpectancyStable = positiveStable(
    args.walkForwardCurrent.expectancy,
    args.walkForwardBaseline.expectancy,
    epsilon,
  );
  const walkForwardProfitFactorStable = positiveStable(
    args.walkForwardCurrent.profitFactor,
    args.walkForwardBaseline.profitFactor,
    epsilon,
  );
  const walkForwardDrawdownStable = inverseStable(
    args.walkForwardCurrent.maxDrawdown,
    args.walkForwardBaseline.maxDrawdown,
    epsilon,
  );

  const walkForwardBreakEvenOrBetter =
    args.walkForwardCurrent.expectancy >= 0 &&
    (args.walkForwardCurrent.profitFactor ?? 0) >= 1;

  const holdoutExpectancyStable =
    args.holdoutBaseline && args.holdoutCurrent
      ? positiveStable(args.holdoutCurrent.expectancy, args.holdoutBaseline.expectancy, epsilon)
      : undefined;
  const holdoutProfitFactorStable =
    args.holdoutBaseline && args.holdoutCurrent
      ? positiveStable(args.holdoutCurrent.profitFactor, args.holdoutBaseline.profitFactor, epsilon)
      : undefined;
  const holdoutDrawdownStable =
    args.holdoutBaseline && args.holdoutCurrent
      ? inverseStable(args.holdoutCurrent.maxDrawdown, args.holdoutBaseline.maxDrawdown, epsilon)
      : undefined;
  const holdoutBreakEvenOrBetter =
    args.holdoutCurrent
      ? args.holdoutCurrent.expectancy >= 0 && (args.holdoutCurrent.profitFactor ?? 0) >= 1
      : undefined;

  const finalHoldoutExpectancyStable =
    args.finalHoldoutBaseline && args.finalHoldoutCurrent
      ? positiveStable(
          args.finalHoldoutCurrent.expectancy,
          args.finalHoldoutBaseline.expectancy,
          epsilon,
        )
      : undefined;
  const finalHoldoutProfitFactorStable =
    args.finalHoldoutBaseline && args.finalHoldoutCurrent
      ? positiveStable(
          args.finalHoldoutCurrent.profitFactor,
          args.finalHoldoutBaseline.profitFactor,
          epsilon,
        )
      : undefined;
  const finalHoldoutDrawdownStable =
    args.finalHoldoutBaseline && args.finalHoldoutCurrent
      ? inverseStable(
          args.finalHoldoutCurrent.maxDrawdown,
          args.finalHoldoutBaseline.maxDrawdown,
          epsilon,
        )
      : undefined;
  const finalHoldoutBreakEvenOrBetter =
    args.finalHoldoutCurrent
      ? args.finalHoldoutCurrent.expectancy >= 0 &&
        (args.finalHoldoutCurrent.profitFactor ?? 0) >= 1
      : undefined;

  const perturbationExpectancyStable =
    args.perturbationBaseline && args.perturbationCurrent
      ? positiveStable(
          args.perturbationCurrent.expectancy,
          args.perturbationBaseline.expectancy,
          epsilon,
        )
      : undefined;
  const perturbationProfitFactorStable =
    args.perturbationBaseline && args.perturbationCurrent
      ? positiveStable(
          args.perturbationCurrent.profitFactor,
          args.perturbationBaseline.profitFactor,
          epsilon,
        )
      : undefined;
  const perturbationDrawdownStable =
    args.perturbationBaseline && args.perturbationCurrent
      ? inverseStable(
          args.perturbationCurrent.maxDrawdown,
          args.perturbationBaseline.maxDrawdown,
          epsilon,
        )
      : undefined;
  const perturbationBreakEvenOrBetter =
    args.perturbationCurrent
      ? args.perturbationCurrent.expectancy >= 0 &&
        (args.perturbationCurrent.profitFactor ?? 0) >= 1
      : undefined;

  const monteCarloExpectancyStable =
    args.monteCarloBaseline && args.monteCarloCurrent
      ? positiveStable(args.monteCarloCurrent.expectancy, args.monteCarloBaseline.expectancy, epsilon)
      : undefined;
  const monteCarloProfitFactorStable =
    args.monteCarloBaseline && args.monteCarloCurrent
      ? positiveStable(
          args.monteCarloCurrent.profitFactor,
          args.monteCarloBaseline.profitFactor,
          epsilon,
        )
      : undefined;
  const monteCarloDrawdownStable =
    args.monteCarloBaseline && args.monteCarloCurrent
      ? inverseStable(args.monteCarloCurrent.maxDrawdown, args.monteCarloBaseline.maxDrawdown, epsilon)
      : undefined;
  const monteCarloBreakEvenOrBetter =
    args.monteCarloCurrent
      ? args.monteCarloCurrent.expectancy >= 0 &&
        (args.monteCarloCurrent.profitFactor ?? 0) >= 1
      : undefined;

  const costStressExpectancyStable =
    args.costStressBaseline && args.costStressCurrent
      ? positiveStable(args.costStressCurrent.expectancy, args.costStressBaseline.expectancy, epsilon)
      : undefined;
  const costStressProfitFactorStable =
    args.costStressBaseline && args.costStressCurrent
      ? positiveStable(
          args.costStressCurrent.profitFactor,
          args.costStressBaseline.profitFactor,
          epsilon,
        )
      : undefined;
  const costStressDrawdownStable =
    args.costStressBaseline && args.costStressCurrent
      ? inverseStable(args.costStressCurrent.maxDrawdown, args.costStressBaseline.maxDrawdown, epsilon)
      : undefined;
  const costStressBreakEvenOrBetter =
    args.costStressCurrent
      ? args.costStressCurrent.expectancy >= 0 &&
        (args.costStressCurrent.profitFactor ?? 0) >= 1
      : undefined;
  const deflatedSharpeRatioPass =
    args.statisticalValidation?.deflated_sharpe_ratio == null
      ? undefined
      : args.statisticalValidation.deflated_sharpe_ratio >=
        (args.thresholds.minDeflatedSharpeRatio ?? 0.1);
  const pboPass =
    args.statisticalValidation?.pbo.value == null
      ? undefined
      : args.statisticalValidation.pbo.value <= (args.thresholds.maxPbo ?? 0.45);
  const whiteRealityCheckPass =
    args.statisticalValidation?.white_reality_check.adjusted_p_value == null
      ? undefined
      : args.statisticalValidation.white_reality_check.adjusted_p_value <=
        (args.thresholds.maxWhiteRealityCheckPValue ?? 0.1);
  const statisticalValidationPass =
    (deflatedSharpeRatioPass ?? true) &&
    (pboPass ?? true) &&
    (whiteRealityCheckPass ?? true);

  const aggregateImproved =
    args.aggregateCurrent.expectancy > args.aggregateBaseline.expectancy + epsilon ||
    (args.aggregateCurrent.profitFactor ?? 0) >
      (args.aggregateBaseline.profitFactor ?? 0) + epsilon ||
    args.aggregateCurrent.maxDrawdown < args.aggregateBaseline.maxDrawdown - epsilon;

  const crisisImproved =
    args.crisisCurrent.expectancy > args.crisisBaseline.expectancy + epsilon ||
    (args.crisisCurrent.profitFactor ?? 0) > (args.crisisBaseline.profitFactor ?? 0) + epsilon ||
    args.crisisCurrent.maxDrawdown < args.crisisBaseline.maxDrawdown - epsilon;

  const walkForwardImproved =
    args.walkForwardCurrent.expectancy > args.walkForwardBaseline.expectancy + epsilon ||
    (args.walkForwardCurrent.profitFactor ?? 0) >
      (args.walkForwardBaseline.profitFactor ?? 0) + epsilon ||
    args.walkForwardCurrent.maxDrawdown < args.walkForwardBaseline.maxDrawdown - epsilon;

  const aggregatePromotionThresholdMet =
    args.aggregateCurrent.expectancy >=
      args.aggregateBaseline.expectancy + args.thresholds.aggregateExpectancyMinDelta ||
    (args.aggregateCurrent.profitFactor ?? 0) >=
      (args.aggregateBaseline.profitFactor ?? 0) + args.thresholds.aggregateProfitFactorMinDelta;
  const crisisPromotionThresholdMet =
    args.crisisCurrent.expectancy >=
      args.crisisBaseline.expectancy + args.thresholds.crisisExpectancyMinDelta ||
    (args.crisisCurrent.profitFactor ?? 0) >=
      (args.crisisBaseline.profitFactor ?? 0) + args.thresholds.crisisProfitFactorMinDelta;
  const drawdownPromotionThresholdMet =
    args.aggregateCurrent.maxDrawdown <=
      args.aggregateBaseline.maxDrawdown - args.thresholds.maxDrawdownMinImprovement ||
    args.crisisCurrent.maxDrawdown <=
      args.crisisBaseline.maxDrawdown - args.thresholds.maxDrawdownMinImprovement;
  const rawPromotionThresholdMet =
    aggregatePromotionThresholdMet ||
    crisisPromotionThresholdMet ||
    drawdownPromotionThresholdMet;
  const crisisPromotionRequirementPass =
    !args.thresholds.requireCrisisImprovementForPromotion || crisisPromotionThresholdMet;
  const promotionThresholdMet =
    rawPromotionThresholdMet &&
    crisisPromotionRequirementPass &&
    aggregateTradeCadencePass;

  const allHardGatesPass =
    aggregateExpectancyStable &&
    aggregateProfitFactorStable &&
    aggregateDrawdownStable &&
    aggregateTradeCadencePass &&
    crisisExpectancyStable &&
    crisisProfitFactorStable &&
    crisisDrawdownStable &&
    walkForwardExpectancyStable &&
    walkForwardProfitFactorStable &&
    walkForwardDrawdownStable &&
    (!args.thresholds.requireWalkForwardBreakEven || walkForwardBreakEvenOrBetter) &&
    (holdoutExpectancyStable ?? true) &&
    (holdoutProfitFactorStable ?? true) &&
    (holdoutDrawdownStable ?? true) &&
    (!args.thresholds.requireHoldoutBreakEven || holdoutBreakEvenOrBetter !== false) &&
    (finalHoldoutExpectancyStable ?? true) &&
    (finalHoldoutProfitFactorStable ?? true) &&
    (finalHoldoutDrawdownStable ?? true) &&
    (!args.thresholds.requireFinalHoldoutBreakEven ||
      finalHoldoutBreakEvenOrBetter !== false) &&
    (perturbationExpectancyStable ?? true) &&
    (perturbationProfitFactorStable ?? true) &&
    (perturbationDrawdownStable ?? true) &&
    (!args.thresholds.requirePerturbationBreakEven ||
      perturbationBreakEvenOrBetter !== false) &&
    (monteCarloExpectancyStable ?? true) &&
    (monteCarloProfitFactorStable ?? true) &&
    (monteCarloDrawdownStable ?? true) &&
    (!args.thresholds.requireMonteCarloBreakEven || monteCarloBreakEvenOrBetter !== false) &&
    (costStressExpectancyStable ?? true) &&
    (costStressProfitFactorStable ?? true) &&
    (costStressDrawdownStable ?? true) &&
    (!args.thresholds.requireCostStressBreakEven || costStressBreakEvenOrBetter !== false) &&
    statisticalValidationPass;

  return {
    aggregateExpectancyStable,
    aggregateProfitFactorStable,
    aggregateDrawdownStable,
    aggregateTradeCountStable,
    aggregateTradeCadencePass,
    crisisExpectancyStable,
    crisisProfitFactorStable,
    crisisDrawdownStable,
    walkForwardExpectancyStable,
    walkForwardProfitFactorStable,
    walkForwardDrawdownStable,
    walkForwardBreakEvenOrBetter,
    holdoutExpectancyStable,
    holdoutProfitFactorStable,
    holdoutDrawdownStable,
    holdoutBreakEvenOrBetter,
    finalHoldoutExpectancyStable,
    finalHoldoutProfitFactorStable,
    finalHoldoutDrawdownStable,
    finalHoldoutBreakEvenOrBetter,
    perturbationExpectancyStable,
    perturbationProfitFactorStable,
    perturbationDrawdownStable,
    perturbationBreakEvenOrBetter,
    monteCarloExpectancyStable,
    monteCarloProfitFactorStable,
    monteCarloDrawdownStable,
    monteCarloBreakEvenOrBetter,
    costStressExpectancyStable,
    costStressProfitFactorStable,
    costStressDrawdownStable,
    costStressBreakEvenOrBetter,
    deflatedSharpeRatioPass,
    pboPass,
    whiteRealityCheckPass,
    statisticalValidationPass,
    aggregateImproved,
    crisisImproved,
    walkForwardImproved,
    aggregatePromotionThresholdMet,
    crisisPromotionThresholdMet,
    drawdownPromotionThresholdMet,
    promotionThresholdMet,
    allHardGatesPass,
  };
}

import type { ResearchMetricSummary, ResearchPromotionRanking, ResearchRunComparison } from "./types";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function positive(value: number | null | undefined): number {
  return value && value > 0 ? value : 0;
}

function scoreMetricBlock(args: {
  expectancyDelta: number;
  profitFactorDelta: number;
  drawdownImprovement: number;
  expectancyWeight: number;
  profitFactorWeight: number;
  drawdownWeight: number;
  cap: number;
}): number {
  const expectancyScore = positive(args.expectancyDelta) * args.expectancyWeight;
  const profitFactorScore = positive(args.profitFactorDelta) * args.profitFactorWeight;
  const drawdownScore = positive(args.drawdownImprovement) * args.drawdownWeight;

  return clamp(expectancyScore + profitFactorScore + drawdownScore, 0, args.cap);
}

function scoreRobustness(comparison: ResearchRunComparison): number {
  let score = 0;

  if (comparison.robustness?.holdout) {
    if (comparison.gates.holdoutBreakEvenOrBetter) {
      score += 8;
    }
    if (comparison.gates.holdoutExpectancyStable) {
      score += 4;
    }
    if (comparison.gates.holdoutProfitFactorStable) {
      score += 4;
    }
    if (comparison.gates.holdoutDrawdownStable) {
      score += 4;
    }
  }

  if (comparison.robustness?.finalHoldout) {
    if (comparison.gates.finalHoldoutBreakEvenOrBetter) {
      score += 10;
    }
    if (comparison.gates.finalHoldoutExpectancyStable) {
      score += 5;
    }
    if (comparison.gates.finalHoldoutProfitFactorStable) {
      score += 5;
    }
    if (comparison.gates.finalHoldoutDrawdownStable) {
      score += 5;
    }
  }

  if (comparison.robustness?.perturbation) {
    if (comparison.gates.perturbationBreakEvenOrBetter) {
      score += 8;
    }
    if (comparison.gates.perturbationExpectancyStable) {
      score += 4;
    }
    if (comparison.gates.perturbationProfitFactorStable) {
      score += 4;
    }
    if (comparison.gates.perturbationDrawdownStable) {
      score += 4;
    }
  }

  if (comparison.robustness?.monteCarlo) {
    if (comparison.gates.monteCarloBreakEvenOrBetter) {
      score += 10;
    }
    if (comparison.gates.monteCarloExpectancyStable) {
      score += 5;
    }
    if (comparison.gates.monteCarloProfitFactorStable) {
      score += 5;
    }
    if (comparison.gates.monteCarloDrawdownStable) {
      score += 5;
    }
  }

  if (comparison.robustness?.costStress) {
    if (comparison.gates.costStressBreakEvenOrBetter) {
      score += 12;
    }
    if (comparison.gates.costStressExpectancyStable) {
      score += 6;
    }
    if (comparison.gates.costStressProfitFactorStable) {
      score += 6;
    }
    if (comparison.gates.costStressDrawdownStable) {
      score += 6;
    }
  }

  return clamp(score, 0, 40);
}

function scorePenalties(comparison: ResearchRunComparison): number {
  let penalty = 0;

  if (!comparison.gates.walkForwardBreakEvenOrBetter) {
    penalty -= 15;
  }
  if (comparison.gates.holdoutBreakEvenOrBetter === false) {
    penalty -= 10;
  }
  if (comparison.gates.finalHoldoutBreakEvenOrBetter === false) {
    penalty -= 14;
  }
  if (comparison.gates.perturbationBreakEvenOrBetter === false) {
    penalty -= 10;
  }
  if (comparison.gates.monteCarloBreakEvenOrBetter === false) {
    penalty -= 12;
  }
  if (comparison.gates.costStressBreakEvenOrBetter === false) {
    penalty -= 14;
  }
  if (!comparison.gates.aggregateImproved) {
    penalty -= 5;
  }
  if (!comparison.gates.crisisImproved) {
    penalty -= 5;
  }
  if (!comparison.gates.walkForwardImproved) {
    penalty -= 5;
  }

  return penalty;
}

export function rankResearchOpportunity(comparison: ResearchRunComparison): ResearchPromotionRanking {
  const aggregate = scoreMetricBlock({
    expectancyDelta:
      comparison.aggregate.current.expectancy - comparison.aggregate.baseline.expectancy,
    profitFactorDelta:
      (comparison.aggregate.current.profitFactor ?? 0) -
      (comparison.aggregate.baseline.profitFactor ?? 0),
    drawdownImprovement:
      comparison.aggregate.baseline.maxDrawdown - comparison.aggregate.current.maxDrawdown,
    expectancyWeight: 220,
    profitFactorWeight: 85,
    drawdownWeight: 4,
    cap: 25,
  });
  const crisis = scoreMetricBlock({
    expectancyDelta: comparison.crisis.current.expectancy - comparison.crisis.baseline.expectancy,
    profitFactorDelta:
      (comparison.crisis.current.profitFactor ?? 0) -
      (comparison.crisis.baseline.profitFactor ?? 0),
    drawdownImprovement:
      comparison.crisis.baseline.maxDrawdown - comparison.crisis.current.maxDrawdown,
    expectancyWeight: 260,
    profitFactorWeight: 95,
    drawdownWeight: 4,
    cap: 25,
  });
  const walkForward = scoreMetricBlock({
    expectancyDelta:
      comparison.walkForward.current.expectancy - comparison.walkForward.baseline.expectancy,
    profitFactorDelta:
      (comparison.walkForward.current.profitFactor ?? 0) -
      (comparison.walkForward.baseline.profitFactor ?? 0),
    drawdownImprovement:
      comparison.walkForward.baseline.maxDrawdown - comparison.walkForward.current.maxDrawdown,
    expectancyWeight: 300,
    profitFactorWeight: 100,
    drawdownWeight: 5,
    cap: 30,
  });
  const robustness = scoreRobustness(comparison);
  const penalties = scorePenalties(comparison);
  const score = clamp(roundScore(aggregate + crisis + walkForward + robustness + penalties), 0, 100);

  let band: ResearchPromotionRanking["band"] = "weak";
  if (score >= 80) {
    band = "elite_watch";
  } else if (score >= 60) {
    band = "strong";
  } else if (score >= 35) {
    band = "promising";
  }

  return {
    score,
    band,
    components: {
      aggregate: roundScore(aggregate),
      crisis: roundScore(crisis),
      walkForward: roundScore(walkForward),
      robustness: roundScore(robustness),
      penalties: roundScore(penalties),
    },
  };
}

function scoreSummaryBlock(args: {
  summary: ResearchMetricSummary;
  expectancyFloor: number;
  expectancyWeight: number;
  profitFactorFloor: number;
  profitFactorWeight: number;
  drawdownTarget: number;
  drawdownWeight: number;
  cap: number;
}): number {
  return clamp(
    positive(args.summary.expectancy - args.expectancyFloor) * args.expectancyWeight +
      positive((args.summary.profitFactor ?? 0) - args.profitFactorFloor) * args.profitFactorWeight +
      positive(args.drawdownTarget - args.summary.maxDrawdown) * args.drawdownWeight,
    0,
    args.cap,
  );
}

export function rankResearchOpportunityFromSummaries(args: {
  aggregate: ResearchMetricSummary;
  crisis: ResearchMetricSummary;
  walkForward: ResearchMetricSummary;
}): ResearchPromotionRanking {
  const aggregate = scoreSummaryBlock({
    summary: args.aggregate,
    expectancyFloor: 0.15,
    expectancyWeight: 120,
    profitFactorFloor: 1.2,
    profitFactorWeight: 18,
    drawdownTarget: 6,
    drawdownWeight: 1.5,
    cap: 30,
  });
  const crisis = scoreSummaryBlock({
    summary: args.crisis,
    expectancyFloor: -0.05,
    expectancyWeight: 120,
    profitFactorFloor: 1,
    profitFactorWeight: 16,
    drawdownTarget: 6,
    drawdownWeight: 1.2,
    cap: 25,
  });
  const walkForward = scoreSummaryBlock({
    summary: args.walkForward,
    expectancyFloor: 0,
    expectancyWeight: 180,
    profitFactorFloor: 1,
    profitFactorWeight: 22,
    drawdownTarget: 4,
    drawdownWeight: 2,
    cap: 30,
  });

  let penalties = 0;
  if (args.aggregate.expectancy < 0.2) {
    penalties -= 6;
  }
  if (args.crisis.expectancy < 0) {
    penalties -= 8;
  }
  if ((args.walkForward.profitFactor ?? 0) < 1) {
    penalties -= 10;
  }
  if (args.walkForward.totalTrades < 10) {
    penalties -= 8;
  }

  const stabilityBonus =
    Number(args.aggregate.expectancy >= 0.2) * 4 +
    Number(args.crisis.profitFactor !== null && args.crisis.profitFactor >= 1) * 3 +
    Number(args.walkForward.expectancy >= 0) * 5;
  const score = clamp(
    roundScore(aggregate + crisis + walkForward + stabilityBonus + penalties),
    0,
    100,
  );

  let band: ResearchPromotionRanking["band"] = "weak";
  if (score >= 80) {
    band = "elite_watch";
  } else if (score >= 60) {
    band = "strong";
  } else if (score >= 35) {
    band = "promising";
  }

  return {
    score,
    band,
    components: {
      aggregate: roundScore(aggregate),
      crisis: roundScore(crisis),
      walkForward: roundScore(walkForward + stabilityBonus),
      robustness: 0,
      penalties: roundScore(penalties),
    },
  };
}

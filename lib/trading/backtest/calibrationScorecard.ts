import type { TradingBacktestComparativeReport } from "./comparativeSweep";

export type CalibrationMetricSnapshot = {
  totalTrades: number;
  winRate: number;
  averageRiskReward: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
};

export type CrisisValidationReport = {
  aggregate: {
    baseline: CalibrationMetricSnapshot;
    current: CalibrationMetricSnapshot;
    delta: {
      totalTrades: number;
      winRate: number;
      expectancy: number;
      profitFactor: number | null;
      maxDrawdown: number;
      grossProfitPct: number;
      grossLossPct: number;
    };
  };
  byPeriod: Record<
    string,
    | {
        current: CalibrationMetricSnapshot;
        baseline: CalibrationMetricSnapshot;
        delta: {
          totalTrades: number;
          winRate: number;
          expectancy: number;
          profitFactor: number | null;
          maxDrawdown: number;
          grossProfitPct: number;
          grossLossPct: number;
        };
      }
    | null
  >;
};

export type CalibrationTier = "safe" | "target" | "elite";

export type CalibrationTierDefinition = {
  tier: CalibrationTier;
  label: string;
  minimums: {
    winRate: number;
    averageRiskReward: number;
    expectancy: number;
    profitFactor: number;
  };
  maximums: {
    maxDrawdown: number;
  };
};

export type CalibrationScorecard = {
  generatedAt: string;
  current: {
    aggregate: CalibrationMetricSnapshot;
    crisisAggregate: CalibrationMetricSnapshot;
  };
  cadence: {
    averageAnnualTrades: number;
    targetAnnualTradesMin: number;
    targetAnnualTradesMax: number;
    status: "below_target" | "target" | "above_target";
  };
  assessment: {
    currentTier: CalibrationTier | "below_safe";
    maximumDefendableTierNow: CalibrationTier | "below_safe";
    eliteTargetStatus: "reachable_but_unproven" | "not_yet_defendable";
    summary: string;
  };
  tiers: CalibrationTierDefinition[];
  gaps: {
    toSafe: Record<string, number | null>;
    toTarget: Record<string, number | null>;
    toElite: Record<string, number | null>;
  };
  blockers: string[];
};

const TARGET_ANNUAL_TRADES_MIN = 250;
const TARGET_ANNUAL_TRADES_MAX = 300;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

const TIERS: CalibrationTierDefinition[] = [
  {
    tier: "safe",
    label: "Safe Calibration",
    minimums: {
      winRate: 44,
      averageRiskReward: 2,
      expectancy: 0.2,
      profitFactor: 1.4,
    },
    maximums: {
      maxDrawdown: 7,
    },
  },
  {
    tier: "target",
    label: "Target Calibration",
    minimums: {
      winRate: 46,
      averageRiskReward: 2,
      expectancy: 0.3,
      profitFactor: 1.55,
    },
    maximums: {
      maxDrawdown: 7.5,
    },
  },
  {
    tier: "elite",
    label: "Elite Calibration",
    minimums: {
      winRate: 48,
      averageRiskReward: 2,
      expectancy: 0.4,
      profitFactor: 1.8,
    },
    maximums: {
      maxDrawdown: 8,
    },
  },
];

function roundMetric(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function extractAggregateSnapshot(report: TradingBacktestComparativeReport): CalibrationMetricSnapshot {
  return {
    totalTrades: report.aggregate.summary.totalTrades,
    winRate: report.aggregate.summary.winRate,
    averageRiskReward: report.aggregate.summary.averageRiskReward,
    expectancy: report.aggregate.summary.expectancy,
    profitFactor: report.aggregate.summary.profitFactor,
    maxDrawdown: report.aggregate.summary.maxDrawdown,
  };
}

function estimateAverageAnnualTrades(report: TradingBacktestComparativeReport): number {
  const measuredYears = report.request.periods.reduce((sum, period) => {
    const from = new Date(period.from).getTime();
    const to = new Date(period.to).getTime();

    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return sum;
    }

    return sum + (to - from) / MS_PER_YEAR;
  }, 0);
  const divisor = measuredYears > 0 ? measuredYears : 1;

  return roundMetric(report.aggregate.summary.totalTrades / divisor) ?? 0;
}

function resolveCadenceStatus(
  averageAnnualTrades: number,
): CalibrationScorecard["cadence"]["status"] {
  if (averageAnnualTrades < TARGET_ANNUAL_TRADES_MIN) {
    return "below_target";
  }

  if (averageAnnualTrades > TARGET_ANNUAL_TRADES_MAX) {
    return "above_target";
  }

  return "target";
}

function passesTier(metrics: CalibrationMetricSnapshot, tier: CalibrationTierDefinition): boolean {
  return (
    metrics.winRate >= tier.minimums.winRate &&
    (metrics.averageRiskReward ?? 0) >= tier.minimums.averageRiskReward &&
    metrics.expectancy >= tier.minimums.expectancy &&
    (metrics.profitFactor ?? 0) >= tier.minimums.profitFactor &&
    metrics.maxDrawdown <= tier.maximums.maxDrawdown
  );
}

function resolveCurrentTier(metrics: CalibrationMetricSnapshot): CalibrationTier | "below_safe" {
  if (passesTier(metrics, TIERS[2])) {
    return "elite";
  }

  if (passesTier(metrics, TIERS[1])) {
    return "target";
  }

  if (passesTier(metrics, TIERS[0])) {
    return "safe";
  }

  return "below_safe";
}

function resolveMaximumDefendableTierNow(args: {
  aggregate: CalibrationMetricSnapshot;
  crisisAggregate: CalibrationMetricSnapshot;
}): CalibrationTier | "below_safe" {
  const aggregate = args.aggregate;
  const crisis = args.crisisAggregate;

  // To defend a tier without obvious overfit, aggregate and stress windows both
  // need to remain broadly healthy.
  const crisisIsHealthyForSafe =
    crisis.profitFactor !== null &&
    crisis.profitFactor >= 0.95 &&
    crisis.expectancy >= -0.05 &&
    crisis.maxDrawdown <= 7;
  const crisisIsHealthyForTarget =
    crisis.profitFactor !== null &&
    crisis.profitFactor >= 1 &&
    crisis.expectancy >= 0 &&
    crisis.maxDrawdown <= 6.5;
  const crisisIsHealthyForElite =
    crisis.profitFactor !== null &&
    crisis.profitFactor >= 1.1 &&
    crisis.expectancy >= 0.05 &&
    crisis.maxDrawdown <= 6;

  if (passesTier(aggregate, TIERS[2]) && crisisIsHealthyForElite) {
    return "elite";
  }

  if (passesTier(aggregate, TIERS[1]) && crisisIsHealthyForTarget) {
    return "target";
  }

  if (passesTier(aggregate, TIERS[0]) && crisisIsHealthyForSafe) {
    return "safe";
  }

  return "below_safe";
}

function buildGaps(
  metrics: CalibrationMetricSnapshot,
  tier: CalibrationTierDefinition,
): Record<string, number | null> {
  return {
    winRate: roundMetric(Math.max(0, tier.minimums.winRate - metrics.winRate)),
    averageRiskReward: roundMetric(
      Math.max(0, tier.minimums.averageRiskReward - (metrics.averageRiskReward ?? 0)),
    ),
    expectancy: roundMetric(Math.max(0, tier.minimums.expectancy - metrics.expectancy)),
    profitFactor: roundMetric(Math.max(0, tier.minimums.profitFactor - (metrics.profitFactor ?? 0))),
    maxDrawdown: roundMetric(Math.max(0, metrics.maxDrawdown - tier.maximums.maxDrawdown)),
  };
}

function buildBlockers(args: {
  aggregate: CalibrationMetricSnapshot;
  crisisAggregate: CalibrationMetricSnapshot;
  crisisValidation: CrisisValidationReport;
  cadence: CalibrationScorecard["cadence"];
}): string[] {
  const blockers: string[] = [];

  if (args.cadence.status === "below_target") {
    blockers.push(
      `Average annual trade cadence is below the ${args.cadence.targetAnnualTradesMin}-${args.cadence.targetAnnualTradesMax} target band.`,
    );
  }

  if (args.aggregate.expectancy < 0.3) {
    blockers.push("Aggregate expectancy is still below target-calibration territory.");
  }

  if ((args.aggregate.profitFactor ?? 0) < 1.55) {
    blockers.push("Aggregate profit factor is not yet strong enough for target calibration.");
  }

  if (args.crisisAggregate.expectancy < 0) {
    blockers.push("Crisis aggregate expectancy is still negative, which raises overfit risk.");
  }

  if ((args.crisisAggregate.profitFactor ?? 0) < 1) {
    blockers.push("Crisis aggregate profit factor is still below 1.0.");
  }

  const degradedPeriods = Object.entries(args.crisisValidation.byPeriod)
    .filter((entry): entry is [string, NonNullable<CrisisValidationReport["byPeriod"][string]>] => Boolean(entry[1]))
    .filter(([, period]) => period.delta.expectancy < 0)
    .map(([label]) => label);

  if (degradedPeriods.length > 0) {
    blockers.push(
      `Stress windows still degrade expectancy in: ${degradedPeriods.join(", ")}.`,
    );
  }

  return blockers;
}

export function buildCalibrationScorecard(args: {
  currentComparative: TradingBacktestComparativeReport;
  crisisValidation: CrisisValidationReport;
}): CalibrationScorecard {
  const aggregate = extractAggregateSnapshot(args.currentComparative);
  const crisisAggregate = args.crisisValidation.aggregate.current;
  const currentTier = resolveCurrentTier(aggregate);
  const averageAnnualTrades = estimateAverageAnnualTrades(args.currentComparative);
  const cadence: CalibrationScorecard["cadence"] = {
    averageAnnualTrades,
    targetAnnualTradesMin: TARGET_ANNUAL_TRADES_MIN,
    targetAnnualTradesMax: TARGET_ANNUAL_TRADES_MAX,
    status: resolveCadenceStatus(averageAnnualTrades),
  };
  const maximumDefendableTierNow = resolveMaximumDefendableTierNow({
    aggregate,
    crisisAggregate,
  });
  const eliteTargetStatus =
    maximumDefendableTierNow === "elite" ? "reachable_but_unproven" : "not_yet_defendable";

  return {
    generatedAt: new Date().toISOString(),
    current: {
      aggregate,
      crisisAggregate,
    },
    cadence,
    assessment: {
      currentTier,
      maximumDefendableTierNow,
      eliteTargetStatus,
      summary:
        maximumDefendableTierNow === "safe"
          ? "The engine is safely in strong territory, but the jump to target/elite still needs better crisis robustness."
          : maximumDefendableTierNow === "target"
            ? "The engine is target-calibration strong and is approaching elite territory, but crisis validation is not yet elite-clean."
            : maximumDefendableTierNow === "elite"
              ? "The engine is operating in elite territory, but this still needs broader out-of-sample confirmation."
              : "The engine has promise, but still does not clear the safe anti-overfit bar once crisis validation is applied.",
    },
    tiers: TIERS,
    gaps: {
      toSafe: buildGaps(aggregate, TIERS[0]),
      toTarget: buildGaps(aggregate, TIERS[1]),
      toElite: buildGaps(aggregate, TIERS[2]),
    },
    blockers: buildBlockers({
      aggregate,
      crisisAggregate,
      crisisValidation: args.crisisValidation,
      cadence,
    }),
  };
}

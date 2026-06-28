import type { TradingBacktestTrade } from "@/lib/trading/backtest/types";

import type {
  ResearchMetricSummary,
  ResearchStatisticalValidation,
  ResearchSupplementalValidation,
} from "./types";

const EULER_GAMMA = 0.5772156649015329;

function roundMetric(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: number[], average: number): number {
  if (values.length < 2) {
    return 0;
  }
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
}

function sampleStdDev(values: number[], average: number): number {
  return Math.sqrt(sampleVariance(values, average));
}

function skewness(values: number[], average: number, stdDev: number): number {
  if (values.length < 3 || stdDev <= 0) {
    return 0;
  }

  const n = values.length;
  const scaled = values.reduce((sum, value) => sum + ((value - average) / stdDev) ** 3, 0);
  return (n / ((n - 1) * (n - 2))) * scaled;
}

function excessKurtosis(values: number[], average: number, stdDev: number): number {
  if (values.length < 4 || stdDev <= 0) {
    return 0;
  }

  const n = values.length;
  const scaled = values.reduce((sum, value) => sum + ((value - average) / stdDev) ** 4, 0);
  const numerator = (n * (n + 1) * scaled) - (3 * (n - 1) ** 2);
  const denominator = (n - 1) * (n - 2) * (n - 3);
  return denominator === 0 ? 0 : numerator / denominator;
}

function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function inverseNormalCdf(probability: number): number {
  const p = clampProbability(probability);
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;

  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }

  if (p > phigh) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }

  const q = p - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
}

function tradeReturns(trades: TradingBacktestTrade[]): number[] {
  return trades
    .map((trade) => Number(trade.pnlPct))
    .filter((value) => Number.isFinite(value));
}

function computeTradeLevelSharpe(returns: number[]): {
  sharpe: number | null;
  meanReturn: number;
  stdDev: number;
  skew: number;
  kurtosis: number;
} {
  if (returns.length < 2) {
    return {
      sharpe: null,
      meanReturn: mean(returns),
      stdDev: 0,
      skew: 0,
      kurtosis: 0,
    };
  }

  const average = mean(returns);
  const stdDev = sampleStdDev(returns, average);
  if (stdDev <= 0) {
    return {
      sharpe: null,
      meanReturn: average,
      stdDev,
      skew: 0,
      kurtosis: 0,
    };
  }

  return {
    sharpe: (average / stdDev) * Math.sqrt(returns.length),
    meanReturn: average,
    stdDev,
    skew: skewness(returns, average, stdDev),
    kurtosis: excessKurtosis(returns, average, stdDev),
  };
}

function computeExpectedMaxSharpe(trialCount: number): number {
  if (trialCount <= 1) {
    return 0;
  }

  const oneMinusInverse = inverseNormalCdf(1 - (1 / trialCount));
  const oneMinusEInverse = inverseNormalCdf(1 - (1 / (trialCount * Math.E)));
  return ((1 - EULER_GAMMA) * oneMinusInverse) + (EULER_GAMMA * oneMinusEInverse);
}

function computeDeflatedSharpeRatio(args: {
  sharpe: number | null;
  sampleSize: number;
  skew: number;
  kurtosis: number;
  trialCount: number;
}): number | null {
  if (args.sharpe == null || args.sampleSize < 2) {
    return null;
  }

  const numerator = (args.sharpe - computeExpectedMaxSharpe(args.trialCount)) * Math.sqrt(args.sampleSize - 1);
  const denominator = Math.sqrt(
    Math.max(
      1e-9,
      1 - (args.skew * args.sharpe) + (((args.kurtosis - 1) / 4) * args.sharpe * args.sharpe),
    ),
  );

  return clampProbability(normalCdf(numerator / denominator));
}

function buildOutOfSampleChecks(args: {
  walkForward: ResearchMetricSummary;
  robustness?: ResearchSupplementalValidation | null;
}): ResearchStatisticalValidation["diagnostics"]["out_of_sample_checks"] {
  const checks: ResearchStatisticalValidation["diagnostics"]["out_of_sample_checks"] = [
    {
      label: "walk_forward",
      expectancy: args.walkForward.expectancy,
      profit_factor: args.walkForward.profitFactor,
      passed_break_even:
        args.walkForward.expectancy >= 0 && (args.walkForward.profitFactor ?? 0) >= 1,
    },
  ];

  const addCheck = (
    label: string,
    summary: ResearchMetricSummary | null | undefined,
  ) => {
    if (!summary) {
      return;
    }
    checks.push({
      label,
      expectancy: summary.expectancy,
      profit_factor: summary.profitFactor,
      passed_break_even: summary.expectancy >= 0 && (summary.profitFactor ?? 0) >= 1,
    });
  };

  addCheck("holdout", args.robustness?.holdout?.current);
  addCheck("final_holdout", args.robustness?.finalHoldout?.current);
  addCheck("perturbation", args.robustness?.perturbation?.current);
  addCheck("monte_carlo", args.robustness?.monteCarlo?.current);
  addCheck("cost_stress", args.robustness?.costStress?.current);

  return checks;
}

function computeEstimatedPbo(args: {
  aggregateCurrent: ResearchMetricSummary;
  outOfSampleChecks: ResearchStatisticalValidation["diagnostics"]["out_of_sample_checks"];
}): ResearchStatisticalValidation["pbo"] {
  if (args.outOfSampleChecks.length === 0) {
    return {
      value: null,
      risk_band: "insufficient_data",
    };
  }

  const breakEvenFailures = args.outOfSampleChecks.filter((entry) => entry.passed_break_even === false).length;
  const materialDegrades = args.outOfSampleChecks.filter((entry) => {
    if (entry.expectancy == null) {
      return false;
    }
    return entry.expectancy < Math.max(0, args.aggregateCurrent.expectancy * 0.5);
  }).length;
  const totalChecks = args.outOfSampleChecks.length;
  const value = clampProbability((breakEvenFailures + (materialDegrades * 0.5)) / totalChecks);

  return {
    value: roundMetric(value),
    risk_band:
      value <= 0.2
        ? "low"
        : value <= 0.45
          ? "moderate"
          : "high",
  };
}

function sampleWithReplacement(values: number[], rng: () => number): number[] {
  if (values.length === 0) {
    return [];
  }

  return Array.from({ length: values.length }, () => {
    const index = Math.min(values.length - 1, Math.floor(rng() * values.length));
    return values[index]!;
  });
}

function computeWhiteRealityCheck(args: {
  baselineReturns: number[];
  currentReturns: number[];
  bootstrapIterations: number;
  trialCount: number;
  seed: number;
}): ResearchStatisticalValidation["white_reality_check"] {
  if (args.baselineReturns.length === 0 || args.currentReturns.length === 0) {
    return {
      p_value: null,
      adjusted_p_value: null,
      bootstrap_iterations: args.bootstrapIterations,
    };
  }

  let nonPositiveDiffCount = 0;

  for (let iteration = 0; iteration < args.bootstrapIterations; iteration += 1) {
    const rng = createSeededRng(args.seed ^ ((iteration + 1) * 2654435761));
    const baselineSample = sampleWithReplacement(args.baselineReturns, rng);
    const currentSample = sampleWithReplacement(args.currentReturns, rng);
    const differential = mean(currentSample) - mean(baselineSample);
    if (differential <= 0) {
      nonPositiveDiffCount += 1;
    }
  }

  const pValue = nonPositiveDiffCount / args.bootstrapIterations;
  return {
    p_value: roundMetric(pValue),
    adjusted_p_value: roundMetric(clampProbability(pValue * Math.max(1, args.trialCount))),
    bootstrap_iterations: args.bootstrapIterations,
  };
}

export function buildResearchStatisticalValidation(args: {
  baselineTrades: TradingBacktestTrade[];
  currentTrades: TradingBacktestTrade[];
  aggregateCurrent: ResearchMetricSummary;
  walkForwardCurrent: ResearchMetricSummary;
  robustness?: ResearchSupplementalValidation | null;
  independentTrialCount: number;
  bootstrapIterations?: number;
  seed?: number;
}): ResearchStatisticalValidation {
  const baselineReturns = tradeReturns(args.baselineTrades);
  const currentReturns = tradeReturns(args.currentTrades);
  const sampleSize = currentReturns.length;
  const independentTrialCount = Math.max(1, Math.round(args.independentTrialCount));
  const bootstrapIterations = Math.max(64, args.bootstrapIterations ?? 128);
  const seed = args.seed ?? 1337;
  const currentStats = computeTradeLevelSharpe(currentReturns);
  const outOfSampleChecks = buildOutOfSampleChecks({
    walkForward: args.walkForwardCurrent,
    robustness: args.robustness,
  });
  if (sampleSize < 20 || baselineReturns.length < 20) {
    return {
      sample_size: sampleSize,
      independent_trial_count: independentTrialCount,
      trade_level_sharpe_ratio: roundMetric(currentStats.sharpe),
      deflated_sharpe_ratio: null,
      pbo: {
        value: null,
        risk_band: "insufficient_data",
      },
      white_reality_check: {
        p_value: null,
        adjusted_p_value: null,
        bootstrap_iterations: bootstrapIterations,
      },
      diagnostics: {
        out_of_sample_checks: outOfSampleChecks,
        notes: [
          "Statistical promotion gates are informational only until both baseline and current samples reach at least 20 trades.",
        ],
      },
    };
  }

  const pbo = computeEstimatedPbo({
    aggregateCurrent: args.aggregateCurrent,
    outOfSampleChecks,
  });
  const whiteRealityCheck = computeWhiteRealityCheck({
    baselineReturns,
    currentReturns,
    bootstrapIterations,
    trialCount: independentTrialCount,
    seed,
  });
  const diagnosticsNotes: string[] = [
    "Deflated Sharpe Ratio uses trade-level returns with the active bundle-candidate count as the multiple-testing proxy.",
    "PBO is estimated from out-of-sample break-even stability across walk-forward and robustness checks.",
    "White Reality Check is approximated by bootstrapping the differential mean trade return against the active baseline.",
  ];

  if (sampleSize < 20) {
    diagnosticsNotes.push("Sample size is small; statistical confidence is limited.");
  }

  return {
    sample_size: sampleSize,
    independent_trial_count: independentTrialCount,
    trade_level_sharpe_ratio: roundMetric(currentStats.sharpe),
    deflated_sharpe_ratio: roundMetric(computeDeflatedSharpeRatio({
      sharpe: currentStats.sharpe,
      sampleSize,
      skew: currentStats.skew,
      kurtosis: currentStats.kurtosis,
      trialCount: independentTrialCount,
    })),
    pbo,
    white_reality_check: whiteRealityCheck,
    diagnostics: {
      out_of_sample_checks: outOfSampleChecks,
      notes: diagnosticsNotes,
    },
  };
}

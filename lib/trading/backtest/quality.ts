import type { TradingSessionProfile, TradingTimeframe } from "@/lib/trading/data";

import type { TradingHistoricalDataset } from "./datasets";

export type TradingHistoricalCoverageBucket = {
  timeframe: TradingTimeframe;
  actualBars: number;
  expectedAllClockBars: number;
  expectedSessionBars: number;
  minimumBars: number;
  coverageRatio: number;
  sessionCoverageRatio: number;
  valid: boolean;
};

export type TradingHistoricalCoverageReport = {
  valid: boolean;
  coverage: Partial<Record<TradingTimeframe, TradingHistoricalCoverageBucket>>;
  issues: string[];
};

const TRADING_TIMEFRAME_MS: Record<TradingTimeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

const SESSION_ACTIVITY_FACTOR: Record<TradingSessionProfile, number> = {
  crypto: 1,
  forex: 5 / 7,
  ny_equities: (6.5 / 24) * (5 / 7),
};

const SESSION_COVERAGE_TOLERANCE = 0.75;
const MIN_EXPECTED_BARS_FOR_VALIDATION = 100;

function estimateBars(args: {
  from: string;
  to: string;
  timeframe: TradingTimeframe;
  sessionProfile: TradingSessionProfile;
}): {
  expectedAllClockBars: number;
  expectedSessionBars: number;
  minimumBars: number;
} {
  const start = new Date(args.from).getTime();
  const end = new Date(args.to).getTime();
  const durationMs = Math.max(0, end - start);
  const expectedAllClockBars = Math.max(1, Math.floor(durationMs / TRADING_TIMEFRAME_MS[args.timeframe]) + 1);
  const expectedSessionBars = Math.max(
    1,
    Math.round(expectedAllClockBars * SESSION_ACTIVITY_FACTOR[args.sessionProfile]),
  );

  return {
    expectedAllClockBars,
    expectedSessionBars,
    minimumBars: Math.max(1, Math.round(expectedSessionBars * SESSION_COVERAGE_TOLERANCE)),
  };
}

export function computeTradingHistoricalCoverage(
  dataset: TradingHistoricalDataset,
): TradingHistoricalCoverageReport {
  const coverage: Partial<Record<TradingTimeframe, TradingHistoricalCoverageBucket>> = {};
  const issues: string[] = [];

  for (const timeframe of dataset.metadata.timeframes) {
    const actualBars = dataset.metadata.candleCounts[timeframe] ?? 0;
    const estimated = estimateBars({
      from: dataset.metadata.from,
      to: dataset.metadata.to,
      timeframe,
      sessionProfile: dataset.metadata.sessionProfile,
    });
    const shouldValidate = estimated.expectedAllClockBars >= MIN_EXPECTED_BARS_FOR_VALIDATION;
    const valid = shouldValidate ? actualBars >= estimated.minimumBars : actualBars > 0;
    const bucket: TradingHistoricalCoverageBucket = {
      timeframe,
      actualBars,
      expectedAllClockBars: estimated.expectedAllClockBars,
      expectedSessionBars: estimated.expectedSessionBars,
      minimumBars: estimated.minimumBars,
      coverageRatio:
        estimated.expectedAllClockBars > 0 ? actualBars / estimated.expectedAllClockBars : 0,
      sessionCoverageRatio:
        estimated.expectedSessionBars > 0 ? actualBars / estimated.expectedSessionBars : 0,
      valid,
    };

    coverage[timeframe] = bucket;

    if (!valid) {
      issues.push(
        `${timeframe} coverage too low (${actualBars} bars, minimum ${bucket.minimumBars}, session coverage ${Math.round(
          bucket.sessionCoverageRatio * 100,
        )}%)`,
      );
    }
  }

  return {
    valid: issues.length === 0,
    coverage,
    issues,
  };
}

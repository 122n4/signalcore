import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TradingTimeframe } from "@/lib/trading/data";

import type { TradingHistoricalDatasetCachePolicy } from "./archive";
import { computeTradingHistoricalCoverage, type TradingHistoricalCoverageReport } from "./quality";
import {
  TRADING_BACKTEST_BASE_INSTRUMENTS,
  type TradingHistoricalDataSource,
  type TradingHistoricalDataset,
  type TradingHistoricalDatasetRequest,
  type TradingHistoricalSourcePreference,
} from "./datasets";
import { loadHistoricalTradingDataset } from "./historicalLoader";
import type { TradingHistoricalPeriod } from "./periods";

export type TradingHistoricalCoverageAuditRequest = {
  periods: TradingHistoricalPeriod[];
  instruments?: string[];
  timeframes?: TradingHistoricalDatasetRequest["timeframes"];
  continueOnError?: boolean;
  cachePolicy?: TradingHistoricalDatasetCachePolicy;
  cacheDir?: string | null;
  sourcePreference?: TradingHistoricalSourcePreference;
};

export type TradingHistoricalCoverageAuditEntry = {
  instrument: string;
  period: TradingHistoricalPeriod;
  source: TradingHistoricalDataSource | null;
  valid: boolean;
  candleCounts: Partial<Record<TradingTimeframe, number>> | null;
  coverage: TradingHistoricalCoverageReport | null;
  error: string | null;
};

export type TradingHistoricalCoverageAuditReport = {
  generatedAt: string;
  request: {
    instruments: string[];
    periods: TradingHistoricalPeriod[];
    timeframes: string[];
    sourcePreference: TradingHistoricalSourcePreference | null;
  };
  entries: TradingHistoricalCoverageAuditEntry[];
  summary: {
    byInstrument: Record<string, {
      validPeriods: number;
      invalidPeriods: number;
      failedPeriods: number;
      sources: TradingHistoricalDataSource[];
    }>;
    byPeriod: Record<string, {
      validInstruments: string[];
      invalidInstruments: string[];
      failedInstruments: string[];
    }>;
    failures: Array<{
      instrument: string;
      period: string;
      error: string;
    }>;
  };
};

type TradingHistoricalCoverageAuditDeps = {
  loadDataset?: (request: TradingHistoricalDatasetRequest) => Promise<TradingHistoricalDataset>;
};

export async function runTradingHistoricalCoverageAudit(
  request: TradingHistoricalCoverageAuditRequest,
  deps: TradingHistoricalCoverageAuditDeps = {},
): Promise<TradingHistoricalCoverageAuditReport> {
  const loadDataset = deps.loadDataset ?? loadHistoricalTradingDataset;
  const instruments =
    request.instruments?.length
      ? request.instruments.map((instrument) => instrument.trim().toUpperCase())
      : TRADING_BACKTEST_BASE_INSTRUMENTS.map((instrument) => instrument.instrument);
  const timeframes = request.timeframes ?? ["4h", "1h", "15m"];
  const entries: TradingHistoricalCoverageAuditEntry[] = [];

  for (const period of request.periods) {
    for (const instrument of instruments) {
      try {
        const dataset = await loadDataset({
          instrument,
          from: period.from,
          to: period.to,
          timeframes,
          sourcePreference: request.sourcePreference,
        });
        const coverage = computeTradingHistoricalCoverage(dataset);

        entries.push({
          instrument,
          period,
          source: dataset.metadata.source,
          valid: coverage.valid,
          candleCounts: dataset.metadata.candleCounts,
          coverage,
          error: null,
        });
      } catch (error) {
        const failure = {
          instrument,
          period,
          source: null,
          valid: false,
          candleCounts: null,
          coverage: null,
          error: error instanceof Error ? error.message : String(error),
        } satisfies TradingHistoricalCoverageAuditEntry;

        entries.push(failure);

        if (request.continueOnError === false) {
          throw new Error(`Trading historical coverage audit failed for ${instrument} (${period.label}): ${failure.error}`);
        }
      }
    }
  }

  const byInstrument = Object.fromEntries(
    instruments.map((instrument) => {
      const instrumentEntries = entries.filter((entry) => entry.instrument === instrument);
      return [
        instrument,
        {
          validPeriods: instrumentEntries.filter((entry) => entry.valid && !entry.error).length,
          invalidPeriods: instrumentEntries.filter((entry) => !entry.valid && !entry.error).length,
          failedPeriods: instrumentEntries.filter((entry) => entry.error).length,
          sources: Array.from(
            new Set(
              instrumentEntries
                .map((entry) => entry.source)
                .filter((source): source is TradingHistoricalDataSource => source !== null),
            ),
          ),
        },
      ];
    }),
  );

  const byPeriod = Object.fromEntries(
    request.periods.map((period) => {
      const periodEntries = entries.filter((entry) => entry.period.label === period.label);
      return [
        period.label,
        {
          validInstruments: periodEntries
            .filter((entry) => entry.valid && !entry.error)
            .map((entry) => entry.instrument),
          invalidInstruments: periodEntries
            .filter((entry) => !entry.valid && !entry.error)
            .map((entry) => entry.instrument),
          failedInstruments: periodEntries
            .filter((entry) => entry.error)
            .map((entry) => entry.instrument),
        },
      ];
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    request: {
      instruments,
      periods: request.periods,
      timeframes,
      sourcePreference: request.sourcePreference ?? null,
    },
    entries,
    summary: {
      byInstrument,
      byPeriod,
      failures: entries
        .filter((entry) => entry.error)
        .map((entry) => ({
          instrument: entry.instrument,
          period: entry.period.label,
          error: entry.error ?? "Unknown coverage audit error.",
        })),
    },
  };
}

export async function writeTradingHistoricalCoverageAuditReport(args: {
  report: TradingHistoricalCoverageAuditReport;
  outputPath: string;
}): Promise<string> {
  const absolutePath = path.resolve(args.outputPath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(args.report, null, 2), "utf8");

  return absolutePath;
}

import type { TradingHistoricalCoverageAuditReport } from "@/lib/trading/backtest";

import { readJsonIfExists } from "./fs";
import type { ResearchConfig } from "./types";

type ResearchCoverageInstrumentStatus = {
  validPeriods: number;
  invalidPeriods: number;
  failedPeriods: number;
};

export type ResearchCoverageEligibility = {
  coverageAuditLoaded: boolean;
  eligibleInstruments: Set<string>;
};

function normalizeInstrument(value: string): string {
  return value.trim().toUpperCase();
}

function isInstrumentCoverageEligible(status: ResearchCoverageInstrumentStatus | undefined): boolean {
  if (!status) {
    return false;
  }

  return status.validPeriods > 0 && status.invalidPeriods === 0 && status.failedPeriods === 0;
}

export async function readResearchCoverageEligibility(
  config: ResearchConfig,
): Promise<ResearchCoverageEligibility> {
  const coverageAuditPath = config.paths.coverageAuditPath;
  if (!coverageAuditPath) {
    return {
      coverageAuditLoaded: false,
      eligibleInstruments: new Set(),
    };
  }

  const report = await readJsonIfExists<TradingHistoricalCoverageAuditReport>(coverageAuditPath);
  if (!report?.summary?.byInstrument) {
    return {
      coverageAuditLoaded: false,
      eligibleInstruments: new Set(),
    };
  }

  const eligibleInstruments = new Set<string>();
  for (const [instrument, status] of Object.entries(report.summary.byInstrument)) {
    if (isInstrumentCoverageEligible(status)) {
      eligibleInstruments.add(normalizeInstrument(instrument));
    }
  }

  return {
    coverageAuditLoaded: true,
    eligibleInstruments,
  };
}

export function isResearchCandidateScopeCoverageEligible(args: {
  instruments: string[] | undefined;
  coverage: ResearchCoverageEligibility;
}): boolean {
  const instruments = args.instruments?.map(normalizeInstrument) ?? [];
  if (!args.coverage.coverageAuditLoaded || instruments.length === 0) {
    return true;
  }

  return instruments.every((instrument) => args.coverage.eligibleInstruments.has(instrument));
}

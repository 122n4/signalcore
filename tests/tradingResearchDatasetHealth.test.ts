import { describe, expect, it } from "vitest";

import {
  buildResearchDatasetHealthReport,
  readJsonFile,
  writeResearchDatasetHealthReport,
} from "@/lib/trading/research";

import {
  createResearchConfig,
  createResearchTempDir,
  writeResearchCoverageAudit,
} from "./helpers/tradingResearchFixtures";

describe("trading research dataset health", () => {
  it("classifies configured instruments into eligible, degraded, failed, and missing buckets", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    config.study.instruments = ["NAS100", "US500", "USDJPY", "BTCUSD"];

    await writeResearchCoverageAudit(config, {
      generatedAt: "2026-03-21T12:00:00.000Z",
      request: {
        instruments: ["NAS100", "US500", "USDJPY"],
        periods: [],
        timeframes: ["4h", "1h", "15m"],
        sourcePreference: "local_only",
      },
      entries: [],
      summary: {
        byInstrument: {
          NAS100: {
            validPeriods: 2,
            invalidPeriods: 0,
            failedPeriods: 0,
            sources: ["local_archive"],
          },
          US500: {
            validPeriods: 1,
            invalidPeriods: 1,
            failedPeriods: 0,
            sources: ["local_archive"],
          },
          USDJPY: {
            validPeriods: 0,
            invalidPeriods: 0,
            failedPeriods: 2,
            sources: [],
          },
        },
        byPeriod: {},
        failures: [],
      },
    });

    const report = await buildResearchDatasetHealthReport(config);
    const outputs = await writeResearchDatasetHealthReport({ config, report });
    const latest = await readJsonFile<typeof report>(outputs.latestJsonPath);

    expect(report.summary.audit_loaded).toBe(true);
    expect(report.summary.eligible_instrument_count).toBe(1);
    expect(report.summary.degraded_instrument_count).toBe(1);
    expect(report.summary.failed_instrument_count).toBe(1);
    expect(report.summary.missing_instrument_count).toBe(1);
    expect(report.summary.suspended_instruments).toEqual(["BTCUSD", "US500", "USDJPY"]);
    expect(latest.summary.suspended_instrument_count).toBe(3);

    const statuses = Object.fromEntries(
      report.instruments.map((entry) => [entry.instrument, entry.status]),
    );
    expect(statuses.NAS100).toBe("eligible");
    expect(statuses.US500).toBe("degraded");
    expect(statuses.USDJPY).toBe("failed");
    expect(statuses.BTCUSD).toBe("missing");
  });
});

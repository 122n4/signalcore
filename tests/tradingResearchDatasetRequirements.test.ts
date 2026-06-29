import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildResearchDataAcquisitionPlan,
  buildResearchDatasetRequirementsReport,
  writeJsonAtomic,
} from "@/lib/trading/research";

import { createResearchConfig, createResearchTempDir } from "./helpers/tradingResearchFixtures";

describe("research dataset requirements", () => {
  it("builds canonical requirement rows and a safe acquisition plan from the backfill report", async () => {
    const rootDir = await createResearchTempDir();
    const config = await createResearchConfig(rootDir);
    const reportPath = path.join(config.paths.reportsDir, "datasets", "market-data-backfill-latest.json");

    await writeJsonAtomic(reportPath, {
      generatedAt: "2026-06-28T14:06:56.000Z",
      after: {
        summary: {
          instruments: 4,
          periods: 4,
          existing: 2,
          missingDownloadable: 1,
          missingManual: 1,
          unsupported: 1,
        },
        entries: [
          {
            instrument: "NAS100",
            source: "active_lab",
            group: "indices",
            localFormat: "forex_ascii_yearly_m1",
            dataSymbol: "NAS100",
            autoDownload: false,
            periods: [
              {
                label: "2026",
                status: "missing_manual",
                targetPath: path.join(rootDir, "Data", "historical", "indices", "nas100", "DAT_ASCII_NAS100_M1_2026.csv"),
                existingPath: null,
                remoteUrl: null,
                note: "Local file is required before this market can be trusted by local-only research.",
              },
            ],
          },
          {
            instrument: "XAGUSD",
            source: "staged_market",
            group: "metals",
            localFormat: "histdata_ascii_yearly_m1",
            dataSymbol: "XAGUSD",
            autoDownload: false,
            periods: [
              {
                label: "2025",
                status: "existing",
                targetPath: path.join(rootDir, "data", "historical-staging", "metals", "xagusd", "DAT_ASCII_XAGUSD_M1_2025.csv"),
                existingPath: "exists",
                remoteUrl: "https://www.histdata.com/download-free-forex-historical-data/",
                note: "Staged file exists, but this market is not active in the lab yet.",
              },
            ],
          },
          {
            instrument: "BNBUSD",
            source: "staged_market",
            group: "crypto",
            localFormat: "crypto_binance_monthly_m1",
            dataSymbol: "BNBUSDT",
            autoDownload: true,
            periods: [
              {
                label: "2026-05",
                status: "missing_downloadable",
                targetPath: path.join(rootDir, "data", "historical-staging", "crypto", "bnbusd", "BNBUSDT-1m-2026-05.csv"),
                existingPath: null,
                remoteUrl: "https://data.binance.vision/",
                note: "Can be downloaded to staging from Binance public monthly kline archives; promotion stays blocked until full validation.",
              },
            ],
          },
          {
            instrument: "SOLUSD",
            source: "staged_market",
            group: "crypto",
            localFormat: "crypto_binance_monthly_m1",
            dataSymbol: "SOLUSDT",
            autoDownload: true,
            periods: [
              {
                label: "2020-01",
                status: "unsupported",
                targetPath: path.join(rootDir, "data", "historical-staging", "crypto", "solusd", "SOLUSDT-1m-2020-01.csv"),
                existingPath: null,
                remoteUrl: null,
                note: "Skipped because SOLUSDT appears unavailable before 2020-08 in Binance public monthly archives.",
              },
            ],
          },
        ],
      },
    });

    const requirements = await buildResearchDatasetRequirementsReport(config);
    const plan = await buildResearchDataAcquisitionPlan(config);

    expect(requirements.summary.officialGapCount).toBe(2);
    expect(requirements.summary.unsupportedCount).toBe(1);
    expect(requirements.rows.find((row) => row.instrument === "NAS100")?.priority).toBe("P0");
    expect(requirements.rows.find((row) => row.instrument === "NAS100")?.blocksCoreResearch).toBe(true);
    expect(requirements.rows.find((row) => row.instrument === "XAGUSD")?.status).toBe("staged_only");
    expect(requirements.rows.find((row) => row.instrument === "BNBUSD")?.status).toBe("downloadable");
    expect(plan.mode).toBe("safe_reuse_existing_pipeline");
    expect(plan.summary.officialGapCount).toBe(2);
    expect(plan.pendingRows.length).toBe(3);
    expect(plan.safeguards.find((guard) => guard.id === "no_parallel_pipeline")?.status).toBe("in_place");
  });
});

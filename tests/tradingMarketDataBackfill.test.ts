import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildTradingMarketDataBackfillPlan,
  loadResearchConfig,
  writeJsonAtomic,
} from "@/lib/trading/research";

const tempDirs: string[] = [];
const previouslyDetectedLocalFiles = [
  ["forex", "eurusd", "DAT_ASCII_EURUSD_M1_2020.csv.csv"],
  ["forex", "gbpusd", "DAT_ASCII_GBPUSD_M1_2020.csv.csv"],
  ["forex", "usdjpy", "DAT_ASCII_USDJPY_M1_2020.csv.csv"],
  ["forex", "xauusd", "DAT_ASCII_XAUUSD_M1_2020.csv.csv"],
  ["indices", "nasdaq", "nasdaq_2020.csv"],
  ["indices", "us500", "DAT_ASCII_SPXUSD_M1_2020.csv"],
  ["cripto", "btcusdt", "BTCUSDT-1m-2020-07.csv"],
  ["cripto", "btcusdt", "BTCUSDT-1m-2020-08.csv"],
  ["cripto", "ethusdt", "ETHUSDT-1m-2020-07.csv"],
  ["cripto", "ethusdt", "ETHUSDT-1m-2020-08.csv"],
] as const;

type LocalDataFixture = "absent" | "empty" | "populated";

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "syntrake-market-backfill-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFileWithParents(targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "sample\n", "utf8");
}

async function createLocalDataFixture(mode: LocalDataFixture): Promise<string> {
  const fixtureRoot = await createTempDir();
  const localDataDir = path.join(fixtureRoot, "Data", "historical");

  if (mode === "absent") {
    return localDataDir;
  }

  await mkdir(localDataDir, { recursive: true });

  if (mode === "populated") {
    await Promise.all(previouslyDetectedLocalFiles.map((segments) =>
      writeFileWithParents(path.join(localDataDir, ...segments))));
  }

  return localDataDir;
}

async function loadStagedOnlyConfig() {
  const config = await loadResearchConfig();
  return {
    ...config,
    study: {
      ...config.study,
      instruments: [],
    },
  };
}

afterEach(async () => {
  delete process.env.TRADING_BACKTEST_LOCAL_DATA_DIR;
  delete process.env.TRADING_BACKTEST_STAGING_DATA_DIR;
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("trading market data backfill", () => {
  it("marks missing crypto monthly archives as downloadable and existing files as covered", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;

    await writeFileWithParents(path.join(baseDir, "cripto", "btcusdt", "BTCUSDT-1m-2024-01.csv"));

    const plan = await buildTradingMarketDataBackfillPlan({
      instruments: ["BTCUSD"],
      from: { year: 2024, month: 1 },
      to: { year: 2024, month: 2 },
      includeStaged: false,
    });

    const entry = plan.entries[0];

    expect(entry.instrument).toBe("BTCUSD");
    expect(entry.autoDownload).toBe(true);
    expect(entry.periods.map((period) => period.status)).toEqual([
      "existing",
      "missing_downloadable",
    ]);
    expect(entry.periods[1]?.remoteUrl).toContain("data.binance.vision");
    expect(plan.summary.existing).toBe(1);
    expect(plan.summary.missingDownloadable).toBe(1);
  });

  it("marks missing secondary crypto archives as downloadable in canonical backfill", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;

    const plan = await buildTradingMarketDataBackfillPlan({
      instruments: ["SOLUSD"],
      from: { year: 2024, month: 1 },
      to: { year: 2024, month: 2 },
      includeStaged: false,
    });

    const entry = plan.entries[0];

    expect(entry.instrument).toBe("SOLUSD");
    expect(entry.autoDownload).toBe(true);
    expect(entry.periods.map((period) => period.status)).toEqual([
      "missing_downloadable",
      "missing_downloadable",
    ]);
    expect(entry.periods[0]?.remoteUrl).toContain("data.binance.vision");
  });

  it("keeps non-downloadable local archives visible as manual gaps", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;

    const plan = await buildTradingMarketDataBackfillPlan({
      instruments: ["US500"],
      from: { year: 2024, month: 1 },
      to: { year: 2024, month: 12 },
      includeStaged: false,
    });

    const entry = plan.entries[0];

    expect(entry.instrument).toBe("US500");
    expect(entry.autoDownload).toBe(true);
    expect(entry.periods).toHaveLength(1);
    expect(entry.periods[0]?.status).toBe("missing_downloadable");
    expect(entry.periods[0]?.remoteUrl).toContain("api.twelvedata.com/time_series");
    expect(plan.summary.missingDownloadable).toBe(1);
  });

  it("treats staged Binance crypto archives as downloadable without activating them", async () => {
    const stagingDataDir = await createTempDir();
    const catalogDir = await createTempDir();
    const config = await loadStagedOnlyConfig();
    process.env.TRADING_BACKTEST_STAGING_DATA_DIR = stagingDataDir;

    const stagingCatalogPath = path.join(catalogDir, "staging-catalog.json");
    await writeJsonAtomic(stagingCatalogPath, {
      version: 1,
      markets: [{
        instrument: "SOLUSD",
        group: "crypto",
        status: "staged_only",
        priority: 90,
        rationale: "New crypto staging candidate.",
        expected_local_format: "crypto_binance_monthly_m1",
        expected_symbol: "SOLUSDT",
        target_path_segments: ["crypto", "solusd"],
        source: {
          provider: "Binance",
          kind: "official_public_archive",
          listing_url: "https://data.binance.vision/?prefix=data/spot/monthly/klines/SOLUSDT/1m/",
          reference_url: "https://data.binance.vision/",
        },
      }],
    });

    const plan = await buildTradingMarketDataBackfillPlan({
      config,
      instruments: [],
      from: { year: 2024, month: 1 },
      to: { year: 2024, month: 1 },
      includeStaged: true,
      stagingCatalogPath,
    });

    const entry = plan.entries.find((item) => item.instrument === "SOLUSD");

    expect(entry?.source).toBe("staged_market");
    expect(entry?.autoDownload).toBe(true);
    expect(entry?.periods[0]?.status).toBe("missing_downloadable");
    expect(entry?.periods[0]?.remoteUrl).toContain("data.binance.vision");
  });

  for (const localDataFixture of ["absent", "empty", "populated"] as const) {
    it(`skips staged Binance months before the configured first available month with ${localDataFixture} local data`, async () => {
      const stagingDataDir = await createTempDir();
      const catalogDir = await createTempDir();
      const config = await loadStagedOnlyConfig();
      process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = await createLocalDataFixture(localDataFixture);
      process.env.TRADING_BACKTEST_STAGING_DATA_DIR = stagingDataDir;

      const stagingCatalogPath = path.join(catalogDir, "staging-catalog.json");
      await writeJsonAtomic(stagingCatalogPath, {
        version: 1,
        markets: [{
          instrument: "SOLUSD",
          group: "crypto",
          status: "staged_only",
          priority: 90,
          rationale: "New crypto staging candidate.",
          expected_local_format: "crypto_binance_monthly_m1",
          expected_symbol: "SOLUSDT",
          first_available_month: "2020-08",
          target_path_segments: ["crypto", "solusd"],
          source: {
            provider: "Binance",
            kind: "official_public_archive",
            listing_url: "https://data.binance.vision/?prefix=data/spot/monthly/klines/SOLUSDT/1m/",
            reference_url: "https://data.binance.vision/",
          },
        }],
      });

      const plan = await buildTradingMarketDataBackfillPlan({
        config,
        instruments: [],
        from: { year: 2020, month: 7 },
        to: { year: 2020, month: 8 },
        includeStaged: true,
        stagingCatalogPath,
      });

      const entry = plan.entries.find((item) => item.instrument === "SOLUSD");
      const missingDownloadable = plan.entries.flatMap((item) =>
        item.periods
          .filter((period) => period.status === "missing_downloadable")
          .map((period) => `${item.instrument}:${period.label}`));

      expect(entry?.periods.map((period) => period.status)).toEqual([
        "unsupported",
        "missing_downloadable",
      ]);
      expect(missingDownloadable).toEqual(["SOLUSD:2020-08"]);
      expect(plan.summary.unsupported).toBe(1);
      expect(plan.summary.missingDownloadable).toBe(1);
      expect(entry?.periods[0]?.remoteUrl).toBeNull();
    });
  }
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildTradingMarketDataBackfillPlan } from "@/lib/trading/research";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "syntrake-market-backfill-"));
  tempDirs.push(dir);
  return dir;
}

async function writeFileWithParents(targetPath: string): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, "sample\n", "utf8");
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
    expect(entry.autoDownload).toBe(false);
    expect(entry.periods).toHaveLength(1);
    expect(entry.periods[0]?.status).toBe("missing_manual");
    expect(plan.summary.missingManual).toBe(1);
  });
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadLocalHistoricalTradingDataset, resetTwelveDataHistoricalState } from "@/lib/trading/backtest";
import { syncTwelveDataYearlyFile } from "@/lib/trading/backtest/twelveDataArchiveSync";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "syntrake-td-archive-"));
  tempDirs.push(dir);
  return dir;
}

describe("trading Twelve Data archive sync", () => {
  const originalFetch = globalThis.fetch;
  const originalLocalDataDir = process.env.TRADING_BACKTEST_LOCAL_DATA_DIR;
  const originalApiKey = process.env.TWELVEDATA_API_KEY;

  afterEach(async () => {
    resetTwelveDataHistoricalState();
    globalThis.fetch = originalFetch;
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = originalLocalDataDir;
    process.env.TWELVEDATA_API_KEY = originalApiKey;
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("downloads a yearly forex archive and makes it readable by the local-only loader", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;
    process.env.TWELVEDATA_API_KEY = "test-key";

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      if (url.pathname.endsWith("/earliest_timestamp")) {
        return {
          ok: true,
          json: async () => ({
            datetime: "2024-01-01 00:00:00",
          }),
        };
      }
      const startRaw = (url.searchParams.get("start_date") ?? "").replace(" ", "T");
      const startDate = new Date(`${startRaw}Z`);
      const nextDate = new Date(startDate.getTime() + 60_000);
      const format = (value: Date) => value.toISOString().replace(".000Z", "Z");

      return {
        ok: true,
        json: async () => ({
          values: [
            {
              datetime: format(startDate),
              open: "1.1000",
              high: "1.1010",
              low: "1.0990",
              close: "1.1005",
              volume: "12",
            },
            {
              datetime: format(nextDate),
              open: "1.1005",
              high: "1.1020",
              low: "1.1000",
              close: "1.1015",
              volume: "15",
            },
          ],
        }),
      };
    }) as any;

    const synced = await syncTwelveDataYearlyFile({
      instrument: "EURUSD",
      year: 2024,
      force: true,
    });

    expect(synced.status).toBe("downloaded");
    expect(synced.providerSymbol).toBe("EUR/USD");
    expect(synced.candleCount).toBeGreaterThan(2);

    const filePath = path.join(baseDir, "forex", "eurusd", "DAT_ASCII_EURUSD_M1_2024.csv");
    const raw = await readFile(filePath, "utf8");
    expect(raw).toContain("20240101 000000;1.1;1.101;1.099;1.1005;12");

    const dataset = await loadLocalHistoricalTradingDataset({
      instrument: "EURUSD",
      from: "2024-01-01T00:00:00.000Z",
      to: "2024-01-01T00:01:59.000Z",
      timeframes: ["1m"],
    });

    expect(dataset.metadata.source).toBe("local_archive");
    expect(dataset.dataset.timeframes["1m"]).toEqual([
      expect.objectContaining({
        timestamp: "2024-01-01T00:00:00.000Z",
        open: 1.1,
        close: 1.1005,
      }),
      expect.objectContaining({
        timestamp: "2024-01-01T00:01:00.000Z",
        open: 1.1005,
        close: 1.1015,
      }),
    ]);
  });

  it("classifies license or plan restrictions separately from missing remote history", async () => {
    const baseDir = await createTempDir();
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = baseDir;
    process.env.TWELVEDATA_API_KEY = "test-key";

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);

      return {
        ok: true,
        json: async () => ({
          status: "error",
          message:
            url.pathname.endsWith("/earliest_timestamp")
              ? "This symbol is available starting with the Grow or Venture plan."
              : "This symbol is available starting with the Grow or Venture plan.",
        }),
      };
    }) as any;

    const synced = await syncTwelveDataYearlyFile({
      instrument: "NAS100",
      year: 2024,
      force: true,
    });

    expect(synced.status).toBe("restricted_remote_access");
    expect(synced.providerSymbol).toBe("NDX");
    expect(synced.restrictionReason).toContain("Grow or Venture plan");
  });
});

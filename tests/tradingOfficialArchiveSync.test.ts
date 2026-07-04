import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildBinanceMonthlyKlineZipUrl,
  buildMonthlyRange,
  parseChecksumFile,
  summarizeSyncResult,
  syncBinanceMonthlyArchive,
} from "@/lib/trading/backtest";

describe("trading official archive sync", () => {
  const originalFetch = globalThis.fetch;
  const originalLocalDataDir = process.env.TRADING_BACKTEST_LOCAL_DATA_DIR;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = originalLocalDataDir;
    vi.restoreAllMocks();
  });

  it("builds inclusive monthly ranges for backfill planning", () => {
    expect(
      buildMonthlyRange(
        { year: 2025, month: 11 },
        { year: 2026, month: 2 },
      ),
    ).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ]);
  });

  it("builds Binance monthly kline archive urls using the official folder layout", () => {
    expect(
      buildBinanceMonthlyKlineZipUrl("BTCUSDT", { year: 2025, month: 1 }),
    ).toBe(
      "https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1m/BTCUSDT-1m-2025-01.zip",
    );
  });

  it("parses sha256 values from Binance checksum files", () => {
    expect(parseChecksumFile("abcdef1234567890  BTCUSDT-1m-2025-01.zip")).toBe("abcdef1234567890");
    expect(parseChecksumFile("")).toBeNull();
  });

  it("classifies unpublished Binance monthly archives as missing_remote instead of failing the worker", async () => {
    process.env.TRADING_BACKTEST_LOCAL_DATA_DIR = "tmp/syntrake-test-historical";
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
      body: null,
    })) as any;

    const result = await syncBinanceMonthlyArchive({
      instrument: "BTCUSD",
      from: { year: 2026, month: 6 },
      to: { year: 2026, month: 6 },
      force: true,
    });
    const summary = await summarizeSyncResult({ rootDir: "tmp/syntrake-test-historical", entries: result });

    expect(result).toEqual([
      expect.objectContaining({
        instrument: "BTCUSD",
        status: "missing_remote",
        periodLabel: "2026-06",
        remoteUrl: buildBinanceMonthlyKlineZipUrl("BTCUSDT", { year: 2026, month: 6 }),
        checksumVerified: null,
      }),
    ]);
    expect(summary).toMatchObject({
      downloaded: 0,
      existing: 0,
      missingLocal: 0,
      missingRemote: 1,
      unsupported: 0,
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  buildBinanceMonthlyKlineZipUrl,
  buildMonthlyRange,
  parseChecksumFile,
} from "@/lib/trading/backtest";

describe("trading official archive sync", () => {
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
});

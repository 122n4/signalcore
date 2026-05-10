import { afterEach, describe, expect, it, vi } from "vitest";

import { binanceCandles, binanceQuote } from "@/lib/market/providers/binance";

describe("binance provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps crypto candles to Binance spot klines without requiring an API key", async () => {
    const fetchMock = vi.fn(async (...args: any[]) => {
      void args;
      return {
        ok: true,
        json: async () => [
          [1_000, "64000", "64200", "63900", "64150", "10", 0, "0", 0, "0", "0", "0"],
          [2_000, "64150", "64300", "64050", "64250", "11", 0, "0", 0, "0", "0", "0"],
        ],
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const candles = await binanceCandles(
      "BTC/USD",
      { interval: "5min", points: 2 },
      0,
      { memoryCacheTtlMs: 0 },
    );
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(candles).toEqual([
      { t: 1_000, o: 64000, h: 64200, l: 63900, c: 64150, v: 10 },
      { t: 2_000, o: 64150, h: 64300, l: 64050, c: 64250, v: 11 },
    ]);
    expect(requestUrl.pathname).toBe("/api/v3/klines");
    expect(requestUrl.searchParams.get("symbol")).toBe("BTCUSDT");
    expect(requestUrl.searchParams.get("interval")).toBe("5m");
  });

  it("normalizes crypto 24h ticker quotes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          symbol: "ETHUSDT",
          lastPrice: "3200.5",
          priceChange: "20.5",
          priceChangePercent: "0.64",
          openPrice: "3180",
          highPrice: "3250",
          lowPrice: "3150",
          volume: "12345",
          closeTime: 1_765_000_000_000,
        }),
      })),
    );

    const quote = await binanceQuote("ETH/USD", 0, { memoryCacheTtlMs: 0 });

    expect(quote).toMatchObject({
      symbol: "ETHUSDT",
      kind: "crypto",
      price: 3200.5,
      provider: "binance",
      isMarketOpen: true,
      currency: "USDT",
      timestamp: 1_765_000_000_000,
    });
  });
});

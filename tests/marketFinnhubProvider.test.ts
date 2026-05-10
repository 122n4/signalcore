import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { finnhubCandles } from "@/lib/market/providers/finnhub";

describe("finnhub provider", () => {
  const originalKey = process.env.FINNHUB_API_KEY;

  beforeEach(() => {
    process.env.FINNHUB_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.FINNHUB_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("maps forex candles to the forex endpoint with OANDA symbols", async () => {
    const fetchMock = vi.fn(async (...args: any[]) => {
      void args;
      return {
        ok: true,
        json: async () => ({
          s: "ok",
          t: [1, 2],
          o: [1.1, 1.2],
          h: [1.2, 1.3],
          l: [1.0, 1.1],
          c: [1.15, 1.25],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const candles = await finnhubCandles("EUR/USD", { interval: "5min", points: 2 });
    const firstUrl = String(fetchMock.mock.calls.at(0)?.[0] ?? "");

    expect(candles).toHaveLength(2);
    expect(firstUrl).toContain("/forex/candle?");
    expect(firstUrl).toContain("symbol=OANDA%3AEUR_USD");
  });

  it("maps crypto candles to the crypto endpoint with BINANCE symbols", async () => {
    const fetchMock = vi.fn(async (...args: any[]) => {
      void args;
      return {
        ok: true,
        json: async () => ({
          s: "ok",
          t: [1, 2],
          o: [64000, 64100],
          h: [64200, 64300],
          l: [63900, 64050],
          c: [64150, 64250],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const candles = await finnhubCandles("BTC/USD", { interval: "5min", points: 2 });
    const firstUrl = String(fetchMock.mock.calls.at(0)?.[0] ?? "");

    expect(candles).toHaveLength(2);
    expect(firstUrl).toContain("/crypto/candle?");
    expect(firstUrl).toContain("symbol=BINANCE%3ABTCUSDT");
  });
});

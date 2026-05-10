import { afterEach, describe, expect, it, vi } from "vitest";

import { coinbaseCandles, coinbaseQuote, toCoinbaseProductId } from "@/lib/market/providers/coinbase";

describe("coinbase provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes crypto symbols to Coinbase product ids", () => {
    expect(toCoinbaseProductId("BTC/USD")).toBe("BTC-USD");
    expect(toCoinbaseProductId("ETHUSD")).toBe("ETH-USD");
    expect(toCoinbaseProductId("BTCUSDT")).toBe("BTC-USD");
  });

  it("maps Coinbase candles into ascending OHLCV rows without requiring an API key", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        [2, 64050, 64300, 64150, 64250, 11],
        [1, 63900, 64200, 64000, 64150, 10],
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const candles = await coinbaseCandles(
      "BTC/USD",
      { interval: "5min", points: 2 },
      0,
      { memoryCacheTtlMs: 0 },
    );
    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    const requestUrl = new URL(String(firstCall?.[0]));

    expect(candles).toEqual([
      { t: 1_000, o: 64000, h: 64200, l: 63900, c: 64150, v: 10 },
      { t: 2_000, o: 64150, h: 64300, l: 64050, c: 64250, v: 11 },
    ]);
    expect(requestUrl.pathname).toBe("/products/BTC-USD/candles");
    expect(requestUrl.searchParams.get("granularity")).toBe("300");
  });

  it("normalizes Coinbase ticker quotes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          price: "3200.5",
          volume: "12345",
          time: "2026-05-10T11:00:00.000Z",
        }),
      })),
    );

    const quote = await coinbaseQuote("ETH/USD", 0, { memoryCacheTtlMs: 0 });

    expect(quote).toMatchObject({
      symbol: "ETH-USD",
      kind: "crypto",
      price: 3200.5,
      provider: "coinbase",
      isMarketOpen: true,
      currency: "USD",
      timestamp: Date.parse("2026-05-10T11:00:00.000Z"),
    });
  });
});

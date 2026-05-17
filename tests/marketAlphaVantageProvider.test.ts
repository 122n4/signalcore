import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { alphaVantageCandles, alphaVantageQuote } from "@/lib/market/providers/alphavantage";

describe("alpha vantage provider", () => {
  const originalKey = process.env.ALPHAVANTAGE_API_KEY;

  beforeEach(() => {
    process.env.ALPHAVANTAGE_API_KEY = "av-test-key";
  });

  afterEach(() => {
    process.env.ALPHAVANTAGE_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("normalizes equity quote payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          "Global Quote": {
            "01. symbol": "AAPL",
            "02. open": "210",
            "03. high": "215",
            "04. low": "209",
            "05. price": "214.2",
            "06. volume": "1200",
            "09. change": "1.2",
            "10. change percent": "0.5630%",
          },
        }),
      })),
    );

    const quote = await alphaVantageQuote("AAPL", 0);

    expect(quote.provider).toBe("alphavantage");
    expect(quote.price).toBe(214.2);
    expect(quote.percent).toBe(0.563);
  });

  it("normalizes forex candles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          "Time Series FX (5min)": {
            "2026-05-17 10:00:00": {
              "1. open": "1.09",
              "2. high": "1.10",
              "3. low": "1.08",
              "4. close": "1.095",
            },
          },
        }),
      })),
    );

    const candles = await alphaVantageCandles("EUR/USD", { interval: "5min", points: 1 }, 0);

    expect(candles).toEqual([
      { t: Date.parse("2026-05-17 10:00:00"), o: 1.09, h: 1.1, l: 1.08, c: 1.095, v: undefined },
    ]);
  });
});

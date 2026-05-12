import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fmpCandles, fmpQuote } from "@/lib/market/providers/fmp";

describe("fmp provider", () => {
  const originalKey = process.env.FMP_API_KEY;

  beforeEach(() => {
    process.env.FMP_API_KEY = "fmp-test-key";
  });

  afterEach(() => {
    process.env.FMP_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("normalizes quote payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            symbol: "AAPL",
            price: 210.5,
            change: 1.2,
            changesPercentage: 0.57,
            timestamp: 1768204680,
          },
        ],
      })),
    );

    const quote = await fmpQuote("AAPL", 0);

    expect(quote.provider).toBe("fmp");
    expect(quote.price).toBe(210.5);
    expect(quote.timestamp).toBe(1768204680 * 1000);
  });

  it("maps metals to FMP commodity symbols", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          date: "2026-05-12 10:00:00",
          open: 2300,
          high: 2310,
          low: 2290,
          close: 2305,
        },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await fmpCandles("XAUUSD", { interval: "5min", points: 30 }, 0);

    const requestUrl = String((fetchMock.mock.calls as any[])[0]?.[0]);
    expect(requestUrl).toContain("/historical-chart/5min/GCUSD");
  });
});

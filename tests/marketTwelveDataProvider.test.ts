import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tdCandles, tdQuoteNormalized } from "@/lib/market/providers/twelvedata";
import { resetTwelveDataKeyPoolForTests } from "@/lib/market/providers/twelvedataKeyPool";

describe("twelvedata provider", () => {
  const originalKey = process.env.TWELVEDATA_API_KEY;
  const originalKeys = process.env.TWELVEDATA_API_KEYS;

  beforeEach(() => {
    process.env.TWELVEDATA_API_KEY = "test-key";
    delete process.env.TWELVEDATA_API_KEYS;
    resetTwelveDataKeyPoolForTests();
  });

  afterEach(() => {
    process.env.TWELVEDATA_API_KEY = originalKey;
    process.env.TWELVEDATA_API_KEYS = originalKeys;
    resetTwelveDataKeyPoolForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the provider timestamp when quote metadata includes it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          symbol: "AAPL",
          close: "187.38",
          change: "0.43",
          percent_change: "0.23",
          timestamp: 1768204680,
        }),
      })),
    );

    const quote = await tdQuoteNormalized("AAPL");

    expect(quote.timestamp).toBe(1768204680 * 1000);
  });

  it("falls back to parsing the provider datetime when numeric timestamp is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          symbol: "MSFT",
          close: "420.15",
          datetime: "2026-01-12 07:58:00",
        }),
      })),
    );

    const quote = await tdQuoteNormalized("MSFT");

    expect(quote.timestamp).toBe(Date.parse("2026-01-12 07:58:00"));
  });


  it("does not fabricate Date.now when quote timestamp metadata is absent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          symbol: "NO_TS",
          close: "100.00",
        }),
      })),
    );

    const quote = await tdQuoteNormalized("NO_TS", 0);

    expect(quote.timestamp).toBeUndefined();
  });

  it("does not fabricate Date.now for candles with invalid provider datetimes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          values: [
            {
              datetime: "not-a-date",
              open: "99.00",
              high: "101.00",
              low: "98.00",
              close: "100.00",
            },
          ],
        }),
      })),
    );

    const candles = await tdCandles("NO_CANDLE_TS", { interval: "5min", points: 40 }, 0);

    expect(candles).toEqual([]);
  });

  it("requests pre/post-market data explicitly when extended hours are needed", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => ({
      ok: (void _input, true),
      json: async () => ({
        symbol: "QQQ",
        close: "510.25",
        timestamp: 1768204680,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await tdQuoteNormalized("QQQ", undefined, { extendedHours: true });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("prepost")).toBe("true");
  });

  it("falls through to the next Twelve Data key when one key is rate limited", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    process.env.TWELVEDATA_API_KEYS = "limited-key, fresh-key";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "error",
          message: "You have run out of API credits for the current minute.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          symbol: "EUR/USD",
          close: "1.0912",
          timestamp: 1768204680,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const quote = await tdQuoteNormalized("EUR/USD", 0);

    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(firstUrl.searchParams.get("apikey")).toBe("limited-key");
    expect(secondUrl.searchParams.get("apikey")).toBe("fresh-key");
    expect(quote.price).toBe(1.0912);
  });
});

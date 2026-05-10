import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tdQuoteNormalized } from "@/lib/market/providers/twelvedata";

describe("twelvedata provider", () => {
  const originalKey = process.env.TWELVEDATA_API_KEY;

  beforeEach(() => {
    process.env.TWELVEDATA_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.TWELVEDATA_API_KEY = originalKey;
    vi.unstubAllGlobals();
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
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { krakenCandles, krakenQuote, toKrakenPair } from "@/lib/market/providers/kraken";

describe("kraken provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps BTC/USD to Kraken XBTUSD", () => {
    expect(toKrakenPair("BTC/USD")).toBe("XBTUSD");
  });

  it("normalizes public ticker payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          error: [],
          result: {
            XXBTZUSD: {
              c: ["103000.5", "0.1"],
              o: "102000",
              h: ["104000", "104500"],
              l: ["101500", "101000"],
              v: ["10", "100"],
            },
          },
        }),
      })),
    );

    const quote = await krakenQuote("BTC/USD", 0);

    expect(quote.provider).toBe("kraken");
    expect(quote.price).toBe(103000.5);
    expect(quote.symbol).toBe("XBTUSD");
  });

  it("normalizes OHLC payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          error: [],
          result: {
            XXBTZUSD: [
              [1768204500, "100", "110", "90", "105", "103", "12", 5],
            ],
            last: 1768204500,
          },
        }),
      })),
    );

    const candles = await krakenCandles("BTC/USD", { interval: "5min", points: 1 }, 0);

    expect(candles).toEqual([
      { t: 1768204500 * 1000, o: 100, h: 110, l: 90, c: 105, v: 12 },
    ]);
  });
});

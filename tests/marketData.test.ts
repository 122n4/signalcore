import { beforeEach, describe, expect, it, vi } from "vitest";

const { getQuoteMock, getCandlesMock } = vi.hoisted(() => ({
  getQuoteMock: vi.fn(),
  getCandlesMock: vi.fn(),
}));

vi.mock("@/lib/market/marketClient", () => ({
  getQuote: getQuoteMock,
  getCandles: getCandlesMock,
}));

import { getQuotes } from "@/lib/signalcore/marketData";

describe("signalcore marketData", () => {
  beforeEach(() => {
    getQuoteMock.mockReset();
    getCandlesMock.mockReset();
  });

  it("routes investing quotes through the normalized market client", async () => {
    getQuoteMock.mockImplementation(async (symbol: string) => ({
      symbol,
      price: symbol === "AAPL" ? 192.4 : 497.2,
      timestamp: 1_710_000_000_000,
      provider: "test-provider",
      currency: "USD",
      prevClose: symbol === "AAPL" ? 190.1 : 490.4,
      volume: symbol === "AAPL" ? 12_500_000 : 8_400_000,
      averageVolume: symbol === "AAPL" ? 15_000_000 : 8_900_000,
    }));

    const quotes = await getQuotes({
      symbols: ["AAPL", "MSFT"],
      mode: "investing",
      ttlSec: 15,
    });

    expect(getQuoteMock).toHaveBeenCalledTimes(2);
    expect(getQuoteMock).toHaveBeenCalledWith("AAPL", "twelvedata");
    expect(getQuoteMock).toHaveBeenCalledWith("MSFT", "twelvedata");
    expect(quotes.AAPL).toMatchObject({
      price: 192.4,
      source: "test-provider",
      currency: "USD",
      prevClose: 190.1,
      volume: 12_500_000,
      averageVolume: 15_000_000,
    });
    expect(quotes.MSFT).toMatchObject({
      price: 497.2,
      source: "test-provider",
      currency: "USD",
      prevClose: 490.4,
      volume: 8_400_000,
      averageVolume: 8_900_000,
    });
  });

  it("falls back to the latest candle close when the quote endpoint fails", async () => {
    getQuoteMock.mockRejectedValue(new Error("quote down"));
    getCandlesMock.mockResolvedValue([
      { t: 1_710_000_000_000, o: 189, h: 193, l: 188.5, c: 191.8, v: 12 },
      { t: 1_710_000_300_000, o: 191.8, h: 192.9, l: 191.1, c: 192.25, v: 14 },
    ]);

    const quotes = await getQuotes({
      symbols: ["NVDA"],
      mode: "investing",
      ttlSec: 15,
    });

    expect(getQuoteMock).toHaveBeenCalledWith("NVDA", "twelvedata");
    expect(getCandlesMock).toHaveBeenCalledWith("NVDA", { interval: "5min", points: 2 }, "auto");
    expect(quotes.NVDA).toMatchObject({
      price: 192.25,
      source: "market-client-candle-fallback",
      open: 191.8,
      high: 192.9,
      low: 191.1,
      volume: 14,
    });
  });
});

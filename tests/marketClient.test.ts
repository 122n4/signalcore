import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  binanceCandlesMock,
  binanceQuoteMock,
  coinbaseCandlesMock,
  coinbaseQuoteMock,
  finnhubCandlesMock,
  finnhubQuoteMock,
  tdCandlesMock,
  tdQuoteMock,
} = vi.hoisted(() => ({
  binanceCandlesMock: vi.fn(),
  binanceQuoteMock: vi.fn(),
  coinbaseCandlesMock: vi.fn(),
  coinbaseQuoteMock: vi.fn(),
  finnhubCandlesMock: vi.fn(),
  finnhubQuoteMock: vi.fn(),
  tdCandlesMock: vi.fn(),
  tdQuoteMock: vi.fn(),
}));

vi.mock("@/lib/market/providers/binance", () => ({
  binanceCandles: binanceCandlesMock,
  binanceQuote: binanceQuoteMock,
}));

vi.mock("@/lib/market/providers/coinbase", () => ({
  coinbaseCandles: coinbaseCandlesMock,
  coinbaseQuote: coinbaseQuoteMock,
}));

vi.mock("@/lib/market/providers/finnhub", () => ({
  finnhubCandles: finnhubCandlesMock,
  finnhubQuote: finnhubQuoteMock,
}));

vi.mock("@/lib/market/providers/twelvedata", () => ({
  tdCandles: tdCandlesMock,
  tdQuoteNormalized: tdQuoteMock,
}));

import { getCandles } from "@/lib/market/marketClient";

describe("market client provider routing", () => {
  const originalTwelveDataKey = process.env.TWELVEDATA_API_KEY;
  const originalFinnhubKey = process.env.FINNHUB_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWELVEDATA_API_KEY = "td-test-key";
    process.env.FINNHUB_API_KEY = "fh-test-key";
  });

  afterEach(() => {
    process.env.TWELVEDATA_API_KEY = originalTwelveDataKey;
    process.env.FINNHUB_API_KEY = originalFinnhubKey;
  });

  it("uses the configured fallback provider when the primary key is absent", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    finnhubCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto");

    expect(tdCandlesMock).not.toHaveBeenCalled();
    expect(finnhubCandlesMock).toHaveBeenCalledWith(
      "EUR/USD",
      { interval: "5min", points: 2 },
      undefined,
      undefined,
    );
    expect(candles).toHaveLength(1);
  });

  it("uses Coinbase public candles first for crypto auto routing", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FINNHUB_API_KEY;
    coinbaseCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("BTC/USD", { interval: "5min", points: 2 }, "auto");

    expect(coinbaseCandlesMock).toHaveBeenCalledWith(
      "BTC/USD",
      { interval: "5min", points: 2 },
      undefined,
      undefined,
    );
    expect(binanceCandlesMock).not.toHaveBeenCalled();
    expect(tdCandlesMock).not.toHaveBeenCalled();
    expect(finnhubCandlesMock).not.toHaveBeenCalled();
    expect(candles).toHaveLength(1);
  });

  it("falls back to Binance if Coinbase crypto candles fail", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FINNHUB_API_KEY;
    coinbaseCandlesMock.mockRejectedValue(new Error("coinbase_unavailable"));
    binanceCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("BTC/USD", { interval: "5min", points: 2 }, "auto");

    expect(coinbaseCandlesMock).toHaveBeenCalled();
    expect(binanceCandlesMock).toHaveBeenCalled();
    expect(candles).toHaveLength(1);
  });

  it("surfaces aggregated provider errors when all providers fail", async () => {
    tdCandlesMock.mockRejectedValue(new Error("rate_limited"));
    finnhubCandlesMock.mockRejectedValue(new Error("quota_exceeded"));

    await expect(
      getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto"),
    ).rejects.toThrow("twelvedata:rate_limited | finnhub:quota_exceeded");
  });
});

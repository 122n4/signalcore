import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  binanceCandlesMock,
  binanceQuoteMock,
  coinbaseCandlesMock,
  coinbaseQuoteMock,
  finnhubCandlesMock,
  finnhubQuoteMock,
  fmpCandlesMock,
  fmpQuoteMock,
  tdCandlesMock,
  tdQuoteMock,
} = vi.hoisted(() => ({
  binanceCandlesMock: vi.fn(),
  binanceQuoteMock: vi.fn(),
  coinbaseCandlesMock: vi.fn(),
  coinbaseQuoteMock: vi.fn(),
  finnhubCandlesMock: vi.fn(),
  finnhubQuoteMock: vi.fn(),
  fmpCandlesMock: vi.fn(),
  fmpQuoteMock: vi.fn(),
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

vi.mock("@/lib/market/providers/fmp", () => ({
  fmpCandles: fmpCandlesMock,
  fmpQuote: fmpQuoteMock,
}));

vi.mock("@/lib/market/providers/twelvedata", () => ({
  tdCandles: tdCandlesMock,
  tdQuoteNormalized: tdQuoteMock,
}));

import { getCandles, resetMarketClientProviderCooldownsForTests } from "@/lib/market/marketClient";
import { resetTwelveDataKeyPoolForTests } from "@/lib/market/providers/twelvedataKeyPool";

describe("market client provider routing", () => {
  const originalTwelveDataKey = process.env.TWELVEDATA_API_KEY;
  const originalTwelveDataKeys = process.env.TWELVEDATA_API_KEYS;
  const originalFinnhubKey = process.env.FINNHUB_API_KEY;
  const originalFmpKey = process.env.FMP_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMarketClientProviderCooldownsForTests();
    resetTwelveDataKeyPoolForTests();
    process.env.TWELVEDATA_API_KEY = "td-test-key";
    delete process.env.TWELVEDATA_API_KEYS;
    process.env.FINNHUB_API_KEY = "fh-test-key";
    process.env.FMP_API_KEY = "fmp-test-key";
  });

  afterEach(() => {
    process.env.TWELVEDATA_API_KEY = originalTwelveDataKey;
    process.env.TWELVEDATA_API_KEYS = originalTwelveDataKeys;
    process.env.FINNHUB_API_KEY = originalFinnhubKey;
    process.env.FMP_API_KEY = originalFmpKey;
    resetTwelveDataKeyPoolForTests();
  });

  it("uses the configured fallback provider when the primary key is absent", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FMP_API_KEY;
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

  it("treats TWELVEDATA_API_KEYS as a configured Twelve Data provider", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    process.env.TWELVEDATA_API_KEYS = "td-pool-key-1,td-pool-key-2";
    tdCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto");

    expect(tdCandlesMock).toHaveBeenCalledWith(
      "EUR/USD",
      { interval: "5min", points: 2 },
      undefined,
      undefined,
    );
    expect(finnhubCandlesMock).not.toHaveBeenCalled();
    expect(candles).toHaveLength(1);
  });

  it("falls back to FMP when Twelve Data is limited for forex candles", async () => {
    tdCandlesMock.mockRejectedValue(new Error("You have run out of API credits for the current minute."));
    fmpCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto");

    expect(tdCandlesMock).toHaveBeenCalled();
    expect(fmpCandlesMock).toHaveBeenCalledWith(
      "EUR/USD",
      { interval: "5min", points: 2 },
      undefined,
      undefined,
    );
    expect(finnhubCandlesMock).not.toHaveBeenCalled();
    expect(candles).toHaveLength(1);
  });

  it("uses Coinbase public candles first for crypto auto routing", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FINNHUB_API_KEY;
    delete process.env.FMP_API_KEY;
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
    delete process.env.FMP_API_KEY;
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
    delete process.env.FMP_API_KEY;
    tdCandlesMock.mockRejectedValue(new Error("rate_limited"));
    finnhubCandlesMock.mockRejectedValue(new Error("quota_exceeded"));

    await expect(
      getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto"),
    ).rejects.toThrow("twelvedata:rate_limited | finnhub:quota_exceeded");
  });

  it("skips a provider briefly after rate-limit failures", async () => {
    delete process.env.FMP_API_KEY;
    tdCandlesMock.mockRejectedValue(
      new Error("You have run out of API credits for the current minute."),
    );
    finnhubCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto");
    await getCandles("GBP/USD", { interval: "5min", points: 2 }, "auto");

    expect(tdCandlesMock).toHaveBeenCalledTimes(1);
    expect(finnhubCandlesMock).toHaveBeenCalledTimes(2);
  });
});

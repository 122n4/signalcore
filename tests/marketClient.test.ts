import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  alphaVantageCandlesMock,
  alphaVantageQuoteMock,
  binanceCandlesMock,
  binanceQuoteMock,
  coinbaseCandlesMock,
  coinbaseQuoteMock,
  finnhubCandlesMock,
  finnhubQuoteMock,
  fmpCandlesMock,
  fmpQuoteMock,
  krakenCandlesMock,
  krakenQuoteMock,
  tdCandlesMock,
  tdQuoteMock,
} = vi.hoisted(() => ({
  alphaVantageCandlesMock: vi.fn(),
  alphaVantageQuoteMock: vi.fn(),
  binanceCandlesMock: vi.fn(),
  binanceQuoteMock: vi.fn(),
  coinbaseCandlesMock: vi.fn(),
  coinbaseQuoteMock: vi.fn(),
  finnhubCandlesMock: vi.fn(),
  finnhubQuoteMock: vi.fn(),
  fmpCandlesMock: vi.fn(),
  fmpQuoteMock: vi.fn(),
  krakenCandlesMock: vi.fn(),
  krakenQuoteMock: vi.fn(),
  tdCandlesMock: vi.fn(),
  tdQuoteMock: vi.fn(),
}));

vi.mock("@/lib/market/providers/alphavantage", () => ({
  alphaVantageCandles: alphaVantageCandlesMock,
  alphaVantageQuote: alphaVantageQuoteMock,
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

vi.mock("@/lib/market/providers/kraken", () => ({
  krakenCandles: krakenCandlesMock,
  krakenQuote: krakenQuoteMock,
}));

vi.mock("@/lib/market/providers/twelvedata", () => ({
  tdCandles: tdCandlesMock,
  tdQuoteNormalized: tdQuoteMock,
}));

import {
  getCandles,
  getMarketClientTelemetrySummary,
  getQuote,
  resetMarketClientProviderCooldownsForTests,
} from "@/lib/market/marketClient";
import { resetTwelveDataKeyPoolForTests } from "@/lib/market/providers/twelvedataKeyPool";

describe("market client provider routing", () => {
  const originalTwelveDataKey = process.env.TWELVEDATA_API_KEY;
  const originalTwelveDataKeys = process.env.TWELVEDATA_API_KEYS;
  const originalFinnhubKey = process.env.FINNHUB_API_KEY;
  const originalFmpKey = process.env.FMP_API_KEY;
  const originalAlphaVantageKey = process.env.ALPHAVANTAGE_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMarketClientProviderCooldownsForTests();
    resetTwelveDataKeyPoolForTests();
    process.env.TWELVEDATA_API_KEY = "td-test-key";
    delete process.env.TWELVEDATA_API_KEYS;
    process.env.FINNHUB_API_KEY = "fh-test-key";
    process.env.FMP_API_KEY = "fmp-test-key";
    process.env.ALPHAVANTAGE_API_KEY = "av-test-key";
  });

  afterEach(() => {
    process.env.TWELVEDATA_API_KEY = originalTwelveDataKey;
    process.env.TWELVEDATA_API_KEYS = originalTwelveDataKeys;
    process.env.FINNHUB_API_KEY = originalFinnhubKey;
    process.env.FMP_API_KEY = originalFmpKey;
    process.env.ALPHAVANTAGE_API_KEY = originalAlphaVantageKey;
    resetTwelveDataKeyPoolForTests();
  });

  it("uses the configured fallback provider when the primary key is absent", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FMP_API_KEY;
    delete process.env.ALPHAVANTAGE_API_KEY;
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
    expect(candles.cacheState).toEqual({
      stale: false,
      servedFromFallback: false,
      state: "fresh",
      lastGoodAt: null,
    });
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

  it("falls back to Finnhub when Twelve Data is limited for forex candles", async () => {
    tdCandlesMock.mockRejectedValue(new Error("You have run out of API credits for the current minute."));
    finnhubCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto");

    expect(tdCandlesMock).toHaveBeenCalled();
    expect(finnhubCandlesMock).toHaveBeenCalledWith(
      "EUR/USD",
      { interval: "5min", points: 2 },
      undefined,
      undefined,
    );
    expect(fmpCandlesMock).not.toHaveBeenCalled();
    expect(candles).toHaveLength(1);
  });

  it("falls back to Alpha Vantage when Twelve Data and Finnhub fail for forex", async () => {
    tdCandlesMock.mockRejectedValue(new Error("rate_limited"));
    finnhubCandlesMock.mockRejectedValue(new Error("finnhub_unavailable"));
    alphaVantageCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto");

    expect(alphaVantageCandlesMock).toHaveBeenCalledWith(
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
    delete process.env.FMP_API_KEY;
    delete process.env.ALPHAVANTAGE_API_KEY;
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
    expect(krakenCandlesMock).not.toHaveBeenCalled();
    expect(tdCandlesMock).not.toHaveBeenCalled();
    expect(finnhubCandlesMock).not.toHaveBeenCalled();
    expect(candles).toHaveLength(1);
  });

  it("falls back to Binance if Coinbase crypto candles fail", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FINNHUB_API_KEY;
    delete process.env.FMP_API_KEY;
    delete process.env.ALPHAVANTAGE_API_KEY;
    coinbaseCandlesMock.mockRejectedValue(new Error("coinbase_unavailable"));
    binanceCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("BTC/USD", { interval: "5min", points: 2 }, "auto");

    expect(coinbaseCandlesMock).toHaveBeenCalled();
    expect(binanceCandlesMock).toHaveBeenCalled();
    expect(candles).toHaveLength(1);
  });

  it("falls back to Kraken if Coinbase and Binance crypto candles fail", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FINNHUB_API_KEY;
    delete process.env.FMP_API_KEY;
    delete process.env.ALPHAVANTAGE_API_KEY;
    coinbaseCandlesMock.mockRejectedValue(new Error("coinbase_unavailable"));
    binanceCandlesMock.mockRejectedValue(new Error("binance_unavailable"));
    krakenCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const candles = await getCandles("BTC/USD", { interval: "5min", points: 2 }, "auto");

    expect(coinbaseCandlesMock).toHaveBeenCalled();
    expect(binanceCandlesMock).toHaveBeenCalled();
    expect(krakenCandlesMock).toHaveBeenCalled();
    expect(candles).toHaveLength(1);
  });

  it("surfaces aggregated provider errors when all providers fail", async () => {
    delete process.env.FMP_API_KEY;
    delete process.env.ALPHAVANTAGE_API_KEY;
    tdCandlesMock.mockRejectedValue(new Error("rate_limited"));
    finnhubCandlesMock.mockRejectedValue(new Error("quota_exceeded"));

    await expect(
      getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto"),
    ).rejects.toThrow("twelvedata:rate_limited | finnhub:quota_exceeded");
  });

  it("skips a provider briefly after rate-limit failures", async () => {
    delete process.env.ALPHAVANTAGE_API_KEY;
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

  it("deduplicates concurrent candle requests for the same symbol and timeframe", async () => {
    tdCandlesMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([
        { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
      ]), 10)),
    );

    const [first, second] = await Promise.all([
      getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto", { purpose: "paper" }),
      getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto", { purpose: "scanner" }),
    ]);

    expect(tdCandlesMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("records provider telemetry with error classification", async () => {
    tdCandlesMock.mockRejectedValue(new Error("TwelveData time_series failed (429)"));
    finnhubCandlesMock.mockResolvedValue([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto", { purpose: "paper" });

    const telemetry = getMarketClientTelemetrySummary();
    expect(telemetry.providers.twelvedata.failures).toBe(1);
    expect(telemetry.providers.twelvedata.errorBreakdown.rate_limit).toBe(1);
    expect(telemetry.providers.finnhub.successes).toBe(1);
  });

  it("returns last known good candles when every provider later fails", async () => {
    tdCandlesMock.mockResolvedValueOnce([
      { t: 1, o: 1, h: 2, l: 0.5, c: 1.5 },
    ]);

    const fresh = await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto");
    expect(fresh).toHaveLength(1);

    tdCandlesMock.mockRejectedValue(new Error("rate_limited"));
    fmpCandlesMock.mockRejectedValue(new Error("fmp_unavailable"));
    finnhubCandlesMock.mockRejectedValue(new Error("finnhub_unavailable"));
    alphaVantageCandlesMock.mockRejectedValue(new Error("alpha_unavailable"));

    const stale = await getCandles("EUR/USD", { interval: "5min", points: 2 }, "auto");
    expect([...stale]).toEqual([...fresh]);
    expect(stale.cacheState).toMatchObject({
      stale: true,
      servedFromFallback: true,
      state: "last_known_good",
    });
    expect(typeof stale.cacheState?.lastGoodAt).toBe("number");
  });

  it("returns last known good quotes when every provider later fails", async () => {
    tdQuoteMock.mockResolvedValueOnce({
      symbol: "EUR/USD",
      kind: "forex",
      price: 1.09,
      timestamp: 1,
      provider: "twelvedata",
    });

    const fresh = await getQuote("EUR/USD", "auto");
    expect(fresh.price).toBe(1.09);
    expect(fresh.cacheState).toEqual({
      stale: false,
      servedFromFallback: false,
      state: "fresh",
      lastGoodAt: null,
    });

    tdQuoteMock.mockRejectedValue(new Error("rate_limited"));
    fmpQuoteMock.mockRejectedValue(new Error("fmp_unavailable"));
    finnhubQuoteMock.mockRejectedValue(new Error("finnhub_unavailable"));
    alphaVantageQuoteMock.mockRejectedValue(new Error("alpha_unavailable"));

    const stale = await getQuote("EUR/USD", "auto");
    expect({ ...stale, cacheState: undefined }).toEqual({ ...fresh, cacheState: undefined });
    expect(stale.cacheState).toMatchObject({
      stale: true,
      servedFromFallback: true,
      state: "last_known_good",
    });
    expect(typeof stale.cacheState?.lastGoodAt).toBe("number");
  });
});

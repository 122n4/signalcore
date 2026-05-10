import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { composeDecisionEnvelope } from "@/lib/decision/composeDecisionEnvelope";
import {
  buildTradingLightScannerInputs,
  inspectTradingLightScanner,
  resolveTradingLightScannerFocus,
  resetTradingLightScannerTestState,
  setTradingLightScannerFallbackCatalogForTests,
  summarizeTradingLightScannerDiagnostics,
} from "@/lib/trading/lightScanner";

const { getCandlesMock } = vi.hoisted(() => ({
  getCandlesMock: vi.fn(),
}));

vi.mock("@/lib/market/marketClient", () => ({
  getCandles: getCandlesMock,
  hasAnyMarketDataProviderConfigured: () =>
    Boolean(
      String(process.env.TWELVEDATA_API_KEY || "").trim() ||
        String(process.env.FINNHUB_API_KEY || "").trim(),
    ),
}));

function buildTrendCandles(seed: number, points = 120) {
  const startAt = Date.now() - points * 60_000;

  return Array.from({ length: points }, (_, index) => {
    const base = seed + index * 0.35;
    const open = base - 0.22;
    const close = base + 0.18;

    return {
      t: startAt + index * 60_000,
      o: open,
      h: close + 0.28,
      l: open - 0.24,
      c: close,
      v: 1000 + index * 12,
    };
  });
}

function buildTradingCandles(seed: number, points = 120) {
  return buildTrendCandles(seed, points).map((candle) => ({
    timestamp: new Date(candle.t).toISOString(),
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
    volume: candle.v ?? null,
  }));
}

describe("trading light scanner", () => {
  const originalKey = process.env.TWELVEDATA_API_KEY;
  const originalFinnhubKey = process.env.FINNHUB_API_KEY;
  const originalLiveFetchLimit = process.env.TRADING_LIGHT_SCANNER_LIVE_FETCH_LIMIT;

  beforeEach(async () => {
    resetTradingLightScannerTestState();
    setTradingLightScannerFallbackCatalogForTests(null);
    process.env.TWELVEDATA_API_KEY = "test-key";
    delete process.env.FINNHUB_API_KEY;
    getCandlesMock.mockImplementation(async (symbol: string, timeframe: { interval: string }) => {
      const baseBySymbol: Record<string, number> = {
        "EUR/USD": 1.08,
        "GBP/USD": 1.27,
        "USD/JPY": 151.4,
        "AUD/USD": 0.67,
        "USD/CHF": 0.89,
        "NZD/USD": 0.62,
        "AUD/JPY": 101.2,
        "EUR/JPY": 163.4,
        "EUR/GBP": 0.85,
        "USD/CAD": 1.36,
        "GBP/JPY": 191.7,
        "EUR/CHF": 0.96,
        "NZD/JPY": 93.6,
        "BTC/USD": 64000,
        "ETH/USD": 3200,
        "XAU/USD": 2150,
        "XAG/USD": 24.8,
        NDX: 18200,
        QQQ: 505,
        SPX: 5100,
        GSPC: 5095,
        SPY: 510,
      };
      const intervalOffsets: Record<string, number> = {
        "1min": 0,
        "5min": 1,
        "15min": 2,
        "1h": 3,
        "4h": 4,
        "1day": 5,
      };

      return buildTrendCandles(
        (baseBySymbol[symbol] ?? 100) + (intervalOffsets[timeframe.interval] ?? 0),
      );
    });
  });

  afterEach(() => {
    process.env.TWELVEDATA_API_KEY = originalKey;
    process.env.FINNHUB_API_KEY = originalFinnhubKey;
    process.env.TRADING_LIGHT_SCANNER_LIVE_FETCH_LIMIT = originalLiveFetchLimit;
    resetTradingLightScannerTestState();
    setTradingLightScannerFallbackCatalogForTests(null);
    getCandlesMock.mockReset();
  });

  it("builds trading snapshots for the initial light scanner universe", async () => {
    const inputs = await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:00.000Z",
      forceRefresh: true,
    });

    expect(inputs.map((input) => input.snapshot.instrument)).toEqual([
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "AUDUSD",
      "USDCHF",
      "NZDUSD",
      "AUDJPY",
      "EURJPY",
      "EURGBP",
      "USDCAD",
      "GBPJPY",
      "EURCHF",
      "NZDJPY",
      "NAS100",
      "US500",
      "XAUUSD",
      "XAGUSD",
      "BTCUSD",
      "ETHUSD",
    ]);
    expect(inputs.every((input) => input.snapshot.availableTimeframes.length > 0)).toBe(true);
    expect(
      inputs.every(
        (input) => input.executionPlan.executionStatus.executionStatus.length > 0,
      ),
    ).toBe(true);
    expect(inputs.every((input) => input.scannerSnapshot?.source === "provider")).toBe(true);
    expect(
      inputs.every((input) => typeof input.scannerSnapshot?.actionableFreshness === "boolean"),
    ).toBe(true);
  });

  it("keeps live scanner provider usage credit-efficient by deriving higher timeframes from one pull", async () => {
    await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:00.000Z",
      forceRefresh: true,
    });

    expect(getCandlesMock).toHaveBeenCalledTimes(19);
    expect(
      getCandlesMock.mock.calls.every(([, timeframe]) => timeframe.interval === "5min"),
    ).toBe(true);
  });

  it("refreshes all open markets even when the generic live fetch limit is low", async () => {
    process.env.TRADING_LIGHT_SCANNER_LIVE_FETCH_LIMIT = "1";

    await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:00.000Z",
      forceRefresh: true,
    });

    expect(getCandlesMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("reuses a short scanner cache to avoid re-pulling the same market set on rapid refreshes", async () => {
    await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:00.000Z",
      forceRefresh: true,
    });
    const callsAfterFirstPass = getCandlesMock.mock.calls.length;

    await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:30.000Z",
    });

    expect(getCandlesMock.mock.calls.length).toBe(callsAfterFirstPass);
  });

  it("reuses a fresh provider cache before re-hitting the live provider", async () => {
    await buildTradingLightScannerInputs({
      asOf: "2026-03-24T12:00:00.000Z",
      forceRefresh: true,
    });
    const callsAfterFirstPass = getCandlesMock.mock.calls.length;

    await buildTradingLightScannerInputs({
      asOf: "2026-03-24T12:05:00.000Z",
      forceRefresh: true,
    });

    expect(getCandlesMock.mock.calls.length).toBe(callsAfterFirstPass);
  });

  it("resolves a light operational session focus before scanning instruments", () => {
    expect(resolveTradingLightScannerFocus("2026-03-10T14:00:00.000Z")).toEqual({
      sessionLabel: "London / NY overlap",
      preferredFocusGroups: ["forex", "equities", "metals", "crypto"],
      prioritizeOpenMarkets: true,
    });

    expect(resolveTradingLightScannerFocus("2026-03-10T02:00:00.000Z")).toEqual({
      sessionLabel: "Asia flow",
      preferredFocusGroups: ["crypto", "forex", "equities", "metals"],
      prioritizeOpenMarkets: true,
    });
  });

  it("reuses a still-fresh provider cache for open markets when live fetches fail briefly", async () => {
    await buildTradingLightScannerInputs({
      asOf: "2026-03-24T12:00:00.000Z",
      forceRefresh: true,
    });

    delete process.env.TWELVEDATA_API_KEY;

    const inputs = await buildTradingLightScannerInputs({
      asOf: "2026-03-24T12:05:00.000Z",
      forceRefresh: true,
    });

    expect(inputs).toHaveLength(19);
    expect(inputs.every((input) => input.snapshot.availableTimeframes.length > 0)).toBe(true);
  });

  it("still attempts a live scanner refresh when only the secondary provider key is configured", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    process.env.FINNHUB_API_KEY = "fh-test-key";

    const [input] = await buildTradingLightScannerInputs({
      asOf: "2026-03-24T12:00:00.000Z",
      forceRefresh: true,
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    expect(getCandlesMock).toHaveBeenCalledTimes(1);
    expect(input?.snapshot.instrument).toBe("EURUSD");
    expect(input?.snapshot.availableTimeframes.length).toBeGreaterThan(0);
  });

  it("keeps public crypto live and falls back to the committed scanner catalog for key-backed markets", async () => {
    delete process.env.TWELVEDATA_API_KEY;

    setTradingLightScannerFallbackCatalogForTests({
      generatedAt: "2026-03-25T20:45:44.593Z",
      instruments: {
        EURUSD: {
          instrument: "EURUSD",
          snapshotAt: "2026-03-25T18:29:02.624Z",
          timeframes: {
            "5m": buildTradingCandles(1.08),
            "15m": buildTradingCandles(1.1),
            "1h": buildTradingCandles(1.2),
            "4h": buildTradingCandles(1.3),
            "1d": buildTradingCandles(1.4),
          },
          writtenAt: "2026-03-25T20:45:44.593Z",
        },
        GBPUSD: {
          instrument: "GBPUSD",
          snapshotAt: "2026-03-25T18:29:02.624Z",
          timeframes: {
            "5m": buildTradingCandles(1.28),
            "15m": buildTradingCandles(1.3),
            "1h": buildTradingCandles(1.32),
            "4h": buildTradingCandles(1.34),
            "1d": buildTradingCandles(1.36),
          },
          writtenAt: "2026-03-25T20:45:44.593Z",
        },
      },
    });

    const inputs = await buildTradingLightScannerInputs({
      asOf: "2026-03-28T12:00:00.000Z",
      forceRefresh: true,
    });

    expect(inputs.map((input) => input.snapshot.instrument)).toEqual([
      "BTCUSD",
      "ETHUSD",
      "EURUSD",
      "GBPUSD",
    ]);
    expect(inputs.find((input) => input.snapshot.instrument === "BTCUSD")?.scannerSnapshot?.source)
      .toBe("provider");
    expect(inputs.find((input) => input.snapshot.instrument === "EURUSD")?.scannerSnapshot?.source)
      .toBe("catalog");
    expect(inputs.every((input) => input.snapshot.availableTimeframes.length > 0)).toBe(true);
  });

  it("falls back to the committed scanner catalog for open markets when live refresh fails", async () => {
    delete process.env.TWELVEDATA_API_KEY;

    setTradingLightScannerFallbackCatalogForTests({
      generatedAt: "2026-03-31T16:00:00.000Z",
      instruments: {
        EURUSD: {
          instrument: "EURUSD",
          snapshotAt: "2026-03-31T03:50:00.000Z",
          timeframes: {
            "5m": buildTradingCandles(1.08),
            "15m": buildTradingCandles(1.1),
            "1h": buildTradingCandles(1.2),
            "4h": buildTradingCandles(1.3),
            "1d": buildTradingCandles(1.4),
          },
          writtenAt: "2026-03-31T16:00:00.000Z",
        },
      },
    });

    const [input] = await buildTradingLightScannerInputs({
      asOf: "2026-03-31T17:21:25.009Z",
      forceRefresh: true,
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    expect(input?.snapshot.instrument).toBe("EURUSD");
    expect(input?.decisionCore.decision.currentState).toBe("WAIT");
    expect(input?.executionPlan.executionStatus.executionStatus).toBe("restricted");
    expect(input?.decisionCore.decision.secondaryMessage).toContain("fallback catalog");
  });

  it("never treats a fresh fallback catalog snapshot as live-executable", async () => {
    delete process.env.TWELVEDATA_API_KEY;

    setTradingLightScannerFallbackCatalogForTests({
      generatedAt: "2026-03-31T10:03:00.000Z",
      instruments: {
        EURUSD: {
          instrument: "EURUSD",
          snapshotAt: "2026-03-31T10:00:00.000Z",
          timeframes: {
            "5m": buildTradingCandles(1.08),
            "15m": buildTradingCandles(1.1),
            "1h": buildTradingCandles(1.2),
            "4h": buildTradingCandles(1.3),
            "1d": buildTradingCandles(1.4),
          },
          writtenAt: "2026-03-31T10:03:00.000Z",
        },
      },
    });

    const [input] = await buildTradingLightScannerInputs({
      asOf: "2026-03-31T10:03:00.000Z",
      forceRefresh: true,
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    expect(input?.decisionCore.decision.currentState).toBe("WAIT");
    expect(input?.decisionCore.decision.secondaryMessage).toContain("fallback catalog");
    expect(input?.executionPlan.executionStatus.executionStatus).toBe("restricted");
  });

  it("drops open-market snapshots entirely when the last live cache is already stale", async () => {
    setTradingLightScannerFallbackCatalogForTests({
      generatedAt: "2026-03-31T16:00:00.000Z",
      instruments: {},
    });

    await buildTradingLightScannerInputs({
      asOf: "2026-03-25T07:29:02.624Z",
      forceRefresh: true,
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    delete process.env.TWELVEDATA_API_KEY;

    const [input] = await buildTradingLightScannerInputs({
      asOf: "2026-03-25T10:45:00.000Z",
      forceRefresh: true,
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    expect(input).toBeUndefined();
  });

  it("keeps open-market stale placeholders during explicit refresh visibility checks", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FINNHUB_API_KEY;
    setTradingLightScannerFallbackCatalogForTests({
      generatedAt: "2026-03-31T16:00:00.000Z",
      instruments: {},
    });

    const [input] = await buildTradingLightScannerInputs({
      asOf: "2026-03-25T10:45:00.000Z",
      forceRefresh: true,
      includeInactiveMarkets: true,
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    expect(input?.snapshot.instrument).toBe("EURUSD");
    expect(input?.market.session.marketOpen).toBe(true);
    expect(input?.scannerSnapshot).toMatchObject({
      source: "empty",
      providerError: "missing_market_data_provider",
      actionableFreshness: false,
    });
    expect(input?.executionPlan.executionStatus.executionStatus).toBe("restricted");
  });

  it("can include closed markets as non-executable placeholders for product visibility", async () => {
    const inputs = await buildTradingLightScannerInputs({
      asOf: "2026-05-10T06:32:00.000Z",
      forceRefresh: true,
      includeInactiveMarkets: true,
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
        {
          instrument: "BTCUSD",
          dataSymbol: "BTC/USD",
          dataSymbols: [{ symbol: "BTC/USD", relation: "direct" }],
          marketType: "crypto",
          sessionProfile: "crypto",
          provider: "auto",
          focusGroup: "crypto",
        },
      ],
    });

    const byInstrument = new Map(inputs.map((input) => [input.snapshot.instrument, input]));
    const eurusd = byInstrument.get("EURUSD");

    expect(byInstrument.get("BTCUSD")?.snapshot.availableTimeframes.length).toBeGreaterThan(0);
    expect(eurusd?.snapshot.availableTimeframes).toEqual([]);
    expect(eurusd?.market.session.marketOpen).toBe(false);
    expect(eurusd?.decisionCore.decision.currentState).toBe("MARKET_CLOSED");
    expect(eurusd?.executionPlan.executionStatus.executionStatus).toBe("restricted");
    expect(eurusd?.scannerSnapshot).toMatchObject({
      source: "empty",
      providerError: "live_fetch_deferred",
      actionableFreshness: false,
    });
    expect(eurusd?.scannerSnapshot?.staleReason).toContain("Market is closed");
  });

  it("does not reuse the short scanner cache across different asOf minute buckets", async () => {
    delete process.env.TWELVEDATA_API_KEY;
    delete process.env.FINNHUB_API_KEY;

    setTradingLightScannerFallbackCatalogForTests({
      generatedAt: "2026-03-31T10:03:00.000Z",
      instruments: {
        EURUSD: {
          instrument: "EURUSD",
          snapshotAt: "2026-03-31T10:00:00.000Z",
          timeframes: {
            "5m": buildTradingCandles(1.08),
            "15m": buildTradingCandles(1.1),
            "1h": buildTradingCandles(1.2),
            "4h": buildTradingCandles(1.3),
            "1d": buildTradingCandles(1.4),
          },
          writtenAt: "2026-03-31T10:03:00.000Z",
        },
      },
    });

    const [first] = await buildTradingLightScannerInputs({
      asOf: "2026-03-31T10:03:15.000Z",
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    setTradingLightScannerFallbackCatalogForTests({
      generatedAt: "2026-03-31T10:04:00.000Z",
      instruments: {
        EURUSD: {
          instrument: "EURUSD",
          snapshotAt: "2026-03-31T10:04:00.000Z",
          timeframes: {
            "5m": buildTradingCandles(1.18),
            "15m": buildTradingCandles(1.2),
            "1h": buildTradingCandles(1.3),
            "4h": buildTradingCandles(1.4),
            "1d": buildTradingCandles(1.5),
          },
          writtenAt: "2026-03-31T10:04:00.000Z",
        },
      },
    });

    const [second] = await buildTradingLightScannerInputs({
      asOf: "2026-03-31T10:04:15.000Z",
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    expect(first?.snapshot.snapshotAt).toBe("2026-03-31T10:00:00.000Z");
    expect(second?.snapshot.snapshotAt).toBe("2026-03-31T10:04:00.000Z");
  });

  it("feeds the envelope with a real backend-generated watchlist", async () => {
    const inputs = await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:00.000Z",
    });

    const envelope = composeDecisionEnvelope({
      mode: "investing",
      asOf: "2026-03-10T14:00:00.000Z",
      branch: "success",
      branchReason: null,
      nextBestAction: null,
      whyNow: null,
      operationalAction: null,
      decisionGovernance: null,
      actionGate: null,
      riskPolicyEval: null,
      capitalStatus: null,
      decisionScores: null,
      diagnostics: null,
      engineV4: null,
      tradingWatchlistInputs: inputs,
    });

    expect(envelope.support.trading?.watchlist).toHaveLength(19);
    expect(envelope.support.trading?.watchlist.map((entry) => entry.instrument)).toEqual(
      expect.arrayContaining([
        "EURUSD",
        "GBPUSD",
        "USDJPY",
        "AUDUSD",
        "USDCHF",
        "NZDUSD",
        "AUDJPY",
        "EURJPY",
        "EURGBP",
        "USDCAD",
        "GBPJPY",
        "EURCHF",
        "NZDJPY",
        "US500",
        "BTCUSD",
        "ETHUSD",
        "XAUUSD",
        "XAGUSD",
        "NAS100",
      ]),
    );
    expect(envelope.support.trading?.watchlistFocus).toMatchObject({
      anchorInstrument: envelope.support.trading?.watchlist[0]?.instrument,
      marketOpen: true,
    });
    expect(envelope.support.trading?.watchlistSections.length).toBeGreaterThan(0);
    expect(envelope.support.trading?.watchlist.every((entry) => entry.chart?.candles.length)).toBe(
      true,
    );
    expect(
      envelope.support.trading?.watchlist.every(
        (entry) => entry.workspace.instrument === entry.instrument,
      ),
    ).toBe(true);
  });

  it("annotates scanner markets with coverage-backed, staged, and live-only metadata", async () => {
    const inputs = await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:00.000Z",
      forceRefresh: true,
    });

    const byInstrument = new Map(inputs.map((input) => [input.snapshot.instrument, input]));

    expect(byInstrument.get("EURUSD")?.scannerCoverage).toMatchObject({
      status: "coverage_backed",
      label: "Coverage-backed",
    });
    expect(byInstrument.get("AUDUSD")?.scannerCoverage).toMatchObject({
      status: "staged_only",
      label: "Staged / live",
    });
    expect(byInstrument.get("EURJPY")?.scannerCoverage).toMatchObject({
      status: "live_only",
      label: "Live-only",
    });

    const envelope = composeDecisionEnvelope({
      mode: "trading",
      asOf: "2026-03-10T14:00:00.000Z",
      branch: "success",
      branchReason: null,
      nextBestAction: null,
      whyNow: null,
      operationalAction: null,
      decisionGovernance: null,
      actionGate: null,
      riskPolicyEval: null,
      capitalStatus: null,
      decisionScores: null,
      diagnostics: null,
      engineV4: null,
      tradingWatchlistInputs: inputs,
    });

    expect(envelope.support.trading?.marketCoverageSummary).toEqual({
      coverageBackedCount: 8,
      stagedOnlyCount: 5,
      liveOnlyCount: 6,
    });
  });

  it("blocks live execution on markets that are not coverage-backed", async () => {
    const inputs = await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:00.000Z",
      forceRefresh: true,
      instruments: [
        {
          instrument: "EURJPY",
          dataSymbol: "EUR/JPY",
          dataSymbols: [{ symbol: "EUR/JPY", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    const input = inputs[0];

    expect(input?.scannerCoverage?.status).toBe("live_only");
    expect(input?.playbookCheck.executionAllowed).toBe(false);
    expect(input?.playbookCheck.reasons[0]).toContain("not audited");
  });

  it("keeps proxy-fed markets in restricted mode even when the proxy data itself is fresh", async () => {
    getCandlesMock.mockImplementation(async (symbol: string, timeframe: { interval: string }) => {
      if (symbol === "SPX") {
        throw new Error("SPX unavailable on current provider plan");
      }

      if (symbol === "SPY") {
        return buildTrendCandles(510 + (timeframe.interval === "5min" ? 1 : 0));
      }

      return buildTrendCandles(100 + (timeframe.interval === "5min" ? 1 : 0));
    });

    const [input] = await buildTradingLightScannerInputs({
      asOf: "2026-03-10T14:00:00.000Z",
      forceRefresh: true,
      instruments: [
        {
          instrument: "US500",
          dataSymbol: "SPX",
          dataSymbols: [
            { symbol: "SPX", relation: "direct" },
            { symbol: "SPY", relation: "proxy" },
          ],
          marketType: "equities",
          sessionProfile: "ny_equities",
          provider: "twelvedata",
          focusGroup: "equities",
        },
      ],
    });

    expect(input?.playbookCheck.executionAllowed).toBe(false);
    expect(input?.playbookCheck.reasons.join(" ")).toContain("proxy market data");
    expect(input?.executionPlan.executionStatus.executionStatus).toBe("restricted");
    expect(getCandlesMock.mock.calls.map(([symbol]) => symbol)).toEqual(["SPX", "SPY"]);
  });

  it("keeps US index pre-market in observation mode before 07:00 ET even with provider data", async () => {
    const [input] = await buildTradingLightScannerInputs({
      asOf: "2026-03-10T10:30:00.000Z",
      forceRefresh: true,
      instruments: [
        {
          instrument: "US500",
          dataSymbol: "SPX",
          dataSymbols: [{ symbol: "SPX", relation: "direct" }],
          marketType: "equities",
          sessionProfile: "ny_equities",
          provider: "twelvedata",
          focusGroup: "equities",
        },
      ],
    });

    expect(input?.market.session.session).toBe("pre_market");
    expect(input?.playbookCheck.executionAllowed).toBe(false);
    expect(input?.playbookCheck.hardBlock).toBe(true);
    expect(input?.playbookCheck.reasons.join(" ")).toContain("before 07:00 ET");
    expect(input?.executionPlan.executionStatus.executionStatus).toBe("restricted");
    expect(getCandlesMock.mock.calls[0]?.[3]).toMatchObject({ extendedHours: true });
  });

  it("summarizes scanner freshness and source mix for observability", async () => {
    setTradingLightScannerFallbackCatalogForTests({
      generatedAt: "2026-03-31T16:00:00.000Z",
      instruments: {},
    });
    delete process.env.TWELVEDATA_API_KEY;

    const diagnostics = await inspectTradingLightScanner({
      asOf: "2026-03-31T16:30:00.000Z",
      liveFetch: false,
      instruments: [
        {
          instrument: "EURUSD",
          dataSymbol: "EUR/USD",
          dataSymbols: [{ symbol: "EUR/USD", relation: "direct" }],
          marketType: "forex",
          sessionProfile: "forex",
          provider: "twelvedata",
          focusGroup: "forex",
        },
      ],
    });

    const summary = summarizeTradingLightScannerDiagnostics(diagnostics);

    expect(summary.instrumentCount).toBe(1);
    expect(summary.sourceCounts.empty).toBe(1);
    expect(summary.coverageCounts.coverage_backed).toBe(1);
    expect(summary.actionableSnapshotCount).toBe(0);
    expect(summary.staleOpenMarketCount).toBe(1);
  });
});

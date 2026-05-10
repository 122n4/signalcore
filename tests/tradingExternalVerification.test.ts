import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractInvestingPriceFromHtml,
  extractTradingViewPriceFromHtml,
  resolveTradingExternalVerificationSummary,
  verifyTradingInstrumentExternally,
  type TradingExternalVerificationCheck,
} from "@/lib/trading/verification/externalVerification";

const { buildTradingLightScannerInputsMock, tdQuoteNormalizedMock, finnhubQuoteMock } =
  vi.hoisted(() => ({
    buildTradingLightScannerInputsMock: vi.fn(),
    tdQuoteNormalizedMock: vi.fn(),
    finnhubQuoteMock: vi.fn(),
  }));

vi.mock("@/lib/trading/lightScanner", () => ({
  TRADING_LIGHT_SCANNER_INSTRUMENTS: [
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
  buildTradingLightScannerInputs: buildTradingLightScannerInputsMock,
}));

vi.mock("@/lib/market/providers/twelvedata", () => ({
  tdQuoteNormalized: tdQuoteNormalizedMock,
}));

vi.mock("@/lib/market/providers/finnhub", () => ({
  finnhubQuote: finnhubQuoteMock,
}));

describe("trading external verification", () => {
  afterEach(() => {
    buildTradingLightScannerInputsMock.mockReset();
    tdQuoteNormalizedMock.mockReset();
    finnhubQuoteMock.mockReset();
    vi.restoreAllMocks();
  });

  it("extracts Investing.com price from public html", () => {
    expect(
      extractInvestingPriceFromHtml(
        '<div data-test="instrument-price-last">1.1592</div><span>rest</span>',
      ),
    ).toBe(1.1592);
  });

  it("extracts TradingView price from public html", () => {
    expect(
      extractTradingViewPriceFromHtml(
        '{"trade":{"price":1.16035},"daily_bar":{"close":"1.16035"}}',
      ),
    ).toBe(1.16035);
  });

  it("resolves confirmed status when at least one external check matches", () => {
    const checks: TradingExternalVerificationCheck[] = [
      {
        source: "Twelve Data",
        kind: "provider",
        price: 1.16,
        fetchedAt: "2026-03-25T10:00:00.000Z",
        deltaAbs: 0.0001,
        deltaBps: 0.86,
        matchesInternal: true,
      },
      {
        source: "Investing.com",
        kind: "site",
        price: 1.162,
        fetchedAt: "2026-03-25T10:00:00.000Z",
        deltaAbs: 0.002,
        deltaBps: 17.24,
        matchesInternal: false,
      },
    ];

    const summary = resolveTradingExternalVerificationSummary(checks);

    expect(summary.status).toBe("confirmed");
    expect(summary.summary).toContain("Twelve Data");
    expect(summary.matchedChecks).toHaveLength(1);
    expect(summary.availableChecks).toHaveLength(2);
  });

  it("keeps site-only matches in caution mode", () => {
    const checks: TradingExternalVerificationCheck[] = [
      {
        source: "TradingView",
        kind: "site",
        price: 1.16,
        fetchedAt: "2026-03-25T10:00:00.000Z",
        deltaAbs: 0.0001,
        deltaBps: 0.86,
        matchesInternal: true,
      },
    ];

    const summary = resolveTradingExternalVerificationSummary(checks);

    expect(summary.status).toBe("caution");
    expect(summary.summary).toContain("soft cross-check");
  });

  it("verifies an instrument against provider and public site references", async () => {
    buildTradingLightScannerInputsMock.mockResolvedValue([
      {
        snapshot: {
          snapshotAt: "2026-03-25T10:00:00.000Z",
          timeframes: {
            "5m": [{ close: 1.1597 }],
          },
        },
      },
    ]);
    tdQuoteNormalizedMock.mockResolvedValue({
      price: 1.1598,
      timestamp: Date.parse("2026-03-25T10:00:20.000Z"),
    });
    finnhubQuoteMock.mockRejectedValue(new Error("Finnhub quote: unsupported kind"));

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.includes("investing.com")) {
          return new Response(
            '<div data-test="instrument-price-last">1.1597</div>',
            { status: 200 },
          );
        }

        if (url.includes("tradingview.com")) {
          return new Response('{"trade":{"price":1.1599}}', { status: 200 });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      });

    const result = await verifyTradingInstrumentExternally("EURUSD");

    expect(result.status).toBe("confirmed");
    expect(result.instrument).toBe("EURUSD");
    expect(result.internalPrice).toBe(1.1597);
    expect(result.checks.some((check) => check.source === "Investing.com")).toBe(true);
    expect(result.checks.some((check) => check.source === "TradingView")).toBe(true);
    expect(result.checks.some((check) => check.matchesInternal === true)).toBe(true);

    fetchMock.mockRestore();
  });
});

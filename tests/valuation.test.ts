import { describe, expect, it } from "vitest";
import { computeFocusQuoteCoverage, computePortfolioValuation, computeQuoteCoverage } from "@/lib/signalcore/valuation";

describe("valuation coverage helpers", () => {
  it("computes quote coverage from the tracked investing universe independently of holdings", () => {
    const coverage = computeQuoteCoverage({
      symbols: ["AAPL", "MSFT", "NVDA"],
      quotes: {
        AAPL: { price: 210, ts: Math.floor(Date.now() / 1000), source: "finnhub" },
        MSFT: { price: 420, ts: Math.floor(Date.now() / 1000), source: "finnhub" },
      },
    });

    expect(coverage.coveragePct).toBe(67);
    expect(coverage.quotedCount).toBe(2);
    expect(coverage.missingSymbols).toEqual(["NVDA"]);
  });

  it("prioritizes the focus instrument for live coverage", () => {
    const coverage = computeFocusQuoteCoverage({
      focusInstrument: "AAPL",
      symbols: ["AAPL", "MSFT", "NVDA"],
      quotes: {
        AAPL: { price: 210, ts: Math.floor(Date.now() / 1000), source: "finnhub" },
      },
    });

    expect(coverage.scope).toBe("focus_instrument");
    expect(coverage.coveragePct).toBe(100);
    expect(coverage.quotedCount).toBe(1);
    expect(coverage.missingSymbols).toEqual([]);
  });

  it("falls back to tracked-universe coverage when no focus instrument is set", () => {
    const coverage = computeFocusQuoteCoverage({
      focusInstrument: null,
      symbols: ["AAPL", "MSFT", "NVDA"],
      quotes: {
        AAPL: { price: 210, ts: Math.floor(Date.now() / 1000), source: "finnhub" },
        MSFT: { price: 420, ts: Math.floor(Date.now() / 1000), source: "finnhub" },
      },
    });

    expect(coverage.scope).toBe("tracked_universe");
    expect(coverage.coveragePct).toBe(67);
    expect(coverage.missingSymbols).toEqual(["NVDA"]);
  });

  it("does not count candle fallback pricing as live market coverage", () => {
    const valuation = computePortfolioValuation({
      cashEur: 0,
      items: [{ symbol: "AAPL", qty: 2 }],
      quotes: {
        AAPL: {
          price: 210,
          ts: Math.floor(Date.now() / 1000),
          source: "market-client-candle-fallback",
        },
      },
    });

    expect(valuation.coveragePct).toBe(100);
    expect(valuation.liveCoveragePct).toBe(0);
    expect(valuation.missingLiveSymbols).toEqual(["AAPL"]);
    expect(valuation.totalHoldingsEur).toBe(420);
  });
});

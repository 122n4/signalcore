import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingTab from "@/app/app/tabs/TradingTab";
import {
  composeTradingWatchlist,
  composeTradingWatchlistSections,
  resolveTradingWatchlistFocus,
} from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

const { useDailyBundleMock } = vi.hoisted(() => ({
  useDailyBundleMock: vi.fn(),
}));

vi.mock("@/lib/signalcore/useDailyBundle", () => ({
  useDailyBundle: useDailyBundleMock,
}));

function createTradingSupport() {
  const eurusd = createTradingLiveDecisionInput();
  eurusd.snapshot.instrument = "EURUSD";
  eurusd.market.instrument = "EURUSD";
  eurusd.decisionCore.decision.currentState = "TRADE_VALID";

  const btcusd = createTradingLiveDecisionInput();
  btcusd.snapshot.instrument = "BTCUSD";
  btcusd.market.instrument = "BTCUSD";
  btcusd.decisionCore.decision.currentState = "WAIT";

  const watchlist = composeTradingWatchlist([eurusd, btcusd]);
  const watchlistFocus = resolveTradingWatchlistFocus(watchlist);
  return {
    watchlist,
    watchlistFocus,
    watchlistSections: composeTradingWatchlistSections(watchlist, watchlistFocus),
  };
}

describe("TradingTab", () => {
  it("renders the trading watchlist and detail surface from the envelope", () => {
    const trading = createTradingSupport();

    useDailyBundleMock.mockReturnValue({
      status: "ready",
      error: null,
      daily: {
        support: { trading },
      },
      refresh: vi.fn(),
    });

    const html = renderToStaticMarkup(<TradingTab mode="trading" />);

    expect(html).toContain("Market radar");
    expect(html).toContain("Choose the market before opening the plan.");
    expect(html).toContain("Syntrake pick");
    expect(html).toContain("Open trade plan");
    expect(html).toContain("Signal pulse");
    expect(html).toContain("EURUSD");
    expect(html).toContain("BTCUSD");
    expect(html).toContain("Setup aligned");
    expect(html).not.toContain("What to do now");
    expect(html).not.toContain("Advanced desk");
    expect(html).not.toContain("Trading discovery");
    expect(html).not.toContain("undefined");
  });

  it("degrades cleanly when trading data is missing from the envelope", () => {
    useDailyBundleMock.mockReturnValue({
      status: "ready",
      error: null,
      daily: {},
      refresh: vi.fn(),
    });

    const html = renderToStaticMarkup(<TradingTab mode="trading" />);

    expect(html).toContain("Radar is quiet in this snapshot");
  });
});

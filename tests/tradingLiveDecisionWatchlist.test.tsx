import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingLiveDecisionSelectionSurface, {
  resolveSelectedTradingWatchlistEntry,
} from "@/components/daily/TradingLiveDecisionSelectionSurface";
import TradingLiveDecisionWatchlist from "@/components/daily/TradingLiveDecisionWatchlist";
import {
  composeTradingWatchlistEntry,
  composeTradingWatchlistSections,
  type TradingLiveDecision,
  type TradingWatchlistEntry,
} from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

function makeEntry(
  instrument: string,
  state: TradingLiveDecision["currentState"],
  overrides: Partial<TradingLiveDecision> = {},
): TradingWatchlistEntry {
  const input = createTradingLiveDecisionInput({
    marketOverrides: {
      instrument,
      ...(state === "MARKET_CLOSED"
        ? {
            session: {
              marketOpen: false,
              session: "market_closed" as const,
              confidence: 92,
            },
          }
        : {}),
    },
    decisionCoreOverrides: {
      decision: {
        currentState: state,
        primaryMessage: `${instrument} primary`,
        secondaryMessage: `${instrument} secondary`,
        confidence: 82,
        reasons: ["Setup aligned"],
      },
    },
  });

  input.snapshot.instrument = instrument;
  input.market.instrument = instrument;
  input.decisionCore.decision.currentState = state;

  const entry = composeTradingWatchlistEntry(input);

  return {
    ...entry,
    currentState: overrides.currentState ?? entry.currentState,
    currentHeadline: overrides.currentHeadline ?? entry.currentHeadline,
    executionStatus: overrides.executionStatus ?? entry.executionStatus,
    liveDecision: {
      ...entry.liveDecision,
      ...overrides,
    },
  };
}

describe("trading live decision watchlist", () => {
  it("renders the watchlist and shows engine states per asset", () => {
    const entries: TradingWatchlistEntry[] = [
      makeEntry("EURUSD", "TRADE_VALID"),
      makeEntry("BTCUSD", "SETUP_FORMING"),
      makeEntry("NVDA", "WAIT"),
      makeEntry("TSLA", "BLOCKED"),
      makeEntry("AAPL", "TOO_LATE"),
      makeEntry("MSFT", "MARKET_CLOSED"),
    ];
    const sections = composeTradingWatchlistSections(entries);

    const html = renderToStaticMarkup(
      <TradingLiveDecisionWatchlist
        sections={sections}
        selectedInstrument="EURUSD"
        onSelectInstrument={() => undefined}
      />,
    );

    expect(html).toContain("Market Radar");
    expect(html).toContain("EURUSD");
    expect(html).toContain("BTCUSD");
    expect(html).toContain("TRADE_VALID");
    expect(html).toContain("SETUP_FORMING");
    expect(html).toContain("WAIT");
    expect(html).toContain("BLOCKED");
    expect(html).toContain("TOO_LATE");
    expect(html).toContain("MARKET_CLOSED");
    expect(html).toContain("New York open");
    expect(html).toContain("Selected");
    expect(html).toContain("Session focus");
  });

  it("opens the correct detail surface for the selected instrument", () => {
    const entries: TradingWatchlistEntry[] = [
      makeEntry("EURUSD", "TRADE_VALID", {
        currentBody: "EURUSD selected body",
      }),
      makeEntry("BTCUSD", "WAIT", {
        currentHeadline: "Custom BTC headline",
        currentBody: "BTCUSD selected body",
      }),
    ];
    const sections = composeTradingWatchlistSections(entries);

    const selected = resolveSelectedTradingWatchlistEntry(sections, "BTCUSD");
    expect(selected?.instrument).toBe("BTCUSD");

    const html = renderToStaticMarkup(
      <TradingLiveDecisionSelectionSurface
        sections={sections}
        selectedInstrument="BTCUSD"
        onSelectInstrument={() => undefined}
      />,
    );

    expect(html).toContain("Custom BTC headline");
    expect(html).toContain("BTCUSD selected body");
    expect(html).toContain("New York open");
    expect(html).toContain("Selected Instrument");
    expect(html).toContain("From Forming");
    expect(html).toContain("data-selected=\"true\"");
  });

  it("renders engine-provided watchlist copy without local decision logic", () => {
    const entries: TradingWatchlistEntry[] = [
      makeEntry("SOLUSD", "WAIT", {
        currentHeadline: "Engine headline only",
        executionStatus: "caution",
      }),
    ];
    const sections = composeTradingWatchlistSections(entries);

    const html = renderToStaticMarkup(
      <TradingLiveDecisionWatchlist
        sections={sections}
        selectedInstrument="SOLUSD"
        onSelectInstrument={() => undefined}
      />,
    );

    expect(html).toContain("Engine headline only");
    expect(html).toContain("caution");
    expect(html).toContain("Breakout continuation building during new york open");
  });

  it("renders the watchlist in envelope order without local resorting", () => {
    const entries: TradingWatchlistEntry[] = [
      makeEntry("WAITUSD", "WAIT"),
      makeEntry("VALIDUSD", "TRADE_VALID"),
    ];
    const sections = composeTradingWatchlistSections(entries);

    const html = renderToStaticMarkup(
      <TradingLiveDecisionWatchlist
        sections={sections}
        selectedInstrument="WAITUSD"
        onSelectInstrument={() => undefined}
      />,
    );

    expect(html.indexOf("Look first")).toBeLessThan(html.indexOf("Forming"));
    expect(html.indexOf("VALIDUSD")).toBeLessThan(html.indexOf("WAITUSD"));
    expect(html).toContain("Look first");
    expect(html).toContain("Forming");
    expect(html).toContain("1 open");
  });

  it("degrades cleanly when the watchlist is empty", () => {
    const html = renderToStaticMarkup(
      <TradingLiveDecisionSelectionSurface
        sections={[]}
        selectedInstrument={null}
        onSelectInstrument={() => undefined}
      />,
    );

    expect(html).toContain("No trading instruments available in this snapshot.");
    expect(html).toContain("Trading live snapshot unavailable.");
  });
});

import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingQuickReadPanel from "@/components/daily/TradingQuickReadPanel";
import { composeTradingWatchlistEntry } from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

describe("TradingQuickReadPanel", () => {
  it("renders the quick context directly from the selected workspace", () => {
    const input = createTradingLiveDecisionInput({
      marketOverrides: {
        instrument: "EURUSD",
        structure: {
          state: "uptrend",
          direction: "long",
          score: 78,
          confidence: 82,
        },
        regime: {
          state: "trending",
          score: 74,
          confidence: 76,
        },
        volatility: {
          state: "expansion",
          score: 68,
          confidence: 71,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 81,
          conflictScore: 12,
          alignment: 84,
        },
        bias: {
          direction: "bearish",
          score: 72,
          confidence: 75,
        },
        environment: {
          state: "favorable",
          score: 77,
          confidence: 79,
        },
      },
    });

    input.snapshot.instrument = "EURUSD";
    input.market.instrument = "EURUSD";

    const entry = composeTradingWatchlistEntry(input);
    const html = renderToStaticMarkup(<TradingQuickReadPanel entry={entry} />);

    expect(html).toContain("Quick Read");
    expect(html).toContain("Fast context for EURUSD");
    expect(html).toContain("uptrend");
    expect(html).toContain("trending");
    expect(html).toContain("expansion");
    expect(html).toContain("breakout_continuation");
    expect(html).toContain("high");
    expect(html).toContain("bearish");
    expect(html).toContain("favorable");
  });

  it("degrades cleanly when no instrument is selected", () => {
    const html = renderToStaticMarkup(<TradingQuickReadPanel entry={null} />);

    expect(html).toContain("Quick Read");
    expect(html).toContain("No active instrument selected for quick context.");
  });
});

import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingWatchlistFocusHeader from "@/components/daily/TradingWatchlistFocusHeader";

describe("TradingWatchlistFocusHeader", () => {
  it("renders the operational focus straight from the envelope contract", () => {
    const html = renderToStaticMarkup(
      <TradingWatchlistFocusHeader
        focus={{
          anchorInstrument: "EURUSD",
          sessionLabel: "London / NY overlap",
          marketOpen: true,
          contextLabel: "Liquidity sweep during london / ny overlap",
          priorityReason: "Liquidity sweep reversal building",
        }}
      />,
    );

    expect(html).toContain("Current Session Focus");
    expect(html).toContain("London / NY overlap");
    expect(html).toContain("Market open");
    expect(html).toContain("EURUSD");
    expect(html).toContain("Liquidity sweep during london / ny overlap");
    expect(html).toContain("Liquidity sweep reversal building");
  });

  it("degrades cleanly when the envelope has no watchlist focus", () => {
    const html = renderToStaticMarkup(<TradingWatchlistFocusHeader focus={null} />);

    expect(html).toContain("Current Session Focus");
    expect(html).toContain("No operational focus is attached to this trading snapshot.");
  });
});

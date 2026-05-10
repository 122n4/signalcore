import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingDiscoveryValueRail from "@/components/trading/TradingDiscoveryValueRail";

describe("TradingDiscoveryValueRail", () => {
  it("renders premium discovery context for the desk", () => {
    const html = renderToStaticMarkup(
      <TradingDiscoveryValueRail
        surface="desk"
        instrumentCount={3}
        marketOpenCount={2}
        discoveryInstrumentLimit={3}
        visibleHistoryDays={7}
        weeklyOpportunityBudget={3}
      />,
    );

    expect(html).toContain("Trading discovery");
    expect(html).toContain("Discovery keeps the trading desk live before Pro.");
    expect(html).toContain("2/3");
    expect(html).toContain("Top 3");
    expect(html).toContain("7 days");
    expect(html).toContain("3 ideas");
  });

  it("changes the narrative for the opportunities surface", () => {
    const html = renderToStaticMarkup(
      <TradingDiscoveryValueRail
        surface="opportunities"
        instrumentCount={4}
        marketOpenCount={1}
        discoveryInstrumentLimit={4}
        visibleHistoryDays={14}
        weeklyOpportunityBudget={5}
      />,
    );

    expect(html).toContain("Discovery shows live flow first, not fake opportunity spam.");
    expect(html).toContain("WAIT belongs in monitoring layers");
    expect(html).toContain("5 ideas");
  });
});

import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingWhySummaryPanel from "@/components/daily/TradingWhySummaryPanel";
import { composeTradingWatchlistEntry } from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

describe("TradingWhySummaryPanel", () => {
  it("renders why now and why not now directly from the workspace snapshot", () => {
    const input = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "WAIT",
          primaryMessage: "Wait.",
          secondaryMessage: "Conditions not ready yet.",
          confidence: 62,
          reasons: ["Low clarity and mixed context"],
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "none",
          direction: "neutral",
          triggerLevel: null,
          invalidationLevel: null,
          confidence: 18,
        },
        maturity: {
          state: "invalid",
          score: 18,
          confidence: 28,
        },
        opportunityWindow: {
          state: "closed",
          score: 16,
          confidence: 24,
        },
      },
    });

    input.snapshot.instrument = "BTCUSD";
    input.market.instrument = "BTCUSD";

    const entry = composeTradingWatchlistEntry(input);
    const html = renderToStaticMarkup(<TradingWhySummaryPanel entry={entry} />);

    expect(html).toContain("Why Now / Why Not Now");
    expect(html).toContain("Why now");
    expect(html).toContain("Why not now");
    expect(html).toContain(
      "This snapshot is still building the explanation layer for the selected market.",
    );
    expect(html).toContain(entry.workspace.whySummary.whyNotNow ?? "");
  });

  it("degrades cleanly when no instrument is selected", () => {
    const html = renderToStaticMarkup(<TradingWhySummaryPanel entry={null} />);

    expect(html).toContain("Why Now / Why Not Now");
    expect(html).toContain(
      "Pick a market from the desk and Syntrake will explain why the timing is clean or why it still needs patience.",
    );
  });
});

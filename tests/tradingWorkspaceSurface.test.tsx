import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingWorkspaceSurface from "@/components/daily/TradingWorkspaceSurface";
import {
  composeTradingWatchlistEntry,
  composeTradingWatchlistSections,
  type TradingLiveDecision,
} from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

function makeEntry(
  instrument: string,
  state: TradingLiveDecision["currentState"],
) {
  const input = createTradingLiveDecisionInput({
    marketOverrides: {
      instrument,
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
        confidence: 70,
      },
      momentum: {
        state: "accelerating",
        direction: "long",
        score: 72,
        confidence: 74,
      },
      liquidity: {
        state: "healthy_participation",
        score: 66,
        confidence: 69,
      },
      session: {
        marketOpen: true,
        session: "ny_open",
        confidence: 90,
      },
    },
    setupCoreOverrides: {
      setup: {
        type: "breakout_continuation",
        direction: "short",
        triggerLevel: 1.082,
        invalidationLevel: 1.085,
        confidence: 84,
      },
      maturity: {
        state: state === "WAIT" ? "developing" : "ready",
        score: state === "WAIT" ? 62 : 78,
        confidence: state === "WAIT" ? 64 : 80,
      },
      opportunityWindow: {
        state: state === "WAIT" ? "opening" : "active",
        score: state === "WAIT" ? 60 : 82,
        confidence: state === "WAIT" ? 62 : 84,
      },
      quality: {
        score: 82,
        grade: "A",
        confidence: 84,
      },
    },
    decisionCoreOverrides: {
      decision: {
        currentState: state,
        primaryMessage: `${instrument} primary`,
        secondaryMessage: `${instrument} secondary`,
        confidence: 82,
        reasons: ["Setup aligned", "Environment favorable"],
      },
      clarity: {
        level: "high",
        score: 81,
        conflictScore: 12,
        alignment: 84,
      },
      bias: {
        direction: "bearish",
        score: 73,
        confidence: 76,
      },
      environment: {
        state: "favorable",
        score: 77,
        confidence: 79,
      },
      weighting: {
        contextProfile: "trending:expansion:ny_open",
        weightedScores: {
          structure: 78,
          momentum: 72,
          liquidity: 66,
          setup: 82,
          maturity: 78,
          opportunityWindow: 82,
          quality: 82,
          clarity: 81,
          bias: 73,
          environment: 77,
          conflictPenalty: 12,
          confluenceBonus: 8,
        },
        confidence: 81,
      },
    },
  });

  input.snapshot.instrument = instrument;
  input.market.instrument = instrument;
  input.decisionCore.decision.currentState = state;

  return composeTradingWatchlistEntry(input);
}

describe("TradingWorkspaceSurface", () => {
  const entries = [makeEntry("EURUSD", "TRADE_VALID"), makeEntry("BTCUSD", "WAIT")];
  const sections = composeTradingWatchlistSections(entries);
  const watchlistFocus = {
    anchorInstrument: "EURUSD",
    sessionLabel: "New York open",
    marketOpen: true,
    contextLabel: "Breakout continuation aligned during new york open",
    priorityReason: "Setup aligned",
  };

  it("renders the live decision section as the primary trading experience", () => {
    const html = renderToStaticMarkup(
      <TradingWorkspaceSurface
        sections={sections}
        watchlistFocus={watchlistFocus}
        selectedInstrument="EURUSD"
        activeSection="live-decision"
        onSelectInstrument={() => undefined}
        onSelectSection={() => undefined}
      />,
    );

    expect(html).toContain("Live Decision");
    expect(html).toContain("Market Radar");
    expect(html).toContain("WHAT TO DO NOW");
    expect(html).toContain("Current Session Focus");
    expect(html).toContain("Breakout continuation aligned during new york open");
    expect(html).toContain("Quick Read");
    expect(html).toContain("uptrend");
    expect(html).toContain("trending");
    expect(html).toContain("breakout_continuation");
    expect(html).toContain("high");
    expect(html).toContain("bearish");
    expect(html).toContain("favorable");
    expect(html).toContain("Why Now / Why Not Now");
    expect(html).toContain("Why now");
    expect(html).toContain("Setup aligned");
    expect(html).toContain("Selected Instrument");
    expect(html).toContain("From Look first");
  });

  it("renders the playbook section from envelope-attached playbook and execution blocks", () => {
    const html = renderToStaticMarkup(
      <TradingWorkspaceSurface
        sections={sections}
        watchlistFocus={watchlistFocus}
        selectedInstrument="EURUSD"
        activeSection="playbook"
        onSelectInstrument={() => undefined}
        onSelectSection={() => undefined}
      />,
    );

    expect(html).toContain("Core Trading Playbook");
    expect(html).toContain("Risk per trade");
    expect(html).toContain("Allowed setups");
    expect(html).toContain("Operational Gate");
  });

  it("renders the context section from real workspace fields without placeholders", () => {
    const html = renderToStaticMarkup(
      <TradingWorkspaceSurface
        sections={sections}
        watchlistFocus={watchlistFocus}
        selectedInstrument="BTCUSD"
        activeSection="context"
        onSelectInstrument={() => undefined}
        onSelectSection={() => undefined}
      />,
    );

    expect(html).toContain("Context");
    expect(html).toContain("Operational Context");
    expect(html).toContain("New York open");
    expect(html).toContain("uptrend");
    expect(html).toContain("trending");
    expect(html).toContain("healthy_participation");
    expect(html).toContain("accelerating");
    expect(html).not.toContain("Unavailable in current envelope");
  });

  it("renders the performance section from the workspace session summary and feed", () => {
    const html = renderToStaticMarkup(
      <TradingWorkspaceSurface
        sections={sections}
        watchlistFocus={watchlistFocus}
        selectedInstrument="EURUSD"
        activeSection="performance"
        onSelectInstrument={() => undefined}
        onSelectSection={() => undefined}
      />,
    );

    expect(html).toContain("Performance");
    expect(html).toContain("Session ID");
    expect(html).toContain("State Counts");
    expect(html).toContain("Session Timeline");
  });
});

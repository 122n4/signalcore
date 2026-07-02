import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingLiveDecisionDetailSurface from "@/components/daily/TradingLiveDecisionDetailSurface";
import type {
  TradingChartSnapshot,
  TradingFeedEvent,
  TradingLiveDecision,
  TradingWhySummary,
} from "@/lib/trading/state";

import { buildSequenceCandles, createTradingSnapshot } from "./helpers/tradingMarketFixtures";
import { composeTradingChartSnapshot } from "@/lib/trading/state";

function makeFeedEvent(overrides: Partial<TradingFeedEvent> = {}): TradingFeedEvent {
  return {
    id: "evt_1",
    timestamp: "2026-03-10T14:00:00.000Z",
    state: "TRADE_VALID",
    headline: "Trade valid",
    body: "Short EURUSD below 1.0820",
    clarityScore: 76,
    pressureState: null,
    momentumState: "accelerating",
    setupMaturity: 82,
    triggerLevel: 1.082,
    invalidationLevel: 1.085,
    ...overrides,
  };
}

function makeLiveDecision(
  overrides: Partial<TradingLiveDecision> = {},
): TradingLiveDecision {
  return {
    currentState: "TRADE_VALID",
    currentHeadline: "Trade valid",
    currentBody: "Short EURUSD below 1.0820",
    instrument: "EURUSD",
    direction: "short",
    triggerLevel: 1.082,
    entryZoneLow: 1.082,
    entryZoneHigh: 1.0824,
    invalidationLevel: 1.085,
    targetZone: "1.0780 - 1.0765",
    riskPct: 0.5,
    executionStatus: "allowed",
    reasons: ["Decision, playbook, and behavior are aligned for execution."],
    nextDisciplineStep: null,
    feed: [makeFeedEvent()],
    ...overrides,
  };
}

function makeWhySummary(
  overrides: Partial<TradingWhySummary> = {},
): TradingWhySummary {
  return {
    whyNow: "Setup aligned",
    whyNotNow: null,
    ...overrides,
  };
}

function makeChart(): TradingChartSnapshot {
  const snapshot = createTradingSnapshot({
    instrument: "EURUSD",
    marketType: "forex",
    sessionProfile: "forex",
    snapshotAt: "2026-03-10T14:00:00.000Z",
    timeframes: {
      "5m": buildSequenceCandles({
        closes: [1.084, 1.0835, 1.083, 1.0828, 1.0824, 1.0818, 1.0812, 1.0808],
        ranges: [0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001],
        stepMinutes: 5,
      }),
    },
  });

  return composeTradingChartSnapshot(snapshot);
}

describe("trading live decision detail surface", () => {
  it("renders the current state block from TradingLiveDecision", () => {
    const html = renderToStaticMarkup(
      <TradingLiveDecisionDetailSurface
        liveDecision={makeLiveDecision()}
        chart={makeChart()}
        whySummary={makeWhySummary()}
      />,
    );

    expect(html).toContain("WHAT TO DO NOW");
    expect(html).toContain("TRADE_VALID");
    expect(html).toContain("Trade valid");
    expect(html).toContain("allowed");
    expect(html).toContain("Why now:");
    expect(html).toContain("Setup aligned");
    expect(html).toContain("Primary Trade Plan");
  });

  it("renders the trade plan, chart markers, and live feed", () => {
    const html = renderToStaticMarkup(
      <TradingLiveDecisionDetailSurface
        liveDecision={makeLiveDecision()}
        chart={makeChart()}
        whySummary={makeWhySummary()}
      />,
    );

    expect(html).toContain("EURUSD");
    expect(html).toContain("short");
    expect(html).toContain("1.0780 - 1.0765");
    expect(html).toContain("Live Feed");
    expect(html).toContain("Short EURUSD below 1.0820");
    expect(html).toContain("Live market chart");
    expect(html).toContain("Trigger");
    expect(html).toContain("Invalidation");
    expect(html).toContain("Risk");
  });

  it("does not recalculate local copy and renders engine-provided strings verbatim", () => {
    const html = renderToStaticMarkup(
      <TradingLiveDecisionDetailSurface
        liveDecision={makeLiveDecision({
          currentState: "WAIT",
          currentHeadline: "Custom engine headline",
          currentBody: "Custom engine body",
          executionStatus: "caution",
          feed: [
            makeFeedEvent({
              headline: "Custom feed headline",
              body: "Custom feed body",
              state: "WAIT",
            }),
          ],
        })}
        chart={makeChart()}
        whySummary={makeWhySummary({
          whyNow: "Custom why now",
          whyNotNow: "Custom why not now",
        })}
      />,
    );

    expect(html).toContain("Custom engine headline");
    expect(html).toContain("Custom engine body");
    expect(html).toContain("Custom feed headline");
    expect(html).toContain("Custom feed body");
    expect(html).toContain("Custom why now");
    expect(html).toContain("Custom why not now");
  });

  it("degrades cleanly when optional fields are missing", () => {
    const html = renderToStaticMarkup(
      <TradingLiveDecisionDetailSurface
        liveDecision={makeLiveDecision({
          triggerLevel: null,
          entryZoneLow: null,
          entryZoneHigh: null,
          invalidationLevel: null,
          targetZone: null,
          riskPct: null,
        })}
        chart={null}
        whySummary={null}
      />,
    );

    expect(html).toContain("No market candles are available for this snapshot yet.");
    expect(html).toContain("Target");
    expect(html).toContain("Risk");
    expect(html).toContain("No explanation attached to this trading snapshot.");
  });

  it("renders a clean fallback when the trading snapshot is missing", () => {
    const html = renderToStaticMarkup(
      <TradingLiveDecisionDetailSurface liveDecision={null} chart={null} />,
    );

    expect(html).toContain("Trading live snapshot unavailable.");
  });
});

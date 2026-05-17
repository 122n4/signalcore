import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import TradingTab from "@/app/app/tabs/TradingTab";
import { composeDecisionEnvelope } from "@/lib/decision/composeDecisionEnvelope";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

const { useDailyBundleMock } = vi.hoisted(() => ({
  useDailyBundleMock: vi.fn(),
}));

vi.mock("@/lib/signalcore/useDailyBundle", () => ({
  useDailyBundle: useDailyBundleMock,
}));

function createTradingEnvelope() {
  const eurusd = createTradingLiveDecisionInput();
  eurusd.snapshot.instrument = "EURUSD";
  eurusd.market.instrument = "EURUSD";
  eurusd.decisionCore.decision.currentState = "TRADE_VALID";

  const btcusd = createTradingLiveDecisionInput();
  btcusd.snapshot.instrument = "BTCUSD";
  btcusd.market.instrument = "BTCUSD";
  btcusd.decisionCore.decision.currentState = "WAIT";

  return composeDecisionEnvelope({
    mode: "investing",
    asOf: "2026-03-10T14:00:00.000Z",
    branch: "success",
    branchReason: null,
    nextBestAction: null,
    whyNow: null,
    operationalAction: null,
    decisionGovernance: null,
    actionGate: null,
    riskPolicyEval: null,
    capitalStatus: null,
    decisionScores: null,
    diagnostics: null,
    engineV4: null,
    tradingWatchlistInputs: [eurusd, btcusd],
  });
}

describe("TradingTab", () => {
  it("renders the trading watchlist and detail surface from the envelope", () => {
    const envelope = createTradingEnvelope();

    useDailyBundleMock.mockReturnValue({
      status: "ready",
      error: null,
      daily: {
        decisionEnvelope: envelope,
      },
      refresh: vi.fn(),
    });

    const html = renderToStaticMarkup(<TradingTab mode="investing" />);

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
      daily: {
        decisionEnvelope: composeDecisionEnvelope({
          mode: "investing",
          asOf: "2026-03-10T14:00:00.000Z",
          branch: "success",
          branchReason: null,
          nextBestAction: null,
          whyNow: null,
          operationalAction: null,
          decisionGovernance: null,
          actionGate: null,
          riskPolicyEval: null,
          capitalStatus: null,
          decisionScores: null,
          diagnostics: null,
          engineV4: null,
        }),
      },
      refresh: vi.fn(),
    });

    const html = renderToStaticMarkup(<TradingTab mode="investing" />);

    expect(html).toContain("Radar is quiet in this snapshot");
  });
});

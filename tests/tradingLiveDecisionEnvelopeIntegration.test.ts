import { describe, expect, it } from "vitest";

import { composeDecisionEnvelope } from "@/lib/decision/composeDecisionEnvelope";
import { buildDailyDecisionPayload } from "@/lib/decision/DailyDecisionService";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

describe("trading live decision envelope integration", () => {
  it("attaches a canonical trading liveDecision block to the envelope support", () => {
    const input = createTradingLiveDecisionInput();
    input.decisionCore.decision.currentState = "TRADE_VALID";

    const envelope = composeDecisionEnvelope({
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
      tradingLiveInput: input,
    });

    expect(envelope.support.trading?.liveDecision).toBeDefined();
    expect(envelope.support.trading?.liveDecision.currentState).toBe("TRADE_VALID");
    expect(envelope.support.trading?.liveDecision.feed.at(-1)?.state).toBe("TRADE_VALID");
    expect(envelope.support.trading?.watchlist).toHaveLength(1);
    expect(envelope.support.trading?.watchlistSections).toHaveLength(1);
    expect(envelope.support.trading?.watchlist[0]?.instrument).toBe(
      envelope.support.trading?.liveDecision.instrument,
    );
    expect(envelope.support.trading?.watchlist[0]?.workspace.market.structure.state).toBe(
      input.market.structure.state,
    );
    expect(envelope.support.trading?.watchlist[0]?.workspace.playbook.definition?.name).toBe(
      "Core Trading Playbook",
    );
    expect(envelope.support.trading?.watchlist[0]?.contextSummary.sessionLabel).toBe(
      "New York open",
    );
    expect(envelope.support.trading?.watchlist[0]?.workspace.contextSummary.marketOpen).toBe(true);
    expect(envelope.support.trading?.watchlist[0]?.contextSummary.coverageLabel).toBe("Live-only");
    expect(envelope.support.trading?.watchlistSections[0]?.title).toBe("Look first");
    expect(envelope.support.trading?.watchlist[0]?.watchlistPlacement).toMatchObject({
      sectionTitle: "Look first",
      isLeadEntry: true,
      isSessionFocus: true,
    });
    expect(envelope.support.trading?.watchlistFocus).toMatchObject({
      anchorInstrument: envelope.support.trading?.watchlist[0]?.instrument,
      sessionLabel: "New York open",
      marketOpen: true,
      coverageLabel: "Live-only",
      sectionTitle: "Look first",
    });
    expect(envelope.support.trading?.marketCoverageSummary).toEqual({
      coverageBackedCount: 0,
      stagedOnlyCount: 0,
      liveOnlyCount: 1,
    });
  });

  it("promotes calibrated market-session playbook blocks into a BLOCKED live trading state", () => {
    const input = createTradingLiveDecisionInput({
      marketOverrides: {
        instrument: "NAS100",
        session: {
          marketOpen: true,
          session: "pre_market",
          confidence: 92,
        },
      },
    });
    input.snapshot.instrument = "NAS100";
    input.market.instrument = "NAS100";
    input.decisionCore.decision.currentState = "TRADE_VALID";
    input.playbookCheck = {
      sessionActive: true,
      rulesAligned: false,
      executionAllowed: false,
      reasons: ["NAS100 is blocked during pre-market in the current playbook calibration."],
      nextDisciplineStep: "Stand down until the active session matches the playbook.",
    };
    input.executionPlan.executionStatus.executionStatus = "restricted";
    input.executionPlan.executionStatus.reasons = input.playbookCheck.reasons;

    const envelope = composeDecisionEnvelope({
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
      tradingLiveInput: input,
    });

    expect(envelope.support.trading?.liveDecision.currentState).toBe("BLOCKED");
    expect(envelope.support.trading?.liveDecision.executionStatus).toBe("restricted");
    expect(envelope.support.trading?.liveDecision.reasons).toContain(
      "NAS100 is blocked during pre-market in the current playbook calibration.",
    );
  });

  it("passes the trading liveDecision through DailyDecisionService without affecting investing", () => {
    const tradingLiveInput = createTradingLiveDecisionInput();
    tradingLiveInput.decisionCore.decision.currentState = "TRADE_VALID";

    const out = buildDailyDecisionPayload({
      response: {
        mode: "investing",
        asOf: "2026-03-10T14:00:00.000Z",
        daily: {},
      },
      branch: "success",
      branchReason: null,
      tradingLiveInput,
    });

    expect(out.decisionEnvelope.mode).toBe("investing");
    expect(out.decisionEnvelope.support.trading?.liveDecision).toBeDefined();
    expect(out.response.daily.decisionEnvelope.support.trading?.liveDecision).toEqual(
      out.decisionEnvelope.support.trading?.liveDecision,
    );
  });

  it("can expose a simple watchlist from multiple trading snapshots without changing investing", () => {
    const eurusd = createTradingLiveDecisionInput();
    eurusd.snapshot.instrument = "EURUSD";
    eurusd.market.instrument = "EURUSD";
    eurusd.decisionCore.decision.currentState = "TRADE_VALID";

    const btcusd = createTradingLiveDecisionInput();
    btcusd.snapshot.instrument = "BTCUSD";
    btcusd.market.instrument = "BTCUSD";
    btcusd.decisionCore.decision.currentState = "WAIT";

    const envelope = composeDecisionEnvelope({
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

    expect(envelope.mode).toBe("investing");
    expect(envelope.support.trading?.watchlist.map((entry) => entry.instrument)).toEqual([
      "EURUSD",
      "BTCUSD",
    ]);
    expect(envelope.support.trading?.watchlist[1]?.currentState).toBe("WAIT");
    expect(envelope.support.trading?.watchlist[1]?.contextSummary.contextLabel).toContain(
      "building during",
    );
    expect(envelope.support.trading?.liveDecision.instrument).toBe("EURUSD");
    expect(envelope.support.trading?.watchlist[0]?.workspace.performance.eventCount).toBeGreaterThan(
      0,
    );
    expect(envelope.support.trading?.watchlistSections.map((section) => section.title)).toEqual([
      "Look first",
      "Forming",
    ]);
    expect(envelope.support.trading?.watchlistSections[1]).toMatchObject({
      title: "Forming",
      sessionLabels: ["New York open"],
      marketOpenCount: 1,
    });
    expect(envelope.support.trading?.watchlistFocus).toMatchObject({
      anchorInstrument: "EURUSD",
      sessionLabel: "New York open",
      marketOpen: true,
      sectionTitle: "Look first",
    });
  });

  it("sorts the trading watchlist by state priority before exposing it to the UI", () => {
    const wait = createTradingLiveDecisionInput();
    wait.snapshot.instrument = "WAITUSD";
    wait.market.instrument = "WAITUSD";
    wait.decisionCore.decision.currentState = "WAIT";

    const blocked = createTradingLiveDecisionInput();
    blocked.snapshot.instrument = "BLOCKUSD";
    blocked.market.instrument = "BLOCKUSD";
    blocked.decisionCore.decision.currentState = "TRADE_VALID";
    blocked.executionPlan.executionStatus.executionStatus = "restricted";
    blocked.executionPlan.executionStatus.reasons = ["Outside session rules."];

    const tradeValid = createTradingLiveDecisionInput();
    tradeValid.snapshot.instrument = "VALIDUSD";
    tradeValid.market.instrument = "VALIDUSD";
    tradeValid.decisionCore.decision.currentState = "TRADE_VALID";

    const marketClosed = createTradingLiveDecisionInput();
    marketClosed.snapshot.instrument = "CLOSEDUSD";
    marketClosed.market.instrument = "CLOSEDUSD";
    marketClosed.market.session = {
      marketOpen: false,
      session: "market_closed",
      confidence: 94,
    };
    marketClosed.decisionCore.decision.currentState = "MARKET_CLOSED";

    const envelope = composeDecisionEnvelope({
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
      tradingWatchlistInputs: [wait, marketClosed, blocked, tradeValid],
    });

    expect(envelope.support.trading?.watchlist.map((entry) => entry.instrument)).toEqual([
      "VALIDUSD",
      "WAITUSD",
      "BLOCKUSD",
      "CLOSEDUSD",
    ]);
    expect(
      envelope.support.trading?.watchlistSections.map((section) => ({
        title: section.title,
        instruments: section.entries.map((entry) => entry.instrument),
      })),
    ).toEqual([
      { title: "Look first", instruments: ["VALIDUSD"] },
      { title: "Forming", instruments: ["WAITUSD"] },
      { title: "Closed / Restricted", instruments: ["BLOCKUSD", "CLOSEDUSD"] },
    ]);
    expect(envelope.support.trading?.watchlistFocus).toMatchObject({
      anchorInstrument: "VALIDUSD",
      sessionLabel: "New York open",
      marketOpen: true,
      sectionTitle: "Look first",
    });
  });

  it("promotes strong near-ready setups into Look first when execution is not open yet", () => {
    const nearReady = createTradingLiveDecisionInput({
      setupCoreOverrides: {
        setup: {
          type: "range_reclaim",
          direction: "long",
          triggerLevel: 510.2,
          invalidationLevel: 507.8,
          confidence: 86,
        },
        maturity: {
          state: "developing",
          score: 66,
          confidence: 72,
        },
        opportunityWindow: {
          state: "opening",
          score: 68,
          confidence: 74,
        },
        quality: {
          score: 81,
          grade: "A",
          confidence: 83,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "high",
          score: 74,
          conflictScore: 12,
          alignment: 82,
        },
        environment: {
          state: "favorable",
          score: 76,
          confidence: 79,
        },
        decision: {
          currentState: "WAIT",
          primaryMessage: "Waiting for the trigger to clear.",
          secondaryMessage: "The structure is almost there.",
          confidence: 79,
          reasons: ["Range reclaim is close to valid", "Window opening"],
        },
      },
    });
    nearReady.snapshot.instrument = "NEARUSD";
    nearReady.market.instrument = "NEARUSD";
    nearReady.decisionCore.decision.currentState = "WAIT";

    const neutralWait = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "WAIT",
          primaryMessage: "Wait.",
          secondaryMessage: "Conditions not ready yet.",
          confidence: 61,
          reasons: ["Conditions not ready yet"],
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "none",
          direction: "neutral",
          triggerLevel: null,
          invalidationLevel: null,
          confidence: 28,
        },
        maturity: {
          state: "invalid",
          score: 24,
          confidence: 34,
        },
        opportunityWindow: {
          state: "closed",
          score: 18,
          confidence: 30,
        },
      },
    });
    neutralWait.snapshot.instrument = "WAITUSD";
    neutralWait.market.instrument = "WAITUSD";
    neutralWait.decisionCore.decision.currentState = "WAIT";

    const envelope = composeDecisionEnvelope({
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
      tradingWatchlistInputs: [neutralWait, nearReady],
    });

    expect(envelope.support.trading?.watchlist.map((entry) => entry.instrument)).toEqual([
      "NEARUSD",
      "WAITUSD",
    ]);
    expect(
      envelope.support.trading?.watchlistSections.map((section) => ({
        title: section.title,
        instruments: section.entries.map((entry) => entry.instrument),
      })),
    ).toEqual([
      { title: "Look first", instruments: ["NEARUSD"] },
      { title: "Waiting / Stand aside", instruments: ["WAITUSD"] },
    ]);
    expect(envelope.support.trading?.watchlistFocus).toMatchObject({
      anchorInstrument: "NEARUSD",
      sectionTitle: "Look first",
    });
  });

  it("keeps neutral wait snapshots inside Waiting / Stand aside when the context is not forming", () => {
    const wait = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "WAIT",
          primaryMessage: "Wait.",
          secondaryMessage: "Conditions not ready yet.",
          confidence: 61,
          reasons: ["Conditions not ready yet"],
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "none",
          direction: "neutral",
          triggerLevel: null,
          invalidationLevel: null,
          confidence: 28,
        },
        maturity: {
          state: "invalid",
          score: 24,
          confidence: 34,
        },
        opportunityWindow: {
          state: "closed",
          score: 18,
          confidence: 30,
        },
      },
    });

    wait.snapshot.instrument = "IDLEUSD";
    wait.market.instrument = "IDLEUSD";

    const envelope = composeDecisionEnvelope({
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
      tradingWatchlistInputs: [wait],
    });

    expect(envelope.support.trading?.watchlist[0]?.contextSummary.contextLabel).toBe(
      "No canonical setup during new york open",
    );
    expect(envelope.support.trading?.watchlistSections).toHaveLength(1);
    expect(envelope.support.trading?.watchlistSections[0]).toMatchObject({
      title: "Waiting / Stand aside",
      sessionLabels: ["New York open"],
      marketOpenCount: 1,
    });
    expect(envelope.support.trading?.watchlistFocus).toMatchObject({
      anchorInstrument: "IDLEUSD",
      sessionLabel: "New York open",
      marketOpen: true,
      sectionTitle: "Waiting / Stand aside",
    });
  });
});

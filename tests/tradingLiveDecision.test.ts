import { describe, expect, it } from "vitest";

import { composeTradingLiveDecision } from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

describe("trading live decision", () => {
  it("builds a market-closed live decision snapshot", () => {
    const input = createTradingLiveDecisionInput({
      marketOverrides: {
        session: {
          marketOpen: false,
          session: "market_closed",
          confidence: 96,
        },
      },
      decisionCoreOverrides: {
        decision: {
          currentState: "MARKET_CLOSED",
          primaryMessage: "Market closed.",
          secondaryMessage: "Wait for the next live session before evaluating opportunity.",
          confidence: 96,
          reasons: ["Session closed"],
        },
      },
    });

    const result = composeTradingLiveDecision(input);

    expect(result.liveDecision.currentState).toBe("MARKET_CLOSED");
    expect(result.liveDecision.currentHeadline).toBe("Market closed");
    expect(result.liveDecision.feed.at(-1)?.state).toBe("MARKET_CLOSED");
    expect(result.liveDecision.triggerLevel).toBeNull();
  });

  it("builds a wait snapshot with synced current state and feed", () => {
    const input = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "WAIT",
          primaryMessage: "No valid setup yet.",
          secondaryMessage: "The market is open, but no canonical opportunity is qualified right now.",
          confidence: 74,
          reasons: ["No setup"],
        },
      },
    });

    const opened = composeTradingLiveDecision(input);
    const result = composeTradingLiveDecision({
      ...input,
      memory: opened.memory,
    });

    expect(result.liveDecision.currentState).toBe("WAIT");
    expect(result.liveDecision.feed.at(-1)?.state).toBe("WAIT");
    expect(result.liveDecision.executionStatus).toBe("caution");
  });

  it("builds a setup-forming snapshot", () => {
    const input = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "SETUP_FORMING",
          primaryMessage: "Setup forming.",
          secondaryMessage: "The opportunity is building, but it is not yet at its best execution point.",
          confidence: 78,
          reasons: ["Setup forming"],
        },
      },
    });
    input.market.liquidity.state = "liquidity_sweep";

    const opened = composeTradingLiveDecision(input);
    const result = composeTradingLiveDecision({
      ...input,
      memory: opened.memory,
    });

    expect(result.liveDecision.currentState).toBe("SETUP_FORMING");
    expect(result.liveDecision.currentHeadline).toBe("Setup forming");
    expect(result.liveDecision.feed.at(-1)?.state).toBe("SETUP_FORMING");
  });

  it("builds a trade-valid snapshot with execution levels", () => {
    const input = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "TRADE_VALID",
          primaryMessage: "Trade valid.",
          secondaryMessage: "Context, setup, and timing are aligned for a live opportunity.",
          confidence: 84,
          reasons: ["Aligned"],
        },
      },
    });
    input.market.instrument = "EURUSD";
    input.snapshot.instrument = "EURUSD";
    input.snapshot.marketType = "forex";
    input.setupCore.setup.direction = "short";
    input.setupCore.setup.triggerLevel = 1.082;
    input.executionPlan.entryZone.triggerLevel = 1.082;
    input.executionPlan.entryZone.entryZoneLow = 1.082;
    input.executionPlan.entryZone.entryZoneHigh = 1.0824;
    input.executionPlan.tradePath.targetZone = "1.0780 - 1.0765";

    const opened = composeTradingLiveDecision({
      ...input,
      memory: null,
    });
    const result = composeTradingLiveDecision({
      ...input,
      memory: opened.memory,
    });

    expect(result.liveDecision.currentState).toBe("TRADE_VALID");
    expect(result.liveDecision.currentHeadline).toBe("Trade valid");
    expect(result.liveDecision.executionStatus).toBe("allowed");
    expect(result.liveDecision.triggerLevel).toBe(1.082);
    expect(result.liveDecision.targetZone).toBe("1.0780 - 1.0765");
    expect(result.liveDecision.feed.at(-1)?.state).toBe("TRADE_VALID");
  });

  it("builds a blocked snapshot when technical state is valid but execution is restricted", () => {
    const input = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "TRADE_VALID",
          primaryMessage: "Trade valid.",
          secondaryMessage: "Context, setup, and timing are aligned for a live opportunity.",
          confidence: 84,
          reasons: ["Aligned"],
        },
      },
      playbookOverrides: {
        baseRules: {
          allowedSetups: ["trend_pullback"],
          blockedSetups: ["breakout_continuation", "none"],
          preferredRegimes: ["trending"],
          blockedRegimes: ["noisy"],
          riskPerTradePct: 0.5,
          maxDailyLossPct: 2,
          maxOpenRiskPct: 1.5,
          maxTrades: 4,
          maxConsecutiveLosses: 2,
          chasePolicy: "never",
          invalidationPolicy: "strict",
          noTradeIf: [],
          behaviorGuards: {
            blockChasing: true,
            blockRevengeTrading: true,
          },
        },
      },
    });

    const opened = composeTradingLiveDecision(input);
    const result = composeTradingLiveDecision({
      ...input,
      memory: opened.memory,
    });

    expect(result.liveDecision.currentState).toBe("BLOCKED");
    expect(result.liveDecision.executionStatus).toBe("restricted");
    expect(result.liveDecision.reasons.some((reason) => reason.includes("playbook"))).toBe(true);
    expect(result.liveDecision.feed.at(-1)?.state).toBe("BLOCKED");
  });

  it("builds a too-late snapshot when the window degrades", () => {
    const input = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "TOO_LATE",
          primaryMessage: "Opportunity late.",
          secondaryMessage: "The setup has already extended and the window is degrading.",
          confidence: 79,
          reasons: ["Late setup"],
        },
      },
    });

    const opened = composeTradingLiveDecision(input);
    const result = composeTradingLiveDecision({
      ...input,
      memory: opened.memory,
    });

    expect(result.liveDecision.currentState).toBe("TOO_LATE");
    expect(result.liveDecision.currentHeadline).toBe("Too late");
    expect(result.liveDecision.feed.at(-1)?.state).toBe("TOO_LATE");
  });

  it("builds an exit snapshot when the setup invalidates", () => {
    const input = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "EXIT",
          primaryMessage: "Setup invalidated.",
          secondaryMessage: "The opportunity lost structural validity and should not be pursued.",
          confidence: 86,
          reasons: ["Invalidated"],
        },
      },
    });

    const opened = composeTradingLiveDecision(input);
    const result = composeTradingLiveDecision({
      ...input,
      memory: opened.memory,
    });

    expect(result.liveDecision.currentState).toBe("EXIT");
    expect(result.liveDecision.currentHeadline).toBe("Exit");
    expect(result.liveDecision.feed.at(-1)?.state).toBe("EXIT");
  });
});

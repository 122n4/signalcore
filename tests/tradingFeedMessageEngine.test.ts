import { describe, expect, it } from "vitest";

import { buildFeedMessage, resolveStateTransition } from "@/lib/trading/state";

import { createStateTransitionInput } from "./helpers/tradingStateFixtures";

describe("trading feed message engine", () => {
  it("builds a session-open message for a live London session", () => {
    const input = createStateTransitionInput("MARKET_CLOSED");
    input.market.session.session = "london_open";
    input.decisionCore.decision.currentState = "WAIT";

    const transition = resolveStateTransition(input);
    const result = buildFeedMessage({
      ...input,
      transition,
    });

    expect(result.headline).toBe("Session open");
    expect(result.body).toContain("London open");
    expect(result.severity).toBe("info");
  });

  it("builds a setup-forming message from liquidity sweep context", () => {
    const input = createStateTransitionInput("WAIT");
    input.decisionCore.decision.currentState = "SETUP_FORMING";
    input.market.liquidity.state = "liquidity_sweep";

    const transition = resolveStateTransition(input);
    const result = buildFeedMessage({
      ...input,
      transition,
    });

    expect(result.headline).toBe("Setup forming");
    expect(result.body).toBe("Liquidity sweep detected.");
  });

  it("builds an operational trade-valid message with instrument and trigger", () => {
    const input = createStateTransitionInput("SETUP_FORMING");
    input.snapshot.instrument = "EURUSD";
    input.snapshot.marketType = "forex";
    input.market.instrument = "EURUSD";
    input.market.session.session = "london_session";
    input.decisionCore.decision.currentState = "TRADE_VALID";
    input.setupCore.setup.direction = "short";
    input.setupCore.setup.triggerLevel = 1.082;
    input.executionPlan.entryZone.triggerLevel = 1.082;

    const transition = resolveStateTransition(input);
    const result = buildFeedMessage({
      ...input,
      transition,
    });

    expect(result.headline).toBe("Trade valid");
    expect(result.body).toBe("Short EURUSD below 1.0820");
    expect(result.severity).toBe("action");
  });

  it("builds a blocked message from operational restrictions", () => {
    const input = createStateTransitionInput("TRADE_VALID");
    input.decisionCore.decision.currentState = "TRADE_VALID";
    input.executionPlan.executionStatus.executionStatus = "restricted";
    input.executionPlan.executionStatus.reasons = ["outside session rules"];

    const transition = resolveStateTransition(input);
    const result = buildFeedMessage({
      ...input,
      transition,
    });

    expect(result.headline).toBe("Blocked");
    expect(result.body).toContain("outside session rules");
    expect(result.severity).toBe("caution");
  });
});

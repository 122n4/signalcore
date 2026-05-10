import { describe, expect, it } from "vitest";

import { resolveStateTransition } from "@/lib/trading/state";

import { createStateTransitionInput } from "./helpers/tradingStateFixtures";

describe("trading state transition engine", () => {
  it("moves from market closed to session open before wait", () => {
    const sessionOpenInput = createStateTransitionInput("MARKET_CLOSED");
    sessionOpenInput.market.session.marketOpen = true;
    sessionOpenInput.market.session.session = "london_open";
    sessionOpenInput.decisionCore.decision.currentState = "WAIT";

    const sessionOpen = resolveStateTransition(sessionOpenInput);

    expect(sessionOpen.nextState).toBe("SESSION_OPEN");

    const waitInput = {
      ...sessionOpenInput,
      previousState: sessionOpen.nextState,
    };
    waitInput.market.session.session = "london_session";

    const wait = resolveStateTransition(waitInput);

    expect(wait.nextState).toBe("WAIT");
  });

  it("moves from wait to setup forming and then to trade valid", () => {
    const setupFormingInput = createStateTransitionInput("WAIT");
    setupFormingInput.decisionCore.decision.currentState = "SETUP_FORMING";

    const setupForming = resolveStateTransition(setupFormingInput);

    expect(setupForming.nextState).toBe("SETUP_FORMING");

    const tradeValidInput = {
      ...setupFormingInput,
      previousState: setupForming.nextState,
    };
    tradeValidInput.decisionCore.decision.currentState = "TRADE_VALID";
    tradeValidInput.executionPlan.executionStatus.executionStatus = "allowed";

    const tradeValid = resolveStateTransition(tradeValidInput);

    expect(tradeValid.nextState).toBe("TRADE_VALID");
  });

  it("moves trade valid to too late when the window degrades", () => {
    const input = createStateTransitionInput("TRADE_VALID");
    input.decisionCore.decision.currentState = "TOO_LATE";

    const result = resolveStateTransition(input);

    expect(result.nextState).toBe("TOO_LATE");
    expect(result.transitionReason).toContain("degraded");
  });

  it("moves trade valid to blocked when execution is restricted", () => {
    const input = createStateTransitionInput("TRADE_VALID");
    input.decisionCore.decision.currentState = "TRADE_VALID";
    input.executionPlan.executionStatus.executionStatus = "restricted";
    input.executionPlan.executionStatus.reasons = ["Valid setup, but outside session rules."];

    const result = resolveStateTransition(input);

    expect(result.nextState).toBe("BLOCKED");
    expect(result.transitionReason).toContain("outside session rules");
  });

  it("moves trade valid to exit when the setup invalidates", () => {
    const input = createStateTransitionInput("TRADE_VALID");
    input.decisionCore.decision.currentState = "EXIT";

    const result = resolveStateTransition(input);

    expect(result.nextState).toBe("EXIT");
  });
});

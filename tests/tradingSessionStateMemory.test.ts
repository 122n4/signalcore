import { describe, expect, it } from "vitest";

import { createSessionFeedMemory, processStateFeed } from "@/lib/trading/state";

import { createStateFeedInput } from "./helpers/tradingStateFixtures";

describe("trading session state memory", () => {
  it("appends market open, wait, and setup forming events in order", () => {
    const firstInput = createStateFeedInput();
    firstInput.market.session.session = "london_open";
    firstInput.decisionCore.decision.currentState = "WAIT";

    const opened = processStateFeed({
      ...firstInput,
      memory: createSessionFeedMemory({
        instrument: firstInput.market.instrument,
        startedAt: firstInput.snapshot.snapshotAt,
        session: firstInput.market.session.session,
      }),
    });

    expect(opened.appended).toBe(true);
    expect(opened.memory.events).toHaveLength(2);
    expect(opened.memory.events[0]?.state).toBe("SESSION_OPEN");
    expect(opened.memory.events[1]?.state).toBe("WAIT");

    const setupInput = createStateFeedInput();
    setupInput.market.session.session = "london_session";
    setupInput.decisionCore.decision.currentState = "SETUP_FORMING";
    setupInput.market.liquidity.state = "liquidity_sweep";

    const setup = processStateFeed({
      ...setupInput,
      memory: opened.memory,
    });

    expect(setup.appended).toBe(true);
    expect(setup.memory.events).toHaveLength(3);
    expect(setup.memory.events[2]?.state).toBe("SETUP_FORMING");
  });

  it("does not spam repeated wait events without material change", () => {
    const input = createStateFeedInput();
    input.decisionCore.decision.currentState = "WAIT";
    input.market.session.session = "london_session";

    const opened = processStateFeed({
      ...input,
      memory: createSessionFeedMemory({
        instrument: input.market.instrument,
        startedAt: input.snapshot.snapshotAt,
        session: input.market.session.session,
      }),
    });

    const repeatedWait = processStateFeed({
      ...input,
      memory: opened.memory,
    });

    expect(opened.memory.events).toHaveLength(2);
    expect(repeatedWait.appended).toBe(false);
    expect(repeatedWait.memory.events).toHaveLength(2);
  });

  it("appends a later blocked event when execution becomes restricted", () => {
    const input = createStateFeedInput();
    input.decisionCore.decision.currentState = "TRADE_VALID";
    input.market.session.session = "london_session";

    const tradeValid = processStateFeed({
      ...input,
      memory: createSessionFeedMemory({
        instrument: input.market.instrument,
        startedAt: input.snapshot.snapshotAt,
        session: input.market.session.session,
      }),
    });

    const liveTrade = processStateFeed({
      ...input,
      memory: tradeValid.memory,
    });

    const blockedInput = createStateFeedInput();
    blockedInput.decisionCore.decision.currentState = "TRADE_VALID";
    blockedInput.market.session.session = "london_session";
    blockedInput.executionPlan.executionStatus.executionStatus = "restricted";
    blockedInput.executionPlan.executionStatus.reasons = ["outside session rules"];

    const blocked = processStateFeed({
      ...blockedInput,
      memory: liveTrade.memory,
    });

    expect(tradeValid.memory.events.at(-1)?.state).toBe("TRADE_VALID");
    expect(liveTrade.appended).toBe(false);
    expect(blocked.appended).toBe(true);
    expect(blocked.memory.events.at(-1)?.state).toBe("BLOCKED");
  });
});

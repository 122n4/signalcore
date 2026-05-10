import { describe, expect, it } from "vitest";

import { assessSetupMaturity } from "@/lib/trading/setups";

import { createSetupInput } from "./helpers/tradingSetupFixtures";

describe("trading setup maturity engine", () => {
  it("marks a setup as forming when price is still far from trigger", () => {
    const input = createSetupInput();

    const result = assessSetupMaturity(input, {
      type: "trend_pullback",
      direction: "long",
      triggerLevel: 110,
      invalidationLevel: 101,
      confidence: 72,
    });

    expect(result.state).toBe("forming");
    expect(result.score).toBe(38);
  });

  it("marks a setup as ready when price is near the trigger without being late", () => {
    const input = createSetupInput();

    const result = assessSetupMaturity(input, {
      type: "breakout_continuation",
      direction: "long",
      triggerLevel: 103.8,
      invalidationLevel: 102.4,
      confidence: 78,
    });

    expect(result.state).toBe("ready");
    expect(result.confidence).toBeGreaterThanOrEqual(75);
  });

  it("lets breakout continuation become ready slightly earlier than other setups", () => {
    const input = createSetupInput();

    const breakout = assessSetupMaturity(input, {
      type: "breakout_continuation",
      direction: "long",
      triggerLevel: 103.85,
      invalidationLevel: 102.5,
      confidence: 76,
    });
    const pullback = assessSetupMaturity(input, {
      type: "trend_pullback",
      direction: "long",
      triggerLevel: 103.85,
      invalidationLevel: 102.5,
      confidence: 76,
    });

    expect(breakout.state).toBe("ready");
    expect(pullback.state).toBe("developing");
  });

  it("lets reclaim and reversal setups become developing earlier than generic setups", () => {
    const input = createSetupInput();

    const reversal = assessSetupMaturity(input, {
      type: "range_reclaim",
      direction: "long",
      triggerLevel: 104.2,
      invalidationLevel: 103.1,
      confidence: 74,
    });
    const pullback = assessSetupMaturity(input, {
      type: "trend_pullback",
      direction: "long",
      triggerLevel: 104.2,
      invalidationLevel: 103.1,
      confidence: 74,
    });

    expect(reversal.state).toBe("developing");
    expect(pullback.state).toBe("forming");
  });

  it("lets reversal setups become ready earlier than before when price is close enough to trigger", () => {
    const input = createSetupInput();

    const reversal = assessSetupMaturity(input, {
      type: "range_reclaim",
      direction: "long",
      triggerLevel: 103.95,
      invalidationLevel: 102.9,
      confidence: 74,
    });

    expect(reversal.state).toBe("ready");
    expect(reversal.confidence).toBeGreaterThanOrEqual(74);
  });

  it("marks a setup as late after price moves too far beyond trigger", () => {
    const input = createSetupInput();

    const result = assessSetupMaturity(input, {
      type: "breakout_continuation",
      direction: "long",
      triggerLevel: 102.8,
      invalidationLevel: 101.8,
      confidence: 80,
    });

    expect(result.state).toBe("late");
  });

  it("marks a setup as invalid when price breaks invalidation", () => {
    const input = createSetupInput();

    const result = assessSetupMaturity(input, {
      type: "range_reclaim",
      direction: "long",
      triggerLevel: 104,
      invalidationLevel: 104.2,
      confidence: 66,
    });

    expect(result.state).toBe("invalid");
    expect(result.score).toBe(10);
  });
});

import { describe, expect, it } from "vitest";

import { assessOpportunityWindow } from "@/lib/trading/setups";

import { createSetupInput } from "./helpers/tradingSetupFixtures";

describe("trading opportunity window engine", () => {
  it("opens the window when a valid setup is developing in an active session", () => {
    const input = createSetupInput();

    const result = assessOpportunityWindow(
      input,
      {
        type: "trend_pullback",
        direction: "long",
        triggerLevel: 104.1,
        invalidationLevel: 102.5,
        confidence: 70,
      },
      {
        state: "developing",
        score: 58,
        confidence: 72,
      },
    );

    expect(result.state).toBe("opening");
    expect(result.score).toBe(62);
  });

  it("marks the window as active when the setup is ready during a live session", () => {
    const input = createSetupInput();

    const result = assessOpportunityWindow(
      input,
      {
        type: "breakout_continuation",
        direction: "long",
        triggerLevel: 103.9,
        invalidationLevel: 102.6,
        confidence: 78,
      },
      {
        state: "ready",
        score: 78,
        confidence: 80,
      },
    );

    expect(result.state).toBe("active");
    expect(result.confidence).toBeGreaterThanOrEqual(85);
  });

  it("degrades the window when maturity is late or the session is poor", () => {
    const input = createSetupInput({
      marketOverrides: {
        session: {
          marketOpen: true,
          session: "midday_lull",
          confidence: 76,
        },
      },
    });

    const result = assessOpportunityWindow(
      input,
      {
        type: "breakout_continuation",
        direction: "long",
        triggerLevel: 103.9,
        invalidationLevel: 102.6,
        confidence: 78,
      },
      {
        state: "ready",
        score: 78,
        confidence: 80,
      },
    );

    expect(result.state).toBe("degrading");
  });

  it("closes the window when the market is closed or the setup is invalid", () => {
    const input = createSetupInput({
      marketOverrides: {
        session: {
          marketOpen: false,
          session: "market_closed",
          confidence: 95,
        },
      },
    });

    const result = assessOpportunityWindow(
      input,
      {
        type: "range_reclaim",
        direction: "long",
        triggerLevel: 103.8,
        invalidationLevel: 102.7,
        confidence: 66,
      },
      {
        state: "ready",
        score: 78,
        confidence: 78,
      },
    );

    expect(result.state).toBe("closed");
    expect(result.score).toBe(10);
  });
});

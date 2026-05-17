import { describe, expect, it } from "vitest";

import {
  deriveTradingFollowUpEvents,
  deriveTradingNotificationEvents,
  deriveTradingNotificationPreview,
} from "@/lib/trading/notifications";
import { composeTradingWatchlistEntry } from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

describe("trading notifications", () => {
  it("prioritizes execute-now alerts ahead of near-ready alerts", () => {
    const executeInput = createTradingLiveDecisionInput();
    executeInput.snapshot.instrument = "EURUSD";
    executeInput.market.instrument = "EURUSD";
    executeInput.decisionCore.decision.currentState = "TRADE_VALID";

    const prepareInput = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "SETUP_FORMING",
          primaryMessage: "Prepare.",
          secondaryMessage: "Setup is close.",
          confidence: 72,
          reasons: ["Structure is close and timing is improving"],
        },
        clarity: {
          level: "high",
          score: 76,
          conflictScore: 16,
          alignment: 81,
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "range_reclaim",
          direction: "long",
          triggerLevel: 101.2,
          invalidationLevel: 100.7,
          confidence: 72,
        },
        maturity: {
          state: "developing",
          score: 70,
          confidence: 75,
        },
        opportunityWindow: {
          state: "opening",
          score: 72,
          confidence: 74,
        },
        quality: {
          score: 78,
          grade: "A",
          confidence: 78,
        },
      },
    });
    prepareInput.snapshot.instrument = "BTCUSD";
    prepareInput.market.instrument = "BTCUSD";

    const events = deriveTradingNotificationEvents([
      composeTradingWatchlistEntry(prepareInput),
      composeTradingWatchlistEntry(executeInput),
    ]);

    expect(events[0]?.instrument).toBe("EURUSD");
    expect(events[0]?.kind).toBe("execute_now");
    expect(events[0]?.browserEligible).toBe(true);
    expect(events[1]?.instrument).toBe("BTCUSD");
    expect(events[1]?.kind).toBe("prepare_now");
  });

  it("builds a free preview from the highest-priority alert", () => {
    const executeInput = createTradingLiveDecisionInput();
    executeInput.snapshot.instrument = "ETHUSD";
    executeInput.market.instrument = "ETHUSD";
    executeInput.decisionCore.decision.currentState = "TRADE_VALID";

    const events = deriveTradingNotificationEvents([
      composeTradingWatchlistEntry(executeInput),
    ]);
    const preview = deriveTradingNotificationPreview(events, 1);

    expect(preview).toHaveLength(1);
    expect(preview[0]?.title).toContain("ETHUSD");
    expect(preview[0]?.actionLabel).toBe("Execute now");
  });

  it("keeps followed instruments alertable even when they only need a re-check", () => {
    const waitInput = createTradingLiveDecisionInput({
      decisionCoreOverrides: {
        decision: {
          currentState: "WAIT",
          primaryMessage: "Wait.",
          secondaryMessage: "No clean trigger yet.",
          confidence: 62,
          reasons: ["Price has not reached the trigger zone"],
        },
      },
    });
    waitInput.snapshot.instrument = "AAPL";
    waitInput.market.instrument = "AAPL";
    waitInput.decisionCore.decision.currentState = "WAIT";

    const events = deriveTradingFollowUpEvents(
      [composeTradingWatchlistEntry(waitInput)],
      ["AAPL"],
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.instrument).toBe("AAPL");
    expect(events[0]?.kind).toBe("session_recheck");
    expect(events[0]?.browserEligible).toBe(true);
    expect(events[0]?.actionLabel).toBe("Hold / re-check");
  });
});

import { describe, expect, it } from "vitest";

import {
  composeTradingOpportunityLayers,
  limitTradingOpportunityLayers,
  resolveTradingWorkspacePrimaryAction,
} from "@/app/app/tabs/tradingWorkspace";
import {
  composeTradingWatchlistEntry,
  resolveTradingActionGuidance,
  resolveTradingAlertGuidance,
  resolveTradingDayPlan,
  type TradingLiveDecision,
} from "@/lib/trading/state";

import { createTradingLiveDecisionInput } from "./helpers/tradingLiveDecisionFixtures";

function makeEntry(
  instrument: string,
  state: TradingLiveDecision["currentState"],
  overrides: Partial<TradingLiveDecision> = {},
  fixtureOverrides: Parameters<typeof createTradingLiveDecisionInput>[0] = {},
) {
  const input = createTradingLiveDecisionInput({
    ...fixtureOverrides,
    marketOverrides: {
      ...(fixtureOverrides.marketOverrides ?? {}),
      instrument,
    },
    decisionCoreOverrides: {
      ...(fixtureOverrides.decisionCoreOverrides ?? {}),
      decision: {
        currentState: state,
        primaryMessage: `${instrument} primary`,
        secondaryMessage: `${instrument} secondary`,
        confidence: 82,
        reasons: ["Setup aligned"],
        ...(fixtureOverrides.decisionCoreOverrides?.decision ?? {}),
      },
    },
  });

  input.snapshot.instrument = instrument;
  input.market.instrument = instrument;
  input.decisionCore.decision.currentState = state;

  const entry = composeTradingWatchlistEntry(input);

  return {
    ...entry,
    currentState: overrides.currentState ?? entry.currentState,
    executionStatus: overrides.executionStatus ?? entry.executionStatus,
    liveDecision: {
      ...entry.liveDecision,
      ...overrides,
    },
    contextSummary: {
      ...entry.contextSummary,
      contextLabel: overrides.currentHeadline ?? entry.contextSummary.contextLabel,
      priorityReason:
        overrides.currentBody ?? entry.contextSummary.priorityReason ?? "Context building",
    },
  };
}

describe("trading opportunity layers", () => {
  it("separates execution, queue, watchlist, and radar correctly", () => {
    const entries = [
      makeEntry("EURUSD", "TRADE_VALID", {
        executionStatus: "allowed",
      }),
      makeEntry("GBPUSD", "TRADE_VALID", {
        executionStatus: "caution",
      }),
      makeEntry(
        "USDJPY",
        "SETUP_FORMING",
        {},
        {
          setupCoreOverrides: {
            setup: {
              type: "breakout_continuation",
              direction: "long",
              triggerLevel: 152.1,
              invalidationLevel: 151.7,
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
              score: 80,
              grade: "A",
              confidence: 82,
            },
          },
          decisionCoreOverrides: {
            clarity: {
              level: "high",
              score: 74,
              conflictScore: 12,
              alignment: 80,
            },
            environment: {
              state: "favorable",
              score: 76,
              confidence: 78,
            },
          },
        },
      ),
      makeEntry("NAS100", "WAIT", {
        currentHeadline: "Breakout continuation building during New York open",
        currentBody: "Developing around key session zone",
      }),
      makeEntry("XAUUSD", "WAIT", {
        currentHeadline: "No clear edge yet",
        currentBody: "Stand aside",
      }),
    ];

    const layers = composeTradingOpportunityLayers(entries);

    expect(layers.map((layer) => layer.key)).toEqual([
      "execution_now",
      "opportunity_queue",
      "watchlist",
      "radar",
    ]);
    expect(layers.find((layer) => layer.key === "execution_now")?.entries.map((entry) => entry.instrument)).toEqual([
      "EURUSD",
    ]);
    expect(
      layers.find((layer) => layer.key === "opportunity_queue")?.entries.map((entry) => entry.instrument),
    ).toEqual(["GBPUSD", "USDJPY"]);
    expect(layers.find((layer) => layer.key === "watchlist")?.entries.map((entry) => entry.instrument)).toEqual([
      "NAS100",
    ]);
    expect(layers.find((layer) => layer.key === "radar")?.entries.map((entry) => entry.instrument)).toEqual([
      "XAUUSD",
    ]);
  });

  it("promotes strong near-ready waits into the opportunity queue without promoting weak waits", () => {
    const layers = composeTradingOpportunityLayers([
      makeEntry(
        "GER40",
        "WAIT",
        {
          currentHeadline: "Range reclaim building during New York open",
          currentBody: "Near-ready around a clear trigger",
        },
        {
          setupCoreOverrides: {
            setup: {
              type: "range_reclaim",
              direction: "long",
              triggerLevel: 18120,
              invalidationLevel: 18040,
              confidence: 84,
            },
            maturity: {
              state: "developing",
              score: 64,
              confidence: 72,
            },
            opportunityWindow: {
              state: "opening",
              score: 69,
              confidence: 75,
            },
            quality: {
              score: 79,
              grade: "A",
              confidence: 82,
            },
          },
          decisionCoreOverrides: {
            clarity: {
              level: "high",
              score: 73,
              conflictScore: 14,
              alignment: 78,
            },
            environment: {
              state: "favorable",
              score: 74,
              confidence: 77,
            },
          },
        },
      ),
      makeEntry("XAUUSD", "WAIT", {
        currentHeadline: "No clear edge yet",
        currentBody: "Stand aside",
      }),
    ]);

    expect(layers.find((layer) => layer.key === "opportunity_queue")?.entries.map((entry) => entry.instrument)).toEqual([
      "GER40",
    ]);
    expect(layers.find((layer) => layer.key === "radar")?.entries.map((entry) => entry.instrument)).toEqual([
      "XAUUSD",
    ]);
  });

  it("limits discovery across layers without destroying layer priority", () => {
    const entries = [
      makeEntry("EURUSD", "TRADE_VALID", { executionStatus: "allowed" }),
      makeEntry("GBPUSD", "TRADE_VALID", { executionStatus: "caution" }),
      makeEntry("USDJPY", "SETUP_FORMING"),
      makeEntry("XAUUSD", "WAIT"),
    ];

    const layers = composeTradingOpportunityLayers(entries);
    const limited = limitTradingOpportunityLayers(layers, 2);

    expect(limited.map((layer) => layer.key)).toEqual(["execution_now", "opportunity_queue"]);
    expect(limited.flatMap((layer) => layer.entries).map((entry) => entry.instrument)).toEqual([
      "EURUSD",
      "GBPUSD",
    ]);
  });

  it("converts raw wait states into clearer action guidance", () => {
    const waitEntry = makeEntry("NAS100", "WAIT", {
      currentHeadline: "No clear edge yet",
      currentBody: "Stand aside",
      executionStatus: "restricted",
    });
    const formingEntry = makeEntry(
      "USDJPY",
      "SETUP_FORMING",
      {},
      {
        setupCoreOverrides: {
          setup: {
            type: "breakout_continuation",
            direction: "long",
            triggerLevel: 152.1,
            invalidationLevel: 151.7,
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
            score: 80,
            grade: "A",
            confidence: 82,
          },
        },
        decisionCoreOverrides: {
          clarity: {
            level: "high",
            score: 74,
            conflictScore: 12,
            alignment: 80,
          },
          environment: {
            state: "favorable",
            score: 76,
            confidence: 78,
          },
        },
      },
    );

    expect(resolveTradingActionGuidance(waitEntry).label).toBe("Stand aside");
    expect(resolveTradingActionGuidance(formingEntry).label).toBe("Prepare now");

    const primaryAction = resolveTradingWorkspacePrimaryAction(
      composeTradingOpportunityLayers([waitEntry, formingEntry]),
    );

    expect(primaryAction?.entry.instrument).toBe("USDJPY");
    expect(primaryAction?.label).toBe("Prepare now");
  });

  it("builds a rest-of-day plan for actionable and non-actionable states", () => {
    const validEntry = makeEntry("EURUSD", "TRADE_VALID", {
      executionStatus: "allowed",
      nextDisciplineStep: "Place the order only if the trigger prints cleanly.",
    });
    const monitorEntry = makeEntry("NAS100", "WAIT", {
      currentHeadline: "No clear edge yet",
      currentBody: "Keep the session on watch only.",
      executionStatus: "caution",
    });

    const validPlan = resolveTradingDayPlan(validEntry);
    const monitorPlan = resolveTradingDayPlan(monitorEntry);

    expect(validPlan.steps.map((step) => step.title)).toEqual([
      "Now",
      "After entry",
      "If it does not trigger",
      "Before session close",
    ]);
    expect(validPlan.steps[0]?.body).toContain("Place the order only if the trigger prints cleanly.");
    expect(monitorPlan.steps.map((step) => step.title)).toEqual([
      "Now",
      "Next check",
      "If nothing improves",
      "End of day",
    ]);
    expect(monitorPlan.summary).toContain("there is still no clean trade");
  });

  it("builds re-check timing and next-alert guidance", () => {
    const allowedEntry = makeEntry("EURUSD", "TRADE_VALID", {
      executionStatus: "allowed",
    });
    const formingEntry = makeEntry(
      "USDJPY",
      "SETUP_FORMING",
      {},
      {
        setupCoreOverrides: {
          setup: {
            type: "breakout_continuation",
            direction: "long",
            triggerLevel: 152.1,
            invalidationLevel: 151.7,
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
            score: 80,
            grade: "A",
            confidence: 82,
          },
        },
        decisionCoreOverrides: {
          clarity: {
            level: "high",
            score: 74,
            conflictScore: 12,
            alignment: 80,
          },
          environment: {
            state: "favorable",
            score: 76,
            confidence: 78,
          },
        },
      },
    );

    const allowedGuidance = resolveTradingAlertGuidance(allowedEntry);
    const formingGuidance = resolveTradingAlertGuidance(formingEntry);

    expect(allowedGuidance.badge).toBe("High priority");
    expect(allowedGuidance.recheckWindow).toContain("trigger");
    expect(formingGuidance.badge).toBe("Near-ready");
    expect(formingGuidance.recheckWindow).toContain("next 15m close");
    expect(formingGuidance.nextAlertCondition).toContain("execution turns allowed");
  });
});

import { describe, expect, it } from "vitest";

import {
  createTradeSimulatorState,
  integrateTradeSimulatorStep,
} from "@/lib/trading/backtest";

import { createBacktestStepFixture } from "./helpers/tradingBacktestFixtures";

describe("trading backtest execution overrides", () => {
  it("blocks pending signals when a reduced/caution context matches a backtest execution override", () => {
    const step = createBacktestStepFixture({
      snapshotOverrides: {
        instrument: "NAS100",
      },
      marketOverrides: {
        session: {
          session: "ny_open",
          marketOpen: true,
          confidence: 90,
        },
      },
      decisionCoreOverrides: {
        clarity: {
          level: "medium",
          score: 68,
          conflictScore: 18,
          alignment: 71,
        },
        environment: {
          state: "neutral",
          score: 58,
          confidence: 66,
        },
      },
      setupCoreOverrides: {
        setup: {
          type: "breakout_continuation",
          direction: "long",
          confidence: 77,
        },
        quality: {
          score: 76,
          grade: "B",
          confidence: 76,
        },
      },
    });

    expect(step.executionPlan.riskFraming.riskMode).toBe("reduced");
    expect(step.executionPlan.executionStatus.executionStatus).toBe("allowed");

    const next = integrateTradeSimulatorStep(createTradeSimulatorState(), step, {
      executionOverrides: {
        blockedSignalContexts: [
          {
            instrument: "NAS100",
            sessions: ["ny_open"],
            setupTypes: ["breakout_continuation"],
            riskModes: ["reduced"],
            qualityGrades: ["B", "C", "D"],
            clarityLevels: ["medium"],
            environmentStates: ["neutral"],
            reason: "Test execution override blocks this weak NAS100 breakout context.",
          },
        ],
      },
    });

    expect(next.pendingSignal).toBeNull();
  });
});

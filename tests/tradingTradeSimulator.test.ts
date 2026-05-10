import { describe, expect, it } from "vitest";

import {
  applyTradeSimulatorCandle,
  createTradeSimulatorState,
  integrateTradeSimulatorStep,
  synchronizeTradeSimulatorDay,
} from "@/lib/trading/backtest";

import { createBacktestStepFixture } from "./helpers/tradingBacktestFixtures";

describe("trading trade simulator", () => {
  it("opens from a valid signal and closes at target on later candles", () => {
    const step = createBacktestStepFixture();
    const stateAfterSignal = integrateTradeSimulatorStep(createTradeSimulatorState(), step);

    expect(stateAfterSignal.pendingSignal?.instrument).toBe("NVDA");

    const entryCandle = {
      timestamp: "2026-03-10T15:15:00.000Z",
      open: 103.8,
      high: 104.4,
      low: 103.7,
      close: 104.1,
      volume: 1200,
    };
    const stateWithOpenTrade = applyTradeSimulatorCandle(stateAfterSignal, entryCandle, 13);

    expect(stateWithOpenTrade.openTrade?.entryPrice).toBe(103.9);
    expect(stateWithOpenTrade.behavior.tradesTaken).toBe(1);

    const targetCandle = {
      timestamp: "2026-03-10T15:30:00.000Z",
      open: 104.1,
      high: 107.4,
      low: 104.0,
      close: 107.1,
      volume: 1300,
    };
    const closedState = applyTradeSimulatorCandle(stateWithOpenTrade, targetCandle, 14);

    expect(closedState.openTrade).toBeNull();
    expect(closedState.closedTrades).toHaveLength(1);
    expect(closedState.closedTrades[0].outcome).toBe("win");
    expect(closedState.closedTrades[0].exitReason).toBe("target_hit");
  });

  it("does not create a pending signal when execution is restricted", () => {
    const restrictedStep = createBacktestStepFixture({
      behaviorOverrides: {
        tradesTaken: 4,
      },
    });
    const state = integrateTradeSimulatorStep(createTradeSimulatorState(), restrictedStep);

    expect(restrictedStep.executionPlan.executionStatus.executionStatus).toBe("restricted");
    expect(state.pendingSignal).toBeNull();
  });

  it("resets daily counters while preserving streak context", () => {
    const state = synchronizeTradeSimulatorDay(createTradeSimulatorState(), "2026-03-10T14:00:00.000Z");
    const next = synchronizeTradeSimulatorDay(
      {
        ...state,
        behaviorDay: "2026-03-10",
        behavior: {
          ...state.behavior,
          tradesTaken: 2,
          dailyLossPct: 1,
          consecutiveLosses: 1,
        },
      },
      "2026-03-11T09:00:00.000Z",
    );

    expect(next.behavior.tradesTaken).toBe(0);
    expect(next.behavior.dailyLossPct).toBe(0);
    expect(next.behavior.consecutiveLosses).toBe(1);
  });
});

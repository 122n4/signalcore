import { describe, expect, it } from "vitest";

import {
  applyTradeSimulatorCandle,
  createTradeSimulatorState,
  finalizeTradeSimulator,
  type TradingBacktestSimulationState,
} from "@/lib/trading/backtest";

function createOpenTradeState(): TradingBacktestSimulationState {
  const state = createTradeSimulatorState(100);

  return {
    ...state,
    openTrade: {
      id: "trade-1",
      instrument: "NAS100",
      setupType: "breakout_continuation",
      session: "ny_open",
      direction: "long",
      signalAt: "2026-03-21T10:00:00.000Z",
      openedAt: "2026-03-21T10:15:00.000Z",
      entryPrice: 100,
      triggerType: "break",
      triggerLevel: 100,
      invalidationLevel: 95,
      targetZone: "110-112",
      targetZoneLow: 110,
      targetZoneHigh: 112,
      riskPct: 1,
      riskRewardEstimate: 2,
      entryIndex: 0,
    },
    behavior: {
      ...state.behavior,
      openRiskPct: 1,
    },
  };
}

describe("trading backtest cost model", () => {
  it("deducts round-trip cost from a winning trade", () => {
    const closed = applyTradeSimulatorCandle(
      createOpenTradeState(),
      {
        timestamp: "2026-03-21T11:00:00.000Z",
        open: 101,
        high: 111,
        low: 99,
        close: 109,
        volume: 1,
      },
      1,
      {
        intrabarPolicy: "target_first",
        costModel: {
          roundTripCostR: 0.1,
        },
      },
    );

    expect(closed.closedTrades).toHaveLength(1);
    expect(closed.closedTrades[0]?.grossPnlR).toBe(2);
    expect(closed.closedTrades[0]?.costPnlR).toBe(0.1);
    expect(closed.closedTrades[0]?.pnlR).toBe(1.9);
    expect(closed.closedTrades[0]?.costPnlPct).toBe(0.1);
    expect(closed.closedTrades[0]?.pnlPct).toBe(1.9);
    expect(closed.equity).toBe(101.9);
  });

  it("turns a scratch exit into a net loss when cost is applied", () => {
    const closed = finalizeTradeSimulator(
      createOpenTradeState(),
      {
        timestamp: "2026-03-21T11:00:00.000Z",
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 1,
      },
      1,
      {
        costModel: {
          roundTripCostR: 0.05,
        },
      },
    );

    expect(closed.closedTrades).toHaveLength(1);
    expect(closed.closedTrades[0]?.grossPnlR).toBe(0);
    expect(closed.closedTrades[0]?.pnlR).toBe(-0.05);
    expect(closed.closedTrades[0]?.outcome).toBe("loss");
  });
});

import { describe, expect, it } from "vitest";

import {
  resolveTradingHistoricalInstrument,
  TRADING_BACKTEST_BASE_INSTRUMENTS,
} from "@/lib/trading/backtest";

describe("trading research expansion instruments", () => {
  it("resolves staged crypto candidates without adding them to default sweeps", () => {
    const sol = resolveTradingHistoricalInstrument("SOLUSD");
    const bnb = resolveTradingHistoricalInstrument("BNBUSD");
    const xrp = resolveTradingHistoricalInstrument("XRPUSD");

    expect(sol.localDataset?.symbol).toBe("SOLUSDT");
    expect(bnb.localDataset?.symbol).toBe("BNBUSDT");
    expect(xrp.localDataset?.symbol).toBe("XRPUSDT");
    expect(TRADING_BACKTEST_BASE_INSTRUMENTS.map((item) => item.instrument)).not.toContain("SOLUSD");
    expect(TRADING_BACKTEST_BASE_INSTRUMENTS.map((item) => item.instrument)).not.toContain("BNBUSD");
    expect(TRADING_BACKTEST_BASE_INSTRUMENTS.map((item) => item.instrument)).not.toContain("XRPUSD");
  });
});

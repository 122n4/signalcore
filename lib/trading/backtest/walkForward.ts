import type { NormalizedCandle, TradingTimeframe } from "@/lib/trading/data";
import type { TradingWalkForwardConfig, TradingWalkForwardPlan } from "./types";

export function createWalkForwardPlan(args: {
  instrument: string;
  primaryTimeframe: TradingTimeframe;
  candles: NormalizedCandle[];
  config: TradingWalkForwardConfig;
}): TradingWalkForwardPlan {
  const { instrument, primaryTimeframe, candles, config } = args;
  const stepBars = config.stepBars ?? config.testBars;
  const windows: TradingWalkForwardPlan["windows"] = [];

  if (config.trainBars <= 0 || config.testBars <= 0 || stepBars <= 0) {
    throw new Error("Walk-forward windows require positive train, test, and step sizes.");
  }

  for (
    let trainStart = 0;
    trainStart + config.trainBars + config.testBars <= candles.length;
    trainStart += stepBars
  ) {
    const trainEnd = trainStart + config.trainBars - 1;
    const testStart = trainEnd + 1;
    const testEnd = testStart + config.testBars - 1;

    windows.push({
      index: windows.length + 1,
      trainStart,
      trainEnd,
      testStart,
      testEnd,
      trainFrom: candles[trainStart].timestamp,
      trainTo: candles[trainEnd].timestamp,
      testFrom: candles[testStart].timestamp,
      testTo: candles[testEnd].timestamp,
    });
  }

  return {
    instrument,
    primaryTimeframe,
    trainBars: config.trainBars,
    testBars: config.testBars,
    stepBars,
    windows,
  };
}

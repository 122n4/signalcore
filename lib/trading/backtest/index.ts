// Trading backtest infrastructure.
// This module replays the current trading engine candle-by-candle
// without changing runtime product logic.

export * from "./types";
export * from "./tradeSimulator";
export * from "./metrics";
export * from "./walkForward";
export * from "./walkForwardStudy";
export * from "./report";
export * from "./runner";
export * from "./datasets";
export * from "./historicalLoader";
export * from "./localHistoricalLoader";
export * from "./marketSweep";
export * from "./periods";
export * from "./archive";
export * from "./comparativeSweep";
export * from "./quality";
export * from "./campaign";
export * from "./coverageAudit";
export * from "./officialArchiveSync";
export * from "./twelveDataArchiveSync";
export * from "./twelveDataHistorical";
export * from "./setupSegmentation";
export * from "./marketSessionSegmentation";
export * from "./marketSessionOverrides";
export * from "./funnelDiagnostics";
export * from "./riskOverrides";
export * from "./executionOverrides";
export * from "./funnelOverrides";
export * from "./calibrationScorecard";
export * from "./secondLayerRiskStudy";
export * from "./contextBlockStudy";

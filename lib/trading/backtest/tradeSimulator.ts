import type { NormalizedCandle } from "@/lib/trading/data";
import type {
  TradingBacktestConfig,
  TradingBacktestOpenTrade,
  TradingBacktestSignal,
  TradingBacktestSimulationState,
  TradingBacktestStep,
  TradingBacktestTrade,
} from "./types";
import { resolveMatchingBacktestExecutionRule } from "./executionOverrides";

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function parseTargetZone(targetZone: string | null | undefined): {
  low: number | null;
  high: number | null;
} {
  if (!targetZone) {
    return {
      low: null,
      high: null,
    };
  }

  const [low, high] = targetZone.split("-").map((part) => Number(part.trim()));

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return {
      low: null,
      high: null,
    };
  }

  return {
    low: Math.min(low, high),
    high: Math.max(low, high),
  };
}

function resetDailyBehavior(
  state: TradingBacktestSimulationState,
  timestamp: string,
): TradingBacktestSimulationState {
  const nextDay = timestamp.slice(0, 10);

  if (state.behaviorDay === nextDay) {
    return state;
  }

  return {
    ...state,
    behaviorDay: nextDay,
    behavior: {
      ...state.behavior,
      tradesTaken: 0,
      dailyLossPct: 0,
      openRiskPct: state.openTrade?.riskPct ?? 0,
      chasingActive: false,
      revengeTradingActive: false,
    },
  };
}

function resolveSignalEntryPrice(signal: TradingBacktestSignal, candle: NormalizedCandle): number | null {
  switch (signal.triggerType) {
    case "close_confirm":
      if (signal.direction === "long" && candle.close >= signal.triggerLevel) {
        return candle.close;
      }

      if (signal.direction === "short" && candle.close <= signal.triggerLevel) {
        return candle.close;
      }

      return null;
    case "break":
      if (signal.direction === "long" && candle.high >= signal.triggerLevel) {
        return signal.triggerLevel;
      }

      if (signal.direction === "short" && candle.low <= signal.triggerLevel) {
        return signal.triggerLevel;
      }

      return null;
    case "reclaim":
    case "touch": {
      const overlapsZone = candle.low <= signal.entryZoneHigh && candle.high >= signal.entryZoneLow;

      if (!overlapsZone) {
        return null;
      }

      if (signal.triggerLevel >= signal.entryZoneLow && signal.triggerLevel <= signal.entryZoneHigh) {
        return signal.triggerLevel;
      }

      return signal.direction === "long" ? signal.entryZoneHigh : signal.entryZoneLow;
    }
  }
}

function buildOpenTrade(
  signal: TradingBacktestSignal,
  candle: NormalizedCandle,
  barIndex: number,
  tradeIndex: number,
): TradingBacktestOpenTrade | null {
  const entryPrice = resolveSignalEntryPrice(signal, candle);

  if (typeof entryPrice !== "number") {
    return null;
  }

  return {
    id: `${signal.instrument}:trade:${tradeIndex}`,
    instrument: signal.instrument,
    setupType: signal.setupType,
    session: signal.session,
    direction: signal.direction,
    signalAt: signal.generatedAt,
    openedAt: candle.timestamp,
    entryPrice: roundMetric(entryPrice),
    triggerType: signal.triggerType,
    triggerLevel: signal.triggerLevel,
    invalidationLevel: signal.invalidationLevel,
    targetZone: signal.targetZone,
    targetZoneLow: signal.targetZoneLow,
    targetZoneHigh: signal.targetZoneHigh,
    riskPct: signal.riskPct,
    riskRewardEstimate: signal.riskRewardEstimate,
    entryIndex: barIndex,
  };
}

function resolveTradeExit(
  openTrade: TradingBacktestOpenTrade,
  candle: NormalizedCandle,
  intrabarPolicy: NonNullable<TradingBacktestConfig["intrabarPolicy"]>,
): {
  exitPrice: number;
  exitReason: TradingBacktestTrade["exitReason"];
} | null {
  const stopHit =
    openTrade.direction === "long"
      ? candle.low <= openTrade.invalidationLevel
      : candle.high >= openTrade.invalidationLevel;
  const targetHit =
    openTrade.direction === "long"
      ? typeof openTrade.targetZoneLow === "number" && candle.high >= openTrade.targetZoneLow
      : typeof openTrade.targetZoneHigh === "number" && candle.low <= openTrade.targetZoneHigh;

  if (stopHit && targetHit) {
    if (intrabarPolicy === "target_first") {
      return {
        exitPrice:
          openTrade.direction === "long"
            ? (openTrade.targetZoneLow as number)
            : (openTrade.targetZoneHigh as number),
        exitReason: "target_hit",
      };
    }

    return {
      exitPrice: openTrade.invalidationLevel,
      exitReason: "invalidation_hit",
    };
  }

  if (stopHit) {
    return {
      exitPrice: openTrade.invalidationLevel,
      exitReason: "invalidation_hit",
    };
  }

  if (targetHit) {
    return {
      exitPrice:
        openTrade.direction === "long"
          ? (openTrade.targetZoneLow as number)
          : (openTrade.targetZoneHigh as number),
      exitReason: "target_hit",
    };
  }

  return null;
}

function closeTrade(
  state: TradingBacktestSimulationState,
  openTrade: TradingBacktestOpenTrade,
  candle: NormalizedCandle,
  barIndex: number,
  exitPrice: number,
  exitReason: TradingBacktestTrade["exitReason"],
  config: TradingBacktestConfig = {},
): TradingBacktestSimulationState {
  const signedMove =
    openTrade.direction === "long" ? exitPrice - openTrade.entryPrice : openTrade.entryPrice - exitPrice;
  const riskDistance = Math.abs(openTrade.entryPrice - openTrade.invalidationLevel);
  const grossPnlR = riskDistance > 0 ? signedMove / riskDistance : 0;
  const roundTripCostR = Math.max(0, config.costModel?.roundTripCostR ?? 0);
  const costPnlR = roundTripCostR;
  const pnlR = grossPnlR - costPnlR;
  const grossPnlPct = (openTrade.riskPct ?? 0) * grossPnlR;
  const costPnlPct = (openTrade.riskPct ?? 0) * costPnlR;
  const pnlPct = grossPnlPct - costPnlPct;
  const outcome: TradingBacktestTrade["outcome"] =
    pnlR > 0 ? "win" : pnlR < 0 ? "loss" : "scratch";
  const equity = roundMetric(state.equity + pnlPct);
  const peakEquity = Math.max(state.peakEquity, equity);
  const drawdownPct = roundMetric(peakEquity - equity);
  const closedTrade: TradingBacktestTrade = {
    ...openTrade,
    closedAt: candle.timestamp,
    exitPrice: roundMetric(exitPrice),
    exitReason,
    outcome,
    grossPnlR: roundMetric(grossPnlR),
    grossPnlPct: roundMetric(grossPnlPct),
    costPnlR: roundMetric(costPnlR),
    costPnlPct: roundMetric(costPnlPct),
    pnlR: roundMetric(pnlR),
    pnlPct: roundMetric(pnlPct),
    barsHeld: Math.max(1, barIndex - openTrade.entryIndex),
  };

  return {
    ...state,
    openTrade: null,
    closedTrades: [...state.closedTrades, closedTrade],
    behavior: {
      ...state.behavior,
      dailyLossPct:
        pnlPct < 0 ? roundMetric(state.behavior.dailyLossPct + Math.abs(pnlPct)) : state.behavior.dailyLossPct,
      openRiskPct: 0,
      consecutiveLosses:
        outcome === "loss"
          ? state.behavior.consecutiveLosses + 1
          : outcome === "win"
            ? 0
            : state.behavior.consecutiveLosses,
    },
    equity,
    peakEquity,
    equityCurve: [
      ...state.equityCurve,
      {
        timestamp: candle.timestamp,
        equity,
        drawdownPct,
        tradeId: closedTrade.id,
      },
    ],
  };
}

function createSignalFromStep(
  step: TradingBacktestStep,
  executionPolicy: NonNullable<TradingBacktestConfig["executionPolicy"]>,
  executionOverrides: TradingBacktestConfig["executionOverrides"] | null | undefined,
): TradingBacktestSignal | null {
  if (step.decisionCore.decision.currentState !== "TRADE_VALID") {
    return null;
  }

  if (step.setupCore.setup.type === "none" || step.setupCore.setup.direction === "neutral") {
    return null;
  }

  const executionStatus = step.executionPlan.executionStatus.executionStatus;

  if (executionPolicy === "allowed_only" && executionStatus !== "allowed") {
    return null;
  }

  if (executionPolicy === "allowed_and_caution" && executionStatus === "restricted") {
    return null;
  }

  const executionRule = resolveMatchingBacktestExecutionRule({
    instrument: step.snapshot.instrument,
    session: step.market.session.session,
    setupType: step.setupCore.setup.type,
    riskMode: step.executionPlan.riskFraming.riskMode,
    executionStatus,
    qualityGrade: step.setupCore.quality.grade,
    clarityLevel: step.decisionCore.clarity.level,
    environmentState: step.decisionCore.environment.state,
    overrides: executionOverrides ?? null,
  });

  if (executionRule) {
    return null;
  }

  const triggerLevel = step.executionPlan.entryZone.triggerLevel ?? step.setupCore.setup.triggerLevel ?? null;
  const invalidationLevel =
    step.executionPlan.invalidation.invalidationLevel ?? step.setupCore.setup.invalidationLevel ?? null;
  const entryZoneLow = step.executionPlan.entryZone.entryZoneLow ?? triggerLevel;
  const entryZoneHigh = step.executionPlan.entryZone.entryZoneHigh ?? triggerLevel;

  if (
    typeof triggerLevel !== "number" ||
    typeof invalidationLevel !== "number" ||
    typeof entryZoneLow !== "number" ||
    typeof entryZoneHigh !== "number"
  ) {
    return null;
  }

  const parsedTarget = parseTargetZone(step.executionPlan.tradePath.targetZone ?? null);

  return {
    instrument: step.snapshot.instrument,
    generatedAt: step.asOf,
    setupType: step.setupCore.setup.type,
    session: step.market.session.session,
    technicalState: step.liveDecision.currentState,
    direction: step.setupCore.setup.direction,
    triggerType: step.executionPlan.entryZone.triggerType,
    triggerLevel,
    entryZoneLow: Math.min(entryZoneLow, entryZoneHigh),
    entryZoneHigh: Math.max(entryZoneLow, entryZoneHigh),
    invalidationLevel,
    targetZone: step.executionPlan.tradePath.targetZone ?? null,
    targetZoneLow: parsedTarget.low,
    targetZoneHigh: parsedTarget.high,
    riskPct: step.executionPlan.riskFraming.riskPct ?? null,
    riskRewardEstimate: step.executionPlan.tradePath.riskRewardEstimate ?? null,
    executionStatus,
  };
}

export function createTradeSimulatorState(startingEquity = 100): TradingBacktestSimulationState {
  return {
    pendingSignal: null,
    openTrade: null,
    closedTrades: [],
    behavior: {
      tradesTaken: 0,
      dailyLossPct: 0,
      openRiskPct: 0,
      consecutiveLosses: 0,
      chasingActive: false,
      revengeTradingActive: false,
      invalidationBreaches: 0,
    },
    behaviorDay: null,
    equity: startingEquity,
    peakEquity: startingEquity,
    equityCurve: [
      {
        timestamp: "START",
        equity: startingEquity,
        drawdownPct: 0,
        tradeId: null,
      },
    ],
  };
}

export function synchronizeTradeSimulatorDay(
  state: TradingBacktestSimulationState,
  timestamp: string,
): TradingBacktestSimulationState {
  return resetDailyBehavior(state, timestamp);
}

export function applyTradeSimulatorCandle(
  state: TradingBacktestSimulationState,
  candle: NormalizedCandle,
  barIndex: number,
  config: TradingBacktestConfig = {},
): TradingBacktestSimulationState {
  const nextState = resetDailyBehavior(state, candle.timestamp);
  const intrabarPolicy = config.intrabarPolicy ?? "stop_first";

  if (nextState.openTrade) {
    const exit = resolveTradeExit(nextState.openTrade, candle, intrabarPolicy);

    if (exit) {
      return closeTrade(
        nextState,
        nextState.openTrade,
        candle,
        barIndex,
        exit.exitPrice,
        exit.exitReason,
        config,
      );
    }

    return nextState;
  }

  if (!nextState.pendingSignal || nextState.pendingSignal.generatedAt >= candle.timestamp) {
    return nextState;
  }

  const openTrade = buildOpenTrade(
    nextState.pendingSignal,
    candle,
    barIndex,
    nextState.closedTrades.length + (nextState.openTrade ? 2 : 1),
  );

  if (!openTrade) {
    return nextState;
  }

  return {
    ...nextState,
    pendingSignal: null,
    openTrade,
    behavior: {
      ...nextState.behavior,
      tradesTaken: nextState.behavior.tradesTaken + 1,
      openRiskPct: openTrade.riskPct ?? 0,
    },
  };
}

export function integrateTradeSimulatorStep(
  state: TradingBacktestSimulationState,
  step: TradingBacktestStep,
  config: TradingBacktestConfig = {},
): TradingBacktestSimulationState {
  const nextState = resetDailyBehavior(state, step.asOf);

  if (nextState.openTrade) {
    if (step.liveDecision.currentState === "EXIT") {
      return closeTrade(
        nextState,
        nextState.openTrade,
        step.candle,
        step.index,
        step.candle.close,
        "technical_exit",
        config,
      );
    }

    if (["SESSION_END", "MARKET_CLOSED"].includes(step.liveDecision.currentState)) {
      return closeTrade(
        nextState,
        nextState.openTrade,
        step.candle,
        step.index,
        step.candle.close,
        "session_end",
        config,
      );
    }

    return nextState;
  }

  const evaluationStartAt = config.evaluationStartAt ? new Date(config.evaluationStartAt).toISOString() : null;
  const signal =
    !evaluationStartAt || step.asOf >= evaluationStartAt
      ? createSignalFromStep(
          step,
          config.executionPolicy ?? "allowed_and_caution",
          config.executionOverrides ?? null,
        )
      : null;

  return {
    ...nextState,
    pendingSignal: signal,
  };
}

export function finalizeTradeSimulator(
  state: TradingBacktestSimulationState,
  candle: NormalizedCandle | null,
  barIndex: number,
  config: TradingBacktestConfig = {},
): TradingBacktestSimulationState {
  if (!state.openTrade || !candle) {
    return {
      ...state,
      pendingSignal: null,
    };
  }

  return closeTrade(state, state.openTrade, candle, barIndex, candle.close, "end_of_data", config);
}

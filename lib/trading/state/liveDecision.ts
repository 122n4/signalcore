import { processStateFeed } from "./stateCore";
import type {
  ComposeTradingLiveDecisionInput,
  ComposeTradingLiveDecisionOutput,
  TradingLiveDecision,
} from "./types";

function shouldExposeLevels(state: TradingLiveDecision["currentState"]): boolean {
  return [
    "SETUP_FORMING",
    "TRADE_VALID",
    "TRADE_ACTIVE",
    "BLOCKED",
    "TOO_LATE",
    "EXIT",
  ].includes(state);
}

function uniqueReasons(reasons: string[]): string[] {
  return Array.from(new Set(reasons.map((reason) => reason.trim()).filter(Boolean)));
}

export function composeTradingLiveDecision(
  input: ComposeTradingLiveDecisionInput,
): ComposeTradingLiveDecisionOutput {
  const stateFeed = processStateFeed(input);
  const showLevels = shouldExposeLevels(stateFeed.transition.nextState);

  const liveDecision: TradingLiveDecision = {
    currentState: stateFeed.transition.nextState,
    currentHeadline: stateFeed.message.headline,
    currentBody: stateFeed.message.body,
    instrument: input.market.instrument,
    direction: input.setupCore.setup.direction,
    triggerLevel: showLevels
      ? (input.executionPlan.entryZone.triggerLevel ?? input.setupCore.setup.triggerLevel ?? null)
      : null,
    entryZoneLow: showLevels ? (input.executionPlan.entryZone.entryZoneLow ?? null) : null,
    entryZoneHigh: showLevels ? (input.executionPlan.entryZone.entryZoneHigh ?? null) : null,
    invalidationLevel: showLevels
      ? (input.executionPlan.invalidation.invalidationLevel ??
        input.setupCore.setup.invalidationLevel ??
        null)
      : null,
    targetZone: showLevels ? (input.executionPlan.tradePath.targetZone ?? null) : null,
    riskPct: showLevels ? (input.executionPlan.riskFraming.riskPct ?? null) : null,
    executionStatus: input.executionPlan.executionStatus.executionStatus,
    reasons: uniqueReasons(input.executionPlan.executionStatus.reasons),
    nextDisciplineStep: input.executionPlan.executionStatus.nextDisciplineStep ?? null,
    feed: stateFeed.memory.events,
    liveBaseline: input.liveBaseline ?? null,
    signal: input.signal ?? null,
  };

  return {
    liveDecision,
    memory: stateFeed.memory,
    transition: stateFeed.transition,
    message: stateFeed.message,
  };
}

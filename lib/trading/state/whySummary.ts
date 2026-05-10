import type {
  ComposeTradingLiveDecisionInput,
  TradingContextSummary,
  TradingLiveDecision,
  TradingWhySummary,
} from "./types";

function firstNonEmpty(values: Array<string | null | undefined>) {
  for (const value of values) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function canExplainWhyNow(
  input: ComposeTradingLiveDecisionInput,
  liveDecision: TradingLiveDecision,
) {
  if (liveDecision.currentState === "MARKET_CLOSED" || liveDecision.currentState === "SESSION_END") {
    return false;
  }

  if (input.setupCore.setup.type !== "none") {
    return true;
  }

  return (
    liveDecision.currentState === "TRADE_VALID" ||
    liveDecision.currentState === "SETUP_FORMING" ||
    liveDecision.currentState === "TRADE_ACTIVE" ||
    liveDecision.currentState === "BLOCKED" ||
    liveDecision.currentState === "TOO_LATE" ||
    liveDecision.currentState === "EXIT"
  );
}

function resolveWhyNow(args: {
  input: ComposeTradingLiveDecisionInput;
  liveDecision: TradingLiveDecision;
  contextSummary: TradingContextSummary;
}) {
  const { input, liveDecision, contextSummary } = args;

  if (!canExplainWhyNow(input, liveDecision)) {
    return null;
  }

  return firstNonEmpty([
    contextSummary.priorityReason,
    input.decisionCore.decision.reasons[0] ?? null,
    contextSummary.contextLabel,
    liveDecision.currentHeadline,
  ]);
}

function resolveWhyNotNow(args: {
  input: ComposeTradingLiveDecisionInput;
  liveDecision: TradingLiveDecision;
  contextSummary: TradingContextSummary;
}) {
  const { input, liveDecision, contextSummary } = args;

  if (liveDecision.executionStatus !== "allowed") {
    return firstNonEmpty([
      input.executionPlan.executionStatus.reasons[0] ?? null,
      input.executionPlan.executionStatus.nextDisciplineStep ?? null,
      liveDecision.currentBody ?? null,
      contextSummary.contextLabel,
    ]);
  }

  if (
    liveDecision.currentState === "WAIT" ||
    liveDecision.currentState === "TOO_LATE" ||
    liveDecision.currentState === "MARKET_CLOSED" ||
    liveDecision.currentState === "EXIT" ||
    liveDecision.currentState === "SESSION_END"
  ) {
    return firstNonEmpty([
      liveDecision.currentBody ?? null,
      input.decisionCore.decision.reasons[0] ?? null,
      contextSummary.contextLabel,
      input.executionPlan.executionStatus.nextDisciplineStep ?? null,
    ]);
  }

  return null;
}

export function composeTradingWhySummary(args: {
  input: ComposeTradingLiveDecisionInput;
  liveDecision: TradingLiveDecision;
  contextSummary: TradingContextSummary;
}): TradingWhySummary {
  return {
    whyNow: resolveWhyNow(args),
    whyNotNow: resolveWhyNotNow(args),
  };
}

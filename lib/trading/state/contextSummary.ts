import type { SessionState } from "@/lib/trading/market";
import type { SetupType } from "@/lib/trading/setups";

import type {
  ComposeTradingLiveDecisionInput,
  TradingContextSummary,
  TradingLiveDecision,
} from "./types";

function formatSessionLabel(session: SessionState): string {
  switch (session) {
    case "market_closed":
      return "Market closed";
    case "pre_market":
      return "Pre-market";
    case "london_open":
      return "London open";
    case "london_session":
      return "London session";
    case "london_ny_overlap":
      return "London / NY overlap";
    case "ny_open":
      return "New York open";
    case "midday_lull":
      return "Midday lull";
    case "late_us":
      return "Late US";
    case "asia_flow":
      return "Asia flow";
    case "weekend_drift":
      return "Weekend drift";
  }
}

function formatSetupLabel(type: SetupType): string {
  switch (type) {
    case "breakout_continuation":
      return "Breakout continuation";
    case "trend_pullback":
      return "Trend pullback";
    case "liquidity_sweep_reversal":
      return "Liquidity sweep reversal";
    case "range_reclaim":
      return "Range reclaim";
    case "failed_breakout":
      return "Failed breakout";
    case "none":
      return "No canonical setup";
  }
}

function firstReason(input: ComposeTradingLiveDecisionInput): string | null {
  return (
    input.executionPlan.executionStatus.reasons.find((reason) => reason.trim().length > 0) ?? null
  );
}

function resolveContextLabel(
  input: ComposeTradingLiveDecisionInput,
  liveDecision: TradingLiveDecision,
  sessionLabel: string,
): string {
  const restrictedReason = firstReason(input);

  if (!input.market.session.marketOpen) {
    return "Session unavailable";
  }

  if (
    liveDecision.executionStatus === "restricted" ||
    liveDecision.currentState === "BLOCKED"
  ) {
    return restrictedReason ?? "Execution restricted";
  }

  if (liveDecision.currentState === "TOO_LATE") {
    return "Entry window closed";
  }

  if (liveDecision.currentState === "EXIT") {
    return "Invalidation or exit condition reached";
  }

  if (
    input.market.liquidity.state === "liquidity_sweep" ||
    input.market.liquidity.state === "reclaim_after_sweep"
  ) {
    return `Liquidity sweep during ${sessionLabel.toLowerCase()}`;
  }

  if (
    input.setupCore.setup.type !== "none" &&
    (liveDecision.currentState === "SETUP_FORMING" ||
      (liveDecision.currentState === "WAIT" &&
        input.setupCore.opportunityWindow.state !== "closed"))
  ) {
    return `${formatSetupLabel(input.setupCore.setup.type)} building during ${sessionLabel.toLowerCase()}`;
  }

  if (liveDecision.currentState === "WAIT" && input.setupCore.setup.type === "none") {
    return `No canonical setup during ${sessionLabel.toLowerCase()}`;
  }

  if (liveDecision.currentState === "TRADE_VALID") {
    return `${formatSetupLabel(input.setupCore.setup.type)} aligned during ${sessionLabel.toLowerCase()}`;
  }

  if (liveDecision.currentState === "MARKET_CLOSED") {
    return "Session unavailable";
  }

  return `${sessionLabel} active`;
}

function resolvePriorityReason(
  input: ComposeTradingLiveDecisionInput,
  liveDecision: TradingLiveDecision,
): string | null {
  const restrictedReason = firstReason(input);

  if (!input.market.session.marketOpen || liveDecision.currentState === "MARKET_CLOSED") {
    return "Session unavailable";
  }

  if (
    liveDecision.executionStatus === "restricted" ||
    liveDecision.currentState === "BLOCKED"
  ) {
    return restrictedReason ?? "Outside session rules";
  }

  if (liveDecision.currentState === "TRADE_VALID") {
    return input.decisionCore.decision.reasons[0] ?? "Ready now";
  }

  if (liveDecision.currentState === "SETUP_FORMING") {
    return input.setupCore.setup.type === "none"
      ? "Structure still forming"
      : `${formatSetupLabel(input.setupCore.setup.type)} building`;
  }

  if (liveDecision.currentState === "TOO_LATE") {
    return "Entry window closed";
  }

  if (liveDecision.currentState === "EXIT") {
    return "Invalidation reached";
  }

  if (liveDecision.currentState === "WAIT") {
    if (input.setupCore.setup.type === "none") {
      return input.decisionCore.decision.reasons[0] ?? "No canonical setup qualified";
    }

    return input.decisionCore.decision.reasons[0] ?? `${formatSetupLabel(input.setupCore.setup.type)} forming`;
  }

  return null;
}

export function composeTradingContextSummary(args: {
  input: ComposeTradingLiveDecisionInput;
  liveDecision: TradingLiveDecision;
}): TradingContextSummary {
  const { input, liveDecision } = args;
  const sessionLabel = formatSessionLabel(input.market.session.session);
  const coverage = input.scannerCoverage ?? {
    status: "live_only" as const,
    label: "Live-only",
    detail: "Visible via live scanner only. Research coverage is not audited yet.",
    source: "scanner_default" as const,
  };

  return {
    sessionLabel,
    contextLabel: resolveContextLabel(input, liveDecision, sessionLabel),
    marketOpen: input.market.session.marketOpen,
    priorityReason: resolvePriorityReason(input, liveDecision),
    coverageStatus: coverage.status,
    coverageLabel: coverage.label,
    coverageReason: coverage.detail,
    coverageSource: coverage.source,
  };
}

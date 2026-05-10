import type { SessionState } from "@/lib/trading/market";
import type { StateTransitionInput, StateTransitionOutput } from "./types";

const EVENT_PRIORITY: Record<StateTransitionOutput["nextState"], number> = {
  MARKET_CLOSED: 10,
  SESSION_OPEN: 30,
  WAIT: 20,
  SETUP_FORMING: 45,
  TRADE_VALID: 90,
  TRADE_ACTIVE: 95,
  BLOCKED: 85,
  TOO_LATE: 60,
  EXIT: 92,
  SESSION_END: 35,
};

function sessionLabel(session: SessionState): string {
  switch (session) {
    case "pre_market":
      return "pre-market";
    case "london_open":
      return "London open";
    case "london_session":
      return "London session";
    case "london_ny_overlap":
      return "London-New York overlap";
    case "ny_open":
      return "New York open";
    case "midday_lull":
      return "midday lull";
    case "late_us":
      return "late US session";
    case "asia_flow":
      return "Asia flow";
    case "weekend_drift":
      return "weekend drift";
    case "market_closed":
      return "closed market";
  }
}

function deriveNextState(input: StateTransitionInput): StateTransitionOutput["nextState"] {
  const technicalState = input.decisionCore.decision.currentState;
  const executionStatus = input.executionPlan.executionStatus.executionStatus;

  if (!input.market.session.marketOpen) {
    if (!["MARKET_CLOSED", "SESSION_END"].includes(input.previousState)) {
      return "SESSION_END";
    }

    return "MARKET_CLOSED";
  }

  if (input.previousState === "MARKET_CLOSED" || input.previousState === "SESSION_END") {
    return "SESSION_OPEN";
  }

  if (
    ["TRADE_VALID", "TRADE_ACTIVE"].includes(technicalState) &&
    executionStatus === "restricted"
  ) {
    return "BLOCKED";
  }

  return technicalState;
}

function deriveReason(
  input: StateTransitionInput,
  nextState: StateTransitionOutput["nextState"],
): string {
  switch (nextState) {
    case "MARKET_CLOSED":
      return "Market is closed and no active session is available.";
    case "SESSION_OPEN":
      return `Market open for the ${sessionLabel(input.market.session.session)}.`;
    case "WAIT":
      return "Conditions are not ready for execution yet.";
    case "SETUP_FORMING":
      return "A canonical setup is forming but still needs confirmation.";
    case "TRADE_VALID":
      return "Technical state and operational rules align for live execution.";
    case "TRADE_ACTIVE":
      return "Execution is active and the trade plan is live.";
    case "BLOCKED":
      return (
        input.executionPlan.executionStatus.reasons[0] ??
        "Execution is restricted by playbook, behavior, or risk controls."
      );
    case "TOO_LATE":
      return "The opportunity has degraded beyond the preferred entry window.";
    case "EXIT":
      return "The setup has invalidated and the trade should be exited.";
    case "SESSION_END":
      return "The active session closed and the current opportunity cycle ended.";
  }
}

export function resolveStateTransition(
  input: StateTransitionInput,
): StateTransitionOutput {
  const nextState = deriveNextState(input);

  return {
    previousState: input.previousState,
    nextState,
    transitionReason: deriveReason(input, nextState),
    eventPriority: EVENT_PRIORITY[nextState],
  };
}

import type { DecisionStabilitySource } from "./decisionStability";
import type { DailyDecisionView } from "./dailyDecisionViewModel";

type BadgeTone = "neutral" | "good" | "warn" | "bad";

export type AutonomyDecisionView = {
  branch: DailyDecisionView["branch"];
  stateReason: DailyDecisionView["stateReason"];
  action: DailyDecisionView["action"];
  allowExecution: boolean;
  headline: string;
  rationale: string;
  executionTempo: DailyDecisionView["executionTempo"];
  stabilitySource: DecisionStabilitySource;
  operationalStateLabel: string;
  statusSentence: string;
  topStatusBadgeLabel: string;
  topStatusBadgeTone: BadgeTone;
  actionNeededBadgeLabel: string | null;
  actionNeededBadgeTone: BadgeTone | null;
  capitalProtectionBadgeLabel: string;
  capitalProtectionBadgeTone: BadgeTone;
  capitalProtectionExplanation: string;
  nextEvaluationAt: string | null;
};

export type BuildAutonomyDecisionViewInput = {
  decisionView: DailyDecisionView & { stabilitySource: DecisionStabilitySource };
  precedenceOverride?: unknown;
  actionGateStatus?: unknown;
  nextEvaluationAt?: unknown;
};

function toText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function isBlockedActionGate(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "blocked" || text === "block";
}

function buildHeldStateView(
  decisionView: BuildAutonomyDecisionViewInput["decisionView"],
  nextEvaluationAt: string | null,
): AutonomyDecisionView {
  return {
    branch: decisionView.branch,
    stateReason: decisionView.stateReason,
    action: decisionView.action,
    allowExecution: decisionView.allowExecution,
    headline: decisionView.headline,
    rationale: decisionView.rationale,
    executionTempo: decisionView.executionTempo,
    stabilitySource: decisionView.stabilitySource,
    operationalStateLabel: "Stabilizing",
    statusSentence:
      "Autonomy is holding the current semantic state until the next evaluation confirms the transition.",
    topStatusBadgeLabel: "Stabilizing",
    topStatusBadgeTone: "warn",
    actionNeededBadgeLabel: null,
    actionNeededBadgeTone: null,
    capitalProtectionBadgeLabel: "Steady",
    capitalProtectionBadgeTone: "warn",
    capitalProtectionExplanation:
      "Capital protection is holding steady until the current transition is confirmed by another evaluation.",
    nextEvaluationAt,
  };
}

export function buildAutonomyDecisionView(
  args: BuildAutonomyDecisionViewInput,
): AutonomyDecisionView {
  const { decisionView } = args;
  const nextEvaluationAt = toText(args.nextEvaluationAt);
  const precedenceOverride = toText(args.precedenceOverride);
  const actionGateBlocked = isBlockedActionGate(args.actionGateStatus);

  if (decisionView.stabilitySource === "held") {
    return buildHeldStateView(decisionView, nextEvaluationAt);
  }

  if (decisionView.stateReason === "no_plan") {
    return {
      branch: decisionView.branch,
      stateReason: decisionView.stateReason,
      action: decisionView.action,
      allowExecution: false,
      headline: decisionView.headline,
      rationale: decisionView.rationale,
      executionTempo: decisionView.executionTempo,
      stabilitySource: decisionView.stabilitySource,
      operationalStateLabel: "Setup required",
      statusSentence: "Autonomy is waiting for an active plan before enabling capital automation.",
      topStatusBadgeLabel: "Setup",
      topStatusBadgeTone: "warn",
      actionNeededBadgeLabel: "Action needed",
      actionNeededBadgeTone: "warn",
      capitalProtectionBadgeLabel: "Blocked",
      capitalProtectionBadgeTone: "warn",
      capitalProtectionExplanation:
        "Capital protection stays defensive until an active plan is in place.",
      nextEvaluationAt,
    };
  }

  if (decisionView.stateReason === "no_holdings") {
    return {
      branch: decisionView.branch,
      stateReason: decisionView.stateReason,
      action: decisionView.action,
      allowExecution: false,
      headline: decisionView.headline,
      rationale: decisionView.rationale,
      executionTempo: decisionView.executionTempo,
      stabilitySource: decisionView.stabilitySource,
      operationalStateLabel: "Build core",
      statusSentence:
        "Autonomy is ready to monitor once the initial holdings base is in place.",
      topStatusBadgeLabel: "Build core",
      topStatusBadgeTone: "warn",
      actionNeededBadgeLabel: "Action needed",
      actionNeededBadgeTone: "warn",
      capitalProtectionBadgeLabel: "Defensive",
      capitalProtectionBadgeTone: "warn",
      capitalProtectionExplanation:
        "Capital protection remains defensive until core holdings exist and can be monitored.",
      nextEvaluationAt,
    };
  }

  if (decisionView.stateReason === "starter_warmup") {
    return {
      branch: decisionView.branch,
      stateReason: decisionView.stateReason,
      action: decisionView.action,
      allowExecution: false,
      headline: decisionView.headline,
      rationale: decisionView.rationale,
      executionTempo: decisionView.executionTempo,
      stabilitySource: decisionView.stabilitySource,
      operationalStateLabel: "Observing",
      statusSentence:
        "Autonomy is observing the starter allocation while fills and early conditions settle.",
      topStatusBadgeLabel: "Observe",
      topStatusBadgeTone: "good",
      actionNeededBadgeLabel: null,
      actionNeededBadgeTone: null,
      capitalProtectionBadgeLabel: "Settle",
      capitalProtectionBadgeTone: "good",
      capitalProtectionExplanation:
        "Capital protection is holding the initial portfolio steady during starter warmup.",
      nextEvaluationAt,
    };
  }

  if (decisionView.stateReason === "fatal_fallback") {
    return {
      branch: decisionView.branch,
      stateReason: decisionView.stateReason,
      action: decisionView.action,
      allowExecution: false,
      headline: decisionView.headline,
      rationale: decisionView.rationale,
      executionTempo: decisionView.executionTempo,
      stabilitySource: decisionView.stabilitySource,
      operationalStateLabel: "Paused",
      statusSentence:
        "Autonomy is paused while the decision system recovers from fallback mode.",
      topStatusBadgeLabel: "Paused",
      topStatusBadgeTone: "warn",
      actionNeededBadgeLabel: "Recovery",
      actionNeededBadgeTone: "warn",
      capitalProtectionBadgeLabel: "Protected",
      capitalProtectionBadgeTone: "warn",
      capitalProtectionExplanation:
        "Capital protection is keeping risk steady until the decision system recovers.",
      nextEvaluationAt,
    };
  }

  if (decisionView.stateReason === "low_data_quality") {
    return {
      branch: decisionView.branch,
      stateReason: decisionView.stateReason,
      action: decisionView.action,
      allowExecution: false,
      headline: decisionView.headline,
      rationale: decisionView.rationale,
      executionTempo: decisionView.executionTempo,
      stabilitySource: decisionView.stabilitySource,
      operationalStateLabel: "Repairing data",
      statusSentence:
        "Autonomy is limiting execution until pricing and valuation quality recover.",
      topStatusBadgeLabel: "Fix data",
      topStatusBadgeTone: "warn",
      actionNeededBadgeLabel: "Action needed",
      actionNeededBadgeTone: "warn",
      capitalProtectionBadgeLabel: "Constrained",
      capitalProtectionBadgeTone: "warn",
      capitalProtectionExplanation:
        "Capital protection stays defensive while pricing and valuation quality are incomplete.",
      nextEvaluationAt,
    };
  }

  const constrained = !decisionView.allowExecution || precedenceOverride === "capital_protection" || actionGateBlocked;
  const operationalStateLabel =
    decisionView.action === "SELL"
      ? "Protecting"
      : decisionView.action === "BUY"
        ? "Advancing"
        : constrained
          ? "Holding"
          : "Monitoring";

  const topStatusBadgeLabel =
    decisionView.action === "SELL"
      ? "Protecting"
      : constrained
        ? "Caution"
        : "On track";
  const topStatusBadgeTone: BadgeTone =
    decisionView.action === "SELL"
      ? "warn"
      : constrained
        ? "warn"
        : "good";

  const actionNeededBadgeLabel = constrained && decisionView.action !== "SELL" ? "Action needed" : null;
  const actionNeededBadgeTone: BadgeTone | null = actionNeededBadgeLabel ? "warn" : null;

  const statusSentence =
    decisionView.action === "SELL"
      ? "Autonomy is prioritising protection and measured de-risking before new growth."
      : constrained
        ? "Autonomy is holding a constrained posture until the active gate or protection rule clears."
        : decisionView.action === "BUY"
          ? "Autonomy is aligned with the current growth posture and monitoring for the next decision window."
          : "Autonomy is monitoring the portfolio under a disciplined hold posture.";

  const capitalProtectionBadgeLabel =
    decisionView.action === "SELL"
      ? "Protect"
      : constrained
        ? "Guarded"
        : "Aligned";
  const capitalProtectionBadgeTone: BadgeTone =
    decisionView.action === "SELL"
      ? "warn"
      : constrained
        ? "warn"
        : "good";

  const capitalProtectionExplanation =
    precedenceOverride === "capital_protection"
      ? "Capital protection is moderating the next move even though the portfolio remains operational."
      : actionGateBlocked || (!decisionView.allowExecution && decisionView.action !== "SELL")
        ? "Capital protection is preserving discipline until the active gate clears."
        : decisionView.action === "SELL"
          ? "Capital protection is actively reducing risk before any new growth decision."
          : decisionView.action === "BUY"
            ? "Capital protection supports measured growth under the current posture."
            : "Capital protection is maintaining discipline while conditions are monitored.";

  return {
    branch: decisionView.branch,
    stateReason: decisionView.stateReason,
    action: decisionView.action,
    allowExecution: decisionView.allowExecution,
    headline: decisionView.headline,
    rationale: decisionView.rationale,
    executionTempo: decisionView.executionTempo,
    stabilitySource: decisionView.stabilitySource,
    operationalStateLabel,
    statusSentence,
    topStatusBadgeLabel,
    topStatusBadgeTone,
    actionNeededBadgeLabel,
    actionNeededBadgeTone,
    capitalProtectionBadgeLabel,
    capitalProtectionBadgeTone,
    capitalProtectionExplanation,
    nextEvaluationAt,
  };
}

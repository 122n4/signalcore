import type { DecisionEnvelope } from "../types";

type LegacyNode = Record<string, unknown>;

export type LegacyDailyDecisionNode = LegacyNode & {
  asset?: string | null;
  decision?: string | null;
  legacy_action_type?: string | null;
  confidence?: number | null;
  confidence_pct?: number | null;
  expected_move?: number | null;
  expected_value?: number | null;
  recommended_position_pct?: number | null;
  score?: number | null;
  regime?: string | null;
  risk_level?: string | null;
  reason_codes?: string[] | null;
};

export type LegacyOperationalActionNode = LegacyNode & {
  category?: string | null;
  brokerInstruction?: string | null;
  capitalImpact?: string | null;
  riskImpact?: string | null;
  expectedOutcomeWindow?: string | null;
};

export type LegacyNextBestActionNode = LegacyNode & {
  type?: string | null;
  instruction?: string | null;
  summary?: string | null;
  reason?: string | null;
  cta?: {
    label?: string | null;
    action?: string | null;
    href?: string | null;
  } | null;
  source?: string | null;
  engineVersion?: string | null;
  rawAction?: string | null;
  nextEvaluationAt?: string | null;
  asOf?: string | null;
};

export type LegacyScoresNode = LegacyNode & {
  autopilotScore?: number | null;
  decisionConfidence?: number | null;
  riskPressure?: number | null;
  planCoherence?: number | null;
};

export type LegacyDecisionProjectionResult = {
  daily: LegacyNode;
  derived: LegacyNode | null;
};

function safeObj<T extends LegacyNode>(value: T | null | undefined): T | null {
  return value && typeof value === "object" ? value : null;
}

function toNumOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function normalizeArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((x) => String(x || "").trim()).filter(Boolean);
}

function normalizeCta(
  cta: DecisionEnvelope["workflowDecision"]["cta"] | LegacyNextBestActionNode["cta"] | undefined,
) {
  if (!cta || typeof cta !== "object") return null;
  return {
    label: cta.label == null ? null : String(cta.label),
    action: cta.action == null ? null : String(cta.action),
    href: cta.href == null ? null : String(cta.href),
  };
}

function deriveLegacyActionTypeFromDecision(decision: DecisionEnvelope["portfolioStance"]["decision"]) {
  if (decision === "BUY") return "ADD";
  if (decision === "REDUCE") return "REDUCE";
  if (decision === "AVOID") return "PAUSE";
  return "HOLD";
}

export function projectLegacyDailyDecision(args: {
  envelope: DecisionEnvelope;
  current?: LegacyDailyDecisionNode | null;
}): LegacyDailyDecisionNode {
  const current = safeObj(args.current);
  const stance = args.envelope.portfolioStance;
  const confidencePct = stance.confidencePct ?? toNumOrNull(current?.confidence_pct) ?? 0;
  const existingLegacyActionType = String(current?.legacy_action_type || "").trim().toUpperCase();
  const legacyActionType =
    (stance.legacyActionType ?? existingLegacyActionType) ||
    deriveLegacyActionTypeFromDecision(stance.decision);

  return {
    ...(current ?? {}),
    asset: stance.asset ?? (current?.asset ?? null),
    decision: stance.decision,
    legacy_action_type: legacyActionType,
    confidence_pct: confidencePct,
    confidence:
      stance.confidencePct != null
        ? round4(stance.confidencePct / 100)
        : toNumOrNull(current?.confidence) ?? round4(confidencePct / 100),
    expected_move: stance.expectedMovePct ?? toNumOrNull(current?.expected_move) ?? 0,
    expected_value: stance.expectedValue ?? toNumOrNull(current?.expected_value) ?? 0,
    recommended_position_pct:
      stance.recommendedPositionPct ?? toNumOrNull(current?.recommended_position_pct) ?? 0,
    score: stance.score ?? toNumOrNull(current?.score) ?? 0,
    regime: stance.regime ?? (current?.regime == null ? null : String(current.regime)),
    risk_level: stance.riskLevel ?? (current?.risk_level == null ? null : String(current.risk_level)),
    reason_codes: stance.reasonCodes.length ? [...stance.reasonCodes] : normalizeArray(current?.reason_codes),
  };
}

export function projectLegacyOperationalAction(args: {
  envelope: DecisionEnvelope;
  current?: LegacyOperationalActionNode | null;
}): LegacyOperationalActionNode {
  const current = safeObj(args.current);
  const instruction = args.envelope.executionInstruction;

  return {
    ...(current ?? {}),
    category: instruction.category,
    brokerInstruction: instruction.brokerInstruction,
    capitalImpact: instruction.capitalImpact,
    riskImpact: instruction.riskImpact,
    expectedOutcomeWindow: instruction.expectedOutcomeWindow,
  };
}

export function projectLegacyNextBestAction(args: {
  envelope: DecisionEnvelope;
  current?: LegacyNextBestActionNode | null;
}): LegacyNextBestActionNode {
  const current = safeObj(args.current);
  const workflow = args.envelope.workflowDecision;

  return {
    ...(current ?? {}),
    type: workflow.type,
    instruction: workflow.instruction,
    summary: workflow.summary,
    reason: workflow.reason,
    cta: normalizeCta(workflow.cta ?? current?.cta),
    source: workflow.source,
    engineVersion: workflow.engineVersion,
    rawAction: workflow.rawAction ?? (current?.rawAction == null ? null : String(current.rawAction)),
    nextEvaluationAt:
      workflow.nextEvaluationAt ?? (current?.nextEvaluationAt == null ? null : String(current.nextEvaluationAt)),
    asOf: current?.asOf == null ? args.envelope.asOf : String(current.asOf),
  };
}

export function projectLegacyScores(args: {
  envelope: DecisionEnvelope;
  current?: LegacyScoresNode | null;
}): LegacyScoresNode {
  const current = safeObj(args.current);
  const scores = args.envelope.scores;

  return {
    ...(current ?? {}),
    autopilotScore: scores.autopilotScore ?? toNumOrNull(current?.autopilotScore),
    decisionConfidence:
      scores.decisionConfidencePct ?? toNumOrNull(current?.decisionConfidence),
    riskPressure: scores.riskPressure ?? toNumOrNull(current?.riskPressure),
    planCoherence: scores.planCoherence ?? toNumOrNull(current?.planCoherence),
  };
}

export function projectLegacyDecisionFields(args: {
  envelope: DecisionEnvelope;
  daily: LegacyNode;
  derived?: LegacyNode | null;
  includeNextBestAction?: boolean;
  includeScores?: boolean;
}): LegacyDecisionProjectionResult {
  const includeNextBestAction = args.includeNextBestAction === true;
  const includeScores = args.includeScores === true;
  const daily = safeObj(args.daily) ?? {};
  const derived = args.derived == null ? null : safeObj(args.derived) ?? {};

  const projectedDailyDecision = projectLegacyDailyDecision({
    envelope: args.envelope,
    current: safeObj(daily.daily_decision as LegacyDailyDecisionNode | undefined),
  });
  const projectedOperationalAction = projectLegacyOperationalAction({
    envelope: args.envelope,
    current: safeObj(daily.operationalAction as LegacyOperationalActionNode | undefined),
  });

  const nextBestAction = includeNextBestAction
    ? projectLegacyNextBestAction({
        envelope: args.envelope,
        current: safeObj(daily.nextBestAction as LegacyNextBestActionNode | undefined),
      })
    : daily.nextBestAction;

  const scores = includeScores
    ? projectLegacyScores({
        envelope: args.envelope,
        current: safeObj(daily.scores as LegacyScoresNode | undefined),
      })
    : daily.scores;

  return {
    daily: {
      ...daily,
      daily_decision: projectedDailyDecision,
      operationalAction: projectedOperationalAction,
      ...(includeNextBestAction ? { nextBestAction } : {}),
      ...(includeScores ? { scores } : {}),
    },
    derived:
      derived == null
        ? null
        : {
            ...derived,
            daily_decision: projectedDailyDecision,
            operationalAction: projectedOperationalAction,
          },
  };
}

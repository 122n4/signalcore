import type { DecisionGovernanceOutput } from "@/lib/engine/decisionGovernance";
import type { DailyBundleV4 } from "@/lib/engine/v4/types";
import type { Diagnostics } from "@/lib/signalcore/engineV3";
import type { OperationalAction } from "@/lib/signalcore/dailyEnhancements";
import type { RiskPolicyEvaluation } from "@/lib/signalcore/riskPolicy";
import { resolveDecisionPrecedence, type DecisionActionGateInput } from "./precedence";
import type {
  DecisionEnvelope,
  DecisionEnvelopeBranch,
  DecisionSeverity,
  DecisionSupport,
  DecisionWhy,
  ExecutionInstruction,
  ExecutionInstructionCategory,
  PortfolioStance,
  PortfolioStanceDecision,
  PortfolioStanceLegacyActionType,
  WorkflowActionType,
  WorkflowDecision,
} from "./types";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import {
  composeTradingWatchlist,
  composeTradingWatchlistEntry,
  composeTradingWatchlistSections,
  resolveTradingWatchlistFocus,
  sortTradingWatchlist,
  summarizeTradingWatchlistCoverage,
  type ComposeTradingLiveDecisionInput,
} from "@/lib/trading/state";
import { applyTradingLiveSnapshotDiscipline } from "@/lib/trading/liveSnapshotDiscipline";

export type ComposeDecisionEnvelopeInput = {
  mode: AutopilotMode;
  asOf: string;
  branch: DecisionEnvelopeBranch;
  branchReason: string | null;
  nextBestAction: {
    type: WorkflowActionType | string;
    instruction: string;
    summary: string;
    reason: string;
    cta: {
      label: string;
      action: string;
      href?: string | null;
    } | null;
    source: string | null;
    engineVersion: string | null;
    rawAction: string | null;
  } | null;
  whyNow: {
    driverKey: string | null;
    driverTitle: string | null;
    severity: string | null;
    rationale: string;
    evidence: string[];
    expectedOutcome: string;
    counterfactual: string;
  } | null;
  operationalAction: OperationalAction | null;
  decisionGovernance: DecisionGovernanceOutput | null;
  actionGate: DecisionActionGateInput | null;
  riskPolicyEval: RiskPolicyEvaluation | null;
  capitalStatus: {
    posture: string | null;
    planAlignment: string | null;
    riskPressure: number | null;
    nextEvaluationAt: string | null;
  } | null;
  decisionScores: {
    autopilotScore: number | null;
    decisionConfidence: number | null;
    riskPressure: number | null;
    planCoherence: number | null;
  } | null;
  performance?: {
    hasData?: boolean | null;
    trackedDays?: number | null;
    alpha30dPct?: number | null;
  } | null;
  profileBenchmark?: {
    score?: number | null;
    tier?: string | null;
    percentileLabel?: string | null;
    summary?: string | null;
  } | null;
  executionCoach?: {
    stableDays?: number | null;
    unstableDays?: number | null;
    todayRule?: string | null;
    topPatterns?: Array<{ title?: string | null; severity?: string | null; nextStep?: string | null }> | null;
  } | null;
  executionScore?: {
    score?: number | null;
  } | null;
  diagnostics: Diagnostics | null;
  engineV4: DailyBundleV4 | null;
  tradingLiveInput?: ComposeTradingLiveDecisionInput | null;
  tradingWatchlistInputs?: ComposeTradingLiveDecisionInput[] | null;
};

function toNumOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampPct(value: unknown): number | null {
  const n = toNumOrNull(value);
  if (n == null) return null;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

function confidence01ToPct(value: unknown): number | null {
  const n = toNumOrNull(value);
  if (n == null) return null;
  return clampPct(n * 100);
}

function normalizeSeverity(value: unknown): DecisionSeverity | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "high") return "high";
  if (s === "medium" || s === "med" || s === "caution") return "medium";
  return "low";
}

function normalizeWorkflowActionType(value: unknown): WorkflowActionType {
  const s = String(value ?? "").trim().toUpperCase();
  if (
    s === "EXECUTE_BROKER" ||
    s === "CLOSE_DAY" ||
    s === "ENTER" ||
    s === "ADD" ||
    s === "REDUCE" ||
    s === "EXIT" ||
    s === "HOLD" ||
    s === "PAUSE"
  ) {
    return s as WorkflowActionType;
  }
  return "HOLD";
}

function normalizeTimingState(args: {
  allowExecution: boolean;
  workflowType: WorkflowActionType;
  precedenceOverride: string;
}) {
  if (!args.allowExecution) return "closed" as const;
  if (args.workflowType === "HOLD" || args.workflowType === "PAUSE") return "early" as const;
  if (args.workflowType === "REDUCE" || args.workflowType === "EXIT") return "optimal" as const;
  if (args.precedenceOverride !== "none") return "late" as const;
  return "optimal" as const;
}

function isLowDataQualityLeakKey(value: unknown) {
  const key = String(value ?? "").trim().toLowerCase();
  return (
    key === "pricing_low" ||
    key === "valuation_zero" ||
    key === "pricing_stale_high" ||
    key === "pricing_stale_med" ||
    key === "pricing_missing" ||
    key === "valuation_missing"
  );
}

function isHardLowDataQualityLeakKey(key: unknown) {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (!isLowDataQualityLeakKey(normalized)) return false;
  return true;
}

function normalizePortfolioStanceDecision(value: unknown): PortfolioStanceDecision {
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "BUY" || s === "REDUCE" || s === "HOLD" || s === "AVOID") {
    return s as PortfolioStanceDecision;
  }
  return "HOLD";
}

function normalizePortfolioStanceLegacyActionType(value: unknown): PortfolioStanceLegacyActionType {
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "ADD" || s === "REDUCE" || s === "HOLD" || s === "PAUSE") {
    return s as PortfolioStanceLegacyActionType;
  }
  return "HOLD";
}

function normalizeWorkflowSource(
  value: unknown,
  branch: DecisionEnvelopeBranch,
): WorkflowDecision["source"] {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "engine_v4") return "engine_v4";
  if (s === "engine_v3") return "engine_v3";
  if (s === "fallback") return "fallback";
  return branch === "success" ? "synthetic" : "fallback";
}

function normalizePortfolioSource(
  hasDecisionGovernance: boolean,
  branch: DecisionEnvelopeBranch,
): PortfolioStance["source"] {
  if (!hasDecisionGovernance) return "synthetic";
  return branch === "success" ? "decision_governance" : "fallback";
}

function normalizeExecutionSource(
  hasOperationalAction: boolean,
  branch: DecisionEnvelopeBranch,
): ExecutionInstruction["source"] {
  if (hasOperationalAction) return "daily_enhancements";
  return branch === "success" ? "synthetic" : "fallback";
}

function buildWorkflowDecision(input: ComposeDecisionEnvelopeInput): WorkflowDecision {
  const raw = input.nextBestAction;
  const v4Action = input.engineV4?.decision?.nextBestAction;
  const source = normalizeWorkflowSource(raw?.source, input.branch);

  if (!raw && input.branch !== "success") {
    return {
      type: "PAUSE",
      instruction: "Pause until the daily bundle recovers",
      summary: input.branchReason || "Fallback branch active. Do not execute new capital changes yet.",
      reason: input.branchReason || "The daily bundle fell back to a degraded branch and requires review before execution.",
      bestActionSummary: input.branchReason || "Fallback branch active. Do not execute new capital changes yet.",
      setupLabel: "Fallback control state",
      timingState: null,
      cta: null,
      source: "fallback",
      engineVersion: input.engineV4?.engineVersion ?? null,
      rawAction: null,
      nextEvaluationAt: input.capitalStatus?.nextEvaluationAt ?? null,
      loopStage: input.engineV4?.loopStage ?? null,
      priorityClass: input.engineV4?.decision?.priorityClass ?? null,
      aggression: input.engineV4?.decision?.aggression ?? null,
    };
  }

  return {
    type: normalizeWorkflowActionType(raw?.type),
    instruction:
      String(raw?.instruction || v4Action?.title || "").trim() || "Review today's capital posture",
    summary:
      String(raw?.summary || v4Action?.desc || "").trim() ||
      "No explicit workflow summary is available for the current cycle.",
    reason:
      String(raw?.reason || input.whyNow?.rationale || input.engineV4?.decision?.whyNow || "").trim() ||
      "No explicit workflow rationale is available for the current cycle.",
    bestActionSummary:
      String(raw?.summary || v4Action?.desc || raw?.instruction || v4Action?.title || "").trim() || null,
    setupLabel:
      String(raw?.summary || v4Action?.title || raw?.instruction || "").trim() || null,
    timingState: null,
    cta: raw?.cta
      ? {
          label: String(raw.cta.label || "").trim(),
          action: String(raw.cta.action || "").trim(),
          href: raw.cta.href == null ? null : String(raw.cta.href),
        }
      : v4Action?.cta
        ? {
            label: String(v4Action.cta.label || "").trim(),
            action: String(v4Action.cta.action || "").trim(),
            href: v4Action.cta.href == null ? null : String(v4Action.cta.href),
          }
        : null,
    source,
    engineVersion: raw?.engineVersion ?? input.engineV4?.engineVersion ?? null,
    rawAction: raw?.rawAction ?? (raw?.cta ? String(raw.cta.action || "").trim() || null : null),
    nextEvaluationAt: input.capitalStatus?.nextEvaluationAt ?? null,
    loopStage: input.engineV4?.loopStage ?? null,
    priorityClass: input.engineV4?.decision?.priorityClass ?? null,
    aggression: input.engineV4?.decision?.aggression ?? null,
  };
}

function buildPortfolioStance(input: ComposeDecisionEnvelopeInput): PortfolioStance | null {
  const dailyDecision = input.decisionGovernance?.daily_decision;
  if (!dailyDecision) return null;

  return {
    asset: dailyDecision.asset ?? null,
    decision: normalizePortfolioStanceDecision(dailyDecision.decision),
    legacyActionType: normalizePortfolioStanceLegacyActionType(dailyDecision.legacy_action_type),
    confidencePct:
      clampPct(dailyDecision.confidence_pct) ??
      confidence01ToPct(dailyDecision.confidence) ??
      confidence01ToPct(input.decisionGovernance?.decision_confidence),
    expectedMovePct: toNumOrNull(dailyDecision.expected_move),
    expectedValue: toNumOrNull(dailyDecision.expected_value),
    recommendedPositionPct: toNumOrNull(dailyDecision.recommended_position_pct),
    score: toNumOrNull(dailyDecision.score),
    regime: dailyDecision.regime == null ? null : String(dailyDecision.regime),
    riskLevel: dailyDecision.risk_level == null ? null : String(dailyDecision.risk_level),
    reasonCodes: Array.isArray(dailyDecision.reason_codes)
      ? dailyDecision.reason_codes.map((x) => String(x || "").trim()).filter(Boolean)
      : [],
    source: normalizePortfolioSource(Boolean(input.decisionGovernance), input.branch),
  };
}

function pickSyntheticExecutionCategory(
  workflowType: WorkflowActionType,
  branch: DecisionEnvelopeBranch,
): ExecutionInstructionCategory {
  if (branch !== "success") return "PREPARE";
  if (workflowType === "ADD" || workflowType === "ENTER" || workflowType === "EXECUTE_BROKER") return "DEPLOY";
  if (workflowType === "REDUCE" || workflowType === "EXIT" || workflowType === "PAUSE") return "PROTECT";
  if (workflowType === "CLOSE_DAY") return "DISCIPLINE";
  return "PREPARE";
}

function buildExecutionInstruction(
  input: ComposeDecisionEnvelopeInput,
  workflowDecision: WorkflowDecision,
): ExecutionInstruction | null {
  const op = input.operationalAction;
  if (!op && input.branch === "success") {
    const category = pickSyntheticExecutionCategory(workflowDecision.type, input.branch);
    return {
      category,
      brokerInstruction: "Review the workflow decision before placing any broker order.",
      capitalImpact: "No explicit capital adjustment has been composed yet.",
      riskImpact: "Risk stays unchanged until a concrete execution path is confirmed.",
      expectedOutcomeWindow: "Next evaluation window",
      allowExecution: input.actionGate?.allowExecution !== false,
      source: "synthetic",
      derivedFromWorkflowType: workflowDecision.type,
    };
  }
  if (!op) return null;

  return {
    category: op.category,
    brokerInstruction: String(op.brokerInstruction || "").trim(),
    capitalImpact: String(op.capitalImpact || "").trim(),
    riskImpact: String(op.riskImpact || "").trim(),
    expectedOutcomeWindow: String(op.expectedOutcomeWindow || "").trim(),
    allowExecution: input.actionGate?.allowExecution !== false,
    source: normalizeExecutionSource(true, input.branch),
    derivedFromWorkflowType: workflowDecision.type,
  };
}

function buildWhy(
  input: ComposeDecisionEnvelopeInput,
  workflowDecision: WorkflowDecision,
  topLeak: { key: string | null; title: string | null; severity: DecisionSeverity | null },
): DecisionWhy {
  const evidence = Array.isArray(input.whyNow?.evidence)
    ? input.whyNow!.evidence.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  return {
    headline:
      String(input.whyNow?.driverTitle || "").trim() ||
      String(topLeak.title || "").trim() ||
      null,
    rationale:
      String(input.whyNow?.rationale || workflowDecision.reason || "").trim() ||
      "No explicit rationale was composed for the current capital decision.",
    evidence,
    expectedOutcome:
      String(input.whyNow?.expectedOutcome || "").trim() ||
      null,
    counterfactual:
      String(input.whyNow?.counterfactual || "").trim() ||
      null,
  };
}

function buildScores(input: ComposeDecisionEnvelopeInput) {
  const v4Scores = input.engineV4?.scores;
  const v4Decision = input.engineV4?.decision;
  const governanceDecision = input.decisionGovernance?.daily_decision;

  return {
    autopilotScore:
      clampPct(input.decisionScores?.autopilotScore) ??
      clampPct(v4Scores?.autopilotScore),
    decisionConfidencePct:
      clampPct(input.decisionScores?.decisionConfidence) ??
      clampPct(governanceDecision?.confidence_pct) ??
      confidence01ToPct(input.decisionGovernance?.decision_confidence) ??
      clampPct(v4Scores?.confidenceScore),
    riskPressure:
      clampPct(input.decisionScores?.riskPressure) ??
      clampPct(input.capitalStatus?.riskPressure),
    planCoherence:
      clampPct(input.decisionScores?.planCoherence),
    workflowConfidencePct:
      confidence01ToPct(v4Decision?.confidence) ??
      clampPct(v4Scores?.confidenceScore),
    portfolioConfidencePct:
      clampPct(governanceDecision?.confidence_pct) ??
      confidence01ToPct(input.decisionGovernance?.decision_confidence),
    dataQualityScore: clampPct(v4Scores?.dataQualityScore),
    proofQualityScore: clampPct(v4Scores?.proofQualityScore),
    reliabilityScore: clampPct(v4Scores?.reliabilityScore),
  };
}

export function composeDecisionEnvelope(
  input: ComposeDecisionEnvelopeInput,
): DecisionEnvelope {
  const topLeakRaw = input.diagnostics?.riskLeaks?.[0];
  const pricingCoveragePct = clampPct(input.diagnostics?.pricing?.coveragePct);
  const topLeak = {
    key: topLeakRaw?.key ?? input.actionGate?.topLeakKey ?? input.whyNow?.driverKey ?? null,
    title: topLeakRaw?.title ?? input.whyNow?.driverTitle ?? null,
    severity: normalizeSeverity(topLeakRaw?.severity ?? input.actionGate?.topLeakSeverity ?? input.whyNow?.severity ?? null),
  };
  const dataQualityBlocked =
    (pricingCoveragePct != null && pricingCoveragePct < 80) ||
    isHardLowDataQualityLeakKey(topLeak.key);
  const dataQualityReason =
    pricingCoveragePct != null && pricingCoveragePct < 80
      ? `Pricing coverage ${pricingCoveragePct}% is below the safe execution threshold.`
      : isHardLowDataQualityLeakKey(topLeak.key)
        ? `${String(topLeak.title || "Data quality issue").trim() || "Data quality issue"} blocks execution until pricing and valuation recover.`
        : null;

  const workflowDecision = buildWorkflowDecision(input);
  const basePortfolioStance = buildPortfolioStance(input);
  const baseExecutionInstruction = buildExecutionInstruction(input, workflowDecision);
  const why = buildWhy(input, workflowDecision, topLeak);
  const scores = buildScores(input);

  const precedence = resolveDecisionPrecedence({
    branch: input.branch,
    branchReason: input.branchReason,
    portfolioStance: basePortfolioStance,
    executionInstruction: baseExecutionInstruction,
    actionGate: input.actionGate,
    riskPolicyEval: input.riskPolicyEval,
    capitalProtection: input.decisionGovernance?.capital_protection ?? null,
    topLeak,
    dataQualityBlocked,
    dataQualityReason,
  });

  const primaryTradingWatchlistEntry = input.tradingLiveInput
    ? applyTradingLiveSnapshotDiscipline(
        composeTradingWatchlistEntry(input.tradingLiveInput),
        input.asOf,
      )
    : null;
  const composedTradingWatchlist =
    input.tradingWatchlistInputs && input.tradingWatchlistInputs.length > 0
      ? composeTradingWatchlist(input.tradingWatchlistInputs).map((entry) =>
          applyTradingLiveSnapshotDiscipline(entry, input.asOf),
        )
      : [];
  const tradingWatchlist = sortTradingWatchlist(
    primaryTradingWatchlistEntry
      ? [
          primaryTradingWatchlistEntry,
          ...composedTradingWatchlist.filter(
            (entry) => entry.instrument !== primaryTradingWatchlistEntry.instrument,
          ),
        ]
      : composedTradingWatchlist,
  );
  const fallbackTradingWatchlistEntry = !primaryTradingWatchlistEntry
    ? tradingWatchlist[0] ?? null
    : null;
  let tradingWatchlistFocus = resolveTradingWatchlistFocus(tradingWatchlist);
  let tradingWatchlistSections = composeTradingWatchlistSections(
    tradingWatchlist,
    tradingWatchlistFocus,
  );
  let annotatedTradingWatchlist = tradingWatchlistSections.flatMap((section) => section.entries);
  const leadingTradingWatchlistEntry = annotatedTradingWatchlist[0] ?? null;

  if (
    leadingTradingWatchlistEntry &&
    tradingWatchlistFocus?.anchorInstrument !== leadingTradingWatchlistEntry.instrument
  ) {
    tradingWatchlistFocus = {
      anchorInstrument: leadingTradingWatchlistEntry.instrument,
      sessionLabel: leadingTradingWatchlistEntry.contextSummary.sessionLabel,
      marketOpen: leadingTradingWatchlistEntry.contextSummary.marketOpen,
      contextLabel: leadingTradingWatchlistEntry.contextSummary.contextLabel,
      priorityReason: leadingTradingWatchlistEntry.contextSummary.priorityReason ?? null,
      coverageStatus: leadingTradingWatchlistEntry.contextSummary.coverageStatus,
      coverageLabel: leadingTradingWatchlistEntry.contextSummary.coverageLabel,
      sectionKey: leadingTradingWatchlistEntry.watchlistPlacement?.sectionKey ?? null,
      sectionTitle: leadingTradingWatchlistEntry.watchlistPlacement?.sectionTitle ?? null,
    };
    tradingWatchlistSections = composeTradingWatchlistSections(
      tradingWatchlist,
      tradingWatchlistFocus,
    );
    annotatedTradingWatchlist = tradingWatchlistSections.flatMap((section) => section.entries);
  }
  const resolvedTradingLiveDecision =
    annotatedTradingWatchlist[0]?.liveDecision ?? fallbackTradingWatchlistEntry?.liveDecision ?? null;
  const resolvedTradingChart =
    annotatedTradingWatchlist[0]?.chart ?? fallbackTradingWatchlistEntry?.chart ?? null;

  const support: DecisionSupport = {
    branchReason: input.branchReason,
    precedence: {
      override: precedence.override,
      allowExecution: precedence.allowExecution,
    },
    sources: {
      workflow: workflowDecision.source,
      portfolio: precedence.portfolioStance.source,
      execution: precedence.executionInstruction.source,
      engineVersion: workflowDecision.engineVersion,
      inputHash: input.engineV4?.inputHash ?? null,
    },
    snapshots: {
      actionGateStatus: input.actionGate?.status ?? null,
      riskPolicyStatus: input.riskPolicyEval?.status ?? null,
      riskPolicyBlocked:
        input.riskPolicyEval?.blocked === true ||
        String(input.riskPolicyEval?.status || "").trim().toLowerCase() === "block",
      capitalProtectionMode: input.decisionGovernance?.capital_protection?.protection_mode === true,
      capitalPosture: input.capitalStatus?.posture ?? null,
      planAlignment: input.capitalStatus?.planAlignment ?? null,
      governanceDecision: basePortfolioStance?.decision ?? null,
      topLeakKey: topLeak.key,
      topLeakSeverity: topLeak.severity,
      nextEvaluationAt: input.capitalStatus?.nextEvaluationAt ?? null,
    },
    trading: resolvedTradingLiveDecision
      ? {
          snapshotAt:
            annotatedTradingWatchlist[0]?.chart?.snapshotAt ??
            resolvedTradingChart?.snapshotAt ??
            null,
          liveDecision: resolvedTradingLiveDecision,
        chart: resolvedTradingChart,
        watchlist: annotatedTradingWatchlist,
        watchlistFocus: tradingWatchlistFocus,
        watchlistSections: tradingWatchlistSections,
        marketCoverageSummary: summarizeTradingWatchlistCoverage(annotatedTradingWatchlist),
      }
      : null,
  };

  const timingState = normalizeTimingState({
    allowExecution: precedence.allowExecution,
    workflowType: workflowDecision.type,
    precedenceOverride: precedence.override,
  });

  return {
    version: "decision-envelope.v1",
    mode: input.mode,
    asOf: input.asOf,
    branch: input.branch,
    workflowDecision: {
      ...workflowDecision,
      timingState,
    },
    portfolioStance: precedence.portfolioStance,
    executionInstruction: precedence.executionInstruction,
    why,
    blockers: precedence.blockers,
    scores,
    support,
  };
}

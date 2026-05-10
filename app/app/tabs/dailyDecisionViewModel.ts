import { computeDirective, type DirectiveMode } from "@/lib/signalcore/directives";
import type { DecisionEnvelope } from "@/lib/decision/types";

type LeakSeverity = "high" | "med" | "low" | null;
type DailyDecisionAction = "BUY" | "SELL" | "HOLD";
type DailyDecisionTempo = "defensive" | "normal" | "aggressive";

export type DailyDecisionView = {
  source: "setup_override" | "starter_override" | "blocked_override" | "decision_envelope" | "legacy_fallback";
  branch: DecisionEnvelope["branch"] | "unknown";
  action: DailyDecisionAction;
  headline: string;
  rationale: string;
  confidencePct: number;
  executionTempo: DailyDecisionTempo;
  allowExecution: boolean;
  stateReason: string;
  nextReviewAt: string | null;
  workflowType: DecisionEnvelope["workflowDecision"]["type"] | null;
  portfolioDecision: DecisionEnvelope["portfolioStance"]["decision"] | null;
  blockerState: "none" | "setup" | "warmup" | "fallback" | "risk_blocked";
  guardrails: {
    maxNewRiskPct: number;
    maxSinglePositionPct: number;
    stopLossHint: string;
  };
};

export type DailyHeroSemantics = {
  directiveDisplay: string;
  titleTone: "blue" | "amber";
  postureLabel: string;
  gateLabel: string;
  portfolioImpactLabel: string;
  mostLikelyPath: string;
  mostLikelyPathDetail: string;
  expectedImpactLabel: string;
  expectedImpactDetail: string;
  recommendedExposureLabel: string;
  dashboardChips: string[];
};

export type DailySecondarySemantics = {
  marketItems: Array<{
    name: "Trend" | "Volatility" | "Liquidity" | "Momentum";
    value: number;
    label: string;
    tone: "blue" | "amber" | "green" | "purple";
  }>;
  scenarioItems: Array<{
    name: "Defensive" | "Base" | "Accelerated";
    value: number;
    tone: "amber" | "green" | "blue";
  }>;
  scenarioNote: string;
  dashboardSummary: string;
  dashboardWhyNow: string;
};

export type DailyDecisionCtaOverride = {
  label: string;
  href: string;
  reason: "low_data_quality";
};

export type BuildDailyDecisionViewInput = {
  mode: DirectiveMode;
  daily: Record<string, any>;
  derived: Record<string, any>;
  hasPlan: boolean;
  hasHoldings: boolean;
  topLeak: any;
  topLeakSeverity: LeakSeverity;
  pressureScore: number | null;
  opportunitiesCount: number;
};

const MODE_GUARDRAILS: Record<
  DirectiveMode,
  { maxNewRiskPct: number; maxSinglePositionPct: number; stopLossHint: string }
> = {
  investing: { maxNewRiskPct: 4, maxSinglePositionPct: 8, stopLossHint: "Prefer gradual entries in 2-4 tranches." },
};

function clampPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}

function toStringOrNull(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function toNumberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getGuardrails(mode: DirectiveMode) {
  return MODE_GUARDRAILS[mode];
}

function buildShellHref(args: {
  tab: "daily" | "planning" | "advisor" | "portfolio" | "autonomy";
  mode: DirectiveMode;
  extraParams?: Record<string, string | null | undefined>;
}) {
  const params = new URLSearchParams();
  params.set("tab", args.tab);
  params.set("mode", args.mode);

  for (const [key, value] of Object.entries(args.extraParams ?? {})) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text) continue;
    params.set(key, text);
  }

  return `/app?${params.toString()}`;
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

export function normalizeDailyFixKey(value: unknown) {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key) return "pricing_low";
  if (isLowDataQualityLeakKey(key)) return key;
  return "pricing_low";
}

function isDecisionEnvelope(value: unknown): value is DecisionEnvelope {
  const record = asRecord(value);
  if (!record) return false;
  const workflow = asRecord(record.workflowDecision);
  const stance = asRecord(record.portfolioStance);
  const execution = asRecord(record.executionInstruction);
  const why = asRecord(record.why);
  const scores = asRecord(record.scores);
  const support = asRecord(record.support);
  if (!workflow || !stance || !execution || !why || !scores || !support) return false;
  if (!toStringOrNull(record.branch)) return false;
  if (!toStringOrNull(workflow.type)) return false;
  return true;
}

function hasDataQualityBlocker(envelope: DecisionEnvelope) {
  return envelope.blockers.some((blocker) => blocker.layer === "data_quality" && blocker.haltsExecution);
}

function normalizeAggression(value: unknown): DailyDecisionTempo | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "aggressive" || s === "high" || s === "accelerated") return "aggressive";
  if (s === "defensive" || s === "low" || s === "cautious") return "defensive";
  if (s === "normal" || s === "balanced" || s === "base") return "normal";
  return null;
}

function mapCanonicalAction(envelope: DecisionEnvelope): DailyDecisionAction {
  const workflowType = envelope.workflowDecision.type;
  const portfolioDecision = envelope.portfolioStance.decision;
  const allowExecution = envelope.support.precedence.allowExecution;
  const protectiveExecution = envelope.executionInstruction.category === "PROTECT";
  const protectiveWorkflow = workflowType === "REDUCE" || workflowType === "EXIT";
  const protectivePortfolio =
    portfolioDecision === "REDUCE" || (portfolioDecision === "AVOID" && protectiveExecution);

  if (!allowExecution) {
    return protectiveExecution || protectiveWorkflow || protectivePortfolio ? "SELL" : "HOLD";
  }

  if (protectiveWorkflow || portfolioDecision === "REDUCE") return "SELL";
  if (portfolioDecision === "AVOID" && protectiveExecution) return "SELL";

  if (
    workflowType === "ADD" ||
    workflowType === "ENTER" ||
    workflowType === "EXECUTE_BROKER" ||
    portfolioDecision === "BUY"
  ) {
    return "BUY";
  }

  return "HOLD";
}

function mapCanonicalTempo(envelope: DecisionEnvelope, action: DailyDecisionAction): DailyDecisionTempo {
  if (!envelope.support.precedence.allowExecution) return "defensive";

  const fromAggression = normalizeAggression(envelope.workflowDecision.aggression);
  if (fromAggression) return fromAggression;

  if (action === "SELL") return "defensive";
  return "normal";
}

function buildSetupOverride(args: {
  mode: DirectiveMode;
  branch: DecisionEnvelope["branch"] | "unknown";
  kind: "no_plan" | "no_holdings";
  nextReviewAt: string | null;
}): DailyDecisionView {
  const guardrails = getGuardrails(args.mode);

  if (args.kind === "no_plan") {
    return {
      source: "setup_override",
      branch: args.branch,
      action: "HOLD",
      headline: "HOLD: no active plan",
      rationale: "Do not add risk before defining goal and guardrails.",
      confidencePct: 98,
      executionTempo: "defensive",
      allowExecution: false,
      stateReason: "no_plan",
      nextReviewAt: args.nextReviewAt,
      workflowType: null,
      portfolioDecision: null,
      blockerState: "setup",
      guardrails,
    };
  }

  return {
    source: "setup_override",
    branch: args.branch,
    action: "BUY",
    headline: "BUY CORE: start allocation",
    rationale: "Build initial core positions so monitoring and compounding can begin.",
    confidencePct: 74,
    executionTempo: "normal",
    allowExecution: false,
    stateReason: "no_holdings",
    nextReviewAt: args.nextReviewAt,
    workflowType: null,
    portfolioDecision: null,
    blockerState: "setup",
    guardrails,
  };
}

function buildFatalFallbackOverride(args: {
  mode: DirectiveMode;
  envelope: DecisionEnvelope;
}): DailyDecisionView {
  const guardrails = getGuardrails(args.mode);

  return {
    source: "blocked_override",
    branch: args.envelope.branch,
    action: "HOLD",
    headline: "HOLD: fallback mode",
    rationale:
      toStringOrNull(args.envelope.support.branchReason) ||
      toStringOrNull(args.envelope.why.rationale) ||
      "Fallback mode is active. Pause until the daily bundle recovers.",
    confidencePct:
      clampPct(
        toNumberOrNull(args.envelope.scores.decisionConfidencePct) ??
          toNumberOrNull(args.envelope.portfolioStance.confidencePct) ??
          90,
      ),
    executionTempo: "defensive",
    allowExecution: false,
    stateReason: "fatal_fallback",
    nextReviewAt:
      args.envelope.workflowDecision.nextEvaluationAt ||
      args.envelope.support.snapshots.nextEvaluationAt ||
      null,
    workflowType: args.envelope.workflowDecision.type,
    portfolioDecision: args.envelope.portfolioStance.decision,
    blockerState: "fallback",
    guardrails,
  };
}

function buildStarterWarmupOverride(args: {
  mode: DirectiveMode;
  branch: DecisionEnvelope["branch"] | "unknown";
  nextReviewAt: string | null;
  envelope: DecisionEnvelope | null;
}): DailyDecisionView {
  const guardrails = getGuardrails(args.mode);

  return {
    source: "starter_override",
    branch: args.branch,
    action: "HOLD",
    headline: "OBSERVE: starter pack settling",
    rationale:
      "Starter positions were just deployed. Let the initial allocation settle, observe fills, and monitor conditions before any remediation.",
    confidencePct:
      clampPct(
        toNumberOrNull(args.envelope?.scores.decisionConfidencePct) ??
          toNumberOrNull(args.envelope?.portfolioStance.confidencePct) ??
          78,
      ),
    executionTempo: "defensive",
    allowExecution: false,
    stateReason: "starter_warmup",
    nextReviewAt: args.nextReviewAt,
    workflowType: args.envelope?.workflowDecision.type ?? null,
    portfolioDecision: args.envelope?.portfolioStance.decision ?? null,
    blockerState: "warmup",
    guardrails,
  };
}

function buildLowDataQualityOverride(args: {
  mode: DirectiveMode;
  branch: DecisionEnvelope["branch"] | "unknown";
  nextReviewAt: string | null;
  envelope: DecisionEnvelope | null;
}): DailyDecisionView {
  const guardrails = getGuardrails(args.mode);

  return {
    source: "blocked_override",
    branch: args.branch,
    action: "HOLD",
    headline: "HOLD: fix data quality first",
    rationale:
      "Pricing or valuation data is incomplete. Repair market data and portfolio values before any growth or remediation decision.",
    confidencePct:
      clampPct(
        toNumberOrNull(args.envelope?.scores.decisionConfidencePct) ??
          toNumberOrNull(args.envelope?.portfolioStance.confidencePct) ??
          82,
      ),
    executionTempo: "defensive",
    allowExecution: false,
    stateReason: "low_data_quality",
    nextReviewAt: args.nextReviewAt,
    workflowType: args.envelope?.workflowDecision.type ?? null,
    portfolioDecision: args.envelope?.portfolioStance.decision ?? null,
    blockerState: "risk_blocked",
    guardrails,
  };
}

function buildCanonicalView(args: {
  mode: DirectiveMode;
  envelope: DecisionEnvelope;
}): DailyDecisionView {
  const guardrails = getGuardrails(args.mode);
  const action = mapCanonicalAction(args.envelope);
  const allowExecution =
    args.envelope.support.precedence.allowExecution && args.envelope.executionInstruction.allowExecution;
  const confidencePct =
    clampPct(
      toNumberOrNull(args.envelope.scores.decisionConfidencePct) ??
        toNumberOrNull(args.envelope.portfolioStance.confidencePct) ??
        50,
    );
  const constrainedNonProtectiveState = !allowExecution && action === "HOLD";
  const headline =
    constrainedNonProtectiveState
      ? "HOLD: constraints active"
      : toStringOrNull(args.envelope.why.headline) ||
        toStringOrNull(args.envelope.workflowDecision.instruction) ||
        toStringOrNull(args.envelope.workflowDecision.summary) ||
        (action === "BUY" ? "BUY: act selectively" : action === "SELL" ? "SELL: reduce risk" : "HOLD: stay disciplined");
  const rationale =
    constrainedNonProtectiveState
      ? "Execution remains constrained by current safety or policy checks. Preserve capital until the active constraint clears."
      : toStringOrNull(args.envelope.why.rationale) ||
        toStringOrNull(args.envelope.workflowDecision.reason) ||
        toStringOrNull(args.envelope.workflowDecision.summary) ||
        "No explicit rationale is available.";

  return {
    source: "decision_envelope",
    branch: args.envelope.branch,
    action,
    headline,
    rationale,
    confidencePct,
    executionTempo: mapCanonicalTempo(args.envelope, action),
    allowExecution,
    stateReason: args.envelope.support.precedence.override || "none",
    nextReviewAt:
      args.envelope.workflowDecision.nextEvaluationAt ||
      args.envelope.support.snapshots.nextEvaluationAt ||
      null,
    workflowType: args.envelope.workflowDecision.type,
    portfolioDecision: args.envelope.portfolioStance.decision,
    blockerState: allowExecution ? "none" : "risk_blocked",
    guardrails,
  };
}

function buildLegacyFallback(args: BuildDailyDecisionViewInput): DailyDecisionView {
  const guardrails = getGuardrails(args.mode);
  const legacyDirective = computeDirective({
    mode: args.mode,
    hasPlan: args.hasPlan,
    hasHoldings: args.hasHoldings,
    leakSeverity: args.topLeakSeverity,
    pressureScore: args.pressureScore,
    opportunitiesCount: args.opportunitiesCount,
  });

  return {
    source: "legacy_fallback",
    branch: "unknown",
    action: legacyDirective.action,
    headline: legacyDirective.headline,
    rationale: legacyDirective.rationale,
    confidencePct: clampPct(legacyDirective.confidence),
    executionTempo: legacyDirective.executionTempo,
    allowExecution: legacyDirective.action !== "SELL",
    stateReason: "legacy_fallback",
    nextReviewAt: null,
    workflowType: null,
    portfolioDecision: null,
    blockerState: legacyDirective.action === "SELL" ? "risk_blocked" : "none",
    guardrails,
  };
}

export function buildDailyDecisionView(args: BuildDailyDecisionViewInput): DailyDecisionView {
  const envelopeCandidate = (args.daily as any)?.decisionEnvelope;
  const envelope = isDecisionEnvelope(envelopeCandidate) ? envelopeCandidate : null;
  const branch = envelope?.branch ?? "unknown";
  const starterWarmupActive = Boolean(asRecord((args.daily as any)?.starterWarmup)?.active);
  const pricingNode = asRecord(asRecord((args.derived as any)?.diagnostics)?.pricing);
  const coveragePct = toNumberOrNull(pricingNode?.coveragePct);
  const topLeakKey = toStringOrNull((args.topLeak as any)?.key) || envelope?.support.snapshots.topLeakKey || null;
  const inferredLowDataQualityActive =
    (coveragePct != null && coveragePct < 80) || isLowDataQualityLeakKey(topLeakKey);
  const envelopeLowDataQualityActive =
    envelope?.support.precedence.override === "data_quality" || (envelope ? hasDataQualityBlocker(envelope) : false);
  const lowDataQualityActive = envelope ? envelopeLowDataQualityActive : inferredLowDataQualityActive;
  const nextReviewAt =
    envelope?.workflowDecision.nextEvaluationAt ||
    envelope?.support.snapshots.nextEvaluationAt ||
    toStringOrNull((args.daily as any)?.nextBestActionPreview?.nextEvaluationAt) ||
    toStringOrNull((args.daily as any)?.activation?.decisionPreviewState?.nextEvaluationAt) ||
    toStringOrNull((args.daily as any)?.decisionPreviewState?.nextEvaluationAt);

  if (!args.hasPlan) {
    return buildSetupOverride({
      mode: args.mode,
      branch,
      kind: "no_plan",
      nextReviewAt,
    });
  }

  if (!args.hasHoldings) {
    return buildSetupOverride({
      mode: args.mode,
      branch,
      kind: "no_holdings",
      nextReviewAt,
    });
  }

  if (envelope?.branch === "fatal_fallback") {
    return buildFatalFallbackOverride({
      mode: args.mode,
      envelope,
    });
  }

  if (starterWarmupActive) {
    return buildStarterWarmupOverride({
      mode: args.mode,
      branch,
      nextReviewAt,
      envelope,
    });
  }

  if (lowDataQualityActive) {
    return buildLowDataQualityOverride({
      mode: args.mode,
      branch,
      nextReviewAt,
      envelope,
    });
  }

  if (envelope) {
    return buildCanonicalView({
      mode: args.mode,
      envelope,
    });
  }

  return buildLegacyFallback(args);
}

export function buildDailyDecisionCtaOverride(args: {
  mode: DirectiveMode;
  decisionView: DailyDecisionView;
  hasPlan: boolean;
  hasHoldings: boolean;
  topLeakKey?: unknown;
}): DailyDecisionCtaOverride | null {
  if (!args.hasPlan || !args.hasHoldings) return null;

  if (args.decisionView.stateReason === "low_data_quality") {
    const fixKey = normalizeDailyFixKey(args.topLeakKey);
    return {
      label: "Fix Data Quality",
      href: buildShellHref({
        tab: "portfolio",
        mode: args.mode,
        extraParams: {
          fixNow: "1",
          fixKey,
          fixFrom: "daily",
        },
      }),
      reason: "low_data_quality",
    };
  }

  return null;
}




export function buildDailyHeroSemantics(args: {
  decisionView: DailyDecisionView;
  hasPlan: boolean;
  hasHoldings: boolean;
  starterWarmupActive: boolean;
  hasDisplayTopLeak: boolean;
  displayTopLeakSeverity: LeakSeverity;
  canClose: boolean;
  nextReviewLabel: string;
  primaryDesc: string;
}): DailyHeroSemantics {
  const isSetupState = args.decisionView.blockerState === "setup";
  const isFallbackState = args.decisionView.blockerState === "fallback";
  const isLowDataQualityState = args.decisionView.stateReason === "low_data_quality";
  const isConstrainedState =
    !args.decisionView.allowExecution && !args.starterWarmupActive && !isFallbackState && !isSetupState;
  const isRiskReductionState = args.hasPlan && args.hasHoldings && args.decisionView.action === "SELL";

  const directiveDisplay = !args.hasPlan
    ? "SET UP"
    : args.hasPlan && !args.hasHoldings
      ? "BUILD CORE"
      : args.starterWarmupActive
        ? "OBSERVE"
        : isFallbackState
          ? "PAUSED"
          : isLowDataQualityState
            ? "FIX DATA"
            : isConstrainedState && args.decisionView.action !== "SELL"
              ? "HOLD"
              : args.decisionView.action === "BUY"
                ? "ADD RISK"
                : args.decisionView.action === "SELL"
                  ? "REDUCE RISK"
                  : "WAIT";

  const postureLabel = isSetupState
    ? "Setup"
    : args.starterWarmupActive
      ? "Observe"
      : isFallbackState
        ? "Paused"
        : isLowDataQualityState
          ? "Data Quality"
          : args.decisionView.executionTempo === "defensive"
            ? "Caution"
            : args.decisionView.executionTempo === "aggressive"
              ? "Aggressive"
              : "Balanced";

  const gateLabel =
    args.decisionView.blockerState === "setup"
      ? "Setup required"
      : args.decisionView.blockerState === "warmup" || args.starterWarmupActive
        ? "Warmup active"
        : args.decisionView.blockerState === "fallback"
          ? "Fallback paused"
          : isLowDataQualityState
            ? "Data quality"
            : !args.decisionView.allowExecution
              ? "Constrained"
              : args.hasDisplayTopLeak
                ? args.displayTopLeakSeverity === "high"
                  ? "High attention"
                  : args.displayTopLeakSeverity === "med"
                    ? "Watchlist"
                    : "Monitor"
                : args.canClose
                  ? "Ready now"
                  : "Setup required";

  const mostLikelyPath = isSetupState
    ? "Setup"
    : args.starterWarmupActive
      ? "Observe"
      : isFallbackState
        ? "Paused"
        : isLowDataQualityState
          ? "Repair"
          : args.decisionView.executionTempo === "defensive"
            ? "Defensive"
            : args.decisionView.executionTempo === "aggressive"
              ? "Accelerated"
              : "Base";

  const mostLikelyPathDetail = isSetupState
    ? "Complete setup first so Daily can move from configuration into execution and monitoring."
    : args.starterWarmupActive
      ? "Starter positions were just deployed. Observation is favored until the warmup window expires."
      : isFallbackState
        ? "System recovery is favored until the fallback state clears and normal decisioning returns."
        : isLowDataQualityState
          ? "Repair pricing and valuation quality before interpreting market continuation."
          : args.decisionView.executionTempo === "defensive"
            ? "Continuation favored over aggressive expansion while confirmation remains weak."
            : args.decisionView.executionTempo === "aggressive"
              ? "Acceleration favored only while conviction stays intact."
              : "Base consolidation remains the default operating path.";

  const expectedImpactLabel = !args.hasPlan
    ? "Plan & Guardrails"
    : args.hasPlan && !args.hasHoldings
      ? "Build Initial Core"
      : args.starterWarmupActive
        ? "Build & Observe"
        : isFallbackState
          ? "Stability First"
          : isLowDataQualityState
            ? "Repair Data Quality"
            : args.decisionView.action === "BUY"
              ? "Higher Conviction"
              : args.decisionView.action === "SELL"
                ? "Lower Drawdown"
                : "Capital Preservation";

  const expectedImpactDetail = isSetupState
    ? "Setup must be completed before the engine can express an execution impact."
    : args.starterWarmupActive
      ? "Allow the initial allocation to build and settle before interpreting leaks or forcing remediation."
      : isFallbackState
        ? "System stability matters more than expressing a new market stance while fallback is active."
        : isLowDataQualityState
          ? "Repair data quality before trusting any portfolio-impact estimate."
          : isRiskReductionState
            ? "Risk trimming improves stability if volatility persists through the next cycle."
            : args.primaryDesc;

  const portfolioImpactLabel = !args.hasPlan
    ? "Portfolio Impact: No new exposure before plan activation"
    : args.hasPlan && !args.hasHoldings
      ? "Portfolio Impact: Build starter exposure"
      : args.starterWarmupActive
        ? "Portfolio Impact: Let starter positions settle"
        : isFallbackState
          ? "Portfolio Impact: Pause until the system recovers"
          : isLowDataQualityState
            ? "Portfolio Impact: Fix portfolio data before acting"
            : isRiskReductionState
            ? "Portfolio Impact: Lower concentration risk"
              : args.decisionView.action === "BUY"
                ? "Portfolio Impact: Add approved exposure"
                : "Portfolio Impact: Preserve capital";

  const recommendedExposureLabel = !args.hasPlan
    ? "None"
    : args.hasPlan && !args.hasHoldings
      ? "Initial"
      : args.starterWarmupActive
        ? "Measured"
        : isFallbackState || isLowDataQualityState || isConstrainedState
          ? "Low"
          : args.decisionView.executionTempo === "defensive"
            ? "Low"
            : args.decisionView.executionTempo === "aggressive"
              ? "High"
              : "Moderate";

  const dashboardChips = isSetupState
    ? !args.hasPlan
      ? ["Setup Required", "Plan Missing", "No New Risk", "Review Soon", "Monitor"]
      : ["Setup Required", "Build Core", "Initial Allocation", "Review Soon", "Monitor"]
    : args.starterWarmupActive
      ? ["Starter Warmup", "Build in Progress", "Observe Settling", args.nextReviewLabel === "Now" ? "Review Now" : "Review Soon", "Monitor"]
      : isFallbackState
        ? ["Fallback Paused", "Stability First", "No New Risk", args.nextReviewLabel === "Now" ? "Review Now" : "Review Soon", "Monitor"]
        : isLowDataQualityState
          ? ["Data Quality", "Fix Pricing", "No New Risk", args.nextReviewLabel === "Now" ? "Review Now" : "Review Soon", "Monitor"]
          : isRiskReductionState
            ? ["Capital Preservation", "High Volatility", "Weak Confirmation", "Review Soon", "Concentration Overweight"]
            : [
                args.decisionView.action === "BUY" ? "Approved Risk" : "Capital Preservation",
                "Stable Volatility",
                args.decisionView.confidencePct >= 70 ? "Strong Confirmation" : "Weak Confirmation",
                args.nextReviewLabel === "Now" ? "Review Now" : "Review Soon",
                args.decisionView.executionTempo === "aggressive" ? "Acceleration Allowed" : "Measured Deployment",
              ];

  return {
    directiveDisplay,
    titleTone: args.starterWarmupActive ? "blue" : args.decisionView.action === "BUY" ? "blue" : "amber",
    postureLabel,
    gateLabel,
    portfolioImpactLabel,
    mostLikelyPath,
    mostLikelyPathDetail,
    expectedImpactLabel,
    expectedImpactDetail,
    recommendedExposureLabel,
    dashboardChips,
  };
}

export function buildDailySecondarySemantics(args: {
  decisionView: DailyDecisionView;
  hasPlan: boolean;
  hasHoldings: boolean;
  starterWarmupActive: boolean;
  coveragePct: number;
  setupScore: number;
  pressureGauge: number;
  autopilotScore: number;
  growthScore: number | null;
}): DailySecondarySemantics {
  const isSetupState = args.decisionView.blockerState === "setup";
  const isFallbackState = args.decisionView.blockerState === "fallback";
  const isLowDataQualityState = args.decisionView.stateReason === "low_data_quality";
  const isRiskReductionState = args.hasPlan && args.hasHoldings && args.decisionView.action === "SELL";

  const marketItems: DailySecondarySemantics["marketItems"] = [
    {
      name: "Trend",
      value: !args.hasPlan
        ? 30
        : args.hasPlan && !args.hasHoldings
          ? 45
          : args.starterWarmupActive
            ? 48
            : isFallbackState
              ? 28
              : isLowDataQualityState
                ? 22
                : args.decisionView.action === "SELL"
                  ? 42
                  : args.decisionView.action === "BUY"
                    ? 66
                    : 50,
      label: !args.hasPlan
        ? "Setup"
        : args.hasPlan && !args.hasHoldings
          ? "Pending"
          : args.starterWarmupActive
            ? "Settling"
            : isFallbackState
              ? "Paused"
              : isLowDataQualityState
                ? "Repair"
                : args.decisionView.action === "SELL"
                  ? "Neutral"
                  : args.decisionView.action === "BUY"
                    ? "Positive"
                    : "Balanced",
      tone: "blue",
    },
    {
      name: "Volatility",
      value: args.pressureGauge,
      label:
        args.pressureGauge >= 55 ? "Elevated" : args.pressureGauge >= 35 ? "Watched" : "Contained",
      tone: "amber",
    },
    {
      name: "Liquidity",
      value:
        args.hasPlan && args.hasHoldings
          ? args.decisionView.executionTempo === "defensive"
            ? 56
            : Math.max(40, Math.min(80, Math.round((args.coveragePct + args.setupScore) / 3)))
          : 28,
      label:
        args.hasPlan && args.hasHoldings
          ? args.coveragePct >= 70 || args.setupScore >= 70
            ? "Stable"
            : "Thin"
          : "Thin",
      tone: "green",
    },
    {
      name: "Momentum",
      value: isSetupState
        ? 28
        : args.starterWarmupActive
          ? 38
          : isFallbackState
            ? 20
            : isLowDataQualityState
              ? 24
              : args.decisionView.executionTempo === "defensive"
                ? 34
                : args.decisionView.executionTempo === "aggressive"
                  ? 68
                  : 46,
      label: isSetupState
        ? "Pending"
        : args.starterWarmupActive
          ? "Observe"
          : isFallbackState
            ? "Paused"
            : isLowDataQualityState
              ? "Repair"
              : args.decisionView.executionTempo === "defensive"
                ? "Weak"
                : args.decisionView.executionTempo === "aggressive"
                  ? "Strong"
                  : "Balanced",
      tone: "purple",
    },
  ];

  const confidence = Math.max(10, Math.min(90, Math.round(args.decisionView.confidencePct)));
  const secondary = Math.max(8, Math.round((100 - confidence) * 0.72));
  const tertiary = Math.max(0, 100 - confidence - secondary);

  const scenarioItems: DailySecondarySemantics["scenarioItems"] = isSetupState
    ? [
        { name: "Defensive", value: 45, tone: "amber" },
        { name: "Base", value: 40, tone: "green" },
        { name: "Accelerated", value: 15, tone: "blue" },
      ]
    : args.starterWarmupActive
      ? [
          { name: "Defensive", value: 30, tone: "amber" },
          { name: "Base", value: 55, tone: "green" },
          { name: "Accelerated", value: 15, tone: "blue" },
        ]
      : isFallbackState
        ? [
            { name: "Defensive", value: 65, tone: "amber" },
            { name: "Base", value: 25, tone: "green" },
            { name: "Accelerated", value: 10, tone: "blue" },
          ]
        : isLowDataQualityState
          ? [
              { name: "Defensive", value: 60, tone: "amber" },
              { name: "Base", value: 25, tone: "green" },
              { name: "Accelerated", value: 15, tone: "blue" },
            ]
          : args.decisionView.executionTempo === "defensive"
            ? [
                { name: "Defensive", value: confidence, tone: "amber" },
                { name: "Base", value: secondary, tone: "green" },
                { name: "Accelerated", value: tertiary, tone: "blue" },
              ]
            : args.decisionView.executionTempo === "aggressive"
              ? [
                  { name: "Defensive", value: tertiary, tone: "amber" },
                  { name: "Base", value: secondary, tone: "green" },
                  { name: "Accelerated", value: confidence, tone: "blue" },
                ]
              : [
                  { name: "Defensive", value: secondary, tone: "amber" },
                  { name: "Base", value: confidence, tone: "green" },
                  { name: "Accelerated", value: tertiary, tone: "blue" },
                ];

  const scenarioNote = isSetupState
    ? !args.hasPlan
      ? "Complete the plan first. Market continuation scenarios only matter after the system has a defined plan and guardrails."
      : "Build the initial core first. Market continuation scenarios only matter after holdings are in place."
    : args.starterWarmupActive
      ? "Use the warmup window to observe fills, settlement, and data quality before reading market continuation scenarios."
      : isFallbackState
        ? "Fallback mode is active. System recovery matters more than continuation scenarios until normal decisioning returns."
        : isLowDataQualityState
          ? "Repair pricing and valuation quality before interpreting continuation scenarios."
          : args.decisionView.executionTempo === "defensive"
            ? "Base continuation remains possible, but confirmation is not strong enough for aggressive expansion."
            : args.decisionView.executionTempo === "aggressive"
              ? "Aggressive continuation is only justified while signal confirmation remains strong."
              : "Balanced continuation remains favored until the next review updates conviction.";

  const dashboardSummary = isRiskReductionState
    ? "Volatility remains elevated and signal confirmation quality is weak. Capital preservation has higher expected value than aggressive positioning today."
    : args.decisionView.rationale;

  const dashboardWhyNow = isRiskReductionState
    ? "Confirmation quality across current signals is below threshold while volatility remains elevated. Preserving capital improves expected daily outcome and reduces concentration risk."
    : args.decisionView.rationale;

  return {
    marketItems,
    scenarioItems,
    scenarioNote,
    dashboardSummary,
    dashboardWhyNow,
  };
}

import type { ReactNode } from "react";

type Mode = "investing";
type Tone = "neutral" | "good" | "warn" | "bad";

export const EMPTY_NODE: Record<string, any> = {};
export const EMPTY_LIST: any[] = [];
export const EMPTY_MONEY_CONFIRMED = { today: 0, week: 0, total: 0 };

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, any>) : EMPTY_NODE;
}

function asList<T = any>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : EMPTY_LIST;
}

function takeStrings(value: unknown, limit?: number) {
  const items = asList(value)
    .map((x: any) => String(x))
    .filter((x: string) => x.length > 0);
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

export function normalizeDailyBundle(args: {
  bundle: any;
  starterWarmupActive: boolean;
  conversionFunnel: any;
  isPaid: boolean;
}) {
  const plan = args.bundle?.plan ?? null;
  const portfolio = asRecord(args.bundle?.portfolio);
  const derived = asRecord(args.bundle?.derived);
  const daily = asRecord(args.bundle?.daily);

  const dailyStarterWarmupNode = asRecord((daily as any)?.starterWarmup || (derived as any)?.starterWarmup);
  const starterWarmupServerActive = Boolean((dailyStarterWarmupNode as any)?.active);
  const starterWarmupEffective = args.starterWarmupActive || starterWarmupServerActive;

  const dailyEngineV4 = asRecord((daily as any)?.engineV4);
  const dailyEngineV4Decision = asRecord((dailyEngineV4 as any)?.decision);
  const dailyEngineV4Scores = asRecord((dailyEngineV4 as any)?.scores);
  const dailyEngineV4Trace = asList((dailyEngineV4 as any)?.trace);
  const dailyLoopStage =
    String((daily as any)?.loopStage || (dailyEngineV4 as any)?.loopStage || "").trim().toUpperCase() || null;
  const dailyNextBestAction = asRecord((daily as any)?.nextBestAction);
  const dailyOperationalAction = asRecord((daily as any)?.operationalAction || (derived as any)?.operationalAction);
  const dailyPaywall = asRecord((daily as any)?.paywall);
  const dailyBillingNode = asRecord((daily as any)?.billing);
  const dailyNextBestActionPreview = asRecord((daily as any)?.nextBestActionPreview);
  const dailyScoresNode = asRecord((daily as any)?.scores);
  const dailyScoreAudit = asRecord((daily as any)?.scoreAudit);
  const dailyReplayAudit = asRecord((daily as any)?.replayAudit);
  const dailyAuditTrail = asRecord((daily as any)?.auditTrail);
  const dailyCapitalStatus = asRecord((daily as any)?.capitalStatus);
  const dailySystemContinuity = asRecord((daily as any)?.systemContinuity);
  const dailyPerfectLoop = asRecord((daily as any)?.perfectLoop);
  const dailyPerfectLoopEvaluationContext = asRecord((dailyPerfectLoop as any)?.evaluationContext);
  const dailyPerfectLoopSystemStatus = asRecord((dailyPerfectLoop as any)?.systemStatus);
  const dailyPerfectLoopOvernightChanges = asRecord((dailyPerfectLoop as any)?.overnightChanges);
  const dailyPerfectLoopProgression = asRecord((dailyPerfectLoop as any)?.progression);
  const dailyOpenLoop = asRecord((daily as any)?.openLoop || (dailyPerfectLoop as any)?.openLoop);
  const dailyContinuitySignals = asRecord((daily as any)?.continuitySignals);
  const dailyTrendsNode = asRecord((daily as any)?.trends);
  const dailyStreakNode = asRecord((daily as any)?.streak);
  const dailyPortfolioScore = asRecord((daily as any)?.portfolioScore);
  const dailySyntrakeStack = asRecord((daily as any)?.syntrakeStack);
  const dailyEngineV5 = asRecord((daily as any)?.engineV5);
  const dailyEngineV5Temporal = asRecord((dailyEngineV5 as any)?.temporalContinuity);
  const dailyEngineV5Operational = asRecord((dailyEngineV5 as any)?.autopilotOperationalState);
  const dailyActivationNode = asRecord((daily as any)?.activation);
  const dailyActivationSystemStatus = asRecord((dailyActivationNode as any)?.systemStatusBar);
  const dailyActivationEvaluationContextHeader = asRecord((dailyActivationNode as any)?.evaluationContextHeader);

  const decisionExposure = String((dailyPaywall as any)?.decisionExposure || "FULL").trim().toUpperCase();
  const decisionPreviewOnly = decisionExposure === "PREVIEW_ONLY";
  const serverBillingTrialActive = Boolean((dailyBillingNode as any)?.trialActive);
  const serverBillingTrialStarted = Boolean((dailyBillingNode as any)?.trialStarted);
  const serverBillingTrialExpired = Boolean((dailyBillingNode as any)?.trialExpired);
  const serverBillingProActive = Boolean((dailyBillingNode as any)?.proActive);
  const serverBillingTrialEndsAt = String((dailyBillingNode as any)?.trialEndsAt || "").trim() || null;
  const funnelTrialActive = Boolean(args.conversionFunnel?.access?.planStatus === "trial" && args.conversionFunnel?.access?.trial?.active);
  const effectiveTrialActive = serverBillingTrialActive || funnelTrialActive;
  const effectiveHasProAccess = serverBillingProActive || Boolean(args.isPaid);
  const effectiveAccessLabel = effectiveTrialActive ? "Trial" : effectiveHasProAccess ? "Pro" : "Free";
  const effectiveAccessTone: "good" | "warn" = effectiveTrialActive || effectiveHasProAccess ? "good" : "warn";

  const holdings = asList((portfolio as any)?.items);
  const portfolioQuotes =
    (portfolio as any)?.quotes && typeof (portfolio as any).quotes === "object"
      ? ((portfolio as any).quotes as Record<string, any>)
      : null;
  const hasPlan =
    typeof (derived as any)?.hasPlan === "boolean"
      ? Boolean((derived as any).hasPlan)
      : !!(plan as any)?.id || !!(plan as any)?.is_active || !!(plan as any)?.active;
  const hasHoldings = typeof (derived as any)?.hasHoldings === "boolean" ? Boolean((derived as any).hasHoldings) : holdings.length > 0;

  const opportunities = asList((daily as any)?.opportunities);
  const governanceDailyDecisionNode = asRecord((daily as any)?.daily_decision || (derived as any)?.daily_decision);
  const governanceOpportunitiesNode = asList((daily as any)?.opportunities_dashboard || (derived as any)?.opportunities_dashboard);
  const starterPack = asList((daily as any)?.starterPack);
  const starterPackMeta = (daily as any)?.starterPackMeta ?? null;
  const starterBudgetServer = Number((starterPackMeta as any)?.budgetEur ?? Number.NaN);
  const starterSource = String((starterPackMeta as any)?.source || "").toLowerCase().trim();
  const starterUsesLiveQuotes = starterSource === "market_quotes";

  const lastSnapshotAt = (daily as any)?.lastSnapshotAt ?? (derived as any)?.lastSnapshotAt ?? null;
  const receiptsCount = typeof (derived as any)?.receiptsCount === "number" ? (derived as any).receiptsCount : 0;
  const receiptsTimeline = asList((derived as any)?.receiptsTimeline);
  const moneyConfirmed =
    (derived as any)?.moneyConfirmed && typeof (derived as any).moneyConfirmed === "object"
      ? ((derived as any).moneyConfirmed as { today?: number; week?: number; total?: number })
      : EMPTY_MONEY_CONFIRMED;

  const autopilotV2 = (derived as any)?.autopilot ?? null;
  const pressureV2 = (derived as any)?.pressureV2 ?? null;
  const diagnostics = (derived as any)?.diagnostics ?? null;
  const riskLeaks = Array.isArray((diagnostics as any)?.riskLeaks) ? ((diagnostics as any).riskLeaks as any[]) : EMPTY_LIST;
  const nba = (daily as any)?.nba ?? null;
  const proof = (daily as any)?.proof ?? null;
  const dailyExecutionEvidence =
    (daily as any)?.executionEvidence && typeof (daily as any).executionEvidence === "object"
      ? ((daily as any).executionEvidence as Record<string, any>)
      : (derived as any)?.executionEvidence && typeof (derived as any).executionEvidence === "object"
        ? ((derived as any).executionEvidence as Record<string, any>)
        : EMPTY_NODE;

  return {
    plan,
    portfolio,
    derived,
    daily,
    dailyStarterWarmupNode,
    starterWarmupServerActive,
    starterWarmupEffective,
    dailyEngineV4,
    dailyEngineV4Decision,
    dailyEngineV4Scores,
    dailyEngineV4Trace,
    dailyLoopStage,
    dailyNextBestAction,
    dailyOperationalAction,
    dailyPaywall,
    dailyBillingNode,
    dailyNextBestActionPreview,
    dailyScoresNode,
    dailyScoreAudit,
    dailyReplayAudit,
    dailyAuditTrail,
    dailyCapitalStatus,
    dailySystemContinuity,
    dailyPerfectLoop,
    dailyPerfectLoopEvaluationContext,
    dailyPerfectLoopSystemStatus,
    dailyPerfectLoopOvernightChanges,
    dailyPerfectLoopProgression,
    dailyOpenLoop,
    dailyContinuitySignals,
    dailyTrendsNode,
    dailyStreakNode,
    dailyPortfolioScore,
    dailySyntrakeStack,
    dailyEngineV5,
    dailyEngineV5Temporal,
    dailyEngineV5Operational,
    dailyActivationNode,
    dailyActivationSystemStatus,
    dailyActivationEvaluationContextHeader,
    decisionExposure,
    decisionPreviewOnly,
    serverBillingTrialActive,
    serverBillingTrialStarted,
    serverBillingTrialExpired,
    serverBillingProActive,
    serverBillingTrialEndsAt,
    effectiveTrialActive,
    effectiveHasProAccess,
    effectiveAccessLabel,
    effectiveAccessTone,
    holdings,
    portfolioQuotes,
    hasPlan,
    hasHoldings,
    opportunities,
    governanceDailyDecisionNode,
    governanceOpportunitiesNode,
    starterPack,
    starterPackMeta,
    starterBudgetServer,
    starterUsesLiveQuotes,
    lastSnapshotAt,
    receiptsCount,
    receiptsTimeline,
    moneyConfirmed,
    autopilotV2,
    pressureV2,
    diagnostics,
    riskLeaks,
    nba,
    proof,
    dailyExecutionEvidence,
  };
}

export function buildExecutionScore(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  return {
    score: Math.max(0, Math.min(100, Math.round(Number((raw as any).score || 0)))),
    tone: String((raw as any).tone || "warn"),
    weekTargetDays: Math.max(1, Math.round(Number((raw as any).weekTargetDays || 5))),
    doneDays: Math.max(0, Math.round(Number((raw as any).doneDays || 0))),
    validatedDays: Math.max(0, Math.round(Number((raw as any).validatedDays || 0))),
    disciplinePct: Math.max(0, Math.min(100, Math.round(Number((raw as any).disciplinePct || 0)))),
    validationPct: Math.max(0, Math.min(100, Math.round(Number((raw as any).validationPct || 0)))),
    checklistPct: Math.max(0, Math.min(100, Math.round(Number((raw as any).checklistPct || 0)))),
    manualCompleted: Math.max(0, Math.round(Number((raw as any).manualCompleted || 0))),
    manualTotal: Math.max(0, Math.round(Number((raw as any).manualTotal || 0))),
    consistencyPct: Math.max(0, Math.min(100, Math.round(Number((raw as any).consistencyPct || 0)))),
    missingProofDays: Array.isArray((raw as any).missingProofDays)
      ? ((raw as any).missingProofDays as any[]).map((x: any) => String(x)).filter((x: string) => x.length > 0)
      : [],
  };
}

export function buildActionGate(args: { daily: Record<string, any>; derived: Record<string, any>; autopilotMode: Mode }) {
  const raw = (args.daily as any)?.actionGate || (args.derived as any)?.actionGate;
  if (!raw || typeof raw !== "object") return null;
  const reasons = Array.isArray((raw as any).reasons)
    ? ((raw as any).reasons as any[]).map((x: any) => String(x)).filter((x: string) => x.length > 0)
    : [];
  const status = String((raw as any).status || "caution").toLowerCase();
  const rawAllowExecution = (raw as any).allowExecution;
  const blockedFlag = Boolean((raw as any).blocked);
  const blockedByReason = reasons.some((reason) => /blocked|not\s*ready|missing|incomplete/i.test(String(reason).toLowerCase()));
  const allowExecution =
    typeof rawAllowExecution === "boolean" ? rawAllowExecution : !(blockedFlag || status === "blocked" || blockedByReason);
  return {
    status,
    allowExecution,
    confidencePct: Math.max(0, Math.min(100, Math.round(Number((raw as any).confidencePct || 0)))),
    reasons,
    nextStep: String((raw as any).nextStep || ""),
    ctaLabel: String((raw as any).ctaLabel || "Open Daily"),
    ctaAction: String((raw as any).ctaAction || "open_daily"),
    ctaHref: String((raw as any).ctaHref || `/app?tab=daily&mode=${args.autopilotMode}`),
    pressureScore: Math.max(0, Math.min(100, Math.round(Number((raw as any).pressureScore || 0)))),
    coveragePct: Math.max(0, Math.min(100, Math.round(Number((raw as any).coveragePct || 0)))),
  };
}

export function buildWhyNow(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.whyNow || (args.derived as any)?.whyNow;
  if (!raw || typeof raw !== "object") return null;
  return {
    rationale: String((raw as any).rationale || ""),
    expectedOutcome: String((raw as any).expectedOutcome || ""),
    counterfactual: String((raw as any).counterfactual || ""),
    evidence: Array.isArray((raw as any).evidence)
      ? ((raw as any).evidence as any[]).map((x: any) => String(x)).filter((x: string) => x.length > 0)
      : [],
  };
}

export function buildActionGateAlert(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.actionGateAlert || (args.derived as any)?.actionGateAlert;
  if (!raw || typeof raw !== "object") return null;
  return {
    triggered: Boolean((raw as any).triggered),
    severity: String((raw as any).severity || "low"),
    latest: String((raw as any).latest || "ready"),
    blockedStreakDays: Math.max(0, Math.round(Number((raw as any).blockedStreakDays || 0))),
    blockedDays7: Math.max(0, Math.round(Number((raw as any).blockedDays7 || 0))),
    cautionDays7: Math.max(0, Math.round(Number((raw as any).cautionDays7 || 0))),
    message: String((raw as any).message || ""),
    nextStep: String((raw as any).nextStep || ""),
  };
}

export function buildRiskPolicyNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.riskPolicy || (args.derived as any)?.riskPolicy;
  if (!raw || typeof raw !== "object") return null;
  const policyRaw = (raw as any).policy && typeof (raw as any).policy === "object" ? (raw as any).policy : {};
  const evalRaw = (raw as any).evaluation && typeof (raw as any).evaluation === "object" ? (raw as any).evaluation : {};
  return {
    policy: {
      level: String((policyRaw as any).level || "balanced"),
      maxSinglePositionPct: Number((policyRaw as any).maxSinglePositionPct || 0),
      maxTop3ConcentrationPct: Number((policyRaw as any).maxTop3ConcentrationPct || 0),
      maxDrawdownPct: Number((policyRaw as any).maxDrawdownPct || 0),
      maxExposurePct: Number((policyRaw as any).maxExposurePct || 0),
      minPricingCoveragePct: Number((policyRaw as any).minPricingCoveragePct || 0),
    },
    evaluation: {
      status: String((evalRaw as any).status || "not_applicable"),
      blocked: Boolean((evalRaw as any).blocked),
      reasons: Array.isArray((evalRaw as any).reasons) ? ((evalRaw as any).reasons as any[]).map((x: any) => String(x)).filter(Boolean) : [],
    },
  };
}

export function buildPreTradeSafetyCheck(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.preTradeSafetyCheck || (args.derived as any)?.preTradeSafetyCheck;
  if (!raw || typeof raw !== "object") return null;
  return {
    required: Boolean((raw as any).required),
    status: String((raw as any).status || "not_required"),
    reason: String((raw as any).reason || ""),
    nextStep: String((raw as any).nextStep || ""),
    riskEscalationBlocked: Boolean((raw as any).riskEscalationBlocked),
  };
}

export function buildKillSwitchNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.killSwitch || (args.derived as any)?.killSwitch;
  if (!raw || typeof raw !== "object") return null;
  return {
    active: Boolean((raw as any).active),
    state: String((raw as any).state || "Monitoring"),
    reason: String((raw as any).reason || ""),
    trigger: String((raw as any).trigger || ""),
  };
}

export function buildRiskEnvelopeNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.riskEnvelope || (args.derived as any)?.riskEnvelope;
  if (!raw || typeof raw !== "object") return null;
  return {
    status: String((raw as any).status || "constrained"),
    riskClass: String((raw as any).riskClass || "Moderate"),
    maxDeployPct: Number((raw as any).maxDeployPct || 0),
    maxPositionPct: Number((raw as any).maxPositionPct || 0),
    expectedDrawdownBudgetPct: Number((raw as any).expectedDrawdownBudgetPct || 0),
    recommendation: String((raw as any).recommendation || ""),
  };
}

export function buildGrowthReadinessNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.growthReadiness || (args.derived as any)?.growthReadiness;
  if (!raw || typeof raw !== "object") return null;
  const comps = (raw as any).components && typeof (raw as any).components === "object" ? (raw as any).components : {};
  return {
    score: Number((raw as any).score || 0),
    tier: String((raw as any).tier || "Building"),
    nextFocus: String((raw as any).nextFocus || ""),
    components: {
      alignment: Number((comps as any).alignment || 0),
      risk: Number((comps as any).risk || 0),
      consistency: Number((comps as any).consistency || 0),
      execution: Number((comps as any).execution || 0),
    },
  };
}

export function buildWeeklyValueNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.weeklyValue || (args.derived as any)?.weeklyValue;
  if (!raw || typeof raw !== "object") return null;
  return {
    riskAvoidedPoints: Number((raw as any).riskAvoidedPoints || 0),
    errorsAvoidedEstimate: Number((raw as any).errorsAvoidedEstimate || 0),
    disciplineUpPct: Number((raw as any).disciplineUpPct || 0),
    summary: String((raw as any).summary || ""),
  };
}

export function buildAntiChurnNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.antiChurn || (args.derived as any)?.antiChurn;
  if (!raw || typeof raw !== "object") return null;
  const interventions = Array.isArray((raw as any).interventions)
    ? ((raw as any).interventions as any[])
        .map((x: any) => ({
          id: String(x?.id || ""),
          priority: String(x?.priority || "low"),
          title: String(x?.title || ""),
          detail: String(x?.detail || ""),
        }))
        .filter((x) => x.id || x.title)
    : [];
  return {
    score: Number((raw as any).score || 0),
    riskLevel: String((raw as any).riskLevel || "medium"),
    triggers: Array.isArray((raw as any).triggers) ? ((raw as any).triggers as any[]).map((x: any) => String(x)).filter(Boolean).slice(0, 5) : [],
    message: String((raw as any).message || ""),
    nextCheckHours: Number((raw as any).nextCheckHours || 12),
    interventions: interventions.slice(0, 3),
  };
}

export function buildWeeklyPremiumReportNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.weeklyPremiumReport || (args.derived as any)?.weeklyPremiumReport;
  if (!raw || typeof raw !== "object") return null;
  const metrics = (raw as any).metrics && typeof (raw as any).metrics === "object" ? (raw as any).metrics : {};
  return {
    generatedAt: String((raw as any).generatedAt || ""),
    periodLabel: String((raw as any).periodLabel || ""),
    summary: String((raw as any).summary || ""),
    highlights: takeStrings((raw as any).highlights, 4),
    focusNextWeek: takeStrings((raw as any).focusNextWeek, 4),
    trustLine: String((raw as any).trustLine || ""),
    metrics: {
      growthReadiness: Number((metrics as any).growthReadiness || 0),
      executionScore: Number((metrics as any).executionScore || 0),
      riskAvoidedPoints: Number((metrics as any).riskAvoidedPoints || 0),
      errorsAvoidedEstimate: Number((metrics as any).errorsAvoidedEstimate || 0),
      disciplineUpPct: Number((metrics as any).disciplineUpPct || 0),
      streakDays: Number((metrics as any).streakDays || 0),
    },
  };
}

export function buildPreExecutionSimulationNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.preExecutionSimulation || (args.derived as any)?.preExecutionSimulation;
  if (!raw || typeof raw !== "object") return null;
  const defensive = (raw as any).defensive && typeof (raw as any).defensive === "object" ? (raw as any).defensive : {};
  const base = (raw as any).base && typeof (raw as any).base === "object" ? (raw as any).base : {};
  const accelerated = (raw as any).accelerated && typeof (raw as any).accelerated === "object" ? (raw as any).accelerated : {};
  return {
    defensive: {
      label: String((defensive as any).label || "Defensive path"),
      riskDelta: Number((defensive as any).riskDelta || 0),
      alignmentDelta: Number((defensive as any).alignmentDelta || 0),
    },
    base: {
      label: String((base as any).label || "Base path"),
      riskDelta: Number((base as any).riskDelta || 0),
      alignmentDelta: Number((base as any).alignmentDelta || 0),
    },
    accelerated: {
      label: String((accelerated as any).label || "Accelerated path"),
      riskDelta: Number((accelerated as any).riskDelta || 0),
      alignmentDelta: Number((accelerated as any).alignmentDelta || 0),
    },
  };
}

export function buildForwardSimulationNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.forwardSimulation || (args.derived as any)?.forwardSimulation;
  if (!raw || typeof raw !== "object") return null;
  return {
    projectedOutcomes: takeStrings((raw as any).projectedOutcomes, 3),
  };
}

export function buildCashDeploymentPolicyNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.cashDeploymentPolicy || (args.derived as any)?.cashDeploymentPolicy;
  if (!raw || typeof raw !== "object") return null;
  return {
    mode: String((raw as any).mode || "disabled"),
    capDeployPct: Number((raw as any).capDeployPct || 0),
    rationale: String((raw as any).rationale || ""),
    regime: String((raw as any).regime || ""),
  };
}

export function buildCapitalProtectionSummaryNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.capitalProtectionSummary || (args.derived as any)?.capitalProtectionSummary;
  if (!raw || typeof raw !== "object") return null;
  return {
    posture: String((raw as any).posture || "UNKNOWN"),
    planAlignment: String((raw as any).planAlignment || "LOW"),
    riskPressure: Number((raw as any).riskPressure || 0),
    gateStatus: String((raw as any).gateStatus || "blocked"),
    killSwitchState: String((raw as any).killSwitchState || "Monitoring"),
    envelopeClass: String((raw as any).envelopeClass || "Moderate"),
    summary: String((raw as any).summary || ""),
  };
}

export function buildDecisionSourcesNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.decisionSources || (args.derived as any)?.decisionSources;
  if (!raw || typeof raw !== "object") return null;
  return {
    headline: String((raw as any).headline || "Decision sources"),
    trustLine: String((raw as any).trustLine || ""),
    sources: takeStrings((raw as any).sources, 6),
  };
}

export function buildDailyBriefing(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.daily_briefing || (args.derived as any)?.daily_briefing;
  if (!raw || typeof raw !== "object") return null;
  const market = (raw as any).market_environment && typeof (raw as any).market_environment === "object" ? (raw as any).market_environment : {};
  const health = (raw as any).portfolio_health && typeof (raw as any).portfolio_health === "object" ? (raw as any).portfolio_health : {};
  const keyRaw = (raw as any).key_opportunity && typeof (raw as any).key_opportunity === "object" ? (raw as any).key_opportunity : null;
  const statusRaw = String((health as any).status || "").toLowerCase();
  const status = statusRaw === "risk_high" ? "risk_high" : statusRaw === "watch" ? "watch" : "stable";
  const keyOpportunity = keyRaw
    ? {
        asset: String((keyRaw as any).asset || "").toUpperCase(),
        score: Number((keyRaw as any).score || 0),
        probabilityUp: Number((keyRaw as any).probability_up || 0),
        expectedMove: Number((keyRaw as any).expected_move || 0),
        recommendedPositionPct: Number((keyRaw as any).recommended_position_pct || 0),
        summary: String((keyRaw as any).summary || ""),
      }
    : null;
  return {
    enabled: Boolean((raw as any).enabled),
    generatedAt: typeof (raw as any).generated_at === "string" ? String((raw as any).generated_at) : null,
    marketSummary: String((raw as any).market_summary || ""),
    portfolioStatus: String((raw as any).portfolio_status || ""),
    keyOpportunityText: String((raw as any).key_opportunity_text || ""),
    suggestedFocus: String((raw as any).suggested_focus || ""),
    marketEnvironment: {
      marketState: String((market as any).market_state || "unknown"),
      volatility: String((market as any).volatility || "unknown"),
      momentumTone: String((market as any).momentum_tone || "neutral"),
      description: String((market as any).description || ""),
    },
    portfolioHealth: {
      healthScore: Math.max(0, Math.min(100, Math.round(Number((health as any).health_score || 0)))),
      status,
      warning: (health as any).warning ? String((health as any).warning) : null,
      description: String((health as any).description || ""),
    },
    keyOpportunity,
  };
}

export function buildOpportunityQueueNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.opportunityQueue || (args.derived as any)?.opportunityQueue;
  if (!raw || typeof raw !== "object") return null;
  const items = Array.isArray((raw as any).items)
    ? ((raw as any).items as any[])
        .map((x: any) => ({
          id: String(x?.id || ""),
          title: String(x?.title || ""),
          priority: Number(x?.priority || 0),
          riskScore: Number(x?.riskScore || 0),
          effortScore: Number(x?.effortScore || 0),
        }))
        .filter((x) => x.id || x.title)
    : [];
  return {
    topPriority: Number((raw as any).topPriority || 0),
    items: items.slice(0, 3),
  };
}

export function buildPriorityNotificationsNode(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.priorityNotifications || (args.derived as any)?.priorityNotifications;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x: any) => ({
      id: String(x?.id || ""),
      priority: String(x?.priority || "low"),
      title: String(x?.title || ""),
      detail: String(x?.detail || ""),
    }))
    .filter((x) => x.id || x.title)
    .slice(0, 3);
}

export function buildProfileBenchmark(args: { daily: Record<string, any>; derived: Record<string, any>; autopilotMode: Mode }) {
  const raw = (args.daily as any)?.profileBenchmark || (args.derived as any)?.profileBenchmark;
  if (!raw || typeof raw !== "object") return null;
  const comp = (raw as any).components && typeof (raw as any).components === "object" ? (raw as any).components : {};
  return {
    mode: String((raw as any).mode || args.autopilotMode),
    score: Math.max(0, Math.min(100, Math.round(Number((raw as any).score || 0)))),
    tier: String((raw as any).tier || "stable"),
    percentileLabel: String((raw as any).percentileLabel || "Internal benchmark"),
    summary: String((raw as any).summary || ""),
    components: {
      execution: Math.max(0, Math.min(100, Math.round(Number((comp as any).execution || 0)))),
      risk: Math.max(0, Math.min(100, Math.round(Number((comp as any).risk || 0)))),
      consistency: Math.max(0, Math.min(100, Math.round(Number((comp as any).consistency || 0)))),
      alpha: Math.max(0, Math.min(100, Math.round(Number((comp as any).alpha || 0)))),
    },
  };
}

export function buildPlanTrack(args: { daily: Record<string, any>; derived: Record<string, any> }) {
  const raw = (args.daily as any)?.planTrack || (args.derived as any)?.planTrack;
  if (!raw || typeof raw !== "object") return null;
  const phaseRaw = (raw as any).phase;
  const phase =
    phaseRaw && typeof phaseRaw === "object"
      ? {
          key: String((phaseRaw as any).key || ""),
          label: String((phaseRaw as any).label || "Plan phase"),
          goal: String((phaseRaw as any).goal || ""),
          exitWhen: String((phaseRaw as any).exitWhen || ""),
        }
      : null;
  return {
    phase,
    topAction: String((raw as any).topAction || ""),
    repeatedTopActionDays: Number((raw as any).repeatedTopActionDays || 0),
    phaseRepeatDays: Number((raw as any).phaseRepeatDays || 0),
    rotatedToday: Boolean((raw as any).rotatedToday),
    escalationNeeded: Boolean((raw as any).escalationNeeded),
    microStep: String((raw as any).microStep || ""),
    recentActions: takeStrings((raw as any).recentActions),
  };
}

export function buildDecisionHeroModel(args: {
  onRefresh: () => void;
  refreshing: boolean;
  refreshDisabled: boolean;
  overnightEvaluationHeadline: string;
  overnightEvaluationSubtext: string;
  overnightEvaluationGeneratedAtLabel: string | null;
  hasPlan: boolean;
  hasHoldings: boolean;
  holdingsCount: number;
  isBeginnerUX: boolean;
  autopilotScore: number;
  safetyScore: number | null;
  growthScore: number | null;
  pressureScore: number | null;
  cycleStateLabel: string;
  cycleStateTone: Tone;
  effectiveAccessLabel: string;
  effectiveAccessTone: Tone;
  showDetails: boolean;
  receiptsCount: number;
  lastSnapshotLabel: string;
  confirmedTodayLabel: string;
  trialUrgency: { tone: Tone; message: string } | null;
  nextBestTone: Tone;
  nextBestBadge: string;
  nextBestSubtitle: string;
  canClose: boolean;
  onCloseTheDay: () => void;
  markingDone: boolean;
  closeTheDayLabel: string;
  primaryTitle: string;
  primaryDesc: string;
  nextBestWhyNowText: string;
  doneToday: boolean;
  nextActionReady: boolean;
  nextActionCountdownLabel: string;
  nextBestReasonChips: string[];
  fallbackReasonChips: string[];
  nextBestMaskedByPaywall: boolean;
  primaryCtaAction: string | null;
  primaryCtaHref: string;
  primaryKind: string;
  primaryCtaLabel: string;
  starterPackLength: number;
  onApplyStarterPack: () => void;
  applyingStarter: boolean;
  onGoToPlanning: () => void;
  onGoToPortfolio: () => void;
  paywallPreviewStatus: string | null;
  paywallPreviewTitle: string;
  paywallPreviewMessage: string;
  paywallPreviewSubtitle: string;
  paywallPreviewReason: string;
  onOpenPaywall: () => void;
  paywallTrustLine: string;
  simpleDecisionTone: Tone;
  simpleDecision: string;
  simpleCommandLabel: string;
  simpleProbabilityEdgePct: number;
  simpleProbabilityEdgeLabel: string;
  simpleConfidencePct: number;
  simpleShortReason: string;
  simpleExecutionStreakDays: number;
}) {
  const refreshProps = {
    onRefresh: args.onRefresh,
    refreshing: args.refreshing,
    refreshDisabled: args.refreshDisabled,
  };

  return {
    introHeader: {
      section: "header" as const,
      variant: "intro" as const,
      ...refreshProps,
      overnightEvaluationHeadline: args.overnightEvaluationHeadline,
      overnightEvaluationSubtext: args.overnightEvaluationSubtext,
      overnightEvaluationGeneratedAtLabel: args.overnightEvaluationGeneratedAtLabel,
      hasPlan: args.hasPlan,
      hasHoldings: args.hasHoldings,
      holdingsCount: args.holdingsCount,
      description: "You are starting from baseline mode. This first Daily explains your score bars and what the engine will do next.",
    },
    simpleHeader: {
      section: "header" as const,
      variant: "simple" as const,
      ...refreshProps,
      description: "One decision, one action, one timer.",
    },
    defaultHeader: {
      section: "header" as const,
      variant: "default" as const,
      ...refreshProps,
      overnightEvaluationHeadline: args.overnightEvaluationHeadline,
      overnightEvaluationSubtext: args.overnightEvaluationSubtext,
      overnightEvaluationGeneratedAtLabel: args.overnightEvaluationGeneratedAtLabel,
      isBeginnerUX: args.isBeginnerUX,
      autopilotScore: args.autopilotScore,
      safetyScore: args.safetyScore,
      growthScore: args.growthScore,
      pressureScore: args.pressureScore,
      hasPlan: args.hasPlan,
      hasHoldings: args.hasHoldings,
      holdingsCount: args.holdingsCount,
      cycleStateLabel: args.cycleStateLabel,
      cycleStateTone: args.cycleStateTone,
      effectiveAccessLabel: args.effectiveAccessLabel,
      effectiveAccessTone: args.effectiveAccessTone,
      showDetails: args.showDetails,
      receiptsCount: args.receiptsCount,
      lastSnapshotLabel: args.lastSnapshotLabel,
      confirmedTodayLabel: args.confirmedTodayLabel,
      trialUrgency: args.trialUrgency,
    },
    advancedCard: {
      section: "card" as const,
      variant: "advanced" as const,
      isBeginnerUX: args.isBeginnerUX,
      nextBestTone: args.nextBestTone,
      nextBestBadge: args.nextBestBadge,
      nextBestSubtitle: args.nextBestSubtitle,
      canClose: args.canClose,
      onCloseTheDay: args.onCloseTheDay,
      markingDone: args.markingDone,
      closeTheDayLabel: args.closeTheDayLabel,
      primaryTitle: args.primaryTitle,
      primaryDesc: args.primaryDesc,
      nextBestWhyNowText: args.nextBestWhyNowText,
      doneToday: args.doneToday,
      nextActionReady: args.nextActionReady,
      nextActionCountdownLabel: args.nextActionCountdownLabel,
      nextBestReasonChips: args.nextBestReasonChips,
      fallbackReasonChips: args.fallbackReasonChips,
      nextBestMaskedByPaywall: args.nextBestMaskedByPaywall,
      primaryCtaAction: args.primaryCtaAction,
      primaryCtaHref: args.primaryCtaHref,
      primaryKind: args.primaryKind,
      primaryCtaLabel: args.primaryCtaLabel,
      starterPackLength: args.starterPackLength,
      hasPlan: args.hasPlan,
      hasHoldings: args.hasHoldings,
      onApplyStarterPack: args.onApplyStarterPack,
      applyingStarter: args.applyingStarter,
      onGoToPlanning: args.onGoToPlanning,
      onGoToPortfolio: args.onGoToPortfolio,
      paywallPreviewStatus: args.paywallPreviewStatus,
      paywallPreviewTitle: args.paywallPreviewTitle,
      paywallPreviewMessage: args.paywallPreviewMessage,
      paywallPreviewSubtitle: args.paywallPreviewSubtitle,
      paywallPreviewReason: args.paywallPreviewReason,
      onOpenPaywall: args.onOpenPaywall,
      paywallTrustLine: args.paywallTrustLine,
    },
    simpleCard: {
      section: "card" as const,
      variant: "simple" as const,
      simpleDecisionTone: args.simpleDecisionTone,
      simpleDecision: args.simpleDecision,
      simpleCommandLabel: args.simpleCommandLabel,
      simpleProbabilityEdgePct: args.simpleProbabilityEdgePct,
      simpleProbabilityEdgeLabel: args.simpleProbabilityEdgeLabel,
      simpleConfidencePct: args.simpleConfidencePct,
      simpleShortReason: args.simpleShortReason,
      simpleExecutionStreakDays: args.simpleExecutionStreakDays,
    },
  };
}

export function buildTodayActionsModel(args: {
  directBrokerConnected: boolean;
  doneToday: boolean;
  manualExecutionPending: any;
  manualBrokerProfile: any;
  runningOperator: boolean;
  onExecuteClick: () => void;
  onCopyBrokerExecutionScript: () => void;
  simpleExecutionStepRequired: boolean;
  capitalActionCenterModel: any;
  simpleExecutionInstruction: string;
  cycleState: any;
  onPrimaryAction: () => void;
  manualExecutionConfirmed: boolean;
  actionGate: any;
  nextBestMaskedByPaywall: boolean;
  brokerRealityChecks: any[];
  needsSetupAction: boolean;
  executeStepReady: boolean;
  canClose: boolean;
  markingDone: boolean;
  closeDayLabel: string;
  closeDayHint: string;
  manualExecutionRequired: boolean;
  manualExecutionProofReady: boolean;
  openLeakCount: number;
  onSetupClick: () => void;
  onCloseClick: () => void;
  onFixTopRisk: () => void;
  firstDailyMinimalFlow: boolean;
  canFixNow: boolean;
  starterWarmupEffective: boolean;
  closeStepEmphasis: boolean;
  onFixClick: () => void;
  fixAuditMeta: any;
  fixAuditRows: any[];
  onOpenFixAudit: () => void;
  manualExecutionGateMinQuality: number;
  manualExecutionGateRequireReference: boolean;
  manualExecutionReminder: any;
  manualFixRows: any[];
  onOpenManualChecklist: () => void;
  onRunExecuteForMe: () => void;
  onRefreshDaily: () => void;
  manualExecutionProof: any;
  suitability: any;
  profileIntake: any;
  autopilotMode: Mode;
  title: string;
  subtitle: string;
  simpleGuide: any;
  advancedModeEnabled: boolean;
  showAdvancedToday: boolean;
  operatorLog: any[];
  onRunSimpleGuideAction: () => void;
  onToggleAdvancedToday: () => void;
  showExtendedActionCards: boolean;
  whyNow: any;
  onRefresh: () => void;
  actionGateAlert: any;
  gateAlertTone: Tone;
  profileProtocol: any;
  canRunExecute: boolean;
  executionBlockedReason: string | null;
  showDetails: boolean;
  isPaid: boolean;
  isProUX: boolean;
  brokerPrefs: any;
  handsFreeFixNow: boolean;
  hasHoldings: boolean;
  starterPack: any[];
  starterPackMeta: any;
  starterBudgetValue: number;
  starterPresetBudgets: number[];
  applyingStarter: boolean;
  starterUsesLiveQuotes: boolean;
  onToggleHandsFree: () => void;
  onSyncNow: () => void;
  onStarterBudgetChange: (value: number) => void;
  onRefreshAllocation: () => void;
  onApplyStarterPack: () => void;
  directiveBlockedByStartHere: boolean;
  directive: any;
  stalePricingLeak: any;
  riskFixPlan: any;
  directiveCandidates: any[];
  onRefreshPricing: () => void;
  onFixRiskNow: () => void;
}) {
  return {
    brokerScript: {
      section: "brokerScript" as const,
      directBrokerConnected: args.directBrokerConnected,
      doneToday: args.doneToday,
      manualExecutionPending: args.manualExecutionPending,
      manualBrokerProfile: args.manualBrokerProfile,
      runningOperator: args.runningOperator,
      onExecuteClick: args.onExecuteClick,
      onCopyBrokerExecutionScript: args.onCopyBrokerExecutionScript,
    },
    manualBrokerIntro: {
      section: "manualBrokerIntro" as const,
      directBrokerConnected: args.directBrokerConnected,
      manualBrokerProfile: args.manualBrokerProfile,
      runningOperator: args.runningOperator,
      onExecuteClick: args.onExecuteClick,
    },
    simpleExecutionStep: {
      section: "simpleExecutionStep" as const,
      simpleExecutionStepRequired: args.simpleExecutionStepRequired,
      capitalActionCenterModel: args.capitalActionCenterModel,
      manualBrokerProfile: args.manualBrokerProfile,
      simpleExecutionInstruction: args.simpleExecutionInstruction,
      cycleState: args.cycleState,
      runningOperator: args.runningOperator,
      onPrimaryAction: args.onPrimaryAction,
    },
    operationalAction: {
      section: "operationalAction" as const,
      capitalActionCenterModel: args.capitalActionCenterModel,
      cycleState: args.cycleState,
      manualExecutionPending: args.manualExecutionPending,
      manualExecutionConfirmed: args.manualExecutionConfirmed,
      actionGate: args.actionGate,
      nextBestMaskedByPaywall: args.nextBestMaskedByPaywall,
      runningOperator: args.runningOperator,
      manualBrokerProfile: args.manualBrokerProfile,
      onPrimaryAction: args.onPrimaryAction,
    },
    beforeLeave: {
      section: "beforeLeave" as const,
      brokerRealityChecks: args.brokerRealityChecks,
    },
    simpleFlow: {
      section: "simpleFlow" as const,
      doneToday: args.doneToday,
      needsSetupAction: args.needsSetupAction,
      runningOperator: args.runningOperator,
      executeStepReady: args.executeStepReady,
      cycleState: args.cycleState,
      canClose: args.canClose,
      markingDone: args.markingDone,
      closeDayLabel: args.closeDayLabel,
      closeDayHint: args.closeDayHint,
      manualExecutionRequired: args.manualExecutionRequired,
      manualExecutionProofReady: args.manualExecutionProofReady,
      openLeakCount: args.openLeakCount,
      onSetupClick: args.onSetupClick,
      onExecuteClick: args.onExecuteClick,
      onCloseClick: args.onCloseClick,
      onFixTopRisk: args.onFixTopRisk,
    },
    actionDock: {
      section: "actionDock" as const,
      firstDailyMinimalFlow: args.firstDailyMinimalFlow,
      doneToday: args.doneToday,
      cycleState: args.cycleState,
      needsSetupAction: args.needsSetupAction,
      runningOperator: args.runningOperator,
      executeStepReady: args.executeStepReady,
      canFixNow: args.canFixNow,
      openLeakCount: args.openLeakCount,
      starterWarmupEffective: args.starterWarmupEffective,
      canClose: args.canClose,
      markingDone: args.markingDone,
      closeStepEmphasis: args.closeStepEmphasis,
      closeDayLabel: args.closeDayLabel,
      closeDayHint: args.closeDayHint,
      manualExecutionRequired: args.manualExecutionRequired,
      manualExecutionProofReady: args.manualExecutionProofReady,
      onSetupClick: args.onSetupClick,
      onExecuteClick: args.onExecuteClick,
      onFixClick: args.onFixClick,
      onCloseClick: args.onCloseClick,
    },
    manualStatus: {
      section: "manualStatus" as const,
      fixAuditMeta: args.fixAuditMeta,
      fixAuditRows: args.fixAuditRows,
      onOpenFixAudit: args.onOpenFixAudit,
      manualExecutionPending: args.manualExecutionPending,
      manualExecutionGateMinQuality: args.manualExecutionGateMinQuality,
      manualExecutionGateRequireReference: args.manualExecutionGateRequireReference,
      manualExecutionReminder: args.manualExecutionReminder,
      manualFixRows: args.manualFixRows,
      onOpenManualChecklist: args.onOpenManualChecklist,
      onRunExecuteForMe: args.onRunExecuteForMe,
      onRefreshDaily: args.onRefreshDaily,
      manualExecutionProof: args.manualExecutionProof,
      manualExecutionConfirmed: args.manualExecutionConfirmed,
    },
    suitability: {
      section: "suitability" as const,
      suitability: args.suitability,
      autopilotMode: args.autopilotMode,
    },
    profileIntake: {
      section: "profileIntake" as const,
      profileIntake: args.profileIntake,
      autopilotMode: args.autopilotMode,
    },
    startHere: {
      section: "startHere" as const,
      firstDailyMinimalFlow: args.firstDailyMinimalFlow,
      doneToday: args.doneToday,
      title: args.title,
      subtitle: args.subtitle,
      simpleGuide: args.simpleGuide,
      runningOperator: args.runningOperator,
      manualExecutionPending: args.manualExecutionPending,
      directBrokerConnected: args.directBrokerConnected,
      advancedModeEnabled: args.advancedModeEnabled,
      showAdvancedToday: args.showAdvancedToday,
      operatorLog: args.operatorLog,
      onRunSimpleGuideAction: args.onRunSimpleGuideAction,
      onExecuteClick: args.onExecuteClick,
      onToggleAdvancedToday: args.onToggleAdvancedToday,
    },
    qualityGate: {
      section: "qualityGate" as const,
      showExtendedActionCards: args.showExtendedActionCards,
      actionGate: args.actionGate,
      whyNow: args.whyNow,
      onRefresh: args.onRefresh,
      actionGateAlert: args.actionGateAlert,
      gateAlertTone: args.gateAlertTone,
    },
    executionProtocol: {
      section: "executionProtocol" as const,
      showExtendedActionCards: args.showExtendedActionCards,
      profileProtocol: args.profileProtocol,
      canRunExecute: args.canRunExecute,
      executionBlockedReason: args.executionBlockedReason,
      runningOperator: args.runningOperator,
      directBrokerConnected: args.directBrokerConnected,
      autopilotMode: args.autopilotMode,
      onExecuteClick: args.onExecuteClick,
      onRefresh: args.onRefresh,
    },
    autonomyPlanner: {
      section: "autonomyPlanner" as const,
      showDetails: args.showDetails,
      isPaid: args.isPaid,
      isProUX: args.isProUX,
      directBrokerConnected: args.directBrokerConnected,
      brokerPrefs: args.brokerPrefs,
      handsFreeFixNow: args.handsFreeFixNow,
      autopilotMode: args.autopilotMode,
      hasHoldings: args.hasHoldings,
      starterPack: args.starterPack,
      starterPackMeta: args.starterPackMeta,
      starterBudgetValue: args.starterBudgetValue,
      starterPresetBudgets: args.starterPresetBudgets,
      applyingStarter: args.applyingStarter,
      starterUsesLiveQuotes: args.starterUsesLiveQuotes,
      onToggleHandsFree: args.onToggleHandsFree,
      onSyncNow: args.onSyncNow,
      onStarterBudgetChange: args.onStarterBudgetChange,
      onRefreshAllocation: args.onRefreshAllocation,
      onApplyStarterPack: args.onApplyStarterPack,
    },
    directive: {
      section: "directive" as const,
      showExtendedActionCards: args.showExtendedActionCards,
      directiveBlockedByStartHere: args.directiveBlockedByStartHere,
      simpleGuide: args.simpleGuide,
      directive: args.directive,
      stalePricingLeak: args.stalePricingLeak,
      riskFixPlan: args.riskFixPlan,
      directiveCandidates: args.directiveCandidates,
      hasHoldings: args.hasHoldings,
      starterPack: args.starterPack,
      starterPackMeta: args.starterPackMeta,
      onRunSimpleGuideAction: args.onRunSimpleGuideAction,
      onRefreshPricing: args.onRefreshPricing,
      onFixRiskNow: args.onFixRiskNow,
    },
  };
}

export function buildOpportunityPanelModel(args: {
  simpleDecisionRationaleLines: string[];
  whyThisDecisionMain: string;
  showDetails: boolean;
  whyDecisionSignals: string[];
  opportunityQueueNode: any;
  decisionSourcesNode: any;
}) {
  return {
    simple: {
      layout: "simple" as const,
      simpleDecisionRationaleLines: args.simpleDecisionRationaleLines,
    },
    explanation: {
      layout: "explanation" as const,
      whyThisDecisionMain: args.whyThisDecisionMain,
      showDetails: args.showDetails,
      whyDecisionSignals: args.whyDecisionSignals,
    },
    supporting: {
      layout: "supporting" as const,
      decisionSourcesNode: args.decisionSourcesNode,
      opportunityQueueNode: args.opportunityQueueNode,
    },
    opportunityQueueInline: {
      section: "opportunityQueueInline" as const,
      opportunityQueueNode: args.opportunityQueueNode,
    },
  };
}

export function buildMarketPulseModel(args: {
  dailyBriefing: any;
  expectedOutcomeModel: any;
  growthReadinessScore: number;
  capitalMomentumModel: any;
  syntrakeOperationalState: string;
  syntrakeOperationalLabel: string;
  syntrakeStatusSummary: string;
  syntrakeLastEvaluationAt: string | null;
  syntrakeCapitalPosture: string;
  dailyScoresNode: any;
  dailyPortfolioScore: any;
  autopilotScore: number;
  pressureScore: number | null;
  syntrakeNextEvaluationCountdown: string;
  decisionPreviewOnly: boolean;
  decisionExposure: string;
  syntrakeEngineVersion: string;
  syntrakePriorityClass: string | null;
  syntrakeAggression: string | null;
  dailyLoopStage: string | null;
  capitalProtectionSummaryNode: any;
  killSwitchNode: any;
  preTradeSafetyCheck: any;
  riskEnvelopeNode: any;
  riskPolicyNode: any;
  growthReadinessNode: any;
  weeklyValueNode: any;
  preExecutionSimulationNode: any;
  opportunityQueueContent: ReactNode;
  priorityNotificationsNode: any[];
  continuityLastAt: string | null;
  continuityCountdown: string | null;
  continuityNextAt: string | null;
  dailyTrendsNode: any;
  deltaLineText: string;
  continuityTrendChips: string[];
  progressWhatChanged: string[];
  operationalTone: "good" | "warn" | "bad";
  operationalScore: number;
  progressMeaningLine: string;
  holdProgressLine: string | null;
  antiChurnNode: any;
  weeklyPremiumReportNode: any;
  dailyReplayAudit: any;
  dailyEngineV4: any;
  dailyScoreAudit: any;
  dailyEngineV4Scores: any;
  dailyAuditTrail: any;
  scoreAuditNotes: string[];
  executionScore: any;
  executionScoreTone: "good" | "warn" | "bad";
  executionCoach: any;
  dailyExecutionEvidence: any;
  syntrakeTraceRows: any[];
  dailyScoreBars: any[];
  showProof: boolean;
  moneyConfirmed: any;
  proof: any;
  riskLeaks: any[];
  streak: number;
  performance: any;
  showWealth: boolean;
  wealthScenarios: any[];
  wealthStarting: number;
  wealthMonthly: number;
  wealthTarget: number;
  autopilotMode: Mode;
  showDecisionPressure: boolean;
  pressureDrivers: any[];
}) {
  return {
    context: {
      section: "context" as const,
      dailyBriefing: args.dailyBriefing,
      expectedOutcomeModel: args.expectedOutcomeModel,
      growthReadinessScore: args.growthReadinessScore,
      capitalMomentumModel: args.capitalMomentumModel,
    },
    status: {
      section: "status" as const,
      syntrakeOperationalState: args.syntrakeOperationalState,
      syntrakeOperationalLabel: args.syntrakeOperationalLabel,
      syntrakeStatusSummary: args.syntrakeStatusSummary,
      syntrakeLastEvaluationAt: args.syntrakeLastEvaluationAt,
      syntrakeCapitalPosture: args.syntrakeCapitalPosture,
      dailyScoresNode: args.dailyScoresNode,
      dailyPortfolioScore: args.dailyPortfolioScore,
      autopilotScore: args.autopilotScore,
      pressureScore: args.pressureScore,
      syntrakeNextEvaluationCountdown: args.syntrakeNextEvaluationCountdown,
      decisionPreviewOnly: args.decisionPreviewOnly,
      decisionExposure: args.decisionExposure,
      syntrakeEngineVersion: args.syntrakeEngineVersion,
      syntrakePriorityClass: args.syntrakePriorityClass,
      syntrakeAggression: args.syntrakeAggression,
      dailyLoopStage: args.dailyLoopStage,
    },
    protection: {
      section: "protection" as const,
      capitalProtectionSummaryNode: args.capitalProtectionSummaryNode,
      killSwitchNode: args.killSwitchNode,
      preTradeSafetyCheck: args.preTradeSafetyCheck,
      riskEnvelopeNode: args.riskEnvelopeNode,
      riskPolicyNode: args.riskPolicyNode,
      growthReadinessNode: args.growthReadinessNode,
      weeklyValueNode: args.weeklyValueNode,
      preExecutionSimulationNode: args.preExecutionSimulationNode,
      opportunityQueueContent: args.opportunityQueueContent,
      priorityNotificationsNode: args.priorityNotificationsNode,
      continuityLastAt: args.continuityLastAt,
      continuityCountdown: args.continuityCountdown,
      continuityNextAt: args.continuityNextAt,
      dailyTrendsNode: args.dailyTrendsNode,
      deltaLineText: args.deltaLineText,
      continuityTrendChips: args.continuityTrendChips,
      progressWhatChanged: args.progressWhatChanged,
      operationalTone: args.operationalTone,
      operationalScore: args.operationalScore,
      progressMeaningLine: args.progressMeaningLine,
      holdProgressLine: args.holdProgressLine,
      antiChurnNode: args.antiChurnNode,
      weeklyPremiumReportNode: args.weeklyPremiumReportNode,
    },
    advancedDiagnostics: {
      section: "advancedDiagnostics" as const,
      dailyLoopStage: args.dailyLoopStage,
      decisionPreviewOnly: args.decisionPreviewOnly,
      decisionExposure: args.decisionExposure,
      dailyReplayAudit: args.dailyReplayAudit,
      dailyEngineV4: args.dailyEngineV4,
      dailyScoreAudit: args.dailyScoreAudit,
      dailyScoresNode: args.dailyScoresNode,
      autopilotScore: args.autopilotScore,
      pressureScore: args.pressureScore,
      dailyEngineV4Scores: args.dailyEngineV4Scores,
      dailyAuditTrail: args.dailyAuditTrail,
      scoreAuditNotes: args.scoreAuditNotes,
      executionScore: args.executionScore,
      executionScoreTone: args.executionScoreTone,
      executionCoach: args.executionCoach,
      dailyExecutionEvidence: args.dailyExecutionEvidence,
      syntrakeTraceRows: args.syntrakeTraceRows,
    },
    scorebars: {
      section: "scorebars" as const,
      autopilotScore: args.autopilotScore,
      dailyScoreBars: args.dailyScoreBars,
    },
    proof: args.showProof
      ? {
          section: "proof" as const,
          moneyConfirmed: args.moneyConfirmed,
          proof: args.proof,
          riskLeaks: args.riskLeaks,
          pressureScore: args.pressureScore,
          streak: args.streak,
          performance: args.performance,
        }
      : null,
    wealth: args.showWealth || args.showDecisionPressure
      ? {
          section: "wealth" as const,
          showWealth: args.showWealth,
          wealthScenarios: args.wealthScenarios,
          wealthStarting: args.wealthStarting,
          wealthMonthly: args.wealthMonthly,
          wealthTarget: args.wealthTarget,
          autopilotMode: args.autopilotMode,
          showDecisionPressure: args.showDecisionPressure,
          pressureScore: args.pressureScore,
          pressureDrivers: args.pressureDrivers,
        }
      : null,
  };
}

export function buildDailyLoopModel(args: {
  isBeginnerUX: boolean;
  nextActionReady: boolean;
  nextActionCountdownLabel: string;
  doneToday: boolean;
  nextActionTargetMs: number;
  nextActionEngineMessage: string;
  dailyExecutionEvidence: any;
  weeklyValueNode: any;
  dailyStreakNode: any;
  streak: number;
  onRefreshLoopStatus: () => void;
  hasLastReceipt: boolean;
  onOpenLastReceipt: () => void;
  deltaLineText: string | null;
  whatNextLine: string;
  whatNextMessage: string | null;
  continuityTrendChips: string[];
  monitoringStreakCount: number;
  onContinue: () => void;
  executionProofSummary: any;
  executionProofLoading: boolean;
  executionProofs: any[];
  executionProofExpanded: Record<string, boolean>;
  setExecutionProofExpanded: any;
  onExportExecutionProofs: (format: "csv" | "json", days: number) => void;
  planTrack: any;
  followUpPlan: any;
  followUpStatusView: string | null | undefined;
  showExtendedActionCards: boolean;
  profileBenchmark: any;
  profileBenchmarkTone: Tone | string;
  operationalTone: Tone | string;
  operationalScore: number;
  weeklyReceipts: number;
  weeklyMissionTarget: number;
  weeklyMissionRemaining: number;
  openLeakCount: number;
  weeklyConfirmedEur: number;
  executionModelLabel: string;
  directBrokerConnected: boolean;
  markingDone: boolean;
  onRefreshProof: () => void;
  onFixLeaksNow: () => void;
  onCloseDay: () => void;
  executionScore: any;
  executionScoreTone: Tone | string;
  executionCoach: any;
  weeklyReview: any;
  conversionFunnel: any;
  conversionFunnelLoading: boolean;
  ownerLoopKpis: any;
  ownerLoopKpisLoading: boolean;
  globalConversionFunnel: any;
  globalConversionLoading: boolean;
  onExportExecutionCsv: () => void;
  onExportExecutionJson: () => void;
  weeklyMissionPct: number;
  showDetails: boolean;
  engineActivityLoading: boolean;
  engineActivity: any;
  engineReliabilityLoading: boolean;
  engineReliability: any;
  setupScore: number;
  setupChecks: any[];
  nextSetupStep: any;
  moneyConfirmed: any;
  canClose: boolean;
  onRefreshMissionStatus: () => void;
  trackRecordLoading: boolean;
  trackRecord: any;
  onRefreshTrackRecord: () => void;
  onCopyProgressShare: () => void;
  copyingShare: boolean;
  receiptsTimeline: any[];
}) {
  return {
    timer: {
      section: "timer" as const,
      isBeginnerUX: args.isBeginnerUX,
      nextActionReady: args.nextActionReady,
      nextActionCountdownLabel: args.nextActionCountdownLabel,
      doneToday: args.doneToday,
      nextActionTargetMs: args.nextActionTargetMs,
      nextActionEngineMessage: args.nextActionEngineMessage,
    },
    postClose: {
      section: "postClose" as const,
      doneToday: args.doneToday,
      nextActionReady: args.nextActionReady,
      nextActionTargetMs: args.nextActionTargetMs,
      dailyExecutionEvidence: args.dailyExecutionEvidence,
      weeklyValueNode: args.weeklyValueNode,
      dailyStreakNode: args.dailyStreakNode,
      streak: args.streak,
      onRefreshLoopStatus: args.onRefreshLoopStatus,
      hasLastReceipt: args.hasLastReceipt,
      onOpenLastReceipt: args.onOpenLastReceipt,
    },
    continuity: {
      section: "continuity" as const,
      deltaLineText: args.deltaLineText,
      whatNextLine: args.whatNextLine,
      whatNextMessage: args.whatNextMessage,
      continuityTrendChips: args.continuityTrendChips,
      monitoringStreakCount: args.monitoringStreakCount,
    },
    introNext: {
      section: "introNext" as const,
      onContinue: args.onContinue,
    },
    evidenceFollowUp: {
      section: "evidenceFollowUp" as const,
      executionProofSummary: args.executionProofSummary,
      executionProofLoading: args.executionProofLoading,
      executionProofs: args.executionProofs,
      executionProofExpanded: args.executionProofExpanded,
      setExecutionProofExpanded: args.setExecutionProofExpanded,
      onExportExecutionProofs: args.onExportExecutionProofs,
      planTrack: args.planTrack,
    },
    followUpSla: {
      section: "followUpSla" as const,
      followUpPlan: args.followUpPlan,
      followUpStatusView: args.followUpStatusView,
    },
    profileProof: {
      section: "profileProof" as const,
      showExtendedActionCards: args.showExtendedActionCards,
      profileBenchmark: args.profileBenchmark,
      profileBenchmarkTone: args.profileBenchmarkTone,
      operationalTone: args.operationalTone,
      operationalScore: args.operationalScore,
      weeklyReceipts: args.weeklyReceipts,
      weeklyMissionTarget: args.weeklyMissionTarget,
      weeklyMissionRemaining: args.weeklyMissionRemaining,
      openLeakCount: args.openLeakCount,
      weeklyConfirmedEur: args.weeklyConfirmedEur,
      executionModelLabel: args.executionModelLabel,
      directBrokerConnected: args.directBrokerConnected,
      doneToday: args.doneToday,
      markingDone: args.markingDone,
      onRefreshProof: args.onRefreshProof,
      onFixLeaksNow: args.onFixLeaksNow,
      onCloseDay: args.onCloseDay,
    },
    advancedTelemetry: {
      section: "advancedTelemetry" as const,
      showExtendedActionCards: args.showExtendedActionCards,
      executionScore: args.executionScore,
      executionScoreTone: args.executionScoreTone,
      executionCoach: args.executionCoach,
      weeklyReview: args.weeklyReview,
      conversionFunnel: args.conversionFunnel,
      conversionFunnelLoading: args.conversionFunnelLoading,
      ownerLoopKpis: args.ownerLoopKpis,
      ownerLoopKpisLoading: args.ownerLoopKpisLoading,
      globalConversionFunnel: args.globalConversionFunnel,
      globalConversionLoading: args.globalConversionLoading,
      onExportExecutionCsv: args.onExportExecutionCsv,
      onExportExecutionJson: args.onExportExecutionJson,
    },
    operationsTelemetry: {
      section: "operationsTelemetry" as const,
      showExtendedActionCards: args.showExtendedActionCards,
      weeklyMissionPct: args.weeklyMissionPct,
      doneToday: args.doneToday,
      streak: args.streak,
      weeklyReceipts: args.weeklyReceipts,
      weeklyMissionRemaining: args.weeklyMissionRemaining,
      showDetails: args.showDetails,
      engineActivityLoading: args.engineActivityLoading,
      engineActivity: args.engineActivity,
      engineReliabilityLoading: args.engineReliabilityLoading,
      engineReliability: args.engineReliability,
      setupScore: args.setupScore,
      setupChecks: args.setupChecks,
      nextSetupStep: args.nextSetupStep,
      weeklyMissionTarget: args.weeklyMissionTarget,
      moneyConfirmed: args.moneyConfirmed,
      canClose: args.canClose,
      markingDone: args.markingDone,
      onCloseDay: args.onCloseDay,
      onRefreshMissionStatus: args.onRefreshMissionStatus,
    },
    trackRecord: {
      section: "trackRecord" as const,
      showExtendedActionCards: args.showExtendedActionCards,
      trackRecordLoading: args.trackRecordLoading,
      trackRecord: args.trackRecord,
      onRefreshTrackRecord: args.onRefreshTrackRecord,
      onCopyProgressShare: args.onCopyProgressShare,
      copyingShare: args.copyingShare,
      receiptsTimeline: args.receiptsTimeline,
    },
  };
}

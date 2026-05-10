// app/api/daily-bundle/route.ts
import { NextResponse } from "next/server";
import { getRequestUserId } from "@/lib/auth/requestUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";
import { getStarterPack } from "@/lib/signalcore/starterPack";
import { buildDynamicStarterPack } from "@/lib/signalcore/dynamicStarterPack";
import { getQuotes } from "@/lib/signalcore/marketData";
import { normSymbol } from "@/lib/market/symbols";
import { computePortfolioValuation } from "@/lib/signalcore/valuation";
import { ACTIVE_PLAN_LOOKBACK_LIMIT, isPlanActiveRecord, pickActivePlan } from "@/lib/signalcore/planRepo";
import { buildEngineContext } from "@/lib/engine/v4/context";
import { computeDailyBundleV4 } from "@/lib/engine/v4";
import { isEngineV4EnabledForMode } from "@/lib/engine/version";
import { writeEngineEvent } from "@/lib/engine/events";
import { buildDailyDecisionPayload } from "@/lib/decision/DailyDecisionService";
import type { DecisionEnvelopeBranch } from "@/lib/decision/types";
import { computeScoresAndReplayAudit } from "@/lib/signalcore/scoresAuditReplay";
import { getBillingStateUser } from "@/lib/signalcore/access";
import {
  getEntitlementsForTier,
  resolveAccessTier,
  type AccessTier,
} from "@/lib/signalcore/entitlements";
import { applyDailyBundleEntitlements } from "@/lib/signalcore/dailyBundleEntitlements";
import { resolveModeAccess } from "@/lib/signalcore/modeAccess";
import { buildTradingLightScannerInputs } from "@/lib/trading/lightScanner";
import {
  readFreshTradingScannerSnapshots,
  writeTradingScannerSnapshots,
} from "@/lib/trading/scannerSnapshotStore";
import type { ComposeTradingLiveDecisionInput } from "@/lib/trading/state";
import { computeDecisionImpact } from "@/lib/signalcore/decisionImpact";
import { deriveRiskPolicy, evaluateRiskPolicy, type RiskPolicy, type RiskPolicyEvaluation } from "@/lib/signalcore/riskPolicy";
import { computeDecisionGovernance } from "@/lib/engine/decisionGovernance";
import { buildDailyBriefingFromDecisionGovernance } from "@/lib/engine/dailyBriefing";
import {
  buildCashDeploymentPolicy,
  computeOperationalAction,
  buildOpportunityQueue,
  buildPreTradeSafetyCheck,
  buildPriorityNotifications,
  buildWeeklyPremiumReport,
  computePreExecutionSimulation,
  computeAntiChurnState,
  computeDecisionSourceTransparency,
  computeGrowthReadiness,
  computeKillSwitchState,
  computeRiskEnvelope,
  computeWeeklyValueMetrics,
  enforceActionGateWithPreTrade,
  isRiskEscalationAction,
} from "@/lib/signalcore/dailyEnhancements";
import {
  computeDiagnostics,
  buildCandidates,
  buildNBA,
  scoreExplained,
  computeDecisionPressure,
  proofFirst,
} from "@/lib/signalcore/engineV3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeComputeDailyEngineV4(args: {
  userId: string;
  mode: AutopilotMode;
  asOf: string;
  setupStatus?: string | null;
  plan?: Record<string, any> | null;
  portfolioItems?: Array<Record<string, any>> | null;
  valuation?: Record<string, any> | null;
  quotes?: Record<string, any> | null;
  doneToday: boolean;
  receiptsCount: number;
  streak: number;
  lastSnapshotAt?: string | null;
  executionEvidence?: Record<string, any> | null;
  timeline?: Array<Record<string, any>> | null;
  topRiskLeakKey?: string | null;
  topRiskLeakTitle?: string | null;
  topRiskLeakSeverity?: string | null;
}) {
  if (!isEngineV4EnabledForMode(args.mode)) return undefined;
  try {
    const timelineRows = Array.isArray(args.timeline) ? args.timeline : [];
    const closedDays7 = timelineRows.filter((row) => String((row as any)?.dayKey || "").trim().length > 0).length;
    const executionEvidence = (args.executionEvidence && typeof args.executionEvidence === "object"
      ? args.executionEvidence
      : null) as Record<string, any> | null;
    const leakSeverityRaw = String(args.topRiskLeakSeverity || "").trim().toLowerCase();
    const leakSeverity = leakSeverityRaw === "low" || leakSeverityRaw === "medium" || leakSeverityRaw === "high"
      ? leakSeverityRaw
      : null;

    const ctx = buildEngineContext({
      userId: args.userId,
      mode: args.mode,
      asOf: args.asOf,
      setupStatus: args.setupStatus ?? null,
      plan: args.plan ?? null,
      portfolioItems: args.portfolioItems ?? [],
      portfolioCashEur: args.valuation ? Number((args.valuation as any)?.cashEur || 0) : 0,
      valuation: args.valuation ?? null,
      quotes: args.quotes ?? {},
      dailyState: {
        doneToday: !!args.doneToday,
        receiptsCount: Math.max(0, Number(args.receiptsCount || 0)),
        streak: Math.max(0, Number(args.streak || 0)),
        lastSnapshotAt: args.lastSnapshotAt ?? null,
        lastProofAt: executionEvidence?.latestAt ?? null,
        lastProofQuality:
          executionEvidence?.avgQuality14 != null ? Number(executionEvidence.avgQuality14) : null,
      },
      reliability: {
        executionRate7d:
          executionEvidence?.strongProofDays7 != null
            ? Math.max(0, Math.min(1, Number(executionEvidence.strongProofDays7) / 7))
            : null,
        closeDayRate7d: Math.max(0, Math.min(1, closedDays7 / 7)),
        dataCoveragePct:
          args.valuation && ((args.valuation as any)?.liveCoveragePct != null || (args.valuation as any)?.coveragePct != null)
            ? Number((args.valuation as any).liveCoveragePct ?? (args.valuation as any).coveragePct)
            : 0,
      },
      access: {
        isPro: null,
        modeAllowed: true,
      },
      signals: {
        topRiskLeakKey: args.topRiskLeakKey ?? null,
        topRiskLeakTitle: args.topRiskLeakTitle ?? null,
        topRiskLeakSeverity: leakSeverity,
      },
    });
    return computeDailyBundleV4(ctx);
  } catch (error) {
    console.error("[daily-bundle] engineV4 fallback -> v3", error);
    return undefined;
  }
}

function addHoursIso(baseIso: string, hours: number) {
  const base = new Date(baseIso);
  const ms = Number.isFinite(base.getTime()) ? base.getTime() : Date.now();
  return new Date(ms + Math.max(1, hours) * 60 * 60 * 1000).toISOString();
}

function safeIsoMs(baseIso: string) {
  const t = new Date(baseIso).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function nextUtcSlotIso(baseIso: string, stepMinutes: number, minLeadMinutes = 1) {
  const stepMs = Math.max(1, Math.round(stepMinutes)) * 60 * 1000;
  const leadMs = Math.max(0, Math.round(minLeadMinutes)) * 60 * 1000;
  const targetMs = safeIsoMs(baseIso) + leadMs;
  const nextMs = Math.ceil(targetMs / stepMs) * stepMs;
  return new Date(nextMs).toISOString();
}

function normalizeLoopSpecActionType(input: any): LoopSpecActionType {
  const x = String(input || "").trim().toUpperCase();
  if (x === "EXECUTE_BROKER" || x === "CLOSE_DAY" || x === "ENTER" || x === "ADD" || x === "REDUCE" || x === "EXIT" || x === "HOLD" || x === "PAUSE") {
    return x as LoopSpecActionType;
  }
  return "HOLD";
}

function mapEngineV4KindToLoopType(kind: any): LoopSpecActionType {
  const k = String(kind || "").trim().toUpperCase();
  if (k === "EXECUTE_STARTER_PACK" || k === "MANUAL_BROKER_CHECKLIST") return "EXECUTE_BROKER";
  if (k === "ENTER_POSITION") return "ENTER";
  if (k === "DEPLOY_CASH") return "ADD";
  if (k === "REDUCE_CONCENTRATION" || k === "REBALANCE" || k === "HEDGE_RISK" || k === "ADJUST_STOPS") return "REDUCE";
  if (k === "EXIT_POSITION") return "EXIT";
  if (k === "PAUSE") return "PAUSE";
  if (k === "WAIT" || k === "HOLD") return "HOLD";
  return "HOLD";
}

function mapNbaToLoopType(args: { nba: any; actionGate: any; doneToday: boolean; hasProofToday: boolean }): LoopSpecActionType {
  if (args.doneToday) return "HOLD";
  if (args.hasProofToday) return "CLOSE_DAY";

  const ctaAction = normalizeActionKey((args.nba as any)?.cta?.action || (args.nba as any)?.action || "");
  const title = String((args.nba as any)?.title || "").toLowerCase();
  const desc = String((args.nba as any)?.desc || "").toLowerCase();
  const gateStatus = String((args.actionGate as any)?.status || "").toLowerCase();
  const allowExecution = Boolean((args.actionGate as any)?.allowExecution);

  if (gateStatus === "blocked" || !allowExecution) return "PAUSE";
  if (ctaAction?.includes("checklist") || ctaAction?.includes("broker") || title.includes("checklist") || desc.includes("broker")) return "EXECUTE_BROKER";
  if (ctaAction?.includes("close_day") || title.includes("close day")) return "CLOSE_DAY";
  if (ctaAction?.includes("exit") || title.includes("exit")) return "EXIT";
  if (ctaAction?.includes("reduce") || ctaAction?.includes("rebalance") || ctaAction?.includes("fix") || title.includes("reduce")) return "REDUCE";
  if (ctaAction?.includes("deploy") || ctaAction?.includes("add") || title.includes("deploy cash") || title.includes("add")) return "ADD";
  if (ctaAction?.includes("enter") || title.includes("enter")) return "ENTER";
  if (title.includes("hold") || desc.includes("wait")) return "HOLD";
  return "HOLD";
}

function buildLoopSpecNextEvaluationAt(args: {
  asOf: string;
  doneToday: boolean;
  actionType: LoopSpecActionType;
  actionGateStatus?: string | null;
}) {
  // Stable scheduling windows: these do not drift on each refresh.
  if (args.doneToday || args.actionType === "CLOSE_DAY") return nextUtcSlotIso(args.asOf, 8 * 60, 1);
  if (args.actionType === "HOLD") return nextUtcSlotIso(args.asOf, 8 * 60, 1);
  if (String(args.actionGateStatus || "").toLowerCase() === "blocked") return nextUtcSlotIso(args.asOf, 6 * 60, 1);
  return nextUtcSlotIso(args.asOf, 4 * 60, 1);
}

function buildLoopSpecCapitalStatus(args: {
  asOf: string;
  doneToday: boolean;
  hasPlan: boolean;
  hasHoldings: boolean;
  cashEur: number;
  totalEur: number;
  coveragePct: number;
  pressureScore: number;
  actionGate: any;
  topLeakSeverity?: string | null;
  nextEvaluationAt: string;
}) {
  const total = Math.max(0, Number(args.totalEur || 0));
  const cash = Math.max(0, Number(args.cashEur || 0));
  const cashPct = total > 0 ? clampPct((cash / total) * 100, 0) : 100;
  const exposurePct = total > 0 ? clampPct(((total - cash) / total) * 100, 0) : 0;
  const pressure = clampPct(Number(args.pressureScore || 0), 0);
  const gateStatus = String((args.actionGate as any)?.status || "").toLowerCase();
  const topLeakSeverity = String(args.topLeakSeverity || "").toLowerCase();

  let posture: "STABLE" | "CAUTION" | "DEFENSIVE" | "SURVIVAL" = "STABLE";
  if (!args.hasPlan || !args.hasHoldings) posture = "SURVIVAL";
  else if (gateStatus === "blocked" || pressure >= 85 || topLeakSeverity === "high") posture = "DEFENSIVE";
  else if (gateStatus === "caution" || pressure >= 60 || Number(args.coveragePct || 0) < 75) posture = "CAUTION";

  let planAlignment: "HIGH" | "OK" | "LOW" = "HIGH";
  if (!args.hasPlan || !args.hasHoldings) planAlignment = "LOW";
  else if (gateStatus === "blocked" || topLeakSeverity === "high") planAlignment = "LOW";
  else if (gateStatus === "caution" || pressure >= 60) planAlignment = "OK";

  return {
    posture,
    planAlignment,
    riskPressure: pressure,
    exposurePct,
    cashPct,
    nextEvaluationAt: args.nextEvaluationAt,
  };
}

function buildLoopSpecDailyExtensions(args: {
  mode: AutopilotMode;
  asOf: string;
  nba: any;
  actionGate: any;
  whyNow?: any;
  doneToday: boolean;
  hasPlan: boolean;
  hasHoldings: boolean;
  cashEur: number;
  totalEur: number;
  coveragePct: number;
  pressureScore: number;
  topLeakSeverity?: string | null;
  executionEvidence?: any;
  engineV4?: any;
}) {
  const todayKey = dayKeyUTCFromIso(args.asOf);
  const proofLatestKey = dayKeyUTCFromIso(String((args.executionEvidence as any)?.latestAt || ""));
  const hasProofToday = Boolean(todayKey && proofLatestKey && todayKey === proofLatestKey && !args.doneToday);

  const v4Action = (args.engineV4 as any)?.decision?.nextBestAction;
  const v4WhyNow = String((args.engineV4 as any)?.decision?.whyNow || "").trim();
  const v4Type = v4Action ? mapEngineV4KindToLoopType((v4Action as any)?.kind) : null;
  const fallbackType = mapNbaToLoopType({ nba: args.nba, actionGate: args.actionGate, doneToday: args.doneToday, hasProofToday });
  const actionType = normalizeLoopSpecActionType(v4Type || fallbackType);

  const nextEvaluationAt = buildLoopSpecNextEvaluationAt({
    asOf: args.asOf,
    doneToday: args.doneToday,
    actionType,
    actionGateStatus: String((args.actionGate as any)?.status || ""),
  });

  const capitalStatus = buildLoopSpecCapitalStatus({
    asOf: args.asOf,
    doneToday: args.doneToday,
    hasPlan: args.hasPlan,
    hasHoldings: args.hasHoldings,
    cashEur: args.cashEur,
    totalEur: args.totalEur,
    coveragePct: args.coveragePct,
    pressureScore: args.pressureScore,
    actionGate: args.actionGate,
    topLeakSeverity: args.topLeakSeverity ?? null,
    nextEvaluationAt,
  });

  const reasonText =
    v4WhyNow ||
    String((args.whyNow as any)?.rationale || "").trim() ||
    String((args.actionGate as any)?.reasons?.[0] || "").trim() ||
    String((args.nba as any)?.desc || "").trim() ||
    "Syntrake evaluated your capital posture and selected today’s action.";

  const nextBestAction = {
    type: actionType,
    instruction: String((v4Action as any)?.title || (args.nba as any)?.title || "Follow today’s capital action"),
    summary:
      String((v4Action as any)?.desc || (args.nba as any)?.desc || "").trim() ||
      "Syntrake selected one action for today based on current capital state.",
    reason: reasonText,
    cta: (v4Action as any)?.cta || (args.nba as any)?.cta || null,
    source: v4Action ? "engine_v4" : "engine_v3",
    rawAction: normalizeActionKey((args.nba as any)?.cta?.action || (args.nba as any)?.action || ""),
    engineVersion: v4Action ? String((args.engineV4 as any)?.engineVersion || "v4-ultra") : "v3",
    asOf: args.asOf,
  };

  const operationalAction = computeOperationalAction({
    actionType,
    actionInstruction: String((nextBestAction as any)?.instruction || ""),
    actionReason: reasonText,
    doneToday: args.doneToday,
    hasProofToday,
    gateStatus: (args.actionGate as any)?.status ?? null,
    allowExecution: (args.actionGate as any)?.allowExecution ?? null,
    topLeakSeverity: args.topLeakSeverity ?? null,
    riskPressure: Number((capitalStatus as any)?.riskPressure ?? args.pressureScore ?? 0),
  });

  const reasonForToday = {
    headline:
      String((args.whyNow as any)?.driverTitle || "").trim() ||
      String((args.nba as any)?.title || "").trim() ||
      "Capital decision for today",
    rationale: reasonText,
    evidence: Array.isArray((args.whyNow as any)?.evidence) ? (((args.whyNow as any).evidence as any[]).slice(0, 3) as any[]) : [],
  };

  const closeDayMechanism = {
    state: args.doneToday ? "completed" : actionType === "CLOSE_DAY" ? "ready" : "pending",
    canClose: !!args.doneToday || actionType === "CLOSE_DAY",
    reason: args.doneToday
      ? "Day already closed."
      : actionType === "CLOSE_DAY"
        ? "Execution proof detected. Close the day to store the receipt."
        : "Complete execution or HOLD confirmation before closing the day.",
    receiptTicketExpected: true,
  };

  const systemContinuity = {
    state: args.doneToday ? "monitoring" : actionType === "PAUSE" ? "paused" : "active",
    tone: "institutional_calm",
    message: args.doneToday
      ? "Syntrake continues monitoring market conditions while your day is closed."
      : actionType === "HOLD"
        ? "Syntrake is actively monitoring conditions. No capital move is required right now."
        : actionType === "PAUSE"
          ? "Syntrake is maintaining the safest posture until data/setup quality is restored."
          : "Syntrake keeps monitoring conditions between check-ins.",
    nextEvaluationAt,
  };

  return {
    nextBestAction,
    operationalAction,
    capitalStatus,
    reasonForToday,
    closeDayMechanism,
    systemContinuity,
  };
}

function signLabel(n: number) {
  if (!Number.isFinite(n) || n === 0) return "→";
  return n > 0 ? "↑" : "↓";
}

function classifySyntrakeStatus(args: { doneToday: boolean; gateStatus: string; coveragePct: number; actionType: string }) {
  if (args.doneToday) return "Monitoring";
  if (args.coveragePct < 40) return "Waiting Data";
  if (args.gateStatus === "blocked") return "Waiting Data";
  if (args.actionType === "HOLD" || args.actionType === "PAUSE") return "Monitoring";
  return "Active";
}

function classifySessionState(args: {
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  receiptsCount: number;
  nextActionType: string;
  executionScore?: any;
}) {
  const validatedDays = Number((args.executionScore as any)?.validatedDays || 0);
  const streakLike = Number((args.executionScore as any)?.consistencyPct || 0);
  if (!args.hasPlan || !args.hasHoldings) return "COMMITMENT";
  if (args.receiptsCount === 0 && !args.doneToday) return "RECOGNITION";
  if (!args.doneToday && (args.nextActionType === "EXECUTE_BROKER" || args.nextActionType === "CLOSE_DAY")) return "EXECUTION";
  if (validatedDays >= 5 && streakLike >= 70) return "TRUST";
  if (args.receiptsCount >= 2) return "PROGRESS";
  return "CONTINUITY";
}

function extractPerfectLoopSnapshotState(meta: any) {
  const m = safeObj(meta);
  const snap = safeObj(m.snapshot);
  const daily = safeObj(m.daily || snap.daily);
  const perfectLoop = safeObj((daily as any)?.perfectLoop || m.perfectLoop);
  const loopSpec = safeObj((daily as any)?.nextBestAction ? daily : m.loopSpec);
  const capitalStatus = safeObj((daily as any)?.capitalStatus || (perfectLoop as any)?.capitalStatus || m.capitalStatus);
  const systemContinuity = safeObj((daily as any)?.systemContinuity || (perfectLoop as any)?.systemContinuity || m.systemContinuity);
  const lifecycle = safeObj((perfectLoop as any)?.decisionLifecycle || m.decisionLifecycle);
  const progression = safeObj((perfectLoop as any)?.progression || m.progression);
  const accountability = safeObj((perfectLoop as any)?.accountability || m.accountability);

  return {
    capitalStatus: {
      posture: String((capitalStatus as any)?.posture || "").trim() || null,
      planAlignment: String((capitalStatus as any)?.planAlignment || "").trim() || null,
      riskPressure: Number((capitalStatus as any)?.riskPressure ?? NaN),
      exposurePct: Number((capitalStatus as any)?.exposurePct ?? NaN),
      cashPct: Number((capitalStatus as any)?.cashPct ?? NaN),
    },
    nextBestAction: {
      type: String(((daily as any)?.nextBestAction || (loopSpec as any)?.nextBestAction || {}).type || "").trim() || null,
      instruction: String(((daily as any)?.nextBestAction || (loopSpec as any)?.nextBestAction || {}).instruction || "").trim() || null,
      reason: String(((daily as any)?.nextBestAction || (loopSpec as any)?.nextBestAction || {}).reason || "").trim() || null,
    },
    progression: {
      narrative: String((progression as any)?.narrative || "").trim() || null,
      trendChips: Array.isArray((progression as any)?.trendChips) ? ((progression as any).trendChips as any[]).slice(0, 4) : [],
    },
    accountability: {
      status: String((accountability as any)?.status || "").trim() || null,
      line: String((accountability as any)?.line || "").trim() || null,
    },
    systemContinuity: {
      state: String((systemContinuity as any)?.state || "").trim() || null,
      nextEvaluationAt: String((systemContinuity as any)?.nextEvaluationAt || "").trim() || null,
    },
    decisionLifecycle: {
      sessionState: String((lifecycle as any)?.sessionState || "").trim() || null,
      stage: String((lifecycle as any)?.stage || "").trim() || null,
      decisionIntent: String((lifecycle as any)?.decisionIntent || "").trim() || null,
      firstDailyAt: String((lifecycle as any)?.firstDailyAt || "").trim() || null,
      lastDailyAt: String((lifecycle as any)?.lastDailyAt || "").trim() || null,
      streakDays: Number((lifecycle as any)?.streakDays ?? NaN),
    },
  };
}

function buildPerfectLoopExtensions(args: {
  mode: AutopilotMode;
  asOf: string;
  loopSpecDaily: any;
  dailyEngineV4?: any;
  plan?: any;
  userSettings?: any;
  actionGate?: any;
  whyNow?: any;
  executionScore?: any;
  executionEvidence?: any;
  timeline?: any[];
  valuation?: any;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  receiptsCount: number;
  streak: number;
}) {
  const loop = safeObj(args.loopSpecDaily);
  const nextBestAction = safeObj((loop as any).nextBestAction);
  const capitalStatus = safeObj((loop as any).capitalStatus);
  const reasonForToday = safeObj((loop as any).reasonForToday);
  const systemContinuity = safeObj((loop as any).systemContinuity);

  const rows = Array.isArray(args.timeline) ? args.timeline : [];
  const previousClosed = safeObj(rows[0]);
  const olderClosed = safeObj(rows[1]);

  const currentAutopilotScore =
    typeof (args.dailyEngineV4 as any)?.scores?.autopilotScore === "number"
      ? Number((args.dailyEngineV4 as any).scores.autopilotScore)
      : typeof (args.valuation as any)?.autopilotScore === "number"
        ? Number((args.valuation as any).autopilotScore)
        : NaN;
  const prevAutopilotScore = Number((previousClosed as any)?.score ?? NaN);

  const currentRiskPressure = Number((capitalStatus as any)?.riskPressure ?? NaN);
  const prevSnapshotState = extractPerfectLoopSnapshotState((previousClosed as any)?.meta || null);
  const olderSnapshotState = extractPerfectLoopSnapshotState((olderClosed as any)?.meta || null);
  const prevRiskPressure = Number((prevSnapshotState as any)?.capitalStatus?.riskPressure ?? NaN);
  const currentPosture = String((capitalStatus as any)?.posture || "").trim() || null;
  const prevPosture = String((prevSnapshotState as any)?.capitalStatus?.posture || "").trim() || null;
  const prevTopLeak = String((previousClosed as any)?.topLeak || "").trim() || null;
  const currentTopLeak = String((reasonForToday as any)?.headline || "").trim() || null;

  const inputDeltas: Array<{ key: string; label: string; value: number | null; previous: number | null; delta: number | null; direction: "up" | "down" | "flat" | "unknown" }> = [];
  const trendChips: string[] = [];

  const addNumericDelta = (key: string, label: string, currentRaw: any, prevRaw: any) => {
    const current = Number(currentRaw);
    const previous = Number(prevRaw);
    const validCurrent = Number.isFinite(current);
    const validPrevious = Number.isFinite(previous);
    const delta = validCurrent && validPrevious ? Math.round((current - previous) * 100) / 100 : null;
    const direction = delta == null ? "unknown" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    inputDeltas.push({
      key,
      label,
      value: validCurrent ? current : null,
      previous: validPrevious ? previous : null,
      delta,
      direction,
    });
    if (delta != null && delta !== 0) {
      trendChips.push(`${label} ${signLabel(delta)} since yesterday`);
    }
  };

  addNumericDelta("autopilot_score", "Autopilot Score", currentAutopilotScore, prevAutopilotScore);
  addNumericDelta("risk_pressure", "Risk Pressure", currentRiskPressure, prevRiskPressure);
  addNumericDelta(
    "exposure_pct",
    "Exposure",
    Number((capitalStatus as any)?.exposurePct ?? NaN),
    Number((prevSnapshotState as any)?.capitalStatus?.exposurePct ?? NaN),
  );
  addNumericDelta(
    "cash_pct",
    "Cash",
    Number((capitalStatus as any)?.cashPct ?? NaN),
    Number((prevSnapshotState as any)?.capitalStatus?.cashPct ?? NaN),
  );

  if (currentPosture && prevPosture && currentPosture !== prevPosture) {
    trendChips.push(`Posture: ${prevPosture} → ${currentPosture}`);
  }

  const accountabilityStatus =
    !previousClosed || !(previousClosed as any)?.dayKey
      ? "first_cycle"
      : currentPosture && prevPosture && currentPosture !== prevPosture
        ? "conditions_evolved"
        : Number.isFinite(currentRiskPressure) && Number.isFinite(prevRiskPressure) && currentRiskPressure > prevRiskPressure + 5
          ? "pressure_up"
          : "alignment_maintained";

  const accountabilityLine =
    accountabilityStatus === "first_cycle"
      ? "First daily cycle in progress — Syntrake will start accountability follow-up after your first close day."
      : accountabilityStatus === "conditions_evolved"
        ? "Conditions evolved — Syntrake is evaluating whether today requires an adjustment."
        : accountabilityStatus === "pressure_up"
          ? "Pressure increased since the last evaluation — Syntrake is monitoring before intervention."
          : "Yesterday's decision remains aligned — monitoring continues.";

  const holdIntent =
    String((nextBestAction as any)?.type || "").toUpperCase() === "HOLD"
      ? currentPosture === "DEFENSIVE" || currentPosture === "SURVIVAL"
        ? "Protect capital while volatility/risk pressure remains elevated."
        : "Maintain alignment while conditions remain within plan tolerance."
      : null;

  const sessionState = classifySessionState({
    hasPlan: args.hasPlan,
    hasHoldings: args.hasHoldings,
    doneToday: args.doneToday,
    receiptsCount: args.receiptsCount,
    nextActionType: String((nextBestAction as any)?.type || ""),
    executionScore: args.executionScore,
  });

  const lifecycleStage = args.doneToday
    ? "DAY_CLOSED"
    : String((nextBestAction as any)?.type || "").toUpperCase() === "CLOSE_DAY"
      ? "READY_TO_CLOSE"
      : String((nextBestAction as any)?.type || "").toUpperCase() === "EXECUTE_BROKER"
        ? "EXECUTION_PENDING"
        : "DECISION_READY";

  const evaluationContext = {
    overnightEvaluationComplete: args.receiptsCount > 0 || args.doneToday,
    headline: args.receiptsCount > 0 || args.doneToday ? "Overnight Evaluation Complete ✅" : "Initial Evaluation Ready ✅",
    subtext:
      args.receiptsCount > 0 || args.doneToday
        ? "Syntrake analysed your portfolio and market conditions to prepare today's decision."
        : "Syntrake prepared your first decision baseline from your setup, holdings and current market inputs.",
  };

  const systemStatus = {
    status: classifySyntrakeStatus({
      doneToday: args.doneToday,
      gateStatus: String((args.actionGate as any)?.status || ""),
      coveragePct: Number((args.valuation as any)?.coveragePct || 0),
      actionType: String((nextBestAction as any)?.type || ""),
    }),
    lastEvaluationAt: previousClosed?.at || null,
    currentEvaluationAt: args.asOf,
    nextEvaluationAt: (systemContinuity as any)?.nextEvaluationAt || addHoursIso(args.asOf, 8),
  };

  const ownership = {
    label: `Your ${String(args.mode || "investing")[0].toUpperCase()}${String(args.mode || "investing").slice(1)} Autopilot`,
    planName: String((args.plan as any)?.goal || "").trim() || "Active Plan",
    horizon: (args.userSettings as any)?.horizon ?? null,
    riskProfile: (args.userSettings as any)?.risk_profile ?? null,
    status: args.hasPlan ? "Active" : "Setup Required",
  };

  const awareness = {
    autopilotScore:
      typeof (args.dailyEngineV4 as any)?.scores?.autopilotScore === "number"
        ? Number((args.dailyEngineV4 as any).scores.autopilotScore)
        : null,
    riskPressure: Number((capitalStatus as any)?.riskPressure ?? NaN),
    posture: (capitalStatus as any)?.posture ?? null,
    alignment: (capitalStatus as any)?.planAlignment ?? null,
    barsSimple: [
      { key: "autopilot_score", label: "Autopilot Score", value: typeof (args.dailyEngineV4 as any)?.scores?.autopilotScore === "number" ? Number((args.dailyEngineV4 as any).scores.autopilotScore) : null },
      { key: "risk_pressure", label: "Risk Pressure", value: Number.isFinite(Number((capitalStatus as any)?.riskPressure)) ? Number((capitalStatus as any)?.riskPressure) : null },
    ],
    barsAdvanced: [
      { key: "autopilot_score", label: "Autopilot Score", value: typeof (args.dailyEngineV4 as any)?.scores?.autopilotScore === "number" ? Number((args.dailyEngineV4 as any).scores.autopilotScore) : null },
      { key: "risk_pressure", label: "Risk Pressure", value: Number.isFinite(Number((capitalStatus as any)?.riskPressure)) ? Number((capitalStatus as any)?.riskPressure) : null },
      { key: "exposure_pct", label: "Exposure", value: Number.isFinite(Number((capitalStatus as any)?.exposurePct)) ? Number((capitalStatus as any)?.exposurePct) : null },
      { key: "cash_pct", label: "Cash", value: Number.isFinite(Number((capitalStatus as any)?.cashPct)) ? Number((capitalStatus as any)?.cashPct) : null },
    ],
  };

  const overnightChanges = {
    detected: inputDeltas.some((d) => d.delta != null && d.delta !== 0) || (currentPosture && prevPosture && currentPosture !== prevPosture),
    items: inputDeltas.slice(0, 5),
    notes: [
      prevTopLeak && currentTopLeak && prevTopLeak !== currentTopLeak ? `Focus changed: ${prevTopLeak} → ${currentTopLeak}` : null,
      (args.executionEvidence as any)?.latestAt ? `Latest proof observed: ${String((args.executionEvidence as any).latestAt)}` : null,
    ].filter(Boolean),
  };

  const progressionNarrative =
    accountabilityStatus === "first_cycle"
      ? "Initial cycle is active. Syntrake will build progression and accountability after your first close day."
      : accountabilityStatus === "conditions_evolved"
        ? "Conditions changed since the last evaluation. Syntrake is adapting the decision posture before intervention."
        : accountabilityStatus === "pressure_up"
          ? "Pressure is building; Syntrake is monitoring before intervention."
          : "Conditions remain aligned with the previous decision; monitoring continues under the current posture.";

  const decisionLifecycle = {
    sessionState,
    stage: lifecycleStage,
    decisionIntent:
      holdIntent ||
      String((nextBestAction as any)?.reason || "").trim() ||
      String((reasonForToday as any)?.rationale || "").trim() ||
      "Maintain plan alignment with the current capital posture.",
    previousDecision: previousClosed?.dayKey
      ? {
          dayKey: previousClosed.dayKey,
          title: (previousClosed as any)?.nbaTitle ?? (prevSnapshotState as any)?.nextBestAction?.instruction ?? null,
          action: (previousClosed as any)?.nbaAction ?? (prevSnapshotState as any)?.nextBestAction?.type ?? null,
          gateStatus: (previousClosed as any)?.gateStatus ?? null,
        }
      : null,
    firstDailyAt:
      (prevSnapshotState as any)?.decisionLifecycle?.firstDailyAt ||
      (olderSnapshotState as any)?.decisionLifecycle?.firstDailyAt ||
      (previousClosed as any)?.at ||
      null,
    lastDailyAt: previousClosed?.at || null,
    streakDays: Math.max(0, Number(args.streak || 0)),
    cycleCount: Math.max(0, Number(args.receiptsCount || 0)),
  };

  const accountability = {
    status: accountabilityStatus,
    line: accountabilityLine,
    previousDecisionDayKey: previousClosed?.dayKey || null,
    previousDecisionTitle:
      (previousClosed as any)?.nbaTitle ??
      (prevSnapshotState as any)?.nextBestAction?.instruction ??
      null,
  };

  const paywallActivation = {
    policy: "continuity_first",
    day0FreeAllowed: true,
    trigger: "day1_plus_decision_ready",
    eligibleNow:
      !args.doneToday &&
      Math.max(0, Number(args.receiptsCount || 0)) >= 1 &&
      !["PAUSE"].includes(String((nextBestAction as any)?.type || "").toUpperCase()),
    requiresAccessCheck: true,
    copy: {
      title: "Your Autopilot is ready.",
      subtitle: "Activate Pro to receive continuous daily decisions.",
      cta: "Start 7-day Pro Trial",
    },
  };

  return {
    stateMachine: {
      sessionState,
      canonicalStates: ["COMMITMENT", "RECOGNITION", "EXECUTION", "CONTINUITY", "PROGRESS", "TRUST"],
    },
    evaluationContext,
    systemStatus,
    ownership,
    awareness,
    overnightChanges,
    progression: {
      trendChips: trendChips.slice(0, 4),
      narrative: progressionNarrative,
    },
    accountability,
    decisionLifecycle,
    openLoop: {
      message: String((systemContinuity as any)?.message || "Monitoring continues..."),
      nextEvaluationAt: (systemContinuity as any)?.nextEvaluationAt || addHoursIso(args.asOf, 8),
      tone: "institutional_calm",
    },
    paywallActivation,
    holdValue:
      String((nextBestAction as any)?.type || "").toUpperCase() === "HOLD"
        ? {
            active: true,
            intent: holdIntent || "Protect capital while conditions are under monitoring.",
            protects: [
              (capitalStatus as any)?.posture ? `Posture preserved: ${String((capitalStatus as any).posture)}` : null,
              Number.isFinite(Number((capitalStatus as any)?.riskPressure))
                ? `Risk pressure controlled at ${Number((capitalStatus as any).riskPressure)}/100`
                : null,
            ].filter(Boolean),
          }
        : { active: false },
  };
}

function applyScoresReplayAuditExtensions(args: {
  mode: AutopilotMode;
  loopSpecDaily: any;
  engineV4: any;
  actionGate: any;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  coveragePct: number;
  topLeakKey?: string | null;
  topLeakSeverity?: string | null;
  executionScore?: any;
}) {
  const dailyNode = safeObj(args.loopSpecDaily);
  const nextBestAction = safeObj((dailyNode as any)?.nextBestAction);
  const capitalStatus = safeObj((dailyNode as any)?.capitalStatus);
  const engineV4 = args.engineV4 && typeof args.engineV4 === "object" ? args.engineV4 : null;
  const v4Decision = safeObj((engineV4 as any)?.decision);
  const v4Scores = safeObj((engineV4 as any)?.scores);

  const scoreAudit = computeScoresAndReplayAudit({
    mode: args.mode,
    hasPlan: !!args.hasPlan,
    hasHoldings: !!args.hasHoldings,
    doneToday: !!args.doneToday,
    actionType: (nextBestAction as any)?.type ? String((nextBestAction as any).type) : null,
    actionInstruction: (nextBestAction as any)?.instruction ? String((nextBestAction as any).instruction) : null,
    actionReason: (nextBestAction as any)?.reason ? String((nextBestAction as any).reason) : null,
    coveragePct: Number(args.coveragePct || (capitalStatus as any)?.coveragePct || 0),
    exposurePct: Number((capitalStatus as any)?.exposurePct || 0),
    cashPct: Number((capitalStatus as any)?.cashPct || 100),
    topLeakKey: args.topLeakKey ?? null,
    topLeakSeverity: args.topLeakSeverity ?? null,
    actionGateStatus: (args.actionGate as any)?.status ? String((args.actionGate as any).status) : null,
    actionGateAllowExecution:
      typeof (args.actionGate as any)?.allowExecution === "boolean" ? Boolean((args.actionGate as any).allowExecution) : null,
    engineV4: engineV4
      ? {
          inputHash: (engineV4 as any)?.inputHash ?? null,
          confidence01:
            typeof (v4Decision as any)?.confidence === "number" ? Number((v4Decision as any).confidence) : null,
          aggression: (v4Decision as any)?.aggression ?? null,
          trace: Array.isArray((engineV4 as any)?.trace) ? (engineV4 as any).trace : [],
          guardrails: Array.isArray((v4Decision as any)?.guardrails) ? (v4Decision as any).guardrails : [],
          confidenceScore:
            typeof (v4Scores as any)?.confidenceScore === "number" ? Number((v4Scores as any).confidenceScore) : null,
        }
      : null,
    executionReality: {
      brokerExecutionPending: String((nextBestAction as any)?.type || "").toUpperCase() === "EXECUTE_BROKER",
      executionScoreValue:
        typeof (args.executionScore as any)?.score === "number" ? Number((args.executionScore as any).score) : null,
    },
  });

  const patchedCapitalStatus = {
    ...(capitalStatus as any),
    posture: scoreAudit.capitalStatusPatch.posture,
    planAlignment: scoreAudit.capitalStatusPatch.planAlignment,
    riskPressure: scoreAudit.scores.riskPressure,
  };

  const existingReasons = Array.isArray((nextBestAction as any)?.reasons)
    ? (((nextBestAction as any).reasons as any[]).map((x: any) => String(x || "").trim()).filter(Boolean) as string[])
    : [];
  const mergedReasons = [...scoreAudit.reasonList, ...existingReasons].filter((x, idx, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === idx).slice(0, 6);

  const patchedNextBestAction = {
    ...(nextBestAction as any),
    reason: String((nextBestAction as any)?.reason || mergedReasons[0] || ""),
    reasons: mergedReasons,
    primaryReason: mergedReasons[0] || null,
  };

  const scoreNode = {
    ...scoreAudit.scores,
  };

  const scoreAuditNode = {
    notes: scoreAudit.audit.notes,
    noteCount: scoreAudit.audit.noteCount,
    marketDataOk: scoreAudit.audit.marketDataOk,
    deterministic: scoreAudit.audit.deterministic,
    inputHash: scoreAudit.audit.inputHash,
    traceCount: scoreAudit.audit.traceCount,
    guardrailCount: scoreAudit.audit.guardrailCount,
  };
  const auditTrailNode = {
    ...scoreAuditNode,
    notes: scoreAudit.audit.notes,
    generatedBy: "server_score_audit_v1",
  };

  const replayAuditNode = {
    ...scoreAudit.replayMeta,
    inputHash: scoreAudit.replayMeta.inputHash,
    decisionReproducible: Boolean(scoreAudit.replayMeta.replayReady && scoreAudit.audit.deterministic),
  };

  if (engineV4) {
    (engineV4 as any).audit = {
      scoreAudit: scoreAuditNode,
      notes: scoreAudit.audit.notes,
      generatedAt: (dailyNode as any)?.nextBestAction?.asOf || null,
    };
  }

  return {
    daily: {
      ...(dailyNode as any),
      nextBestAction: patchedNextBestAction,
      capitalStatus: patchedCapitalStatus,
      scores: scoreNode,
      scoreAudit: scoreAuditNode,
      auditTrail: auditTrailNode,
      replayAudit: replayAuditNode,
    },
    engineV4: engineV4 || undefined,
  };
}

export function shouldLoadTradingWatchlistForDailyBundle(mode: AutopilotMode) {
  return mode === "trading";
}

function buildUnlockedMode(args: { mode: AutopilotMode; hasProAccess: boolean }) {
  const hasProAccess = !!args.hasProAccess;
  const modes: AutopilotMode[] = ["investing"];
  const entries = modes.map((m) => ({
    mode: m,
    unlocked: true,
    tier: "free",
    reason: hasProAccess ? "pro_access" : "free_default",
  }));
  const current = entries.find((x) => x.mode === args.mode) || entries[0];
  return {
    activeMode: args.mode,
    hasProAccess,
    currentModeUnlocked: current.unlocked,
    visibleModes: entries,
    unlocked: entries.filter((x) => x.unlocked).map((x) => x.mode),
    locked: entries.filter((x) => !x.unlocked).map((x) => x.mode),
    freeBoundary: "Where am I financially?",
    proBoundary: "What should I do next?",
  };
}

function buildInstantPortfolioScore(args: {
  dailyNode: any;
  hasPlan: boolean;
  hasHoldings: boolean;
  coveragePct: number;
  topLeakTitle?: string | null;
  topLeakKey?: string | null;
  topLeakSeverity?: string | null;
}) {
  const daily = safeObj(args.dailyNode);
  const scores = safeObj((daily as any)?.scores);
  const capitalStatus = safeObj((daily as any)?.capitalStatus);
  const autopilotScore = clampPct(Number((scores as any)?.autopilotScore ?? 0), 0);
  const riskPressure = clampPct(Number((scores as any)?.riskPressure ?? (capitalStatus as any)?.riskPressure ?? 0), 0);
  const planCoherence = clampPct(Number((scores as any)?.planCoherence ?? 0), 0);
  const posture = String((capitalStatus as any)?.posture || "SURVIVAL").toUpperCase();
  const coveragePct = clampPct(Number(args.coveragePct || 0), 0);
  const hasPlan = !!args.hasPlan;
  const hasHoldings = !!args.hasHoldings;
  const ready = hasPlan && hasHoldings;

  const findings: string[] = [];
  if (!hasPlan) findings.push("Plan required before full portfolio evaluation.");
  if (hasPlan && !hasHoldings) findings.push("Add holdings to compute your instant portfolio score.");
  if (coveragePct < 70 && ready) findings.push("Full evaluation will complete after market analysis.");
  if (ready) {
    if (riskPressure >= 76) findings.push(`Risk pressure is elevated (${riskPressure}/100).`);
    else if (riskPressure >= 56) findings.push(`Risk pressure is cautious (${riskPressure}/100).`);

    if (planCoherence < 55) findings.push(`Portfolio alignment is low (${planCoherence}/100).`);
    else if (planCoherence < 80) findings.push(`Portfolio is partially aligned to the active plan.`);

    if (args.topLeakTitle) {
      findings.push(`Top finding: ${String(args.topLeakTitle).trim()}.`);
    } else if (String(args.topLeakKey || "").toLowerCase().includes("cash_drag")) {
      findings.push("Cash buffer is above target and may reduce plan efficiency.");
    } else if (String(args.topLeakKey || "").toLowerCase().includes("concentration")) {
      findings.push("Portfolio concentration is above the preferred risk posture.");
    }

    if (coveragePct >= 70 && findings.length < 2) {
      findings.push("Portfolio structure is within the current plan posture.");
      findings.push("Syntrake is ready to guide execution after broker confirmation.");
    }
  }

  const deduped = findings
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .filter((x, i, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
    .slice(0, 3);

  return {
    ready,
    autopilotScore,
    riskPressure,
    planCoherence,
    findings: deduped.length ? deduped : ["Full evaluation will complete after market analysis."],
    posture: (["STABLE", "CAUTION", "DEFENSIVE", "SURVIVAL"].includes(posture) ? posture : "SURVIVAL") as
      | "STABLE"
      | "CAUTION"
      | "DEFENSIVE"
      | "SURVIVAL",
    source: "daily_bundle_instant_portfolio_score_v1",
    requiresMarketAnalysis: coveragePct < 70,
  };
}

export function buildDailyPaywallState(args: {
  asOf: string;
  mode: AutopilotMode;
  billing: {
    plan: "free" | "pro";
    trialActive: boolean;
    trialEndsAt: string | null;
    proActive: boolean;
    trialStarted?: boolean;
    trialExpired?: boolean;
    source?: string;
  };
  dailyNode: any;
  perfectLoop?: any;
  receiptsCount: number;
  doneToday: boolean;
  hasPlan: boolean;
  hasHoldings: boolean;
  actionGate?: any;
}) {
  const dailyNode = safeObj(args.dailyNode);
  const perfectLoop = safeObj(args.perfectLoop);
  const nextBestAction = safeObj((dailyNode as any)?.nextBestAction);
  const capitalStatus = safeObj((dailyNode as any)?.capitalStatus);
  const reasonForToday = safeObj((dailyNode as any)?.reasonForToday);
  const actionGate = safeObj(args.actionGate || (dailyNode as any)?.actionGate);
  const paywallActivation = safeObj((perfectLoop as any)?.paywallActivation);
  const openLoop = safeObj((perfectLoop as any)?.openLoop);

  const receiptsCount = Math.max(0, Number(args.receiptsCount || 0));
  const doneToday = !!args.doneToday;
  const hasPlan = !!args.hasPlan;
  const hasHoldings = !!args.hasHoldings;
  const gateStatus = String((actionGate as any)?.status || "").trim().toLowerCase();
  const actionType = String((nextBestAction as any)?.type || "").trim().toUpperCase();
  const nextEvaluationAt =
    String((capitalStatus as any)?.nextEvaluationAt || (openLoop as any)?.nextEvaluationAt || "").trim() || addHoursIso(args.asOf, 8);

  const day0 = receiptsCount === 0;
  const day0Operational = day0 && !doneToday && ["EXECUTE_BROKER", "CLOSE_DAY"].includes(actionType);
  const investingFreeForever = args.mode === "investing";
  const decisionReady =
    !doneToday &&
    hasPlan &&
    hasHoldings &&
    actionType.length > 0 &&
    !["PAUSE"].includes(actionType) &&
    gateStatus !== "blocked";

  const shouldPreviewOnly =
    !investingFreeForever &&
    !args.billing.proActive &&
    !day0Operational &&
    receiptsCount >= 1 &&
    decisionReady;
  const previewStatus: "READY" | "COLLECTING" | "NO_DATA" =
    !hasPlan || !hasHoldings ? "NO_DATA" : decisionReady && receiptsCount >= 1 ? "READY" : "COLLECTING";

  const primaryReasonRaw =
    String((reasonForToday as any)?.rationale || "").trim() ||
    String((nextBestAction as any)?.reason || "").trim() ||
    String((paywallActivation as any)?.copy?.subtitle || "").trim() ||
    "";
  const primaryReason = primaryReasonRaw ? primaryReasonRaw.slice(0, 180) : undefined;

  const canShowPaywall =
    !investingFreeForever &&
    !args.billing.proActive &&
    !day0Operational &&
    (Boolean((paywallActivation as any)?.eligibleNow) || (receiptsCount >= 1 && previewStatus === "READY"));
  const cta: "START_TRIAL" | "UPGRADE" = !args.billing.trialStarted && !args.billing.trialExpired ? "START_TRIAL" : "UPGRADE";
  const reason: "UNLOCK_TODAYS_DECISION" | "UNLOCK_AUTOPILOT_CONTINUITY" | undefined = canShowPaywall
    ? previewStatus === "READY"
      ? "UNLOCK_TODAYS_DECISION"
      : "UNLOCK_AUTOPILOT_CONTINUITY"
    : undefined;

  return {
    billing: {
      plan: args.billing.plan,
      trialActive: !!args.billing.trialActive,
      trialEndsAt: args.billing.trialEndsAt ?? null,
      proActive: !!args.billing.proActive,
      trialStarted: !!args.billing.trialStarted,
      trialExpired: !!args.billing.trialExpired,
      source: String(args.billing.source || "server_billing_truth"),
    },
    paywall: {
      show: canShowPaywall,
      reason,
      cta,
      decisionExposure: shouldPreviewOnly ? "PREVIEW_ONLY" : "FULL",
      continuityPolicy: investingFreeForever ? "investing_free_forever" : "continuity_first",
      day0OperationalAllowed: true,
      copy: {
        title: investingFreeForever ? "Investing stays open." : "Your Autopilot is ready.",
        subtitle: investingFreeForever
          ? "Daily investing decisions stay visible without requiring a paid trading subscription."
          : "Syntrake completed overnight evaluation for your portfolio. Activate Pro to receive continuous daily decisions.",
        trust: investingFreeForever
          ? "Free investing remains educational decision support. No guarantees, no custody, no forced broker action."
          : "Cancel anytime. No promises. Decisions are explainable and auditable.",
      },
    },
    nextBestActionPreview: {
      status: previewStatus,
      posture: String((capitalStatus as any)?.posture || "SURVIVAL"),
      primaryReason,
      nextEvaluationAt,
    },
  };
}

function normalizeActivationSystemStatus(raw: string) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "active") return "Active";
  if (v === "monitoring") return "Monitoring";
  if (v === "waiting data" || v === "waiting market data" || v === "waiting_data") return "Waiting Market Data";
  if (v === "evaluating") return "Evaluating";
  return "Monitoring";
}

function buildDay1ActivationState(args: {
  asOf: string;
  mode: AutopilotMode;
  dailyNode: any;
  perfectLoop?: any;
  billing?: any;
  paywall?: any;
  receiptsCount: number;
  doneToday: boolean;
  hasPlan: boolean;
  hasHoldings: boolean;
}) {
  const dailyNode = safeObj(args.dailyNode);
  const perfectLoop = safeObj(args.perfectLoop);
  const billing = safeObj(args.billing);
  const paywall = safeObj(args.paywall);

  const evaluationContext = safeObj((perfectLoop as any)?.evaluationContext);
  const systemStatus = safeObj((perfectLoop as any)?.systemStatus);
  const ownership = safeObj((perfectLoop as any)?.ownership);
  const awareness = safeObj((perfectLoop as any)?.awareness);
  const decisionLifecycle = safeObj((perfectLoop as any)?.decisionLifecycle);
  const nextBestAction = safeObj((dailyNode as any)?.nextBestAction);
  const capitalStatus = safeObj((dailyNode as any)?.capitalStatus);
  const preview = safeObj((dailyNode as any)?.nextBestActionPreview);
  const scores = safeObj((dailyNode as any)?.scores);
  const reasonForToday = safeObj((dailyNode as any)?.reasonForToday);

  const receiptsCount = Math.max(0, Number(args.receiptsCount || 0));
  const doneToday = !!args.doneToday;
  const hasPlan = !!args.hasPlan;
  const hasHoldings = !!args.hasHoldings;
  const proActive = !!(billing as any)?.proActive;
  const day0 = receiptsCount === 0;
  const day1Plus = receiptsCount >= 1;
  const firstOvernightComplete = day1Plus && !doneToday;
  const actionType = String((nextBestAction as any)?.type || "").trim().toUpperCase();
  const decisionReady =
    String((preview as any)?.status || "").toUpperCase() === "READY" ||
    (!doneToday && hasPlan && hasHoldings && actionType.length > 0 && !["PAUSE"].includes(actionType));
  const day0Operational = day0 && !doneToday && ["EXECUTE_BROKER", "CLOSE_DAY"].includes(actionType);
  const decisionVisibility = String((paywall as any)?.decisionExposure || (proActive ? "FULL" : "PREVIEW_ONLY")).toUpperCase();
  const activationMomentEligible =
    !proActive && firstOvernightComplete && decisionReady && !day0Operational && Boolean((paywall as any)?.show);

  const phase =
    !hasPlan || !hasHoldings
      ? "SETUP_REQUIRED"
      : day0 && doneToday
        ? "DAY0_CLOSED_WAITING_OVERNIGHT"
        : day0 && !doneToday
          ? "DAY0_FREE_EXECUTION"
          : activationMomentEligible
            ? "DAY1_ACTIVATION_MOMENT"
            : day1Plus && proActive && decisionReady
              ? "DAY1_PRO_ACTIVE"
              : day1Plus && decisionReady
                ? "DAY1_READY_PREVIEW"
                : day1Plus
                  ? "DAY1_COLLECTING"
                  : "INITIAL_EVALUATION";

  const ownershipLabel =
    String((ownership as any)?.label || "").trim() ||
    `Your ${String(args.mode || "investing")[0]?.toUpperCase() || "I"}${String(args.mode || "investing").slice(1)} Autopilot`;
  const planName = String((ownership as any)?.planName || "").trim() || "Your Plan";
  const riskProfile = (ownership as any)?.riskProfile ?? null;
  const horizon = (ownership as any)?.horizon ?? null;
  const ownershipStatus = String((ownership as any)?.status || (hasPlan ? "Active" : "Setup Required"));

  const nextEvaluationAt =
    String((systemStatus as any)?.nextEvaluationAt || (capitalStatus as any)?.nextEvaluationAt || "").trim() || addHoursIso(args.asOf, 8);
  const lastEvaluationAt = (systemStatus as any)?.lastEvaluationAt ?? null;
  const currentEvaluationAt = (systemStatus as any)?.currentEvaluationAt ?? args.asOf;

  const headerHeadline =
    String((evaluationContext as any)?.headline || "").trim() ||
    (firstOvernightComplete ? "Overnight Evaluation Complete" : "Initial Evaluation Ready");
  const headerSubtext =
    String((evaluationContext as any)?.subtext || "").trim() ||
    (firstOvernightComplete
      ? "Syntrake analysed your portfolio and market conditions to prepare today's decision."
      : "Syntrake prepared your first decision baseline from your setup, holdings and current market inputs.");

  const previewPrimaryReason =
    String((preview as any)?.primaryReason || "").trim() ||
    String((reasonForToday as any)?.rationale || "").trim() ||
    String((nextBestAction as any)?.reason || "").trim() ||
    null;

  return {
    version: "day1_activation_ownership_v1",
    phase,
    lifecycle: {
      day0,
      day1Plus,
      firstOvernightComplete,
      day0OperationalAllowed: true,
      day0Operational,
      decisionReady,
      activationMomentEligible,
      sessionState: (decisionLifecycle as any)?.sessionState ?? null,
      decisionLifecycleStage: (decisionLifecycle as any)?.stage ?? null,
      cycleCount: Math.max(0, Number((decisionLifecycle as any)?.cycleCount ?? receiptsCount)),
      streakDays: Math.max(0, Number((decisionLifecycle as any)?.streakDays ?? 0)),
    },
    evaluationContextHeader: {
      visible: true,
      overnightEvaluationComplete: Boolean((evaluationContext as any)?.overnightEvaluationComplete ?? firstOvernightComplete),
      headline: headerHeadline,
      subtext: headerSubtext,
      status: firstOvernightComplete ? "OVERNIGHT_COMPLETE" : day0 ? "DAY0_BASELINE_READY" : "EVALUATING",
      generatedAt: currentEvaluationAt,
    },
    systemStatusBar: {
      visible: true,
      title: "Syntrake Status",
      status: normalizeActivationSystemStatus((systemStatus as any)?.status),
      lastEvaluationAt,
      currentEvaluationAt,
      nextEvaluationAt,
    },
    ownershipSignals: {
      visible: true,
      languagePolicy: {
        use: ["Your Autopilot", "Your Plan", "Your Capital"],
        avoidGenericDashboardLanguage: true,
      },
      label: ownershipLabel,
      planName,
      horizon,
      riskProfile,
      status: ownershipStatus,
      ownershipStrength:
        hasPlan && hasHoldings ? "high" : hasPlan || hasHoldings ? "medium" : "low",
    },
    awarenessSignals: {
      visible: true,
      autopilotScore: Number((scores as any)?.autopilotScore ?? (awareness as any)?.autopilotScore ?? 0),
      riskPressure: Number((scores as any)?.riskPressure ?? (capitalStatus as any)?.riskPressure ?? 0),
      posture: String((capitalStatus as any)?.posture || "SURVIVAL"),
      planAlignment: String((capitalStatus as any)?.planAlignment || "LOW"),
      barsSimple: Array.isArray((awareness as any)?.barsSimple) ? (awareness as any).barsSimple : [],
    },
    decisionPreviewState: {
      visible: true,
      status: String((preview as any)?.status || (decisionReady ? "READY" : "COLLECTING")).toUpperCase(),
      primaryReason: previewPrimaryReason,
      nextEvaluationAt: String((preview as any)?.nextEvaluationAt || nextEvaluationAt),
      decisionPrepared: decisionReady,
      visibility: decisionVisibility === "PREVIEW_ONLY" ? "PREVIEW_ONLY" : "FULL",
    },
    activationPaywall: {
      show: Boolean((paywall as any)?.show),
      cta: (paywall as any)?.cta ?? "START_TRIAL",
      reason: (paywall as any)?.reason ?? null,
      title: "Your Autopilot is ready.",
      subtitle: "Activate Pro to receive continuous daily decisions.",
      secondary: "Cancel anytime.",
      continuityModel: "free_intelligence_pro_continuity",
      activationType: activationMomentEligible ? "DAY1_CONTINUITY_ACTIVATION" : "NONE",
    },
    valueProof: {
      overnightEvaluationWorked: firstOvernightComplete || Boolean((evaluationContext as any)?.overnightEvaluationComplete),
      systemStatusVisible: true,
      ownershipVisible: true,
      capitalAwarenessVisible: true,
      decisionPrepared: decisionReady,
      feelsLikeActivationNotPurchase: activationMomentEligible,
    },
  };
}

const PROGRESSION_TREND_THRESHOLD = 2;
const EVALUATION_STREAK_MAX_GAP_HOURS = 36;

function progressionDirection(delta: number | null | undefined): "UP" | "DOWN" | "FLAT" {
  const n = Number(delta);
  if (!Number.isFinite(n) || Math.abs(n) < PROGRESSION_TREND_THRESHOLD) return "FLAT";
  return n >= PROGRESSION_TREND_THRESHOLD ? "UP" : "DOWN";
}

function toNumOrNull(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractSnapshotProgressionPoint(row: any) {
  const r = safeObj(row);
  const meta = safeObj((r as any)?.meta);
  const nested = extractPerfectLoopSnapshotState(meta);
  const scores = safeObj((meta as any)?.scores);
  const capital = safeObj((meta as any)?.capitalStatus);
  const nextBestAction = safeObj((meta as any)?.nextBestAction);
  const decisionLifecycle = safeObj((meta as any)?.decisionLifecycle);
  const trends = safeObj((meta as any)?.trends);
  return {
    dayKey: String((r as any)?.dayKey || "").trim() || null,
    at: String((r as any)?.at || "").trim() || null,
    scores: {
      autopilotScore: toNumOrNull((scores as any)?.autopilotScore ?? (r as any)?.score),
      decisionConfidence: toNumOrNull((scores as any)?.decisionConfidence),
      riskPressure: toNumOrNull((scores as any)?.riskPressure ?? (capital as any)?.riskPressure ?? (nested as any)?.capitalStatus?.riskPressure),
      planCoherence: toNumOrNull((scores as any)?.planCoherence),
    },
    capitalStatus: {
      posture:
        String((capital as any)?.posture || (nested as any)?.capitalStatus?.posture || "").trim() || null,
      planAlignment:
        String((capital as any)?.planAlignment || (nested as any)?.capitalStatus?.planAlignment || "").trim() || null,
      riskPressure: toNumOrNull((capital as any)?.riskPressure ?? (nested as any)?.capitalStatus?.riskPressure),
      exposurePct: toNumOrNull((capital as any)?.exposurePct ?? (nested as any)?.capitalStatus?.exposurePct),
      cashPct: toNumOrNull((capital as any)?.cashPct ?? (nested as any)?.capitalStatus?.cashPct),
      nextEvaluationAt:
        String((capital as any)?.nextEvaluationAt || (nested as any)?.systemContinuity?.nextEvaluationAt || "").trim() || null,
    },
    nextBestAction: {
      type:
        String((nextBestAction as any)?.type || (nested as any)?.nextBestAction?.type || "").trim().toUpperCase() || null,
      instruction:
        String((nextBestAction as any)?.instruction || (nested as any)?.nextBestAction?.instruction || "").trim() || null,
      reason:
        String((nextBestAction as any)?.reason || (nested as any)?.nextBestAction?.reason || "").trim() || null,
    },
    decisionIntent:
      String((meta as any)?.decisionIntent || (decisionLifecycle as any)?.decisionIntent || (nested as any)?.decisionLifecycle?.decisionIntent || "").trim() ||
      null,
    previousNarrative: String((trends as any)?.narrative || (nested as any)?.progression?.narrative || "").trim() || null,
  };
}

function buildCurrentProgressionPoint(args: { asOf: string; dailyNode: any }) {
  const daily = safeObj(args.dailyNode);
  const scores = safeObj((daily as any)?.scores);
  const capital = safeObj((daily as any)?.capitalStatus);
  const nextBestAction = safeObj((daily as any)?.nextBestAction);
  const reasonForToday = safeObj((daily as any)?.reasonForToday);
  return {
    dayKey: dayKeyUTCFromIso(args.asOf),
    at: args.asOf,
    scores: {
      autopilotScore: toNumOrNull((scores as any)?.autopilotScore),
      decisionConfidence: toNumOrNull((scores as any)?.decisionConfidence),
      riskPressure: toNumOrNull((scores as any)?.riskPressure ?? (capital as any)?.riskPressure),
      planCoherence: toNumOrNull((scores as any)?.planCoherence),
    },
    capitalStatus: {
      posture: String((capital as any)?.posture || "").trim() || null,
      planAlignment: String((capital as any)?.planAlignment || "").trim() || null,
      riskPressure: toNumOrNull((capital as any)?.riskPressure),
      exposurePct: toNumOrNull((capital as any)?.exposurePct),
      cashPct: toNumOrNull((capital as any)?.cashPct),
      nextEvaluationAt: String((capital as any)?.nextEvaluationAt || "").trim() || null,
    },
    nextBestAction: {
      type: String((nextBestAction as any)?.type || "").trim().toUpperCase() || null,
      instruction: String((nextBestAction as any)?.instruction || "").trim() || null,
      reason: String((nextBestAction as any)?.reason || "").trim() || null,
    },
    decisionIntent:
      String((nextBestAction as any)?.intent || (nextBestAction as any)?.reason || (reasonForToday as any)?.rationale || "").trim() || null,
  };
}

function buildMetricTrend(args: {
  current: number | null;
  previous: Array<number | null>;
  invertMeaning?: boolean;
  n?: number;
}) {
  const nWindow = Math.max(2, Math.min(7, Math.round(Number(args.n || 3))));
  const prev1 = args.previous[0] ?? null;
  const prevN = args.previous[nWindow - 1] ?? null;
  const delta1 = args.current != null && prev1 != null ? Math.round((args.current - prev1) * 100) / 100 : null;
  const deltaN = args.current != null && prevN != null ? Math.round((args.current - prevN) * 100) / 100 : null;
  const direction = progressionDirection(delta1);
  const directionN = progressionDirection(deltaN);
  const meaning =
    direction === "FLAT" ? "STABLE" : (args.invertMeaning ? (direction === "DOWN" ? "IMPROVING" : "WORSENING") : direction === "UP" ? "IMPROVING" : "WORSENING");
  return {
    value: args.current,
    delta1,
    deltaN,
    direction,
    directionN,
    meaning,
    threshold: PROGRESSION_TREND_THRESHOLD,
    windowN: nWindow,
    hasHistory: prev1 != null,
    hasNHistory: prevN != null,
  };
}

function buildProgressionNarrativeAntiChurnState(args: {
  asOf: string;
  mode: AutopilotMode;
  dailyNode: any;
  perfectLoop?: any;
  activation?: any;
  timeline?: any[];
  receiptsCount: number;
  doneToday: boolean;
  hasPlan: boolean;
  hasHoldings: boolean;
}) {
  const dailyNode = safeObj(args.dailyNode);
  const perfectLoop = safeObj(args.perfectLoop);
  const activation = safeObj(args.activation);
  const current = buildCurrentProgressionPoint({ asOf: args.asOf, dailyNode });
  const currentDayKey = String(current.dayKey || "");
  const timelineRows = (Array.isArray(args.timeline) ? args.timeline : [])
    .map((row) => extractSnapshotProgressionPoint(row))
    .filter((row) => row && row.at)
    .filter((row) => !(currentDayKey && row.dayKey && row.dayKey === currentDayKey))
    .slice(0, 12);
  const prev = timelineRows[0] || null;
  const prevList = timelineRows;

  const autopilotTrend = buildMetricTrend({
    current: current.scores.autopilotScore,
    previous: prevList.map((x) => x.scores.autopilotScore),
    n: 3,
  });
  const riskPressureTrend = buildMetricTrend({
    current: current.scores.riskPressure ?? current.capitalStatus.riskPressure,
    previous: prevList.map((x) => x.scores.riskPressure ?? x.capitalStatus.riskPressure),
    invertMeaning: true,
    n: 3,
  });
  const planCoherenceTrend = buildMetricTrend({
    current: current.scores.planCoherence,
    previous: prevList.map((x) => x.scores.planCoherence),
    n: 3,
  });
  const decisionConfidenceTrend = buildMetricTrend({
    current: current.scores.decisionConfidence,
    previous: prevList.map((x) => x.scores.decisionConfidence),
    n: 3,
  });

  const postureFrom = prev?.capitalStatus?.posture ?? null;
  const postureTo = current.capitalStatus.posture ?? null;
  const postureChange = postureFrom && postureTo && postureFrom !== postureTo ? { from: postureFrom, to: postureTo } : null;

  const compositeSeries = [current, ...prevList.slice(0, 6)].map((p) => {
    const a = toNumOrNull((p as any)?.scores?.autopilotScore);
    const c = toNumOrNull((p as any)?.scores?.planCoherence);
    const r = toNumOrNull((p as any)?.scores?.riskPressure ?? (p as any)?.capitalStatus?.riskPressure);
    if (a == null && c == null && r == null) return null;
    return (a ?? 50) * 0.45 + (c ?? 50) * 0.35 + (100 - (r ?? 50)) * 0.2;
  });

  const compositeDirections: Array<"UP" | "DOWN" | "FLAT"> = [];
  for (let i = 0; i < compositeSeries.length - 1; i += 1) {
    const newer = compositeSeries[i];
    const older = compositeSeries[i + 1];
    if (newer == null || older == null) continue;
    compositeDirections.push(progressionDirection(Math.round((newer - older) * 100) / 100));
  }
  const improvingCount = compositeDirections.filter((d) => d === "UP").length;
  const worseningCount = compositeDirections.filter((d) => d === "DOWN").length;
  const stabilityLastN: "IMPROVING" | "WORSENING" | "STABLE" =
    improvingCount > worseningCount && improvingCount > 0
      ? "IMPROVING"
      : worseningCount > improvingCount && worseningCount > 0
        ? "WORSENING"
        : "STABLE";
  let stabilityStreak = 0;
  if (compositeDirections.length > 0) {
    const firstDir = compositeDirections[0];
    for (const dir of compositeDirections) {
      if (dir === firstDir) stabilityStreak += 1;
      else break;
    }
  }

  const riskChip =
    riskPressureTrend.hasHistory
      ? riskPressureTrend.direction === "DOWN"
        ? "Risk Pressure ↓ since yesterday"
        : riskPressureTrend.direction === "UP"
          ? "Risk Pressure ↑ since yesterday"
          : "Risk Pressure stable since yesterday"
      : null;
  const autopilotChip =
    autopilotTrend.hasHistory
      ? autopilotTrend.direction === "FLAT" && autopilotTrend.hasNHistory
        ? autopilotTrend.directionN === "UP"
          ? "Autopilot Score ↑ (3-eval trend)"
          : autopilotTrend.directionN === "DOWN"
            ? "Autopilot Score ↓ (3-eval trend)"
            : "Autopilot Score steady"
        : autopilotTrend.direction === "UP"
          ? "Autopilot Score ↑ since yesterday"
          : autopilotTrend.direction === "DOWN"
            ? "Autopilot Score ↓ since yesterday"
            : "Autopilot Score steady"
      : null;
  const coherenceChip =
    planCoherenceTrend.hasHistory
      ? planCoherenceTrend.direction === "UP"
        ? "Plan alignment improving"
        : planCoherenceTrend.direction === "DOWN"
          ? "Plan alignment weakening"
          : "Plan alignment stable"
      : null;
  const postureChip = postureChange ? `Posture: ${postureChange.from} → ${postureChange.to}` : null;

  const trendChips = [postureChip, riskChip, autopilotChip, coherenceChip]
    .filter(Boolean)
    .map((x) => String(x))
    .slice(0, 4);

  const hasHistory = !!prev;
  const nextEvaluationAt =
    String((current.capitalStatus as any)?.nextEvaluationAt || (activation as any)?.systemStatusBar?.nextEvaluationAt || (perfectLoop as any)?.openLoop?.nextEvaluationAt || "").trim() ||
    addHoursIso(args.asOf, 8);

  const actionType = String((current.nextBestAction as any)?.type || "").toUpperCase();
  const riskPressure = toNumOrNull((current.capitalStatus as any)?.riskPressure ?? (current.scores as any)?.riskPressure) ?? 0;
  const planAlignment = String((current.capitalStatus as any)?.planAlignment || "LOW");
  const posture = String((current.capitalStatus as any)?.posture || "SURVIVAL");

  let directionalState: "BASELINE" | "IMPROVING" | "WORSENING" | "STABLE" | "PRESSURE_BUILDING" = "BASELINE";
  if (hasHistory) {
    if (riskPressureTrend.direction === "UP" && riskPressure >= 60) directionalState = "PRESSURE_BUILDING";
    else if (stabilityLastN === "IMPROVING" || (autopilotTrend.meaning === "IMPROVING" && riskPressureTrend.meaning !== "WORSENING")) directionalState = "IMPROVING";
    else if (stabilityLastN === "WORSENING" || riskPressureTrend.meaning === "WORSENING") directionalState = "WORSENING";
    else directionalState = "STABLE";
  }

  let narrative = "";
  if (!hasHistory) {
    narrative = `Baseline established for your capital. Syntrake will compare the next evaluation against this state before ${nextEvaluationAt}.`;
  } else if (actionType === "HOLD") {
    if (riskPressureTrend.direction === "UP" || riskPressure >= 65) {
      narrative = `Risk pressure is building (${riskPressure}/100); HOLD is active protection while your autopilot monitors conditions before intervention.`;
    } else if (riskPressureTrend.direction === "DOWN") {
      narrative = `Risk pressure is easing and HOLD maintains plan stability while Syntrake waits for higher-quality conditions.`;
    } else {
      narrative = `HOLD is active management: Syntrake is protecting plan stability while conditions remain ${posture.toLowerCase()} and monitored.`;
    }
  } else if (postureChange && riskPressureTrend.direction === "DOWN") {
    narrative = `Portfolio is transitioning from ${postureChange.from} to ${postureChange.to} as risk pressure eases under your plan.`;
  } else if (directionalState === "IMPROVING") {
    narrative = `Portfolio stability is improving; ${planAlignment === "HIGH" ? "alignment remains strong" : "alignment is improving"} and Syntrake keeps continuity on your next evaluation.`;
  } else if (directionalState === "PRESSURE_BUILDING") {
    narrative = `Pressure is building versus the last evaluation; Syntrake is monitoring before intervention to protect your capital.`;
  } else if (directionalState === "WORSENING") {
    narrative = `Conditions are deteriorating versus the last evaluation; Syntrake is prioritizing risk control before aggressive action.`;
  } else {
    narrative = `Conditions are stable versus the last evaluation; your autopilot remains ${posture.toLowerCase()} with ${planAlignment.toLowerCase()} plan alignment.`;
  }

  const continuitySignals = {
    version: "progression_narrative_anti_churn_v1",
    hasHistory,
    directionalState,
    trendChips: hasHistory
      ? (trendChips.length >= 2 ? trendChips : [...trendChips, "Baseline trend forming", "Next evaluation will refine direction"].slice(0, 4))
      : ["Baseline established", "Next evaluation scheduled"],
    holdContext:
      actionType === "HOLD"
        ? {
            active: true,
            reason:
              riskPressureTrend.direction === "UP" || riskPressure >= 65
                ? "Risk pressure remains elevated or is increasing."
                : "No intervention improves expected risk-adjusted outcome right now.",
            protectiveIntent:
              String((dailyNode as any)?.nextBestAction?.intent || (perfectLoop as any)?.holdValue?.intent || "").trim() ||
              "Protect capital while monitoring conditions.",
          }
        : { active: false },
    comparisonBasis: {
      previousEvaluationAt: prev?.at ?? null,
      currentEvaluationAt: args.asOf,
      windowEvaluations: Math.min(1 + prevList.length, 7),
      derivedFrom: "daily_snapshots",
    },
    continuity: {
      nextEvaluationAt,
      systemStatus:
        String((activation as any)?.systemStatusBar?.status || (perfectLoop as any)?.systemStatus?.status || "").trim() || "Monitoring",
      sessionState:
        String((activation as any)?.lifecycle?.sessionState || (perfectLoop as any)?.decisionLifecycle?.sessionState || "").trim() || null,
      decisionPrepared: Boolean((activation as any)?.decisionPreviewState?.decisionPrepared),
    },
  };

  const trendPayload = {
    autopilotScore: autopilotTrend,
    riskPressure: {
      ...riskPressureTrend,
      semanticDirection:
        riskPressureTrend.direction === "DOWN"
          ? "IMPROVING"
          : riskPressureTrend.direction === "UP"
            ? "WORSENING"
            : "STABLE",
    },
    planCoherence: planCoherenceTrend,
    decisionConfidence:
      decisionConfidenceTrend.hasHistory || decisionConfidenceTrend.value != null ? decisionConfidenceTrend : null,
    postureChange,
    stability: {
      streak: stabilityStreak,
      lastN: stabilityLastN,
      evaluatedComparisons: compositeDirections.length,
    },
  };

  const evalTimes: string[] = [];
  const seenDays = new Set<string>();
  const currentDay = dayKeyUTCFromIso(args.asOf) || `current:${args.asOf}`;
  evalTimes.push(args.asOf);
  seenDays.add(currentDay);
  for (const row of prevList) {
    const dayKey = String((row as any)?.dayKey || "");
    const at = String((row as any)?.at || "");
    if (!at) continue;
    const dedupeKey = dayKey || at;
    if (seenDays.has(dedupeKey)) continue;
    seenDays.add(dedupeKey);
    evalTimes.push(at);
  }
  let evaluationsInARow = 1;
  for (let i = 0; i < evalTimes.length - 1; i += 1) {
    const curMs = new Date(evalTimes[i]).getTime();
    const prevMs = new Date(evalTimes[i + 1]).getTime();
    if (!Number.isFinite(curMs) || !Number.isFinite(prevMs)) break;
    const gapHours = Math.abs(curMs - prevMs) / (60 * 60 * 1000);
    if (gapHours <= EVALUATION_STREAK_MAX_GAP_HOURS) evaluationsInARow += 1;
    else break;
  }

  const streak = {
    evaluationsInARow,
    lastEvaluationAt: args.asOf,
    nextEvaluationAt,
    toleranceHours: EVALUATION_STREAK_MAX_GAP_HOURS,
    basis: "daily_snapshots",
  };

  return {
    trends: trendPayload,
    streak,
    narrative,
    continuitySignals,
  };
}

function formatCountdownCompact(targetIso: string | null | undefined, nowIso: string) {
  const t = String(targetIso || "").trim();
  if (!t) return null;
  const targetMs = new Date(t).getTime();
  const nowMs = new Date(nowIso).getTime();
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return null;
  const diffMs = targetMs - nowMs;
  const sign = diffMs < 0 ? "-" : "";
  const absMin = Math.max(0, Math.round(Math.abs(diffMs) / 60000));
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  return `${sign}${h}h ${m}m`;
}

function classifyLivingAutopilotState(args: {
  doneToday: boolean;
  hasPlan: boolean;
  hasHoldings: boolean;
  actionType: string;
  gateStatus: string;
  riskPressure: number | null;
  posture: string | null;
  decisionReady: boolean;
}) {
  const actionType = String(args.actionType || "").toUpperCase();
  const gate = String(args.gateStatus || "").toLowerCase();
  const posture = String(args.posture || "").toUpperCase();
  const risk = Number.isFinite(Number(args.riskPressure)) ? Number(args.riskPressure) : null;
  if (!args.hasPlan || !args.hasHoldings) {
    return { state: "Evaluating", reason: "Syntrake is building the minimum data context before continuous decisions." } as const;
  }
  if (gate === "blocked") {
    return { state: "Evaluating", reason: "Syntrake is evaluating data quality and safety constraints before action exposure." } as const;
  }
  if (args.doneToday) {
    return { state: "Monitoring", reason: "Today's cycle is closed. Syntrake continues monitoring until the next evaluation." } as const;
  }
  if (actionType === "HOLD" || actionType === "PAUSE") {
    if (posture === "DEFENSIVE" || posture === "SURVIVAL" || (risk != null && risk >= 65)) {
      return { state: "Protecting Capital", reason: "HOLD is active protection while risk pressure or uncertainty remains elevated." } as const;
    }
    return { state: "Monitoring", reason: "Syntrake is actively monitoring conditions while no intervention improves expected outcomes." } as const;
  }
  if (actionType === "EXECUTE_BROKER" || actionType === "CLOSE_DAY") {
    return { state: "Adjusting Exposure", reason: "Syntrake prepared an actionable exposure adjustment for today's cycle." } as const;
  }
  if (args.decisionReady) {
    return { state: "Opportunity Scanning", reason: "Syntrake has prepared a decision and continues scanning for confirmation-quality signals." } as const;
  }
  return { state: "Evaluating", reason: "Syntrake is evaluating overnight changes and portfolio conditions." } as const;
}

function buildLivingDecisionEngineV5State(args: {
  asOf: string;
  mode: AutopilotMode;
  dailyNode: any;
  perfectLoop?: any;
  activation?: any;
  progression?: any;
  timeline?: any[];
  engineV4?: any;
  diagnostics?: any;
  actionGate?: any;
  regime?: string | null;
  portfolioItems?: any[];
  valuation?: any;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  receiptsCount: number;
}) {
  const daily = safeObj(args.dailyNode);
  const perfectLoop = safeObj(args.perfectLoop);
  const activation = safeObj(args.activation);
  const progression = safeObj(args.progression);
  const engineV4 = safeObj(args.engineV4);
  const diagnostics = safeObj(args.diagnostics);
  const actionGate = safeObj(args.actionGate || (daily as any)?.actionGate);
  const scores = safeObj((daily as any)?.scores);
  const capitalStatus = safeObj((daily as any)?.capitalStatus);
  const nextBestAction = safeObj((daily as any)?.nextBestAction);
  const nextBestActionPreview = safeObj((daily as any)?.nextBestActionPreview);
  const continuitySignals = safeObj((daily as any)?.continuitySignals || progression);
  const trends = safeObj((daily as any)?.trends);
  const perfectOvernightChanges = safeObj((perfectLoop as any)?.overnightChanges);
  const decisionLifecycle = safeObj((perfectLoop as any)?.decisionLifecycle);
  const v4Scores = safeObj((engineV4 as any)?.scores);
  const v4Trace = Array.isArray((engineV4 as any)?.trace) ? ((engineV4 as any).trace as any[]) : [];
  const v4Audit = safeObj((engineV4 as any)?.audit);

  const currentPoint = buildCurrentProgressionPoint({ asOf: args.asOf, dailyNode: daily });
  const snapshotPoints = (Array.isArray(args.timeline) ? args.timeline : [])
    .map((row) => extractSnapshotProgressionPoint(row))
    .filter((p) => p && p.at)
    .filter((p) => String(p.dayKey || "") !== String(currentPoint.dayKey || ""))
    .slice(0, 12);
  const prevPoint = snapshotPoints[0] || null;

  const riskTrend = safeObj((trends as any)?.riskPressure);
  const planTrend = safeObj((trends as any)?.planCoherence);
  const confTrend = safeObj((trends as any)?.decisionConfidence);
  const stabilityTrend = safeObj((trends as any)?.stability);
  const postureChange = (trends as any)?.postureChange && typeof (trends as any).postureChange === "object"
    ? (trends as any).postureChange
    : null;

  const currentRiskPressure = toNumOrNull((scores as any)?.riskPressure ?? (capitalStatus as any)?.riskPressure);
  const currentPlanCoherence = toNumOrNull((scores as any)?.planCoherence);
  const currentAutopilotScore = toNumOrNull((scores as any)?.autopilotScore ?? (v4Scores as any)?.autopilotScore);
  const currentDecisionConfidence = toNumOrNull((scores as any)?.decisionConfidence ?? (v4Scores as any)?.confidenceScore);
  const currentExposurePct = toNumOrNull((capitalStatus as any)?.exposurePct);
  const currentCashPct = toNumOrNull((capitalStatus as any)?.cashPct);
  const prevExposurePct = toNumOrNull((prevPoint as any)?.capitalStatus?.exposurePct);
  const prevCashPct = toNumOrNull((prevPoint as any)?.capitalStatus?.cashPct);
  const exposureDelta = currentExposurePct != null && prevExposurePct != null ? Math.round((currentExposurePct - prevExposurePct) * 100) / 100 : null;
  const cashDelta = currentCashPct != null && prevCashPct != null ? Math.round((currentCashPct - prevCashPct) * 100) / 100 : null;
  const prevAlignment = String((prevPoint as any)?.capitalStatus?.planAlignment || "").trim() || null;
  const curAlignment = String((capitalStatus as any)?.planAlignment || "").trim() || null;
  const alignmentChanged = !!(prevAlignment && curAlignment && prevAlignment !== curAlignment);
  const gateStatus = String((actionGate as any)?.status || "").trim().toLowerCase();
  const actionType = String((nextBestAction as any)?.type || "").trim().toUpperCase();
  const decisionReady = Boolean((continuitySignals as any)?.continuity?.decisionPrepared) ||
    String((nextBestActionPreview as any)?.status || "").toUpperCase() === "READY" ||
    (!args.doneToday && actionType.length > 0 && !["PAUSE"].includes(actionType));

  const livingAutopilot = classifyLivingAutopilotState({
    doneToday: !!args.doneToday,
    hasPlan: !!args.hasPlan,
    hasHoldings: !!args.hasHoldings,
    actionType,
    gateStatus,
    riskPressure: currentRiskPressure,
    posture: String((capitalStatus as any)?.posture || ""),
    decisionReady,
  });

  const overnightItems: Array<Record<string, any>> = [];
  const pushOvernight = (item: Record<string, any> | null) => {
    if (!item) return;
    overnightItems.push(item);
  };

  const riskDelta1 = toNumOrNull((riskTrend as any)?.delta1);
  if (riskDelta1 != null) {
    pushOvernight({
      key: "volatility_proxy",
      label: "Volatility proxy",
      source: "risk_pressure_delta",
      direction: progressionDirection(riskDelta1),
      delta: riskDelta1,
      message:
        riskDelta1 <= -2
          ? "Market risk pressure proxy eased overnight."
          : riskDelta1 >= 2
            ? "Market risk pressure proxy increased overnight."
            : "Market risk pressure proxy remained stable overnight.",
    });
  }
  if (exposureDelta != null) {
    pushOvernight({
      key: "exposure_drift",
      label: "Exposure drift",
      source: "capital_status_exposure_pct",
      direction: progressionDirection(exposureDelta),
      delta: exposureDelta,
      message:
        exposureDelta >= 2
          ? "Portfolio exposure increased since the last evaluation."
          : exposureDelta <= -2
            ? "Portfolio exposure decreased since the last evaluation."
            : "Portfolio exposure remained stable.",
    });
  }
  if (cashDelta != null) {
    pushOvernight({
      key: "liquidity_variation",
      label: "Liquidity variation",
      source: "capital_status_cash_pct",
      direction: progressionDirection(cashDelta),
      delta: cashDelta,
      message:
        cashDelta >= 2
          ? "Cash/liquidity buffer increased versus the previous evaluation."
          : cashDelta <= -2
            ? "Cash/liquidity buffer decreased versus the previous evaluation."
            : "Liquidity buffer remained stable.",
    });
  }
  if (alignmentChanged || toNumOrNull((planTrend as any)?.delta1) != null) {
    const delta = toNumOrNull((planTrend as any)?.delta1);
    pushOvernight({
      key: "portfolio_alignment_change",
      label: "Portfolio alignment",
      source: "plan_coherence_and_alignment",
      direction: delta != null ? progressionDirection(delta) : "FLAT",
      delta,
      from: prevAlignment,
      to: curAlignment,
      message: alignmentChanged
        ? `Portfolio alignment shifted from ${prevAlignment} to ${curAlignment}.`
        : delta != null && delta >= 2
          ? "Portfolio alignment improved since the last evaluation."
          : delta != null && delta <= -2
            ? "Portfolio alignment weakened since the last evaluation."
            : "Portfolio alignment remained stable.",
    });
  }

  const perfectOvernightItems = Array.isArray((perfectOvernightChanges as any)?.items)
    ? ((perfectOvernightChanges as any).items as any[]).slice(0, 6)
    : [];
  const mergedOvernightItems = [...overnightItems];
  for (const item of perfectOvernightItems) {
    const key = String((item as any)?.key || "").trim();
    if (!key) continue;
    if (mergedOvernightItems.some((x) => String((x as any)?.key || "") === key)) continue;
    mergedOvernightItems.push({
      key,
      label: String((item as any)?.label || key.replace(/_/g, " ")),
      source: "perfect_loop_delta",
      direction: String((item as any)?.direction || "unknown").toUpperCase(),
      delta: toNumOrNull((item as any)?.delta),
      message: `${String((item as any)?.label || "Signal")} ${String((item as any)?.direction || "changed")} since the last evaluation.`,
    });
  }

  const traceSteps = v4Trace
    .map((t: any) => {
      const obj = safeObj(t);
      return String((obj as any)?.step || (obj as any)?.key || (obj as any)?.title || "").trim();
    })
    .filter(Boolean);
  const uniqueTraceSteps = Array.from(new Set(traceSteps));
  const holdingsCount = Array.isArray(args.portfolioItems) ? args.portfolioItems.length : 0;
  const riskChecksCount = Array.isArray((diagnostics as any)?.riskLeaks) ? ((diagnostics as any).riskLeaks as any[]).length : 0;
  const missingSymbolsCount = Array.isArray((diagnostics as any)?.pricing?.missingSymbols)
    ? ((diagnostics as any).pricing.missingSymbols as any[]).length
    : 0;
  const indicatorCount = [
    currentAutopilotScore,
    currentRiskPressure,
    currentPlanCoherence,
    currentDecisionConfidence,
    currentExposurePct,
    currentCashPct,
    toNumOrNull((args.valuation as any)?.coveragePct),
  ].filter((x) => x != null).length;
  const regimeSignalsCount = [args.regime ? 1 : 0, gateStatus ? 1 : 0, riskChecksCount > 0 ? 1 : 0].reduce((a, b) => a + b, 0);
  const factorCount = indicatorCount + holdingsCount + riskChecksCount + uniqueTraceSteps.length + regimeSignalsCount;

  const confidenceReasonParts: string[] = [];
  if (riskDelta1 != null && riskDelta1 >= 2) confidenceReasonParts.push("rising volatility proxy");
  if (riskDelta1 != null && riskDelta1 <= -2) confidenceReasonParts.push("easing risk pressure");
  if (gateStatus === "blocked") confidenceReasonParts.push("safety gate blocked");
  else if (gateStatus === "caution") confidenceReasonParts.push("safety gate in caution");
  if (missingSymbolsCount > 0) confidenceReasonParts.push(`market data gaps (${missingSymbolsCount})`);
  if (toNumOrNull((confTrend as any)?.delta1) != null) {
    const d = Number((confTrend as any).delta1);
    if (d >= 2) confidenceReasonParts.push("confidence improving");
    else if (d <= -2) confidenceReasonParts.push("confidence softening");
  }
  const confidenceReason =
    confidenceReasonParts.length > 0
      ? `Decision confidence ${currentDecisionConfidence != null ? currentDecisionConfidence >= 70 ? "strong" : currentDecisionConfidence >= 45 ? "moderate" : "cautious" : "estimated"} due to ${confidenceReasonParts.slice(0, 3).join(", ")}.`
      : "Decision confidence is calibrated from portfolio conditions, data quality and safety checks.";

  const decisionIntent =
    String((nextBestAction as any)?.intent || (decisionLifecycle as any)?.decisionIntent || (nextBestAction as any)?.reason || "").trim() ||
    "Maintain plan alignment with the current capital posture.";

  const currentAlignmentScore =
    currentPlanCoherence != null
      ? currentPlanCoherence
      : curAlignment === "HIGH"
        ? 85
        : curAlignment === "OK"
          ? 65
          : 40;
  const currentRisk = currentRiskPressure != null ? currentRiskPressure : 50;
  const posture = String((capitalStatus as any)?.posture || "SURVIVAL").toUpperCase();

  const noActionRiskDelta =
    actionType === "HOLD"
      ? riskDelta1 != null && riskDelta1 > 0
        ? Math.min(6, Math.max(1, Math.round(riskDelta1 / 2)))
        : 1
      : posture === "DEFENSIVE" || posture === "SURVIVAL"
        ? 4
        : 2;
  const adjustedRiskDelta =
    actionType === "HOLD"
      ? posture === "DEFENSIVE" || posture === "SURVIVAL"
        ? -2
        : -1
      : actionType === "EXECUTE_BROKER"
        ? currentRisk >= 65
          ? -5
          : -2
        : -1;
  const noActionAlignmentDelta =
    actionType === "HOLD" ? 0 : currentAlignmentScore < 70 ? -3 : -1;
  const adjustedAlignmentDelta =
    actionType === "EXECUTE_BROKER" ? (currentAlignmentScore < 70 ? 4 : 2) : actionType === "HOLD" ? 0 : 1;

  const projectedNoAction = {
    projectedRisk: clampPct(currentRisk + noActionRiskDelta, 0),
    projectedAlignment: clampPct(currentAlignmentScore + noActionAlignmentDelta, 0),
    projectedDrawdown: clampPct((currentRisk + noActionRiskDelta) * 0.35 + (posture === "SURVIVAL" ? 10 : posture === "DEFENSIVE" ? 5 : 0), 0),
  };
  const projectedAdjusted = {
    projectedRisk: clampPct(currentRisk + adjustedRiskDelta, 0),
    projectedAlignment: clampPct(currentAlignmentScore + adjustedAlignmentDelta, 0),
    projectedDrawdown: clampPct((currentRisk + adjustedRiskDelta) * 0.3 + (actionType === "EXECUTE_BROKER" ? 2 : 0), 0),
  };

  const forwardSimulation = {
    simulated: true,
    noActionScenario: projectedNoAction,
    adjustedExposureScenario: projectedAdjusted,
    safePreview:
      projectedNoAction.projectedRisk > currentRisk + 1
        ? "If no action is taken, risk pressure may increase by the next evaluation."
        : projectedAdjusted.projectedAlignment > currentAlignmentScore + 1
          ? "An exposure adjustment can improve plan alignment by the next evaluation."
          : "Projected outcomes remain stable under the current posture unless conditions shift again.",
    projectedOutcomes: {
      riskDeltaIfNoAction: Math.round((projectedNoAction.projectedRisk - currentRisk) * 100) / 100,
      riskDeltaIfAdjusted: Math.round((projectedAdjusted.projectedRisk - currentRisk) * 100) / 100,
      alignmentDeltaIfNoAction: Math.round((projectedNoAction.projectedAlignment - currentAlignmentScore) * 100) / 100,
      alignmentDeltaIfAdjusted: Math.round((projectedAdjusted.projectedAlignment - currentAlignmentScore) * 100) / 100,
    },
  };

  const nextEvaluationAt =
    String((activation as any)?.systemStatusBar?.nextEvaluationAt || (capitalStatus as any)?.nextEvaluationAt || (perfectLoop as any)?.openLoop?.nextEvaluationAt || "").trim() ||
    addHoursIso(args.asOf, 8);
  const lastEvaluationAt =
    String((activation as any)?.systemStatusBar?.lastEvaluationAt || (perfectLoop as any)?.systemStatus?.lastEvaluationAt || (prevPoint as any)?.at || "").trim() || null;
  const temporalContinuity = {
    lastEvaluationAt,
    nextEvaluationAt,
    nextEvaluationCountdown: formatCountdownCompact(nextEvaluationAt, args.asOf),
    nextEvaluationInMinutes:
      (() => {
        const targetMs = new Date(nextEvaluationAt).getTime();
        const nowMs = new Date(args.asOf).getTime();
        if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return null;
        return Math.round((targetMs - nowMs) / 60000);
      })(),
    continuousLoop: true,
  };

  const reasoningSignals = [
    riskDelta1 != null ? `volatility proxy ${riskDelta1 >= 2 ? "up" : riskDelta1 <= -2 ? "down" : "flat"}` : null,
    exposureDelta != null ? `exposure ${exposureDelta >= 2 ? "up" : exposureDelta <= -2 ? "down" : "flat"}` : null,
    String(args.regime || "").trim() ? `regime ${String(args.regime).trim()}` : null,
    toNumOrNull((confTrend as any)?.delta1) != null
      ? `confidence ${Number((confTrend as any)?.delta1) >= 2 ? "up" : Number((confTrend as any)?.delta1) <= -2 ? "down" : "flat"}`
      : null,
    toNumOrNull((planTrend as any)?.delta1) != null
      ? `drift ${Number((planTrend as any)?.delta1) <= -2 ? "rising" : Number((planTrend as any)?.delta1) >= 2 ? "easing" : "stable"}`
      : null,
  ].filter(Boolean) as string[];
  const dynamicExplanation =
    reasoningSignals.length > 0
      ? `Syntrake selected ${actionType || "TODAY'S_ACTION"} from ${reasoningSignals.slice(0, 4).join(", ")} with memory of recent portfolio evolution.`
      : `Syntrake selected ${actionType || "TODAY'S_ACTION"} using current portfolio state, safety checks and recent history memory.`;

  const longitudinalIntelligence = {
    memoryWindow: {
      requestedSnapshots: 7,
      availableSnapshots: snapshotPoints.length,
      usedSnapshots: Math.min(snapshotPoints.length, 7),
      hasComparison: !!prevPoint,
      firstObservedAt: snapshotPoints[snapshotPoints.length - 1]?.at ?? null,
      latestObservedAt: snapshotPoints[0]?.at ?? null,
    },
    trendCore: {
      riskPressureTrend: {
        delta1: toNumOrNull((riskTrend as any)?.delta1),
        deltaN: toNumOrNull((riskTrend as any)?.deltaN),
        direction: String((riskTrend as any)?.direction || "FLAT"),
        semantic: String((riskTrend as any)?.semanticDirection || "STABLE"),
      },
      stabilityTrend: {
        streak: Math.max(0, Number((stabilityTrend as any)?.streak || 0)),
        lastN: String((stabilityTrend as any)?.lastN || "STABLE"),
      },
      alignmentTrend: {
        delta1: toNumOrNull((planTrend as any)?.delta1),
        deltaN: toNumOrNull((planTrend as any)?.deltaN),
        direction: String((planTrend as any)?.direction || "FLAT"),
      },
      confidenceTrend:
        confTrend && Object.keys(confTrend).length
          ? {
              delta1: toNumOrNull((confTrend as any)?.delta1),
              deltaN: toNumOrNull((confTrend as any)?.deltaN),
              direction: String((confTrend as any)?.direction || "FLAT"),
            }
          : null,
    },
    recurrentPatterns: {
      holdDays3:
        [currentPoint, ...snapshotPoints.slice(0, 2)].filter((p) => String((p as any)?.nextBestAction?.type || "").toUpperCase() === "HOLD").length,
      pressureBuildUps7:
        [currentPoint, ...snapshotPoints.slice(0, 6)].filter((p) => {
          const rp = toNumOrNull((p as any)?.scores?.riskPressure ?? (p as any)?.capitalStatus?.riskPressure);
          return rp != null && rp >= 65;
        }).length,
      postureTransitions3:
        postureChange ? 1 : 0,
    },
    adaptiveBehavior: {
      mode: args.mode,
      adaptationState:
        String((continuitySignals as any)?.directionalState || "").trim() ||
        (livingAutopilot.state === "Protecting Capital" ? "PRESSURE_BUILDING" : "STABLE"),
      explanationFingerprint: [
        actionType || "NONE",
        String((capitalStatus as any)?.posture || "NA"),
        String((riskTrend as any)?.direction || "FLAT"),
        String((planTrend as any)?.direction || "FLAT"),
        String(args.regime || "unknown"),
      ].join("|"),
      changedVsLastEvaluation:
        mergedOvernightItems.some((x) => String((x as any)?.direction || "").toUpperCase() !== "FLAT") ||
        Boolean(postureChange) ||
        Boolean(riskDelta1 && Math.abs(riskDelta1) >= 2),
    },
  };

  const evaluationSummary = {
    nFactors: factorCount,
    factors: {
      indicators: indicatorCount,
      portfolioAssets: holdingsCount,
      regimeSignals: regimeSignalsCount,
      riskChecks: riskChecksCount + (gateStatus ? 1 : 0),
      traceSteps: uniqueTraceSteps.length,
    },
    inputsDetected: {
      overnightItems: mergedOvernightItems.length,
      missingMarketSymbols: missingSymbolsCount,
      pricingCoveragePct: toNumOrNull((args.valuation as any)?.coveragePct),
      regime: args.regime ?? null,
    },
  };

  const overnightChangesLayer = {
    detected: mergedOvernightItems.length > 0 || Boolean((perfectOvernightChanges as any)?.detected),
    count: mergedOvernightItems.length,
    items: mergedOvernightItems.slice(0, 6),
    notes: Array.isArray((perfectOvernightChanges as any)?.notes) ? ((perfectOvernightChanges as any).notes as any[]).slice(0, 4) : [],
    unavailableSignals: [
      "sector_pressure",
    ],
  };

  const loopQuestions = {
    whatChanged: overnightChangesLayer.detected || mergedOvernightItems.length > 0,
    whatWasEvaluated: factorCount > 0,
    howPortfolioEvolved: !!prevPoint || (snapshotPoints.length > 0),
    whyThisDecision: Boolean(decisionIntent) || Boolean(dynamicExplanation),
    whatHappensNext: Boolean(temporalContinuity.nextEvaluationAt),
  };

  return {
    engineVersion: "v5-living-intelligence",
    computedAt: args.asOf,
    active: true,
    inputProcessMemoryContinuity: "INPUT→PROCESS→MEMORY→DECISION→CONTINUITY",
    autopilotOperationalState: {
      state: livingAutopilot.state,
      reason: livingAutopilot.reason,
      loopFeelsAlive: true,
    },
    inputVisibility: {
      overnightChanges: overnightChangesLayer,
    },
    processVisibility: {
      evaluationSummary,
    },
    memorySystem: {
      decisionMemory: {
        decisionIntent,
        previousDecisionIntent: (prevPoint as any)?.decisionIntent ?? null,
        previousActionType: (prevPoint as any)?.nextBestAction?.type ?? null,
        memoryAnchors: {
          lastNarrative: (prevPoint as any)?.previousNarrative ?? null,
          lastEvaluationAt: (prevPoint as any)?.at ?? null,
          lastPosture: (prevPoint as any)?.capitalStatus?.posture ?? null,
        },
      },
      trends: {
        riskPressureTrend: longitudinalIntelligence.trendCore.riskPressureTrend,
        stabilityTrend: longitudinalIntelligence.trendCore.stabilityTrend,
        alignmentTrend: longitudinalIntelligence.trendCore.alignmentTrend,
        confidenceTrend: longitudinalIntelligence.trendCore.confidenceTrend,
      },
    },
    decisionIntentLayer: {
      decisionIntent,
      actionType,
      linkedObjective:
        String((decisionLifecycle as any)?.sessionState || "").trim()
          ? `Support ${String((decisionLifecycle as any)?.sessionState).trim().toLowerCase()} phase continuity.`
          : "Support plan continuity.",
      confidence: currentDecisionConfidence,
      confidenceWithReasoning: confidenceReason,
    },
    forwardSimulation: {
      noActionScenario: forwardSimulation.noActionScenario,
      adjustedExposureScenario: forwardSimulation.adjustedExposureScenario,
      projectedOutcomes: forwardSimulation.projectedOutcomes,
      safePreview: forwardSimulation.safePreview,
    },
    adaptiveBehavior: {
      longitudinalIntelligence,
      nonTemplateReasoning: {
        dynamicExplanation,
        reasoningSignals,
        dependsOn: ["volatility_delta_proxy", "exposure_delta", "regime_flag", "confidence_shift", "drift_level"],
      },
      holdAsActiveManagement:
        actionType === "HOLD"
          ? {
              active: true,
              message: "Autopilot protecting capital. No intervention required today.",
              context: (continuitySignals as any)?.holdContext ?? null,
            }
          : { active: false },
    },
    temporalContinuity,
    loopIntegrity: {
      answersDailyLoop: loopQuestions,
      intact: Object.values(loopQuestions).every(Boolean),
    },
    auditBridge: {
      inputHash: String((engineV4 as any)?.inputHash || "").trim() || null,
      traceSteps: uniqueTraceSteps.slice(0, 10),
      auditAvailable: Object.keys(v4Audit).length > 0,
      replayAvailable: Boolean((daily as any)?.replayAudit),
    },
  };
}

function buildSyntrakeIntelligenceStackState(args: {
  asOf: string;
  mode: AutopilotMode;
  dailyNode: any;
  engineV4?: any;
  engineV5?: any;
  perfectLoop?: any;
  activation?: any;
  progression?: any;
  billing?: any;
  paywall?: any;
  portfolioScore?: any;
  unlockedMode?: any;
  diagnostics?: any;
  doneToday: boolean;
  hasPlan: boolean;
  hasHoldings: boolean;
  receiptsCount: number;
  fallbackReason?: string | null;
}) {
  const daily = safeObj(args.dailyNode);
  const engineV4 = safeObj(args.engineV4);
  const engineV5 = safeObj(args.engineV5);
  const perfectLoop = safeObj(args.perfectLoop);
  const activation = safeObj(args.activation);
  const progression = safeObj(args.progression);
  const billing = safeObj(args.billing);
  const paywall = safeObj(args.paywall);
  const portfolioScore = safeObj(args.portfolioScore);
  const unlockedMode = safeObj(args.unlockedMode);
  const diagnostics = safeObj(args.diagnostics);
  const nextBestAction = safeObj((daily as any)?.nextBestAction);
  const nextBestActionPreview = safeObj((daily as any)?.nextBestActionPreview);
  const scores = safeObj((daily as any)?.scores);
  const trends = safeObj((daily as any)?.trends);
  const continuitySignals = safeObj((daily as any)?.continuitySignals);
  const capitalStatus = safeObj((daily as any)?.capitalStatus);
  const replayAudit = safeObj((daily as any)?.replayAudit);
  const scoreAudit = safeObj((daily as any)?.scoreAudit);
  const auditTrail = safeObj((daily as any)?.auditTrail);

  const actionType = String((nextBestAction as any)?.type || "").trim().toUpperCase() || null;
  const decisionIntent =
    String((nextBestAction as any)?.intent || (nextBestAction as any)?.reason || (engineV5 as any)?.decisionIntentLayer?.decisionIntent || "").trim() || null;
  const sourceEngine =
    String((nextBestAction as any)?.source || "").trim() ||
    (Object.keys(engineV4).length ? "engine_v4" : "engine_v3");
  const decisionVisibility =
    String((paywall as any)?.decisionExposure || ((billing as any)?.proActive ? "FULL" : "PREVIEW_ONLY")).toUpperCase();
  const fallbackReason = String(args.fallbackReason || "").trim() || null;

  const nextEvaluationAt =
    String((capitalStatus as any)?.nextEvaluationAt || (activation as any)?.systemStatusBar?.nextEvaluationAt || (engineV5 as any)?.temporalContinuity?.nextEvaluationAt || "").trim() ||
    addHoursIso(args.asOf, 8);
  const countdown =
    String((engineV5 as any)?.temporalContinuity?.nextEvaluationCountdown || "").trim() || formatCountdownCompact(nextEvaluationAt, args.asOf);
  const autoplayState =
    String((engineV5 as any)?.autopilotOperationalState?.state || (activation as any)?.systemStatusBar?.status || "Monitoring").trim();

  const stackStatus =
    fallbackReason
      ? "DEGRADED"
      : !args.hasPlan || !args.hasHoldings
        ? "SETUP"
        : (billing as any)?.proActive || String((paywall as any)?.decisionExposure || "").toUpperCase() === "FULL"
          ? "ACTIVE"
          : "INTELLIGENCE_ONLY";

  const modules = {
    engineV4: {
      active: Object.keys(engineV4).length > 0,
      version: String((engineV4 as any)?.engineVersion || "").trim() || null,
      inputHash: String((engineV4 as any)?.inputHash || "").trim() || null,
    },
    perfectLoop: {
      active: Object.keys(perfectLoop).length > 0,
      sessionState: String((perfectLoop as any)?.decisionLifecycle?.sessionState || "").trim() || null,
      stage: String((perfectLoop as any)?.decisionLifecycle?.stage || "").trim() || null,
    },
    audit: {
      active: Object.keys(scoreAudit).length > 0 || Object.keys(auditTrail).length > 0 || Object.keys(replayAudit).length > 0,
      scoreAudit: Object.keys(scoreAudit).length > 0,
      auditTrail: Object.keys(auditTrail).length > 0,
      replayAudit: Object.keys(replayAudit).length > 0,
    },
    instantPortfolioScore: {
      active: Object.keys(portfolioScore).length > 0,
      ready: Boolean((portfolioScore as any)?.ready),
      source: String((portfolioScore as any)?.source || "").trim() || null,
    },
    paywall: {
      active: Object.keys(paywall).length > 0,
      show: Boolean((paywall as any)?.show),
      decisionExposure: decisionVisibility,
      plan: String((billing as any)?.plan || "free"),
      trialActive: Boolean((billing as any)?.trialActive),
      proActive: Boolean((billing as any)?.proActive),
    },
    activation: {
      active: Object.keys(activation).length > 0,
      phase: String((activation as any)?.phase || "").trim() || null,
      activationMomentEligible: Boolean((activation as any)?.lifecycle?.activationMomentEligible),
    },
    progression: {
      active: Object.keys(progression).length > 0 || Object.keys(trends).length > 0,
      narrativePresent: Boolean(String((daily as any)?.narrative || "").trim()),
      trendChips: Array.isArray((continuitySignals as any)?.trendChips) ? ((continuitySignals as any).trendChips as any[]).length : 0,
      directionalState: String((continuitySignals as any)?.directionalState || "").trim() || null,
    },
    livingEngineV5: {
      active: Object.keys(engineV5).length > 0,
      operationalState: String((engineV5 as any)?.autopilotOperationalState?.state || "").trim() || null,
      loopIntegrityIntact: Boolean((engineV5 as any)?.loopIntegrity?.intact),
      auditBridgeReady: Boolean((engineV5 as any)?.auditBridge?.auditAvailable || (engineV5 as any)?.auditBridge?.replayAvailable),
    },
    modeUnlock: {
      active: Object.keys(unlockedMode).length > 0,
      currentModeUnlocked: Boolean((unlockedMode as any)?.currentModeUnlocked),
      unlockedCount: Array.isArray((unlockedMode as any)?.unlocked) ? ((unlockedMode as any).unlocked as any[]).length : 0,
    },
  };

  const integrityChecks = {
    decisionComputedServerSide: !!sourceEngine,
    decisionIntentPresent: Boolean(decisionIntent),
    overnightChangesVisible: Boolean((engineV5 as any)?.inputVisibility?.overnightChanges),
    processVisibilityPresent: Boolean((engineV5 as any)?.processVisibility?.evaluationSummary),
    memorySignalsPresent: Boolean((engineV5 as any)?.memorySystem?.trends) || Object.keys(trends).length > 0,
    temporalContinuityPresent: Boolean(nextEvaluationAt),
    progressionNarrativePresent: Boolean(String((daily as any)?.narrative || "").trim()),
    paywallServerTruthPresent: Object.keys(billing).length > 0 && Object.keys(paywall).length > 0,
  };

  return {
    version: "syntrake_intelligence_stack_v1",
    active: true,
    stackStatus,
    mode: args.mode,
    asOf: args.asOf,
    activation: {
      fullStackActivated: stackStatus === "ACTIVE" || stackStatus === "INTELLIGENCE_ONLY" || stackStatus === "SETUP",
      fallbackReason,
      doneToday: !!args.doneToday,
      receiptsCount: Math.max(0, Number(args.receiptsCount || 0)),
      hasPlan: !!args.hasPlan,
      hasHoldings: !!args.hasHoldings,
      autopilotOperationalState: autoplayState,
      decisionVisibility,
    },
    modules,
    decisionPipeline: {
      computedServerSide: true,
      sourceEngine,
      actionType,
      decisionIntent,
      visibility: decisionVisibility,
      paywallShown: Boolean((paywall as any)?.show),
      previewStatus: String((nextBestActionPreview as any)?.status || "").trim() || null,
      confidence: Number.isFinite(Number((scores as any)?.decisionConfidence)) ? Number((scores as any)?.decisionConfidence) : null,
      confidenceReasoning:
        String((engineV5 as any)?.decisionIntentLayer?.confidenceWithReasoning || "").trim() || null,
    },
    continuity: {
      lastEvaluationAt:
        String((engineV5 as any)?.temporalContinuity?.lastEvaluationAt || (activation as any)?.systemStatusBar?.lastEvaluationAt || "").trim() ||
        null,
      nextEvaluationAt,
      nextEvaluationCountdown: countdown,
      narrative: String((daily as any)?.narrative || "").trim() || null,
      directionalState:
        String((continuitySignals as any)?.directionalState || (modules.progression as any)?.directionalState || "").trim() || null,
      trendChips: Array.isArray((continuitySignals as any)?.trendChips) ? ((continuitySignals as any).trendChips as any[]).slice(0, 4) : [],
    },
    intelligence: {
      overnightChangesDetected: Boolean((engineV5 as any)?.inputVisibility?.overnightChanges?.detected),
      overnightChangeCount: Number((engineV5 as any)?.inputVisibility?.overnightChanges?.count || 0),
      factorsEvaluated: Number((engineV5 as any)?.processVisibility?.evaluationSummary?.nFactors || 0),
      memoryWindowUsed: Number((engineV5 as any)?.adaptiveBehavior?.longitudinalIntelligence?.memoryWindow?.usedSnapshots || 0),
      projectedOutcomesAvailable: Boolean((engineV5 as any)?.forwardSimulation?.projectedOutcomes),
      dynamicReasoningSignals: Array.isArray((engineV5 as any)?.adaptiveBehavior?.nonTemplateReasoning?.reasoningSignals)
        ? ((engineV5 as any).adaptiveBehavior.nonTemplateReasoning.reasoningSignals as any[]).slice(0, 5)
        : [],
    },
    ownershipAndTrust: {
      ownershipLabel: String((activation as any)?.ownershipSignals?.label || (perfectLoop as any)?.ownership?.label || "").trim() || null,
      ownershipStatus: String((activation as any)?.ownershipSignals?.status || (perfectLoop as any)?.ownership?.status || "").trim() || null,
      capitalPosture: String((capitalStatus as any)?.posture || "").trim() || null,
      planAlignment: String((capitalStatus as any)?.planAlignment || "").trim() || null,
      auditReady: modules.audit.active,
      replayReady: modules.audit.replayAudit,
      explainableDecision: Boolean(decisionIntent) && Boolean((engineV5 as any)?.decisionIntentLayer?.confidenceWithReasoning),
    },
    diagnosticsSummary: {
      gateStatus: String((daily as any)?.actionGate?.status || "").trim() || null,
      pricingCoveragePct: Number((diagnostics as any)?.pricing?.coveragePct || 0),
      topLeakKey: String((diagnostics as any)?.riskLeaks?.[0]?.key || "").trim() || null,
      topLeakSeverity: String((diagnostics as any)?.riskLeaks?.[0]?.severity || "").trim() || null,
    },
    integrityChecks,
    allCriticalSignalsPresent: Object.values(integrityChecks).every(Boolean),
  };
}

type JournalRow = { created_at: string | null };
type JournalDoneRow = { created_at: string | null; details?: any };
type JournalExecutionProofRow = { created_at: string | null; details?: any; type?: string | null };
type PlanPhaseKey = "setup_plan" | "setup_holdings" | "data_quality" | "risk_rebalance" | "execution";

type PlanPhase = {
  key: PlanPhaseKey;
  label: string;
  goal: string;
  exitWhen: string;
};

type GateStatus = "ready" | "caution" | "blocked";

type ActionGateStatus = "ready" | "caution" | "blocked";

type ActionGate = {
  status: ActionGateStatus;
  allowExecution: boolean;
  confidencePct: number;
  reasons: string[];
  nextStep: string;
  requiredPhase: PlanPhaseKey;
  topLeakKey: string | null;
  topLeakSeverity: string | null;
  pressureScore: number;
  coveragePct: number;
  ctaLabel: string;
  ctaAction: string;
  ctaHref: string;
};

type LoopSpecActionType = "EXECUTE_BROKER" | "CLOSE_DAY" | "ENTER" | "ADD" | "REDUCE" | "EXIT" | "HOLD" | "PAUSE";

type WhyNow = {
  driverKey: string | null;
  driverTitle: string | null;
  severity: string | null;
  rationale: string;
  evidence: string[];
  expectedOutcome: string;
  counterfactual: string;
};

type ExecutionCoachPattern = {
  key: string;
  title: string;
  count: number;
  severity: "low" | "medium" | "high";
  impact: "discipline" | "validation" | "cost" | "risk";
  nextStep: string;
};

type ExecutionCoach = {
  windowDays: number;
  stableDays: number;
  unstableDays: number;
  topPatterns: ExecutionCoachPattern[];
  todayRule: string;
  qualityGate: {
    minQuality: number;
    requireReference: boolean;
    slippageWarnBps: number;
  };
};

type SuitabilityStatus = "pass" | "warn" | "blocked";

type SuitabilityGate = {
  status: SuitabilityStatus;
  score: number;
  reasons: string[];
  nextStep: string;
  profile: {
    riskProfile: string | null;
    horizon: string | null;
    goalType: string | null;
    goalTargetValue: number | null;
  };
  checks: {
    profileComplete: boolean;
    modeRiskAligned: boolean;
    targetRealism: "ok" | "stretch" | "unrealistic";
    dataQualityOk: boolean;
  };
};

type FollowUpPlan = {
  status: "scheduled" | "due_today" | "overdue" | "blocked";
  headline: string;
  message: string;
  deadlineAt: string | null;
  nextCheckAt: string | null;
  urgencyMinutes: number;
  channels: Array<"in_app" | "email" | "push" | "telegram">;
  checklist: string[];
};

function normalizePhaseKey(x: unknown): PlanPhaseKey | null {
  const s = String(x || "").toLowerCase().trim();
  if (s === "setup_plan" || s === "setup_holdings" || s === "data_quality" || s === "risk_rebalance" || s === "execution") {
    return s;
  }
  return null;
}

function normalizeGateStatus(x: unknown): GateStatus | null {
  const s = String(x || "").toLowerCase().trim();
  if (s === "ready" || s === "caution" || s === "blocked") return s;
  return null;
}

function computeStreakUTC(rows: JournalRow[]) {
  const days = new Set<string>();
  for (const r of rows) {
    if (!r?.created_at) continue;
    const dt = new Date(r.created_at);
    const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    days.add(key);
  }
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i, 0, 0, 0, 0));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    if (days.has(key)) streak++;
    else break;
  }
  return streak;
}

function dayKeyUTCFromIso(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isStarterWarmupActive(args: {
  starterAppliedAt: string | null;
  fallbackHoldingCreatedAt?: string | null;
  asOfIso: string;
  hasHoldings: boolean;
  doneToday: boolean;
  hasClosedHistory?: boolean;
}) {
  if (!args.hasHoldings || args.doneToday) return false;
  const asOfMs = new Date(args.asOfIso).getTime();
  if (!Number.isFinite(asOfMs)) return false;

  const withinWindow = (iso: string, maxHours: number) => {
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return false;
    const ageMs = asOfMs - ts;
    return ageMs >= 0 && ageMs <= maxHours * 60 * 60 * 1000;
  };

  if (args.starterAppliedAt && withinWindow(args.starterAppliedAt, 36)) return true;

  // Fallback for first-cycle users where holdings were created by starter flow
  // through routes that did not emit starter_applied journal events.
  if (!args.hasClosedHistory && args.fallbackHoldingCreatedAt && withinWindow(args.fallbackHoldingCreatedAt, 24)) {
    return true;
  }

  return false;
}

function recentDayKeysUTC(days: number) {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i, 0, 0, 0, 0));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
  }
  return out;
}

function computeExecutionScore(args: {
  doneRows: JournalDoneRow[];
  weekTargetDays: number;
  streak: number;
}) {
  const weekKeys = recentDayKeysUTC(7);
  const weekSet = new Set(weekKeys);
  const doneDaysSet = new Set<string>();
  const validatedDaysSet = new Set<string>();
  const missingProofDaysSet = new Set<string>();

  let manualCompleted = 0;
  let manualTotal = 0;

  for (const row of args.doneRows ?? []) {
    const dayKey = dayKeyUTCFromIso(row?.created_at || null);
    if (!dayKey || !weekSet.has(dayKey)) continue;
    doneDaysSet.add(dayKey);

    const details = safeObj((row as any)?.details);
    const manual = safeObj((details as any)?.manualExecutionProof);
    const completed = Number((manual as any)?.completed || 0);
    const total = Number((manual as any)?.total || 0);
    const hasManualProof = Number.isFinite(total) && total > 0;
    if (hasManualProof) {
      const done = Math.max(0, Math.round(Number.isFinite(completed) ? completed : 0));
      const tot = Math.max(0, Math.round(total));
      manualCompleted += Math.min(done, tot);
      manualTotal += tot;
    }

    const source = String((details as any)?.source || "").toLowerCase().trim();
    const opportunitiesCount = Number((details as any)?.opportunitiesCount ?? NaN);
    const noActionDay = Number.isFinite(opportunitiesCount) && opportunitiesCount <= 0;
    const manualValidated = hasManualProof && completed >= total;
    const autoValidated = source === "daily_execute_for_me";

    if (manualValidated || autoValidated || noActionDay) {
      validatedDaysSet.add(dayKey);
    } else {
      missingProofDaysSet.add(dayKey);
    }
  }

  const doneDays = doneDaysSet.size;
  const validatedDays = validatedDaysSet.size;
  const weekTarget = Math.max(1, Math.round(args.weekTargetDays || 5));
  const disciplinePct = Math.max(0, Math.min(100, Math.round((doneDays / weekTarget) * 100)));
  const validationPct = doneDays > 0 ? Math.max(0, Math.min(100, Math.round((validatedDays / doneDays) * 100))) : 0;
  const checklistPct =
    manualTotal > 0 ? Math.max(0, Math.min(100, Math.round((manualCompleted / manualTotal) * 100))) : validatedDays > 0 ? 100 : 0;
  const consistencyPct = Math.max(0, Math.min(100, Math.round((Math.min(args.streak || 0, 7) / 7) * 100)));
  const score = Math.max(
    0,
    Math.min(100, Math.round(disciplinePct * 0.35 + validationPct * 0.35 + checklistPct * 0.2 + consistencyPct * 0.1))
  );

  return {
    score,
    tone: score >= 80 ? "good" : score >= 60 ? "warn" : "bad",
    weekTargetDays: weekTarget,
    doneDays,
    validatedDays,
    disciplinePct,
    validationPct,
    checklistPct,
    manualCompleted,
    manualTotal,
    consistencyPct,
    missingProofDays: weekKeys.filter((x) => missingProofDaysSet.has(x)).slice(0, 7),
  };
}

function computeExecutionProofQuality(args: {
  completed: number;
  total: number;
  note: string;
  reference: string;
  feesEur: number | null;
  slippageBps: number | null;
  qualityScore?: number | null;
}) {
  if (typeof args.qualityScore === "number" && Number.isFinite(args.qualityScore)) {
    return clampPct(args.qualityScore, 0);
  }
  let s = 0;
  if (args.total > 0 && args.completed >= args.total) s += 60;
  else if (args.completed > 0) s += 35;
  if (args.reference.trim().length >= 4) s += 20;
  if (args.note.trim().length >= 16) s += 10;
  else if (args.note.trim().length >= 6) s += 6;
  if (args.feesEur != null) s += 5;
  if (args.slippageBps != null) s += 5;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function normalizeExecutionProofFromRow(row: JournalExecutionProofRow) {
  const details = safeObj((row as any)?.details);
  const type = String((row as any)?.type || "").toLowerCase().trim();
  const raw = type === "daily_done" ? safeObj((details as any)?.manualExecutionProof) : details;
  const total = Math.max(0, Math.round(Number((raw as any)?.total || 0)));
  const completed = Math.max(0, Math.round(Number((raw as any)?.completed || 0)));
  if (total <= 0 && completed <= 0) return null;
  const note = String((raw as any)?.note || "").trim();
  const reference = String((raw as any)?.reference || "").trim();
  const feesRaw = Number((raw as any)?.feesEur);
  const feesEur = Number.isFinite(feesRaw) && feesRaw >= 0 ? feesRaw : null;
  const slippageRaw = Number((raw as any)?.slippageBps);
  const slippageBps = Number.isFinite(slippageRaw) ? slippageRaw : null;
  const qualityScore = computeExecutionProofQuality({
    completed,
    total,
    note,
    reference,
    feesEur,
    slippageBps,
    qualityScore: Number((raw as any)?.qualityScore ?? NaN),
  });
  const at = row?.created_at ? String(row.created_at) : null;
  const dayKey = dayKeyUTCFromIso(at);
  return {
    at,
    dayKey,
    completed,
    total,
    note,
    reference,
    feesEur,
    slippageBps,
    qualityScore,
  };
}

function computeExecutionEvidence(rows: JournalExecutionProofRow[]) {
  const normalized = (rows ?? [])
    .map((row) => normalizeExecutionProofFromRow(row))
    .filter(Boolean) as Array<{
    at: string | null;
    dayKey: string | null;
    completed: number;
    total: number;
    note: string;
    reference: string;
    feesEur: number | null;
    slippageBps: number | null;
    qualityScore: number;
  }>;

  const recent7 = new Set(recentDayKeysUTC(7));
  const recent14 = new Set(recentDayKeysUTC(14));
  const strongDays7 = new Set<string>();
  const weakDays7 = new Set<string>();

  let proofs14 = 0;
  let sumQuality14 = 0;
  let withReference14 = 0;
  let totalOrders14 = 0;
  let completedOrders14 = 0;
  let totalFees14 = 0;
  let slippageSamples14 = 0;
  let sumSlippage14 = 0;

  for (const p of normalized) {
    if (!p.dayKey || !recent14.has(p.dayKey)) continue;
    proofs14 += 1;
    sumQuality14 += p.qualityScore;
    if (p.reference.length > 0) withReference14 += 1;
    totalOrders14 += Math.max(0, p.total);
    completedOrders14 += Math.max(0, Math.min(p.completed, p.total));
    if (p.feesEur != null) totalFees14 += p.feesEur;
    if (p.slippageBps != null) {
      slippageSamples14 += 1;
      sumSlippage14 += p.slippageBps;
    }
    if (!recent7.has(p.dayKey)) continue;
    if (p.qualityScore >= 70) strongDays7.add(p.dayKey);
    else weakDays7.add(p.dayKey);
  }

  return {
    proofs14,
    avgQuality14: proofs14 > 0 ? Math.round(sumQuality14 / proofs14) : 0,
    withReference14,
    totalOrders14,
    completedOrders14,
    completionPct14: totalOrders14 > 0 ? Math.round((completedOrders14 / totalOrders14) * 100) : 0,
    totalFeesEur14: Math.round(totalFees14 * 100) / 100,
    avgSlippageBps14: slippageSamples14 > 0 ? Math.round((sumSlippage14 / slippageSamples14) * 100) / 100 : null,
    strongProofDays7: strongDays7.size,
    weakProofDays7: weakDays7.size,
    latestAt: normalized[0]?.at || null,
  };
}

function modeManualQualityGate(mode: AutopilotMode) {
  void mode;
  return { minQuality: 65, requireReference: false, slippageWarnBps: 40 };
}

function patternSeverityByCount(count: number) {
  if (count >= 5) return "high" as const;
  if (count >= 3) return "medium" as const;
  return "low" as const;
}

function computeExecutionCoach(args: {
  mode: AutopilotMode;
  doneRows: JournalDoneRow[];
  proofRows: JournalExecutionProofRow[];
  executionScore: ReturnType<typeof computeExecutionScore>;
}): ExecutionCoach {
  const gate = modeManualQualityGate(args.mode);
  const recent30 = new Set(recentDayKeysUTC(30));
  const patterns = new Map<
    string,
    {
      key: string;
      title: string;
      count: number;
      impact: "discipline" | "validation" | "cost" | "risk";
      nextStep: string;
      weight: number;
    }
  >();

  function bumpPattern(input: {
    key: string;
    title: string;
    delta?: number;
    impact: "discipline" | "validation" | "cost" | "risk";
    nextStep: string;
    weight?: number;
  }) {
    const prev = patterns.get(input.key) || {
      key: input.key,
      title: input.title,
      count: 0,
      impact: input.impact,
      nextStep: input.nextStep,
      weight: Number.isFinite(input.weight) ? Number(input.weight) : 1,
    };
    prev.count += Math.max(1, Math.round(Number(input.delta ?? 1)));
    if (Number.isFinite(input.weight)) prev.weight = Math.max(prev.weight, Number(input.weight));
    patterns.set(input.key, prev);
  }

  const proofs30 = (args.proofRows ?? [])
    .map((row) => normalizeExecutionProofFromRow(row))
    .filter(Boolean)
    .filter((row) => Boolean(row?.dayKey && recent30.has(String(row.dayKey)))) as Array<{
    dayKey: string | null;
    completed: number;
    total: number;
    note: string;
    reference: string;
    feesEur: number | null;
    slippageBps: number | null;
    qualityScore: number;
  }>;

  const strongDays = new Set<string>();
  const weakDays = new Set<string>();

  for (const row of proofs30) {
    const dayKey = String(row.dayKey || "");
    if (!dayKey) continue;
    const total = Math.max(0, Math.round(Number(row.total || 0)));
    const completed = Math.max(0, Math.round(Number(row.completed || 0)));
    const reference = String(row.reference || "").trim();
    const note = String(row.note || "").trim();
    const quality = Math.max(0, Math.min(100, Math.round(Number(row.qualityScore || 0))));

    const strong =
      total > 0 &&
      completed >= total &&
      quality >= gate.minQuality &&
      (!gate.requireReference || reference.length >= 4);
    if (strong) strongDays.add(dayKey);
    else weakDays.add(dayKey);

    if (total > 0 && completed < total) {
      bumpPattern({
        key: "checklist_incomplete",
        title: "Checklist not fully executed",
        impact: "discipline",
        nextStep: "Finish every row before refresh/close day.",
        weight: 1.2,
      });
    }
    if (reference.length < 4) {
      bumpPattern({
        key: "missing_reference",
        title: "Missing order/ticket reference",
        impact: "validation",
        nextStep: "Log broker ticket/order ID in every session.",
        weight: 1.3,
      });
    }
    if (note.length < 6) {
      bumpPattern({
        key: "weak_notes",
        title: "Weak execution notes",
        impact: "validation",
        nextStep: "Write 1 short note with fill quality or deviation.",
      });
    }
    if (quality < gate.minQuality) {
      bumpPattern({
        key: "low_quality_proof",
        title: "Execution proof quality below gate",
        impact: "validation",
        nextStep: `Raise evidence quality to at least ${gate.minQuality}/100.`,
        weight: 1.35,
      });
    }
    if (row.slippageBps != null && row.slippageBps > gate.slippageWarnBps) {
      bumpPattern({
        key: "high_slippage",
        title: "Slippage above normal range",
        impact: "cost",
        nextStep: "Use limit/laddered entries and avoid thin liquidity windows.",
        weight: 1.1,
      });
    }
    if (row.feesEur != null && total > 0 && row.feesEur / total >= 2.5) {
      bumpPattern({
        key: "high_fee_per_order",
        title: "High fee per order",
        impact: "cost",
        nextStep: "Consolidate tiny orders and review fee schedule by instrument.",
      });
    }
  }

  const doneDays30 = new Set(
    (args.doneRows ?? [])
      .map((row) => dayKeyUTCFromIso(row?.created_at || null))
      .filter((x): x is string => Boolean(x && recent30.has(x)))
  ).size;
  const targetDays30 = 22;
  const missedDays = Math.max(0, targetDays30 - doneDays30);
  if (missedDays >= 4) {
    bumpPattern({
      key: "low_closure_discipline",
      title: "Low daily closure discipline",
      delta: missedDays,
      impact: "discipline",
      nextStep: "Close at least 5 receipts each week to keep signal quality stable.",
      weight: 1.15,
    });
  }

  const unvalidatedDays = Math.max(0, Number(args.executionScore.doneDays || 0) - Number(args.executionScore.validatedDays || 0));
  if (unvalidatedDays > 0) {
    bumpPattern({
      key: "unvalidated_days",
      title: "Days closed without strong execution validation",
      delta: unvalidatedDays,
      impact: "risk",
      nextStep: "Before closing day, confirm checklist and attach execution proof.",
      weight: 1.25,
    });
  }

  const ranked = Array.from(patterns.values())
    .sort((a, b) => b.count * b.weight - a.count * a.weight)
    .slice(0, 4)
    .map((x) => ({
      key: x.key,
      title: x.title,
      count: x.count,
      severity: patternSeverityByCount(x.count),
      impact: x.impact,
      nextStep: x.nextStep,
    }));

  const todayRule =
    ranked[0]?.nextStep ||
    (gate.requireReference
      ? "Execute checklist and always add ticket reference before closing day."
      : "Execute checklist fully and keep evidence quality above the minimum gate.");

  return {
    windowDays: 30,
    stableDays: strongDays.size,
    unstableDays: Math.max(weakDays.size, ranked.reduce((s, p) => s + Math.max(0, p.count - 1), 0)),
    topPatterns: ranked,
    todayRule,
    qualityGate: gate,
  };
}

function computeProfileBenchmark(args: {
  mode: AutopilotMode;
  executionScore: ReturnType<typeof computeExecutionScore>;
  pressureScore: number;
  topLeakSeverity: string | null;
  streak: number;
  doneToday: boolean;
  performance: ReturnType<typeof computePerformance>;
  actionGateStatus: GateStatus;
}) {
  const execution = clampPct(args.executionScore.score, 0);
  let risk = clampPct(100 - args.pressureScore, 50);
  const topSeverity = String(args.topLeakSeverity || "").toLowerCase().trim();
  if (topSeverity === "high") risk = Math.max(0, risk - 20);
  else if (topSeverity === "med" || topSeverity === "medium") risk = Math.max(0, risk - 10);
  if (args.actionGateStatus === "blocked") risk = Math.min(risk, 45);
  if (args.actionGateStatus === "caution") risk = Math.min(risk, 68);

  const consistency = clampPct(Math.min(100, args.streak * 12 + (args.doneToday ? 10 : 0)), 0);
  const alpha30 = Number((args.performance as any)?.alpha30dPct || 0);
  const alpha = clampPct(50 + alpha30 * 5, 50);
  const score = clampPct(execution * 0.4 + risk * 0.35 + consistency * 0.15 + alpha * 0.1, 0);

  const tier =
    score >= 85 ? "elite" : score >= 75 ? "strong" : score >= 60 ? "stable" : "at_risk";
  const percentileLabel =
    tier === "elite"
      ? "Top 10%"
      : tier === "strong"
        ? "Top 25%"
        : tier === "stable"
          ? "Top 50%"
          : "Below benchmark";

  return {
    mode: args.mode,
    score,
    tier,
    percentileLabel,
    components: {
      execution,
      risk,
      consistency,
      alpha,
    },
    summary:
      tier === "elite"
        ? "Execution and risk quality are above internal benchmark."
        : tier === "strong"
          ? "Solid weekly quality. Keep execution discipline high."
          : tier === "stable"
            ? "Baseline quality reached. Improve risk control and validation."
            : "Below benchmark. Prioritize blockers and checklist completion.",
  };
}

function computeActionGateAlert(args: {
  recentStatuses: GateStatus[];
  latest: GateStatus;
  doneToday: boolean;
}) {
  const blockedStreakDays = countConsecutiveStartsWith(args.recentStatuses, "blocked");
  const blockedDays7 = args.recentStatuses.filter((x) => x === "blocked").length;
  const cautionDays7 = args.recentStatuses.filter((x) => x === "caution").length;
  const triggered = !args.doneToday && blockedStreakDays >= 2;
  const severity = triggered ? "high" : blockedDays7 >= 2 || cautionDays7 >= 4 ? "medium" : "low";

  const message = triggered
    ? `Action Gate has been BLOCKED for ${blockedStreakDays} consecutive day(s).`
    : severity === "medium"
      ? "Action Gate quality is unstable this week. Reduce speed and fix blockers first."
      : "Action Gate status is stable.";

  return {
    triggered,
    severity,
    latest: args.latest,
    blockedStreakDays,
    blockedDays7,
    cautionDays7,
    message,
    nextStep: triggered
      ? "Do not add new risk until top blocker is resolved and gate status improves."
      : "Keep checklist discipline and monitor pressure/coverage.",
  };
}

function normalizeRiskProfile(v: unknown) {
  const x = String(v || "").toLowerCase().trim();
  if (x === "conservative") return "Conservative";
  if (x === "balanced") return "Balanced";
  if (x === "aggressive") return "Aggressive";
  return null;
}

function normalizeHorizon(v: unknown) {
  const x = String(v || "").toLowerCase().trim();
  if (x === "short") return "Short";
  if (x === "medium") return "Medium";
  if (x === "long") return "Long";
  return null;
}

function normalizeGoalType(v: unknown) {
  const x = String(v || "").toLowerCase().trim();
  if (x === "investing") return "Investing";
  return null;
}

function isDecisionGovernanceV1Enabled() {
  return String(process.env.ENGINE_GOVERNANCE_V1 || "").trim() === "1";
}

function isProbLayerV1Enabled() {
  return String(process.env.ENGINE_PROB_LAYER_V1 || "").trim() === "1";
}

function isDailyBriefingV1Enabled() {
  const raw = String(process.env.ENGINE_DAILY_BRIEFING_V1 || "1").trim();
  return raw === "1";
}

function buildDecisionGovernanceFallback(args: {
  enabled: boolean;
  reasonCode: string;
  gateBlocked?: boolean;
  riskBlocked?: boolean;
}) {
  const reason = String(args.reasonCode || "governance_unavailable").trim() || "governance_unavailable";
  const override = args.riskBlocked ? "risk_policy" : args.gateBlocked ? "action_gate" : "fallback";
  return {
    enabled: args.enabled,
    top_opportunities: [] as any[],
    opportunities: [] as any[],
    portfolio_risk: {
      risk_level: "high",
      concentration_warning: false,
      diversification_score: 0,
      concentration_top1_pct: 0,
      concentration_top3_pct: 0,
      volatility_exposure_pct: 0,
      exposure_by_asset_class: {},
      exposure_by_sector: {},
      correlation_clusters: [],
    },
    daily_decision: {
      asset: null,
      decision: args.gateBlocked || args.riskBlocked ? "AVOID" : "HOLD",
      legacy_action_type: args.gateBlocked || args.riskBlocked ? "PAUSE" : "HOLD",
      confidence: args.gateBlocked || args.riskBlocked ? 0.9 : 0.5,
      confidence_pct: args.gateBlocked || args.riskBlocked ? 90 : 50,
      expected_move: 0,
      expected_value: 0,
      risk_level: "high",
      reason_codes: [reason],
    },
    decision_confidence: args.gateBlocked || args.riskBlocked ? 0.9 : 0.5,
    capital_protection: {
      protection_mode: Boolean(args.gateBlocked || args.riskBlocked),
      recommended_action_bias: args.gateBlocked || args.riskBlocked ? "defensive" : "neutral",
      size_multiplier: args.gateBlocked || args.riskBlocked ? 0.4 : 1,
      restrict_aggressive_entries: Boolean(args.gateBlocked || args.riskBlocked),
      reasons: [reason],
    },
    metadata: {
      precedence: [
        "RiskPolicy hard-stop",
        "ActionGate hard-stop",
        "CapitalProtection bias",
        "Probability and opportunity ranking",
      ],
      override,
      volatility_regime: "high",
      probabilistic_layer_enabled: false,
    },
  };
}

function readGoalTargetValueFromSettings(settings: Record<string, any>) {
  const fromLegacy = Number(settings.goal_target_value);
  if (Number.isFinite(fromLegacy) && fromLegacy > 0) return Math.round(fromLegacy);
  const fromGoalAmount = Number(settings.goal_amount);
  if (Number.isFinite(fromGoalAmount) && fromGoalAmount > 0) return Math.round(fromGoalAmount);
  return null;
}

function readSetupStatusFromSettings(settings: Record<string, any> | null | undefined) {
  const src = settings && typeof settings === "object" ? settings : {};
  const explicit = String(src.setup_status || "").trim().toLowerCase();
  if (explicit === "complete" || explicit === "new" || explicit === "pending") return explicit;

  const modesObj = src.modes && typeof src.modes === "object" ? (src.modes as Record<string, any>) : {};
  const fromModes = String(modesObj.setup_status || "").trim().toLowerCase();
  if (fromModes === "complete" || fromModes === "new" || fromModes === "pending") return fromModes;

  const hasRisk = normalizeRiskProfile(src.risk_profile) != null;
  const hasHorizon = normalizeHorizon(src.horizon) != null;
  const hasGoalType = normalizeGoalType(src.goal_type) != null;
  const hasGoalTarget = readGoalTargetValueFromSettings(src) != null;
  return hasRisk && hasHorizon && hasGoalType && hasGoalTarget ? "complete" : "new";
}

function normalizeUserSettingsRow(row: any): Record<string, any> | null {
  if (!row || typeof row !== "object") return null;
  const src = { ...(row as Record<string, any>) };
  return {
    ...src,
    goal_target_value: readGoalTargetValueFromSettings(src),
    setup_status: readSetupStatusFromSettings(src),
  };
}

function computeSuitabilityGate(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  coveragePct: number;
  currentTotalEur: number;
  userSettings: Record<string, any> | null;
}): SuitabilityGate {
  const settings = args.userSettings || {};
  const riskProfile = normalizeRiskProfile(settings.risk_profile);
  const horizon = normalizeHorizon(settings.horizon);
  const goalType = normalizeGoalType(settings.goal_type);
  const goalTargetValue = readGoalTargetValueFromSettings(settings);

  const reasons: string[] = [];
  let score = 100;

  const profileComplete = Boolean(riskProfile && horizon && goalType && goalTargetValue && goalTargetValue > 0);
  if (!profileComplete) {
    reasons.push("Investor profile is incomplete (risk/horizon/goal).");
    score -= 18;
  }

  const modeRiskAligned = true;

  const totalRef = Math.max(1, Number.isFinite(args.currentTotalEur) ? args.currentTotalEur : 0);
  let targetRealism: "ok" | "stretch" | "unrealistic" = "ok";
  if (goalTargetValue && goalTargetValue > totalRef * 12 && horizon === "Short") {
    targetRealism = "unrealistic";
    reasons.push("Target is unrealistic for current capital and horizon.");
    score -= 30;
  } else if (goalTargetValue && goalTargetValue > totalRef * 8 && (horizon === "Short" || horizon === "Medium")) {
    targetRealism = "stretch";
    reasons.push("Target is very aggressive for current capital and horizon.");
    score -= 14;
  }

  const dataQualityOk = Number(args.coveragePct || 0) >= 80 || !args.hasHoldings;
  if (!dataQualityOk) {
    reasons.push(`Pricing quality is low (${Math.round(Number(args.coveragePct || 0))}%).`);
    score -= 12;
  }

  if (!args.hasPlan) {
    reasons.push("Plan is not active.");
    score -= 25;
  }
  if (args.hasPlan && !args.hasHoldings) {
    reasons.push("Holdings are missing.");
    score -= 20;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const blocked = !modeRiskAligned || targetRealism === "unrealistic";
  const status: SuitabilityStatus = blocked ? "blocked" : score < 70 ? "warn" : "pass";

  const nextStep =
    status === "blocked"
      ? "Update risk profile/mode alignment in setup before executing orders."
      : status === "warn"
        ? "Adjust target realism and improve data quality before scaling risk."
        : "Profile is suitable for disciplined execution.";

  return {
    status,
    score,
    reasons: reasons.slice(0, 4),
    nextStep,
    profile: {
      riskProfile,
      horizon,
      goalType,
      goalTargetValue,
    },
    checks: {
      profileComplete,
      modeRiskAligned,
      targetRealism,
      dataQualityOk,
    },
  };
}

function mergeActionGateWithSuitability(args: {
  mode: AutopilotMode;
  doneToday: boolean;
  gate: ActionGate;
  suitability: SuitabilityGate;
}): ActionGate {
  if (args.doneToday) return args.gate;
  const gate = { ...args.gate, reasons: [...args.gate.reasons] };
  if (args.suitability.status === "blocked") {
    return {
      ...gate,
      status: "blocked",
      allowExecution: false,
      reasons: [args.suitability.reasons[0] || "Suitability gate blocked execution.", ...gate.reasons].slice(0, 3),
      nextStep: args.suitability.nextStep,
      ctaLabel: "Complete setup profile",
      ctaAction: "go_offline_setup",
      ctaHref: `/app?tab=planning&mode=${args.mode}&completeProfile=1`,
    };
  }
  if (args.suitability.status === "warn" && gate.status === "ready") {
    return {
      ...gate,
      status: "caution",
      allowExecution: true,
      reasons: [args.suitability.reasons[0] || "Suitability caution.", ...gate.reasons].slice(0, 3),
      nextStep: args.suitability.nextStep,
      ctaLabel: "Review profile assumptions",
      ctaAction: "go_offline_setup",
      ctaHref: `/app?tab=planning&mode=${args.mode}&completeProfile=1`,
      confidencePct: Math.max(45, Math.min(gate.confidencePct, 72)),
    };
  }
  return gate;
}

function computeFollowUpPlan(args: {
  asOf: string;
  mode: AutopilotMode;
  doneToday: boolean;
  gateStatus: GateStatus;
  suitabilityStatus: SuitabilityStatus;
}): FollowUpPlan {
  const nowMs = safeIsoMs(args.asOf);
  const now = new Date(nowMs);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const deadline = new Date(Date.UTC(y, m, d, 21, 30, 0, 0)); // 21:30 UTC

  if (args.doneToday) {
    const nextIso = nextUtcSlotIso(args.asOf, 8 * 60, 1);
    const next = new Date(nextIso);
    return {
      status: "scheduled",
      headline: "Daily loop completed",
      message: "Next check-in is scheduled for tomorrow. Keep consistency.",
      deadlineAt: deadline.toISOString(),
      nextCheckAt: nextIso,
      urgencyMinutes: Math.max(0, Math.round((next.getTime() - nowMs) / 60000)),
      channels: ["in_app", "push"],
      checklist: [
        "Open Daily at next check-in time.",
        "Review top leak and action gate status.",
        "Execute one focused step and close receipt.",
      ],
    };
  }

  if (args.gateStatus === "blocked" || args.suitabilityStatus === "blocked") {
    const nextIso = nextUtcSlotIso(args.asOf, 60, 1);
    const next = new Date(nextIso);
    return {
      status: "blocked",
      headline: "Execution blocked until setup quality is restored",
      message: "Follow-up is mandatory: clear blockers, then re-open Daily.",
      deadlineAt: deadline.toISOString(),
      nextCheckAt: nextIso,
      urgencyMinutes: Math.max(1, Math.round((next.getTime() - nowMs) / 60000)),
      channels: ["in_app", "email"],
      checklist: [
        "Resolve top blocker from Action Gate/Suitability.",
        "Refresh Daily after profile/portfolio correction.",
        "Execute only when gate returns READY or CAUTION.",
      ],
    };
  }

  if (nowMs > deadline.getTime()) {
    const nextIso = nextUtcSlotIso(args.asOf, 15, 1);
    const next = new Date(nextIso);
    return {
      status: "overdue",
      headline: "Daily receipt is overdue",
      message: "You missed the preferred execution window. Run a short follow-up now.",
      deadlineAt: deadline.toISOString(),
      nextCheckAt: nextIso,
      urgencyMinutes: Math.max(1, Math.round((next.getTime() - nowMs) / 60000)),
      channels: ["in_app", "push", "telegram"],
      checklist: [
        "Run checklist with reduced size.",
        "Capture execution proof quality.",
        "Close receipt immediately after validation.",
      ],
    };
  }

  const mins = Math.max(0, Math.round((deadline.getTime() - nowMs) / 60000));
  return {
    status: "due_today",
    headline: "Daily execution due today",
    message: "Finish one disciplined action before the daily deadline.",
    deadlineAt: deadline.toISOString(),
    nextCheckAt: deadline.toISOString(),
    urgencyMinutes: mins,
    channels: ["in_app", "push"],
    checklist: [
      "Review Today Rule and top pattern.",
      "Execute one high-quality action.",
      "Validate proof and close receipt.",
    ],
  };
}

function computeConfirmed(rows: Array<{ day_key: string; total_eur: number }>) {
  if (!rows?.length) return { today: 0, week: 0, total: 0 };
  const today = Number(rows[0]?.total_eur) || 0;
  const yesterday = Number(rows[1]?.total_eur) || today;
  const confirmedToday = Math.round(today - yesterday);
  const weekRow = rows.length >= 8 ? rows[7] : rows[rows.length - 1];
  const weekTotal = Number(weekRow?.total_eur) || today;
  const confirmedWeek = Math.round(today - weekTotal);
  const oldest = Number(rows[rows.length - 1]?.total_eur) || today;
  const confirmedTotal = Math.round(today - oldest);
  return { today: confirmedToday, week: confirmedWeek, total: confirmedTotal };
}

function modeAnnualBenchmarkPct(mode: AutopilotMode) {
  void mode;
  return 7;
}

function round2(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function pctReturn(cur: number, base: number) {
  if (!Number.isFinite(cur) || !Number.isFinite(base) || base <= 0) return 0;
  return ((cur - base) / base) * 100;
}

function stddev(nums: number[]) {
  if (!nums.length) return 0;
  const mean = nums.reduce((s, n) => s + n, 0) / nums.length;
  const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
  return Math.sqrt(Math.max(0, variance));
}

function computePerformance(
  rowsDesc: Array<{ day_key: string | null; total_eur: number }>,
  mode: AutopilotMode
) {
  const cleanDesc = rowsDesc
    .map((r) => ({ day_key: r?.day_key ?? null, total_eur: Number(r?.total_eur) || 0 }))
    .filter((r) => Number.isFinite(r.total_eur) && r.total_eur >= 0);

  if (cleanDesc.length === 0) {
    return {
      hasData: false,
      trackedDays: 0,
      totalReturnPct: 0,
      return30dPct: 0,
      return90dPct: 0,
      maxDrawdownPct: 0,
      volatility30dPct: 0,
      benchmarkAnnualPct: modeAnnualBenchmarkPct(mode),
      benchmarkTotalPct: 0,
      benchmark30dPct: 0,
      benchmark90dPct: 0,
      alphaTotalPct: 0,
      alpha30dPct: 0,
      alpha90dPct: 0,
    };
  }

  const current = cleanDesc[0].total_eur;
  const asc = [...cleanDesc].reverse();
  const first = asc[0]?.total_eur ?? current;
  const trackedDays = Math.max(0, asc.length - 1);

  const row30 = cleanDesc[Math.min(30, cleanDesc.length - 1)]?.total_eur ?? first;
  const row90 = cleanDesc[Math.min(90, cleanDesc.length - 1)]?.total_eur ?? first;

  let peak = asc[0]?.total_eur ?? 0;
  let maxDrawdownPct = 0;
  for (const p of asc) {
    if (p.total_eur > peak) peak = p.total_eur;
    if (peak > 0) {
      const dd = ((p.total_eur - peak) / peak) * 100;
      if (dd < maxDrawdownPct) maxDrawdownPct = dd;
    }
  }

  const windowAsc = [...cleanDesc.slice(0, 31)].reverse();
  const dailyReturns: number[] = [];
  for (let i = 1; i < windowAsc.length; i++) {
    const prev = windowAsc[i - 1].total_eur;
    const cur = windowAsc[i].total_eur;
    if (prev > 0) dailyReturns.push(((cur - prev) / prev) * 100);
  }

  const benchmarkAnnualPct = modeAnnualBenchmarkPct(mode);
  const benchmarkTotalPct = ((1 + benchmarkAnnualPct / 100) ** (trackedDays / 365) - 1) * 100;
  const benchmark30dPct = ((1 + benchmarkAnnualPct / 100) ** (30 / 365) - 1) * 100;
  const benchmark90dPct = ((1 + benchmarkAnnualPct / 100) ** (90 / 365) - 1) * 100;

  const totalReturnPct = pctReturn(current, first);
  const return30dPct = pctReturn(current, row30);
  const return90dPct = pctReturn(current, row90);

  return {
    hasData: cleanDesc.length >= 2,
    trackedDays,
    totalReturnPct: round2(totalReturnPct),
    return30dPct: round2(return30dPct),
    return90dPct: round2(return90dPct),
    maxDrawdownPct: round2(maxDrawdownPct),
    volatility30dPct: round2(stddev(dailyReturns)),
    benchmarkAnnualPct: round2(benchmarkAnnualPct),
    benchmarkTotalPct: round2(benchmarkTotalPct),
    benchmark30dPct: round2(benchmark30dPct),
    benchmark90dPct: round2(benchmark90dPct),
    alphaTotalPct: round2(totalReturnPct - benchmarkTotalPct),
    alpha30dPct: round2(return30dPct - benchmark30dPct),
    alpha90dPct: round2(return90dPct - benchmark90dPct),
  };
}

function safeObj(x: any) {
  return x && typeof x === "object" ? x : {};
}

export function attachDecisionEnvelopeToDailyBundleRouteResponse<
  T extends {
    mode: AutopilotMode;
    asOf: string;
    daily: Record<string, any>;
    derived?: Record<string, any>;
  },
>(args: {
  response: T;
  branch: DecisionEnvelopeBranch;
  branchReason: string | null;
  tradingLiveInput?: ComposeTradingLiveDecisionInput | null;
  tradingWatchlistInputs?: ComposeTradingLiveDecisionInput[] | null;
}) {
  return buildDailyDecisionPayload(args).response;
}

function finalizeDailyBundleResponse<T extends { daily?: Record<string, any>; derived?: Record<string, any> | null }>(
  response: T,
  args?: {
    mode: AutopilotMode;
    asOf: string;
    accessTier: AccessTier;
  },
): T {
  if (!args) return response;
  return applyDailyBundleEntitlements(response, {
    mode: args.mode,
    tier: args.accessTier,
    entitlements: getEntitlementsForTier(args.accessTier),
    asOf: args.asOf,
  });
}

function normalizeActionKey(x: unknown) {
  const s = String(x || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_");
  return s || null;
}

function actionKeyFromCandidate(c: any) {
  return normalizeActionKey(c?.cta?.action);
}

function buildPlanPhase(args: {
  hasPlan: boolean;
  hasHoldings: boolean;
  diagnostics: Record<string, unknown>;
}): PlanPhase {
  if (!args.hasPlan) {
    return {
      key: "setup_plan",
      label: "Setup: activate plan",
      goal: "Define risk and activate an enforceable plan.",
      exitWhen: "Plan status is active.",
    };
  }

  if (args.hasPlan && !args.hasHoldings) {
    return {
      key: "setup_holdings",
      label: "Setup: load holdings",
      goal: "Load real holdings so Safety Brain can run.",
      exitWhen: "At least one holding is present.",
    };
  }

  const leaks = Array.isArray((args.diagnostics as any)?.riskLeaks) ? ((args.diagnostics as any).riskLeaks as any[]) : [];
  const topKey = String(leaks[0]?.key || "").toLowerCase().trim();

  if (
    topKey === "pricing_low" ||
    topKey === "pricing_stale_high" ||
    topKey === "pricing_stale_med" ||
    topKey === "valuation_zero"
  ) {
    return {
      key: "data_quality",
      label: "Data quality phase",
      goal: "Get pricing/valuation reliable before risk decisions.",
      exitWhen: "Pricing coverage and freshness are healthy.",
    };
  }

  if (
    topKey === "concentration_high" ||
    topKey === "concentration_med" ||
    topKey === "cash_drag_high" ||
    topKey === "cash_drag_med"
  ) {
    return {
      key: "risk_rebalance",
      label: "Risk rebalance phase",
      goal: "Reduce concentration and leak pressure.",
      exitWhen: "Top risk leak drops below medium severity.",
    };
  }

  return {
    key: "execution",
    label: "Execution discipline phase",
    goal: "Execute one clear action and close the day.",
    exitWhen: "Daily receipt is closed.",
  };
}

function clampPct(n: number, fallback = 0) {
  const v = Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function topLeakInfo(diagnostics: Record<string, unknown>) {
  const leaks = Array.isArray((diagnostics as any)?.riskLeaks) ? ((diagnostics as any).riskLeaks as any[]) : [];
  const top = safeObj(leaks[0]);
  const key = String((top as any)?.key || "").toLowerCase().trim() || null;
  const title = String((top as any)?.title || "").trim() || null;
  const severity = String((top as any)?.severity || "").toLowerCase().trim() || null;
  const detail = String((top as any)?.detail || "").trim() || null;
  return { key, title, severity, detail };
}

function actionGateConfidence(args: {
  status: ActionGateStatus;
  coveragePct: number;
  pressureScore: number;
  topSeverity: string | null;
}) {
  let score = args.status === "ready" ? 82 : args.status === "caution" ? 66 : 42;
  score -= Math.max(0, 80 - args.coveragePct) * 0.35;
  score -= Math.max(0, args.pressureScore - 55) * 0.45;
  if (args.topSeverity === "high") score -= 12;
  else if (args.topSeverity === "med" || args.topSeverity === "medium") score -= 6;
  else if (args.topSeverity === "low") score += 2;
  if (args.status === "blocked") score = Math.min(score, 55);
  return clampPct(score, args.status === "ready" ? 80 : args.status === "caution" ? 62 : 40);
}

function buildActionGate(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  diagnostics: Record<string, unknown>;
  pressureScore: number;
  planPhase: PlanPhase;
  riskPolicyEval?: RiskPolicyEvaluation | null;
}): ActionGate {
  const leak = topLeakInfo(args.diagnostics);
  const coveragePct = clampPct(Number((args.diagnostics as any)?.pricing?.coveragePct || 0), 0);
  const pressureScore = clampPct(args.pressureScore, 0);
  const reasons: string[] = [];
  let status: ActionGateStatus = "ready";
  let nextStep = "Execute the next best action and close the daily receipt.";
  let ctaLabel = "Open Daily";
  let ctaAction = "open_daily";
  let ctaHref = `/app?tab=daily&mode=${args.mode}`;

  if (args.doneToday) {
    status = "blocked";
    reasons.push("Day already closed. Execution is disabled until next session.");
    nextStep = "Return tomorrow and execute the next plan step.";
    ctaLabel = "Refresh Daily";
    ctaAction = "refresh_daily";
    ctaHref = `/app?tab=daily&mode=${args.mode}`;
  } else if (!args.hasPlan) {
    status = "blocked";
    reasons.push("Plan is not active.");
    nextStep = "Activate your plan before sending any order.";
    ctaLabel = "Open Planning";
    ctaAction = "go_planning";
    ctaHref = `/app?tab=planning&mode=${args.mode}`;
  } else if (!args.hasHoldings) {
    status = "blocked";
    reasons.push("No holdings loaded.");
    nextStep = "Import/add holdings so risk controls can run.";
    ctaLabel = "Open Portfolio";
    ctaAction = "go_portfolio";
    ctaHref = `/app?tab=portfolio&mode=${args.mode}`;
  } else {
    const hardDataBlockers = new Set(["pricing_low", "pricing_stale_high", "valuation_zero"]);
    if (leak.key && hardDataBlockers.has(leak.key)) {
      const hardDataBlock =
        leak.key === "valuation_zero" ||
        leak.key === "pricing_stale_high" ||
        coveragePct < 80;

      if (hardDataBlock) {
        status = "blocked";
        reasons.push("Pricing/valuation quality is too low for safe execution.");
        nextStep = "Fix top pricing blocker and refresh before acting.";
        ctaLabel = "Fix in Portfolio";
        ctaAction = "open_portfolio";
        ctaHref = `/app?tab=portfolio&mode=${args.mode}`;
      } else {
        status = "caution";
        reasons.push(`Pricing coverage is below the preferred floor (${coveragePct}%).`);
        nextStep = "Trade reduced size only and refresh pricing quality before scaling.";
        ctaLabel = "Run Checklist";
        ctaAction = "run_checklist";
        ctaHref = `/app?tab=daily&mode=${args.mode}`;
      }
    } else if (args.riskPolicyEval?.blocked) {
      status = "blocked";
      const breaches = Array.isArray(args.riskPolicyEval.breaches) ? args.riskPolicyEval.breaches : [];
      const primary = safeObj(breaches[0]);
      const breachKey = String((primary as any).key || "").trim().toLowerCase();
      const actual = Number((primary as any).actual);
      const limit = Number((primary as any).limit);
      const actualLabel = Number.isFinite(actual) ? `${Math.round(actual * 100) / 100}%` : "current level";
      const limitLabel = Number.isFinite(limit) ? `${Math.round(limit * 100) / 100}%` : "policy limit";

      reasons.push(args.riskPolicyEval.reasons[0] || "Risk policy hard limit breached.");
      nextStep = args.riskPolicyEval.nextStep || "Restore policy limits before any execution.";
      ctaLabel = "Review Risk Policy";
      ctaAction = "go_planning";
      ctaHref = `/app?tab=planning&mode=${args.mode}`;

      if (breachKey === "single_position_limit") {
        nextStep = `Trim the largest position from ${actualLabel} to <= ${limitLabel}, then refresh Daily.`;
        ctaLabel = "Fix in Portfolio";
        ctaAction = "review_portfolio";
        ctaHref = `/app?tab=portfolio&mode=${args.mode}&fixNow=1&fixKey=concentration_high&fixFrom=daily`;
      } else if (breachKey === "top3_concentration_limit") {
        nextStep = `Reduce top-3 concentration from ${actualLabel} to <= ${limitLabel}, then refresh Daily.`;
        ctaLabel = "Rebalance Portfolio";
        ctaAction = "review_portfolio";
        ctaHref = `/app?tab=portfolio&mode=${args.mode}&fixNow=1&fixKey=concentration_high&fixFrom=daily`;
      } else if (breachKey === "drawdown_limit" || breachKey === "exposure_limit") {
        nextStep = `Reduce risk until ${actualLabel} is back inside ${limitLabel}, then refresh Daily.`;
        ctaLabel = "Reduce Portfolio Risk";
        ctaAction = "review_portfolio";
        ctaHref = `/app?tab=portfolio&mode=${args.mode}&fixNow=1&fixKey=concentration_high&fixFrom=daily`;
      } else if (
        breachKey === "pricing_coverage_limit" ||
        breachKey === "missing_symbols_limit" ||
        breachKey === "high_severity_leak"
      ) {
        nextStep = "Fix pricing/holding data quality in Portfolio, then refresh Daily.";
        ctaLabel = "Fix in Portfolio";
        ctaAction = "open_portfolio";
        ctaHref = `/app?tab=portfolio&mode=${args.mode}&fixNow=1&fixKey=pricing_low&fixFrom=daily`;
      } else if (breachKey === "decision_pressure_limit") {
        nextStep = "Do not execute now. Reduce pressure and re-evaluate on next cycle.";
        ctaLabel = "Open Daily";
        ctaAction = "open_daily";
        ctaHref = `/app?tab=daily&mode=${args.mode}`;
      }
    } else if (pressureScore >= 85) {
      status = "blocked";
      reasons.push(`Decision pressure is too high (${pressureScore}/100).`);
      nextStep = "Reduce exposure and wait for pressure to normalize.";
      ctaLabel = "Review Portfolio Risk";
      ctaAction = "review_portfolio";
      ctaHref = `/app?tab=portfolio&mode=${args.mode}`;
    } else if (leak.severity === "high" || coveragePct < 75 || pressureScore >= 70) {
      status = "caution";
      if (leak.severity === "high") reasons.push("High-severity risk leak still active.");
      if (coveragePct < 75) reasons.push(`Pricing coverage is low (${coveragePct}%).`);
      if (pressureScore >= 70) reasons.push(`Decision pressure elevated (${pressureScore}/100).`);
      nextStep = "Use reduced size and confirm every checklist step before close day.";
      ctaLabel = "Run Checklist";
      ctaAction = "run_checklist";
      ctaHref = `/app?tab=daily&mode=${args.mode}`;
    } else if (args.riskPolicyEval?.status === "warn") {
      status = "caution";
      reasons.push(args.riskPolicyEval.reasons[0] || "Risk policy near limit.");
      nextStep = args.riskPolicyEval.nextStep || "Proceed with reduced size and tighter proof discipline.";
      ctaLabel = "Run Checklist";
      ctaAction = "run_checklist";
      ctaHref = `/app?tab=daily&mode=${args.mode}`;
    }
  }

  if (reasons.length === 0) {
    reasons.push("No critical blocker detected. Execution allowed.");
  }

  const confidencePct = actionGateConfidence({
    status,
    coveragePct,
    pressureScore,
    topSeverity: leak.severity,
  });

  const allowExecution = !args.doneToday && status !== "blocked";

  return {
    status,
    allowExecution,
    confidencePct,
    reasons: reasons.slice(0, 3),
    nextStep,
    requiredPhase: args.planPhase.key,
    topLeakKey: leak.key,
    topLeakSeverity: leak.severity,
    pressureScore,
    coveragePct,
    ctaLabel,
    ctaAction,
    ctaHref,
  };
}

function buildWhyNow(args: {
  diagnostics: Record<string, unknown>;
  planPhase: PlanPhase;
  pressureScore: number;
  actionGate: ActionGate;
}) {
  const leak = topLeakInfo(args.diagnostics);
  const coveragePct = clampPct(Number((args.diagnostics as any)?.pricing?.coveragePct || 0), 0);
  const pressure = clampPct(args.pressureScore, 0);

  let rationale = "No critical blocker. Execute one focused step with discipline.";
  let expectedOutcome = "Higher execution consistency and stable plan progression.";
  let counterfactual = "If skipped, progress slows and decision quality deteriorates over time.";

  if (!leak.key && args.actionGate.status === "blocked") {
    rationale = "Execution is blocked by setup/discipline constraints, not market edge.";
    expectedOutcome = "Safety constraints preserved; lower avoidable mistakes.";
    counterfactual = "Ignoring blockers increases unforced errors and plan drift.";
  } else if (leak.key === "pricing_low" || leak.key === "pricing_stale_high" || leak.key === "valuation_zero") {
    rationale = "Top driver is data quality. Acting before reliable valuation increases false decisions.";
    expectedOutcome = "Cleaner inputs, more reliable risk decisions, and fewer noisy actions.";
    counterfactual = "Low-quality pricing can trigger wrong position sizes and poor entries.";
  } else if (
    leak.key === "concentration_high" ||
    leak.key === "concentration_med" ||
    leak.key === "cash_drag_high" ||
    leak.key === "cash_drag_med"
  ) {
    rationale = "Top driver is portfolio risk structure. Rebalance before adding risk.";
    expectedOutcome = "Lower leak pressure and better resilience under volatility.";
    counterfactual = "Risk remains skewed and compounds drawdown probability.";
  }

  const evidence = [
    `Top leak: ${leak.title || leak.key || "none"}${leak.severity ? ` (${String(leak.severity).toUpperCase()})` : ""}`,
    `Pricing coverage: ${coveragePct}%`,
    `Decision pressure: ${pressure}/100`,
    `Current phase: ${args.planPhase.label}`,
  ];

  const whyNow: WhyNow = {
    driverKey: leak.key,
    driverTitle: leak.title,
    severity: leak.severity,
    rationale,
    evidence,
    expectedOutcome,
    counterfactual,
  };

  return whyNow;
}

const ACTION_MICRO_STEPS: Record<string, string[]> = {
  go_planning: [
    "Confirm target capital and horizon with real numbers.",
    "Check max single position cap and update if needed.",
    "Review monthly contribution realism before saving.",
  ],
  go_portfolio: [
    "Add your 3 largest holdings first, then the rest.",
    "Fill missing quantity/value fields before leaving.",
    "Remove stale symbols you no longer hold.",
  ],
  open_portfolio: [
    "Fix missing values on the top 2 symbols by size.",
    "Update one stale quote-driven position manually.",
    "Verify total portfolio value matches broker screen.",
  ],
  review_portfolio: [
    "Trim the single largest position toward plan cap.",
    "Reduce one concentrated position using small orders.",
    "Re-check top-3 concentration after adjustments.",
  ],
  reduce_cash_drag: [
    "Deploy only a small tranche today, not full cash.",
    "Split deployment into 2-4 entries across sessions.",
    "Use plan risk cap before any new entry.",
  ],
  mark_done: [
    "Re-check leaks and lock receipt to preserve discipline.",
    "Confirm no open checklist remains, then close day.",
    "Save today receipt and stop taking new action for the day.",
  ],
};

const PHASE_MICRO_STEPS: Record<PlanPhaseKey, string[]> = {
  setup_plan: [
    "Set explicit max drawdown and max position size before activation.",
    "Save one realistic target scenario and one stress scenario.",
    "Activate the plan only after confirming monthly contribution feasibility.",
  ],
  setup_holdings: [
    "Import your 5 largest positions first to unlock risk visibility.",
    "Fill missing qty/value on at least 3 holdings before leaving setup.",
    "Validate portfolio total against broker equity and correct drift.",
  ],
  data_quality: [
    "Fix missing prices on the two largest unpriced holdings.",
    "Update stale symbols and confirm coverage above minimum threshold.",
    "Recalculate valuation and check if top leak severity dropped.",
  ],
  risk_rebalance: [
    "Reduce highest concentration by a small tranche only.",
    "Deploy idle cash in staged entries instead of one big order.",
    "Re-run rebalance and verify top risk leak is below medium.",
  ],
  execution: [
    "Generate checklist and execute first item immediately.",
    "Confirm fills for all mandatory steps and capture proof.",
    "Close daily receipt only after checklist status is complete.",
  ],
};

function pickNonRepeatingStep(args: { candidates: string[]; seed: number; avoid?: string | null }) {
  const candidates = (args.candidates ?? []).filter((x) => typeof x === "string" && x.trim().length > 0);
  if (!candidates.length) return null;
  const start = Math.abs(args.seed) % candidates.length;
  const avoid = args.avoid ? String(args.avoid).trim().toLowerCase() : "";
  if (!avoid) return candidates[start];
  for (let i = 0; i < candidates.length; i++) {
    const next = candidates[(start + i) % candidates.length];
    if (next.trim().toLowerCase() !== avoid) return next;
  }
  return candidates[start];
}

function microStepForAction(args: { action: string | null; seed: number; avoid?: string | null }) {
  const key = normalizeActionKey(args.action || "") || "";
  const steps = ACTION_MICRO_STEPS[key];
  if (!steps?.length) return null;
  return pickNonRepeatingStep({ candidates: steps, seed: args.seed, avoid: args.avoid ?? null });
}

function microStepForPhase(args: { phaseKey: PlanPhaseKey; seed: number; avoid?: string | null }) {
  const steps = PHASE_MICRO_STEPS[args.phaseKey];
  if (!steps?.length) return null;
  return pickNonRepeatingStep({ candidates: steps, seed: args.seed, avoid: args.avoid ?? null });
}

function countConsecutiveStartsWith(actions: Array<string | null | undefined>, target: string | null | undefined) {
  if (!target) return 0;
  let n = 0;
  for (const a of actions) {
    if (!a || a !== target) break;
    n += 1;
  }
  return n;
}

function extractSnapshotMeta(meta: any) {
  // Snapshots vary depending on how they were saved historically.
  // We support multiple shapes safely:
  // 1) meta.snapshot = { daily, derived }
  // 2) meta.daily / meta.derived directly
  // 3) meta.bundle = { daily, derived } (rare)
  const m = safeObj(meta);
  const snap = safeObj(m.snapshot);
  const bundle = safeObj(m.bundle);

  const daily = safeObj(snap.daily || m.daily || bundle.daily);
  const derived = safeObj(snap.derived || m.derived || bundle.derived);

  const nbaTitle =
    (daily?.nba?.title ? String(daily.nba.title) : "") ||
    (derived?.nba?.title ? String(derived.nba.title) : "") ||
    "";
  const nbaAction =
    (daily?.nba?.cta?.action ? String(daily.nba.cta.action) : "") ||
    (daily?.nba?.action ? String(daily.nba.action) : "") ||
    (derived?.nba?.cta?.action ? String(derived.nba.cta.action) : "") ||
    (derived?.nba?.action ? String(derived.nba.action) : "") ||
    "";

  const topLeak =
    (derived?.topRiskLeak ? String(derived.topRiskLeak) : "") ||
    (derived?.diagnostics?.riskLeaks?.[0]?.title ? String(derived.diagnostics.riskLeaks[0].title) : "") ||
    "";

  const score =
    typeof derived?.autopilotScore === "number"
      ? derived.autopilotScore
      : typeof derived?.autopilot?.total === "number"
        ? derived.autopilot.total
        : null;
  const planTrack = safeObj(daily?.planTrack || derived?.planTrack);
  const phaseFromTrack = normalizePhaseKey((planTrack as any)?.phase?.key);
  const gateTrack = safeObj(daily?.actionGate || derived?.actionGate);
  const gateStatus = normalizeGateStatus((gateTrack as any)?.status);
  const gateConfidenceRaw = Number((gateTrack as any)?.confidencePct ?? NaN);
  const gateConfidence = Number.isFinite(gateConfidenceRaw) ? clampPct(gateConfidenceRaw, 0) : null;

  const proofWhatChanged = Array.isArray((daily as any)?.proof?.whatChanged)
    ? (((daily as any).proof.whatChanged as any[]).map((x: any) => String(x || "")) as string[])
    : [];
  const planFocusFromProof = proofWhatChanged
    .map((x) => x.trim())
    .find((x) => x.toLowerCase().startsWith("plan focus:"));
  const planFocusFromTrack = (planTrack as any)?.microStep ? String((planTrack as any).microStep) : "";
  const planFocus = planFocusFromTrack || (planFocusFromProof ? planFocusFromProof.replace(/^plan focus:\s*/i, "").trim() : "");

  return {
    nbaTitle: nbaTitle || null,
    nbaAction: nbaAction || null,
    topLeak: topLeak || null,
    score,
    planPhaseKey: phaseFromTrack,
    planFocus: planFocus || null,
    gateStatus: gateStatus || null,
    gateConfidence,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode: AutopilotMode = normalizeMode(url.searchParams.get("mode"));
  const asOf = new Date().toISOString();
  let accessTier: AccessTier = "free";
  let tradingWatchlistInputs: ComposeTradingLiveDecisionInput[] | null = null;
  let hasProAccess = false;
  let billingState: {
    plan: "free" | "pro";
    trialActive: boolean;
    trialEndsAt: string | null;
    proActive: boolean;
    trialStarted: boolean;
    trialExpired: boolean;
    source: string;
  } = {
    plan: "free",
    trialActive: false,
    trialEndsAt: null,
    proActive: false,
    trialStarted: false,
    trialExpired: false,
    source: "fallback_free",
  };
  try {
    const userId = await getRequestUserId(req);
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    billingState = await getBillingStateUser(userId);
    hasProAccess = !!billingState.proActive;
    accessTier = resolveAccessTier({
      billingPaid: billingState.plan === "pro",
      hasProAccess,
      trialActive: billingState.trialActive,
    });

    const rawBudgetEur = Number(url.searchParams.get("budgetEur") ?? NaN);
    const budgetOverrideEur =
      Number.isFinite(rawBudgetEur) && rawBudgetEur > 0 ? Math.max(100, Math.min(50000, Math.round(rawBudgetEur))) : null;
    const supabase = getSupabaseAdmin();
    const modeAccess = await resolveModeAccess({
      supabase,
      userId,
      requestedMode: mode,
      hasProAccess,
    });
    if (!modeAccess.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: modeAccess.error,
          allowedMode: modeAccess.allowedMode,
          requestedMode: modeAccess.mode,
        },
        { status: modeAccess.status }
      );
    }
    hasProAccess = modeAccess.hasProAccess;
    accessTier = resolveAccessTier({
      billingPaid: billingState.plan === "pro",
      hasProAccess,
      trialActive: billingState.trialActive,
    });
    const modeKey = modeAccess.mode;
    const forceTradingLiveRefresh =
      url.searchParams.get("tradingRefresh") === "live" ||
      url.searchParams.get("forceTradingRefresh") === "1";
    if (shouldLoadTradingWatchlistForDailyBundle(modeKey)) {
      try {
        if (!forceTradingLiveRefresh) {
          const storedScannerSnapshots = await readFreshTradingScannerSnapshots({ asOf });
          const hasActionableOpenStoredSnapshot = storedScannerSnapshots.inputs.some(
            (input) =>
              input.market.session.marketOpen === true &&
              input.scannerSnapshot?.actionableFreshness === true,
          );
          if (
            storedScannerSnapshots.inputs.length > 0 &&
            storedScannerSnapshots.excludedStaleOpenCount === 0 &&
            hasActionableOpenStoredSnapshot
          ) {
            tradingWatchlistInputs = storedScannerSnapshots.inputs;
          }
        }

        if (!tradingWatchlistInputs) {
          tradingWatchlistInputs = await buildTradingLightScannerInputs({
            asOf,
            forceRefresh: true,
            forceProviderRefresh: forceTradingLiveRefresh,
            includeInactiveMarkets: true,
          });

          if (tradingWatchlistInputs.length > 0) {
            const scannerPersist = await writeTradingScannerSnapshots({
              inputs: tradingWatchlistInputs,
              generatedAt: asOf,
            });

            if (!scannerPersist.persisted) {
              console.warn(
                "[daily-bundle] trading scanner opportunistic persist skipped",
                scannerPersist.error ?? "persist_failed",
              );
            }
          }
        }
      } catch (scannerError: any) {
        console.warn(
          "[daily-bundle] trading light scanner fallback",
          scannerError?.message ?? scannerError,
        );
        tradingWatchlistInputs = [];
      }
    }

  // --- streak (journal)
  const { data: lastDoneRows } = await supabase
    .from("journal_entries")
    .select("created_at,details")
    .eq("user_id", userId)
    .eq("mode", modeKey)
    .eq("type", "daily_done")
    .order("created_at", { ascending: false })
    .limit(60);

  const streak = computeStreakUTC((lastDoneRows ?? []) as JournalRow[]);
  const executionScore = computeExecutionScore({
    doneRows: (lastDoneRows ?? []) as JournalDoneRow[],
    weekTargetDays: 5,
    streak,
  });

  const { data: proofRows } = await supabase
    .from("journal_entries")
    .select("created_at,details,type")
    .eq("user_id", userId)
    .eq("mode", modeKey)
    .in("type", ["execution_proof", "daily_done"])
    .order("created_at", { ascending: false })
    .limit(120);
  const executionEvidence = computeExecutionEvidence((proofRows ?? []) as JournalExecutionProofRow[]);
  const { data: starterAppliedRows } = await supabase
    .from("journal_entries")
    .select("created_at")
    .eq("user_id", userId)
    .eq("mode", modeKey)
    .eq("type", "starter_applied")
    .order("created_at", { ascending: false })
    .limit(1);
  const starterAppliedAt = (starterAppliedRows?.[0]?.created_at as string | null) ?? null;
  const executionCoach = computeExecutionCoach({
    mode,
    doneRows: (lastDoneRows ?? []) as JournalDoneRow[],
    proofRows: (proofRows ?? []) as JournalExecutionProofRow[],
    executionScore,
  });

  // --- receipts count (snapshots count)
  const { count: receiptsCount } = await supabase
    .from("daily_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("mode", modeKey);

  // --- last snapshot at
  const { data: lastSnapRows } = await supabase
    .from("daily_snapshots")
    .select("created_at")
    .eq("user_id", userId)
    .eq("mode", modeKey)
    .order("created_at", { ascending: false })
    .limit(1);

  const lastSnapshotAt = (lastSnapRows?.[0]?.created_at as string | null) ?? null;

  // --- recent snapshots for confirmed money + timeline
  const { data: recentSnaps } = await supabase
    .from("daily_snapshots")
    .select("day_key,total_eur,cash_eur,holdings,meta,created_at")
    .eq("user_id", userId)
    .eq("mode", modeKey)
    .order("day_key", { ascending: false })
    .limit(180);

  const moneyConfirmed = computeConfirmed(
    (recentSnaps ?? []).map((r: any) => ({ day_key: r.day_key, total_eur: Number(r.total_eur) || 0 }))
  );
  const performance = computePerformance(
    (recentSnaps ?? []).map((r: any) => ({ day_key: r.day_key ?? null, total_eur: Number(r.total_eur) || 0 })),
    mode
  );
  const fallbackDecisionImpact = computeDecisionImpact({
    moneyConfirmed,
    performance,
    executionScore,
    executionEvidence,
    coveragePct: 0,
    recentSnapshots: recentSnaps,
  });

  // yesterday helper
  const yesterdayRow = (recentSnaps ?? [])[1] as any | undefined;

  // --- receipts timeline (last 7) with delta + leak + score (best-effort)
  const rowsDesc = (recentSnaps ?? []) as any[];
  const timeline = rowsDesc.slice(0, 7).map((r: any, idx: number) => {
    const cur = Number(r.total_eur) || 0;
    const prev = Number(rowsDesc[idx + 1]?.total_eur) || cur; // previous day (older)
    const delta = Math.round(cur - prev);

    const meta = extractSnapshotMeta(r.meta);
    const holdingsCount = Array.isArray(r.holdings) ? r.holdings.length : null;

    return {
      dayKey: r.day_key ?? null,
      at: r.created_at ?? null,
      totalEur: Math.round(cur),
      deltaEur: delta,
      meta: r.meta ?? null,
      holdingsCount,
      score: meta.score,
      topLeak: meta.topLeak,
      nbaTitle: meta.nbaTitle,
      nbaAction: meta.nbaAction,
      planPhaseKey: meta.planPhaseKey,
      planFocus: meta.planFocus,
      gateStatus: meta.gateStatus,
      gateConfidence: meta.gateConfidence,
    };
  });
  const todayDayKey = new Date().toISOString().slice(0, 10);
  const doneToday = rowsDesc.some((r: any) => String(r?.day_key || "") === todayDayKey);
  const latestTotalEur = Number(rowsDesc?.[0]?.total_eur || 0);

  const { data: userSettingsRow, error: userSettingsErr } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (userSettingsErr) {
    console.warn("[daily-bundle] user_settings read failed", userSettingsErr?.message ?? userSettingsErr);
  }
  const userSettings = normalizeUserSettingsRow(userSettingsRow);

  // --- plan
  const { data: plans, error: planErr } = await supabase
    .from("plans")
    .select("*")
    .eq("user_id", userId)
    .eq("mode", modeKey)
    .order("created_at", { ascending: false })
    .limit(ACTIVE_PLAN_LOOKBACK_LIMIT);

  if (planErr) {
    const dynamic = await buildDynamicStarterPack({
      mode,
      referenceTotalEur: Number((recentSnaps ?? [])[0]?.total_eur) || 0,
      budgetOverrideEur,
      riskProfile: userSettings?.risk_profile ? String(userSettings.risk_profile) : null,
    });
    const starterPack = dynamic?.items ?? getStarterPack(mode);
    const suitability = computeSuitabilityGate({
      mode,
      hasPlan: false,
      hasHoldings: false,
      coveragePct: 0,
      currentTotalEur: latestTotalEur,
      userSettings,
    });
    const followUp = computeFollowUpPlan({
      asOf,
      mode,
      doneToday,
      gateStatus: "blocked",
      suitabilityStatus: suitability.status,
    });
    const dailyEngineV4 = safeComputeDailyEngineV4({
      userId,
      mode,
      asOf,
      setupStatus: userSettings?.setup_status ? String(userSettings.setup_status) : null,
      plan: null,
      portfolioItems: [],
      valuation: { cashEur: 0, totalEur: latestTotalEur, coveragePct: 0 },
      quotes: {},
      doneToday,
      receiptsCount: receiptsCount ?? 0,
      streak,
      lastSnapshotAt,
      executionEvidence: executionEvidence as any,
      timeline: timeline as any,
      topRiskLeakKey: "no_plan",
      topRiskLeakTitle: "Plan unavailable",
      topRiskLeakSeverity: "high",
    });
    const planErrLoopSpecDaily = buildLoopSpecDailyExtensions({
      mode,
      asOf,
      nba: {
        title: "Create & activate your plan",
        desc: "Autopilot needs a plan to operate safely.",
        cta: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${mode}` },
      },
      actionGate: {
        status: "blocked",
        allowExecution: false,
        reasons: ["Plan failed to load."],
      },
      whyNow: {
        driverTitle: "Plan unavailable",
        rationale: "Execution is blocked because an active plan is missing.",
        evidence: ["Plan load failed.", "Execution requires an active plan."],
      },
      doneToday,
      hasPlan: false,
      hasHoldings: false,
      cashEur: 0,
      totalEur: latestTotalEur,
      coveragePct: 0,
      pressureScore: 0,
      topLeakSeverity: "high",
      executionEvidence,
      engineV4: dailyEngineV4,
    });
    const planErrScored = applyScoresReplayAuditExtensions({
      mode,
      loopSpecDaily: planErrLoopSpecDaily,
      engineV4: dailyEngineV4,
      actionGate: { status: "blocked", allowExecution: false },
      hasPlan: false,
      hasHoldings: false,
      doneToday,
      coveragePct: 0,
      topLeakKey: "no_plan",
      topLeakSeverity: "high",
      executionScore,
    });
    const planErrLoopSpecScored = planErrScored.daily;
    const planErrEngineV4Scored = planErrScored.engineV4 ?? dailyEngineV4;
    const planErrPerfectLoop = buildPerfectLoopExtensions({
      mode,
      asOf,
      loopSpecDaily: planErrLoopSpecScored,
      dailyEngineV4: planErrEngineV4Scored,
      plan: null,
      userSettings,
      actionGate: { status: "blocked", allowExecution: false },
      whyNow: { driverTitle: "Plan unavailable", rationale: "Execution is blocked because an active plan is missing." },
      executionScore,
      executionEvidence,
      timeline,
      valuation: { cashEur: 0, totalEur: latestTotalEur, coveragePct: 0 },
      hasPlan: false,
      hasHoldings: false,
      doneToday,
      receiptsCount: receiptsCount ?? 0,
      streak,
    });
    const planErrPaywall = buildDailyPaywallState({
      asOf,
      mode,
      billing: billingState,
      dailyNode: planErrLoopSpecScored,
      perfectLoop: planErrPerfectLoop,
      receiptsCount: receiptsCount ?? 0,
      doneToday,
      hasPlan: false,
      hasHoldings: false,
      actionGate: { status: "blocked", allowExecution: false },
    });
    const planErrActivation = buildDay1ActivationState({
      asOf,
      mode,
      dailyNode: { ...planErrLoopSpecScored, ...planErrPaywall },
      perfectLoop: planErrPerfectLoop,
      billing: planErrPaywall.billing,
      paywall: planErrPaywall.paywall,
      receiptsCount: receiptsCount ?? 0,
      doneToday,
      hasPlan: false,
      hasHoldings: false,
    });
    const planErrProgression = buildProgressionNarrativeAntiChurnState({
      asOf,
      mode,
      dailyNode: { ...planErrLoopSpecScored, ...planErrPaywall },
      perfectLoop: planErrPerfectLoop,
      activation: planErrActivation,
      timeline,
      receiptsCount: receiptsCount ?? 0,
      doneToday,
      hasPlan: false,
      hasHoldings: false,
    });
    const planErrEngineV5 = buildLivingDecisionEngineV5State({
      asOf,
      mode,
      dailyNode: { ...planErrLoopSpecScored, ...planErrPaywall, ...planErrProgression },
      perfectLoop: planErrPerfectLoop,
      activation: planErrActivation,
      progression: planErrProgression,
      timeline,
      engineV4: planErrEngineV4Scored,
      diagnostics: null,
      actionGate: { status: "blocked", allowExecution: false },
      regime: "data_limited",
      portfolioItems: [],
      valuation: { coveragePct: 0 },
      hasPlan: false,
      hasHoldings: false,
      doneToday,
      receiptsCount: receiptsCount ?? 0,
    });
    const planErrUnlockedMode = buildUnlockedMode({ mode, hasProAccess });
    const planErrPortfolioScore = buildInstantPortfolioScore({
      dailyNode: planErrLoopSpecScored,
      hasPlan: false,
      hasHoldings: false,
      coveragePct: 0,
      topLeakTitle: "Plan unavailable",
      topLeakKey: "no_plan",
      topLeakSeverity: "high",
    });
    const planErrSyntrakeStack = buildSyntrakeIntelligenceStackState({
      asOf,
      mode,
      dailyNode: { ...planErrLoopSpecScored, ...planErrPaywall, ...planErrProgression, engineV5: planErrEngineV5 },
      engineV4: planErrEngineV4Scored,
      engineV5: planErrEngineV5,
      perfectLoop: planErrPerfectLoop,
      activation: planErrActivation,
      progression: planErrProgression,
      billing: planErrPaywall.billing,
      paywall: planErrPaywall.paywall,
      portfolioScore: planErrPortfolioScore,
      unlockedMode: planErrUnlockedMode,
      diagnostics: {
        pricing: { coveragePct: 0, missingSymbols: [] },
        riskLeaks: [{ key: "no_plan", severity: "high" }],
      },
      doneToday,
      hasPlan: false,
      hasHoldings: false,
      receiptsCount: receiptsCount ?? 0,
      fallbackReason: "plan_load_failed",
    });
    (planErrLoopSpecScored as any).nextBestAction = {
      ...safeObj((planErrLoopSpecScored as any).nextBestAction),
      intent: (planErrPerfectLoop as any)?.decisionLifecycle?.decisionIntent ?? null,
      lifecycleStage: (planErrPerfectLoop as any)?.decisionLifecycle?.stage ?? null,
      sessionState: (planErrPerfectLoop as any)?.decisionLifecycle?.sessionState ?? null,
      paywallActivationEligible: Boolean((planErrPerfectLoop as any)?.paywallActivation?.eligibleNow),
    };
    const planErrDecisionGovernance = buildDecisionGovernanceFallback({
      enabled: isDecisionGovernanceV1Enabled(),
      reasonCode: "plan_load_failed",
      gateBlocked: true,
      riskBlocked: false,
    });
    const planErrDailyBriefing = buildDailyBriefingFromDecisionGovernance({
      enabled: isDailyBriefingV1Enabled(),
      as_of: asOf,
      decision_governance: planErrDecisionGovernance,
      action_gate: {
        status: "blocked",
        allowExecution: false,
      },
      risk_policy_eval: {
        blocked: false,
        status: "warn",
      },
    });
    void writeEngineEvent({
      userId,
      mode,
      event: "daily_opened",
      status: "warn",
      source: "api.daily_bundle",
      details: { fallback: "plan_load_failed", next_action_type: (planErrLoopSpecScored as any)?.nextBestAction?.type || null },
    });
    void writeEngineEvent({
      userId,
      mode,
      event: "action_rendered",
      status: "warn",
      source: "api.daily_bundle",
      details: {
        fallback: "plan_load_failed",
        next_action_type: (planErrLoopSpecScored as any)?.nextBestAction?.type || null,
      },
    });
    const responseBody = {
      ok: false,
      degraded: true,
      degradedReason: "plan_load_failed",
      mode,
      asOf,
      plan: null,
      portfolio: { cash: 0, items: [] },
      daily: {
        engineV4: planErrEngineV4Scored,
        ...planErrLoopSpecScored,
        perfectLoop: planErrPerfectLoop,
        portfolioScore: planErrPortfolioScore,
        unlockedMode: planErrUnlockedMode,
        billing: planErrPaywall.billing,
        paywall: planErrPaywall.paywall,
        nextBestActionPreview: planErrPaywall.nextBestActionPreview,
        activation: planErrActivation,
        trends: planErrProgression.trends,
        streak: planErrProgression.streak,
        narrative: planErrProgression.narrative,
        continuitySignals: planErrProgression.continuitySignals,
        engineV5: planErrEngineV5,
        syntrakeStack: planErrSyntrakeStack,
        proof: { whatChanged: ["Plan failed to load"], meaning: planErr.message },
        nba: {
          title: "Create & activate your plan",
          desc: "Autopilot needs a plan to operate safely.",
          kind: "primary",
          cta: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${mode}` },
        },
        actionGate: {
          status: "blocked",
          allowExecution: false,
          confidencePct: 35,
          reasons: ["Plan failed to load."],
          nextStep: "Open Planning and activate a valid plan.",
          requiredPhase: "setup_plan",
          topLeakKey: "no_plan",
          topLeakSeverity: "high",
          pressureScore: 0,
          coveragePct: 0,
          ctaLabel: "Go to Planning",
          ctaAction: "go_planning",
          ctaHref: `/app?tab=planning&mode=${mode}`,
        },
        whyNow: {
          driverKey: "no_plan",
          driverTitle: "Plan unavailable",
          severity: "high",
          rationale: "Execution is blocked because an active plan is missing.",
          evidence: ["Plan load failed.", "Execution requires an active plan."],
          expectedOutcome: "Plan activation enables safe execution.",
          counterfactual: "Executing without a plan increases avoidable risk.",
        },
        actionGateAlert: {
          triggered: false,
          severity: "high",
          latest: "blocked",
          blockedStreakDays: 0,
          blockedDays7: 0,
          cautionDays7: 0,
          message: "Action Gate blocked due to missing plan.",
          nextStep: "Activate plan before executing any order.",
        },
        profileBenchmark: {
          mode,
          score: 35,
          tier: "at_risk",
          percentileLabel: "Below benchmark",
          components: { execution: executionScore.score, risk: 30, consistency: 20, alpha: 50 },
          summary: "Setup incomplete. Benchmark score remains at risk until plan is active.",
        },
        suitability,
        followUp,
        executionCoach,
        decisionGovernance: planErrDecisionGovernance,
        daily_briefing: planErrDailyBriefing,
        top_opportunities: planErrDecisionGovernance.top_opportunities,
        opportunities_dashboard: planErrDecisionGovernance.opportunities,
        portfolio_risk: planErrDecisionGovernance.portfolio_risk,
        daily_decision: planErrDecisionGovernance.daily_decision,
        decision_confidence: planErrDecisionGovernance.decision_confidence,
        opportunities: [],
        starterPack,
        starterPackMeta: dynamic ? { source: dynamic.source, budgetEur: dynamic.budgetEur } : null,
        starterWarmup: {
          active: false,
          appliedAt: starterAppliedAt,
          expiresInHours: 0,
        },
        lastSnapshotAt,
      },
      derived: {
        hasPlan: false,
        hasHoldings: false,
        actionGate: {
          status: "blocked",
          allowExecution: false,
          confidencePct: 35,
          reasons: ["Plan failed to load."],
          nextStep: "Open Planning and activate a valid plan.",
          requiredPhase: "setup_plan",
          topLeakKey: "no_plan",
          topLeakSeverity: "high",
          pressureScore: 0,
          coveragePct: 0,
          ctaLabel: "Go to Planning",
          ctaAction: "go_planning",
          ctaHref: `/app?tab=planning&mode=${mode}`,
        },
        whyNow: {
          driverKey: "no_plan",
          driverTitle: "Plan unavailable",
          severity: "high",
          rationale: "Execution is blocked because an active plan is missing.",
          evidence: ["Plan load failed.", "Execution requires an active plan."],
          expectedOutcome: "Plan activation enables safe execution.",
          counterfactual: "Executing without a plan increases avoidable risk.",
        },
        actionGateAlert: {
          triggered: false,
          severity: "high",
          latest: "blocked",
          blockedStreakDays: 0,
          blockedDays7: 0,
          cautionDays7: 0,
          message: "Action Gate blocked due to missing plan.",
          nextStep: "Activate plan before executing any order.",
        },
        profileBenchmark: {
          mode,
          score: 35,
          tier: "at_risk",
          percentileLabel: "Below benchmark",
          components: { execution: executionScore.score, risk: 30, consistency: 20, alpha: 50 },
          summary: "Setup incomplete. Benchmark score remains at risk until plan is active.",
        },
        suitability,
        followUp,
        executionCoach,
        decisionGovernance: planErrDecisionGovernance,
        daily_briefing: planErrDailyBriefing,
        top_opportunities: planErrDecisionGovernance.top_opportunities,
        opportunities_dashboard: planErrDecisionGovernance.opportunities,
        portfolio_risk: planErrDecisionGovernance.portfolio_risk,
        daily_decision: planErrDecisionGovernance.daily_decision,
        decision_confidence: planErrDecisionGovernance.decision_confidence,
        operationalAction: (planErrLoopSpecScored as any)?.operationalAction ?? null,
        starterWarmup: {
          active: false,
          appliedAt: starterAppliedAt,
        },
        topLeakKey: "no_plan",
        receiptsCount: receiptsCount ?? 0,
        receiptsTimeline: timeline,
        moneyConfirmed,
        decisionImpact: fallbackDecisionImpact,
        performance,
        executionScore,
        doneToday,
        streak,
        topRiskLeak: `Plan load failed: ${planErr.message}`,
      },
    };
    return NextResponse.json(
      finalizeDailyBundleResponse(attachDecisionEnvelopeToDailyBundleRouteResponse({
        response: responseBody,
        branch: "plan_load_fallback",
        branchReason: planErr.message,
        tradingWatchlistInputs,
      }), {
        mode,
        asOf,
        accessTier,
      }),
    );
  }
  const plan = pickActivePlan((plans ?? []) as Array<Record<string, unknown>>) as Record<string, unknown> | null;
  const hasPlan = isPlanActiveRecord(plan);

  // --- holdings
  const { data: items, error: itemsErr } = await supabase
    .from("portfolio_items")
    .select("id,user_id,mode,symbol,name,qty,value_eur,created_at")
    .eq("user_id", userId)
    .eq("mode", modeKey)
    .order("created_at", { ascending: true });

  if (itemsErr) {
    const dynamic = await buildDynamicStarterPack({
      mode,
      referenceTotalEur: Number((recentSnaps ?? [])[0]?.total_eur) || 0,
      budgetOverrideEur,
      riskProfile: userSettings?.risk_profile ? String(userSettings.risk_profile) : null,
    });
    const starterPack = dynamic?.items ?? getStarterPack(mode);
    const suitability = computeSuitabilityGate({
      mode,
      hasPlan,
      hasHoldings: false,
      coveragePct: 0,
      currentTotalEur: latestTotalEur,
      userSettings,
    });
    const followUp = computeFollowUpPlan({
      asOf,
      mode,
      doneToday,
      gateStatus: "blocked",
      suitabilityStatus: suitability.status,
    });
    const dailyEngineV4 = safeComputeDailyEngineV4({
      userId,
      mode,
      asOf,
      setupStatus: userSettings?.setup_status ? String(userSettings.setup_status) : null,
      plan: plan as any,
      portfolioItems: [],
      valuation: { cashEur: 0, totalEur: latestTotalEur, coveragePct: 0 },
      quotes: {},
      doneToday,
      receiptsCount: receiptsCount ?? 0,
      streak,
      lastSnapshotAt,
      executionEvidence: executionEvidence as any,
      timeline: timeline as any,
      topRiskLeakKey: "no_holdings",
      topRiskLeakTitle: "Holdings unavailable",
      topRiskLeakSeverity: "high",
    });
    const holdingsErrLoopSpecDaily = buildLoopSpecDailyExtensions({
      mode,
      asOf,
      nba: {
        title: "Add holdings",
        desc: "Syntrake needs holdings to scan risk and drift.",
        cta: { label: "Go to Portfolio", action: "go_portfolio", href: `/app?tab=portfolio&mode=${mode}` },
      },
      actionGate: {
        status: "blocked",
        allowExecution: false,
        reasons: ["Holdings failed to load."],
      },
      whyNow: {
        driverTitle: "Holdings unavailable",
        rationale: "Execution is blocked because holdings are missing.",
        evidence: ["Holdings load failed.", "Risk checks require holdings."],
      },
      doneToday,
      hasPlan,
      hasHoldings: false,
      cashEur: 0,
      totalEur: latestTotalEur,
      coveragePct: 0,
      pressureScore: 0,
      topLeakSeverity: "high",
      executionEvidence,
      engineV4: dailyEngineV4,
    });
    const holdingsErrScored = applyScoresReplayAuditExtensions({
      mode,
      loopSpecDaily: holdingsErrLoopSpecDaily,
      engineV4: dailyEngineV4,
      actionGate: { status: "blocked", allowExecution: false },
      hasPlan,
      hasHoldings: false,
      doneToday,
      coveragePct: 0,
      topLeakKey: "no_holdings",
      topLeakSeverity: "high",
      executionScore,
    });
    const holdingsErrLoopSpecScored = holdingsErrScored.daily;
    const holdingsErrEngineV4Scored = holdingsErrScored.engineV4 ?? dailyEngineV4;
    const holdingsErrPerfectLoop = buildPerfectLoopExtensions({
      mode,
      asOf,
      loopSpecDaily: holdingsErrLoopSpecScored,
      dailyEngineV4: holdingsErrEngineV4Scored,
      plan,
      userSettings,
      actionGate: { status: "blocked", allowExecution: false },
      whyNow: { driverTitle: "Holdings unavailable", rationale: "Execution is blocked because holdings are missing." },
      executionScore,
      executionEvidence,
      timeline,
      valuation: { cashEur: 0, totalEur: latestTotalEur, coveragePct: 0 },
      hasPlan,
      hasHoldings: false,
      doneToday,
      receiptsCount: receiptsCount ?? 0,
      streak,
    });
    const holdingsErrPaywall = buildDailyPaywallState({
      asOf,
      mode,
      billing: billingState,
      dailyNode: holdingsErrLoopSpecScored,
      perfectLoop: holdingsErrPerfectLoop,
      receiptsCount: receiptsCount ?? 0,
      doneToday,
      hasPlan,
      hasHoldings: false,
      actionGate: { status: "blocked", allowExecution: false },
    });
    const holdingsErrActivation = buildDay1ActivationState({
      asOf,
      mode,
      dailyNode: { ...holdingsErrLoopSpecScored, ...holdingsErrPaywall },
      perfectLoop: holdingsErrPerfectLoop,
      billing: holdingsErrPaywall.billing,
      paywall: holdingsErrPaywall.paywall,
      receiptsCount: receiptsCount ?? 0,
      doneToday,
      hasPlan,
      hasHoldings: false,
    });
    const holdingsErrProgression = buildProgressionNarrativeAntiChurnState({
      asOf,
      mode,
      dailyNode: { ...holdingsErrLoopSpecScored, ...holdingsErrPaywall },
      perfectLoop: holdingsErrPerfectLoop,
      activation: holdingsErrActivation,
      timeline,
      receiptsCount: receiptsCount ?? 0,
      doneToday,
      hasPlan,
      hasHoldings: false,
    });
    const holdingsErrEngineV5 = buildLivingDecisionEngineV5State({
      asOf,
      mode,
      dailyNode: { ...holdingsErrLoopSpecScored, ...holdingsErrPaywall, ...holdingsErrProgression },
      perfectLoop: holdingsErrPerfectLoop,
      activation: holdingsErrActivation,
      progression: holdingsErrProgression,
      timeline,
      engineV4: holdingsErrEngineV4Scored,
      diagnostics: null,
      actionGate: { status: "blocked", allowExecution: false },
      regime: "data_limited",
      portfolioItems: [],
      valuation: { coveragePct: 0 },
      hasPlan,
      hasHoldings: false,
      doneToday,
      receiptsCount: receiptsCount ?? 0,
    });
    const holdingsErrUnlockedMode = buildUnlockedMode({ mode, hasProAccess });
    const holdingsErrPortfolioScore = buildInstantPortfolioScore({
      dailyNode: holdingsErrLoopSpecScored,
      hasPlan,
      hasHoldings: false,
      coveragePct: 0,
      topLeakTitle: "Holdings unavailable",
      topLeakKey: "no_holdings",
      topLeakSeverity: "high",
    });
    const holdingsErrSyntrakeStack = buildSyntrakeIntelligenceStackState({
      asOf,
      mode,
      dailyNode: { ...holdingsErrLoopSpecScored, ...holdingsErrPaywall, ...holdingsErrProgression, engineV5: holdingsErrEngineV5 },
      engineV4: holdingsErrEngineV4Scored,
      engineV5: holdingsErrEngineV5,
      perfectLoop: holdingsErrPerfectLoop,
      activation: holdingsErrActivation,
      progression: holdingsErrProgression,
      billing: holdingsErrPaywall.billing,
      paywall: holdingsErrPaywall.paywall,
      portfolioScore: holdingsErrPortfolioScore,
      unlockedMode: holdingsErrUnlockedMode,
      diagnostics: {
        pricing: { coveragePct: 0, missingSymbols: [] },
        riskLeaks: [{ key: "no_holdings", severity: "high" }],
      },
      doneToday,
      hasPlan,
      hasHoldings: false,
      receiptsCount: receiptsCount ?? 0,
      fallbackReason: "holdings_load_failed",
    });
    (holdingsErrLoopSpecScored as any).nextBestAction = {
      ...safeObj((holdingsErrLoopSpecScored as any).nextBestAction),
      intent: (holdingsErrPerfectLoop as any)?.decisionLifecycle?.decisionIntent ?? null,
      lifecycleStage: (holdingsErrPerfectLoop as any)?.decisionLifecycle?.stage ?? null,
      sessionState: (holdingsErrPerfectLoop as any)?.decisionLifecycle?.sessionState ?? null,
      paywallActivationEligible: Boolean((holdingsErrPerfectLoop as any)?.paywallActivation?.eligibleNow),
    };
    const holdingsErrDecisionGovernance = buildDecisionGovernanceFallback({
      enabled: isDecisionGovernanceV1Enabled(),
      reasonCode: "holdings_load_failed",
      gateBlocked: true,
      riskBlocked: false,
    });
    const holdingsErrDailyBriefing = buildDailyBriefingFromDecisionGovernance({
      enabled: isDailyBriefingV1Enabled(),
      as_of: asOf,
      decision_governance: holdingsErrDecisionGovernance,
      action_gate: {
        status: "blocked",
        allowExecution: false,
      },
      risk_policy_eval: {
        blocked: false,
        status: "warn",
      },
    });
    void writeEngineEvent({
      userId,
      mode,
      event: "daily_opened",
      status: "warn",
      source: "api.daily_bundle",
      details: { fallback: "holdings_load_failed", next_action_type: (holdingsErrLoopSpecScored as any)?.nextBestAction?.type || null },
    });
    void writeEngineEvent({
      userId,
      mode,
      event: "action_rendered",
      status: "warn",
      source: "api.daily_bundle",
      details: {
        fallback: "holdings_load_failed",
        next_action_type: (holdingsErrLoopSpecScored as any)?.nextBestAction?.type || null,
      },
    });
    const responseBody = {
      ok: false,
      degraded: true,
      degradedReason: "holdings_load_failed",
      mode,
      asOf,
      plan,
      portfolio: { cash: 0, items: [] },
      daily: {
        engineV4: holdingsErrEngineV4Scored,
        ...holdingsErrLoopSpecScored,
        perfectLoop: holdingsErrPerfectLoop,
        portfolioScore: holdingsErrPortfolioScore,
        unlockedMode: holdingsErrUnlockedMode,
        billing: holdingsErrPaywall.billing,
        paywall: holdingsErrPaywall.paywall,
        nextBestActionPreview: holdingsErrPaywall.nextBestActionPreview,
        activation: holdingsErrActivation,
        trends: holdingsErrProgression.trends,
        streak: holdingsErrProgression.streak,
        narrative: holdingsErrProgression.narrative,
        continuitySignals: holdingsErrProgression.continuitySignals,
        engineV5: holdingsErrEngineV5,
        syntrakeStack: holdingsErrSyntrakeStack,
        proof: { whatChanged: ["Holdings failed to load"], meaning: itemsErr.message },
        nba: {
          title: "Add holdings",
          desc: "Syntrake needs holdings to scan risk and drift.",
          kind: "primary",
          cta: { label: "Go to Portfolio", action: "go_portfolio", href: `/app?tab=portfolio&mode=${mode}` },
        },
        actionGate: {
          status: "blocked",
          allowExecution: false,
          confidencePct: 38,
          reasons: ["Holdings failed to load."],
          nextStep: "Import/add holdings before executing orders.",
          requiredPhase: "setup_holdings",
          topLeakKey: "no_holdings",
          topLeakSeverity: "high",
          pressureScore: 0,
          coveragePct: 0,
          ctaLabel: "Go to Portfolio",
          ctaAction: "go_portfolio",
          ctaHref: `/app?tab=portfolio&mode=${mode}`,
        },
        whyNow: {
          driverKey: "no_holdings",
          driverTitle: "Holdings unavailable",
          severity: "high",
          rationale: "Execution is blocked because holdings are missing.",
          evidence: ["Holdings load failed.", "Risk checks require holdings."],
          expectedOutcome: "Holdings import enables real risk diagnostics.",
          counterfactual: "Acting without holdings data can break risk sizing.",
        },
        actionGateAlert: {
          triggered: false,
          severity: "high",
          latest: "blocked",
          blockedStreakDays: 0,
          blockedDays7: 0,
          cautionDays7: 0,
          message: "Action Gate blocked due to missing holdings.",
          nextStep: "Load holdings before executing any order.",
        },
        profileBenchmark: {
          mode,
          score: 38,
          tier: "at_risk",
          percentileLabel: "Below benchmark",
          components: { execution: executionScore.score, risk: 35, consistency: 20, alpha: 50 },
          summary: "Setup incomplete. Benchmark score remains at risk until holdings are loaded.",
        },
        suitability,
        followUp,
        executionCoach,
        decisionGovernance: holdingsErrDecisionGovernance,
        daily_briefing: holdingsErrDailyBriefing,
        top_opportunities: holdingsErrDecisionGovernance.top_opportunities,
        opportunities_dashboard: holdingsErrDecisionGovernance.opportunities,
        portfolio_risk: holdingsErrDecisionGovernance.portfolio_risk,
        daily_decision: holdingsErrDecisionGovernance.daily_decision,
        decision_confidence: holdingsErrDecisionGovernance.decision_confidence,
        opportunities: [],
        starterPack,
        starterPackMeta: dynamic ? { source: dynamic.source, budgetEur: dynamic.budgetEur } : null,
        starterWarmup: {
          active: false,
          appliedAt: starterAppliedAt,
          expiresInHours: 0,
        },
        lastSnapshotAt,
      },
      derived: {
        hasPlan,
        hasHoldings: false,
        actionGate: {
          status: "blocked",
          allowExecution: false,
          confidencePct: 38,
          reasons: ["Holdings failed to load."],
          nextStep: "Import/add holdings before executing orders.",
          requiredPhase: "setup_holdings",
          topLeakKey: "no_holdings",
          topLeakSeverity: "high",
          pressureScore: 0,
          coveragePct: 0,
          ctaLabel: "Go to Portfolio",
          ctaAction: "go_portfolio",
          ctaHref: `/app?tab=portfolio&mode=${mode}`,
        },
        whyNow: {
          driverKey: "no_holdings",
          driverTitle: "Holdings unavailable",
          severity: "high",
          rationale: "Execution is blocked because holdings are missing.",
          evidence: ["Holdings load failed.", "Risk checks require holdings."],
          expectedOutcome: "Holdings import enables real risk diagnostics.",
          counterfactual: "Acting without holdings data can break risk sizing.",
        },
        actionGateAlert: {
          triggered: false,
          severity: "high",
          latest: "blocked",
          blockedStreakDays: 0,
          blockedDays7: 0,
          cautionDays7: 0,
          message: "Action Gate blocked due to missing holdings.",
          nextStep: "Load holdings before executing any order.",
        },
        profileBenchmark: {
          mode,
          score: 38,
          tier: "at_risk",
          percentileLabel: "Below benchmark",
          components: { execution: executionScore.score, risk: 35, consistency: 20, alpha: 50 },
          summary: "Setup incomplete. Benchmark score remains at risk until holdings are loaded.",
        },
        suitability,
        followUp,
        executionCoach,
        decisionGovernance: holdingsErrDecisionGovernance,
        daily_briefing: holdingsErrDailyBriefing,
        top_opportunities: holdingsErrDecisionGovernance.top_opportunities,
        opportunities_dashboard: holdingsErrDecisionGovernance.opportunities,
        portfolio_risk: holdingsErrDecisionGovernance.portfolio_risk,
        daily_decision: holdingsErrDecisionGovernance.daily_decision,
        decision_confidence: holdingsErrDecisionGovernance.decision_confidence,
        operationalAction: (holdingsErrLoopSpecScored as any)?.operationalAction ?? null,
        starterWarmup: {
          active: false,
          appliedAt: starterAppliedAt,
        },
        topLeakKey: "no_holdings",
        receiptsCount: receiptsCount ?? 0,
        receiptsTimeline: timeline,
        moneyConfirmed,
        decisionImpact: fallbackDecisionImpact,
        performance,
        executionScore,
        doneToday,
        streak,
        topRiskLeak: `Holdings load failed: ${itemsErr.message}`,
      },
    };
    return NextResponse.json(
      finalizeDailyBundleResponse(attachDecisionEnvelopeToDailyBundleRouteResponse({
        response: responseBody,
        branch: "holdings_load_fallback",
        branchReason: itemsErr.message,
        tradingWatchlistInputs,
      }), {
        mode,
        asOf,
        accessTier,
      }),
    );
  }
  const portfolioItems = (items ?? []).map((r: any) => ({
    id: r.id,
    symbol: String(r.symbol || "").toUpperCase(),
    name: r.name ?? null,
    qty: r.qty ?? null,
    valueEur: r.value_eur ?? null,
    mode: r.mode ?? null,
  }));

  const hasHoldings = portfolioItems.length > 0;
  const latestHoldingCreatedAt = hasHoldings
    ? (items ?? []).reduce((latest: string | null, row: any) => {
        const createdAt = String(row?.created_at || "").trim();
        if (!createdAt) return latest;
        if (!latest) return createdAt;
        return createdAt > latest ? createdAt : latest;
      }, null as string | null)
    : null;
  const starterWarmupActive = isStarterWarmupActive({
    starterAppliedAt,
    fallbackHoldingCreatedAt: latestHoldingCreatedAt,
    asOfIso: asOf,
    hasHoldings,
    doneToday,
    hasClosedHistory: Array.isArray(lastDoneRows) && lastDoneRows.length > 0,
  });

  // starter pack only if plan exists and no holdings
  const dynamicStarter =
    !hasHoldings
      ? await buildDynamicStarterPack({
          mode,
          referenceTotalEur: Number((recentSnaps ?? [])[0]?.total_eur) || 0,
          budgetOverrideEur,
          riskProfile: userSettings?.risk_profile ? String(userSettings.risk_profile) : null,
        })
      : null;
  const starterPack = !hasHoldings ? dynamicStarter?.items ?? getStarterPack(mode) : [];

  // --- pricing
  const portfolioSymbols = portfolioItems.map((x: any) => normSymbol(x?.symbol)).filter(Boolean);
  const quotes = hasHoldings ? await getQuotes({ symbols: portfolioSymbols, mode, ttlSec: 60 }) : {};

  // --- valuation (cash per-mode ainda não existe -> 0)
  const valuation = computePortfolioValuation({ cashEur: 0, items: portfolioItems, quotes });
  const liveCoveragePct = Number((valuation as any)?.liveCoveragePct ?? (valuation as any)?.coveragePct ?? 0);
  const missingLiveSymbols = Array.isArray((valuation as any)?.missingLiveSymbols)
    ? ((valuation as any).missingLiveSymbols as any[]).map((x) => String(x || "").toUpperCase()).filter(Boolean)
    : Array.isArray((valuation as any)?.missingSymbols)
      ? ((valuation as any).missingSymbols as any[]).map((x) => String(x || "").toUpperCase()).filter(Boolean)
      : [];
  const pricingAgeSeconds = Number((valuation as any)?.priceAgeSeconds ?? 0);
  const decisionImpact = computeDecisionImpact({
    moneyConfirmed,
    performance,
    executionScore,
    executionEvidence,
    coveragePct: liveCoveragePct,
    recentSnapshots: recentSnaps,
  });

  // --- engine diagnostics
  const diagnostics = computeDiagnostics({
    mode,
    hasPlan,
    cashEur: 0,
    items: portfolioItems,
    quotes,
    pricing: {
      coveragePct: liveCoveragePct,
      missingSymbols: missingLiveSymbols,
      priceAgeSeconds: pricingAgeSeconds,
    },
    yesterday: yesterdayRow
      ? {
          total_eur: Number(yesterdayRow.total_eur) || 0,
          cash_eur: Number(yesterdayRow.cash_eur) || 0,
          holdingsCount: Array.isArray(yesterdayRow.holdings) ? yesterdayRow.holdings.length : null,
          coveragePct: typeof yesterdayRow?.meta?.coveragePct === "number" ? yesterdayRow.meta.coveragePct : null,
        }
      : undefined,
  });

  // candidates (max 3)
  let opportunities = buildCandidates({ mode, diagnostics });

  const planPhase = buildPlanPhase({ hasPlan, hasHoldings, diagnostics: diagnostics as any });
  const recentActions = (timeline as any[])
    .map((row: any) => normalizeActionKey(row?.nbaAction))
    .filter(Boolean)
    .slice(0, 7) as string[];
  const recentPhaseKeys = (timeline as any[])
    .map((row: any) => normalizePhaseKey(row?.planPhaseKey))
    .filter(Boolean)
    .slice(0, 7) as PlanPhaseKey[];
  const recentPlanFocuses = (timeline as any[])
    .map((row: any) => (row?.planFocus ? String(row.planFocus).trim() : ""))
    .filter((x: string) => x.length > 0)
    .slice(0, 7);
  const recentGateStatuses = (timeline as any[])
    .map((row: any) => normalizeGateStatus(row?.gateStatus))
    .filter(Boolean)
    .slice(0, 7) as GateStatus[];

  const initialTopAction = actionKeyFromCandidate(opportunities[0]);
  const initialRepeatDays = countConsecutiveStartsWith(recentActions, initialTopAction);
  const topLeakSeverity = String((diagnostics as any)?.riskLeaks?.[0]?.severity || "").toLowerCase();
  const highSeverityLeak = topLeakSeverity === "high";

  let rotatedToday = false;
  if (!doneToday && !highSeverityLeak && initialRepeatDays >= 2 && opportunities.length > 1) {
    const altIndex = opportunities.findIndex((c: any, idx: number) => idx > 0 && actionKeyFromCandidate(c) !== initialTopAction);
    if (altIndex > 0) {
      const alt = opportunities[altIndex];
      opportunities = [alt, ...opportunities.filter((_: any, idx: number) => idx !== altIndex)];
      rotatedToday = true;
    }
  }

  // decision pressure + action gate (execution quality control)
  const pressureV2 = computeDecisionPressure({ mode, diagnostics, doneToday });
  const suitability = computeSuitabilityGate({
    mode,
    hasPlan,
    hasHoldings,
    coveragePct: liveCoveragePct,
    currentTotalEur: latestTotalEur,
    userSettings,
  });
  const riskPolicy: RiskPolicy = deriveRiskPolicy({
    mode,
    riskProfile: userSettings?.risk_profile ?? null,
    horizon: userSettings?.horizon ?? null,
    userSettings,
    plan,
  });
  const riskPolicyEval: RiskPolicyEvaluation = evaluateRiskPolicy({
    policy: riskPolicy,
    diagnostics: diagnostics as Record<string, unknown>,
    pressureScore: pressureV2.score,
    maxDrawdownPct: Number((performance as any)?.maxDrawdownPct ?? NaN),
    hasPlan,
    hasHoldings,
  });
  const actionGateBase = buildActionGate({
    mode,
    hasPlan,
    hasHoldings,
    doneToday,
    diagnostics: diagnostics as any,
    pressureScore: pressureV2.score,
    planPhase,
    riskPolicyEval,
  });
  const actionGateMerged = mergeActionGateWithSuitability({
    mode,
    doneToday,
    gate: actionGateBase,
    suitability,
  });
  const preTradeSafetyCheck = buildPreTradeSafetyCheck({
    mode,
    hasPlan,
    hasHoldings,
    doneToday,
    riskPolicyEval,
    actionGate: actionGateMerged,
    executionScore,
    executionEvidence,
  });
  let actionGate = enforceActionGateWithPreTrade({
    actionGate: actionGateMerged,
    preTrade: preTradeSafetyCheck,
  }) as ActionGate;
  if (starterWarmupActive && hasPlan && hasHoldings && !doneToday) {
    const existingReasons = Array.isArray(actionGate.reasons) ? actionGate.reasons.map((x) => String(x || "").trim()).filter(Boolean) : [];
    const gateBlocked = String(actionGate.status || "").toLowerCase() === "blocked";
    const preTradeBlocked = String((preTradeSafetyCheck as any)?.status || "").toLowerCase() === "blocked";
    const riskBlocked = Boolean(riskPolicyEval?.blocked);
    const hardBlocked = gateBlocked || preTradeBlocked || riskBlocked;

    if (!hardBlocked) {
      actionGate = {
        ...actionGate,
        allowExecution: true,
        confidencePct: Math.max(60, Number(actionGate.confidencePct || 0)),
        reasons: [
          "Starter day active: execute starter allocation first, then review leaks next cycle.",
          ...existingReasons,
        ].slice(0, 3),
        nextStep: "Open broker, execute starter checklist exactly as listed, and save execution proof.",
        ctaLabel: "Run Checklist",
        ctaAction: "run_checklist",
        ctaHref: `/app?tab=daily&mode=${mode}`,
      };
    } else {
      actionGate = {
        ...actionGate,
        allowExecution: false,
        reasons: [
          "Starter day detected, but safety blockers must be cleared before execution.",
          ...existingReasons,
        ].slice(0, 3),
      };
    }
  }
  const killSwitch = computeKillSwitchState({
    hasPlan,
    hasHoldings,
    doneToday,
    riskPolicyEval,
    actionGate,
  });
  const riskEnvelope = computeRiskEnvelope({
    mode,
    riskPolicy,
    riskPolicyEval,
    actionGate,
    executionScore,
    executionEvidence,
    killSwitch,
  });
  const decisionGovernanceEnabled = isDecisionGovernanceV1Enabled();
  const probabilisticLayerEnabled = isProbLayerV1Enabled();
  const governanceAssetMap = new Map<string, any>();
  for (const item of portfolioItems as any[]) {
    const symbol = String(item?.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const q = (quotes as any)?.[symbol];
    const qty = Number(item?.qty ?? NaN);
    const price = Number(q?.price ?? NaN);
    const fallbackValue = Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0;
    const valueEurRaw = Number(item?.valueEur ?? item?.value_eur ?? fallbackValue ?? 0);
    governanceAssetMap.set(symbol, {
      asset: symbol,
      value_eur: Number.isFinite(valueEurRaw) ? Math.max(0, valueEurRaw) : 0,
      marketData: {
        price: Number.isFinite(Number(q?.price)) ? Number(q?.price) : null,
        prevClose: Number.isFinite(Number(q?.prevClose)) ? Number(q?.prevClose) : null,
        bid: null,
        ask: null,
        volume: Number.isFinite(Number(q?.volume)) ? Number(q?.volume) : null,
        avgVolume: Number.isFinite(Number(q?.averageVolume)) ? Number(q?.averageVolume) : null,
      },
      volatility_pct: Number((performance as any)?.volatility30dPct ?? 0) || null,
      asset_class: null,
    });
  }
  if (!governanceAssetMap.size && Array.isArray(starterPack)) {
    for (const sp of starterPack as any[]) {
      const symbol = String(sp?.symbol || "").trim().toUpperCase();
      if (!symbol || governanceAssetMap.has(symbol)) continue;
      const weight = Number(sp?.weight ?? 0);
      const valueFromWeight = Number.isFinite(weight) && weight > 0 ? Math.round(weight * 1000) : 0;
      const valueFromDynamic = Number(sp?.value_eur ?? sp?.valueEur ?? 0);
      governanceAssetMap.set(symbol, {
        asset: symbol,
        value_eur: Number.isFinite(valueFromDynamic) && valueFromDynamic > 0 ? valueFromDynamic : valueFromWeight,
        marketData: {
          price: Number.isFinite(Number(sp?.price)) ? Number(sp?.price) : null,
          prevClose: Number.isFinite(Number(sp?.prev_close)) ? Number(sp?.prev_close) : null,
          bid: null,
          ask: null,
          volume: Number.isFinite(Number(sp?.volume)) ? Number(sp?.volume) : null,
          avgVolume: Number.isFinite(Number(sp?.avg_volume)) ? Number(sp?.avg_volume) : null,
        },
        volatility_pct: Number((performance as any)?.volatility30dPct ?? 0) || null,
        asset_class: null,
      });
    }
  }
  const decisionGovernance = computeDecisionGovernance({
    enabled: decisionGovernanceEnabled,
    probabilistic_enabled: probabilisticLayerEnabled,
    mode,
    asOf,
    assets: Array.from(governanceAssetMap.values()),
    portfolio_total_eur: Number((valuation as any)?.totalEur ?? 0),
    drawdown_pct: Number((performance as any)?.maxDrawdownPct ?? 0),
    execution_quality_score: Number((executionScore as any)?.score ?? 0),
    coverage_pct: liveCoveragePct,
    max_single_position_pct: Number((riskPolicy as any)?.maxSinglePositionPct ?? 22),
    action_gate: {
      status: (actionGate as any)?.status ?? null,
      allowExecution: (actionGate as any)?.allowExecution ?? null,
    },
    risk_policy_eval: {
      blocked: Boolean((riskPolicyEval as any)?.blocked),
      status: (riskPolicyEval as any)?.status ?? null,
    },
  });
  const dailyBriefing = buildDailyBriefingFromDecisionGovernance({
    enabled: isDailyBriefingV1Enabled(),
    as_of: asOf,
    decision_governance: decisionGovernance,
    action_gate: {
      status: (actionGate as any)?.status ?? null,
      allowExecution: (actionGate as any)?.allowExecution ?? null,
    },
    risk_policy_eval: {
      blocked: Boolean((riskPolicyEval as any)?.blocked),
      status: (riskPolicyEval as any)?.status ?? null,
    },
  });
  const opportunityQueue = buildOpportunityQueue({
    opportunities: opportunities as any[],
    executionScore,
    riskPolicyEval,
    actionGate,
    killSwitch,
    asOf,
  });
  const whyNow = buildWhyNow({
    diagnostics: diagnostics as any,
    planPhase,
    pressureScore: pressureV2.score,
    actionGate,
  });

  // NBA (always 1)
  const nbaBase = buildNBA({
    mode,
    hasPlan,
    hasHoldings,
    doneToday,
    starterPackCount: starterPack.length,
    candidates: opportunities,
  });
  const effectiveTopAction = actionKeyFromCandidate(opportunities[0]) || normalizeActionKey((nbaBase as any)?.cta?.action);
  const repeatedTopActionDays = countConsecutiveStartsWith(recentActions, effectiveTopAction);
  const phaseRepeatDays = countConsecutiveStartsWith(recentPhaseKeys, planPhase.key);
  const previousPlanFocus = recentPlanFocuses[0] || null;
  const seedBase = recentActions.length + new Date(asOf).getUTCDate() + phaseRepeatDays;
  const phaseMicroStep = microStepForPhase({
    phaseKey: planPhase.key,
    seed: seedBase,
    avoid: previousPlanFocus,
  });
  const actionMicroStep = microStepForAction({
    action: effectiveTopAction,
    seed: seedBase + repeatedTopActionDays,
    avoid: phaseMicroStep || previousPlanFocus,
  });
  const proofCoverageWeak = !doneToday && executionEvidence.strongProofDays7 < 2;
  const complianceMicroStep = proofCoverageWeak
    ? "Capture execution proof today: broker ticket/reference plus fees/slippage before closing."
    : null;
  const microStep = complianceMicroStep || phaseMicroStep || actionMicroStep;
  const escalationNeeded = !doneToday && (phaseRepeatDays >= 4 && repeatedTopActionDays >= 3 || proofCoverageWeak);
  const riskEscalationBlocked =
    !doneToday &&
    preTradeSafetyCheck.riskEscalationBlocked &&
    (isRiskEscalationAction((nbaBase as any)?.type) ||
      isRiskEscalationAction((nbaBase as any)?.cta?.action) ||
      Number((actionGate as any)?.confidencePct || 0) >= 70);

  const nba =
    actionGate.status === "blocked" && !doneToday
      ? {
          ...nbaBase,
          title: "Execution blocked until quality gate is clear",
          desc: `${actionGate.reasons[0] || "Execution quality gate blocked."} Next: ${actionGate.nextStep}`,
          cta: {
            label: actionGate.ctaLabel,
            action: actionGate.ctaAction,
            href: actionGate.ctaHref,
          },
          kind: "warn",
        }
      : riskEscalationBlocked
      ? {
          ...nbaBase,
          title: "Execution pacing locked by proof quality",
          desc: `${preTradeSafetyCheck.reason} Next: ${preTradeSafetyCheck.nextStep}`,
          cta: {
            label: "Capture execution proof",
            action: "run_checklist",
            href: `/app?tab=daily&mode=${mode}`,
          },
          kind: "warn",
        }
      : !doneToday && (repeatedTopActionDays >= 2 || rotatedToday)
      ? {
          ...nbaBase,
          title: `Plan follow-up: ${planPhase.label}`,
          desc: rotatedToday
            ? `${nbaBase.desc} Focus today: ${microStep || "execute the alternate step in this phase."}`
            : escalationNeeded
              ? `${nbaBase.desc} Phase is taking longer than expected. Mandatory checkpoint: ${
                  microStep || "run the checkpoint task now"
                }. Exit criteria: ${planPhase.exitWhen}.`
              : `${nbaBase.desc} Continue this phase until exit criteria is met (${planPhase.exitWhen}).${
                  microStep ? ` Focus today: ${microStep}` : ""
                }`,
        }
      : nbaBase;

  const planTrack = {
    phase: planPhase,
    topAction: effectiveTopAction,
    recentActions: recentActions.slice(0, 5),
    repeatedTopActionDays,
    phaseRepeatDays,
    rotatedToday,
    escalationNeeded,
    microStep: microStep || null,
  };

  const actionGateAlert = computeActionGateAlert({
    recentStatuses: recentGateStatuses,
    latest: actionGate.status as GateStatus,
    doneToday,
  });
  const followUp = computeFollowUpPlan({
    asOf,
    mode,
    doneToday,
    gateStatus: actionGate.status as GateStatus,
    suitabilityStatus: suitability.status,
  });

  const profileBenchmark = computeProfileBenchmark({
    mode,
    executionScore,
    pressureScore: pressureV2.score,
    topLeakSeverity: topLeakSeverity || null,
    streak,
    doneToday,
    performance,
    actionGateStatus: actionGate.status as GateStatus,
  });

  // score explained (backwards compat + v2)
  const sc = scoreExplained({ mode, hasPlan, hasHoldings, doneToday, diagnostics, candidatesCount: opportunities.length });

  // proof-first
  const proof = proofFirst({ d: diagnostics });
  if (planTrack.microStep && Array.isArray((proof as any)?.whatChanged)) {
    (proof as any).whatChanged = [...(proof as any).whatChanged, `Plan focus: ${planTrack.microStep}`].slice(0, 4);
  }
  if (planTrack.phaseRepeatDays >= 2 && Array.isArray((proof as any)?.whatChanged)) {
    (proof as any).whatChanged = [...(proof as any).whatChanged, `Phase continuity: ${planPhase.label}`].slice(0, 4);
  }
  if (Array.isArray((proof as any)?.whatChanged)) {
    const gateLine =
      actionGate.status === "blocked"
        ? "Execution gate: BLOCKED"
        : actionGate.status === "caution"
          ? "Execution gate: CAUTION"
          : "Execution gate: READY";
    (proof as any).whatChanged = [...(proof as any).whatChanged, gateLine].slice(0, 4);
  }
  if (actionGateAlert.triggered && Array.isArray((proof as any)?.whatChanged)) {
    (proof as any).whatChanged = [...(proof as any).whatChanged, `Gate alert: blocked ${actionGateAlert.blockedStreakDays}d`].slice(0, 4);
  }

  // simple regime placeholder (upgrade later)
  const regime = liveCoveragePct >= 70 ? "neutral" : "data_limited";

  const dailyEngineV4 = safeComputeDailyEngineV4({
    userId,
    mode,
    asOf,
    setupStatus: userSettings?.setup_status ? String(userSettings.setup_status) : null,
    plan: (plan as any) ?? null,
    portfolioItems: (portfolioItems as any[]) ?? [],
    valuation: (valuation as any) ?? null,
    quotes: (quotes as any) ?? {},
    doneToday,
    receiptsCount: receiptsCount ?? 0,
    streak,
    lastSnapshotAt,
    executionEvidence: executionEvidence as any,
    timeline: timeline as any,
    topRiskLeakKey: (diagnostics as any)?.riskLeaks?.[0]?.key ?? null,
    topRiskLeakTitle: (diagnostics as any)?.riskLeaks?.[0]?.title ?? null,
    topRiskLeakSeverity: (diagnostics as any)?.riskLeaks?.[0]?.severity ?? null,
  });
  const loopSpecDaily = buildLoopSpecDailyExtensions({
    mode,
    asOf,
    nba,
    actionGate,
    whyNow,
    doneToday,
    hasPlan,
    hasHoldings,
    cashEur: Number((valuation as any)?.cashEur || 0),
    totalEur: Number((valuation as any)?.totalEur || 0),
    coveragePct: liveCoveragePct,
    pressureScore: Number((pressureV2 as any)?.score || 0),
    topLeakSeverity: (diagnostics as any)?.riskLeaks?.[0]?.severity ?? null,
    executionEvidence,
    engineV4: dailyEngineV4,
  });
  const scoredLoopMain = applyScoresReplayAuditExtensions({
    mode,
    loopSpecDaily,
    engineV4: dailyEngineV4,
    actionGate,
    hasPlan,
    hasHoldings,
    doneToday,
    coveragePct: liveCoveragePct,
    topLeakKey: (diagnostics as any)?.riskLeaks?.[0]?.key ?? null,
    topLeakSeverity: (diagnostics as any)?.riskLeaks?.[0]?.severity ?? null,
    executionScore,
  });
  const loopSpecDailyScored = scoredLoopMain.daily;
  const dailyEngineV4Scored = scoredLoopMain.engineV4 ?? dailyEngineV4;

  const perfectLoop = buildPerfectLoopExtensions({
    mode,
    asOf,
    loopSpecDaily: loopSpecDailyScored,
    dailyEngineV4: dailyEngineV4Scored,
    plan,
    userSettings,
    actionGate,
    whyNow,
    executionScore,
    executionEvidence,
    timeline,
    valuation,
    hasPlan,
    hasHoldings,
    doneToday,
    receiptsCount: receiptsCount ?? 0,
    streak,
  });
  const paywallState = buildDailyPaywallState({
    asOf,
    mode,
    billing: billingState,
    dailyNode: loopSpecDailyScored,
    perfectLoop,
    receiptsCount: receiptsCount ?? 0,
    doneToday,
    hasPlan,
    hasHoldings,
    actionGate,
  });
  const activationState = buildDay1ActivationState({
    asOf,
    mode,
    dailyNode: { ...loopSpecDailyScored, ...paywallState },
    perfectLoop,
    billing: paywallState.billing,
    paywall: paywallState.paywall,
    receiptsCount: receiptsCount ?? 0,
    doneToday,
    hasPlan,
    hasHoldings,
  });
  const progressionState = buildProgressionNarrativeAntiChurnState({
    asOf,
    mode,
    dailyNode: { ...loopSpecDailyScored, ...paywallState },
    perfectLoop,
    activation: activationState,
    timeline,
    receiptsCount: receiptsCount ?? 0,
    doneToday,
    hasPlan,
    hasHoldings,
  });
  const engineV5State = buildLivingDecisionEngineV5State({
    asOf,
    mode,
    dailyNode: { ...loopSpecDailyScored, ...paywallState, ...progressionState },
    perfectLoop,
    activation: activationState,
    progression: progressionState,
    timeline,
    engineV4: dailyEngineV4Scored,
    diagnostics,
    actionGate,
    regime,
    portfolioItems,
    valuation,
    hasPlan,
    hasHoldings,
    doneToday,
    receiptsCount: receiptsCount ?? 0,
  });
  const unlockedMode = buildUnlockedMode({ mode, hasProAccess });
  const portfolioScore = buildInstantPortfolioScore({
    dailyNode: loopSpecDailyScored,
    hasPlan,
    hasHoldings,
    coveragePct: liveCoveragePct,
    topLeakTitle: (diagnostics as any)?.riskLeaks?.[0]?.title ?? null,
    topLeakKey: (diagnostics as any)?.riskLeaks?.[0]?.key ?? null,
    topLeakSeverity: (diagnostics as any)?.riskLeaks?.[0]?.severity ?? null,
  });
  const syntrakeStackState = buildSyntrakeIntelligenceStackState({
    asOf,
    mode,
    dailyNode: { ...loopSpecDailyScored, ...paywallState, ...progressionState, engineV5: engineV5State },
    engineV4: dailyEngineV4Scored,
    engineV5: engineV5State,
    perfectLoop,
    activation: activationState,
    progression: progressionState,
    billing: paywallState.billing,
    paywall: paywallState.paywall,
    portfolioScore,
    unlockedMode,
    diagnostics,
    doneToday,
    hasPlan,
    hasHoldings,
    receiptsCount: receiptsCount ?? 0,
    fallbackReason: null,
  });
  const planAlignmentForGrowth =
    String((loopSpecDailyScored as any)?.capitalStatus?.planAlignment || "").trim() || null;
  const pressureForGrowth = Number((loopSpecDailyScored as any)?.scores?.riskPressure ?? (pressureV2 as any)?.score ?? NaN);
  const growthReadiness = computeGrowthReadiness({
    planAlignment: planAlignmentForGrowth,
    pressureScore: pressureForGrowth,
    riskPolicyEval,
    executionScore,
    streak,
  });
  const weeklyValue = computeWeeklyValueMetrics({
    blockedDays7: Number((actionGateAlert as any)?.blockedDays7 || 0),
    cautionDays7: Number((actionGateAlert as any)?.cautionDays7 || 0),
    riskPressureDelta1: Number((progressionState as any)?.trends?.riskPressure?.delta1 ?? NaN),
    executionScore,
  });
  const preExecutionSimulation = computePreExecutionSimulation({
    pressureScore: pressureForGrowth,
    riskEnvelope,
    growthReadiness,
    riskPolicyEval,
  });
  const cashDeploymentPolicy = buildCashDeploymentPolicy({
    hasPlan,
    hasHoldings,
    regime,
    posture: String((loopSpecDailyScored as any)?.capitalStatus?.posture || ""),
    killSwitch,
    riskEnvelope,
  });
  const capitalProtectionSummary = {
    posture: String((loopSpecDailyScored as any)?.capitalStatus?.posture || "UNKNOWN"),
    planAlignment: String((loopSpecDailyScored as any)?.capitalStatus?.planAlignment || "LOW"),
    riskPressure: Number((loopSpecDailyScored as any)?.scores?.riskPressure ?? (pressureV2 as any)?.score ?? 0),
    gateStatus: String((actionGate as any)?.status || "blocked"),
    killSwitchState: killSwitch.state,
    envelopeClass: riskEnvelope.riskClass,
    summary:
      killSwitch.active
        ? `Protection mode active (${killSwitch.state}). New risk is paused.`
        : riskEnvelope.status === "constrained"
          ? "Protection mode constrained. Reduced sizing and strict proof discipline are active."
          : "Protection controls are healthy for disciplined execution.",
  };
  const decisionSources = computeDecisionSourceTransparency({
    mode,
    hasPlan,
    hasHoldings,
    hasExecutionEvidence: Number((executionEvidence as any)?.proofs14 || 0) > 0,
    snapshotsCount: timeline.length,
  });
  const priorityNotifications = buildPriorityNotifications({
    killSwitch,
    preTrade: preTradeSafetyCheck,
    weeklyValue,
    growthReadiness,
  });
  const antiChurn = computeAntiChurnState({
    doneToday,
    streak,
    executionScore,
    weeklyValue,
    growthReadiness,
    killSwitch,
    preTrade: preTradeSafetyCheck,
    actionGate,
    continuitySignals: safeObj((progressionState as any)?.continuitySignals),
  });
  const weeklyPremiumReport = buildWeeklyPremiumReport({
    asOf,
    mode,
    weeklyValue,
    growthReadiness,
    executionScore,
    riskEnvelope,
    killSwitch,
    streak,
    topLeakTitle: diagnostics?.riskLeaks?.[0]?.title ?? null,
    decisionSources,
  });
  (loopSpecDailyScored as any).nextBestAction = {
    ...safeObj((loopSpecDailyScored as any).nextBestAction),
    intent: (perfectLoop as any)?.decisionLifecycle?.decisionIntent ?? null,
    lifecycleStage: (perfectLoop as any)?.decisionLifecycle?.stage ?? null,
    sessionState: (perfectLoop as any)?.decisionLifecycle?.sessionState ?? null,
    paywallActivationEligible: Boolean((perfectLoop as any)?.paywallActivation?.eligibleNow),
  };
  const operationalTodayKey = dayKeyUTCFromIso(asOf);
  const operationalProofTodayKey = dayKeyUTCFromIso(String((executionEvidence as any)?.latestAt || ""));
  const operationalHasProofToday = Boolean(
    operationalTodayKey && operationalProofTodayKey && operationalTodayKey === operationalProofTodayKey && !doneToday
  );
  (loopSpecDailyScored as any).operationalAction = computeOperationalAction({
    actionType: (loopSpecDailyScored as any)?.nextBestAction?.type ?? null,
    actionInstruction: (loopSpecDailyScored as any)?.nextBestAction?.instruction ?? null,
    actionReason: (loopSpecDailyScored as any)?.nextBestAction?.reason ?? null,
    doneToday,
    hasProofToday: operationalHasProofToday,
    gateStatus: (actionGate as any)?.status ?? null,
    allowExecution: (actionGate as any)?.allowExecution ?? null,
    topLeakSeverity: diagnostics?.riskLeaks?.[0]?.severity ?? null,
    riskPressure: Number((loopSpecDailyScored as any)?.scores?.riskPressure ?? (pressureV2 as any)?.score ?? 0),
    killSwitchState: killSwitch?.state ?? null,
    riskEnvelopeStatus: riskEnvelope?.status ?? null,
    preTradeStatus: preTradeSafetyCheck?.status ?? null,
  });
  void writeEngineEvent({
    userId,
    mode,
    event: "daily_opened",
    status: "ok",
    source: "api.daily_bundle",
    details: {
      doneToday,
      receiptsCount: receiptsCount ?? 0,
      next_action_type: (loopSpecDailyScored as any)?.nextBestAction?.type || null,
    },
  });
  void writeEngineEvent({
    userId,
    mode,
    event: "action_rendered",
    status: "ok",
    source: "api.daily_bundle",
    details: {
      next_action_type: (loopSpecDailyScored as any)?.nextBestAction?.type || null,
      raw_action: (loopSpecDailyScored as any)?.nextBestAction?.rawAction || null,
      source_engine: (loopSpecDailyScored as any)?.nextBestAction?.source || "engine_v3",
      doneToday,
    },
  });

  const responseBody = {
    ok: true,
    mode,
    asOf,
    plan,
    portfolio: {
      cash: 0,
      items: portfolioItems,
      quotes,
      valuation,
    },
    daily: {
      engineV4: dailyEngineV4Scored,
      ...loopSpecDailyScored,
      perfectLoop,
      portfolioScore,
      unlockedMode,
      billing: paywallState.billing,
      paywall: paywallState.paywall,
      nextBestActionPreview: paywallState.nextBestActionPreview,
      activation: activationState,
      trends: progressionState.trends,
      streak: progressionState.streak,
      narrative: progressionState.narrative,
      continuitySignals: progressionState.continuitySignals,
      engineV5: engineV5State,
      syntrakeStack: syntrakeStackState,
      proof,
      nba,
      opportunityQueue,
      actionGate,
      preTradeSafetyCheck,
      killSwitch,
      riskEnvelope,
      preExecutionSimulation,
      cashDeploymentPolicy,
      growthReadiness,
      weeklyValue,
      weeklyPremiumReport,
      antiChurn,
      capitalProtectionSummary,
      priorityNotifications,
      decisionSources,
      decisionGovernance,
      daily_briefing: dailyBriefing,
      top_opportunities: decisionGovernance.top_opportunities,
      opportunities_dashboard: decisionGovernance.opportunities,
      portfolio_risk: decisionGovernance.portfolio_risk,
      daily_decision: decisionGovernance.daily_decision,
      decision_confidence: decisionGovernance.decision_confidence,
      operationalAction: (loopSpecDailyScored as any)?.operationalAction ?? null,
      whyNow,
      actionGateAlert,
      suitability,
      riskPolicy: {
        policy: riskPolicy,
        evaluation: riskPolicyEval,
      },
      followUp,
      profileBenchmark,
      opportunities,
      planTrack,
      executionEvidence,
      executionCoach,
      starterPack,
      starterPackMeta: dynamicStarter ? { source: dynamicStarter.source, budgetEur: dynamicStarter.budgetEur } : null,
      starterWarmup: {
        active: starterWarmupActive,
        appliedAt: starterAppliedAt,
        expiresInHours: starterWarmupActive && starterAppliedAt
          ? Math.max(
              0,
              Math.round(
                (36 * 60 * 60 * 1000 - (new Date(asOf).getTime() - new Date(starterAppliedAt).getTime())) / (60 * 60 * 1000)
              )
            )
          : 0,
      },
      lastSnapshotAt,
    },
    derived: {
      regime,

      // keep old fields stable
      pressure: Math.round(pressureV2.score) / 100,
      autopilotScore: sc.score,
      scoreWhy: sc.why,

      // new institutional fields
      autopilot: sc.v2,
      pressureV2,

      diagnostics,
      pricing: diagnostics.pricing,
      actionGate,
      preTradeSafetyCheck,
      killSwitch,
      riskEnvelope,
      preExecutionSimulation,
      cashDeploymentPolicy,
      growthReadiness,
      weeklyValue,
      weeklyPremiumReport,
      antiChurn,
      capitalProtectionSummary,
      priorityNotifications,
      decisionSources,
      decisionGovernance,
      daily_briefing: dailyBriefing,
      top_opportunities: decisionGovernance.top_opportunities,
      opportunities_dashboard: decisionGovernance.opportunities,
      portfolio_risk: decisionGovernance.portfolio_risk,
      daily_decision: decisionGovernance.daily_decision,
      decision_confidence: decisionGovernance.decision_confidence,
      operationalAction: (loopSpecDailyScored as any)?.operationalAction ?? null,
      whyNow,
      actionGateAlert,
      suitability,
      riskPolicy: {
        policy: riskPolicy,
        evaluation: riskPolicyEval,
      },
      followUp,
      profileBenchmark,
      hasPlan,
      hasHoldings,
      planTrack,
      executionEvidence,
      executionCoach,
      topLeakKey: diagnostics?.riskLeaks?.[0]?.key ?? null,
      starterWarmup: {
        active: starterWarmupActive,
        appliedAt: starterAppliedAt,
      },

      receiptsCount: receiptsCount ?? 0,
      receiptsTimeline: timeline,
      moneyConfirmed,
      decisionImpact,
      performance,
      executionScore,
      topRiskLeak: diagnostics?.riskLeaks?.[0]?.title ?? "None detected.",
      doneToday,
      streak,
    },
  };
  return NextResponse.json(
    finalizeDailyBundleResponse(attachDecisionEnvelopeToDailyBundleRouteResponse({
      response: responseBody,
      branch: "success",
      branchReason: null,
      tradingWatchlistInputs,
    }), {
      mode,
      asOf,
      accessTier,
    }),
  );
  } catch (error: any) {
    const msg = String(error?.message || "Unexpected daily bundle error");
    console.error("[daily-bundle] fatal", error);
    const fatalNba = {
      title: "Daily fallback mode active",
      desc: "Syntrake recovered from a temporary issue. Complete setup and refresh.",
      kind: "warn",
      cta: { label: "Refresh Daily", action: "refresh_daily", href: `/app?tab=daily&mode=${mode}` },
    };
    const fatalActionGate = {
      status: "blocked",
      allowExecution: false,
      reasons: ["Temporary data issue detected."],
    };
    const fatalWhyNow = {
      driverTitle: "Temporary backend issue",
      rationale: "Syntrake switched to fallback mode to avoid a hard failure.",
      evidence: ["Fallback triggered by runtime error.", "Execution locked for safety."],
    };
    const fatalLoopSpecDaily = buildLoopSpecDailyExtensions({
      mode,
      asOf,
      nba: fatalNba,
      actionGate: fatalActionGate,
      whyNow: fatalWhyNow,
      doneToday: false,
      hasPlan: false,
      hasHoldings: false,
      cashEur: 0,
      totalEur: 0,
      coveragePct: 0,
      pressureScore: 100,
      topLeakSeverity: "high",
      executionEvidence: null,
      engineV4: null,
    });
    const fatalScored = applyScoresReplayAuditExtensions({
      mode,
      loopSpecDaily: fatalLoopSpecDaily,
      engineV4: null,
      actionGate: fatalActionGate,
      hasPlan: false,
      hasHoldings: false,
      doneToday: false,
      coveragePct: 0,
      topLeakKey: "daily_bundle_fallback",
      topLeakSeverity: "high",
      executionScore: null,
    });
    const fatalLoopSpecScored = fatalScored.daily;
    const fatalPerfectLoop = buildPerfectLoopExtensions({
      mode,
      asOf,
      loopSpecDaily: fatalLoopSpecScored,
      dailyEngineV4: null,
      plan: null,
      userSettings: null,
      actionGate: fatalActionGate,
      whyNow: fatalWhyNow,
      executionScore: null,
      executionEvidence: null,
      timeline: [],
      valuation: { cashEur: 0, totalEur: 0, coveragePct: 0 },
      hasPlan: false,
      hasHoldings: false,
      doneToday: false,
      receiptsCount: 0,
      streak: 0,
    });
    const fatalPaywall = buildDailyPaywallState({
      asOf,
      mode,
      billing: billingState,
      dailyNode: fatalLoopSpecScored,
      perfectLoop: fatalPerfectLoop,
      receiptsCount: 0,
      doneToday: false,
      hasPlan: false,
      hasHoldings: false,
      actionGate: fatalActionGate,
    });
    const fatalActivation = buildDay1ActivationState({
      asOf,
      mode,
      dailyNode: { ...fatalLoopSpecScored, ...fatalPaywall },
      perfectLoop: fatalPerfectLoop,
      billing: fatalPaywall.billing,
      paywall: fatalPaywall.paywall,
      receiptsCount: 0,
      doneToday: false,
      hasPlan: false,
      hasHoldings: false,
    });
    const fatalProgression = buildProgressionNarrativeAntiChurnState({
      asOf,
      mode,
      dailyNode: { ...fatalLoopSpecScored, ...fatalPaywall },
      perfectLoop: fatalPerfectLoop,
      activation: fatalActivation,
      timeline: [],
      receiptsCount: 0,
      doneToday: false,
      hasPlan: false,
      hasHoldings: false,
    });
    const fatalEngineV5 = buildLivingDecisionEngineV5State({
      asOf,
      mode,
      dailyNode: { ...fatalLoopSpecScored, ...fatalPaywall, ...fatalProgression },
      perfectLoop: fatalPerfectLoop,
      activation: fatalActivation,
      progression: fatalProgression,
      timeline: [],
      engineV4: null,
      diagnostics: {
        pricing: { missingSymbols: [], coveragePct: 0 },
        riskLeaks: [{ key: "daily_bundle_fallback", severity: "high" }],
      },
      actionGate: fatalActionGate,
      regime: "data_limited",
      portfolioItems: [],
      valuation: { coveragePct: 0 },
      hasPlan: false,
      hasHoldings: false,
      doneToday: false,
      receiptsCount: 0,
    });
    const fatalUnlockedMode = buildUnlockedMode({ mode, hasProAccess });
    const fatalPortfolioScore = buildInstantPortfolioScore({
      dailyNode: fatalLoopSpecScored,
      hasPlan: false,
      hasHoldings: false,
      coveragePct: 0,
      topLeakTitle: "Temporary backend issue",
      topLeakKey: "daily_bundle_fallback",
      topLeakSeverity: "high",
    });
    const fatalSyntrakeStack = buildSyntrakeIntelligenceStackState({
      asOf,
      mode,
      dailyNode: { ...fatalLoopSpecScored, ...fatalPaywall, ...fatalProgression, engineV5: fatalEngineV5 },
      engineV4: null,
      engineV5: fatalEngineV5,
      perfectLoop: fatalPerfectLoop,
      activation: fatalActivation,
      progression: fatalProgression,
      billing: fatalPaywall.billing,
      paywall: fatalPaywall.paywall,
      portfolioScore: fatalPortfolioScore,
      unlockedMode: fatalUnlockedMode,
      diagnostics: {
        pricing: { coveragePct: 0, missingSymbols: [] },
        riskLeaks: [{ key: "daily_bundle_fallback", severity: "high" }],
      },
      doneToday: false,
      hasPlan: false,
      hasHoldings: false,
      receiptsCount: 0,
      fallbackReason: "daily_bundle_fallback",
    });
    const fatalDecisionGovernance = buildDecisionGovernanceFallback({
      enabled: isDecisionGovernanceV1Enabled(),
      reasonCode: "daily_bundle_fallback",
      gateBlocked: true,
      riskBlocked: true,
    });
    const fatalDailyBriefing = buildDailyBriefingFromDecisionGovernance({
      enabled: isDailyBriefingV1Enabled(),
      as_of: asOf,
      decision_governance: fatalDecisionGovernance,
      action_gate: {
        status: "blocked",
        allowExecution: false,
      },
      risk_policy_eval: {
        blocked: true,
        status: "block",
      },
    });
    (fatalLoopSpecScored as any).nextBestAction = {
      ...safeObj((fatalLoopSpecScored as any).nextBestAction),
      intent: (fatalPerfectLoop as any)?.decisionLifecycle?.decisionIntent ?? null,
      lifecycleStage: (fatalPerfectLoop as any)?.decisionLifecycle?.stage ?? null,
      sessionState: (fatalPerfectLoop as any)?.decisionLifecycle?.sessionState ?? null,
      paywallActivationEligible: Boolean((fatalPerfectLoop as any)?.paywallActivation?.eligibleNow),
    };
    const responseBody = {
      ok: false,
      degraded: true,
      degradedReason: "daily_bundle_fallback",
      mode,
      asOf,
      plan: null,
      portfolio: { cash: 0, items: [] },
      daily: {
        ...fatalLoopSpecScored,
        perfectLoop: fatalPerfectLoop,
        portfolioScore: fatalPortfolioScore,
        unlockedMode: fatalUnlockedMode,
        billing: fatalPaywall.billing,
        paywall: fatalPaywall.paywall,
        nextBestActionPreview: fatalPaywall.nextBestActionPreview,
        activation: fatalActivation,
        trends: fatalProgression.trends,
        streak: fatalProgression.streak,
        narrative: fatalProgression.narrative,
        continuitySignals: fatalProgression.continuitySignals,
        engineV5: fatalEngineV5,
        syntrakeStack: fatalSyntrakeStack,
        proof: { whatChanged: ["Daily bundle fallback"], meaning: msg },
        nba: fatalNba,
        actionGate: {
          status: "blocked",
          allowExecution: false,
          confidencePct: 30,
          reasons: ["Temporary data issue detected."],
          nextStep: "Refresh Daily. If it persists, reload profile/portfolio data.",
          requiredPhase: "setup_plan",
          topLeakKey: "daily_bundle_fallback",
          topLeakSeverity: "high",
          pressureScore: 0,
          coveragePct: 0,
          ctaLabel: "Refresh Daily",
          ctaAction: "refresh_daily",
          ctaHref: `/app?tab=daily&mode=${mode}`,
        },
        whyNow: {
          driverKey: "daily_bundle_fallback",
          driverTitle: "Temporary backend issue",
          severity: "high",
          rationale: "Syntrake switched to fallback mode to avoid a hard failure.",
          evidence: ["Fallback triggered by runtime error.", "Execution locked for safety."],
          expectedOutcome: "Stable recovery without 500 failures.",
          counterfactual: "Without fallback, Daily would stay unavailable.",
        },
        actionGateAlert: {
          triggered: true,
          severity: "high",
          latest: "blocked",
          blockedStreakDays: 1,
          blockedDays7: 1,
          cautionDays7: 0,
          message: "Fallback mode blocked execution to protect capital.",
          nextStep: "Refresh and re-check setup data before sending any order.",
        },
        suitability: {
          status: "blocked",
          score: 20,
          reasons: ["Suitability unavailable in fallback mode."],
          nextStep: "Refresh Daily and complete setup profile before execution.",
          profile: {
            riskProfile: null,
            horizon: null,
            goalType: null,
            goalTargetValue: null,
          },
          checks: {
            profileComplete: false,
            modeRiskAligned: true,
            targetRealism: "stretch",
            dataQualityOk: false,
          },
        },
        riskPolicy: {
          policy: {
            level: "balanced",
            mode,
            horizon: null,
            maxSinglePositionPct: 22,
            maxTop3ConcentrationPct: 58,
            maxDrawdownPct: 20,
            maxExposurePct: 90,
            minPricingCoveragePct: 80,
            maxDecisionPressure: 74,
            maxMissingSymbols: 1,
            allowHighSeverityLeak: false,
            source: "default",
          },
          evaluation: {
            status: "block",
            blocked: true,
            reasons: ["Fallback mode blocks execution until data recovers."],
            nextStep: "Refresh Daily and recover data flow before executing.",
            breaches: [{ key: "high_severity_leak", message: "Fallback safety mode active.", actual: "high", limit: "recover_data_flow" }],
            warnings: [],
            snapshot: {
              top1Pct: null,
              top3Pct: null,
              drawdownPct: null,
              exposurePct: null,
              coveragePct: 0,
              pressureScore: 100,
              missingSymbols: 0,
              topLeakSeverity: "high",
            },
          },
        },
        followUp: {
          status: "blocked",
          headline: "Fallback follow-up required",
          message: "Recover data flow before executing any order.",
          deadlineAt: asOf,
          nextCheckAt: nextUtcSlotIso(asOf, 60, 1),
          urgencyMinutes: 60,
          channels: ["in_app", "email"],
          checklist: [
            "Refresh Daily after validating setup.",
            "Re-check plan and holdings status.",
            "Run execution only after gate is clear.",
          ],
        },
        profileBenchmark: {
          mode,
          score: 30,
          tier: "at_risk",
          percentileLabel: "Below benchmark",
          components: { execution: 0, risk: 25, consistency: 10, alpha: 50 },
          summary: "Fallback mode active. Recover data quality before execution.",
        },
        executionCoach: {
          windowDays: 30,
          stableDays: 0,
          unstableDays: 0,
          topPatterns: [],
          todayRule: "Refresh Daily and recover data flow before execution.",
          qualityGate: modeManualQualityGate(mode),
        },
        opportunities: [],
        opportunityQueue: { generatedAt: asOf, topPriority: 0, items: [] },
        preTradeSafetyCheck: {
          required: true,
          status: "blocked",
          reason: "Fallback mode blocks pre-trade execution.",
          checks: {
            policyClear: false,
            qualityOk: false,
            proofDepthOk: false,
            validationOk: false,
            checklistOk: false,
            gateClear: false,
          },
          riskEscalationBlocked: true,
          requiredProofDays7: 1,
          nextStep: "Refresh Daily and recover data flow before execution.",
        },
        killSwitch: {
          active: true,
          state: "Waiting",
          reason: "Fallback safety lock is active.",
          trigger: "daily_bundle_fallback",
          allowNewRisk: false,
          releaseRule: "Recover backend data flow.",
        },
        riskEnvelope: {
          status: "blocked",
          riskClass: "Locked",
          maxDeployPct: 0,
          maxPositionPct: 0,
          expectedDrawdownBudgetPct: 1,
          confidenceWeight: 0.3,
          executionWeight: 0.3,
          pressureWeight: 0,
          recommendation: "No new risk until fallback is cleared.",
        },
        preExecutionSimulation: {
          defensive: { label: "Defensive path", riskDelta: -2, alignmentDelta: 1, note: "Fallback mode active." },
          base: { label: "Base path", riskDelta: 0, alignmentDelta: 0, note: "Fallback mode active." },
          accelerated: { label: "Accelerated path", riskDelta: 4, alignmentDelta: -1, note: "Fallback mode active." },
        },
        cashDeploymentPolicy: {
          mode: "defensive_hold",
          capDeployPct: 0,
          rationale: "Fallback mode: hold cash.",
          regime: "data_limited",
        },
        growthReadiness: {
          score: 20,
          tier: "Not ready",
          components: { alignment: 20, risk: 20, consistency: 20, execution: 20 },
          nextFocus: "Recover system data flow first.",
        },
        weeklyValue: {
          riskAvoidedPoints: 0,
          errorsAvoidedEstimate: 0,
          disciplineUpPct: 0,
          summary: "Fallback mode active.",
        },
        weeklyPremiumReport: {
          generatedAt: asOf,
          periodLabel: "Fallback window",
          summary: "Weekly report is limited while fallback mode is active.",
          highlights: ["Fallback safety lock active."],
          focusNextWeek: ["Recover backend data flow and refresh Daily."],
          metrics: {
            growthReadiness: 20,
            executionScore: 0,
            riskAvoidedPoints: 0,
            errorsAvoidedEstimate: 0,
            disciplineUpPct: 0,
            streakDays: 0,
            envelopeStatus: "blocked",
            protectionState: "Waiting",
          },
          trustLine: "Fallback mode report uses safety defaults until runtime recovers.",
        },
        antiChurn: {
          score: 30,
          riskLevel: "high",
          triggers: ["fallback_mode"],
          interventions: [
            {
              id: "fallback_recover",
              priority: "high",
              title: "Recover daily data flow",
              detail: "Refresh Daily and validate setup before continuing execution.",
            },
          ],
          message: "Retention intervention active while fallback mode is present.",
          nextCheckHours: 6,
        },
        capitalProtectionSummary: {
          posture: "SURVIVAL",
          planAlignment: "LOW",
          riskPressure: 100,
          gateStatus: "blocked",
          killSwitchState: "Waiting",
          envelopeClass: "Locked",
          summary: "Fallback safety lock active.",
        },
        priorityNotifications: [
          {
            id: "fallback_mode",
            priority: "high",
            title: "Fallback safety lock active",
            detail: "Refresh Daily and recover data flow before execution.",
          },
        ],
        decisionSources: {
          headline: "Decision sources (fallback)",
          sources: ["Fallback runtime guard", "No live decision context available"],
          trustLine: "Fallback mode prevents unsafe execution when runtime errors occur.",
        },
        decisionGovernance: fatalDecisionGovernance,
        daily_briefing: fatalDailyBriefing,
        top_opportunities: fatalDecisionGovernance.top_opportunities,
        opportunities_dashboard: fatalDecisionGovernance.opportunities,
        portfolio_risk: fatalDecisionGovernance.portfolio_risk,
        daily_decision: fatalDecisionGovernance.daily_decision,
        decision_confidence: fatalDecisionGovernance.decision_confidence,
        operationalAction: (fatalLoopSpecScored as any)?.operationalAction ?? null,
        starterPack: getStarterPack(mode),
        starterPackMeta: { source: "static_fallback", budgetEur: 0 },
        lastSnapshotAt: null,
      },
      derived: {
        regime: "data_limited",
        pressure: 1,
        autopilotScore: 25,
        scoreWhy: ["Fallback mode active due to temporary backend issue."],
        autopilot: {
          total: 25,
          safety: 20,
          growth: 30,
          reasonsShort: ["Fallback mode active"],
        },
        pressureV2: {
          score: 100,
          drivers: [{ key: "fallback_mode", title: "Fallback mode", severity: "high", impact: 1 }],
        },
        diagnostics: {
          riskLeaks: [{ key: "daily_bundle_fallback", title: "Temporary backend issue", severity: "high", detail: msg }],
          pricing: { coveragePct: 0, missingSymbols: [], priceAgeSeconds: 0 },
        },
        pricing: { coveragePct: 0, missingSymbols: [], priceAgeSeconds: 0 },
        actionGate: {
          status: "blocked",
          allowExecution: false,
          confidencePct: 30,
          reasons: ["Temporary data issue detected."],
          nextStep: "Refresh Daily and retry.",
          requiredPhase: "setup_plan",
          topLeakKey: "daily_bundle_fallback",
          topLeakSeverity: "high",
          pressureScore: 0,
          coveragePct: 0,
          ctaLabel: "Refresh Daily",
          ctaAction: "refresh_daily",
          ctaHref: `/app?tab=daily&mode=${mode}`,
        },
        whyNow: {
          driverKey: "daily_bundle_fallback",
          driverTitle: "Temporary backend issue",
          severity: "high",
          rationale: "Fallback mode preserves app availability.",
          evidence: ["Runtime fallback engaged."],
          expectedOutcome: "Daily remains usable while data recovers.",
          counterfactual: "Daily would fail hard without fallback.",
        },
        actionGateAlert: {
          triggered: true,
          severity: "high",
          latest: "blocked",
          blockedStreakDays: 1,
          blockedDays7: 1,
          cautionDays7: 0,
          message: "Fallback mode blocked execution.",
          nextStep: "Refresh and validate plan/portfolio setup.",
        },
        suitability: {
          status: "blocked",
          score: 20,
          reasons: ["Suitability unavailable in fallback mode."],
          nextStep: "Refresh Daily and complete setup profile before execution.",
          profile: {
            riskProfile: null,
            horizon: null,
            goalType: null,
            goalTargetValue: null,
          },
          checks: {
            profileComplete: false,
            modeRiskAligned: true,
            targetRealism: "stretch",
            dataQualityOk: false,
          },
        },
        riskPolicy: {
          policy: {
            level: "balanced",
            mode,
            horizon: null,
            maxSinglePositionPct: 22,
            maxTop3ConcentrationPct: 58,
            maxDrawdownPct: 20,
            maxExposurePct: 90,
            minPricingCoveragePct: 80,
            maxDecisionPressure: 74,
            maxMissingSymbols: 1,
            allowHighSeverityLeak: false,
            source: "default",
          },
          evaluation: {
            status: "block",
            blocked: true,
            reasons: ["Fallback mode blocks execution until data recovers."],
            nextStep: "Refresh Daily and recover data flow before executing.",
            breaches: [{ key: "high_severity_leak", message: "Fallback safety mode active.", actual: "high", limit: "recover_data_flow" }],
            warnings: [],
            snapshot: {
              top1Pct: null,
              top3Pct: null,
              drawdownPct: null,
              exposurePct: null,
              coveragePct: 0,
              pressureScore: 100,
              missingSymbols: 0,
              topLeakSeverity: "high",
            },
          },
        },
        preTradeSafetyCheck: {
          required: true,
          status: "blocked",
          reason: "Fallback mode blocks pre-trade execution.",
          checks: {
            policyClear: false,
            qualityOk: false,
            proofDepthOk: false,
            validationOk: false,
            checklistOk: false,
            gateClear: false,
          },
          riskEscalationBlocked: true,
          requiredProofDays7: 1,
          nextStep: "Refresh Daily and recover data flow before execution.",
        },
        killSwitch: {
          active: true,
          state: "Waiting",
          reason: "Fallback safety lock is active.",
          trigger: "daily_bundle_fallback",
          allowNewRisk: false,
          releaseRule: "Recover backend data flow.",
        },
        riskEnvelope: {
          status: "blocked",
          riskClass: "Locked",
          maxDeployPct: 0,
          maxPositionPct: 0,
          expectedDrawdownBudgetPct: 1,
          confidenceWeight: 0.3,
          executionWeight: 0.3,
          pressureWeight: 0,
          recommendation: "No new risk until fallback is cleared.",
        },
        preExecutionSimulation: {
          defensive: { label: "Defensive path", riskDelta: -2, alignmentDelta: 1, note: "Fallback mode active." },
          base: { label: "Base path", riskDelta: 0, alignmentDelta: 0, note: "Fallback mode active." },
          accelerated: { label: "Accelerated path", riskDelta: 4, alignmentDelta: -1, note: "Fallback mode active." },
        },
        cashDeploymentPolicy: {
          mode: "defensive_hold",
          capDeployPct: 0,
          rationale: "Fallback mode: hold cash.",
          regime: "data_limited",
        },
        growthReadiness: {
          score: 20,
          tier: "Not ready",
          components: { alignment: 20, risk: 20, consistency: 20, execution: 20 },
          nextFocus: "Recover system data flow first.",
        },
        weeklyValue: {
          riskAvoidedPoints: 0,
          errorsAvoidedEstimate: 0,
          disciplineUpPct: 0,
          summary: "Fallback mode active.",
        },
        weeklyPremiumReport: {
          generatedAt: asOf,
          periodLabel: "Fallback window",
          summary: "Weekly report is limited while fallback mode is active.",
          highlights: ["Fallback safety lock active."],
          focusNextWeek: ["Recover backend data flow and refresh Daily."],
          metrics: {
            growthReadiness: 20,
            executionScore: 0,
            riskAvoidedPoints: 0,
            errorsAvoidedEstimate: 0,
            disciplineUpPct: 0,
            streakDays: 0,
            envelopeStatus: "blocked",
            protectionState: "Waiting",
          },
          trustLine: "Fallback mode report uses safety defaults until runtime recovers.",
        },
        antiChurn: {
          score: 30,
          riskLevel: "high",
          triggers: ["fallback_mode"],
          interventions: [
            {
              id: "fallback_recover",
              priority: "high",
              title: "Recover daily data flow",
              detail: "Refresh Daily and validate setup before continuing execution.",
            },
          ],
          message: "Retention intervention active while fallback mode is present.",
          nextCheckHours: 6,
        },
        capitalProtectionSummary: {
          posture: "SURVIVAL",
          planAlignment: "LOW",
          riskPressure: 100,
          gateStatus: "blocked",
          killSwitchState: "Waiting",
          envelopeClass: "Locked",
          summary: "Fallback safety lock active.",
        },
        priorityNotifications: [
          {
            id: "fallback_mode",
            priority: "high",
            title: "Fallback safety lock active",
            detail: "Refresh Daily and recover data flow before execution.",
          },
        ],
        decisionSources: {
          headline: "Decision sources (fallback)",
          sources: ["Fallback runtime guard", "No live decision context available"],
          trustLine: "Fallback mode prevents unsafe execution when runtime errors occur.",
        },
        decisionGovernance: fatalDecisionGovernance,
        daily_briefing: fatalDailyBriefing,
        top_opportunities: fatalDecisionGovernance.top_opportunities,
        opportunities_dashboard: fatalDecisionGovernance.opportunities,
        portfolio_risk: fatalDecisionGovernance.portfolio_risk,
        daily_decision: fatalDecisionGovernance.daily_decision,
        decision_confidence: fatalDecisionGovernance.decision_confidence,
        followUp: {
          status: "blocked",
          headline: "Fallback follow-up required",
          message: "Recover data flow before executing any order.",
          deadlineAt: asOf,
          nextCheckAt: nextUtcSlotIso(asOf, 60, 1),
          urgencyMinutes: 60,
          channels: ["in_app", "email"],
          checklist: [
            "Refresh Daily after validating setup.",
            "Re-check plan and holdings status.",
            "Run execution only after gate is clear.",
          ],
        },
        profileBenchmark: {
          mode,
          score: 30,
          tier: "at_risk",
          percentileLabel: "Below benchmark",
          components: { execution: 0, risk: 25, consistency: 10, alpha: 50 },
          summary: "Fallback mode active. Recover normal data flow before execution.",
        },
        executionCoach: {
          windowDays: 30,
          stableDays: 0,
          unstableDays: 0,
          topPatterns: [],
          todayRule: "Refresh Daily and recover data flow before execution.",
          qualityGate: modeManualQualityGate(mode),
        },
        hasPlan: false,
        hasHoldings: false,
        planTrack: {
          phase: {
            key: "setup_plan",
            label: "Setup: activate plan",
            goal: "Recover setup and return to normal execution.",
            exitWhen: "Daily bundle loads without fallback.",
          },
          topAction: "refresh_daily",
          recentActions: [],
          repeatedTopActionDays: 0,
          phaseRepeatDays: 0,
          rotatedToday: false,
          escalationNeeded: false,
          microStep: "Refresh Daily after validating plan and holdings.",
        },
        topLeakKey: "daily_bundle_fallback",
        receiptsCount: 0,
        receiptsTimeline: [],
        moneyConfirmed: { today: 0, week: 0, total: 0 },
        decisionImpact: computeDecisionImpact({
          moneyConfirmed: { today: 0, week: 0, total: 0 },
          performance: null,
          executionScore: null,
          executionEvidence: null,
          coveragePct: 0,
          recentSnapshots: null,
        }),
        performance: {
          hasData: false,
          trackedDays: 0,
          totalReturnPct: 0,
          return30dPct: 0,
          return90dPct: 0,
          maxDrawdownPct: 0,
          volatility30dPct: 0,
          benchmarkAnnualPct: modeAnnualBenchmarkPct(mode),
          benchmarkTotalPct: 0,
          benchmark30dPct: 0,
          benchmark90dPct: 0,
          alphaTotalPct: 0,
          alpha30dPct: 0,
          alpha90dPct: 0,
        },
        executionScore: {
          score: 0,
          tone: "bad",
          weekTargetDays: 5,
          doneDays: 0,
          validatedDays: 0,
          disciplinePct: 0,
          validationPct: 0,
          checklistPct: 0,
          manualCompleted: 0,
          manualTotal: 0,
          consistencyPct: 0,
          missingProofDays: [],
        },
        topRiskLeak: `Fallback: ${msg}`,
        doneToday: false,
        streak: 0,
      },
    };
    return NextResponse.json(
      finalizeDailyBundleResponse(attachDecisionEnvelopeToDailyBundleRouteResponse({
        response: responseBody,
        branch: "fatal_fallback",
        branchReason: msg,
        tradingWatchlistInputs,
      }), {
        mode,
        asOf,
        accessTier,
      }),
    );
  }
}


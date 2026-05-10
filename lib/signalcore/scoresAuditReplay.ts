import { createHash } from "node:crypto";
import type { AutopilotMode } from "@/lib/signalcore/modes";

type ScorePosture = "STABLE" | "CAUTION" | "DEFENSIVE" | "SURVIVAL";
type PlanAlignment = "HIGH" | "OK" | "LOW";
type AuditSeverity = "low" | "medium" | "high";

export type ScoreAuditNote = {
  code: string;
  severity: AuditSeverity;
  message: string;
};

export type SignalCoreScoreInput = {
  mode: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  actionType: string | null;
  actionInstruction?: string | null;
  actionReason?: string | null;
  coveragePct: number;
  exposurePct: number;
  cashPct: number;
  topLeakKey?: string | null;
  topLeakSeverity?: string | null;
  actionGateStatus?: string | null;
  actionGateAllowExecution?: boolean | null;
  engineV4?: {
    inputHash?: string | null;
    confidence01?: number | null;
    aggression?: string | null;
    trace?: any[] | null;
    guardrails?: any[] | null;
    confidenceScore?: number | null;
  } | null;
  executionReality?: {
    brokerExecutionPending: boolean;
    executionScoreValue?: number | null;
  };
};

export type SignalCoreScores = {
  autopilotScore: number;
  decisionConfidence: number;
  riskPressure: number;
  planCoherence: number;
};

export type SignalCoreScoresAuditResult = {
  scores: SignalCoreScores;
  capitalStatusPatch: {
    posture: ScorePosture;
    planAlignment: PlanAlignment;
    riskPressure: number;
  };
  reasonList: string[];
  audit: {
    notes: ScoreAuditNote[];
    noteCount: number;
    marketDataOk: boolean;
    deterministic: boolean;
    inputHash: string | null;
    traceCount: number;
    guardrailCount: number;
  };
  replayMeta: {
    replayReady: boolean;
    endpoint: string;
    inputHash: string | null;
    reproducibilityLabel: "Decision reproducible" | "Replay unavailable";
    topAlternativesAvailable: boolean;
  };
};

function clampPct(n: number, fallback = 0) {
  const v = Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function safePct(n: any, fallback = 0) {
  const v = Number(n);
  return clampPct(v, fallback);
}

function normalizedActionType(input: string | null | undefined) {
  const x = String(input || "").trim().toUpperCase();
  return x || "HOLD";
}

function targetGrossByMode(mode: AutopilotMode) {
  void mode;
  return 85;
}

function minCashFloorByMode(mode: AutopilotMode) {
  void mode;
  return 5;
}

function shockPenaltyFromPosture(posture: ScorePosture) {
  if (posture === "CAUTION") return 6;
  if (posture === "DEFENSIVE") return 12;
  if (posture === "SURVIVAL") return 20;
  return 0;
}

function postureFromRiskPressure(riskPressure: number, forcedSurvival: boolean): ScorePosture {
  if (forcedSurvival || riskPressure > 90) return "SURVIVAL";
  if (riskPressure >= 76) return "DEFENSIVE";
  if (riskPressure >= 56) return "CAUTION";
  return "STABLE";
}

function alignmentFromCoherence(planCoherence: number): PlanAlignment {
  if (planCoherence >= 80) return "HIGH";
  if (planCoherence >= 55) return "OK";
  return "LOW";
}

function edgePointsFromAggression(aggression: string | null | undefined) {
  const a = String(aggression || "").trim().toUpperCase();
  if (a === "LOW") return 5;
  if (a === "NORMAL") return 15;
  if (a === "HIGH") return 25;
  if (a === "MAX") return 32;
  return 10;
}

function stableSmallHash(input: any) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function buildReasons(args: {
  doneToday: boolean;
  actionType: string;
  scores: SignalCoreScores;
  posture: ScorePosture;
  planAlignment: PlanAlignment;
  exposurePct: number;
  coveragePct: number;
  cashPct: number;
  actionReason?: string | null;
  topLeakKey?: string | null;
}) {
  const reasons: string[] = [];
  const actionType = args.actionType;
  const s = args.scores;

  if (args.doneToday) {
    reasons.push("Day is already closed. Replay and review only until the next evaluation window.");
    reasons.push(`Next cycle remains in monitoring mode with Risk Pressure ${s.riskPressure}/100.`);
    if (args.actionReason) reasons.push(String(args.actionReason).trim());

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const reason of reasons) {
      const text = String(reason || "").trim();
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(text);
      if (deduped.length >= 6) break;
    }
    return deduped.slice(0, Math.max(2, Math.min(6, deduped.length)));
  }

  reasons.push(`Posture is ${args.posture} with Risk Pressure ${s.riskPressure}/100.`);

  if (actionType === "HOLD") {
    reasons.push(`Decision Confidence is ${s.decisionConfidence}/100; holding is the safest action today.`);
  } else if (actionType === "PAUSE") {
    reasons.push(`Plan Coherence is ${s.planCoherence}/100; restore plan/data quality before acting.`);
  } else if (actionType === "REDUCE") {
    reasons.push(`Risk Pressure is high (${s.riskPressure}/100) while exposure is ${args.exposurePct}% of capital.`);
  } else if (actionType === "ADD" || actionType === "ENTER") {
    reasons.push(
      `Decision Confidence is ${s.decisionConfidence}/100 and Risk Pressure is ${s.riskPressure}/100, allowing a controlled action.`,
    );
  } else if (actionType === "EXECUTE_BROKER") {
    reasons.push(`Execution is pending; complete broker steps to convert the decision into a stored receipt.`);
  } else if (actionType === "CLOSE_DAY") {
    reasons.push(`Execution evidence is available; close the day to store the decision receipt and continue monitoring.`);
  } else if (args.actionReason) {
    reasons.push(String(args.actionReason).trim());
  }

  if (args.planAlignment === "LOW") {
    reasons.push(`Plan alignment is LOW (${s.planCoherence}/100); prioritize restoring coherence before adding risk.`);
  } else if (args.coveragePct < 70) {
    reasons.push(`Market data coverage is limited (${args.coveragePct}%), so confidence is capped.`);
  } else if (args.cashPct > 60 && (actionType === "ADD" || actionType === "EXECUTE_BROKER")) {
    reasons.push(`Cash level is ${args.cashPct}% and remains available for staged deployment.`);
  } else if (args.topLeakKey) {
    reasons.push(`Top risk leak is being monitored (${String(args.topLeakKey).replace(/_/g, " ")}).`);
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const reason of reasons) {
    const text = String(reason || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(text);
    if (deduped.length >= 6) break;
  }
  return deduped.slice(0, Math.max(2, Math.min(6, deduped.length)));
}

export function computeScoresAndReplayAudit(input: SignalCoreScoreInput): SignalCoreScoresAuditResult {
  const mode = input.mode;
  const actionType = normalizedActionType(input.actionType);
  const coveragePct = safePct(input.coveragePct, 0);
  const exposurePct = safePct(input.exposurePct, 0);
  const cashPct = safePct(input.cashPct, 100);
  const hasPlan = !!input.hasPlan;
  const hasHoldings = !!input.hasHoldings;
  const gateStatus = String(input.actionGateStatus || "").trim().toLowerCase();
  const allowExecution = input.actionGateAllowExecution == null ? true : !!input.actionGateAllowExecution;
  const topLeakKey = String(input.topLeakKey || "").trim().toLowerCase() || null;
  const topLeakSeverity = String(input.topLeakSeverity || "").trim().toLowerCase();

  const targetGross = targetGrossByMode(mode);
  const minCashFloor = minCashFloorByMode(mode);

  const basePressure = Math.max(0, Math.min(60, Math.round((Math.max(0, exposurePct) / Math.max(1, targetGross)) * 60)));
  const clusterPenalty =
    topLeakKey && topLeakKey.includes("concentration")
      ? topLeakSeverity === "high"
        ? 15
        : topLeakSeverity === "medium" || topLeakSeverity === "med"
          ? 8
          : 3
      : 0;
  const cashPenalty = cashPct < minCashFloor ? Math.min(15, Math.round((minCashFloor - cashPct) * 2)) : 0;
  const preliminaryShockPosture: ScorePosture =
    !hasPlan || !hasHoldings
      ? "SURVIVAL"
      : gateStatus === "blocked"
        ? "DEFENSIVE"
        : gateStatus === "caution" || coveragePct < 75
          ? "CAUTION"
          : "STABLE";
  const pressureNoPosture = basePressure + clusterPenalty + cashPenalty;
  const riskPressure = clampPct(pressureNoPosture + shockPenaltyFromPosture(preliminaryShockPosture), 0);
  const posture = postureFromRiskPressure(riskPressure, !hasPlan || !hasHoldings);

  let planCoherence = 100;
  if (!hasPlan) {
    planCoherence = 0;
  } else {
    const driftPenalty =
      topLeakKey && (topLeakKey.includes("concentration") || topLeakKey.includes("cash_drag"))
        ? topLeakSeverity === "high"
          ? 32
          : topLeakSeverity === "medium" || topLeakSeverity === "med"
            ? 18
            : 8
        : Math.max(0, Math.round((100 - coveragePct) * 0.2));
    planCoherence -= Math.min(40, driftPenalty);
    if (cashPct < minCashFloor) planCoherence -= 20;
    if (riskPressure >= 85 || (topLeakKey && topLeakKey.includes("concentration") && topLeakSeverity === "high")) planCoherence -= 20;
    if (posture === "SURVIVAL") planCoherence -= 10;
  }
  planCoherence = clampPct(planCoherence, 0);
  const planAlignment = alignmentFromCoherence(planCoherence);

  const marketDataOk = coveragePct >= 60 && !(gateStatus === "blocked" && !allowExecution && coveragePct < 60);

  const notes: ScoreAuditNote[] = [];
  if (!marketDataOk) notes.push({ code: "market_data_low", severity: "high", message: `Market data coverage is low (${coveragePct}%).` });
  if (!hasPlan) notes.push({ code: "plan_missing", severity: "high", message: "Active plan missing." });
  if (!hasHoldings) notes.push({ code: "holdings_missing", severity: "high", message: "Holdings missing." });
  if (topLeakSeverity === "high") notes.push({ code: "top_leak_high", severity: "medium", message: "High-severity risk leak active." });
  if (gateStatus === "blocked") notes.push({ code: "action_gate_blocked", severity: "high", message: "Action gate blocked execution." });
  else if (gateStatus === "caution") notes.push({ code: "action_gate_caution", severity: "medium", message: "Action gate in caution mode." });
  if (cashPct < minCashFloor) notes.push({ code: "cash_floor_low", severity: "medium", message: `Cash floor below mode minimum (${minCashFloor}%).` });

  const auditPenalty = Math.min(20, notes.length * 5);

  const engineConfidence01Raw =
    typeof input.engineV4?.confidence01 === "number"
      ? input.engineV4.confidence01
      : typeof input.engineV4?.confidenceScore === "number"
        ? Math.max(0, Math.min(100, input.engineV4.confidenceScore)) / 100
        : 0.4;
  const regimeBase = Math.max(0, Math.min(1, engineConfidence01Raw)) * 40;
  const edgePoints = edgePointsFromAggression(input.engineV4?.aggression ?? null);
  const marketPoints = marketDataOk ? 15 : -40;
  const shockPenalty = posture === "CAUTION" ? 5 : posture === "DEFENSIVE" ? 12 : posture === "SURVIVAL" ? 22 : 0;
  let decisionConfidence = clampPct(regimeBase + edgePoints + marketPoints - auditPenalty - shockPenalty, 0);
  if (!marketDataOk) decisionConfidence = Math.min(decisionConfidence, 30);

  const brokerExecutionPending =
    input.executionReality?.brokerExecutionPending ??
    (actionType === "EXECUTE_BROKER");
  const executionScore =
    input.executionReality?.executionScoreValue != null
      ? clampPct(Number(input.executionReality.executionScoreValue), brokerExecutionPending ? 55 : 100)
      : brokerExecutionPending
        ? 55
        : 100;

  const autopilotScore = clampPct(
    0.45 * planCoherence +
      0.35 * (100 - riskPressure) +
      0.1 * decisionConfidence +
      0.1 * executionScore,
    0,
  );

  const inputHash = input.engineV4?.inputHash ? String(input.engineV4.inputHash) : null;
  const deterministic = Boolean(inputHash) || Boolean(input.engineV4?.trace?.length);

  if (!marketDataOk && actionType !== "HOLD" && actionType !== "PAUSE") {
    notes.push({
      code: "confidence_action_mismatch",
      severity: "medium",
      message: `Decision confidence is capped by data quality, but action remained ${actionType}.`,
    });
  }

  const reasonList = buildReasons({
    doneToday: input.doneToday,
    actionType,
    scores: {
      autopilotScore,
      decisionConfidence,
      riskPressure,
      planCoherence,
    },
    posture,
    planAlignment,
    exposurePct,
    coveragePct,
    cashPct,
    actionReason: input.actionReason ?? null,
    topLeakKey,
  });

  const replayReady = Boolean(inputHash);
  return {
    scores: {
      autopilotScore,
      decisionConfidence,
      riskPressure,
      planCoherence,
    },
    capitalStatusPatch: {
      posture,
      planAlignment,
      riskPressure,
    },
    reasonList,
    audit: {
      notes,
      noteCount: notes.length,
      marketDataOk,
      deterministic,
      inputHash,
      traceCount: Array.isArray(input.engineV4?.trace) ? input.engineV4!.trace!.length : 0,
      guardrailCount: Array.isArray(input.engineV4?.guardrails) ? input.engineV4!.guardrails!.length : 0,
    },
    replayMeta: {
      replayReady,
      endpoint: "/api/decision/replay",
      inputHash,
      reproducibilityLabel: replayReady ? "Decision reproducible" : "Replay unavailable",
      topAlternativesAvailable: false,
    },
  };
}

export function buildDecisionReplayDiff(args: {
  storedActionType: string | null;
  replayActionType: string | null;
  storedScores: Partial<SignalCoreScores> | null;
  replayScores: Partial<SignalCoreScores> | null;
  storedCapitalStatus: { posture?: string | null; planAlignment?: string | null; riskPressure?: number | null } | null;
  replayCapitalStatus: { posture?: string | null; planAlignment?: string | null; riskPressure?: number | null } | null;
}) {
  const diff: Record<string, any> = {};
  if (String(args.storedActionType || "") !== String(args.replayActionType || "")) {
    diff.actionType = { stored: args.storedActionType || null, replay: args.replayActionType || null };
  }

  const scoreKeys: Array<keyof SignalCoreScores> = ["autopilotScore", "decisionConfidence", "riskPressure", "planCoherence"];
  for (const key of scoreKeys) {
    const a = args.storedScores && typeof args.storedScores[key] === "number" ? Number(args.storedScores[key]) : null;
    const b = args.replayScores && typeof args.replayScores[key] === "number" ? Number(args.replayScores[key]) : null;
    if (a !== b) {
      diff[key] = { stored: a, replay: b };
    }
  }

  const postureStored = String(args.storedCapitalStatus?.posture || "") || null;
  const postureReplay = String(args.replayCapitalStatus?.posture || "") || null;
  if (postureStored !== postureReplay) diff.posture = { stored: postureStored, replay: postureReplay };

  const alignStored = String(args.storedCapitalStatus?.planAlignment || "") || null;
  const alignReplay = String(args.replayCapitalStatus?.planAlignment || "") || null;
  if (alignStored !== alignReplay) diff.planAlignment = { stored: alignStored, replay: alignReplay };

  const rpStored = args.storedCapitalStatus && typeof args.storedCapitalStatus.riskPressure === "number"
    ? Number(args.storedCapitalStatus.riskPressure)
    : null;
  const rpReplay = args.replayCapitalStatus && typeof args.replayCapitalStatus.riskPressure === "number"
    ? Number(args.replayCapitalStatus.riskPressure)
    : null;
  if (rpStored !== rpReplay) diff.capitalRiskPressure = { stored: rpStored, replay: rpReplay };

  return {
    match: Object.keys(diff).length === 0,
    diff: Object.keys(diff).length > 0 ? diff : undefined,
  };
}

export function buildReplayComputationSignature(input: {
  mode: string;
  actionType: string | null;
  scores: Partial<SignalCoreScores>;
  capitalStatus: { posture?: string | null; planAlignment?: string | null; riskPressure?: number | null };
  inputHash?: string | null;
}) {
  return stableSmallHash({
    mode: input.mode,
    actionType: input.actionType || null,
    scores: {
      autopilotScore: typeof input.scores.autopilotScore === "number" ? input.scores.autopilotScore : null,
      decisionConfidence: typeof input.scores.decisionConfidence === "number" ? input.scores.decisionConfidence : null,
      riskPressure: typeof input.scores.riskPressure === "number" ? input.scores.riskPressure : null,
      planCoherence: typeof input.scores.planCoherence === "number" ? input.scores.planCoherence : null,
    },
    capitalStatus: {
      posture: input.capitalStatus.posture || null,
      planAlignment: input.capitalStatus.planAlignment || null,
      riskPressure: typeof input.capitalStatus.riskPressure === "number" ? input.capitalStatus.riskPressure : null,
    },
    inputHash: input.inputHash || null,
  });
}

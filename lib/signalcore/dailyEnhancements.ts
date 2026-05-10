import type { AutopilotMode } from "@/lib/signalcore/modes";
import type { RiskPolicy, RiskPolicyEvaluation } from "@/lib/signalcore/riskPolicy";

type GateStatus = "ready" | "caution" | "blocked";

export type ActionGateLike = {
  status?: string | null;
  allowExecution?: boolean | null;
  confidencePct?: number | null;
  pressureScore?: number | null;
  coveragePct?: number | null;
  reasons?: string[] | null;
  nextStep?: string | null;
  ctaLabel?: string | null;
  ctaAction?: string | null;
  ctaHref?: string | null;
};

export type ExecutionScoreLike = {
  score?: number | null;
  disciplinePct?: number | null;
  validationPct?: number | null;
  checklistPct?: number | null;
};

export type ExecutionEvidenceLike = {
  strongProofDays7?: number | null;
  avgQuality14?: number | null;
  completionPct14?: number | null;
};

export type CandidateLike = {
  id?: string | null;
  type?: string | null;
  title?: string | null;
  score?: number | null;
  confidence?: number | null;
  impact?: string | null;
  rationale?: string | null;
};

export type KillSwitchState = {
  active: boolean;
  state: "Monitoring" | "Protecting" | "Waiting";
  reason: string;
  trigger: string | null;
  allowNewRisk: boolean;
  releaseRule: string;
};

export type PreTradeSafetyCheck = {
  required: boolean;
  status: "not_required" | "passed" | "caution" | "blocked";
  reason: string;
  checks: {
    policyClear: boolean;
    qualityOk: boolean;
    proofDepthOk: boolean;
    validationOk: boolean;
    checklistOk: boolean;
    gateClear: boolean;
  };
  riskEscalationBlocked: boolean;
  requiredProofDays7: number;
  nextStep: string;
};

export type RiskEnvelope = {
  status: "active" | "constrained" | "blocked";
  riskClass: "Low" | "Moderate" | "High" | "Locked";
  maxDeployPct: number;
  maxPositionPct: number;
  expectedDrawdownBudgetPct: number;
  confidenceWeight: number;
  executionWeight: number;
  pressureWeight: number;
  recommendation: string;
};

export type OpportunityQueueItem = {
  id: string;
  type: string;
  title: string;
  priority: number;
  impactScore: number;
  riskScore: number;
  effortScore: number;
  rationale: string;
};

export type OpportunityQueue = {
  generatedAt: string;
  topPriority: number;
  items: OpportunityQueueItem[];
};

export type CashDeploymentPolicy = {
  mode: "disabled" | "defensive_hold" | "measured_deploy" | "opportunity_deploy";
  capDeployPct: number;
  rationale: string;
  regime: string;
};

export type GrowthReadiness = {
  score: number;
  tier: "Not ready" | "Building" | "Ready" | "Scaling";
  components: {
    alignment: number;
    risk: number;
    consistency: number;
    execution: number;
  };
  nextFocus: string;
};

export type WeeklyValueMetrics = {
  riskAvoidedPoints: number;
  errorsAvoidedEstimate: number;
  disciplineUpPct: number;
  summary: string;
};

export type AntiChurnIntervention = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type AntiChurnState = {
  score: number;
  riskLevel: "low" | "medium" | "high";
  triggers: string[];
  interventions: AntiChurnIntervention[];
  message: string;
  nextCheckHours: number;
};

export type WeeklyPremiumReport = {
  generatedAt: string;
  periodLabel: string;
  summary: string;
  highlights: string[];
  focusNextWeek: string[];
  metrics: {
    growthReadiness: number;
    executionScore: number;
    riskAvoidedPoints: number;
    errorsAvoidedEstimate: number;
    disciplineUpPct: number;
    streakDays: number;
    envelopeStatus: string;
    protectionState: string;
  };
  trustLine: string;
};

export type PreExecutionSimulation = {
  base: { label: string; riskDelta: number; alignmentDelta: number; note: string };
  defensive: { label: string; riskDelta: number; alignmentDelta: number; note: string };
  accelerated: { label: string; riskDelta: number; alignmentDelta: number; note: string };
};

export type PriorityNotification = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type OperationalActionCategory =
  | "DEPLOY"
  | "ROTATE"
  | "PROTECT"
  | "PREPARE"
  | "DISCIPLINE";

export type OperationalAction = {
  category: OperationalActionCategory;
  brokerInstruction: string;
  capitalImpact: string;
  riskImpact: string;
  expectedOutcomeWindow: string;
};

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

function normalizeGateStatus(v: unknown): GateStatus {
  const s = String(v || "").trim().toLowerCase();
  if (s === "ready" || s === "caution" || s === "blocked") return s;
  return "caution";
}

function normalizeActionType(v: unknown) {
  return String(v || "").trim().toUpperCase();
}

function hasAnyToken(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

function pickOperationalCategory(args: {
  actionType: string;
  actionInstruction: string;
  actionReason: string;
  doneToday: boolean;
  hasProofToday: boolean;
  gateStatus: GateStatus;
  allowExecution: boolean;
  topLeakSeverity: string;
  riskPressure: number;
}): OperationalActionCategory {
  const actionType = args.actionType;
  const text = `${args.actionInstruction} ${args.actionReason}`.toLowerCase();

  if (args.doneToday || actionType === "CLOSE_DAY") return "DISCIPLINE";
  if (actionType === "HOLD") return args.hasProofToday ? "DISCIPLINE" : "PREPARE";
  if (actionType === "PAUSE") return "PROTECT";
  if (actionType === "ADD" || actionType === "ENTER") return "DEPLOY";
  if (actionType === "EXIT") return "PROTECT";

  if (actionType === "REDUCE") {
    if (hasAnyToken(text, ["rebalance", "rotate", "drift", "allocation", "concentration", "cash drag"])) {
      return "ROTATE";
    }
    return "PROTECT";
  }

  if (actionType === "EXECUTE_BROKER") {
    if (hasAnyToken(text, ["reduce", "de-risk", "derisk", "hedge", "trim", "protect", "stop"])) return "PROTECT";
    if (hasAnyToken(text, ["rebalance", "rotate", "drift", "allocation", "concentration"])) return "ROTATE";
    if (hasAnyToken(text, ["add", "deploy", "enter", "buy", "accumulate"])) return "DEPLOY";
    return "PREPARE";
  }

  if (!args.allowExecution || args.gateStatus === "blocked") {
    return args.topLeakSeverity === "high" || args.riskPressure >= 75 ? "PROTECT" : "PREPARE";
  }
  return "PREPARE";
}

export function computeOperationalAction(args: {
  actionType: unknown;
  actionInstruction?: unknown;
  actionReason?: unknown;
  doneToday?: boolean;
  hasProofToday?: boolean;
  gateStatus?: unknown;
  allowExecution?: unknown;
  topLeakSeverity?: unknown;
  riskPressure?: unknown;
  killSwitchState?: unknown;
  riskEnvelopeStatus?: unknown;
  preTradeStatus?: unknown;
}): OperationalAction {
  const actionType = normalizeActionType(args.actionType);
  const actionInstruction = String(args.actionInstruction || "").trim();
  const actionReason = String(args.actionReason || "").trim();
  const doneToday = Boolean(args.doneToday);
  const hasProofToday = Boolean(args.hasProofToday);
  const gateStatus = normalizeGateStatus(args.gateStatus);
  const allowExecution = args.allowExecution == null ? true : Boolean(args.allowExecution);
  const topLeakSeverity = String(args.topLeakSeverity || "").trim().toLowerCase();
  const riskPressure = clamp(n(args.riskPressure, 0), 0, 100);
  const killSwitchState = String(args.killSwitchState || "").trim().toLowerCase();
  const riskEnvelopeStatus = String(args.riskEnvelopeStatus || "").trim().toLowerCase();
  const preTradeStatus = String(args.preTradeStatus || "").trim().toLowerCase();

  const baseCategory = pickOperationalCategory({
    actionType,
    actionInstruction,
    actionReason,
    doneToday,
    hasProofToday,
    gateStatus,
    allowExecution,
    topLeakSeverity,
    riskPressure,
  });

  const holdAction = actionType === "HOLD";
  const hardProtect =
    killSwitchState === "protecting" ||
    killSwitchState === "waiting" ||
    riskEnvelopeStatus === "blocked" ||
    preTradeStatus === "blocked" ||
    gateStatus === "blocked";
  const protectBias = hardProtect || topLeakSeverity === "high" || riskPressure >= 80;

  let category: OperationalActionCategory = baseCategory;
  if (!holdAction && (category === "DEPLOY" || category === "ROTATE") && !allowExecution) {
    category = protectBias ? "PROTECT" : "PREPARE";
  }
  if (!holdAction && category === "DEPLOY" && protectBias) {
    category = "PROTECT";
  }

  if (category === "DEPLOY") {
    return {
      category,
      brokerInstruction:
        actionInstruction ||
        "Place staged buy/add orders in your broker using limit pricing and strict size caps.",
      capitalImpact: "Increase deployed capital gradually inside the current risk envelope.",
      riskImpact: "Risk increases in controlled steps with guardrails active.",
      expectedOutcomeWindow: "2-10 market days",
    };
  }

  if (category === "ROTATE") {
    return {
      category,
      brokerInstruction:
        actionInstruction ||
        "Rebalance in your broker: trim overweight exposure and reallocate to plan target weights.",
      capitalImpact: "Reallocate existing capital without materially increasing gross exposure.",
      riskImpact: "Lowers concentration risk and improves plan alignment.",
      expectedOutcomeWindow: "1-5 market days",
    };
  }

  if (category === "PROTECT") {
    return {
      category,
      brokerInstruction:
        actionInstruction ||
        "Reduce risk exposure in your broker (trim, hedge or exit) until policy limits are back inside range.",
      capitalImpact: "Decrease deployed risk capital and preserve cash optionality.",
      riskImpact: "Immediate downward pressure on drawdown and concentration risk.",
      expectedOutcomeWindow: "Same day to 3 market days",
    };
  }

  if (category === "DISCIPLINE") {
    return {
      category,
      brokerInstruction:
        actionInstruction ||
        "Validate execution details in your broker (ticket, fees, slippage), save proof, and close the day.",
      capitalImpact: "No direct market exposure change.",
      riskImpact: "Improves execution reliability and prevents process drift.",
      expectedOutcomeWindow: "Immediate; reflected within 1-3 cycles",
    };
  }

  return {
    category: "PREPARE",
    brokerInstruction:
      actionInstruction ||
      "Do not open new risk now. Prepare broker watchlist, alerts and staged orders for the next evaluation.",
    capitalImpact: "Keep current capital allocation unchanged and preserve optionality.",
    riskImpact: "Maintains risk posture while Syntrake re-evaluates conditions.",
    expectedOutcomeWindow: "Next evaluation cycle (4-24h)",
  };
}

function nearDataReason(reasons: string[]) {
  const joined = reasons.join(" ").toLowerCase();
  return (
    joined.includes("pricing") ||
    joined.includes("data") ||
    joined.includes("coverage") ||
    joined.includes("symbol")
  );
}

export function computeKillSwitchState(args: {
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  riskPolicyEval: RiskPolicyEvaluation;
  actionGate: ActionGateLike;
}): KillSwitchState {
  const gateStatus = normalizeGateStatus(args.actionGate.status);
  const reasons = Array.isArray(args.actionGate.reasons) ? args.actionGate.reasons.map((x) => String(x)) : [];
  const breach = (args.riskPolicyEval.breaches || [])[0];
  const breachKey = breach?.key ? String(breach.key) : null;

  if (args.doneToday) {
    return {
      active: false,
      state: "Monitoring",
      reason: "Day closed. Syntrake stays in monitoring mode until the next cycle.",
      trigger: null,
      allowNewRisk: false,
      releaseRule: "Wait for the next evaluation cycle.",
    };
  }

  if (!args.hasPlan || !args.hasHoldings) {
    return {
      active: true,
      state: "Waiting",
      reason: "Setup prerequisites are incomplete. New risk is paused.",
      trigger: "setup_incomplete",
      allowNewRisk: false,
      releaseRule: "Activate plan and load holdings.",
    };
  }

  if (args.riskPolicyEval.status === "block") {
    const protectingKeys = new Set([
      "single_position_limit",
      "top3_concentration_limit",
      "drawdown_limit",
      "exposure_limit",
      "high_severity_leak",
    ]);
    const state = breachKey && protectingKeys.has(breachKey) ? "Protecting" : "Waiting";
    return {
      active: true,
      state,
      reason: args.riskPolicyEval.reasons[0] || "Risk policy hard limit breached.",
      trigger: breachKey,
      allowNewRisk: false,
      releaseRule: "Bring all hard-limit breaches back inside policy.",
    };
  }

  if (gateStatus === "blocked") {
    return {
      active: true,
      state: nearDataReason(reasons) ? "Waiting" : "Protecting",
      reason: reasons[0] || "Execution gate blocked.",
      trigger: "action_gate_blocked",
      allowNewRisk: false,
      releaseRule: "Clear blocked execution gate before taking risk.",
    };
  }

  if (gateStatus === "caution" || args.riskPolicyEval.status === "warn") {
    return {
      active: false,
      state: "Monitoring",
      reason: "Caution regime active. Syntrake allows only reduced-risk actions.",
      trigger: "caution_mode",
      allowNewRisk: true,
      releaseRule: "Improve quality/proof to restore full risk bandwidth.",
    };
  }

  return {
    active: false,
    state: "Monitoring",
    reason: "Policy and gate are clear.",
    trigger: null,
    allowNewRisk: true,
    releaseRule: "Maintain execution quality and policy limits.",
  };
}

export function buildPreTradeSafetyCheck(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  riskPolicyEval: RiskPolicyEvaluation;
  actionGate: ActionGateLike;
  executionScore: ExecutionScoreLike | null;
  executionEvidence: ExecutionEvidenceLike | null;
}): PreTradeSafetyCheck {
  const required = !args.doneToday && args.hasPlan && args.hasHoldings;
  if (!required) {
    return {
      required: false,
      status: "not_required",
      reason: "Pre-trade check activates only when plan + holdings are active and day is open.",
      checks: {
        policyClear: true,
        qualityOk: true,
        proofDepthOk: true,
        validationOk: true,
        checklistOk: true,
        gateClear: true,
      },
      riskEscalationBlocked: false,
      requiredProofDays7: 0,
      nextStep: "No pre-trade check required.",
    };
  }

  const gateStatus = normalizeGateStatus(args.actionGate.status);
  const policyClear = args.riskPolicyEval.status !== "block";
  const qualityOk = n(args.actionGate.coveragePct, 0) >= 70;
  const gateClear = gateStatus !== "blocked";

  const requiredProofDays7 = args.mode === "investing" ? 1 : 2;
  const strongProofDays7 = n(args.executionEvidence?.strongProofDays7, 0);
  const proofDepthOk = strongProofDays7 >= requiredProofDays7;

  const validationFloor = args.mode === "investing" ? 50 : 65;
  const checklistFloor = args.mode === "investing" ? 50 : 70;
  const validationOk = n(args.executionScore?.validationPct, 0) >= validationFloor;
  const checklistOk = n(args.executionScore?.checklistPct, 0) >= checklistFloor;

  const hardBlocked = !(policyClear && qualityOk && gateClear);
  const softBlocked = !(proofDepthOk && validationOk && checklistOk);
  const blocked =
    args.mode === "investing"
      ? !(policyClear && qualityOk && gateClear && proofDepthOk && validationOk && checklistOk)
      : hardBlocked;
  const status: PreTradeSafetyCheck["status"] =
    blocked ? "blocked" : softBlocked ? "caution" : "passed";
  const riskEscalationBlocked = blocked || softBlocked;

  let reason = "Pre-trade safety check passed.";
  let nextStep = "Proceed with disciplined execution.";
  if (!policyClear) {
    reason = args.riskPolicyEval.reasons[0] || "Policy hard limit active.";
    nextStep = "Clear risk policy breaches before any execution.";
  } else if (!qualityOk) {
    reason = "Data quality below pre-trade floor.";
    nextStep = "Improve pricing coverage before executing.";
  } else if (!gateClear) {
    reason = "Action gate is blocked.";
    nextStep = "Resolve gate blocker before execution.";
  } else if (!proofDepthOk) {
    reason = `Insufficient strong proof days (${strongProofDays7}/${requiredProofDays7}) for this mode.`;
    nextStep =
      args.mode === "investing"
        ? "Capture stronger execution proof before executing."
        : "Trade only reduced size until stronger execution proof is rebuilt.";
  } else if (!validationOk || !checklistOk) {
    reason = "Execution discipline below required threshold.";
    nextStep =
      args.mode === "investing"
        ? "Improve validation/checklist quality before executing."
        : "Trade only reduced size with full checklist discipline until quality recovers.";
  }

  return {
    required: true,
    status,
    reason,
    checks: {
      policyClear,
      qualityOk,
      proofDepthOk,
      validationOk,
      checklistOk,
      gateClear,
    },
    riskEscalationBlocked,
    requiredProofDays7,
    nextStep,
  };
}

export function enforceActionGateWithPreTrade(args: {
  actionGate: ActionGateLike;
  preTrade: PreTradeSafetyCheck;
}): ActionGateLike {
  const gate = { ...args.actionGate };
  if (!args.preTrade.required || args.preTrade.status === "passed") return gate;
  const reasons = Array.isArray(gate.reasons) ? [...gate.reasons] : [];
  if (args.preTrade.status === "caution") {
    return {
      ...gate,
      status: gate.status === "blocked" ? "blocked" : "caution",
      allowExecution: gate.status === "blocked" ? false : true,
      confidencePct: Math.max(55, Math.min(n(gate.confidencePct, 66), 76)),
      reasons: [args.preTrade.reason, ...reasons].slice(0, 3),
      nextStep: args.preTrade.nextStep,
      ctaLabel: "Run safety check",
      ctaAction: "run_checklist",
      ctaHref: gate.ctaHref ?? null,
    };
  }
  return {
    ...gate,
    status: "blocked",
    allowExecution: false,
    confidencePct: Math.max(35, Math.min(n(gate.confidencePct, 42), 55)),
    reasons: [args.preTrade.reason, ...reasons].slice(0, 3),
    nextStep: args.preTrade.nextStep,
    ctaLabel: "Run safety check",
    ctaAction: "run_checklist",
  };
}

export function computeRiskEnvelope(args: {
  mode: AutopilotMode;
  riskPolicy: RiskPolicy;
  riskPolicyEval: RiskPolicyEvaluation;
  actionGate: ActionGateLike;
  executionScore: ExecutionScoreLike | null;
  executionEvidence: ExecutionEvidenceLike | null;
  killSwitch: KillSwitchState;
}): RiskEnvelope {
  const gateStatus = normalizeGateStatus(args.actionGate.status);
  const confidence = clamp(n(args.actionGate.confidencePct, 50), 0, 100);
  const pressure = clamp(n(args.actionGate.pressureScore, 60), 0, 100);
  const execScore = clamp(n(args.executionScore?.score, 60), 0, 100);
  const proofQuality = clamp(n(args.executionEvidence?.avgQuality14, 60), 0, 100);

  const confidenceWeight = round(confidence / 100);
  const executionWeight = round(((execScore + proofQuality) / 2) / 100);
  const pressureWeight = round((100 - pressure) / 100);
  const gateWeight = gateStatus === "ready" ? 1 : gateStatus === "caution" ? 0.72 : 0.2;
  const policyWeight = args.riskPolicyEval.status === "pass" ? 1 : args.riskPolicyEval.status === "warn" ? 0.8 : 0.2;
  const killWeight = args.killSwitch.active ? 0 : 1;

  const rawDeploy = args.riskPolicy.maxExposurePct * confidenceWeight * executionWeight * pressureWeight * gateWeight * policyWeight * killWeight;
  const maxDeployPct = clamp(round(rawDeploy), 0, args.riskPolicy.maxExposurePct);
  const maxPositionPct = clamp(
    round(Math.min(args.riskPolicy.maxSinglePositionPct, maxDeployPct * (0.42 + confidenceWeight * 0.58))),
    0,
    args.riskPolicy.maxSinglePositionPct
  );
  const expectedDrawdownBudgetPct = clamp(
    round(args.riskPolicy.maxDrawdownPct * executionWeight * policyWeight),
    1,
    args.riskPolicy.maxDrawdownPct
  );

  const blocked = args.killSwitch.active || gateStatus === "blocked" || args.riskPolicyEval.status === "block";
  const constrained = !blocked && (gateStatus === "caution" || args.riskPolicyEval.status === "warn" || pressure >= 65);
  const status: RiskEnvelope["status"] = blocked ? "blocked" : constrained ? "constrained" : "active";
  const riskClass: RiskEnvelope["riskClass"] =
    status === "blocked" ? "Locked" : pressure >= 70 ? "High" : pressure >= 45 ? "Moderate" : "Low";

  const recommendation =
    status === "blocked"
      ? "No new risk until safety checks and policy limits are clear."
      : status === "constrained"
        ? "Use reduced size and strict proof capture before scaling."
        : "Standard risk sizing allowed under current policy.";

  return {
    status,
    riskClass,
    maxDeployPct,
    maxPositionPct,
    expectedDrawdownBudgetPct,
    confidenceWeight,
    executionWeight,
    pressureWeight,
    recommendation,
  };
}

export function buildOpportunityQueue(args: {
  opportunities: CandidateLike[];
  executionScore: ExecutionScoreLike | null;
  riskPolicyEval: RiskPolicyEvaluation;
  actionGate: ActionGateLike;
  killSwitch: KillSwitchState;
  asOf: string;
}): OpportunityQueue {
  const gateStatus = normalizeGateStatus(args.actionGate.status);
  const execScore = clamp(n(args.executionScore?.score, 60), 0, 100);

  const riskByType: Record<string, number> = {
    fix_pricing: 10,
    reduce_concentration: 28,
    reduce_cash_drag: 22,
    hold: 5,
  };
  const effortByType: Record<string, number> = {
    fix_pricing: 70,
    reduce_concentration: 55,
    reduce_cash_drag: 42,
    hold: 12,
  };

  const items = (args.opportunities || [])
    .map((item, idx): OpportunityQueueItem => {
      const type = String(item?.type || "hold").trim().toLowerCase();
      const impactScore = clamp(n(item?.score, n(item?.confidence, 60)), 0, 100);
      const confidence = clamp(n(item?.confidence, 60), 0, 100);
      const riskScore = clamp(riskByType[type] ?? 25, 0, 100);
      const effortScore = clamp(effortByType[type] ?? 50, 0, 100);
      const policyPenalty = args.riskPolicyEval.status === "block" ? 15 : args.riskPolicyEval.status === "warn" ? 8 : 0;
      const gatePenalty = gateStatus === "blocked" ? 20 : gateStatus === "caution" ? 10 : 0;
      const killPenalty = args.killSwitch.active ? 18 : 0;
      const priority = clamp(
        Math.round(
          impactScore * 0.55 +
            confidence * 0.22 +
            (100 - riskScore) * 0.14 +
            (100 - effortScore) * 0.09 +
            (execScore / 100) * 8 -
            policyPenalty -
            gatePenalty -
            killPenalty
        ),
        0,
        100
      );
      return {
        id: String(item?.id || `op-${idx + 1}`),
        type,
        title: String(item?.title || "Opportunity"),
        priority,
        impactScore,
        riskScore,
        effortScore,
        rationale: String(item?.rationale || item?.impact || "Prioritized by impact, risk and execution readiness."),
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  return {
    generatedAt: args.asOf,
    topPriority: items[0]?.priority ?? 0,
    items,
  };
}

export function buildCashDeploymentPolicy(args: {
  hasPlan: boolean;
  hasHoldings: boolean;
  regime: string | null | undefined;
  posture: string | null | undefined;
  killSwitch: KillSwitchState;
  riskEnvelope: RiskEnvelope;
}): CashDeploymentPolicy {
  if (!args.hasPlan || !args.hasHoldings) {
    return {
      mode: "disabled",
      capDeployPct: 0,
      rationale: "Cash deployment is disabled until plan and holdings are active.",
      regime: String(args.regime || "unknown"),
    };
  }
  if (args.killSwitch.active || args.riskEnvelope.status === "blocked") {
    return {
      mode: "defensive_hold",
      capDeployPct: 0,
      rationale: "Kill-switch active. Hold cash and protect capital first.",
      regime: String(args.regime || "unknown"),
    };
  }

  const regime = String(args.regime || "neutral").toLowerCase();
  const posture = String(args.posture || "").toLowerCase();
  const defensive = posture.includes("defensive") || posture.includes("caution") || posture.includes("survival");

  if (defensive || regime.includes("risk_off") || regime.includes("data_limited")) {
    return {
      mode: "defensive_hold",
      capDeployPct: Math.min(5, args.riskEnvelope.maxDeployPct),
      rationale: "Defensive regime. Preserve optionality and deploy only minimal cash.",
      regime,
    };
  }
  if (regime.includes("risk_on")) {
    return {
      mode: "opportunity_deploy",
      capDeployPct: Math.min(35, args.riskEnvelope.maxDeployPct),
      rationale: "Risk-on conditions with policy-clear status support controlled deployment.",
      regime,
    };
  }
  return {
    mode: "measured_deploy",
    capDeployPct: Math.min(22, args.riskEnvelope.maxDeployPct),
    rationale: "Neutral regime. Deploy cash gradually with discipline.",
    regime,
  };
}

export function computeGrowthReadiness(args: {
  planAlignment: string | null | undefined;
  pressureScore: number | null | undefined;
  riskPolicyEval: RiskPolicyEvaluation;
  executionScore: ExecutionScoreLike | null;
  streak: number;
}): GrowthReadiness {
  const alignmentRaw = String(args.planAlignment || "").trim().toUpperCase();
  const alignment = alignmentRaw === "HIGH" ? 90 : alignmentRaw === "OK" ? 72 : 45;
  const riskBase = args.riskPolicyEval.status === "pass" ? 88 : args.riskPolicyEval.status === "warn" ? 66 : 34;
  const riskPenalty = clamp(n(args.pressureScore, 55) * 0.32, 0, 30);
  const risk = clamp(Math.round(riskBase - riskPenalty), 0, 100);
  const consistency = clamp(Math.round((Math.min(Math.max(args.streak || 0, 0), 7) / 7) * 100), 0, 100);
  const execution = clamp(n(args.executionScore?.score, 55), 0, 100);
  const score = clamp(Math.round(alignment * 0.32 + risk * 0.28 + consistency * 0.2 + execution * 0.2), 0, 100);
  const tier: GrowthReadiness["tier"] =
    score >= 80 ? "Scaling" : score >= 68 ? "Ready" : score >= 52 ? "Building" : "Not ready";
  const nextFocus =
    tier === "Scaling"
      ? "Maintain discipline while deploying only inside the envelope."
      : tier === "Ready"
        ? "Convert readiness into consistent execution without forcing risk."
        : tier === "Building"
          ? "Improve alignment and execution quality before increasing exposure."
          : "Stabilize risk and execution proof before growth actions.";

  return {
    score,
    tier,
    components: { alignment, risk, consistency, execution },
    nextFocus,
  };
}

export function computeWeeklyValueMetrics(args: {
  blockedDays7: number;
  cautionDays7: number;
  riskPressureDelta1: number | null | undefined;
  executionScore: ExecutionScoreLike | null;
}): WeeklyValueMetrics {
  const riskDelta = n(args.riskPressureDelta1, 0);
  const riskAvoidedPoints = Math.max(
    0,
    Math.round(args.blockedDays7 * 3 + args.cautionDays7 * 1.5 + Math.max(0, -riskDelta))
  );
  const validationPct = clamp(n(args.executionScore?.validationPct, 0), 0, 100);
  const disciplinePct = clamp(n(args.executionScore?.disciplinePct, 0), 0, 100);
  const errorsAvoidedEstimate = Math.max(0, Math.round((validationPct / 100) * 6 + (disciplinePct / 100) * 4));
  const disciplineUpPct = Math.round(disciplinePct - 50);
  const summary =
    riskAvoidedPoints > 0
      ? "Risk containment and execution discipline improved this week."
      : "Weekly discipline is stable; continue consistent execution proof.";

  return {
    riskAvoidedPoints,
    errorsAvoidedEstimate,
    disciplineUpPct,
    summary,
  };
}

export function buildPriorityNotifications(args: {
  killSwitch: KillSwitchState;
  preTrade: PreTradeSafetyCheck;
  weeklyValue: WeeklyValueMetrics;
  growthReadiness: GrowthReadiness;
}): PriorityNotification[] {
  const out: PriorityNotification[] = [];
  if (args.killSwitch.active) {
    out.push({
      id: "kill_switch",
      priority: "high",
      title: `Kill-switch: ${args.killSwitch.state}`,
      detail: args.killSwitch.reason,
    });
  }
  if (args.preTrade.required && args.preTrade.status !== "passed") {
    out.push({
      id: "pretrade_block",
      priority: args.preTrade.status === "blocked" ? "high" : "medium",
      title: args.preTrade.status === "blocked" ? "Pre-trade safety check blocked" : "Pre-trade safety check on caution",
      detail: args.preTrade.reason,
    });
  }
  if (args.growthReadiness.score < 60) {
    out.push({
      id: "growth_readiness_low",
      priority: "medium",
      title: "Growth readiness below target",
      detail: args.growthReadiness.nextFocus,
    });
  }
  out.push({
    id: "weekly_value",
    priority: "low",
    title: "Weekly value summary",
    detail: args.weeklyValue.summary,
  });
  return out.slice(0, 4);
}

export function computePreExecutionSimulation(args: {
  pressureScore: number;
  riskEnvelope: RiskEnvelope;
  growthReadiness: GrowthReadiness;
  riskPolicyEval: RiskPolicyEvaluation;
}): PreExecutionSimulation {
  const pressure = clamp(n(args.pressureScore, 55), 0, 100);
  const envelopeTight = args.riskEnvelope.status !== "active";
  const policyPenalty = args.riskPolicyEval.status === "block" ? 6 : args.riskPolicyEval.status === "warn" ? 3 : 0;
  const growthBoost = args.growthReadiness.score >= 75 ? 2 : args.growthReadiness.score >= 60 ? 1 : 0;

  const defensiveRiskDelta = -Math.max(2, Math.round((pressure / 100) * 5));
  const baseRiskDelta = envelopeTight ? -1 : 0;
  const acceleratedRiskDelta = Math.max(1, Math.round((pressure / 100) * 4) + policyPenalty);

  return {
    defensive: {
      label: "Defensive path",
      riskDelta: defensiveRiskDelta,
      alignmentDelta: 1,
      note: "Lower risk pressure, slower capital deployment.",
    },
    base: {
      label: "Base path",
      riskDelta: baseRiskDelta,
      alignmentDelta: growthBoost,
      note: "Maintain current envelope and consistency.",
    },
    accelerated: {
      label: "Accelerated path",
      riskDelta: acceleratedRiskDelta,
      alignmentDelta: Math.max(-2, growthBoost - policyPenalty),
      note: "Higher speed with tighter guardrail sensitivity.",
    },
  };
}

export function computeDecisionSourceTransparency(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  hasExecutionEvidence: boolean;
  snapshotsCount: number;
}): {
  headline: string;
  sources: string[];
  trustLine: string;
} {
  const sources = [
    "Finnhub market data",
    "TwelveData market data",
    args.hasPlan ? "Active plan constraints" : "Plan constraints (missing)",
    args.hasHoldings ? "Portfolio holdings" : "Portfolio holdings (missing)",
    args.hasExecutionEvidence ? "Execution proof history" : "Execution proof history (building)",
    args.snapshotsCount > 0 ? "Daily snapshots timeline" : "Daily snapshots timeline (building)",
  ];
  const trustLine =
    "Decisions are computed from live market inputs plus your plan, holdings and execution history. No text-only static script.";
  return {
    headline: `Decision sources (${args.mode})`,
    sources,
    trustLine,
  };
}

export function computeAntiChurnState(args: {
  doneToday: boolean;
  streak: number;
  executionScore: ExecutionScoreLike | null;
  weeklyValue: WeeklyValueMetrics;
  growthReadiness: GrowthReadiness;
  killSwitch: KillSwitchState;
  preTrade: PreTradeSafetyCheck;
  actionGate: ActionGateLike;
  continuitySignals?: Record<string, any> | null;
}): AntiChurnState {
  let score = 100;
  const triggers: string[] = [];
  const interventions: AntiChurnIntervention[] = [];

  const streak = Math.max(0, Math.round(n(args.streak, 0)));
  const execution = clamp(n(args.executionScore?.score, 0), 0, 100);
  const validation = clamp(n(args.executionScore?.validationPct, 0), 0, 100);
  const discipline = clamp(n(args.executionScore?.disciplinePct, 0), 0, 100);
  const gateStatus = normalizeGateStatus(args.actionGate.status);
  const continuityDir = String((args.continuitySignals as any)?.directionalState || "")
    .trim()
    .toUpperCase();

  if (!args.doneToday) {
    score -= 18;
    triggers.push("day_open_unclosed");
    interventions.push({
      id: "close_day",
      priority: "high",
      title: "Close the daily cycle",
      detail: "Complete Save and close-day proof to keep progression continuity active.",
    });
  }

  if (streak < 2) {
    score -= 16;
    triggers.push("streak_low");
    interventions.push({
      id: "streak_bootstrap",
      priority: "high",
      title: "Rebuild execution streak",
      detail: "Aim for 2 consecutive completed cycles to restore momentum.",
    });
  } else if (streak < 5) {
    score -= 8;
    triggers.push("streak_building");
  }

  if (validation < 65) {
    score -= 14;
    triggers.push("validation_low");
    interventions.push({
      id: "validation_quality",
      priority: "high",
      title: "Increase validation quality",
      detail: "Log broker reference and proof fields before closing the day.",
    });
  }

  if (discipline < 60 || execution < 60) {
    score -= 12;
    triggers.push("discipline_low");
    interventions.push({
      id: "discipline_routine",
      priority: "medium",
      title: "Stabilize routine",
      detail: "Keep one focused execution cycle per day and avoid random actions.",
    });
  }

  if (args.weeklyValue.riskAvoidedPoints <= 0) {
    score -= 8;
    triggers.push("no_weekly_value");
  }

  if (args.growthReadiness.score < 55) {
    score -= 10;
    triggers.push("growth_readiness_low");
    interventions.push({
      id: "growth_readiness",
      priority: "medium",
      title: "Improve growth readiness",
      detail: args.growthReadiness.nextFocus,
    });
  }

  if (args.killSwitch.active) {
    score -= 14;
    triggers.push("kill_switch_active");
    interventions.push({
      id: "protection_recovery",
      priority: "high",
      title: `Protection state: ${args.killSwitch.state}`,
      detail: "Clear protection blockers before attempting risk escalation.",
    });
  }

  if (args.preTrade.required && args.preTrade.status === "blocked") {
    score -= 10;
    triggers.push("pretrade_blocked");
    interventions.push({
      id: "pretrade_recovery",
      priority: "high",
      title: "Pre-trade blocked",
      detail: args.preTrade.nextStep || "Resolve pre-trade requirements before execution.",
    });
  }

  if (gateStatus === "blocked") {
    score -= 10;
    triggers.push("gate_blocked");
  } else if (gateStatus === "caution") {
    score -= 5;
    triggers.push("gate_caution");
  }

  if (continuityDir === "WORSENING") {
    score -= 6;
    triggers.push("continuity_worsening");
  }

  score = clamp(Math.round(score), 0, 100);
  const riskLevel: AntiChurnState["riskLevel"] = score < 45 ? "high" : score < 70 ? "medium" : "low";
  const dedup = new Set<string>();
  const dedupedInterventions = interventions.filter((item) => {
    if (dedup.has(item.id)) return false;
    dedup.add(item.id);
    return true;
  });

  if (dedupedInterventions.length === 0) {
    dedupedInterventions.push({
      id: "maintain_discipline",
      priority: "low",
      title: "Keep consistency",
      detail: "Retention is healthy. Keep the same daily proof discipline.",
    });
  }

  const message =
    riskLevel === "high"
      ? "Retention risk elevated. Syntrake intervention is active to recover discipline."
      : riskLevel === "medium"
        ? "Retention risk moderate. Keep continuity and proof quality to avoid drift."
        : "Retention risk low. Continue the daily loop to compound process quality.";

  return {
    score,
    riskLevel,
    triggers: triggers.slice(0, 6),
    interventions: dedupedInterventions.slice(0, 4),
    message,
    nextCheckHours: riskLevel === "high" ? 6 : riskLevel === "medium" ? 12 : 24,
  };
}

export function buildWeeklyPremiumReport(args: {
  asOf: string;
  mode: AutopilotMode;
  weeklyValue: WeeklyValueMetrics;
  growthReadiness: GrowthReadiness;
  executionScore: ExecutionScoreLike | null;
  riskEnvelope: RiskEnvelope;
  killSwitch: KillSwitchState;
  streak: number;
  topLeakTitle?: string | null;
  decisionSources?: { trustLine?: string | null } | null;
}): WeeklyPremiumReport {
  const now = new Date(args.asOf);
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const start = new Date(nowMs - 6 * 24 * 60 * 60 * 1000);
  const periodLabel = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(start.getUTCDate()).padStart(2, "0")} to ${new Date(nowMs).getUTCFullYear()}-${String(new Date(nowMs).getUTCMonth() + 1).padStart(2, "0")}-${String(new Date(nowMs).getUTCDate()).padStart(2, "0")}`;
  const executionScore = clamp(n(args.executionScore?.score, 0), 0, 100);
  const streakDays = Math.max(0, Math.round(n(args.streak, 0)));

  const highlights: string[] = [
    `Risk avoided: ${Math.round(args.weeklyValue.riskAvoidedPoints)} pts`,
    `Execution discipline delta: ${Math.round(args.weeklyValue.disciplineUpPct)}%`,
    `Growth readiness: ${Math.round(args.growthReadiness.score)}/100 (${args.growthReadiness.tier})`,
  ];
  if (args.topLeakTitle) highlights.push(`Primary limiter this week: ${String(args.topLeakTitle).trim()}`);

  const focusNextWeek: string[] = [];
  focusNextWeek.push(args.growthReadiness.nextFocus);
  if (args.riskEnvelope.status !== "active") {
    focusNextWeek.push("Stay inside constrained sizing envelope until pressure normalizes.");
  }
  if (args.killSwitch.active) {
    focusNextWeek.push("Clear protection-mode blockers before any risk escalation.");
  }
  if (executionScore < 70) {
    focusNextWeek.push("Increase proof completeness to improve execution quality.");
  }

  const summary =
    args.killSwitch.active
      ? "Protection-first week: Syntrake prioritized capital safety and execution discipline."
      : args.growthReadiness.score >= 70
        ? "Constructive week: strategy readiness and discipline support controlled growth."
        : "Calibration week: process quality is improving, with focus on readiness and consistency.";

  return {
    generatedAt: new Date(nowMs).toISOString(),
    periodLabel,
    summary,
    highlights: highlights.slice(0, 4),
    focusNextWeek: focusNextWeek.slice(0, 4),
    metrics: {
      growthReadiness: Math.round(args.growthReadiness.score),
      executionScore: Math.round(executionScore),
      riskAvoidedPoints: Math.round(args.weeklyValue.riskAvoidedPoints),
      errorsAvoidedEstimate: Math.round(args.weeklyValue.errorsAvoidedEstimate),
      disciplineUpPct: Math.round(args.weeklyValue.disciplineUpPct),
      streakDays,
      envelopeStatus: args.riskEnvelope.status,
      protectionState: args.killSwitch.state,
    },
    trustLine:
      String(args.decisionSources?.trustLine || "").trim() ||
      "Weekly report is generated from market data, plan constraints, holdings and execution evidence.",
  };
}

export function isRiskEscalationAction(actionType: unknown) {
  const t = normalizeActionType(actionType);
  return t === "ADD" || t === "ENTER" || t === "EXECUTE_BROKER" || t === "DEPLOY_CASH";
}

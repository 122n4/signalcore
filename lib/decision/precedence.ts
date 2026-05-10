import type { CapitalProtectionOutput } from "@/lib/engine/capitalProtection";
import type { RiskPolicyEvaluation } from "@/lib/signalcore/riskPolicy";
import type {
  DecisionBlocker,
  DecisionEnvelopeBranch,
  DecisionPrecedenceOverride,
  DecisionSeverity,
  ExecutionInstruction,
  PortfolioStance,
} from "./types";

export type DecisionActionGateInput = {
  status: string | null;
  allowExecution: boolean | null;
  reasons: string[];
  nextStep: string | null;
  topLeakKey: string | null;
  topLeakSeverity: string | null;
};

export type DecisionTopLeakInput = {
  key: string | null;
  title: string | null;
  severity: string | null;
};

export type ResolveDecisionPrecedenceInput = {
  branch: DecisionEnvelopeBranch;
  branchReason: string | null;
  portfolioStance: PortfolioStance | null;
  executionInstruction: ExecutionInstruction | null;
  actionGate: DecisionActionGateInput | null;
  riskPolicyEval: RiskPolicyEvaluation | null;
  capitalProtection: CapitalProtectionOutput | null;
  topLeak: DecisionTopLeakInput | null;
  dataQualityBlocked: boolean;
  dataQualityReason: string | null;
};

export type ResolveDecisionPrecedenceOutput = {
  portfolioStance: PortfolioStance;
  executionInstruction: ExecutionInstruction;
  blockers: DecisionBlocker[];
  override: DecisionPrecedenceOverride;
  allowExecution: boolean;
};

function normalizeSeverity(value: unknown): DecisionSeverity {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "high") return "high";
  if (s === "medium" || s === "med" || s === "caution") return "medium";
  return "low";
}

function formatBranchLabel(branch: DecisionEnvelopeBranch) {
  switch (branch) {
    case "plan_load_fallback":
      return "Plan load fallback";
    case "holdings_load_fallback":
      return "Holdings load fallback";
    case "fatal_fallback":
      return "Fatal fallback";
    default:
      return "Success";
  }
}

function joinUniqueText(parts: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const text = String(part || "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.join(" ").trim();
}

function synthesizePortfolioStance(reasonCode: string): PortfolioStance {
  return {
    asset: null,
    decision: "HOLD",
    legacyActionType: "HOLD",
    confidencePct: null,
    expectedMovePct: null,
    expectedValue: null,
    recommendedPositionPct: null,
    score: null,
    regime: null,
    riskLevel: null,
    reasonCodes: [reasonCode],
    source: "synthetic",
  };
}

function synthesizeExecutionInstruction(
  reasonCode: string,
  allowExecution: boolean,
  source: ExecutionInstruction["source"],
): ExecutionInstruction {
  const text = allowExecution
    ? "Review current conditions before executing any capital change."
    : "Do not execute new capital changes until the blocking conditions clear.";

  return {
    category: "PREPARE",
    brokerInstruction: text,
    capitalImpact: allowExecution ? "No capital change until reviewed." : "Capital deployment blocked.",
    riskImpact: allowExecution ? "Risk remains unchanged while waiting." : "Risk escalation is prevented.",
    expectedOutcomeWindow: "Next evaluation window",
    allowExecution,
    source,
    derivedFromWorkflowType: null,
  };
}

function buildFallbackBlocker(input: ResolveDecisionPrecedenceInput): DecisionBlocker {
  const branchLabel = formatBranchLabel(input.branch);
  return {
    layer: "fallback",
    code: input.branch,
    title: branchLabel,
    detail: String(input.branchReason || "Decision envelope was composed from a fallback route branch."),
    severity: input.branch === "fatal_fallback" ? "high" : "medium",
    status: "block",
    haltsExecution: true,
    reasonCodes: [input.branch],
  };
}

function buildRiskPolicyBlocker(riskPolicyEval: RiskPolicyEvaluation): DecisionBlocker {
  const firstBreach = riskPolicyEval.breaches[0];

  return {
    layer: "risk_policy",
    code: firstBreach?.key || "risk_policy_blocked",
    title: "Risk policy blocked execution",
    detail:
      joinUniqueText([riskPolicyEval.reasons[0], firstBreach?.message, riskPolicyEval.nextStep]) ||
      "Risk policy evaluation blocked new execution.",
    severity: "high",
    status: "block",
    haltsExecution: true,
    reasonCodes: riskPolicyEval.breaches.map((breach) => breach.key),
  };
}

function buildActionGateBlocker(
  actionGate: DecisionActionGateInput,
  topLeak: DecisionTopLeakInput | null,
): DecisionBlocker {
  const severity = normalizeSeverity(actionGate.topLeakSeverity || topLeak?.severity || null);

  return {
    layer: "action_gate",
    code: actionGate.topLeakKey || topLeak?.key || "action_gate_blocked",
    title: "Action gate blocked execution",
    detail:
      joinUniqueText([actionGate.reasons[0], topLeak?.title, actionGate.nextStep]) ||
      "Action gate blocked execution until current issues are resolved.",
    severity,
    status: "block",
    haltsExecution: true,
    reasonCodes: actionGate.reasons.length ? [...actionGate.reasons] : ["action_gate_blocked"],
  };
}

function buildDataQualityBlocker(
  detail: string | null,
  topLeak: DecisionTopLeakInput | null,
): DecisionBlocker {
  return {
    layer: "data_quality",
    code: topLeak?.key || "data_quality_blocked",
    title: "Data quality blocked execution",
    detail:
      String(detail || topLeak?.title || "").trim() ||
      "Pricing or valuation quality is not strong enough for safe execution.",
    severity: normalizeSeverity(topLeak?.severity || "high"),
    status: "block",
    haltsExecution: true,
    reasonCodes: topLeak?.key ? [topLeak.key] : ["data_quality_blocked"],
  };
}

function buildCapitalProtectionBlocker(capitalProtection: CapitalProtectionOutput): DecisionBlocker {
  return {
    layer: "capital_protection",
    code: capitalProtection.restrict_aggressive_entries ? "restrict_aggressive_entries" : "capital_protection_active",
    title: "Capital protection is active",
    detail:
      capitalProtection.reasons[0] ||
      "Capital protection reduced the acceptable aggression for the current capital posture.",
    severity: "medium",
    status: "warn",
    haltsExecution: false,
    reasonCodes: capitalProtection.reasons.length ? [...capitalProtection.reasons] : ["capital_protection_active"],
  };
}

export function resolveDecisionPrecedence(
  input: ResolveDecisionPrecedenceInput,
): ResolveDecisionPrecedenceOutput {
  const branchFallback = input.branch !== "success";
  const riskBlocked =
    input.riskPolicyEval?.blocked === true ||
    String(input.riskPolicyEval?.status || "").trim().toLowerCase() === "block";
  const dataQualityBlocked = input.dataQualityBlocked === true;
  const gateBlocked =
    String(input.actionGate?.status || "").trim().toLowerCase() === "blocked" ||
    input.actionGate?.allowExecution === false;
  const protectionActive = input.capitalProtection?.protection_mode === true;

  const blockers: DecisionBlocker[] = [];

  if (branchFallback) blockers.push(buildFallbackBlocker(input));
  if (riskBlocked && input.riskPolicyEval) blockers.push(buildRiskPolicyBlocker(input.riskPolicyEval));
  if (dataQualityBlocked) blockers.push(buildDataQualityBlocker(input.dataQualityReason, input.topLeak));
  if (gateBlocked && input.actionGate) blockers.push(buildActionGateBlocker(input.actionGate, input.topLeak));
  if (protectionActive && input.capitalProtection) blockers.push(buildCapitalProtectionBlocker(input.capitalProtection));

  const override: DecisionPrecedenceOverride = branchFallback
    ? "fallback"
      : riskBlocked
        ? "risk_policy"
        : dataQualityBlocked
          ? "data_quality"
        : gateBlocked
          ? "action_gate"
        : protectionActive
          ? "capital_protection"
          : "none";

  const allowExecution =
    branchFallback || riskBlocked || dataQualityBlocked || gateBlocked
      ? false
      : input.executionInstruction?.allowExecution ?? true;

  const portfolioStance = input.portfolioStance ?? synthesizePortfolioStance("portfolio_stance_missing");
  const executionInstruction = input.executionInstruction
    ? { ...input.executionInstruction, allowExecution }
    : synthesizeExecutionInstruction(
        "execution_instruction_missing",
        allowExecution,
        branchFallback ? "fallback" : "synthetic",
      );

  return {
    portfolioStance,
    executionInstruction,
    blockers,
    override,
    allowExecution,
  };
}

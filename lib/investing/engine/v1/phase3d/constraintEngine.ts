import type { CanonicalInvestingInputV1, InvestingConstraintEvaluationV1 } from "@/lib/investing/engine/v1/contracts";
import { DECIMAL_ZERO, decimalCompare, decimalIsPositive } from "@/lib/investing/engine/v1/phase3d/decimalMath";
import { findPolicyLimitV1 } from "@/lib/investing/engine/v1/phase3d/policyEngine";
import {
  CONSTRAINT_EVALUATION_CONTRACT_VERSION,
  type ConstraintEvaluationV1,
  type PolicyEvaluationV1,
  type PolicyLimitV1,
  type RiskAssessmentV1,
  type RiskMetricV1,
  type RiskPolicyEvaluationContextV1,
} from "@/lib/investing/engine/v1/phase3d/types";

const POLICY_DECLARATION_PREFIXES = new Set([
  "allow_instrument",
  "allowed_instrument",
  "prohibit_instrument",
  "prohibited_instrument",
  "suitability_instrument",
  "suitability_asset_class",
  "max_instrument_weight",
  "max_asset_class_weight",
  "max_currency_weight",
  "minimum_cash_weight",
  "maximum_total_exposure",
  "maximum_risk_score",
]);

function consequence(
  severity: ConstraintEvaluationV1["severity"],
  status: ConstraintEvaluationV1["status"],
): ConstraintEvaluationV1["consequence"] {
  if (severity === "informational") return "inform";
  if (status === "pass") return "allow";
  return severity === "hard" ? "block" : "degrade";
}

function evaluation(args: Omit<ConstraintEvaluationV1, "contractVersion" | "consequence">): ConstraintEvaluationV1 {
  return {
    contractVersion: CONSTRAINT_EVALUATION_CONTRACT_VERSION,
    ...args,
    consequence: consequence(args.severity, args.status),
  };
}

function compareMaximum(
  code: string,
  subject: string | null,
  observed: RiskMetricV1 | { status: "supported"; value: NonNullable<RiskMetricV1["value"]> },
  limit: PolicyLimitV1,
  explanation: string,
): ConstraintEvaluationV1 {
  const status = observed.status === "supported" && observed.value !== null
    ? decimalCompare(observed.value, limit.value) <= 0 ? "pass" : "fail"
    : "unknown";
  return evaluation({
    code,
    severity: limit.kind,
    status,
    observed: observed.value,
    allowedLimit: limit.value,
    source: limit.source,
    explanation,
    subject,
  });
}

function compareMinimum(
  code: string,
  observed: RiskMetricV1,
  limit: PolicyLimitV1,
  explanation: string,
): ConstraintEvaluationV1 {
  const status = observed.status === "supported" && observed.value !== null
    ? decimalCompare(observed.value, limit.value) >= 0 ? "pass" : "fail"
    : "unknown";
  return evaluation({
    code,
    severity: limit.kind,
    status,
    observed: observed.value,
    allowedLimit: limit.value,
    source: limit.source,
    explanation,
    subject: null,
  });
}

function inheritedMandateConstraint(
  input: CanonicalInvestingInputV1,
  constraint: InvestingConstraintEvaluationV1,
): ConstraintEvaluationV1 {
  return evaluation({
    code: `mandate_constraint:${constraint.id}`,
    severity: constraint.kind,
    status: constraint.status,
    observed: constraint.observed,
    allowedLimit: constraint.limit,
    source: `mandate:${input.mandate.mandateSnapshotId}`,
    explanation: `Authoritative mandate constraint ${constraint.reasonCode}`,
    subject: null,
  });
}

export function evaluateInvestingConstraintsV1(args: {
  input: CanonicalInvestingInputV1;
  context: RiskPolicyEvaluationContextV1;
  risk: RiskAssessmentV1;
  policy: PolicyEvaluationV1;
}): readonly ConstraintEvaluationV1[] {
  const { input, context, risk, policy } = args;
  const constraints: ConstraintEvaluationV1[] = [];

  const ownershipPass = input.userId === context.expectedUserId && input.accountId === context.expectedAccountId;
  constraints.push(evaluation({
    code: "authorization_ownership",
    severity: "hard",
    status: ownershipPass ? "pass" : "fail",
    observed: null,
    allowedLimit: null,
    source: "evaluation_context/v1",
    explanation: ownershipPass
      ? "Canonical owner and account match the evaluation context"
      : "Canonical owner or account differs from the evaluation context",
    subject: input.accountId,
  }));

  const paperPass = input.environment === "paper" && context.environment === "paper";
  constraints.push(evaluation({
    code: "environment_paper_only",
    severity: "hard",
    status: paperPass ? "pass" : "fail",
    observed: null,
    allowedLimit: null,
    source: `mandate:${input.mandate.mandateSnapshotId}`,
    explanation: paperPass ? "Paper-only policy is satisfied" : "Only Paper is permitted; simulation and Live are not feasible",
    subject: input.environment,
  }));

  constraints.push(evaluation({
    code: "canonical_data_quality",
    severity: input.quality.status === "degraded" ? "soft" : "hard",
    status: input.quality.status === "good" ? "pass" : input.quality.status === "degraded" ? "fail" : "unknown",
    observed: input.confidence.value,
    allowedLimit: null,
    source: `canonical_input:${input.inputHash}`,
    explanation: `Canonical input quality is ${input.quality.status}`,
    subject: null,
  }));

  constraints.push(evaluation({
    code: "risk_valuation_available",
    severity: "hard",
    status: risk.totalPortfolioValue.status === "supported" ? "pass" : "unknown",
    observed: risk.totalPortfolioValue.value,
    allowedLimit: null,
    source: `risk_assessment:${risk.assessmentHash}`,
    explanation: risk.totalPortfolioValue.status === "supported"
      ? "Projected valuation is supported by sealed market data"
      : "Projected valuation is incomplete; decisions are withheld",
    subject: null,
  }));

  for (const conflict of policy.conflicts) {
    constraints.push(evaluation({
      code: `policy_conflict:${conflict}`,
      severity: "hard",
      status: "conflict",
      observed: null,
      allowedLimit: null,
      source: `policy:${policy.policyHash}`,
      explanation: `Policy rules conflict: ${conflict}`,
      subject: null,
    }));
  }

  const prohibited = new Set(policy.prohibitedInstruments);
  const unsuitable = new Set(policy.unsuitableInstruments);
  const allowed = new Set(policy.allowedUniverse);
  for (const concentration of risk.instrumentConcentrations.filter((entry) => decimalIsPositive(entry.valueInBase))) {
    const symbol = concentration.subject;
    constraints.push(evaluation({
      code: `instrument_universe:${symbol}`,
      severity: "hard",
      status: allowed.has(symbol) ? "pass" : "fail",
      observed: concentration.weight,
      allowedLimit: null,
      source: `mandate:${input.mandate.mandateSnapshotId}`,
      explanation: allowed.has(symbol) ? `${symbol} belongs to the permitted universe` : `${symbol} is outside the permitted universe`,
      subject: symbol,
    }));
    if (prohibited.has(symbol)) {
      constraints.push(evaluation({
        code: `instrument_prohibited:${symbol}`,
        severity: "hard",
        status: "fail",
        observed: concentration.weight,
        allowedLimit: DECIMAL_ZERO,
        source: `mandate:${input.mandate.mandateSnapshotId}`,
        explanation: `${symbol} is explicitly prohibited by the mandate`,
        subject: symbol,
      }));
    }
    if (unsuitable.has(symbol)) {
      constraints.push(evaluation({
        code: `instrument_unsuitable:${symbol}`,
        severity: "hard",
        status: "fail",
        observed: concentration.weight,
        allowedLimit: DECIMAL_ZERO,
        source: `mandate:${input.mandate.mandateSnapshotId}`,
        explanation: `${symbol} violates an authoritative suitability rule`,
        subject: symbol,
      }));
    }
    const limit = findPolicyLimitV1(policy, "instrument", symbol);
    if (limit) constraints.push(compareMaximum(
      `maximum_instrument_weight:${symbol}`,
      symbol,
      { status: "supported", value: concentration.weight },
      limit,
      `${symbol} concentration must not exceed its mandate/policy limit`,
    ));
  }

  for (const concentration of risk.assetClassConcentrations) {
    const limit = findPolicyLimitV1(policy, "asset_class", concentration.subject);
    if (limit) constraints.push(compareMaximum(
      `maximum_asset_class_weight:${concentration.subject}`,
      concentration.subject,
      { status: "supported", value: concentration.weight },
      limit,
      `${concentration.subject} exposure must not exceed its mandate/policy limit`,
    ));
  }

  for (const exposure of risk.currencyExposures) {
    const specific = policy.limits.find((limit) => limit.scope === "currency" && limit.subject === exposure.subject);
    if (exposure.subject === input.mandate.baseCurrency && !specific) continue;
    const limit = specific ?? findPolicyLimitV1(policy, "currency", exposure.subject);
    if (limit) constraints.push(compareMaximum(
      `maximum_currency_weight:${exposure.subject}`,
      exposure.subject,
      { status: "supported", value: exposure.weight },
      limit,
      `${exposure.subject} exposure must not exceed its mandate/policy limit`,
    ));
  }

  const cashLimit = findPolicyLimitV1(policy, "cash", null);
  if (cashLimit) constraints.push(compareMinimum(
    "minimum_cash_weight",
    risk.cashWeight,
    cashLimit,
    "Projected cash weight must preserve the mandate/policy buffer",
  ));
  const exposureLimit = findPolicyLimitV1(policy, "total_exposure", null);
  if (exposureLimit) constraints.push(compareMaximum(
    "maximum_total_exposure",
    null,
    risk.totalExposure,
    exposureLimit,
    "Projected invested exposure must stay within the mandate/policy limit",
  ));
  const riskLimit = findPolicyLimitV1(policy, "risk_score", null);
  if (riskLimit) constraints.push(compareMaximum(
    "maximum_risk_score",
    null,
    risk.concentrationRiskScore,
    riskLimit,
    "Concentration risk score must stay within the mandate/policy limit",
  ));

  for (const mandateConstraint of input.mandate.constraints) {
    const prefix = mandateConstraint.id.split(":")[0];
    if (mandateConstraint.id === "paper_environment_only" || POLICY_DECLARATION_PREFIXES.has(prefix)) continue;
    constraints.push(inheritedMandateConstraint(input, mandateConstraint));
  }

  return constraints.sort((left, right) => {
    const a = `${left.code}:${left.subject ?? ""}:${left.source}`;
    const b = `${right.code}:${right.subject ?? ""}:${right.source}`;
    return a.localeCompare(b);
  });
}

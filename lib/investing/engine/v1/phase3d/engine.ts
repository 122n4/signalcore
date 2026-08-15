import {
  canonicalJsonStringify,
  canonicalSha256,
  deepFreezeCanonical,
} from "@/lib/investing/engine/v1/canonical";
import type { CanonicalInvestingInputV1 } from "@/lib/investing/engine/v1/contracts";
import { assertCanonicalInvestingInputV1 } from "@/lib/investing/engine/v1/validation";
import { evaluateInvestingConstraintsV1 } from "@/lib/investing/engine/v1/phase3d/constraintEngine";
import { assertSupportedInvestingTechnicalPolicyVersionV1 } from "@/lib/investing/engine/v1/policyDefinition";
import { evaluateInvestingPolicyV1 } from "@/lib/investing/engine/v1/phase3d/policyEngine";
import { assessInvestingRiskV1 } from "@/lib/investing/engine/v1/phase3d/riskAssessment";
import {
  FEASIBLE_DECISION_ENVELOPE_CONTRACT_VERSION,
  type ConstraintEvaluationV1,
  type FeasibleDecisionEnvelopeStatusV1,
  type FeasibleDecisionEnvelopeV1,
  type RiskPolicyEvaluationContextV1,
} from "@/lib/investing/engine/v1/phase3d/types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function deriveStatus(
  constraints: readonly ConstraintEvaluationV1[],
  riskStatus: "complete" | "degraded" | "insufficient_data",
  policyStatus: "resolved" | "conflict" | "insufficient_data",
): FeasibleDecisionEnvelopeStatusV1 {
  const hardFailure = constraints.some((item) =>
    item.severity === "hard" && (item.status === "fail" || item.status === "conflict"),
  );
  if (hardFailure || policyStatus === "conflict") return "blocked";
  const hardUnknown = constraints.some((item) => item.severity === "hard" && item.status === "unknown");
  if (hardUnknown || riskStatus === "insufficient_data" || policyStatus === "insufficient_data") {
    return "insufficient_data";
  }
  const softProblem = constraints.some((item) =>
    item.severity === "soft" && item.status !== "pass",
  );
  if (softProblem || riskStatus === "degraded") return "degraded";
  return "allowed";
}

export function hashFeasibleDecisionEnvelopeV1(
  envelope: FeasibleDecisionEnvelopeV1 | Omit<FeasibleDecisionEnvelopeV1, "envelopeHash">,
) {
  const hashable: Record<string, unknown> = { ...envelope };
  delete hashable.envelopeHash;
  return canonicalSha256(hashable);
}

export function assertFeasibleDecisionEnvelopeV1(envelope: FeasibleDecisionEnvelopeV1) {
  canonicalJsonStringify(envelope);
  if (envelope.contractVersion !== FEASIBLE_DECISION_ENVELOPE_CONTRACT_VERSION) {
    throw new Error("investing_feasible_envelope_contract_invalid");
  }
  if (!SHA256_PATTERN.test(envelope.inputHash) || !SHA256_PATTERN.test(envelope.envelopeHash)) {
    throw new Error("investing_feasible_envelope_hash_invalid");
  }
  if (hashFeasibleDecisionEnvelopeV1(envelope) !== envelope.envelopeHash) {
    throw new Error("investing_feasible_envelope_hash_mismatch");
  }
  if (!ID_PATTERN.test(envelope.authorization.expectedUserId) || !ID_PATTERN.test(envelope.authorization.expectedAccountId)) {
    throw new Error("investing_feasible_envelope_authorization_invalid");
  }
  if (envelope.authorization.environment !== "paper") {
    throw new Error("investing_feasible_envelope_live_forbidden");
  }
  if (!envelope.constraints.every((constraint) => constraint.contractVersion === "investing-constraint-evaluation/v1")) {
    throw new Error("investing_constraint_contract_invalid");
  }
  if (envelope.status === "allowed" && envelope.constraints.some((constraint) => constraint.status !== "pass")) {
    throw new Error("investing_feasible_envelope_allowed_with_nonpassing_constraint");
  }
}

export function evaluateInvestingRiskPolicyV1(
  input: CanonicalInvestingInputV1,
  context: RiskPolicyEvaluationContextV1,
): FeasibleDecisionEnvelopeV1 {
  try {
    assertCanonicalInvestingInputV1(input);
  } catch {
    throw new Error("investing_risk_policy_input_invalid");
  }
  if (
    !ID_PATTERN.test(context.expectedUserId)
    || !ID_PATTERN.test(context.expectedAccountId)
    || context.environment !== "paper"
  ) {
    throw new Error("investing_risk_policy_context_invalid_or_live");
  }
  assertSupportedInvestingTechnicalPolicyVersionV1(input.versions.policyVersion);

  const risk = assessInvestingRiskV1(input);
  const policy = evaluateInvestingPolicyV1(input);
  const constraints = evaluateInvestingConstraintsV1({ input, context, risk, policy });
  const status = deriveStatus(constraints, risk.status, policy.status);
  const unavailable = new Set([
    ...policy.prohibitedInstruments,
    ...policy.unsuitableInstruments,
    ...input.instrumentCatalog.instruments
      .filter((instrument) => instrument.enabled && !policy.allowedUniverse.includes(instrument.symbol))
      .map((instrument) => instrument.symbol),
  ]);
  const allowedInstruments = status === "allowed" || status === "degraded"
    ? policy.allowedUniverse.filter((symbol) => !unavailable.has(symbol))
    : [];
  const conditions = constraints
    .filter((constraint) => constraint.status !== "pass")
    .map((constraint) => constraint.code);
  const draft: Omit<FeasibleDecisionEnvelopeV1, "envelopeHash"> = {
    contractVersion: FEASIBLE_DECISION_ENVELOPE_CONTRACT_VERSION,
    inputHash: input.inputHash,
    asOf: input.asOf,
    status,
    authorization: context,
    risk,
    policy,
    constraints,
    allowedInstruments,
    prohibitedInstruments: [...unavailable].sort(),
    conditions,
  };
  const envelope = {
    ...draft,
    envelopeHash: hashFeasibleDecisionEnvelopeV1(draft),
  } satisfies FeasibleDecisionEnvelopeV1;
  assertFeasibleDecisionEnvelopeV1(envelope);
  return deepFreezeCanonical(envelope) as FeasibleDecisionEnvelopeV1;
}

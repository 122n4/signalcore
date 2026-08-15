import {
  canonicalSha256,
  deepFreezeCanonical,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";
import type { CanonicalMandateV1 } from "@/lib/investing/engine/v1/contracts";
import type { CanonicalInvestingPlan, CanonicalInvestingPlanState } from "@/lib/investing/server/plan";

export const CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION =
  "canonical-plan-to-mandate-translation/v1" as const;

export const CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES = [
  "PLAN_UNAVAILABLE",
  "PLAN_NOT_ACTIVE",
  "PLAN_ACTIVATION_UNAVAILABLE",
  "STRUCTURED_PLAN_UNAVAILABLE",
  "STRUCTURED_SCHEMA_UNSUPPORTED",
  "OBJECTIVE_MISSING",
  "OBJECTIVE_UNSUPPORTED",
  "RISK_PROFILE_MISSING",
  "HORIZON_EXPLICIT_AUTHORING_REQUIRED",
  "BASE_CURRENCY_UNAVAILABLE",
  "GUARDRAIL_SEMANTICS_UNSUPPORTED",
  "GUARDRAIL_ENGINE_SUPPORT_UNAVAILABLE",
  "PLAN_SOURCE_CHANGED",
] as const;

export type CanonicalPlanToMandateTranslationReasonCodeV1 =
  (typeof CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES)[number];

export type CanonicalPlanToMandateTranslationAssessmentV1 = {
  readonly contractVersion: typeof CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION;
  readonly sourcePlan: {
    readonly planId: string | null;
    readonly planVersion: number | null;
    readonly activatedAt: string | null;
    readonly updatedAt: string | null;
    readonly structuredSchemaVersion: 1 | null;
    readonly semanticFingerprint: string | null;
  };
  readonly account: {
    readonly baseCurrency: string | null;
  };
  readonly availability: "AVAILABLE" | "UNAVAILABLE";
  readonly reasonCodes: readonly CanonicalPlanToMandateTranslationReasonCodeV1[];
  readonly compatibleSemantics: {
    readonly objective: CanonicalMandateV1["objective"] | null;
    readonly riskProfile: CanonicalMandateV1["riskProfile"] | null;
    readonly horizon: null;
    readonly baseCurrency: string | null;
    readonly constraints: null;
  };
  readonly mandate: null;
  readonly translationFingerprint: string;
};

export type CanonicalPlanToMandateTranslationAssessmentInputV1 = {
  readonly planState: CanonicalInvestingPlanState;
  readonly accountBaseCurrency?: string | null;
  readonly expectedPlanSemanticFingerprint?: string | null;
};

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const COMPATIBLE_OBJECTIVES = new Set(["preservation", "growth", "income", "balanced"]);
const RISK_PROFILES = new Set(["Conservative", "Balanced", "Aggressive"]);

function normalizeTimestampOrNull(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  try {
    return normalizeIsoTimestamp(value);
  } catch {
    return null;
  }
}

function numberForFingerprint(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return String(value);
}

function amountForFingerprint(value: { amount: number; currency: string } | undefined) {
  if (!value) return null;
  return {
    amount: numberForFingerprint(value.amount),
    currency: value.currency,
  };
}

function guardrailForFingerprint(value: number | undefined) {
  return numberForFingerprint(value);
}

function planSemanticHashInput(plan: CanonicalInvestingPlan) {
  return {
    planId: plan.id,
    planVersion: String(plan.version),
    activatedAt: normalizeTimestampOrNull(plan.activatedAt),
    updatedAt: normalizeTimestampOrNull(plan.updatedAt),
    structuredSchemaVersion: plan.structured.schemaVersion === 1 ? "1" : null,
    objective: {
      type: plan.structured.objective?.type ?? null,
      targetAmount: amountForFingerprint(plan.structured.objective?.targetAmount),
      timeframeMonths:
        typeof plan.structured.objective?.timeframeMonths === "number"
          ? String(plan.structured.objective.timeframeMonths)
          : null,
      monthlyContribution: amountForFingerprint(plan.structured.objective?.monthlyContribution),
    },
    risk: {
      profile: plan.structured.risk?.profile ?? null,
    },
    guardrails: {
      maxSinglePositionPct: guardrailForFingerprint(plan.structured.guardrails?.maxSinglePositionPct),
      maxTop5Pct: guardrailForFingerprint(plan.structured.guardrails?.maxTop5Pct),
    },
  };
}

export function hashCanonicalPlanSemanticsForMandateTranslationV1(plan: CanonicalInvestingPlan) {
  return canonicalSha256(planSemanticHashInput(plan));
}

function orderedReasons(reasons: Set<CanonicalPlanToMandateTranslationReasonCodeV1>) {
  return CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES.filter((reason) => reasons.has(reason));
}

function sourcePlanProjection(plan: CanonicalInvestingPlan | null): CanonicalPlanToMandateTranslationAssessmentV1["sourcePlan"] {
  if (!plan) {
    return {
      planId: null,
      planVersion: null,
      activatedAt: null,
      updatedAt: null,
      structuredSchemaVersion: null,
      semanticFingerprint: null,
    };
  }

  return {
    planId: plan.id,
    planVersion: Number.isSafeInteger(plan.version) && plan.version > 0 ? plan.version : null,
    activatedAt: normalizeTimestampOrNull(plan.activatedAt),
    updatedAt: normalizeTimestampOrNull(plan.updatedAt),
    structuredSchemaVersion: plan.structured.schemaVersion === 1 ? (1 as const) : null,
    semanticFingerprint: hashCanonicalPlanSemanticsForMandateTranslationV1(plan),
  };
}

function translationFingerprintInput(
  assessment: Omit<CanonicalPlanToMandateTranslationAssessmentV1, "translationFingerprint">,
) {
  return {
    contractVersion: assessment.contractVersion,
    sourcePlan: {
      ...assessment.sourcePlan,
      planVersion:
        assessment.sourcePlan.planVersion === null ? null : String(assessment.sourcePlan.planVersion),
      structuredSchemaVersion:
        assessment.sourcePlan.structuredSchemaVersion === null
          ? null
          : String(assessment.sourcePlan.structuredSchemaVersion),
    },
    account: assessment.account,
    availability: assessment.availability,
    reasonCodes: assessment.reasonCodes,
    compatibleSemantics: assessment.compatibleSemantics,
    mandate: assessment.mandate,
  };
}

function hasGuardrail(plan: CanonicalInvestingPlan, key: "maxSinglePositionPct" | "maxTop5Pct") {
  return typeof plan.structured.guardrails?.[key] === "number";
}

export function assessCanonicalPlanToMandateTranslationV1(
  input: CanonicalPlanToMandateTranslationAssessmentInputV1,
): CanonicalPlanToMandateTranslationAssessmentV1 {
  const plan = input.planState.availability === "AVAILABLE" ? input.planState.value : null;
  const sourcePlan = sourcePlanProjection(plan);
  const reasons = new Set<CanonicalPlanToMandateTranslationReasonCodeV1>();
  const baseCurrency =
    typeof input.accountBaseCurrency === "string" && CURRENCY_PATTERN.test(input.accountBaseCurrency)
      ? input.accountBaseCurrency
      : null;
  let objective: CanonicalMandateV1["objective"] | null = null;
  let riskProfile: CanonicalMandateV1["riskProfile"] | null = null;

  if (!plan) {
    reasons.add("PLAN_UNAVAILABLE");
  } else {
    if (plan.mode !== "investing" || plan.status !== "active") reasons.add("PLAN_NOT_ACTIVE");
    if (!sourcePlan.activatedAt) reasons.add("PLAN_ACTIVATION_UNAVAILABLE");

    if (plan.structured.availability !== "AVAILABLE") {
      reasons.add("STRUCTURED_PLAN_UNAVAILABLE");
    }
    if (plan.structured.schemaVersion !== 1) {
      reasons.add("STRUCTURED_SCHEMA_UNSUPPORTED");
    }

    const objectiveType = plan.structured.objective?.type;
    if (objectiveType === undefined) {
      reasons.add("OBJECTIVE_MISSING");
    } else if (COMPATIBLE_OBJECTIVES.has(objectiveType)) {
      objective = objectiveType as CanonicalMandateV1["objective"];
    } else {
      reasons.add("OBJECTIVE_UNSUPPORTED");
    }

    const profile = plan.structured.risk?.profile;
    if (profile === undefined || !RISK_PROFILES.has(profile)) {
      reasons.add("RISK_PROFILE_MISSING");
    } else {
      riskProfile = profile as CanonicalMandateV1["riskProfile"];
    }

    if (plan.structured.schemaVersion === 1) {
      reasons.add("HORIZON_EXPLICIT_AUTHORING_REQUIRED");
    }

    if (hasGuardrail(plan, "maxSinglePositionPct") || hasGuardrail(plan, "maxTop5Pct")) {
      reasons.add("GUARDRAIL_SEMANTICS_UNSUPPORTED");
    }
    if (hasGuardrail(plan, "maxTop5Pct")) {
      reasons.add("GUARDRAIL_ENGINE_SUPPORT_UNAVAILABLE");
    }
  }

  if (!baseCurrency) reasons.add("BASE_CURRENCY_UNAVAILABLE");
  if (
    input.expectedPlanSemanticFingerprint &&
    sourcePlan.semanticFingerprint &&
    input.expectedPlanSemanticFingerprint !== sourcePlan.semanticFingerprint
  ) {
    reasons.add("PLAN_SOURCE_CHANGED");
  }

  const reasonCodes = orderedReasons(reasons);
  const assessmentWithoutFingerprint: Omit<CanonicalPlanToMandateTranslationAssessmentV1, "translationFingerprint"> = {
    contractVersion: CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION,
    sourcePlan,
    account: {
      baseCurrency,
    },
    availability: "UNAVAILABLE",
    reasonCodes,
    compatibleSemantics: {
      objective,
      riskProfile,
      horizon: null,
      baseCurrency,
      constraints: null,
    },
    mandate: null,
  };

  return deepFreezeCanonical({
    ...assessmentWithoutFingerprint,
    translationFingerprint: canonicalSha256(translationFingerprintInput(assessmentWithoutFingerprint)),
  }) as CanonicalPlanToMandateTranslationAssessmentV1;
}

import {
  canonicalJsonStringify,
  canonicalSha256,
  deepFreezeCanonical,
  isCanonicalDecimal,
  normalizeIsoTimestamp,
} from "@/lib/investing/engine/v1/canonical";
import type {
  CanonicalMandateV1,
  InvestingConstraintEvaluationV1,
  InvestingEngineEnvironmentV1,
} from "@/lib/investing/engine/v1/contracts";

export const CANONICAL_INVESTING_MANDATE_AUTHORITY_CONTRACT_VERSION =
  "canonical-investing-mandate-authority/v1" as const;

export type CanonicalInvestingMandateAuthorityV1 = {
  readonly contractVersion: typeof CANONICAL_INVESTING_MANDATE_AUTHORITY_CONTRACT_VERSION;
  readonly authority: {
    readonly userId: string;
    readonly tenantId: string;
    readonly membershipId: string;
    readonly portfolioId: string;
    readonly accountId: string;
    readonly environment: InvestingEngineEnvironmentV1;
    readonly accountBaseCurrency: string;
  };
  readonly plan: {
    readonly planId: string;
    readonly planVersion: number;
    readonly mode: "investing";
    readonly status: "active";
    readonly activatedAt: string;
    readonly updatedAt: string;
    readonly structuredSchemaVersion: 1;
  };
  readonly mandate: CanonicalMandateV1;
  readonly lineage: {
    readonly asOf: string;
    readonly authorityFingerprint: string;
  };
};

export type CanonicalInvestingMandateAuthorityDraftV1 =
  Omit<CanonicalInvestingMandateAuthorityV1, "lineage"> & {
    readonly lineage: {
      readonly asOf: string;
    };
  };

export type PlanDerivedMandateAuthorityUnavailableV1 = {
  readonly availability: "UNAVAILABLE";
  readonly reason: "plan_to_mandate_translation_not_accepted";
  readonly authority: null;
};

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const AUTHORITY_KEYS = [
  "userId",
  "tenantId",
  "membershipId",
  "portfolioId",
  "accountId",
  "environment",
  "accountBaseCurrency",
] as const;
const PLAN_KEYS = [
  "planId",
  "planVersion",
  "mode",
  "status",
  "activatedAt",
  "updatedAt",
  "structuredSchemaVersion",
] as const;
const MANDATE_KEYS = [
  "mandateSnapshotId",
  "objective",
  "riskProfile",
  "horizon",
  "baseCurrency",
  "constraints",
] as const;
const CONSTRAINT_KEYS = [
  "id",
  "kind",
  "status",
  "reasonCode",
  "observed",
  "limit",
  "evidenceRefs",
] as const;

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertPlainRecord(value: unknown, code: string): asserts value is Record<string, unknown> {
  assert(isPlainRecord(value), code);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], code: string) {
  const allowedSet = new Set(allowed);
  const actual = Object.keys(value);
  assert(actual.length === allowed.length && actual.every((key) => allowedSet.has(key)), code);
}

function assertId(value: unknown, code: string) {
  assert(typeof value === "string" && ID_PATTERN.test(value), code);
}

function assertCurrency(value: unknown, code: string) {
  assert(typeof value === "string" && CURRENCY_PATTERN.test(value), code);
}

function assertTimestamp(value: unknown, code: string) {
  assert(typeof value === "string", code);
  assert(normalizeIsoTimestamp(value) === value, code);
}

function assertPlanVersion(value: unknown) {
  assert(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      Number.isFinite(value) &&
      value > 0,
    "investing_mandate_authority_plan_version_invalid",
  );
}

function assertConstraint(constraint: unknown, index: number): asserts constraint is InvestingConstraintEvaluationV1 {
  assertPlainRecord(constraint, `investing_mandate_authority_constraint_${index}_invalid`);
  assertExactKeys(constraint, CONSTRAINT_KEYS, `investing_mandate_authority_constraint_${index}_closed_invalid`);
  assertId(constraint.id, `investing_mandate_authority_constraint_${index}_id_invalid`);
  assert(["hard", "soft"].includes(String(constraint.kind)), `investing_mandate_authority_constraint_${index}_kind_invalid`);
  assert(["pass", "fail", "unknown"].includes(String(constraint.status)), `investing_mandate_authority_constraint_${index}_status_invalid`);
  assertId(constraint.reasonCode, `investing_mandate_authority_constraint_${index}_reason_code_invalid`);
  assert(constraint.observed === null || isCanonicalDecimal(constraint.observed), `investing_mandate_authority_constraint_${index}_observed_invalid`);
  assert(constraint.limit === null || isCanonicalDecimal(constraint.limit), `investing_mandate_authority_constraint_${index}_limit_invalid`);
  assert(Array.isArray(constraint.evidenceRefs), `investing_mandate_authority_constraint_${index}_evidence_refs_invalid`);
  constraint.evidenceRefs.forEach((ref, refIndex) =>
    assertId(ref, `investing_mandate_authority_constraint_${index}_evidence_ref_${refIndex}_invalid`),
  );
}

export function assertCanonicalMandateV1Closed(mandate: unknown): asserts mandate is CanonicalMandateV1 {
  assertPlainRecord(mandate, "investing_mandate_authority_mandate_invalid");
  assertExactKeys(mandate, MANDATE_KEYS, "investing_mandate_authority_mandate_closed_invalid");
  assertId(mandate.mandateSnapshotId, "investing_mandate_authority_mandate_snapshot_id_invalid");
  assert(
    ["preservation", "growth", "income", "balanced"].includes(String(mandate.objective)),
    "investing_mandate_authority_mandate_objective_invalid",
  );
  assert(
    ["Conservative", "Balanced", "Aggressive"].includes(String(mandate.riskProfile)),
    "investing_mandate_authority_mandate_risk_invalid",
  );
  assert(
    ["Short", "Medium", "Long"].includes(String(mandate.horizon)),
    "investing_mandate_authority_mandate_horizon_invalid",
  );
  assertCurrency(mandate.baseCurrency, "investing_mandate_authority_mandate_currency_invalid");
  assert(Array.isArray(mandate.constraints), "investing_mandate_authority_constraints_invalid");
  mandate.constraints.forEach(assertConstraint);
  assert(
    new Set(mandate.constraints.map((constraint) => constraint.id)).size === mandate.constraints.length,
    "investing_mandate_authority_constraint_duplicate_id",
  );
}

function normalizeDraft(
  draft: CanonicalInvestingMandateAuthorityDraftV1,
): CanonicalInvestingMandateAuthorityDraftV1 {
  assertPlainRecord(draft, "investing_mandate_authority_invalid");
  assertExactKeys(draft, ["contractVersion", "authority", "plan", "mandate", "lineage"], "investing_mandate_authority_closed_invalid");
  assertPlainRecord(draft.lineage, "investing_mandate_authority_lineage_invalid");
  assertExactKeys(draft.lineage, ["asOf"], "investing_mandate_authority_lineage_closed_invalid");

  return {
    ...draft,
    plan: {
      ...draft.plan,
      activatedAt: normalizeIsoTimestamp(draft.plan.activatedAt),
      updatedAt: normalizeIsoTimestamp(draft.plan.updatedAt),
    },
    lineage: {
      asOf: normalizeIsoTimestamp(draft.lineage.asOf),
    },
  };
}

function hashInput(authority: CanonicalInvestingMandateAuthorityDraftV1 | CanonicalInvestingMandateAuthorityV1) {
  return {
    contractVersion: authority.contractVersion,
    authority: {
      userId: authority.authority.userId,
      tenantId: authority.authority.tenantId,
      membershipId: authority.authority.membershipId,
      portfolioId: authority.authority.portfolioId,
      accountId: authority.authority.accountId,
      environment: authority.authority.environment,
      accountBaseCurrency: authority.authority.accountBaseCurrency,
    },
    plan: {
      planId: authority.plan.planId,
      planVersion: String(authority.plan.planVersion),
      mode: authority.plan.mode,
      status: authority.plan.status,
      activatedAt: authority.plan.activatedAt,
      updatedAt: authority.plan.updatedAt,
      structuredSchemaVersion: String(authority.plan.structuredSchemaVersion),
    },
    mandate: authority.mandate,
    lineage: {
      asOf: authority.lineage.asOf,
    },
  };
}

export function hashCanonicalInvestingMandateAuthorityV1(
  authority: CanonicalInvestingMandateAuthorityDraftV1 | CanonicalInvestingMandateAuthorityV1,
) {
  return canonicalSha256(hashInput(authority));
}

export function assertCanonicalInvestingMandateAuthorityV1(
  authority: CanonicalInvestingMandateAuthorityV1,
) {
  canonicalJsonStringify(hashInput(authority));
  assert(
    authority.contractVersion === CANONICAL_INVESTING_MANDATE_AUTHORITY_CONTRACT_VERSION,
    "investing_mandate_authority_contract_version_invalid",
  );

  assertPlainRecord(authority.authority, "investing_mandate_authority_binding_invalid");
  assertExactKeys(authority.authority, AUTHORITY_KEYS, "investing_mandate_authority_binding_closed_invalid");
  for (const key of ["userId", "tenantId", "membershipId", "portfolioId", "accountId"] as const) {
    assertId(authority.authority[key], `investing_mandate_authority_${key}_invalid`);
  }
  assert(
    authority.authority.environment === "paper" || authority.authority.environment === "simulation",
    "investing_mandate_authority_environment_invalid",
  );
  assertCurrency(authority.authority.accountBaseCurrency, "investing_mandate_authority_account_currency_invalid");

  assertPlainRecord(authority.plan, "investing_mandate_authority_plan_invalid");
  assertExactKeys(authority.plan, PLAN_KEYS, "investing_mandate_authority_plan_closed_invalid");
  assertId(authority.plan.planId, "investing_mandate_authority_plan_id_invalid");
  assertPlanVersion(authority.plan.planVersion);
  assert(authority.plan.mode === "investing", "investing_mandate_authority_plan_mode_invalid");
  assert(authority.plan.status === "active", "investing_mandate_authority_plan_status_invalid");
  assertTimestamp(authority.plan.activatedAt, "investing_mandate_authority_plan_activated_at_invalid");
  assertTimestamp(authority.plan.updatedAt, "investing_mandate_authority_plan_updated_at_invalid");
  assert(authority.plan.structuredSchemaVersion === 1, "investing_mandate_authority_structured_schema_invalid");

  assertCanonicalMandateV1Closed(authority.mandate);
  assert(
    authority.mandate.baseCurrency === authority.authority.accountBaseCurrency,
    "investing_mandate_authority_currency_mismatch",
  );

  assertPlainRecord(authority.lineage, "investing_mandate_authority_lineage_invalid");
  assertExactKeys(authority.lineage, ["asOf", "authorityFingerprint"], "investing_mandate_authority_lineage_closed_invalid");
  assertTimestamp(authority.lineage.asOf, "investing_mandate_authority_as_of_invalid");
  assert(
    typeof authority.lineage.authorityFingerprint === "string" &&
      SHA256_PATTERN.test(authority.lineage.authorityFingerprint),
    "investing_mandate_authority_fingerprint_invalid",
  );
  assert(
    hashCanonicalInvestingMandateAuthorityV1(authority) === authority.lineage.authorityFingerprint,
    "investing_mandate_authority_fingerprint_mismatch",
  );
}

export function sealCanonicalInvestingMandateAuthorityV1(
  draft: CanonicalInvestingMandateAuthorityDraftV1,
): CanonicalInvestingMandateAuthorityV1 {
  const normalized = normalizeDraft(draft);
  const candidate = {
    ...normalized,
    lineage: {
      ...normalized.lineage,
      authorityFingerprint: hashCanonicalInvestingMandateAuthorityV1(normalized),
    },
  } satisfies CanonicalInvestingMandateAuthorityV1;

  assertCanonicalInvestingMandateAuthorityV1(candidate);
  return deepFreezeCanonical(candidate) as CanonicalInvestingMandateAuthorityV1;
}

export function getPlanDerivedMandateAuthorityUnavailableV1(): PlanDerivedMandateAuthorityUnavailableV1 {
  return deepFreezeCanonical({
    availability: "UNAVAILABLE",
    reason: "plan_to_mandate_translation_not_accepted",
    authority: null,
  }) as PlanDerivedMandateAuthorityUnavailableV1;
}

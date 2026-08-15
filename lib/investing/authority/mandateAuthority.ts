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
const ROOT_KEYS = ["contractVersion", "authority", "plan", "mandate", "lineage"] as const;
const LINEAGE_DRAFT_KEYS = ["asOf"] as const;
const LINEAGE_SEALED_KEYS = ["asOf", "authorityFingerprint"] as const;

function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function isPlainRecordShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertClosedDataRecord(
  value: unknown,
  allowed: readonly string[],
  code: string,
): asserts value is Record<string, unknown> {
  assert(isPlainRecordShape(value), code);
  const allowedSet = new Set(allowed);
  const ownKeys = Reflect.ownKeys(value);
  assert(ownKeys.length === allowed.length, code);

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of ownKeys) {
    assert(typeof key === "string", code);
    assert(allowedSet.has(key), code);
    const descriptor = descriptors[key];
    assert(Boolean(descriptor), code);
    assert(descriptor.enumerable === true, code);
    assert("value" in descriptor, code);
  }

  for (const key of allowed) {
    const descriptor = descriptors[key];
    assert(Boolean(descriptor), code);
    assert(descriptor.enumerable === true, code);
    assert("value" in descriptor, code);
  }
}

function assertClosedDataArray(value: unknown, code: string): asserts value is readonly unknown[] {
  assert(Array.isArray(value), code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  assert(Boolean(lengthDescriptor) && "value" in lengthDescriptor && lengthDescriptor.enumerable === false, code);

  for (const key of Reflect.ownKeys(value)) {
    assert(typeof key === "string", code);
    if (key === "length") continue;
    assert(/^(0|[1-9]\d*)$/.test(key), code);
    const index = Number(key);
    assert(Number.isSafeInteger(index) && index >= 0 && index < value.length, code);
    const descriptor = descriptors[key];
    assert(Boolean(descriptor), code);
    assert(descriptor.enumerable === true, code);
    assert("value" in descriptor, code);
  }

  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    assert(Boolean(descriptor) && descriptor.enumerable === true && "value" in descriptor, code);
  }
}

function readDataField(record: Record<string, unknown>, key: string) {
  return Object.getOwnPropertyDescriptor(record, key)?.value;
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

function materializeConstraint(constraint: unknown, index: number): InvestingConstraintEvaluationV1 {
  assertClosedDataRecord(
    constraint,
    CONSTRAINT_KEYS,
    `investing_mandate_authority_constraint_${index}_closed_invalid`,
  );

  const evidenceRefs = readDataField(constraint, "evidenceRefs");
  assertClosedDataArray(evidenceRefs, `investing_mandate_authority_constraint_${index}_evidence_refs_invalid`);

  const materialized = {
    id: readDataField(constraint, "id"),
    kind: readDataField(constraint, "kind"),
    status: readDataField(constraint, "status"),
    reasonCode: readDataField(constraint, "reasonCode"),
    observed: readDataField(constraint, "observed"),
    limit: readDataField(constraint, "limit"),
    evidenceRefs: evidenceRefs.map((ref) => ref),
  };

  assertId(materialized.id, `investing_mandate_authority_constraint_${index}_id_invalid`);
  assert(
    ["hard", "soft"].includes(String(materialized.kind)),
    `investing_mandate_authority_constraint_${index}_kind_invalid`,
  );
  assert(
    ["pass", "fail", "unknown"].includes(String(materialized.status)),
    `investing_mandate_authority_constraint_${index}_status_invalid`,
  );
  assertId(materialized.reasonCode, `investing_mandate_authority_constraint_${index}_reason_code_invalid`);
  assert(
    materialized.observed === null || isCanonicalDecimal(materialized.observed),
    `investing_mandate_authority_constraint_${index}_observed_invalid`,
  );
  assert(
    materialized.limit === null || isCanonicalDecimal(materialized.limit),
    `investing_mandate_authority_constraint_${index}_limit_invalid`,
  );
  materialized.evidenceRefs.forEach((ref, refIndex) =>
    assertId(ref, `investing_mandate_authority_constraint_${index}_evidence_ref_${refIndex}_invalid`),
  );
  return materialized as InvestingConstraintEvaluationV1;
}

export function assertCanonicalMandateV1Closed(mandate: unknown): asserts mandate is CanonicalMandateV1 {
  materializeMandate(mandate);
}

function materializeMandate(mandate: unknown): CanonicalMandateV1 {
  assertClosedDataRecord(mandate, MANDATE_KEYS, "investing_mandate_authority_mandate_closed_invalid");
  const constraints = readDataField(mandate, "constraints");
  assertClosedDataArray(constraints, "investing_mandate_authority_constraints_invalid");

  const materialized = {
    mandateSnapshotId: readDataField(mandate, "mandateSnapshotId"),
    objective: readDataField(mandate, "objective"),
    riskProfile: readDataField(mandate, "riskProfile"),
    horizon: readDataField(mandate, "horizon"),
    baseCurrency: readDataField(mandate, "baseCurrency"),
    constraints: constraints.map((constraint, index) => materializeConstraint(constraint, index)),
  };

  assertId(materialized.mandateSnapshotId, "investing_mandate_authority_mandate_snapshot_id_invalid");
  assert(
    ["preservation", "growth", "income", "balanced"].includes(String(materialized.objective)),
    "investing_mandate_authority_mandate_objective_invalid",
  );
  assert(
    ["Conservative", "Balanced", "Aggressive"].includes(String(materialized.riskProfile)),
    "investing_mandate_authority_mandate_risk_invalid",
  );
  assert(
    ["Short", "Medium", "Long"].includes(String(materialized.horizon)),
    "investing_mandate_authority_mandate_horizon_invalid",
  );
  assertCurrency(materialized.baseCurrency, "investing_mandate_authority_mandate_currency_invalid");
  assert(
    new Set(materialized.constraints.map((constraint) => constraint.id)).size === materialized.constraints.length,
    "investing_mandate_authority_constraint_duplicate_id",
  );
  return materialized as CanonicalMandateV1;
}

function normalizeDraft(
  draft: CanonicalInvestingMandateAuthorityDraftV1,
): CanonicalInvestingMandateAuthorityDraftV1 {
  assertClosedDataRecord(draft, ROOT_KEYS, "investing_mandate_authority_closed_invalid");
  const authority = materializeAuthority(readDataField(draft, "authority"));
  const plan = materializePlan(readDataField(draft, "plan"));
  const mandate = materializeMandate(readDataField(draft, "mandate"));
  const lineage = materializeLineageDraft(readDataField(draft, "lineage"));
  const activatedAt = normalizeIsoTimestamp(plan.activatedAt);
  const updatedAt = normalizeIsoTimestamp(plan.updatedAt);
  const asOf = normalizeIsoTimestamp(lineage.asOf);

  assertTemporalLineage(activatedAt, updatedAt, asOf);
  return {
    contractVersion: readDataField(draft, "contractVersion") as typeof CANONICAL_INVESTING_MANDATE_AUTHORITY_CONTRACT_VERSION,
    authority,
    plan: {
      ...plan,
      activatedAt,
      updatedAt,
    },
    mandate,
    lineage: {
      asOf,
    },
  };
}

function materializeAuthority(authority: unknown): CanonicalInvestingMandateAuthorityV1["authority"] {
  assertClosedDataRecord(authority, AUTHORITY_KEYS, "investing_mandate_authority_binding_closed_invalid");
  return {
    userId: readDataField(authority, "userId") as string,
    tenantId: readDataField(authority, "tenantId") as string,
    membershipId: readDataField(authority, "membershipId") as string,
    portfolioId: readDataField(authority, "portfolioId") as string,
    accountId: readDataField(authority, "accountId") as string,
    environment: readDataField(authority, "environment") as InvestingEngineEnvironmentV1,
    accountBaseCurrency: readDataField(authority, "accountBaseCurrency") as string,
  };
}

function materializePlan(plan: unknown): CanonicalInvestingMandateAuthorityV1["plan"] {
  assertClosedDataRecord(plan, PLAN_KEYS, "investing_mandate_authority_plan_closed_invalid");
  return {
    planId: readDataField(plan, "planId") as string,
    planVersion: readDataField(plan, "planVersion") as number,
    mode: readDataField(plan, "mode") as "investing",
    status: readDataField(plan, "status") as "active",
    activatedAt: readDataField(plan, "activatedAt") as string,
    updatedAt: readDataField(plan, "updatedAt") as string,
    structuredSchemaVersion: readDataField(plan, "structuredSchemaVersion") as 1,
  };
}

function materializeLineageDraft(lineage: unknown): CanonicalInvestingMandateAuthorityDraftV1["lineage"] {
  assertClosedDataRecord(lineage, LINEAGE_DRAFT_KEYS, "investing_mandate_authority_lineage_closed_invalid");
  return {
    asOf: readDataField(lineage, "asOf") as string,
  };
}

function materializeLineageSealed(lineage: unknown): CanonicalInvestingMandateAuthorityV1["lineage"] {
  assertClosedDataRecord(lineage, LINEAGE_SEALED_KEYS, "investing_mandate_authority_lineage_closed_invalid");
  return {
    asOf: readDataField(lineage, "asOf") as string,
    authorityFingerprint: readDataField(lineage, "authorityFingerprint") as string,
  };
}

function assertTemporalLineage(activatedAt: string, updatedAt: string, asOf: string) {
  assert(activatedAt <= updatedAt, "investing_mandate_authority_temporal_lineage_invalid");
  assert(updatedAt <= asOf, "investing_mandate_authority_temporal_lineage_invalid");
  assert(activatedAt <= asOf, "investing_mandate_authority_temporal_lineage_invalid");
}

function materializeForHash(
  authority: CanonicalInvestingMandateAuthorityDraftV1 | CanonicalInvestingMandateAuthorityV1,
) {
  assertClosedDataRecord(authority, ROOT_KEYS, "investing_mandate_authority_closed_invalid");
  const materializedAuthority = materializeAuthority(readDataField(authority, "authority"));
  const plan = materializePlan(readDataField(authority, "plan"));
  const mandate = materializeMandate(readDataField(authority, "mandate"));
  const lineage = readDataField(authority, "lineage");
  const lineageOwnKeys = lineage && typeof lineage === "object" ? Reflect.ownKeys(lineage) : [];
  assertClosedDataRecord(
    lineage,
    lineageOwnKeys.includes("authorityFingerprint") ? LINEAGE_SEALED_KEYS : LINEAGE_DRAFT_KEYS,
    "investing_mandate_authority_lineage_closed_invalid",
  );

  return {
    contractVersion: readDataField(authority, "contractVersion"),
    authority: materializedAuthority,
    plan: {
      planId: plan.planId,
      planVersion: String(plan.planVersion),
      mode: plan.mode,
      status: plan.status,
      activatedAt: plan.activatedAt,
      updatedAt: plan.updatedAt,
      structuredSchemaVersion: String(plan.structuredSchemaVersion),
    },
    mandate,
    lineage: {
      asOf: readDataField(lineage as Record<string, unknown>, "asOf"),
    },
  };
}

export function hashCanonicalInvestingMandateAuthorityV1(
  authority: CanonicalInvestingMandateAuthorityDraftV1 | CanonicalInvestingMandateAuthorityV1,
) {
  return canonicalSha256(materializeForHash(authority));
}

export function assertCanonicalInvestingMandateAuthorityV1(
  authority: CanonicalInvestingMandateAuthorityV1,
) {
  const hashable = materializeForHash(authority);
  canonicalJsonStringify(hashable);
  const materializedAuthority = materializeAuthority(readDataField(authority, "authority"));
  const plan = materializePlan(readDataField(authority, "plan"));
  const mandate = materializeMandate(readDataField(authority, "mandate"));
  const lineage = materializeLineageSealed(readDataField(authority, "lineage"));

  assert(
    readDataField(authority, "contractVersion") === CANONICAL_INVESTING_MANDATE_AUTHORITY_CONTRACT_VERSION,
    "investing_mandate_authority_contract_version_invalid",
  );

  for (const key of ["userId", "tenantId", "membershipId", "portfolioId", "accountId"] as const) {
    assertId(materializedAuthority[key], `investing_mandate_authority_${key}_invalid`);
  }
  assert(
    materializedAuthority.environment === "paper" || materializedAuthority.environment === "simulation",
    "investing_mandate_authority_environment_invalid",
  );
  assertCurrency(materializedAuthority.accountBaseCurrency, "investing_mandate_authority_account_currency_invalid");

  assertId(plan.planId, "investing_mandate_authority_plan_id_invalid");
  assertPlanVersion(plan.planVersion);
  assert(plan.mode === "investing", "investing_mandate_authority_plan_mode_invalid");
  assert(plan.status === "active", "investing_mandate_authority_plan_status_invalid");
  assertTimestamp(plan.activatedAt, "investing_mandate_authority_plan_activated_at_invalid");
  assertTimestamp(plan.updatedAt, "investing_mandate_authority_plan_updated_at_invalid");
  assert(plan.structuredSchemaVersion === 1, "investing_mandate_authority_structured_schema_invalid");

  assert(
    mandate.baseCurrency === materializedAuthority.accountBaseCurrency,
    "investing_mandate_authority_currency_mismatch",
  );

  assertTimestamp(lineage.asOf, "investing_mandate_authority_as_of_invalid");
  assertTemporalLineage(plan.activatedAt, plan.updatedAt, lineage.asOf);
  assert(
    typeof lineage.authorityFingerprint === "string" &&
      SHA256_PATTERN.test(lineage.authorityFingerprint),
    "investing_mandate_authority_fingerprint_invalid",
  );
  assert(
    hashCanonicalInvestingMandateAuthorityV1(authority) === lineage.authorityFingerprint,
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

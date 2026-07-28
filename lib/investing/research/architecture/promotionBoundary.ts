import type { DatasetVersionRef } from "../contracts/datasets";
import {
  PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
  type PromotionEligibilityEnvelope,
} from "../contracts/promotion";
import type { VersionedReference } from "../contracts/primitives";
import type { PortfolioAssumptions } from "../contracts/hypotheses";
import type { InvestingResearchScope } from "../contracts/scope";
import type {
  ScientificDecision,
  ValidationReport,
} from "../contracts/validation";
import {
  validateDatasetVersionRef,
  validateInvestingResearchScope,
  validatePromotionEligibilityEnvelope,
  validateScientificDecision,
  validateValidationReport,
} from "../contracts/runtimeValidation";
import type {
  ReproducibilityManifestEnvelope,
  ReproducibleExecutionIdentity,
  ReproducibleExecutionIdentityMaterial,
  ScientificExperimentIdentity,
} from "../reproducibility/materials";
import {
  REPRODUCIBILITY_MANIFEST_VERSION,
} from "../reproducibility/versions";
import {
  validateReproducibilityManifestEnvelope,
  validateReproducibleExecutionIdentityEnvelope,
  validateReproducibleExecutionIdentityMaterial,
  validateScientificExperimentIdentityEnvelope,
} from "../reproducibility/runtimeValidation";
import type {
  ArchitectureIssue,
  ArchitectureValidationResult,
} from "./dependencyGraph";
import { PROMOTION_CANDIDATE_ENVELOPE_VERSION } from "./versions";

export type PromotionTarget = "shadow" | "investing_paper";
export const PROMOTION_OPERATIONAL_STATES = [
  "scientifically_validated", "promotion_eligible", "promotion_prepared",
  "promotion_submitted", "promotion_accepted", "promotion_rejected",
  "promotion_blocked", "promotion_revoked",
] as const;

export type PromotionDatasetEvidence = Readonly<{
  version: DatasetVersionRef;
  state: "research_ready";
}>;

export type PromotionCandidateEnvelope = Readonly<{
  contractVersion: typeof PROMOTION_CANDIDATE_ENVELOPE_VERSION;
  scope: InvestingResearchScope;
  scientificIdentity: ScientificExperimentIdentity;
  executionIdentity: ReproducibleExecutionIdentity;
  executionMaterial: ReproducibleExecutionIdentityMaterial;
  manifest: ReproducibilityManifestEnvelope;
  datasets: readonly PromotionDatasetEvidence[];
  validationReport: ValidationReport;
  scientificDecision: ScientificDecision & Readonly<{ outcome: "validated" }>;
  promotionEligibility: PromotionEligibilityEnvelope;
  candidate: VersionedReference;
  strategy: VersionedReference;
  portfolioConfiguration: PortfolioAssumptions;
  costModel: VersionedReference;
  benchmark: VersionedReference;
  riskCapacityReferences: readonly VersionedReference[];
  correlationId: string;
  idempotencyKey: string;
  contractVersions: Readonly<{
    scientificContracts: typeof PROMOTION_ELIGIBILITY_ENVELOPE_VERSION;
    reproducibility: typeof REPRODUCIBILITY_MANIFEST_VERSION;
    promotionBoundary: typeof PROMOTION_CANDIDATE_ENVELOPE_VERSION;
  }>;
  requestedTarget: PromotionTarget;
}>;

const TOP_LEVEL_KEYS = [
  "contractVersion", "scope", "scientificIdentity", "executionIdentity",
  "executionMaterial", "manifest", "datasets", "validationReport",
  "scientificDecision", "promotionEligibility", "candidate", "strategy",
  "portfolioConfiguration", "costModel", "benchmark",
  "riskCapacityReferences", "correlationId", "idempotencyKey",
  "contractVersions", "requestedTarget",
] as const;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

function issue(
  path: string,
  reasonCode: ArchitectureIssue["reasonCode"] =
  "research.architecture.contract_invalid",
): ArchitectureValidationResult<never> {
  return { ok: false, issues: [{ path, reasonCode }] };
}
function safeTree(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string"
    || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))) return true;
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  if (Array.isArray(value)) {
    if (keys.some((key) => typeof key === "symbol"
      || (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key)))
      || Object.keys(value).length !== value.length) return false;
  }
  for (const key of keys) {
    if (typeof key === "symbol") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set
      || (key !== "length" && !descriptor.enumerable)) return false;
    if (key !== "length" && !safeTree(descriptor.value, seen)) return false;
  }
  seen.delete(value);
  return true;
}
function exactTopLevel(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const allowed = new Set<string>(TOP_LEVEL_KEYS);
  const keys = Reflect.ownKeys(value);
  return keys.length === TOP_LEVEL_KEYS.length && keys.every((key) => {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true
      && descriptor.get === undefined && descriptor.set === undefined;
  });
}
function ref(value: unknown): value is VersionedReference {
  if (typeof value !== "object" || value === null
    || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== 2) return false;
  const record = value as Record<string, unknown>;
  return Reflect.ownKeys(value).every((key) =>
    typeof key === "string" && (key === "id" || key === "version")
    && Object.getOwnPropertyDescriptor(value, key)?.enumerable === true)
    && typeof record.id === "string" && ID.test(record.id)
    && typeof record.version === "string" && VERSION.test(record.version);
}

/**
 * Neutral, closed parser. It establishes structural validity only. The only
 * preparation gate is `verifyPromotionCandidateForPreparation` in the
 * non-exported server module.
 */
export function validatePromotionCandidateEnvelope(
  input: unknown,
): ArchitectureValidationResult<PromotionCandidateEnvelope> {
  if (!exactTopLevel(input) || !safeTree(input)) return issue("promotion");
  if (input.contractVersion !== PROMOTION_CANDIDATE_ENVELOPE_VERSION) {
    return issue("promotion.contractVersion", "research.promotion.contract_version_unsupported");
  }
  if (input.requestedTarget !== "shadow"
    && input.requestedTarget !== "investing_paper") {
    return issue("promotion.requestedTarget", "research.promotion.target_forbidden");
  }
  const scope = validateInvestingResearchScope(input.scope);
  if (!scope.ok) return issue("promotion.scope", "research.promotion.scope_mismatch");
  const scientific = validateScientificExperimentIdentityEnvelope(input.scientificIdentity);
  const execution = validateReproducibleExecutionIdentityEnvelope(input.executionIdentity);
  const executionMaterial = validateReproducibleExecutionIdentityMaterial(input.executionMaterial);
  const manifest = validateReproducibilityManifestEnvelope(input.manifest);
  if (!scientific.ok || !execution.ok || !executionMaterial.ok || !manifest.ok) {
    return issue("promotion.identities", "research.promotion.identity_mismatch");
  }
  if (!Array.isArray(input.datasets) || input.datasets.length === 0) {
    return issue("promotion.datasets", "research.promotion.manifest_invalid");
  }
  const datasets: PromotionDatasetEvidence[] = [];
  for (const [index, entry] of input.datasets.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)
      || Object.getPrototypeOf(entry) !== Object.prototype
      || Reflect.ownKeys(entry).length !== 2
      || !("version" in entry) || !("state" in entry)
      || entry.state !== "research_ready") {
      return issue(`promotion.datasets[${index}]`, "research.promotion.manifest_invalid");
    }
    const version = validateDatasetVersionRef(entry.version);
    if (!version.ok) return issue(`promotion.datasets[${index}]`, "research.promotion.manifest_invalid");
    datasets.push({ version: version.value, state: "research_ready" });
  }
  const report = validateValidationReport(input.validationReport);
  if (!report.ok) return issue("promotion.validationReport", "research.promotion.report_incomplete");
  const decision = validateScientificDecision(input.scientificDecision);
  if (!decision.ok || decision.value.outcome !== "validated") {
    return issue("promotion.scientificDecision", "research.promotion.decision_not_eligible");
  }
  const eligibility = validatePromotionEligibilityEnvelope(input.promotionEligibility);
  if (!eligibility.ok || eligibility.value.state !== "promotion_eligible") {
    return issue("promotion.promotionEligibility", "research.promotion.decision_not_eligible");
  }
  if (!ref(input.candidate) || !ref(input.strategy)
    || typeof input.portfolioConfiguration !== "object"
    || input.portfolioConfiguration === null
    || Array.isArray(input.portfolioConfiguration) || !ref(input.costModel)
    || !ref(input.benchmark) || !Array.isArray(input.riskCapacityReferences)
    || input.riskCapacityReferences.length === 0
    || !input.riskCapacityReferences.every(ref)
    || typeof input.correlationId !== "string" || !ID.test(input.correlationId)
    || typeof input.idempotencyKey !== "string" || !ID.test(input.idempotencyKey)
    || typeof input.contractVersions !== "object"
    || input.contractVersions === null || Array.isArray(input.contractVersions)
    || Object.getPrototypeOf(input.contractVersions) !== Object.prototype) {
    return issue("promotion");
  }
  const versions = input.contractVersions as Record<string, unknown>;
  if (Reflect.ownKeys(versions).length !== 3
    || versions.scientificContracts
      !== PROMOTION_ELIGIBILITY_ENVELOPE_VERSION
    || versions.reproducibility !== REPRODUCIBILITY_MANIFEST_VERSION
    || versions.promotionBoundary !== PROMOTION_CANDIDATE_ENVELOPE_VERSION) {
    return issue("promotion.contractVersions", "research.promotion.contract_version_unsupported");
  }
  return {
    ok: true,
    value: structuredClone({
      contractVersion: PROMOTION_CANDIDATE_ENVELOPE_VERSION,
      scope: scope.value,
      scientificIdentity: scientific.value,
      executionIdentity: execution.value,
      executionMaterial: executionMaterial.value,
      manifest: manifest.value,
      datasets,
      validationReport: report.value,
      scientificDecision: decision.value as ScientificDecision & { outcome: "validated" },
      promotionEligibility: eligibility.value,
      candidate: input.candidate,
      strategy: input.strategy,
      portfolioConfiguration: input.portfolioConfiguration as PortfolioAssumptions,
      costModel: input.costModel,
      benchmark: input.benchmark,
      riskCapacityReferences: input.riskCapacityReferences,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      contractVersions: {
        scientificContracts: PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
        reproducibility: REPRODUCIBILITY_MANIFEST_VERSION,
        promotionBoundary: PROMOTION_CANDIDATE_ENVELOPE_VERSION,
      },
      requestedTarget: input.requestedTarget,
    }),
  };
}

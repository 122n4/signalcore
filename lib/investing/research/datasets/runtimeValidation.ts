import { canonicalizeResearchContract } from "../contracts/runtimeValidation";
import type { InvestingResearchScientificScope } from "../contracts";
import { DATASET_REASON_CODES, type DatasetReasonCode, type DatasetResult } from "./reasonCodes";
import type { AcquisitionOutcome, AcquisitionRequest, DatasetRequirementEnvelope, DatasetRequirementMaterial, DatasetStorageReference, DatasetVersionMaterial } from "./types";
import { ACQUISITION_POLICY_VERSION, ACQUISITION_REQUEST_VERSION, DATASET_REQUIREMENT_VERSION, DATASET_STORAGE_REFERENCE_VERSION, DATASET_VERSION_MATERIAL_VERSION, NORMALIZATION_POLICY_VERSION } from "./versions";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const FORBIDDEN = /(^\*$|all\s*(symbols|markets|timeframes)|[,;])/iu;
const failure = <T>(path: string, reasonCode: DatasetReasonCode): DatasetResult<T> =>
  ({ ok: false, issues: [{ path, reasonCode }] });
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const iso = (value: unknown) => typeof value === "string"
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const safe = (value: unknown) => canonicalizeResearchContract(value).ok;
const scope = (value: unknown): value is InvestingResearchScientificScope =>
  record(value) && exact(value, ["tenantId", "ownerId", "portfolioId", "accountId"])
  && Object.values(value).every((entry) => typeof entry === "string" && ID.test(entry));

export function validateDatasetRequirementMaterial(input: unknown): DatasetResult<DatasetRequirementMaterial> {
  if (!safe(input) || !record(input)) return failure("requirement", "dataset_requirement_invalid");
  const keys = ["contractVersion","scientificScope","instrument","dataKind","timeframe","range","timezonePolicy","adjustmentPolicy","sessionPolicy","fields","normalizationPolicyVersion","scientificPurpose","requestedCoverage","provenanceRequirements"];
  if (!exact(input, keys)) return failure("requirement", "dataset_requirement_invalid");
  if (input.contractVersion !== DATASET_REQUIREMENT_VERSION) return failure("requirement.contractVersion", "dataset_contract_version_unsupported");
  if (!scope(input.scientificScope) || !record(input.instrument)
    || !exact(input.instrument, ["symbol","assetClass","market","currency"])
    || typeof input.instrument.symbol !== "string" || !ID.test(input.instrument.symbol)
    || FORBIDDEN.test(input.instrument.symbol)) return failure("requirement.instrument", FORBIDDEN.test(String(input.instrument && (input.instrument as Record<string, unknown>).symbol)) ? "dataset_requirement_forbidden_bulk" : "dataset_requirement_invalid");
  if (!["equity","forex","crypto","fund","index"].includes(String(input.instrument.assetClass))
    || ![input.instrument.market, input.instrument.currency].every((v) => v === null || (typeof v === "string" && ID.test(v)))
    || input.dataKind !== "price_bars"
    || !["1min","5min","15min","30min","45min","1h","2h","4h","1day","1week","1month"].includes(String(input.timeframe))) return failure("requirement", "dataset_requirement_invalid");
  if (!record(input.range) || !exact(input.range, ["startInclusive","endExclusive"])
    || !iso(input.range.startInclusive) || !iso(input.range.endExclusive)
    || Date.parse(input.range.startInclusive as string) >= Date.parse(input.range.endExclusive as string)) return failure("requirement.range", "dataset_requirement_unbounded");
  if (!record(input.timezonePolicy) || !exact(input.timezonePolicy, ["source","canonical","calendar"])
    || typeof input.timezonePolicy.source !== "string" || input.timezonePolicy.canonical !== "UTC"
    || typeof input.timezonePolicy.calendar !== "string"
    || !["raw","split_adjusted","all_adjusted"].includes(String(input.adjustmentPolicy))
    || !["all","regular"].includes(String(input.sessionPolicy))
    || !Array.isArray(input.fields) || input.fields.length === 0
    || input.fields.some((f) => !["timestamp","open","high","low","close","volume"].includes(String(f)))
    || new Set(input.fields).size !== input.fields.length
    || input.normalizationPolicyVersion !== NORMALIZATION_POLICY_VERSION
    || typeof input.scientificPurpose !== "string" || input.scientificPurpose.trim() === ""
    || !record(input.requestedCoverage) || !exact(input.requestedCoverage, ["minimumRatio"])
    || typeof input.requestedCoverage.minimumRatio !== "number" || input.requestedCoverage.minimumRatio < 0 || input.requestedCoverage.minimumRatio > 1
    || !record(input.provenanceRequirements) || !exact(input.provenanceRequirements, ["providerRequestId","sourceTimezone"])
    || typeof input.provenanceRequirements.providerRequestId !== "boolean" || typeof input.provenanceRequirements.sourceTimezone !== "boolean") return failure("requirement", "dataset_requirement_invalid");
  return { ok: true, value: structuredClone(input) as DatasetRequirementMaterial };
}

export function validateDatasetRequirementEnvelope(input: unknown): DatasetResult<DatasetRequirementEnvelope> {
  if (!safe(input) || !record(input) || !exact(input, ["requirementId","material","createdAt","correlationId"])) return failure("requirementEnvelope", "dataset_requirement_invalid");
  const material = validateDatasetRequirementMaterial(input.material);
  if (!material.ok || typeof input.requirementId !== "string" || !/^irdsreq_v1_[a-f0-9]{64}$/u.test(input.requirementId)
    || !iso(input.createdAt) || typeof input.correlationId !== "string" || !ID.test(input.correlationId)) return failure("requirementEnvelope", "dataset_requirement_invalid");
  return { ok: true, value: structuredClone(input) as DatasetRequirementEnvelope };
}

export function validateAcquisitionRequest(input: unknown): DatasetResult<AcquisitionRequest> {
  if (!safe(input) || !record(input)) return failure("acquisition", "acquisition_request_invalid");
  const keys = ["contractVersion","requirementId","scope","requirement","acquisitionPolicyVersion","providerPreference","priority","idempotencyKey","requestedAt","requestedBy","correlationId","state","attempt","outcome"];
  if (!exact(input, keys) || input.contractVersion !== ACQUISITION_REQUEST_VERSION
    || input.acquisitionPolicyVersion !== ACQUISITION_POLICY_VERSION || input.state !== "requested" || input.outcome !== null
    || typeof input.requirementId !== "string" || !/^irdsreq_v1_[a-f0-9]{64}$/u.test(input.requirementId)
    || !scope(input.scope) || !validateDatasetRequirementMaterial(input.requirement).ok
    || !["low","normal","high"].includes(String(input.priority))
    || ![input.idempotencyKey,input.requestedBy,input.correlationId].every((v) => typeof v === "string" && ID.test(v))
    || !iso(input.requestedAt) || !(input.providerPreference === null || (typeof input.providerPreference === "string" && ID.test(input.providerPreference)))
    || !record(input.attempt) || !exact(input.attempt, ["number","priorAttemptId"])
    || !Number.isInteger(input.attempt.number) || Number(input.attempt.number) < 1
    || !(input.attempt.priorAttemptId === null || (typeof input.attempt.priorAttemptId === "string" && ID.test(input.attempt.priorAttemptId)))) return failure("acquisition", "acquisition_request_invalid");
  return { ok: true, value: structuredClone(input) as AcquisitionRequest };
}

export function validateAcquisitionOutcome(input: unknown): DatasetResult<AcquisitionOutcome> {
  if (!safe(input) || !record(input) || typeof input.kind !== "string") return failure("outcome", "acquisition_request_invalid");
  const commonProvider = typeof input.provider === "string" && ID.test(input.provider);
  if (input.kind === "acquired" && exact(input, ["kind","provider","providerVersion","providerSymbol","providerRequestId","sourceTimezone","rawHash","normalizedHash","recordCount","observedCoverage","storage"])
    && commonProvider && [input.providerVersion,input.providerSymbol,input.sourceTimezone].every((v) => typeof v === "string" && ID.test(v))
    && (input.providerRequestId === null || typeof input.providerRequestId === "string")
    && typeof input.rawHash === "string" && HASH.test(input.rawHash) && typeof input.normalizedHash === "string" && HASH.test(input.normalizedHash)
    && Number.isInteger(input.recordCount) && Number(input.recordCount) > 0
    && record(input.observedCoverage) && exact(input.observedCoverage, ["observedStart","observedEnd","firstTimestamp","lastTimestamp"])
    && [input.observedCoverage.observedStart,input.observedCoverage.observedEnd,input.observedCoverage.firstTimestamp,input.observedCoverage.lastTimestamp].every(iso)
    && Date.parse(input.observedCoverage.observedStart as string) <= Date.parse(input.observedCoverage.firstTimestamp as string)
    && Date.parse(input.observedCoverage.lastTimestamp as string) <= Date.parse(input.observedCoverage.observedEnd as string)
    && Date.parse(input.observedCoverage.firstTimestamp as string) <= Date.parse(input.observedCoverage.lastTimestamp as string)
    && validateStorageReference(input.storage).ok
    && (input.storage as DatasetStorageReference).rawContentHash === input.rawHash
    && (input.storage as DatasetStorageReference).normalizedContentHash === input.normalizedHash) return { ok: true, value: structuredClone(input) as AcquisitionOutcome };
  if (input.kind === "confirmed_no_data" && exact(input, ["kind","provider","providerRequestId","evidence","range"])
    && commonProvider && typeof input.evidence === "string" && input.evidence.trim() !== "" && record(input.range)
    && exact(input.range, ["startInclusive","endExclusive"]) && iso(input.range.startInclusive) && iso(input.range.endExclusive)) return { ok: true, value: structuredClone(input) as AcquisitionOutcome };
  if (input.kind === "provider_unavailable" && exact(input, ["kind","provider","classification","retryable","retryAfterSeconds"])
    && commonProvider && typeof input.classification === "string" && typeof input.retryable === "boolean"
    && (input.retryAfterSeconds === null || (Number.isInteger(input.retryAfterSeconds) && Number(input.retryAfterSeconds) >= 0))) return { ok: true, value: structuredClone(input) as AcquisitionOutcome };
  if (input.kind === "unsupported" && exact(input, ["kind","provider","reasonCode"]) && commonProvider && DATASET_REASON_CODES.includes(input.reasonCode as DatasetReasonCode)) return { ok: true, value: structuredClone(input) as AcquisitionOutcome };
  if (input.kind === "failed" && exact(input, ["kind","reasonCode","classification","retryable","sanitizedError"])
    && DATASET_REASON_CODES.includes(input.reasonCode as DatasetReasonCode) && typeof input.classification === "string"
    && typeof input.retryable === "boolean" && typeof input.sanitizedError === "string" && !/api[_-]?key|authorization|https?:\/\//iu.test(input.sanitizedError)) return { ok: true, value: structuredClone(input) as AcquisitionOutcome };
  if (input.kind === "cancelled" && exact(input, ["kind","reasonCode"]) && input.reasonCode === "acquisition_transition_invalid") return { ok: true, value: structuredClone(input) as AcquisitionOutcome };
  return failure("outcome", "acquisition_request_invalid");
}

export function validateStorageReference(input: unknown): DatasetResult<DatasetStorageReference> {
  if (!safe(input) || !record(input) || !exact(input, ["contractVersion","key","rawContentHash","normalizedContentHash","mediaType","schemaVersion","byteSize","integrityState"])
    || input.contractVersion !== DATASET_STORAGE_REFERENCE_VERSION || typeof input.key !== "string"
    || input.key.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(input.key) || input.key.split(/[\\/]/u).includes("..")
    || !/^[a-zA-Z0-9._/-]+$/u.test(input.key) || typeof input.rawContentHash !== "string" || !HASH.test(input.rawContentHash)
    || typeof input.normalizedContentHash !== "string" || !HASH.test(input.normalizedContentHash)
    || input.mediaType !== "application/x-ndjson" || typeof input.schemaVersion !== "string"
    || !Number.isInteger(input.byteSize) || Number(input.byteSize) < 0 || input.integrityState !== "verified") return failure("storage", "dataset_storage_integrity_failed");
  return { ok: true, value: structuredClone(input) as DatasetStorageReference };
}

export function validateDatasetVersionMaterial(input: unknown): DatasetResult<DatasetVersionMaterial> {
  if (!safe(input) || !record(input) || !exact(input, ["contractVersion","requirementId","acquisitionJobId","acquisitionAttempt","scope","provider","storage","normalizationPolicyVersion","coverage","sourceTimezone","canonicalTimezone","acquiredAt","normalizedAt","state","supersedes"])) return failure("datasetVersion", "dataset_payload_invalid");
  if (input.contractVersion !== DATASET_VERSION_MATERIAL_VERSION) return failure("datasetVersion.contractVersion", "dataset_contract_version_unsupported");
  if (input.state !== "awaiting_quality") return failure("datasetVersion.state", String(input.state) === "research_ready" ? "dataset_research_ready_forbidden" : "dataset_not_awaiting_quality");
  if (!scope(input.scope) || typeof input.requirementId !== "string" || typeof input.acquisitionJobId !== "string"
    || !Number.isInteger(input.acquisitionAttempt) || Number(input.acquisitionAttempt) < 1
    || !record(input.provider) || !exact(input.provider, ["id","version","symbol","requestId"])
    || ![input.provider.id,input.provider.version,input.provider.symbol].every((v) => typeof v === "string" && ID.test(v))
    || !(input.provider.requestId === null || typeof input.provider.requestId === "string")
    || !validateStorageReference(input.storage).ok || input.normalizationPolicyVersion !== NORMALIZATION_POLICY_VERSION
    || !record(input.coverage) || !exact(input.coverage, ["observedStart","observedEnd","recordCount","firstTimestamp","lastTimestamp"])
    || ![input.coverage.observedStart,input.coverage.observedEnd,input.coverage.firstTimestamp,input.coverage.lastTimestamp,input.acquiredAt,input.normalizedAt].every(iso)
    || !Number.isInteger(input.coverage.recordCount) || Number(input.coverage.recordCount) < 1
    || Date.parse(input.coverage.observedStart as string) > Date.parse(input.coverage.firstTimestamp as string)
    || Date.parse(input.coverage.lastTimestamp as string) > Date.parse(input.coverage.observedEnd as string)
    || Date.parse(input.coverage.firstTimestamp as string) > Date.parse(input.coverage.lastTimestamp as string)
    || typeof input.sourceTimezone !== "string" || input.canonicalTimezone !== "UTC"
    || !(input.supersedes === null || typeof input.supersedes === "string")) return failure("datasetVersion", "dataset_payload_invalid");
  return { ok: true, value: structuredClone(input) as DatasetVersionMaterial };
}

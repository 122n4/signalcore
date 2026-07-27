import {
  DATASET_VERSION_REF_VERSION,
} from "../contracts/datasets";
import {
  EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  type ExperimentIdentityMaterial,
} from "../contracts/experiments";
import type {
  RuntimeValidationResult,
  ValidationIssue,
  VersionedReference,
} from "../contracts/primitives";
import {
  isInvestingResearchReasonCode,
  type InvestingResearchReasonCode,
} from "../contracts/reasonCodes";
import {
  RESEARCH_ARTIFACT_REF_VERSION,
  type ResearchArtifactRef,
} from "../contracts/runs";
import {
  canonicalizeResearchContract,
  validateDatasetVersionRef,
  validateExperimentIdentityMaterial,
  validateResearchArtifactRef,
} from "../contracts/runtimeValidation";
import type {
  ArtifactExpectation,
  ArtifactIdentity,
  ArtifactIdentityMaterial,
  ArtifactIdentityProjection,
  ExecutionEnvironmentRef,
  ManifestArtifactRef,
  ManifestOperationalMetadata,
  ReproducibilityManifestCore,
  ReproducibilityManifestEnvelope,
  ReproducibleExecutionIdentity,
  ReproducibleExecutionIdentityMaterial,
  ScientificExperimentIdentity,
  SourceRevision,
} from "./materials";
import {
  EXECUTION_ENVIRONMENT_VERSION,
  SOURCE_REVISION_VERSION,
} from "./materials";
import {
  ARTIFACT_IDENTITY_DOMAIN,
  ARTIFACT_IDENTITY_VERSION,
  EXECUTION_IDENTITY_DOMAIN,
  MANIFEST_IDENTITY_DOMAIN,
  REPRODUCIBILITY_MANIFEST_VERSION,
  REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
  RESEARCH_CANONICALIZATION_VERSION,
  RESEARCH_HASH_ALGORITHM,
  SCIENTIFIC_IDENTITY_DOMAIN,
  SCIENTIFIC_IDENTITY_VERSION,
} from "./versions";

type UnknownRecord = Record<string, unknown>;
type Issues = ValidationIssue[];

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SCIENTIFIC_ID = /^irexp_v1_[a-f0-9]{64}$/u;
const EXECUTION_ID = /^irexec_v1_[a-f0-9]{64}$/u;
const MANIFEST_ID = /^irman_v1_[a-f0-9]{64}$/u;
const ARTIFACT_ID = /^irart_v1_[a-f0-9]{64}$/u;

function issue(
  issues: Issues,
  path: string,
  reasonCode: InvestingResearchReasonCode = "research.contract.invalid",
) {
  issues.push({ path, reasonCode });
}

function record(value: unknown): value is UnknownRecord {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  path: string,
  issues: Issues,
): boolean {
  const allowedSet = new Set(allowed);
  let valid = true;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      issue(issues, `${path}.<symbol>`, "research.contract.unexpected_property");
      valid = false;
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      issue(issues, `${path}.<property>`, "research.contract.unexpected_property");
      valid = false;
      continue;
    }
    if (!allowedSet.has(key)) {
      issue(issues, `${path}.${key}`, "research.contract.unexpected_property");
      valid = false;
    }
  }
  return valid;
}

function safeArrayValues(
  value: unknown,
  path: string,
  issues: Issues,
): readonly unknown[] | null {
  if (!Array.isArray(value)) {
    issue(issues, path);
    return null;
  }
  const values: unknown[] = [];
  let valid = true;
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (
      typeof key !== "string"
      || !/^(?:0|[1-9]\d*)$/u.test(key)
      || Number(key) >= value.length
    ) {
      issue(issues, `${path}.<property>`, "research.contract.unexpected_property");
      valid = false;
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      issue(issues, `${path}[${key}]`, "research.contract.unexpected_property");
      valid = false;
      continue;
    }
    values[Number(key)] = descriptor.value;
  }
  let dense = values.length === value.length;
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in values)) dense = false;
  }
  if (!dense) {
    issue(issues, path, "research.contract.canonical_value_invalid");
    valid = false;
  }
  return valid ? values : null;
}

function finish<T>(value: T, issues: Issues): RuntimeValidationResult<T> {
  return issues.length === 0
    ? { ok: true, value: structuredClone(value) }
    : { ok: false, issues };
}

function identifier(value: unknown, path: string, issues: Issues) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) issue(issues, path);
}

function digest(value: unknown, path: string, issues: Issues) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    issue(issues, path, "research.dataset.hash_missing");
  }
}

function timestamp(value: unknown, path: string, issues: Issues) {
  if (
    typeof value !== "string"
    || !value.endsWith("Z")
    || !Number.isFinite(Date.parse(value))
  ) issue(issues, path);
}

function versionedRef(
  value: unknown,
  path: string,
  issues: Issues,
): value is VersionedReference {
  if (!record(value)) {
    issue(issues, path);
    return false;
  }
  if (!exactKeys(value, ["id", "version"], path, issues)) return false;
  identifier(value.id, `${path}.id`, issues);
  identifier(value.version, `${path}.version`, issues);
  return true;
}

function mergeIssues(issues: Issues, result: RuntimeValidationResult<unknown>) {
  if ("issues" in result) issues.push(...result.issues);
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  const leftCanonical = canonicalizeResearchContract(left);
  const rightCanonical = canonicalizeResearchContract(right);
  return !("issues" in leftCanonical)
    && !("issues" in rightCanonical)
    && leftCanonical.value === rightCanonical.value;
}

function parseCanonicalRecord(
  value: unknown,
  path: string,
  issues: Issues,
): UnknownRecord | null {
  if (typeof value !== "string") {
    issue(issues, path);
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!record(parsed)) {
      issue(issues, path);
      return null;
    }
    return parsed;
  } catch {
    issue(issues, path);
    return null;
  }
}

export function validateSourceRevision(
  value: unknown,
): RuntimeValidationResult<SourceRevision> {
  const issues: Issues = [];
  if (!record(value)) return finish(value as SourceRevision, [{
    path: "sourceRevision",
    reasonCode: "research.contract.invalid",
  }]);
  if (!exactKeys(value, [
    "contractVersion",
    "repositoryId",
    "vcsKind",
    "commitHash",
    "workingTreeState",
    "sourceContentHash",
  ], "sourceRevision", issues)) return finish(value as SourceRevision, issues);
  if (value.contractVersion !== SOURCE_REVISION_VERSION) {
    issue(issues, "sourceRevision.contractVersion", "research.contract.version_missing");
  }
  identifier(value.repositoryId, "sourceRevision.repositoryId", issues);
  if (value.vcsKind !== "git") issue(issues, "sourceRevision.vcsKind");
  if (!["clean", "dirty", "unavailable"].includes(String(value.workingTreeState))) {
    issue(issues, "sourceRevision.workingTreeState");
  }
  if (value.workingTreeState === "unavailable") {
    if (value.commitHash !== "" || value.sourceContentHash !== null) {
      issue(issues, "sourceRevision", "research.experiment.identity_incomplete");
    }
  } else {
    if (typeof value.commitHash !== "string" || !COMMIT.test(value.commitHash)) {
      issue(issues, "sourceRevision.commitHash");
    }
    if (value.sourceContentHash !== null) {
      digest(value.sourceContentHash, "sourceRevision.sourceContentHash", issues);
    }
  }
  return finish(value as SourceRevision, issues);
}

export function validateExecutionEnvironmentRef(
  value: unknown,
): RuntimeValidationResult<ExecutionEnvironmentRef> {
  const issues: Issues = [];
  if (!record(value)) return finish(value as ExecutionEnvironmentRef, [{
    path: "environment",
    reasonCode: "research.contract.invalid",
  }]);
  if (!exactKeys(value, [
    "contractVersion",
    "dependencyLockHash",
    "engineBuildHash",
    "runtime",
    "platform",
    "architecture",
    "rng",
    "numericPolicy",
    "calendarPolicy",
  ], "environment", issues)) return finish(value as ExecutionEnvironmentRef, issues);
  if (value.contractVersion !== EXECUTION_ENVIRONMENT_VERSION) {
    issue(issues, "environment.contractVersion", "research.contract.version_missing");
  }
  digest(value.dependencyLockHash, "environment.dependencyLockHash", issues);
  digest(value.engineBuildHash, "environment.engineBuildHash", issues);
  versionedRef(value.runtime, "environment.runtime", issues);
  versionedRef(value.rng, "environment.rng", issues);
  versionedRef(value.numericPolicy, "environment.numericPolicy", issues);
  versionedRef(value.calendarPolicy, "environment.calendarPolicy", issues);
  if (!["linux", "win32", "darwin"].includes(String(value.platform))) {
    issue(issues, "environment.platform");
  }
  if (!["x64", "arm64"].includes(String(value.architecture))) {
    issue(issues, "environment.architecture");
  }
  return finish(value as ExecutionEnvironmentRef, issues);
}

export function validateManifestOperationalMetadata(
  value: unknown,
): RuntimeValidationResult<ManifestOperationalMetadata> {
  const issues: Issues = [];
  if (!record(value)) {
    return {
      ok: false,
      issues: [{ path: "manifest.metadata", reasonCode: "research.contract.invalid" }],
    };
  }
  if (!exactKeys(
    value,
    ["createdAt", "createdByProcess", "warnings"],
    "manifest.metadata",
    issues,
  )) return { ok: false, issues };
  timestamp(value.createdAt, "manifest.metadata.createdAt", issues);
  const processRef = value.createdByProcess;
  const processValid = versionedRef(
    processRef,
    "manifest.metadata.createdByProcess",
    issues,
  );
  const warnings = safeArrayValues(
    value.warnings,
    "manifest.metadata.warnings",
    issues,
  );
  warnings?.forEach((warning, index) => {
    if (!isInvestingResearchReasonCode(warning)) {
      issue(
        issues,
        `manifest.metadata.warnings[${index}]`,
        "research.integrity.reason_code_unknown",
      );
    }
  });
  if (
    issues.length > 0
    || !processValid
    || !record(processRef)
    || warnings === null
  ) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      createdAt: value.createdAt as string,
      createdByProcess: {
        id: processRef.id as string,
        version: processRef.version as string,
      },
      warnings: warnings as readonly InvestingResearchReasonCode[],
    },
  };
}

function validateIdentityEnvelope(
  value: unknown,
  kind: "scientific" | "execution" | "artifact",
  issues: Issues,
): value is ScientificExperimentIdentity
  | ReproducibleExecutionIdentity
  | ArtifactIdentity {
  if (!record(value)) {
    issue(issues, kind);
    return false;
  }
  const idKey = kind === "scientific"
    ? "experimentId"
    : kind === "execution" ? "executionId" : "artifactId";
  if (!exactKeys(value, [
    "contractVersion",
    "hashAlgorithm",
    "canonicalizationVersion",
    "domain",
    "canonicalMaterial",
    "digest",
    idKey,
  ], kind, issues)) return false;
  const expected = kind === "scientific"
    ? {
      version: SCIENTIFIC_IDENTITY_VERSION,
      domain: SCIENTIFIC_IDENTITY_DOMAIN,
      pattern: SCIENTIFIC_ID,
    }
    : kind === "execution"
      ? {
        version: REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
        domain: EXECUTION_IDENTITY_DOMAIN,
        pattern: EXECUTION_ID,
      }
      : {
        version: ARTIFACT_IDENTITY_VERSION,
        domain: ARTIFACT_IDENTITY_DOMAIN,
        pattern: ARTIFACT_ID,
      };
  if (value.contractVersion !== expected.version) issue(issues, `${kind}.contractVersion`);
  if (value.hashAlgorithm !== RESEARCH_HASH_ALGORITHM) issue(issues, `${kind}.hashAlgorithm`);
  if (value.canonicalizationVersion !== RESEARCH_CANONICALIZATION_VERSION) {
    issue(issues, `${kind}.canonicalizationVersion`);
  }
  if (value.domain !== expected.domain) issue(issues, `${kind}.domain`);
  if (typeof value.canonicalMaterial !== "string" || value.canonicalMaterial === "") {
    issue(issues, `${kind}.canonicalMaterial`);
  }
  digest(value.digest, `${kind}.digest`, issues);
  if (typeof value[idKey] !== "string" || !expected.pattern.test(value[idKey])) {
    issue(issues, `${kind}.${idKey}`);
  } else if (!String(value[idKey]).endsWith(String(value.digest))) {
    issue(issues, `${kind}.${idKey}`, "research.integrity.reference_mismatch");
  }
  return true;
}

export function validateScientificExperimentIdentityEnvelope(
  value: unknown,
): RuntimeValidationResult<ScientificExperimentIdentity> {
  const issues: Issues = [];
  validateIdentityEnvelope(value, "scientific", issues);
  return finish(value as ScientificExperimentIdentity, issues);
}

export function validateReproducibleExecutionIdentityEnvelope(
  value: unknown,
): RuntimeValidationResult<ReproducibleExecutionIdentity> {
  const issues: Issues = [];
  validateIdentityEnvelope(value, "execution", issues);
  return finish(value as ReproducibleExecutionIdentity, issues);
}

export function validateArtifactIdentityEnvelope(
  value: unknown,
): RuntimeValidationResult<ArtifactIdentity> {
  const issues: Issues = [];
  validateIdentityEnvelope(value, "artifact", issues);
  return finish(value as ArtifactIdentity, issues);
}

export function validateArtifactIdentityProjection(
  value: unknown,
): RuntimeValidationResult<ArtifactIdentityProjection> {
  const issues: Issues = [];
  if (!record(value)) {
    return {
      ok: false,
      issues: [{
        path: "artifactProjection",
        reasonCode: "research.contract.invalid",
      }],
    };
  }
  if (!exactKeys(value, [
    "contractVersion",
    "scientificExperimentId",
    "reproducibleExecutionId",
    "contentHash",
    "kind",
    "mediaType",
    "schemaVersion",
    "logicalRole",
  ], "artifactProjection", issues)) return { ok: false, issues };
  if (value.contractVersion !== ARTIFACT_IDENTITY_VERSION) {
    issue(
      issues,
      "artifactProjection.contractVersion",
      "research.contract.version_missing",
    );
  }
  if (
    typeof value.scientificExperimentId !== "string"
    || !SCIENTIFIC_ID.test(value.scientificExperimentId)
  ) issue(issues, "artifactProjection.scientificExperimentId");
  if (
    typeof value.reproducibleExecutionId !== "string"
    || !EXECUTION_ID.test(value.reproducibleExecutionId)
  ) issue(issues, "artifactProjection.reproducibleExecutionId");
  digest(value.contentHash, "artifactProjection.contentHash", issues);
  for (const key of ["kind", "mediaType", "schemaVersion", "logicalRole"] as const) {
    identifier(value[key], `artifactProjection.${key}`, issues);
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      contractVersion: ARTIFACT_IDENTITY_VERSION,
      scientificExperimentId: value.scientificExperimentId as string,
      reproducibleExecutionId: value.reproducibleExecutionId as string,
      contentHash: value.contentHash as string,
      kind: value.kind as string,
      mediaType: value.mediaType as string,
      schemaVersion: value.schemaVersion as string,
      logicalRole: value.logicalRole as string,
    },
  };
}

export function validateReproducibleExecutionIdentityMaterial(
  value: unknown,
): RuntimeValidationResult<ReproducibleExecutionIdentityMaterial> {
  const issues: Issues = [];
  if (!record(value)) return finish(value as ReproducibleExecutionIdentityMaterial, [{
    path: "executionMaterial",
    reasonCode: "research.contract.invalid",
  }]);
  if (!exactKeys(value, [
    "contractVersion",
    "scientificExperimentId",
    "scientificExperimentDigest",
    "sourceRevision",
    "environment",
    "contractVersions",
  ], "executionMaterial", issues)) {
    return finish(value as ReproducibleExecutionIdentityMaterial, issues);
  }
  if (value.contractVersion !== REPRODUCIBLE_EXECUTION_IDENTITY_VERSION) {
    issue(issues, "executionMaterial.contractVersion");
  }
  if (
    typeof value.scientificExperimentId !== "string"
    || !SCIENTIFIC_ID.test(value.scientificExperimentId)
  ) issue(issues, "executionMaterial.scientificExperimentId");
  digest(
    value.scientificExperimentDigest,
    "executionMaterial.scientificExperimentDigest",
    issues,
  );
  if (
    typeof value.scientificExperimentId === "string"
    && typeof value.scientificExperimentDigest === "string"
    && !value.scientificExperimentId.endsWith(value.scientificExperimentDigest)
  ) issue(issues, "executionMaterial.scientificExperimentId", "research.integrity.reference_mismatch");
  const source = validateSourceRevision(value.sourceRevision);
  mergeIssues(issues, source);
  if (source.ok && source.value.workingTreeState !== "clean") {
    issue(issues, "executionMaterial.sourceRevision.workingTreeState");
  }
  mergeIssues(issues, validateExecutionEnvironmentRef(value.environment));
  if (!record(value.contractVersions)) {
    issue(issues, "executionMaterial.contractVersions");
  } else if (exactKeys(value.contractVersions, [
    "experimentIdentityMaterial",
    "datasetVersionRef",
    "artifactRef",
  ], "executionMaterial.contractVersions", issues)) {
    if (
      value.contractVersions.experimentIdentityMaterial
        !== EXPERIMENT_IDENTITY_MATERIAL_VERSION
      || value.contractVersions.datasetVersionRef !== DATASET_VERSION_REF_VERSION
      || value.contractVersions.artifactRef !== RESEARCH_ARTIFACT_REF_VERSION
    ) issue(issues, "executionMaterial.contractVersions");
  }
  return finish(value as ReproducibleExecutionIdentityMaterial, issues);
}

function validateArtifactExpectation(
  value: unknown,
  path: string,
  issues: Issues,
): value is ArtifactExpectation {
  if (!record(value)) {
    issue(issues, path);
    return false;
  }
  if (!exactKeys(value, [
    "kind",
    "logicalRole",
    "mediaType",
    "schemaVersion",
    "required",
  ], path, issues)) return false;
  for (const key of ["kind", "logicalRole", "mediaType", "schemaVersion"] as const) {
    identifier(value[key], `${path}.${key}`, issues);
  }
  if (typeof value.required !== "boolean") issue(issues, `${path}.required`);
  return true;
}

function validateManifestArtifactRef(
  value: unknown,
  path: string,
  issues: Issues,
): value is ManifestArtifactRef {
  if (!record(value)) {
    issue(issues, path);
    return false;
  }
  if (!exactKeys(value, [
    "identity",
    "scientificExperimentId",
    "reproducibleExecutionId",
    "contentHash",
    "kind",
    "mediaType",
    "schemaVersion",
    "logicalRole",
  ], path, issues)) return false;
  validateIdentityEnvelope(value.identity, "artifact", issues);
  if (typeof value.scientificExperimentId !== "string"
    || !SCIENTIFIC_ID.test(value.scientificExperimentId)) {
    issue(issues, `${path}.scientificExperimentId`);
  }
  if (typeof value.reproducibleExecutionId !== "string"
    || !EXECUTION_ID.test(value.reproducibleExecutionId)) {
    issue(issues, `${path}.reproducibleExecutionId`);
  }
  digest(value.contentHash, `${path}.contentHash`, issues);
  for (const key of ["kind", "mediaType", "schemaVersion", "logicalRole"] as const) {
    identifier(value[key], `${path}.${key}`, issues);
  }
  return true;
}

export function validateReproducibilityManifestCore(
  value: unknown,
): RuntimeValidationResult<ReproducibilityManifestCore> {
  const issues: Issues = [];
  if (!record(value)) return finish(value as ReproducibilityManifestCore, [{
    path: "manifestCore",
    reasonCode: "research.contract.invalid",
  }]);
  if (!exactKeys(value, [
    "contractVersion",
    "scientificIdentity",
    "executionIdentity",
    "dataset",
    "hypothesis",
    "candidate",
    "sourceRevision",
    "environment",
    "strategyContract",
    "engineContract",
    "validationProfile",
    "configurationVersion",
    "randomSeed",
    "artifactExpectations",
    "artifacts",
  ], "manifestCore", issues)) return finish(value as ReproducibilityManifestCore, issues);
  if (value.contractVersion !== REPRODUCIBILITY_MANIFEST_VERSION) {
    issue(issues, "manifestCore.contractVersion");
  }
  validateIdentityEnvelope(value.scientificIdentity, "scientific", issues);
  validateIdentityEnvelope(value.executionIdentity, "execution", issues);
  mergeIssues(issues, validateDatasetVersionRef(value.dataset));
  versionedRef(value.hypothesis, "manifestCore.hypothesis", issues);
  versionedRef(value.candidate, "manifestCore.candidate", issues);
  mergeIssues(issues, validateSourceRevision(value.sourceRevision));
  mergeIssues(issues, validateExecutionEnvironmentRef(value.environment));
  versionedRef(value.strategyContract, "manifestCore.strategyContract", issues);
  versionedRef(value.engineContract, "manifestCore.engineContract", issues);
  versionedRef(value.validationProfile, "manifestCore.validationProfile", issues);
  identifier(value.configurationVersion, "manifestCore.configurationVersion", issues);
  if (value.randomSeed !== null) {
    identifier(value.randomSeed, "manifestCore.randomSeed", issues);
  }
  const expectations = safeArrayValues(
    value.artifactExpectations,
    "manifestCore.artifactExpectations",
    issues,
  );
  if (expectations !== null) {
    expectations.forEach((entry, index) =>
      validateArtifactExpectation(entry, `manifestCore.artifactExpectations[${index}]`, issues));
  }
  const artifacts = safeArrayValues(
    value.artifacts,
    "manifestCore.artifacts",
    issues,
  );
  if (artifacts !== null) {
    artifacts.forEach((entry, index) =>
      validateManifestArtifactRef(entry, `manifestCore.artifacts[${index}]`, issues));
    const ids = artifacts
      .filter(record)
      .map((entry) => entry.identity)
      .filter(record)
      .map((identity) => identity.artifactId);
    if (new Set(ids).size !== ids.length) {
      issue(
        issues,
        "manifestCore.artifacts",
        "research.integrity.duplicate_value",
      );
    }
  }
  if (record(value.scientificIdentity) && record(value.executionIdentity)) {
    const scientificMaterial = parseCanonicalRecord(
      value.scientificIdentity.canonicalMaterial,
      "manifestCore.scientificIdentity.canonicalMaterial",
      issues,
    );
    const executionMaterial = parseCanonicalRecord(
      value.executionIdentity.canonicalMaterial,
      "manifestCore.executionIdentity.canonicalMaterial",
      issues,
    );
    if (
      scientificMaterial !== null
      && (
        !record(value.hypothesis)
        || !record(value.candidate)
        || !record(value.dataset)
        || scientificMaterial.hypothesisId !== value.hypothesis.id
        || scientificMaterial.hypothesisVersion !== value.hypothesis.version
        || scientificMaterial.candidateId !== value.candidate.id
        || scientificMaterial.candidateVersion !== value.candidate.version
        || scientificMaterial.datasetVersionId !== value.dataset.datasetVersionId
        || scientificMaterial.datasetManifestHash !== value.dataset.manifestHash
        || scientificMaterial.datasetContentHash
          !== value.dataset.aggregateContentHash
        || !canonicalEqual(scientificMaterial.strategyContract, value.strategyContract)
        || !canonicalEqual(scientificMaterial.engineContract, value.engineContract)
        || !canonicalEqual(
          scientificMaterial.validationProfile,
          value.validationProfile,
        )
        || scientificMaterial.configurationVersion !== value.configurationVersion
        || scientificMaterial.randomSeed !== value.randomSeed
      )
    ) {
      issue(
        issues,
        "manifestCore.scientificIdentity",
        "research.integrity.reference_mismatch",
      );
    }
    if (
      executionMaterial !== null
      && (
        executionMaterial.scientificExperimentId
          !== value.scientificIdentity.experimentId
        || !canonicalEqual(executionMaterial.sourceRevision, value.sourceRevision)
        || !canonicalEqual(executionMaterial.environment, value.environment)
      )
    ) {
      issue(
        issues,
        "manifestCore.executionIdentity",
        "research.integrity.reference_mismatch",
      );
    }
  }
  return finish(value as ReproducibilityManifestCore, issues);
}

export function validateReproducibilityManifestEnvelope(
  value: unknown,
): RuntimeValidationResult<ReproducibilityManifestEnvelope> {
  const issues: Issues = [];
  if (!record(value)) return finish(value as ReproducibilityManifestEnvelope, [{
    path: "manifest",
    reasonCode: "research.contract.invalid",
  }]);
  if (!exactKeys(value, [
    "contractVersion",
    "manifestId",
    "coreDigest",
    "core",
    "createdAt",
    "createdByProcess",
    "warnings",
  ], "manifest", issues)) return finish(value as ReproducibilityManifestEnvelope, issues);
  if (value.contractVersion !== REPRODUCIBILITY_MANIFEST_VERSION) {
    issue(issues, "manifest.contractVersion");
  }
  if (typeof value.manifestId !== "string" || !MANIFEST_ID.test(value.manifestId)) {
    issue(issues, "manifest.manifestId");
  }
  digest(value.coreDigest, "manifest.coreDigest", issues);
  if (
    typeof value.manifestId === "string"
    && typeof value.coreDigest === "string"
    && !value.manifestId.endsWith(value.coreDigest)
  ) issue(issues, "manifest.manifestId", "research.integrity.reference_mismatch");
  mergeIssues(issues, validateReproducibilityManifestCore(value.core));
  timestamp(value.createdAt, "manifest.createdAt", issues);
  versionedRef(value.createdByProcess, "manifest.createdByProcess", issues);
  const warnings = safeArrayValues(value.warnings, "manifest.warnings", issues);
  if (warnings !== null) {
    warnings.forEach((warning, index) => {
      if (!isInvestingResearchReasonCode(warning)) {
        issue(
          issues,
          `manifest.warnings[${index}]`,
          "research.integrity.reason_code_unknown",
        );
      }
    });
  }
  return finish(value as ReproducibilityManifestEnvelope, issues);
}

export function validateArtifactIdentityMaterial(
  value: unknown,
): RuntimeValidationResult<ArtifactIdentityMaterial> {
  const issues: Issues = [];
  if (!record(value)) return finish(value as ArtifactIdentityMaterial, [{
    path: "artifactMaterial",
    reasonCode: "research.contract.invalid",
  }]);
  if (!exactKeys(value, [
    "contractVersion",
    "scientificIdentity",
    "executionIdentity",
    "executionMaterial",
    "artifact",
  ], "artifactMaterial", issues)) return finish(value as ArtifactIdentityMaterial, issues);
  if (value.contractVersion !== ARTIFACT_IDENTITY_VERSION) {
    issue(issues, "artifactMaterial.contractVersion");
  }
  validateIdentityEnvelope(value.scientificIdentity, "scientific", issues);
  validateIdentityEnvelope(value.executionIdentity, "execution", issues);
  mergeIssues(
    issues,
    validateReproducibleExecutionIdentityMaterial(value.executionMaterial),
  );
  mergeIssues(issues, validateResearchArtifactRef(value.artifact));
  return finish(value as ArtifactIdentityMaterial, issues);
}

export function validateScientificIdentityInput(
  value: unknown,
): RuntimeValidationResult<ExperimentIdentityMaterial> {
  return validateExperimentIdentityMaterial(value);
}

export function validateArtifactInput(
  value: unknown,
): RuntimeValidationResult<ResearchArtifactRef> {
  return validateResearchArtifactRef(value);
}

export const REPRODUCIBILITY_ID_PATTERNS = Object.freeze({
  scientific: SCIENTIFIC_ID,
  execution: EXECUTION_ID,
  manifest: MANIFEST_ID,
  artifact: ARTIFACT_ID,
});

export const REPRODUCIBILITY_DOMAINS = Object.freeze({
  scientific: SCIENTIFIC_IDENTITY_DOMAIN,
  execution: EXECUTION_IDENTITY_DOMAIN,
  manifest: MANIFEST_IDENTITY_DOMAIN,
  artifact: ARTIFACT_IDENTITY_DOMAIN,
});

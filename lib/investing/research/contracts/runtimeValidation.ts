import {
  DATASET_REQUEST_VERSION,
  DATASET_VERSION_REF_VERSION,
  type DatasetRequest,
  type DatasetVersionRef,
} from "./datasets";
import {
  EXPERIMENT_DEFINITION_VERSION,
  EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  type ExperimentDefinition,
  type ExperimentIdentityMaterial,
} from "./experiments";
import {
  RESEARCH_HYPOTHESIS_VERSION,
  STRATEGY_CANDIDATE_VERSION,
  type ResearchHypothesis,
  type StrategyCandidate,
} from "./hypotheses";
import {
  EXPERIMENT_RESULT_ENVELOPE_VERSION,
  RESEARCH_ARTIFACT_REF_VERSION,
  SCIENTIFIC_RUN_VERSION,
  type ExperimentResultEnvelope,
  type ResearchArtifactRef,
  type ScientificRun,
} from "./runs";
import {
  INVESTING_RESEARCH_SCOPE_VERSION,
  researchScopesEqual,
  scientificResearchScopesEqual,
  toInvestingResearchScientificScope,
  type InvestingResearchScope,
  type InvestingResearchScientificScope,
} from "./scope";
import {
  EXPERIMENT_RUN_STATES,
  RESEARCH_HYPOTHESIS_STATES,
  STRATEGY_CANDIDATE_STATES,
} from "./states";
import {
  isInvestingResearchReasonCode,
  type InvestingResearchReasonCode,
} from "./reasonCodes";
import {
  PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
  type PromotionEligibilityEnvelope,
} from "./promotion";
import {
  SCIENTIFIC_DECISION_VERSION,
  VALIDATION_REPORT_VERSION,
  type ScientificDecision,
  type ValidationReport,
} from "./validation";
import type {
  RuntimeValidationResult,
  ValidationIssue,
} from "./primitives";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

type MutableIssues = ValidationIssue[];
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype;
}

function issue(
  issues: MutableIssues,
  path: string,
  reasonCode: InvestingResearchReasonCode,
) {
  issues.push({ path, reasonCode });
}

function exactKeys(
  issues: MutableIssues,
  value: UnknownRecord,
  path: string,
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed);
  let valid = true;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "symbol") {
      issue(
        issues,
        `${path}.<symbol>`,
        "research.contract.unexpected_property",
      );
      valid = false;
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || descriptor.get !== undefined
      || descriptor.set !== undefined
    ) {
      issue(
        issues,
        `${path}.<accessor>`,
        "research.contract.unexpected_property",
      );
      valid = false;
      continue;
    }
    if (!descriptor.enumerable) {
      issue(
        issues,
        `${path}.<non-enumerable>`,
        "research.contract.unexpected_property",
      );
      valid = false;
      continue;
    }
    if (!allowedSet.has(key)) {
      issue(
        issues,
        `${path}.${key}`,
        "research.contract.unexpected_property",
      );
      valid = false;
    }
  }
  return valid;
}

function sanitized<T>(value: unknown): T {
  return structuredClone(value) as T;
}

function identifier(
  issues: MutableIssues,
  value: unknown,
  path: string,
) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    issue(issues, path, "research.contract.invalid");
  }
}

function version(issues: MutableIssues, value: unknown, path: string) {
  if (typeof value !== "string" || !VERSION.test(value)) {
    issue(issues, path, "research.contract.version_missing");
  }
}

function text(issues: MutableIssues, value: unknown, path: string) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    issue(issues, path, "research.contract.invalid");
  }
}

function finite(
  issues: MutableIssues,
  value: unknown,
  path: string,
  minimum?: number,
) {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || (minimum !== undefined && value < minimum)
  ) {
    issue(issues, path, "research.contract.invalid");
  }
}

function utcTimestamp(issues: MutableIssues, value: unknown, path: string) {
  if (
    typeof value !== "string"
    || !value.endsWith("Z")
    || !Number.isFinite(Date.parse(value))
  ) {
    issue(issues, path, "research.contract.invalid");
  }
}

function timeRange(issues: MutableIssues, value: unknown, path: string) {
  if (!record(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  if (!exactKeys(issues, value, path, ["from", "to"])) return;
  utcTimestamp(issues, value.from, `${path}.from`);
  utcTimestamp(issues, value.to, `${path}.to`);
  if (
    typeof value.from === "string"
    && typeof value.to === "string"
    && Number.isFinite(Date.parse(value.from))
    && Number.isFinite(Date.parse(value.to))
    && Date.parse(value.from) >= Date.parse(value.to)
  ) {
    issue(issues, path, "research.contract.invalid");
  }
}

function hash(issues: MutableIssues, value: unknown, path: string) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    issue(issues, path, "research.dataset.hash_missing");
  }
}

function distinctStrings(
  issues: MutableIssues,
  value: unknown,
  path: string,
  allowEmpty = false,
) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  const normalized: string[] = [];
  value.forEach((entry, index) => {
    text(issues, entry, `${path}[${index}]`);
    if (typeof entry === "string") normalized.push(entry);
  });
  if (new Set(normalized).size !== normalized.length) {
    issue(issues, path, "research.integrity.duplicate_value");
  }
}

function reasonCodes(
  issues: MutableIssues,
  value: unknown,
  path: string,
) {
  if (!Array.isArray(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!isInvestingResearchReasonCode(value[index])) {
      issue(issues, `${path}[${index}]`, "research.integrity.reason_code_unknown");
    }
  }
  if (new Set(value).size !== value.length) {
    issue(issues, path, "research.integrity.duplicate_value");
  }
}

function result<T>(
  value: unknown,
  issues: MutableIssues,
): RuntimeValidationResult<T> {
  return issues.length === 0
    ? { ok: true, value: sanitized<T>(value) }
    : { ok: false, issues };
}

function validateScopeInto(
  value: unknown,
  issues: MutableIssues,
  path: string,
) {
  if (!record(value)) {
    issue(issues, path, "research.identity.scope_incomplete");
    return;
  }
  if (!exactKeys(issues, value, path, [
    "contractVersion",
    "authenticatedUserId",
    "membershipId",
    "tenantId",
    "ownerId",
    "portfolioId",
    "accountId",
  ])) return;
  if (value.contractVersion !== INVESTING_RESEARCH_SCOPE_VERSION) {
    issue(issues, `${path}.contractVersion`, "research.contract.version_missing");
  }
  for (const key of [
    "authenticatedUserId",
    "membershipId",
    "tenantId",
    "ownerId",
    "portfolioId",
    "accountId",
  ] as const) {
    if (typeof value[key] !== "string" || !IDENTIFIER.test(value[key])) {
      issue(issues, `${path}.${key}`, "research.identity.scope_incomplete");
    }
  }
}

function validateScientificScopeInto(
  value: unknown,
  issues: MutableIssues,
  path: string,
) {
  if (!record(value)) {
    issue(issues, path, "research.identity.scope_incomplete");
    return;
  }
  if (!exactKeys(issues, value, path, [
    "tenantId",
    "ownerId",
    "portfolioId",
    "accountId",
  ])) return;
  for (const key of ["tenantId", "ownerId", "portfolioId", "accountId"] as const) {
    identifier(issues, value[key], `${path}.${key}`);
  }
}

export function validateInvestingResearchScope(
  value: unknown,
): RuntimeValidationResult<InvestingResearchScope> {
  const issues: MutableIssues = [];
  validateScopeInto(value, issues, "scope");
  return result(value, issues);
}

export function validateMatchingResearchScopes(
  expected: unknown,
  actual: unknown,
): RuntimeValidationResult<InvestingResearchScope> {
  const expectedResult = validateInvestingResearchScope(expected);
  const actualResult = validateInvestingResearchScope(actual);
  const issues = [
    ...("issues" in expectedResult ? expectedResult.issues : []),
    ...("issues" in actualResult ? actualResult.issues : []),
  ];
  if (
    expectedResult.ok
    && actualResult.ok
    && !researchScopesEqual(expectedResult.value, actualResult.value)
  ) {
    issue(issues, "scope", "research.identity.scope_mismatch");
  }
  return result(actual, issues);
}

function validateDatasetRequestInto(
  value: unknown,
  issues: MutableIssues,
  path: string,
) {
  if (!record(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  if (!exactKeys(issues, value, path, [
    "contractVersion", "requestId", "instruments", "timeframe", "range",
    "dataKinds", "quality", "scientificPurpose",
  ])) return;
  if (value.contractVersion !== DATASET_REQUEST_VERSION) {
    issue(issues, `${path}.contractVersion`, "research.contract.version_missing");
  }
  identifier(issues, value.requestId, `${path}.requestId`);
  distinctStrings(issues, value.instruments, `${path}.instruments`);
  text(issues, value.timeframe, `${path}.timeframe`);
  timeRange(issues, value.range, `${path}.range`);
  distinctStrings(issues, value.dataKinds, `${path}.dataKinds`);
  if (
    Array.isArray(value.dataKinds)
    && value.dataKinds.some((kind) => ![
      "price_bars",
      "corporate_actions",
      "fundamentals",
      "benchmark_series",
    ].includes(String(kind)))
  ) {
    issue(issues, `${path}.dataKinds`, "research.contract.invalid");
  }
  text(issues, value.scientificPurpose, `${path}.scientificPurpose`);
  if (!record(value.quality)) {
    issue(issues, `${path}.quality`, "research.contract.invalid");
  } else {
    if (!exactKeys(issues, value.quality, `${path}.quality`, [
      "minimumCoverageRatio", "maximumGapCount",
      "requireCorporateActionPolicy", "timezone",
    ])) return;
    finite(issues, value.quality.minimumCoverageRatio, `${path}.quality.minimumCoverageRatio`, 0);
    if (
      typeof value.quality.minimumCoverageRatio === "number"
      && value.quality.minimumCoverageRatio > 1
    ) {
      issue(issues, `${path}.quality.minimumCoverageRatio`, "research.dataset.coverage_invalid");
    }
    finite(issues, value.quality.maximumGapCount, `${path}.quality.maximumGapCount`, 0);
    if (!Number.isInteger(value.quality.maximumGapCount)) {
      issue(issues, `${path}.quality.maximumGapCount`, "research.contract.invalid");
    }
    if (
      typeof value.quality.requireCorporateActionPolicy !== "boolean"
      || value.quality.timezone !== "UTC"
    ) {
      issue(issues, `${path}.quality`, "research.contract.invalid");
    }
  }
}

export function validateDatasetRequest(
  value: unknown,
): RuntimeValidationResult<DatasetRequest> {
  const issues: MutableIssues = [];
  validateDatasetRequestInto(value, issues, "datasetRequest");
  return result(value, issues);
}

function validateDatasetVersionInto(
  value: unknown,
  issues: MutableIssues,
  path: string,
) {
  if (!record(value)) {
    issue(issues, path, "research.dataset.not_versioned");
    return;
  }
  const keysValid = exactKeys(issues, value, path, [
    "contractVersion", "datasetVersionId", "datasetSchemaVersion",
    "manifestHash", "aggregateContentHash", "coverage", "quality",
    "provenanceRef", "qualifiedAt",
  ]);
  const contractVersionDescriptor = Object.getOwnPropertyDescriptor(
    value,
    "contractVersion",
  );
  if (
    contractVersionDescriptor === undefined
    || contractVersionDescriptor.get !== undefined
    || contractVersionDescriptor.set !== undefined
    || contractVersionDescriptor.value !== DATASET_VERSION_REF_VERSION
  ) {
    issue(issues, `${path}.contractVersion`, "research.dataset.not_versioned");
  }
  if (!keysValid) return;
  identifier(issues, value.datasetVersionId, `${path}.datasetVersionId`);
  version(issues, value.datasetSchemaVersion, `${path}.datasetSchemaVersion`);
  hash(issues, value.manifestHash, `${path}.manifestHash`);
  hash(issues, value.aggregateContentHash, `${path}.aggregateContentHash`);
  utcTimestamp(issues, value.qualifiedAt, `${path}.qualifiedAt`);
  if (!record(value.coverage)) {
    issue(issues, `${path}.coverage`, "research.dataset.coverage_invalid");
  } else {
    if (!exactKeys(issues, value.coverage, `${path}.coverage`, [
      "instruments", "timeframe", "range", "coverageRatio", "gapCount",
    ])) return;
    distinctStrings(issues, value.coverage.instruments, `${path}.coverage.instruments`);
    text(issues, value.coverage.timeframe, `${path}.coverage.timeframe`);
    timeRange(issues, value.coverage.range, `${path}.coverage.range`);
    finite(issues, value.coverage.coverageRatio, `${path}.coverage.coverageRatio`, 0);
    finite(issues, value.coverage.gapCount, `${path}.coverage.gapCount`, 0);
    if (
      typeof value.coverage.coverageRatio === "number"
      && value.coverage.coverageRatio > 1
    ) {
      issue(issues, `${path}.coverage.coverageRatio`, "research.dataset.coverage_invalid");
    }
  }
  if (!record(value.quality)) {
    issue(issues, `${path}.quality`, "research.dataset.coverage_invalid");
  } else {
    if (!exactKeys(issues, value.quality, `${path}.quality`, [
      "status", "warningCodes",
    ])) return;
    if (!["qualified", "qualified_with_warnings"].includes(String(value.quality.status))) {
      issue(issues, `${path}.quality.status`, "research.dataset.coverage_invalid");
    }
    reasonCodes(issues, value.quality.warningCodes, `${path}.quality.warningCodes`);
  }
  versionedReference(issues, value.provenanceRef, `${path}.provenanceRef`);
}

export function validateDatasetVersionRef(
  value: unknown,
): RuntimeValidationResult<DatasetVersionRef> {
  const issues: MutableIssues = [];
  validateDatasetVersionInto(value, issues, "datasetVersion");
  return result(value, issues);
}

function versionedReference(
  issues: MutableIssues,
  value: unknown,
  path: string,
) {
  if (!record(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  if (!exactKeys(issues, value, path, ["id", "version"])) return;
  identifier(issues, value.id, `${path}.id`);
  version(issues, value.version, `${path}.version`);
}

function parameters(issues: MutableIssues, value: unknown, path: string) {
  if (!Array.isArray(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  const names: string[] = [];
  value.forEach((entry, index) => {
    if (!record(entry)) {
      issue(issues, `${path}[${index}]`, "research.contract.invalid");
      return;
    }
    if (!exactKeys(issues, entry, `${path}[${index}]`, ["name", "value"])) return;
    identifier(issues, entry.name, `${path}[${index}].name`);
    if (typeof entry.name === "string") names.push(entry.name);
    if (!canonicalizeResearchContract(entry.value).ok) {
      issue(
        issues,
        `${path}[${index}].value`,
        "research.contract.canonical_value_invalid",
      );
    }
  });
  if (new Set(names).size !== names.length) {
    issue(issues, path, "research.integrity.duplicate_value");
  }
  const sorted = [...names].sort();
  if (names.some((name, index) => name !== sorted[index])) {
    issue(issues, path, "research.contract.invalid");
  }
}

function portfolio(issues: MutableIssues, value: unknown, path: string) {
  if (!record(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  if (!exactKeys(issues, value, path, [
    "baseCurrency", "initialCapital", "allowLeverage", "allowShorting",
    "rebalanceFrequency",
  ])) return;
  text(issues, value.baseCurrency, `${path}.baseCurrency`);
  finite(issues, value.initialCapital, `${path}.initialCapital`, 0);
  if (typeof value.allowLeverage !== "boolean" || typeof value.allowShorting !== "boolean") {
    issue(issues, path, "research.contract.invalid");
  }
  text(issues, value.rebalanceFrequency, `${path}.rebalanceFrequency`);
}

export function validateResearchHypothesis(
  value: unknown,
): RuntimeValidationResult<ResearchHypothesis> {
  const issues: MutableIssues = [];
  if (!record(value)) return result(value, [{ path: "hypothesis", reasonCode: "research.contract.invalid" }]);
  if (!exactKeys(issues, value, "hypothesis", [
    "contractVersion", "hypothesisId", "hypothesisVersion", "state",
    "statement", "family", "rationale", "universe", "horizon", "variables",
    "expectedBenchmark", "falsificationCriteria",
  ])) return result(value, issues);
  if (value.contractVersion !== RESEARCH_HYPOTHESIS_VERSION) {
    issue(issues, "hypothesis.contractVersion", "research.contract.version_missing");
  }
  identifier(issues, value.hypothesisId, "hypothesis.hypothesisId");
  version(issues, value.hypothesisVersion, "hypothesis.hypothesisVersion");
  if (!RESEARCH_HYPOTHESIS_STATES.includes(value.state as never)) {
    issue(issues, "hypothesis.state", "research.contract.invalid");
  }
  for (const key of ["statement", "family", "rationale", "horizon"] as const) {
    text(issues, value[key], `hypothesis.${key}`);
  }
  distinctStrings(issues, value.universe, "hypothesis.universe");
  parameters(issues, value.variables, "hypothesis.variables");
  versionedReference(issues, value.expectedBenchmark, "hypothesis.expectedBenchmark");
  distinctStrings(issues, value.falsificationCriteria, "hypothesis.falsificationCriteria");
  return result(value, issues);
}

function validateCandidateInto(
  value: unknown,
  issues: MutableIssues,
  path: string,
) {
  if (!record(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  if (!exactKeys(issues, value, path, [
    "contractVersion", "candidateId", "candidateVersion", "hypothesisId",
    "hypothesisVersion", "state", "strategyContract", "parameters",
    "portfolioAssumptions", "datasetRequirements", "intendedEvaluationRange",
    "generation",
  ])) return;
  if (value.contractVersion !== STRATEGY_CANDIDATE_VERSION) {
    issue(issues, `${path}.contractVersion`, "research.contract.version_missing");
  }
  for (const key of ["candidateId", "hypothesisId"] as const) {
    identifier(issues, value[key], `${path}.${key}`);
  }
  for (const key of ["candidateVersion", "hypothesisVersion"] as const) {
    version(issues, value[key], `${path}.${key}`);
  }
  if (!STRATEGY_CANDIDATE_STATES.includes(value.state as never)) {
    issue(issues, `${path}.state`, "research.contract.invalid");
  }
  versionedReference(issues, value.strategyContract, `${path}.strategyContract`);
  parameters(issues, value.parameters, `${path}.parameters`);
  portfolio(issues, value.portfolioAssumptions, `${path}.portfolioAssumptions`);
  validateDatasetRequestInto(value.datasetRequirements, issues, `${path}.datasetRequirements`);
  timeRange(issues, value.intendedEvaluationRange, `${path}.intendedEvaluationRange`);
  if (!record(value.generation)) {
    issue(issues, `${path}.generation`, "research.contract.invalid");
  } else {
    if (!exactKeys(issues, value.generation, `${path}.generation`, [
      "generatorId", "generatorVersion", "generatedAt", "parentCandidateId",
    ])) return;
    identifier(issues, value.generation.generatorId, `${path}.generation.generatorId`);
    version(issues, value.generation.generatorVersion, `${path}.generation.generatorVersion`);
    utcTimestamp(issues, value.generation.generatedAt, `${path}.generation.generatedAt`);
    if (value.generation.parentCandidateId !== null) {
      identifier(issues, value.generation.parentCandidateId, `${path}.generation.parentCandidateId`);
    }
  }
}

export function validateStrategyCandidate(
  value: unknown,
): RuntimeValidationResult<StrategyCandidate> {
  const issues: MutableIssues = [];
  validateCandidateInto(value, issues, "candidate");
  return result(value, issues);
}

function splitList(issues: MutableIssues, value: unknown, path: string) {
  if (!Array.isArray(value) || value.length === 0) {
    issue(issues, path, "research.experiment.definition_invalid");
    return;
  }
  const names: string[] = [];
  value.forEach((entry, index) => {
    if (!record(entry)) {
      issue(issues, `${path}[${index}]`, "research.experiment.definition_invalid");
      return;
    }
    if (!exactKeys(
      issues,
      entry,
      `${path}[${index}]`,
      ["name", "purpose", "range"],
    )) return;
    identifier(issues, entry.name, `${path}[${index}].name`);
    if (typeof entry.name === "string") names.push(entry.name);
    if (!["training", "validation", "holdout", "final_holdout"].includes(String(entry.purpose))) {
      issue(issues, `${path}[${index}].purpose`, "research.experiment.definition_invalid");
    }
    timeRange(issues, entry.range, `${path}[${index}].range`);
  });
  if (new Set(names).size !== names.length) {
    issue(issues, path, "research.integrity.duplicate_value");
  }
}

function validateIdentityMaterialInto(
  value: unknown,
  issues: MutableIssues,
  path: string,
) {
  if (!record(value)) {
    issue(issues, path, "research.experiment.identity_incomplete");
    return;
  }
  if (!exactKeys(issues, value, path, [
    "contractVersion", "scientificScope", "candidateId", "candidateVersion",
    "hypothesisId", "hypothesisVersion", "strategyContract",
    "canonicalParameters", "datasetVersionId", "datasetManifestHash",
    "datasetContentHash", "engineContract", "validationProfile",
    "portfolioConfiguration", "costModel", "benchmark", "splits",
    "randomSeed", "configurationVersion",
  ])) return;
  if (value.contractVersion !== EXPERIMENT_IDENTITY_MATERIAL_VERSION) {
    issue(issues, `${path}.contractVersion`, "research.experiment.identity_incomplete");
  }
  validateScientificScopeInto(
    value.scientificScope,
    issues,
    `${path}.scientificScope`,
  );
  for (const key of ["candidateId", "hypothesisId", "datasetVersionId"] as const) {
    identifier(issues, value[key], `${path}.${key}`);
  }
  for (const key of ["candidateVersion", "hypothesisVersion", "configurationVersion"] as const) {
    version(issues, value[key], `${path}.${key}`);
  }
  hash(issues, value.datasetManifestHash, `${path}.datasetManifestHash`);
  hash(issues, value.datasetContentHash, `${path}.datasetContentHash`);
  versionedReference(issues, value.strategyContract, `${path}.strategyContract`);
  versionedReference(issues, value.engineContract, `${path}.engineContract`);
  versionedReference(issues, value.validationProfile, `${path}.validationProfile`);
  versionedReference(issues, value.costModel, `${path}.costModel`);
  versionedReference(issues, value.benchmark, `${path}.benchmark`);
  parameters(issues, value.canonicalParameters, `${path}.canonicalParameters`);
  portfolio(issues, value.portfolioConfiguration, `${path}.portfolioConfiguration`);
  splitList(issues, value.splits, `${path}.splits`);
  if (value.randomSeed !== null) text(issues, value.randomSeed, `${path}.randomSeed`);
}

export function validateExperimentIdentityMaterial(
  value: unknown,
): RuntimeValidationResult<ExperimentIdentityMaterial> {
  const issues: MutableIssues = [];
  validateIdentityMaterialInto(value, issues, "identityMaterial");
  return result(value, issues);
}

export function validateExperimentDefinition(
  value: unknown,
): RuntimeValidationResult<ExperimentDefinition> {
  const issues: MutableIssues = [];
  if (!record(value)) return result(value, [{ path: "experiment", reasonCode: "research.experiment.definition_invalid" }]);
  if (!exactKeys(issues, value, "experiment", [
    "contractVersion", "experimentId", "scope", "candidate", "dataset",
    "evaluationRange", "splits", "portfolioConfiguration", "costModel",
    "validationProfile", "benchmark", "engineContract", "randomSeed",
    "configurationVersion", "identityMaterial",
  ])) return result(value, issues);
  if (value.contractVersion !== EXPERIMENT_DEFINITION_VERSION) {
    issue(issues, "experiment.contractVersion", "research.contract.version_missing");
  }
  identifier(issues, value.experimentId, "experiment.experimentId");
  validateScopeInto(value.scope, issues, "experiment.scope");
  validateCandidateInto(value.candidate, issues, "experiment.candidate");
  validateDatasetVersionInto(value.dataset, issues, "experiment.dataset");
  timeRange(issues, value.evaluationRange, "experiment.evaluationRange");
  splitList(issues, value.splits, "experiment.splits");
  portfolio(issues, value.portfolioConfiguration, "experiment.portfolioConfiguration");
  for (const key of ["costModel", "validationProfile", "benchmark", "engineContract"] as const) {
    versionedReference(issues, value[key], `experiment.${key}`);
  }
  version(issues, value.configurationVersion, "experiment.configurationVersion");
  if (value.randomSeed !== null) text(issues, value.randomSeed, "experiment.randomSeed");
  validateIdentityMaterialInto(value.identityMaterial, issues, "experiment.identityMaterial");

  if (
    record(value.scope)
    && record(value.identityMaterial)
    && record(value.identityMaterial.scientificScope)
  ) {
    const scopeA = validateInvestingResearchScope(value.scope);
    const scientificIssues: MutableIssues = [];
    validateScientificScopeInto(
      value.identityMaterial.scientificScope,
      scientificIssues,
      "experiment.identityMaterial.scientificScope",
    );
    if (
      scopeA.ok
      && scientificIssues.length === 0
      && !scientificResearchScopesEqual(
        toInvestingResearchScientificScope(scopeA.value),
        value.identityMaterial.scientificScope as InvestingResearchScientificScope,
      )
    ) {
      issue(
        issues,
        "experiment.identityMaterial.scientificScope",
        "research.identity.scope_mismatch",
      );
    }
  }
  if (
    record(value.dataset)
    && record(value.identityMaterial)
    && (
      value.dataset.datasetVersionId !== value.identityMaterial.datasetVersionId
      || value.dataset.manifestHash !== value.identityMaterial.datasetManifestHash
      || value.dataset.aggregateContentHash !== value.identityMaterial.datasetContentHash
    )
  ) {
    issue(issues, "experiment.identityMaterial.dataset", "research.experiment.identity_incomplete");
  }
  if (
    record(value.candidate)
    && record(value.identityMaterial)
    && (
      value.candidate.candidateId !== value.identityMaterial.candidateId
      || value.candidate.candidateVersion !== value.identityMaterial.candidateVersion
      || value.candidate.hypothesisId !== value.identityMaterial.hypothesisId
      || value.candidate.hypothesisVersion !== value.identityMaterial.hypothesisVersion
    )
  ) {
    issue(issues, "experiment.identityMaterial.candidate", "research.experiment.identity_incomplete");
  }
  if (
    record(value.candidate)
    && record(value.dataset)
    && record(value.candidate.datasetRequirements)
    && record(value.dataset.coverage)
  ) {
    const requiredInstruments = Array.isArray(value.candidate.datasetRequirements.instruments)
      ? value.candidate.datasetRequirements.instruments
      : [];
    const coveredInstruments = new Set(
      Array.isArray(value.dataset.coverage.instruments)
        ? value.dataset.coverage.instruments
        : [],
    );
    if (
      value.candidate.datasetRequirements.timeframe !== value.dataset.coverage.timeframe
      || requiredInstruments.some((instrument) => !coveredInstruments.has(instrument))
      || (
        record(value.candidate.datasetRequirements.range)
        && record(value.dataset.coverage.range)
        && (
          Date.parse(String(value.dataset.coverage.range.from))
            > Date.parse(String(value.candidate.datasetRequirements.range.from))
          || Date.parse(String(value.dataset.coverage.range.to))
            < Date.parse(String(value.candidate.datasetRequirements.range.to))
        )
      )
    ) {
      issue(issues, "experiment.dataset.coverage", "research.dataset.coverage_invalid");
    }
  }
  if (record(value.identityMaterial)) {
    const identityPairs: readonly (readonly [unknown, unknown, string])[] = [
      [record(value.candidate) ? value.candidate.strategyContract : null, value.identityMaterial.strategyContract, "strategyContract"],
      [record(value.candidate) ? value.candidate.parameters : null, value.identityMaterial.canonicalParameters, "canonicalParameters"],
      [value.portfolioConfiguration, value.identityMaterial.portfolioConfiguration, "portfolioConfiguration"],
      [value.costModel, value.identityMaterial.costModel, "costModel"],
      [value.validationProfile, value.identityMaterial.validationProfile, "validationProfile"],
      [value.benchmark, value.identityMaterial.benchmark, "benchmark"],
      [value.engineContract, value.identityMaterial.engineContract, "engineContract"],
      [value.splits, value.identityMaterial.splits, "splits"],
      [value.randomSeed, value.identityMaterial.randomSeed, "randomSeed"],
      [value.configurationVersion, value.identityMaterial.configurationVersion, "configurationVersion"],
    ];
    for (const [definitionValue, identityValue, name] of identityPairs) {
      if (!canonicalValuesEqual(definitionValue, identityValue)) {
        issue(
          issues,
          `experiment.identityMaterial.${name}`,
          "research.experiment.identity_incomplete",
        );
      }
    }
  }
  return result(value, issues);
}

function artifactInto(value: unknown, issues: MutableIssues, path: string) {
  if (!record(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  if (!exactKeys(issues, value, path, [
    "contractVersion", "artifactId", "kind", "contentHash", "mediaType",
    "schemaVersion", "sizeBytes", "logicalRole", "provenanceRef",
    "retentionClass",
  ])) return;
  if (value.contractVersion !== RESEARCH_ARTIFACT_REF_VERSION) {
    issue(issues, `${path}.contractVersion`, "research.contract.version_missing");
  }
  identifier(issues, value.artifactId, `${path}.artifactId`);
  for (const key of ["kind", "mediaType", "schemaVersion", "logicalRole"] as const) {
    text(issues, value[key], `${path}.${key}`);
  }
  hash(issues, value.contentHash, `${path}.contentHash`);
  if (value.sizeBytes !== null) {
    finite(issues, value.sizeBytes, `${path}.sizeBytes`, 0);
  }
  versionedReference(issues, value.provenanceRef, `${path}.provenanceRef`);
  if (!["scientific_record", "reproducibility_input", "diagnostic"].includes(String(value.retentionClass))) {
    issue(issues, `${path}.retentionClass`, "research.contract.invalid");
  }
}

export function validateResearchArtifactRef(
  value: unknown,
): RuntimeValidationResult<ResearchArtifactRef> {
  const issues: MutableIssues = [];
  artifactInto(value, issues, "artifact");
  return result(value, issues);
}

function metrics(issues: MutableIssues, value: unknown, path: string) {
  if (!Array.isArray(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  const names: string[] = [];
  value.forEach((entry, index) => {
    if (!record(entry) || !record(entry.value)) {
      issue(issues, `${path}[${index}]`, "research.contract.invalid");
      return;
    }
    if (!exactKeys(issues, entry, `${path}[${index}]`, ["name", "value"])) return;
    identifier(issues, entry.name, `${path}[${index}].name`);
    if (typeof entry.name === "string") names.push(entry.name);
    if (entry.value.availability === "available") {
      if (!exactKeys(issues, entry.value, `${path}[${index}].value`, [
        "availability", "value", "unit",
      ])) return;
      finite(issues, entry.value.value, `${path}[${index}].value.value`);
      text(issues, entry.value.unit, `${path}[${index}].value.unit`);
    } else if (
      entry.value.availability !== "unavailable"
      || entry.value.reasonCode !== "research.validation.metric_unavailable"
    ) {
      issue(issues, `${path}[${index}].value`, "research.contract.invalid");
    } else {
      if (!exactKeys(issues, entry.value, `${path}[${index}].value`, [
        "availability", "reasonCode",
      ])) return;
    }
  });
  if (new Set(names).size !== names.length) {
    issue(issues, path, "research.integrity.duplicate_value");
  }
}

function resultEnvelopeInto(value: unknown, issues: MutableIssues, path: string) {
  if (!record(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  if (!exactKeys(issues, value, path, [
    "contractVersion", "experimentId", "runId", "candidateId",
    "candidateVersion", "hypothesisId", "hypothesisVersion", "scope",
    "dataset", "validationProfile", "benchmark", "completionStatus",
    "summary", "metrics", "benchmarkComparison", "warnings", "qualityFlags",
    "validationInputRefs", "artifacts",
  ])) return;
  if (value.contractVersion !== EXPERIMENT_RESULT_ENVELOPE_VERSION) {
    issue(issues, `${path}.contractVersion`, "research.contract.version_missing");
  }
  for (const key of ["experimentId", "runId", "candidateId"] as const) {
    identifier(issues, value[key], `${path}.${key}`);
  }
  version(issues, value.candidateVersion, `${path}.candidateVersion`);
  identifier(issues, value.hypothesisId, `${path}.hypothesisId`);
  version(issues, value.hypothesisVersion, `${path}.hypothesisVersion`);
  validateScopeInto(value.scope, issues, `${path}.scope`);
  validateDatasetVersionInto(value.dataset, issues, `${path}.dataset`);
  versionedReference(issues, value.validationProfile, `${path}.validationProfile`);
  versionedReference(issues, value.benchmark, `${path}.benchmark`);
  if (!["completed", "partial", "failed", "blocked"].includes(String(value.completionStatus))) {
    issue(issues, `${path}.completionStatus`, "research.contract.invalid");
  }
  text(issues, value.summary, `${path}.summary`);
  metrics(issues, value.metrics, `${path}.metrics`);
  metrics(issues, value.benchmarkComparison, `${path}.benchmarkComparison`);
  reasonCodes(issues, value.warnings, `${path}.warnings`);
  distinctStrings(issues, value.qualityFlags, `${path}.qualityFlags`, true);
  for (const key of ["validationInputRefs", "artifacts"] as const) {
    if (!Array.isArray(value[key])) {
      issue(issues, `${path}.${key}`, "research.contract.invalid");
    } else {
      value[key].forEach((entry, index) =>
        artifactInto(entry, issues, `${path}.${key}[${index}]`));
    }
  }
}

export function validateExperimentResultEnvelope(
  value: unknown,
): RuntimeValidationResult<ExperimentResultEnvelope> {
  const issues: MutableIssues = [];
  resultEnvelopeInto(value, issues, "result");
  return result(value, issues);
}

export function validateScientificRun(
  value: unknown,
): RuntimeValidationResult<ScientificRun> {
  const issues: MutableIssues = [];
  if (!record(value)) return result(value, [{ path: "run", reasonCode: "research.contract.invalid" }]);
  if (!exactKeys(issues, value, "run", [
    "contractVersion", "runId", "experimentId", "scope", "state", "attempt",
    "createdAt", "startedAt", "completedAt", "lease", "artifactRefs", "result",
    "failure", "reasonCodes",
  ])) return result(value, issues);
  if (value.contractVersion !== SCIENTIFIC_RUN_VERSION) {
    issue(issues, "run.contractVersion", "research.contract.version_missing");
  }
  identifier(issues, value.runId, "run.runId");
  identifier(issues, value.experimentId, "run.experimentId");
  validateScopeInto(value.scope, issues, "run.scope");
  if (!EXPERIMENT_RUN_STATES.includes(value.state as never)) {
    issue(issues, "run.state", "research.contract.invalid");
  }
  finite(issues, value.attempt, "run.attempt", 1);
  if (!Number.isInteger(value.attempt)) issue(issues, "run.attempt", "research.contract.invalid");
  utcTimestamp(issues, value.createdAt, "run.createdAt");
  if (value.startedAt !== null) utcTimestamp(issues, value.startedAt, "run.startedAt");
  if (value.completedAt !== null) utcTimestamp(issues, value.completedAt, "run.completedAt");
  if (value.lease !== null) {
    if (!record(value.lease)) {
      issue(issues, "run.lease", "research.execution.run_inconsistent");
    } else {
      if (!exactKeys(issues, value.lease, "run.lease", [
        "leaseId", "workerId", "leasedAt", "expiresAt",
      ])) return result(value, issues);
      identifier(issues, value.lease.leaseId, "run.lease.leaseId");
      identifier(issues, value.lease.workerId, "run.lease.workerId");
      utcTimestamp(issues, value.lease.leasedAt, "run.lease.leasedAt");
      utcTimestamp(issues, value.lease.expiresAt, "run.lease.expiresAt");
      if (
        typeof value.lease.leasedAt === "string"
        && typeof value.lease.expiresAt === "string"
        && Date.parse(value.lease.leasedAt) >= Date.parse(value.lease.expiresAt)
      ) {
        issue(issues, "run.lease", "research.execution.run_inconsistent");
      }
    }
  }
  if (!Array.isArray(value.artifactRefs)) {
    issue(issues, "run.artifactRefs", "research.contract.invalid");
  } else {
    value.artifactRefs.forEach((entry, index) => artifactInto(entry, issues, `run.artifactRefs[${index}]`));
  }
  if (value.result !== null) {
    resultEnvelopeInto(value.result, issues, "run.result");
    if (record(value.result) && value.result.experimentId !== value.experimentId) {
      issue(issues, "run.result.experimentId", "research.experiment.identity_incomplete");
    }
    if (record(value.result) && value.result.runId !== value.runId) {
      issue(issues, "run.result.runId", "research.integrity.reference_mismatch");
    }
    if (
      record(value.result)
      && record(value.result.scope)
      && record(value.scope)
      && !researchScopesEqual(
        value.scope as InvestingResearchScope,
        value.result.scope as InvestingResearchScope,
      )
    ) {
      issue(issues, "run.result.scope", "research.identity.scope_mismatch");
    }
  }
  if (value.failure !== null) {
    if (!record(value.failure)) issue(issues, "run.failure", "research.contract.invalid");
    else {
      if (!exactKeys(issues, value.failure, "run.failure", [
        "reasonCodes", "failedStage",
      ])) return result(value, issues);
      reasonCodes(issues, value.failure.reasonCodes, "run.failure.reasonCodes");
      text(issues, value.failure.failedStage, "run.failure.failedStage");
    }
  }
  reasonCodes(issues, value.reasonCodes, "run.reasonCodes");
  const created = typeof value.createdAt === "string" ? Date.parse(value.createdAt) : NaN;
  const started = typeof value.startedAt === "string" ? Date.parse(value.startedAt) : NaN;
  const completed = typeof value.completedAt === "string" ? Date.parse(value.completedAt) : NaN;
  if (
    (Number.isFinite(started) && Number.isFinite(created) && started < created)
    || (Number.isFinite(completed) && Number.isFinite(created) && completed < created)
    || (Number.isFinite(completed) && Number.isFinite(started) && completed < started)
  ) {
    issue(issues, "run.timestamps", "research.execution.run_inconsistent");
  }
  const inconsistent = (path: string) =>
    issue(issues, path, "research.execution.run_inconsistent");
  switch (value.state) {
    case "defined":
    case "queued":
      if (
        value.lease !== null || value.startedAt !== null
        || value.completedAt !== null || value.result !== null
        || value.failure !== null
      ) inconsistent("run.state");
      break;
    case "leased":
      if (
        value.lease === null || value.completedAt !== null
        || value.result !== null || value.failure !== null
      ) inconsistent("run.state");
      break;
    case "running":
      if (
        value.startedAt === null || value.lease === null
        || value.completedAt !== null || value.result !== null
        || value.failure !== null
      ) inconsistent("run.state");
      break;
    case "completed":
      if (
        value.startedAt === null || value.completedAt === null
        || value.result === null || value.failure !== null
      ) inconsistent("run.state");
      break;
    case "failed":
      if (
        value.startedAt === null || value.completedAt === null
        || value.result !== null || value.failure === null
      ) inconsistent("run.state");
      break;
    case "blocked":
      if (
        value.completedAt === null || value.result !== null
        || value.failure === null
      ) inconsistent("run.state");
      break;
    case "cancelled":
      if (
        value.completedAt === null || value.result !== null
        || value.failure !== null
        || !Array.isArray(value.reasonCodes)
        || !value.reasonCodes.includes("research.execution.cancelled")
      ) inconsistent("run.state");
      break;
    default:
      break;
  }
  return result(value, issues);
}

export function validatePromotionEligibilityEnvelope(
  value: unknown,
): RuntimeValidationResult<PromotionEligibilityEnvelope> {
  const issues: MutableIssues = [];
  if (!record(value)) return result(value, [{ path: "promotion", reasonCode: "research.contract.invalid" }]);
  if (!exactKeys(issues, value, "promotion", [
    "contractVersion", "eligibilityId", "state", "scope", "scientificScope",
    "candidateId", "candidateVersion", "hypothesisId", "hypothesisVersion",
    "experimentId", "runId", "dataset", "validationDecision", "evidenceIds",
    "reasonCodes", "eligibilityProfile", "evaluatedAt", "evaluatedBy",
  ])) return result(value, issues);
  if (
    value.contractVersion !== PROMOTION_ELIGIBILITY_ENVELOPE_VERSION
    || value.state !== "promotion_eligible"
  ) {
    issue(issues, "promotion", "research.promotion.not_eligible");
  }
  identifier(issues, value.eligibilityId, "promotion.eligibilityId");
  validateScopeInto(value.scope, issues, "promotion.scope");
  validateScientificScopeInto(
    value.scientificScope,
    issues,
    "promotion.scientificScope",
  );
  for (const key of ["candidateId", "experimentId", "runId"] as const) {
    identifier(issues, value[key], `promotion.${key}`);
  }
  version(issues, value.candidateVersion, "promotion.candidateVersion");
  identifier(issues, value.hypothesisId, "promotion.hypothesisId");
  version(issues, value.hypothesisVersion, "promotion.hypothesisVersion");
  validateDatasetVersionInto(value.dataset, issues, "promotion.dataset");
  distinctStrings(issues, value.evidenceIds, "promotion.evidenceIds");
  reasonCodes(issues, value.reasonCodes, "promotion.reasonCodes");
  versionedReference(issues, value.eligibilityProfile, "promotion.eligibilityProfile");
  utcTimestamp(issues, value.evaluatedAt, "promotion.evaluatedAt");
  versionedReference(issues, value.evaluatedBy, "promotion.evaluatedBy");
  const decisionResult = validateScientificDecision(value.validationDecision);
  if (!decisionResult.ok || decisionResult.value.outcome !== "validated") {
    issue(issues, "promotion.validationDecision", "research.promotion.evidence_incomplete");
  } else if (
    !record(value.scope)
    || !record(value.scientificScope)
    || !researchScopesEqual(
      value.scope as InvestingResearchScope,
      decisionResult.value.scope,
    )
    || !scientificResearchScopesEqual(
      value.scientificScope as InvestingResearchScientificScope,
      decisionResult.value.scientificScope,
    )
    || value.candidateId !== decisionResult.value.candidateId
    || value.candidateVersion !== decisionResult.value.candidateVersion
    || value.hypothesisId !== decisionResult.value.hypothesisId
    || value.hypothesisVersion !== decisionResult.value.hypothesisVersion
    || value.experimentId !== decisionResult.value.experimentId
    || value.runId !== decisionResult.value.runId
    || !record(value.dataset)
    || value.dataset.datasetVersionId !== decisionResult.value.datasetVersionId
    || value.dataset.manifestHash !== decisionResult.value.datasetManifestHash
    || value.dataset.aggregateContentHash !== decisionResult.value.datasetContentHash
    || (
      Array.isArray(value.evidenceIds)
      && value.evidenceIds.some(
        (evidenceId) => !decisionResult.value.evidenceIds.includes(evidenceId),
      )
    )
  ) {
    issue(
      issues,
      "promotion.validationDecision",
      "research.integrity.reference_mismatch",
    );
  }
  return result(value, issues);
}

function validationEvidenceList(
  issues: MutableIssues,
  value: unknown,
  path: string,
) {
  if (!Array.isArray(value)) {
    issue(issues, path, "research.contract.invalid");
    return;
  }
  const ids: string[] = [];
  value.forEach((entry, index) => {
    if (!record(entry)) {
      issue(issues, `${path}[${index}]`, "research.contract.invalid");
      return;
    }
    if (!exactKeys(issues, entry, `${path}[${index}]`, [
      "evidenceId", "kind", "description", "artifactRefs", "reasonCodes",
    ])) return;
    identifier(issues, entry.evidenceId, `${path}[${index}].evidenceId`);
    if (typeof entry.evidenceId === "string") ids.push(entry.evidenceId);
    text(issues, entry.kind, `${path}[${index}].kind`);
    text(issues, entry.description, `${path}[${index}].description`);
    reasonCodes(issues, entry.reasonCodes, `${path}[${index}].reasonCodes`);
    if (!Array.isArray(entry.artifactRefs)) {
      issue(issues, `${path}[${index}].artifactRefs`, "research.contract.invalid");
    } else {
      entry.artifactRefs.forEach((artifact, artifactIndex) =>
        artifactInto(
          artifact,
          issues,
          `${path}[${index}].artifactRefs[${artifactIndex}]`,
        ));
    }
  });
  if (new Set(ids).size !== ids.length) {
    issue(issues, path, "research.integrity.duplicate_value");
  }
}

export function validateValidationReport(
  value: unknown,
): RuntimeValidationResult<ValidationReport> {
  const issues: MutableIssues = [];
  if (!record(value)) {
    return result(value, [{ path: "validation", reasonCode: "research.contract.invalid" }]);
  }
  if (!exactKeys(issues, value, "validation", [
    "contractVersion", "reportId", "candidateId", "candidateVersion",
    "hypothesisId", "hypothesisVersion", "experimentId", "runId", "scope",
    "dataset", "validationProfile", "benchmark", "result", "gates", "evidence",
    "warnings", "blockers", "evaluatedAt", "evaluatedBy",
  ])) return result(value, issues);
  if (value.contractVersion !== VALIDATION_REPORT_VERSION) {
    issue(issues, "validation.contractVersion", "research.contract.version_missing");
  }
  for (const key of [
    "reportId", "candidateId", "hypothesisId", "experimentId", "runId",
  ] as const) {
    identifier(issues, value[key], `validation.${key}`);
  }
  version(issues, value.candidateVersion, "validation.candidateVersion");
  version(issues, value.hypothesisVersion, "validation.hypothesisVersion");
  validateScopeInto(value.scope, issues, "validation.scope");
  validateDatasetVersionInto(value.dataset, issues, "validation.dataset");
  versionedReference(issues, value.validationProfile, "validation.validationProfile");
  versionedReference(issues, value.benchmark, "validation.benchmark");
  resultEnvelopeInto(value.result, issues, "validation.result");
  if (!Array.isArray(value.gates) || value.gates.length === 0) {
    issue(issues, "validation.gates", "research.contract.invalid");
  } else {
    const gateIds: string[] = [];
    value.gates.forEach((gate, index) => {
      if (!record(gate)) {
        issue(issues, `validation.gates[${index}]`, "research.contract.invalid");
        return;
      }
      if (!exactKeys(issues, gate, `validation.gates[${index}]`, [
        "gateId", "gateVersion", "outcome", "reasonCodes", "evidenceIds",
      ])) return;
      identifier(issues, gate.gateId, `validation.gates[${index}].gateId`);
      if (typeof gate.gateId === "string") gateIds.push(gate.gateId);
      version(issues, gate.gateVersion, `validation.gates[${index}].gateVersion`);
      if (!["passed", "failed", "inconclusive", "blocked", "invalid"].includes(String(gate.outcome))) {
        issue(issues, `validation.gates[${index}].outcome`, "research.contract.invalid");
      }
      reasonCodes(issues, gate.reasonCodes, `validation.gates[${index}].reasonCodes`);
      distinctStrings(issues, gate.evidenceIds, `validation.gates[${index}].evidenceIds`, true);
    });
    if (new Set(gateIds).size !== gateIds.length) {
      issue(issues, "validation.gates", "research.integrity.duplicate_value");
    }
  }
  validationEvidenceList(issues, value.evidence, "validation.evidence");
  reasonCodes(issues, value.warnings, "validation.warnings");
  reasonCodes(issues, value.blockers, "validation.blockers");
  utcTimestamp(issues, value.evaluatedAt, "validation.evaluatedAt");
  versionedReference(issues, value.evaluatedBy, "validation.evaluatedBy");
  if (Array.isArray(value.gates) && Array.isArray(value.evidence)) {
    const evidenceIds = new Set(
      value.evidence
        .filter(record)
        .map((entry) => entry.evidenceId)
        .filter((entry): entry is string => typeof entry === "string"),
    );
    for (let gateIndex = 0; gateIndex < value.gates.length; gateIndex += 1) {
      const gate = value.gates[gateIndex];
      if (record(gate) && Array.isArray(gate.evidenceIds)) {
        for (let evidenceIndex = 0; evidenceIndex < gate.evidenceIds.length; evidenceIndex += 1) {
          if (!evidenceIds.has(gate.evidenceIds[evidenceIndex])) {
            issue(
              issues,
              `validation.gates[${gateIndex}].evidenceIds[${evidenceIndex}]`,
              "research.integrity.reference_mismatch",
            );
          }
        }
      }
    }
  }
  if (
    record(value.result)
    && (
      value.experimentId !== value.result.experimentId
      || value.runId !== value.result.runId
      || value.candidateId !== value.result.candidateId
      || value.candidateVersion !== value.result.candidateVersion
      || value.hypothesisId !== value.result.hypothesisId
      || value.hypothesisVersion !== value.result.hypothesisVersion
      || !record(value.scope)
      || !record(value.result.scope)
      || !researchScopesEqual(
        value.scope as InvestingResearchScope,
        value.result.scope as InvestingResearchScope,
      )
      || !record(value.dataset)
      || !record(value.result.dataset)
      || value.dataset.datasetVersionId !== value.result.dataset.datasetVersionId
      || value.dataset.manifestHash !== value.result.dataset.manifestHash
      || value.dataset.aggregateContentHash
        !== value.result.dataset.aggregateContentHash
      || !canonicalValuesEqual(
        value.validationProfile,
        value.result.validationProfile,
      )
      || !canonicalValuesEqual(value.benchmark, value.result.benchmark)
    )
  ) {
    issue(
      issues,
      "validation.result",
      "research.integrity.reference_mismatch",
    );
  }
  return result(value, issues);
}

export function validateScientificDecision(
  value: unknown,
): RuntimeValidationResult<ScientificDecision> {
  const issues: MutableIssues = [];
  if (!record(value)) {
    return result(value, [{ path: "decision", reasonCode: "research.contract.invalid" }]);
  }
  if (!exactKeys(issues, value, "decision", [
    "contractVersion", "decisionId", "outcome", "candidateId",
    "candidateVersion", "hypothesisId", "hypothesisVersion", "experimentId",
    "runId", "datasetVersionId", "datasetManifestHash", "datasetContentHash",
    "scope", "scientificScope", "validationReport", "validationProfile",
    "reasonCodes", "evidenceIds", "warnings", "blockers", "decidedAt",
    "decidedBy",
  ])) return result(value, issues);
  if (value.contractVersion !== SCIENTIFIC_DECISION_VERSION) {
    issue(issues, "decision.contractVersion", "research.contract.version_missing");
  }
  for (const key of [
    "decisionId",
    "candidateId",
    "experimentId",
    "runId",
    "datasetVersionId",
  ] as const) {
    identifier(issues, value[key], `decision.${key}`);
  }
  version(issues, value.candidateVersion, "decision.candidateVersion");
  identifier(issues, value.hypothesisId, "decision.hypothesisId");
  version(issues, value.hypothesisVersion, "decision.hypothesisVersion");
  hash(issues, value.datasetManifestHash, "decision.datasetManifestHash");
  hash(issues, value.datasetContentHash, "decision.datasetContentHash");
  if (!["rejected", "inconclusive", "validated", "blocked", "invalid"].includes(String(value.outcome))) {
    issue(issues, "decision.outcome", "research.contract.invalid");
  }
  validateScopeInto(value.scope, issues, "decision.scope");
  validateScientificScopeInto(
    value.scientificScope,
    issues,
    "decision.scientificScope",
  );
  const reportResult = validateValidationReport(value.validationReport);
  versionedReference(issues, value.validationProfile, "decision.validationProfile");
  reasonCodes(issues, value.reasonCodes, "decision.reasonCodes");
  distinctStrings(issues, value.evidenceIds, "decision.evidenceIds", true);
  reasonCodes(issues, value.warnings, "decision.warnings");
  reasonCodes(issues, value.blockers, "decision.blockers");
  utcTimestamp(issues, value.decidedAt, "decision.decidedAt");
  versionedReference(issues, value.decidedBy, "decision.decidedBy");
  if (
    !reportResult.ok
    || !record(value.scope)
    || !record(value.scientificScope)
    || !researchScopesEqual(
      value.scope as InvestingResearchScope,
      reportResult.value.scope,
    )
    || !scientificResearchScopesEqual(
      value.scientificScope as InvestingResearchScientificScope,
      toInvestingResearchScientificScope(reportResult.value.scope),
    )
    || value.candidateId !== reportResult.value.result.candidateId
    || value.candidateVersion !== reportResult.value.result.candidateVersion
    || value.hypothesisId !== reportResult.value.result.hypothesisId
    || value.hypothesisVersion !== reportResult.value.result.hypothesisVersion
    || value.experimentId !== reportResult.value.experimentId
    || value.runId !== reportResult.value.runId
    || value.datasetVersionId !== reportResult.value.dataset.datasetVersionId
    || value.datasetManifestHash !== reportResult.value.dataset.manifestHash
    || value.datasetContentHash
      !== reportResult.value.dataset.aggregateContentHash
    || !canonicalValuesEqual(
      value.validationProfile,
      reportResult.value.validationProfile,
    )
    || (
      Array.isArray(value.evidenceIds)
      && value.evidenceIds.some(
        (evidenceId) => !reportResult.value.evidence.some(
          (entry) => entry.evidenceId === evidenceId,
        ),
      )
    )
  ) {
    issue(
      issues,
      "decision.validationReport",
      "research.integrity.reference_mismatch",
    );
  }
  return result(value, issues);
}

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  const leftResult = canonicalizeResearchContract(left);
  const rightResult = canonicalizeResearchContract(right);
  return leftResult.ok
    && rightResult.ok
    && leftResult.value === rightResult.value;
}

function canonicalizeInto(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): RuntimeValidationResult<string> {
  if (value === null) return { ok: true, value: "null" };
  if (typeof value === "string") {
    return { ok: true, value: JSON.stringify(value) };
  }
  if (typeof value === "boolean") {
    return { ok: true, value: value ? "true" : "false" };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        issues: [{ path, reasonCode: "research.contract.canonical_value_invalid" }],
      };
    }
    return { ok: true, value: Object.is(value, -0) ? "0" : String(value) };
  }
  if (typeof value !== "object") {
    return {
      ok: false,
      issues: [{ path, reasonCode: "research.contract.canonical_value_invalid" }],
    };
  }
  if (ancestors.has(value)) {
    return {
      ok: false,
      issues: [{ path, reasonCode: "research.contract.canonical_value_invalid" }],
    };
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const descriptors = new Map<string, PropertyDescriptor>();
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key === "symbol") {
          return {
            ok: false,
            issues: [{
              path: `${path}.<symbol>`,
              reasonCode: "research.contract.canonical_value_invalid",
            }],
          };
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined) {
          return {
            ok: false,
            issues: [{ path, reasonCode: "research.contract.canonical_value_invalid" }],
          };
        }
        if (key === "length") {
          if (
            descriptor.get !== undefined
            || descriptor.set !== undefined
            || descriptor.enumerable
          ) {
            return {
              ok: false,
              issues: [{ path, reasonCode: "research.contract.canonical_value_invalid" }],
            };
          }
          continue;
        }
        if (
          !/^(0|[1-9][0-9]*)$/u.test(key)
          || !descriptor.enumerable
          || descriptor.get !== undefined
          || descriptor.set !== undefined
        ) {
          return {
            ok: false,
            issues: [{
              path: `${path}.<array-property>`,
              reasonCode: "research.contract.canonical_value_invalid",
            }],
          };
        }
        descriptors.set(key, descriptor);
      }
      const parts: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors.get(String(index));
        if (descriptor === undefined) {
          return {
            ok: false,
            issues: [{
              path: `${path}[${index}]`,
              reasonCode: "research.contract.canonical_value_invalid",
            }],
          };
        }
        const child = canonicalizeInto(
          descriptor.value,
          `${path}[${index}]`,
          ancestors,
        );
        if (!child.ok) return child;
        parts.push(child.value);
      }
      return { ok: true, value: `[${parts.join(",")}]` };
    }
    if (!record(value)) {
      return {
        ok: false,
        issues: [{ path, reasonCode: "research.contract.canonical_value_invalid" }],
      };
    }
    const parts: string[] = [];
    const descriptors = new Map<string, PropertyDescriptor>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") {
        return {
          ok: false,
          issues: [{
            path: `${path}.<symbol>`,
            reasonCode: "research.contract.canonical_value_invalid",
          }],
        };
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined
        || !descriptor.enumerable
        || descriptor.get !== undefined
        || descriptor.set !== undefined
      ) {
        return {
          ok: false,
          issues: [{
            path: `${path}.<property>`,
            reasonCode: "research.contract.canonical_value_invalid",
          }],
        };
      }
      descriptors.set(key, descriptor);
    }
    for (const key of [...descriptors.keys()].sort()) {
      const descriptor = descriptors.get(key);
      if (descriptor === undefined) {
        return {
          ok: false,
          issues: [{ path, reasonCode: "research.contract.canonical_value_invalid" }],
        };
      }
      const child = canonicalizeInto(
        descriptor.value,
        `${path}.${key}`,
        ancestors,
      );
      if (!child.ok) return child;
      parts.push(`${JSON.stringify(key)}:${child.value}`);
    }
    return { ok: true, value: `{${parts.join(",")}}` };
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Deterministic representation only. It is not the experiment identity hash.
 */
export function canonicalizeResearchContract(
  value: unknown,
): RuntimeValidationResult<string> {
  return canonicalizeInto(value, "$", new Set<object>());
}

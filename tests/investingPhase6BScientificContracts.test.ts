import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  DATASET_REQUEST_VERSION,
  DATASET_VERSION_REF_VERSION,
  EXPERIMENT_DEFINITION_VERSION,
  EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  EXPERIMENT_RESULT_ENVELOPE_VERSION,
  INVESTING_RESEARCH_REASON_CODES,
  INVESTING_RESEARCH_SCOPE_VERSION,
  PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
  RESEARCH_HYPOTHESIS_VERSION,
  SCIENTIFIC_DECISION_VERSION,
  SCIENTIFIC_RUN_VERSION,
  STRATEGY_CANDIDATE_VERSION,
  canonicalizeResearchContract,
  isInvestingResearchReasonCode,
  researchScopesEqual,
  transitionExperimentRun,
  transitionResearchHypothesis,
  transitionStrategyCandidate,
  validateDatasetRequest,
  validateDatasetVersionRef,
  validateExperimentDefinition,
  validateExperimentIdentityMaterial,
  validateExperimentResultEnvelope,
  validateInvestingResearchScope,
  validateMatchingResearchScopes,
  validatePromotionEligibilityEnvelope,
  validateResearchHypothesis,
  validateScientificDecision,
  validateScientificRun,
  validateStrategyCandidate,
  validateValidationReport,
  toInvestingResearchScientificScope,
  type DatasetRequest,
  type DatasetVersionRef,
  type ExperimentDefinition,
  type ExperimentIdentityMaterial,
  type ExperimentResultEnvelope,
  type InvestingResearchScope,
  type ValidationReport,
  type PromotionEligibilityEnvelope,
  type ResearchHypothesis,
  type ScientificDecision,
  type ScientificRun,
  type StrategyCandidate,
} from "@/lib/investing/research/contracts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2026-12-31T00:00:00.000Z";

const scope: InvestingResearchScope = {
  contractVersion: INVESTING_RESEARCH_SCOPE_VERSION,
  authenticatedUserId: "user-a",
  membershipId: "membership-a",
  tenantId: "tenant-a",
  ownerId: "owner-a",
  portfolioId: "portfolio-a",
  accountId: "account-a",
};
const scientificScope = toInvestingResearchScientificScope(scope);

const datasetRequest: DatasetRequest = {
  contractVersion: DATASET_REQUEST_VERSION,
  requestId: "dataset-request-a",
  instruments: ["IWDA", "VWCE"],
  timeframe: "1d",
  range: { from: AT, to: LATER },
  dataKinds: ["corporate_actions", "price_bars"],
  quality: {
    minimumCoverageRatio: 0.99,
    maximumGapCount: 0,
    requireCorporateActionPolicy: true,
    timezone: "UTC",
  },
  scientificPurpose: "Evaluate a long-horizon allocation hypothesis.",
};

const dataset: DatasetVersionRef = {
  contractVersion: DATASET_VERSION_REF_VERSION,
  datasetVersionId: "dataset-version-a",
  datasetSchemaVersion: "dataset-schema/v1",
  manifestHash: HASH_A,
  aggregateContentHash: HASH_B,
  coverage: {
    instruments: ["IWDA", "VWCE"],
    timeframe: "1d",
    range: { from: AT, to: LATER },
    coverageRatio: 1,
    gapCount: 0,
  },
  quality: { status: "qualified", warningCodes: [] },
  provenanceRef: { id: "provenance-a", version: "v1" },
  qualifiedAt: LATER,
};

const portfolioConfiguration = {
  baseCurrency: "EUR",
  initialCapital: 100_000,
  allowLeverage: false,
  allowShorting: false,
  rebalanceFrequency: "monthly",
} as const;

const hypothesis: ResearchHypothesis = {
  contractVersion: RESEARCH_HYPOTHESIS_VERSION,
  hypothesisId: "hypothesis-a",
  hypothesisVersion: "v1",
  state: "active",
  statement: "A diversified allocation can improve risk-adjusted returns.",
  family: "strategic-allocation",
  rationale: "Diversification may reduce concentration risk.",
  universe: ["IWDA", "VWCE"],
  horizon: "long-term",
  variables: [{ name: "equity_weight", value: 0.8 }],
  expectedBenchmark: { id: "benchmark-a", version: "v1" },
  falsificationCriteria: ["Risk-adjusted return does not exceed the benchmark."],
};

const candidate: StrategyCandidate = {
  contractVersion: STRATEGY_CANDIDATE_VERSION,
  candidateId: "candidate-a",
  candidateVersion: "v1",
  hypothesisId: "hypothesis-a",
  hypothesisVersion: "v1",
  state: "ready",
  strategyContract: { id: "allocation-strategy", version: "v1" },
  parameters: [
    { name: "equity_weight", value: 0.8 },
    { name: "rebalance_band", value: 0.05 },
  ],
  portfolioAssumptions: portfolioConfiguration,
  datasetRequirements: datasetRequest,
  intendedEvaluationRange: { from: AT, to: LATER },
  generation: {
    generatorId: "manual-research",
    generatorVersion: "v1",
    generatedAt: AT,
    parentCandidateId: null,
  },
};

const splits = [
  {
    name: "training",
    purpose: "training",
    range: { from: AT, to: "2026-06-01T00:00:00.000Z" },
  },
  {
    name: "holdout",
    purpose: "holdout",
    range: { from: "2026-06-01T00:00:00.000Z", to: LATER },
  },
] as const;

const identityMaterial: ExperimentIdentityMaterial = {
  contractVersion: EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  scientificScope,
  candidateId: candidate.candidateId,
  candidateVersion: candidate.candidateVersion,
  hypothesisId: candidate.hypothesisId,
  hypothesisVersion: candidate.hypothesisVersion,
  strategyContract: candidate.strategyContract,
  canonicalParameters: candidate.parameters,
  datasetVersionId: dataset.datasetVersionId,
  datasetManifestHash: dataset.manifestHash,
  datasetContentHash: dataset.aggregateContentHash,
  engineContract: { id: "investing-backtest-engine", version: "v1" },
  validationProfile: { id: "validation-profile-a", version: "v1" },
  portfolioConfiguration,
  costModel: { id: "cost-model-a", version: "v1" },
  benchmark: { id: "benchmark-a", version: "v1" },
  splits,
  randomSeed: "seed-a",
  configurationVersion: "v1",
};

const experiment: ExperimentDefinition = {
  contractVersion: EXPERIMENT_DEFINITION_VERSION,
  experimentId: "experiment-a",
  scope,
  candidate,
  dataset,
  evaluationRange: { from: AT, to: LATER },
  splits,
  portfolioConfiguration,
  costModel: identityMaterial.costModel,
  validationProfile: identityMaterial.validationProfile,
  benchmark: identityMaterial.benchmark,
  engineContract: identityMaterial.engineContract,
  randomSeed: identityMaterial.randomSeed,
  configurationVersion: identityMaterial.configurationVersion,
  identityMaterial,
};

const resultEnvelope: ExperimentResultEnvelope = {
  contractVersion: EXPERIMENT_RESULT_ENVELOPE_VERSION,
  experimentId: experiment.experimentId,
  runId: "run-a",
  candidateId: candidate.candidateId,
  candidateVersion: candidate.candidateVersion,
  hypothesisId: candidate.hypothesisId,
  hypothesisVersion: candidate.hypothesisVersion,
  scope,
  dataset,
  validationProfile: identityMaterial.validationProfile,
  benchmark: identityMaterial.benchmark,
  completionStatus: "completed",
  summary: "Experiment completed with one deliberately unavailable metric.",
  metrics: [
    { name: "return", value: { availability: "available", value: 0.08, unit: "ratio" } },
    {
      name: "turnover",
      value: {
        availability: "unavailable",
        reasonCode: "research.validation.metric_unavailable",
      },
    },
  ],
  benchmarkComparison: [],
  warnings: ["research.validation.metric_unavailable"],
  qualityFlags: [],
  validationInputRefs: [],
  artifacts: [],
};

const validationReport: ValidationReport = {
  contractVersion: "investing-validation-report/v1",
  reportId: "report-a",
  candidateId: candidate.candidateId,
  candidateVersion: candidate.candidateVersion,
  hypothesisId: candidate.hypothesisId,
  hypothesisVersion: candidate.hypothesisVersion,
  experimentId: experiment.experimentId,
  runId: resultEnvelope.runId,
  scope,
  dataset,
  validationProfile: identityMaterial.validationProfile,
  benchmark: identityMaterial.benchmark,
  result: resultEnvelope,
  gates: [{
    gateId: "gate-a",
    gateVersion: "v1",
    outcome: "passed",
    reasonCodes: [],
    evidenceIds: ["evidence-a"],
  }],
  evidence: [{
    evidenceId: "evidence-a",
    kind: "validation",
    description: "Validation evidence.",
    artifactRefs: [],
    reasonCodes: [],
  }],
  warnings: [],
  blockers: [],
  evaluatedAt: LATER,
  evaluatedBy: { id: "validation-process", version: "v1" },
};

const decision: ScientificDecision = {
  contractVersion: SCIENTIFIC_DECISION_VERSION,
  decisionId: "decision-a",
  outcome: "validated",
  candidateId: candidate.candidateId,
  candidateVersion: candidate.candidateVersion,
  hypothesisId: candidate.hypothesisId,
  hypothesisVersion: candidate.hypothesisVersion,
  experimentId: experiment.experimentId,
  runId: resultEnvelope.runId,
  datasetVersionId: dataset.datasetVersionId,
  datasetManifestHash: dataset.manifestHash,
  datasetContentHash: dataset.aggregateContentHash,
  scope,
  scientificScope,
  validationReport,
  validationProfile: identityMaterial.validationProfile,
  reasonCodes: [],
  evidenceIds: ["evidence-a"],
  warnings: [],
  blockers: [],
  decidedAt: LATER,
  decidedBy: { id: "validation-process", version: "v1" },
};

function promotionEnvelope(): PromotionEligibilityEnvelope {
  return {
    contractVersion: PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
    eligibilityId: "eligibility-a",
    state: "promotion_eligible",
    scope,
    scientificScope,
    candidateId: candidate.candidateId,
    candidateVersion: candidate.candidateVersion,
    hypothesisId: candidate.hypothesisId,
    hypothesisVersion: candidate.hypothesisVersion,
    experimentId: experiment.experimentId,
    runId: resultEnvelope.runId,
    dataset,
    validationDecision: decision as ScientificDecision & { outcome: "validated" },
    evidenceIds: ["evidence-a"],
    reasonCodes: [],
    eligibilityProfile: { id: "eligibility-profile", version: "v1" },
    evaluatedAt: LATER,
    evaluatedBy: { id: "eligibility-process", version: "v1" },
  };
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function issueCodes(result: { ok: boolean; issues?: readonly { reasonCode: string }[] }) {
  return result.ok ? [] : result.issues?.map((entry) => entry.reasonCode) ?? [];
}

describe("FASE 6B scientific contracts", () => {
  it("accepts a complete server-resolved scientific scope", () => {
    expect(validateInvestingResearchScope(scope)).toEqual({ ok: true, value: scope });
  });

  it("fails closed for incomplete and mismatched scopes", () => {
    const incomplete = copy(scope) as Record<string, unknown>;
    delete incomplete.accountId;
    expect(issueCodes(validateInvestingResearchScope(incomplete)))
      .toContain("research.identity.scope_incomplete");
    expect(validateMatchingResearchScopes(scope, { ...scope, tenantId: "tenant-b" }))
      .toEqual({
        ok: false,
        issues: [{ path: "scope", reasonCode: "research.identity.scope_mismatch" }],
      });
    expect(researchScopesEqual(scope, { ...scope, ownerId: "owner-b" })).toBe(false);
  });

  it("keeps DatasetRequest distinct from DatasetVersionRef", () => {
    expect(validateDatasetRequest(datasetRequest).ok).toBe(true);
    expect(issueCodes(validateDatasetVersionRef(datasetRequest)))
      .toContain("research.dataset.not_versioned");
  });

  it("rejects a dataset version without both hashes", () => {
    const invalid = { ...dataset, manifestHash: "" };
    expect(issueCodes(validateDatasetVersionRef(invalid)))
      .toContain("research.dataset.hash_missing");
  });

  it("models hypothesis and executable candidate as distinct contracts", () => {
    expect(RESEARCH_HYPOTHESIS_VERSION).not.toBe(STRATEGY_CANDIDATE_VERSION);
    expect(candidate.hypothesisId).not.toBe(candidate.candidateId);
    expect(validateResearchHypothesis(hypothesis).ok).toBe(true);
    expect(validateStrategyCandidate(candidate).ok).toBe(true);
  });

  it("rejects an experiment backed only by a DatasetRequest", () => {
    const invalid = { ...experiment, dataset: datasetRequest };
    expect(issueCodes(validateExperimentDefinition(invalid)))
      .toContain("research.dataset.not_versioned");
  });

  it("rejects incomplete or inconsistent identity material", () => {
    const incomplete = { ...identityMaterial, datasetContentHash: "" };
    expect(issueCodes(validateExperimentIdentityMaterial(incomplete)))
      .toContain("research.dataset.hash_missing");
    const mismatch = {
      ...experiment,
      identityMaterial: { ...identityMaterial, datasetVersionId: "dataset-version-b" },
    };
    expect(issueCodes(validateExperimentDefinition(mismatch)))
      .toContain("research.experiment.identity_incomplete");
  });

  it("rejects NaN, Infinity, invalid dates and inverted intervals", () => {
    expect(validateStrategyCandidate({
      ...candidate,
      portfolioAssumptions: { ...portfolioConfiguration, initialCapital: Number.NaN },
    }).ok).toBe(false);
    expect(validateStrategyCandidate({
      ...candidate,
      portfolioAssumptions: { ...portfolioConfiguration, initialCapital: Infinity },
    }).ok).toBe(false);
    expect(validateDatasetRequest({
      ...datasetRequest,
      range: { from: "not-a-date", to: LATER },
    }).ok).toBe(false);
    expect(validateDatasetRequest({
      ...datasetRequest,
      range: { from: LATER, to: AT },
    }).ok).toBe(false);
  });

  it("rejects duplicate instruments, parameters and split names", () => {
    expect(issueCodes(validateDatasetRequest({
      ...datasetRequest,
      instruments: ["VWCE", "VWCE"],
    }))).toContain("research.integrity.duplicate_value");
    expect(issueCodes(validateStrategyCandidate({
      ...candidate,
      parameters: [
        { name: "weight", value: 0.5 },
        { name: "weight", value: 0.6 },
      ],
    }))).toContain("research.integrity.duplicate_value");
    expect(issueCodes(validateExperimentDefinition({
      ...experiment,
      splits: [splits[0], splits[0]],
    }))).toContain("research.integrity.duplicate_value");
  });

  it("rejects unknown states and allows only explicit transitions", () => {
    expect(validateStrategyCandidate({ ...candidate, state: "approved" }).ok).toBe(false);
    expect(transitionResearchHypothesis("draft", "active").ok).toBe(true);
    expect(transitionStrategyCandidate("testing", "validated").ok).toBe(true);
    expect(transitionStrategyCandidate("rejected", "promoted")).toEqual({
      ok: false,
      from: "rejected",
      to: "promoted",
      reasonCode: "research.execution.transition_not_allowed",
    });
    expect(transitionExperimentRun("completed", "running").ok).toBe(false);
    expect(transitionExperimentRun("blocked", "queued").ok).toBe(false);
  });

  it("keeps operational retry on the same scientific experiment", () => {
    const first: ScientificRun = {
      contractVersion: SCIENTIFIC_RUN_VERSION,
      runId: "run-a",
      experimentId: experiment.experimentId,
      scope,
      state: "failed",
      attempt: 1,
      createdAt: AT,
      startedAt: AT,
      completedAt: LATER,
      lease: null,
      artifactRefs: [],
      result: null,
      failure: { reasonCodes: ["research.execution.failed"], failedStage: "execution" },
      reasonCodes: ["research.execution.failed"],
    };
    const retry = {
      ...first,
      runId: "run-b",
      state: "defined",
      attempt: 2,
      startedAt: null,
      completedAt: null,
      failure: null,
      reasonCodes: [],
    } as const;
    expect(validateScientificRun(first).ok).toBe(true);
    expect(validateScientificRun(retry).ok).toBe(true);
    expect(retry.experimentId).toBe(first.experimentId);
  });

  it("preserves unavailable metrics instead of coercing them to zero", () => {
    expect(validateExperimentResultEnvelope(resultEnvelope).ok).toBe(true);
    expect(resultEnvelope.metrics[1].value).toEqual({
      availability: "unavailable",
      reasonCode: "research.validation.metric_unavailable",
    });
  });

  it("keeps validated, promotion eligible and promoted distinct", () => {
    expect(decision.outcome).toBe("validated");
    expect(transitionStrategyCandidate("validated", "promotion_eligible").ok).toBe(true);
    expect(transitionStrategyCandidate("validated", "promoted").ok).toBe(false);
  });

  it("defines an evidence-only promotion envelope without execution handles", () => {
    const envelope: PromotionEligibilityEnvelope = {
      contractVersion: PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
      eligibilityId: "eligibility-a",
      state: "promotion_eligible",
      scope,
      scientificScope,
      candidateId: candidate.candidateId,
      candidateVersion: candidate.candidateVersion,
      hypothesisId: candidate.hypothesisId,
      hypothesisVersion: candidate.hypothesisVersion,
      experimentId: experiment.experimentId,
      runId: resultEnvelope.runId,
      dataset,
      validationDecision: decision as ScientificDecision & { outcome: "validated" },
      evidenceIds: ["evidence-a"],
      reasonCodes: [],
      eligibilityProfile: { id: "eligibility-profile", version: "v1" },
      evaluatedAt: LATER,
      evaluatedBy: { id: "eligibility-process", version: "v1" },
    };
    expect(validateScientificDecision(decision).ok).toBe(true);
    expect(validatePromotionEligibilityEnvelope(envelope).ok).toBe(true);
    expect(envelope).not.toHaveProperty("execute");
    expect(envelope).not.toHaveProperty("applicationBoundary");
    expect(envelope).not.toHaveProperty("order");
  });

  it("accepts known reason codes and rejects unknown reason codes", () => {
    expect(INVESTING_RESEARCH_REASON_CODES.length).toBeGreaterThan(8);
    expect(isInvestingResearchReasonCode("research.validation.inconclusive")).toBe(true);
    expect(isInvestingResearchReasonCode("free_form_error")).toBe(false);
    expect(validateScientificDecision({
      ...decision,
      reasonCodes: ["free_form_error"],
    }).ok).toBe(false);
  });

  it("canonicalizes object keys deterministically without claiming a hash", () => {
    const left = canonicalizeResearchContract({ z: 1, a: { y: 2, x: 3 } });
    const right = canonicalizeResearchContract({ a: { x: 3, y: 2 }, z: 1 });
    expect(left).toEqual(right);
    expect(left).toEqual({ ok: true, value: '{"a":{"x":3,"y":2},"z":1}' });
    expect(canonicalizeResearchContract({ value: Number.NaN }).ok).toBe(false);
    expect(canonicalizeResearchContract(-0))
      .toEqual({ ok: true, value: "0" });
  });

  it("rejects unsupported canonical values without throwing or collisions", () => {
    class Custom {}
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const sparse = new Array(1);
    const unsupported = [
      new Date(AT),
      new Map(),
      new Set(),
      new Custom(),
      sparse,
      undefined,
      () => undefined,
      BigInt(1),
      cycle,
    ];
    for (const value of unsupported) {
      expect(() => canonicalizeResearchContract(value)).not.toThrow();
      expect(canonicalizeResearchContract(value).ok).toBe(false);
    }
    expect(canonicalizeResearchContract(new Map()))
      .not.toEqual(canonicalizeResearchContract({}));
    expect(canonicalizeResearchContract(sparse))
      .not.toEqual(canonicalizeResearchContract([]));
  });

  it("rejects hidden own properties and accessors without invoking getters", () => {
    let getterCalls = 0;
    const withSymbol: Record<PropertyKey, unknown> = {};
    withSymbol[Symbol("private")] = 1;
    const nonEnumerable = {};
    Object.defineProperty(nonEnumerable, "hidden", {
      value: 1,
      enumerable: false,
    });
    const withGetter = {};
    Object.defineProperty(withGetter, "hidden", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 1;
      },
    });
    const withSetter = {};
    Object.defineProperty(withSetter, "hidden", {
      enumerable: true,
      set(_value: unknown) {
        // The canonicalizer must reject the descriptor without invoking it.
        void _value;
      },
    });
    for (const value of [withSymbol, nonEnumerable, withGetter, withSetter]) {
      const validation = canonicalizeResearchContract(value);
      expect(validation.ok).toBe(false);
      expect(validation).not.toEqual({ ok: true, value: "{}" });
      expect(issueCodes(validation))
        .toContain("research.contract.canonical_value_invalid");
    }
    expect(getterCalls).toBe(0);
    expect(canonicalizeResearchContract({ b: 2, a: 1 }))
      .toEqual({ ok: true, value: '{"a":1,"b":2}' });
  });

  it("rejects hidden own properties and accessors on arrays", () => {
    const withSymbol = [1];
    Object.defineProperty(withSymbol, Symbol("private"), {
      value: 2,
      enumerable: true,
    });
    const nonEnumerable = [1];
    Object.defineProperty(nonEnumerable, "hidden", {
      value: 2,
      enumerable: false,
    });
    const withAccessor = [1];
    Object.defineProperty(withAccessor, "hidden", {
      enumerable: true,
      get() {
        throw new Error("array getter must not run");
      },
    });
    expect(canonicalizeResearchContract(withSymbol).ok).toBe(false);
    expect(canonicalizeResearchContract(nonEnumerable).ok).toBe(false);
    expect(() => canonicalizeResearchContract(withAccessor)).not.toThrow();
    expect(canonicalizeResearchContract(withAccessor).ok).toBe(false);
    expect(canonicalizeResearchContract([1, 2]))
      .toEqual({ ok: true, value: "[1,2]" });
  });

  it("rejects unexpected top-level and nested properties", () => {
    expect(validateInvestingResearchScope({ ...scope, execute: () => "write" }).ok)
      .toBe(false);
    expect(validateDatasetRequest({
      ...datasetRequest,
      quality: { ...datasetRequest.quality, secret: "not-returned" },
    }).ok).toBe(false);
    const invalid = validateInvestingResearchScope({
      ...scope,
      unexpected: "sensitive",
    });
    expect(invalid.ok).toBe(false);
    if ("issues" in invalid) {
      expect(invalid.issues).toContainEqual({
        path: "scope.unexpected",
        reasonCode: "research.contract.unexpected_property",
      });
      expect(JSON.stringify(invalid.issues)).not.toContain("sensitive");
    }
  });

  it("closes schemas over every own property without invoking getters", () => {
    const symbolScope = copy(scope) as Record<PropertyKey, unknown>;
    symbolScope[Symbol("private")] = "hidden";
    expect(issueCodes(validateInvestingResearchScope(symbolScope)))
      .toContain("research.contract.unexpected_property");

    const nonEnumerableScope = copy(scope);
    Object.defineProperty(nonEnumerableScope, "hidden", {
      value: "secret",
      enumerable: false,
    });
    expect(validateInvestingResearchScope(nonEnumerableScope).ok).toBe(false);

    const nestedDataset = copy(dataset) as unknown as {
      coverage: Record<PropertyKey, unknown>;
    };
    nestedDataset.coverage[Symbol("private")] = "hidden";
    expect(validateDatasetVersionRef(nestedDataset).ok).toBe(false);

    const hiddenExecute = promotionEnvelope() as PromotionEligibilityEnvelope & {
      execute?: () => string;
    };
    Object.defineProperty(hiddenExecute, "execute", {
      value: () => "write",
      enumerable: false,
    });
    expect(validatePromotionEligibilityEnvelope(hiddenExecute).ok).toBe(false);

    const symbolExecute = promotionEnvelope() as unknown as Record<PropertyKey, unknown>;
    symbolExecute[Symbol("execute")] = () => "write";
    expect(validatePromotionEligibilityEnvelope(symbolExecute).ok).toBe(false);

    let getterCalls = 0;
    const getterScope = copy(scope);
    Object.defineProperty(getterScope, "hidden", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "secret";
      },
    });
    expect(validateInvestingResearchScope(getterScope).ok).toBe(false);
    expect(getterCalls).toBe(0);

    const validScope = copy(scope);
    const validated = validateInvestingResearchScope(validScope);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value).toEqual(validScope);
      expect(validated.value).not.toBe(validScope);
    }
  });

  it("separates authorization actor from scientific identity scope", () => {
    const actorChanged = {
      ...experiment,
      scope: {
        ...scope,
        authenticatedUserId: "user-b",
        membershipId: "membership-b",
      },
    };
    expect(validateExperimentDefinition(actorChanged).ok).toBe(true);
    expect(actorChanged.identityMaterial).toEqual(experiment.identityMaterial);
    for (const key of ["tenantId", "ownerId", "portfolioId", "accountId"] as const) {
      expect(validateExperimentDefinition({
        ...experiment,
        scope: { ...scope, [key]: `${key}-b` },
      }).ok).toBe(false);
    }
  });

  it("rejects hypothesis identity mismatches", () => {
    expect(validateExperimentDefinition({
      ...experiment,
      identityMaterial: { ...identityMaterial, hypothesisId: "hypothesis-b" },
    }).ok).toBe(false);
    expect(validateExperimentDefinition({
      ...experiment,
      identityMaterial: { ...identityMaterial, hypothesisVersion: "v2" },
    }).ok).toBe(false);
  });

  it("enforces ScientificRun state and timestamp invariants", () => {
    const completed: ScientificRun = {
      contractVersion: SCIENTIFIC_RUN_VERSION,
      runId: resultEnvelope.runId,
      experimentId: experiment.experimentId,
      scope,
      state: "completed",
      attempt: 1,
      createdAt: AT,
      startedAt: AT,
      completedAt: LATER,
      lease: null,
      artifactRefs: [],
      result: resultEnvelope,
      failure: null,
      reasonCodes: [],
    };
    expect(validateScientificRun(completed).ok).toBe(true);
    expect(validateScientificRun({ ...completed, result: null }).ok).toBe(false);
    expect(validateScientificRun({
      ...completed,
      failure: { reasonCodes: ["research.execution.failed"], failedStage: "run" },
    }).ok).toBe(false);
    expect(validateScientificRun({ ...completed, completedAt: null }).ok).toBe(false);
    expect(validateScientificRun({ ...completed, startedAt: LATER, completedAt: AT }).ok)
      .toBe(false);
    expect(validateScientificRun({ ...completed, state: "running" }).ok).toBe(false);
    expect(validateScientificRun({
      ...completed,
      state: "queued",
      result: null,
      startedAt: null,
      completedAt: null,
      lease: { leaseId: "l", workerId: "w", leasedAt: AT, expiresAt: LATER },
    }).ok).toBe(false);
    expect(validateScientificRun({
      ...completed,
      state: "leased",
      result: null,
      startedAt: null,
      completedAt: null,
      lease: {},
    }).ok).toBe(false);
  });

  it("accepts coherent operational shapes for every run state", () => {
    const base = {
      contractVersion: SCIENTIFIC_RUN_VERSION,
      experimentId: experiment.experimentId,
      scope,
      attempt: 1,
      createdAt: AT,
      artifactRefs: [],
    } as const;
    const lease = {
      leaseId: "lease-a",
      workerId: "worker-a",
      leasedAt: AT,
      expiresAt: LATER,
    };
    const failure = {
      reasonCodes: ["research.execution.failed"] as const,
      failedStage: "execution",
    };
    const runs: ScientificRun[] = [
      { ...base, runId: "run-defined", state: "defined", startedAt: null, completedAt: null, lease: null, result: null, failure: null, reasonCodes: [] },
      { ...base, runId: "run-queued", state: "queued", startedAt: null, completedAt: null, lease: null, result: null, failure: null, reasonCodes: [] },
      { ...base, runId: "run-leased", state: "leased", startedAt: null, completedAt: null, lease, result: null, failure: null, reasonCodes: [] },
      { ...base, runId: "run-running", state: "running", startedAt: AT, completedAt: null, lease, result: null, failure: null, reasonCodes: [] },
      { ...base, runId: resultEnvelope.runId, state: "completed", startedAt: AT, completedAt: LATER, lease: null, result: resultEnvelope, failure: null, reasonCodes: [] },
      { ...base, runId: "run-failed", state: "failed", startedAt: AT, completedAt: LATER, lease: null, result: null, failure, reasonCodes: ["research.execution.failed"] },
      { ...base, runId: "run-blocked", state: "blocked", startedAt: AT, completedAt: LATER, lease: null, result: null, failure, reasonCodes: ["research.validation.blocked"] },
      { ...base, runId: "run-cancelled", state: "cancelled", startedAt: AT, completedAt: LATER, lease: null, result: null, failure: null, reasonCodes: ["research.execution.cancelled"] },
    ];
    for (const run of runs) expect(validateScientificRun(run).ok).toBe(true);
  });

  it("rejects cross-reference mismatches and incomplete decisions", () => {
    expect(validateValidationReport({
      ...validationReport,
      runId: "run-b",
    }).ok).toBe(false);
    expect(validateValidationReport({
      ...validationReport,
      dataset: { ...dataset, datasetVersionId: "dataset-version-b" },
    }).ok).toBe(false);
    expect(validateValidationReport({
      ...validationReport,
      candidateId: "candidate-b",
    }).ok).toBe(false);
    expect(validateScientificDecision({ outcome: "validated" }).ok).toBe(false);
    expect(validateScientificDecision({
      ...decision,
      runId: "run-b",
    }).ok).toBe(false);
  });

  it("closes and aligns PromotionEligibilityEnvelope", () => {
    const envelope: PromotionEligibilityEnvelope = {
      contractVersion: PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
      eligibilityId: "eligibility-a",
      state: "promotion_eligible",
      scope,
      scientificScope,
      candidateId: candidate.candidateId,
      candidateVersion: candidate.candidateVersion,
      hypothesisId: candidate.hypothesisId,
      hypothesisVersion: candidate.hypothesisVersion,
      experimentId: experiment.experimentId,
      runId: resultEnvelope.runId,
      dataset,
      validationDecision: decision as ScientificDecision & { outcome: "validated" },
      evidenceIds: ["evidence-a"],
      reasonCodes: [],
      eligibilityProfile: { id: "eligibility-profile", version: "v1" },
      evaluatedAt: LATER,
      evaluatedBy: { id: "eligibility-process", version: "v1" },
    };
    expect(validatePromotionEligibilityEnvelope(envelope).ok).toBe(true);
    expect(validatePromotionEligibilityEnvelope({
      ...envelope,
      validationDecision: { ...decision, runId: "run-b" },
    }).ok).toBe(false);
    expect(validatePromotionEligibilityEnvelope({
      ...envelope,
      execute: () => "write",
    }).ok).toBe(false);
    expect(validatePromotionEligibilityEnvelope({
      ...envelope,
      unexpected: true,
    }).ok).toBe(false);
  });
});

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const target = path.resolve(directory, entry);
    return statSync(target).isDirectory() ? files(target) : [target];
  });
}

describe("FASE 6B contract isolation", () => {
  it("contains only pure contract modules with forbidden imports absent", () => {
    const contractRoot = path.resolve(process.cwd(), "lib/investing/research/contracts");
    const sources = files(contractRoot)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(sources).not.toMatch(
      /lib\/trading|@\/lib\/trading|@supabase|from ["']pg["']|@clerk|providers?|node:fs|node:child_process|pm2|process\.cwd|process\.env|use client/iu,
    );
    expect(sources).not.toMatch(
      /investing\/(server|repository|broker|execution|accounting)|investing_(orders|positions|ledger)/iu,
    );
    expect(sources).not.toMatch(/\b(fetch|Date\.now|Math\.random|new Date)\s*\(/u);
  });

  it("adds no schema, migration, route, worker, queue or storage module", () => {
    const contractFiles = files(path.resolve(process.cwd(), "lib/investing/research/contracts"));
    expect(contractFiles.every((file) => file.endsWith(".ts"))).toBe(true);
    const source = contractFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\b(insert|update|delete|select)\s+(into|from)|new Pool|createClient/iu);
    expect(source).not.toMatch(/\b(worker|queue|lease manager|filesystem storage|broker execution)\b/iu);
  });
});

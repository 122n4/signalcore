import { describe, expect, it } from "vitest";

import {
  DATASET_VERSION_REF_VERSION,
  EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  RESEARCH_ARTIFACT_REF_VERSION,
  type DatasetVersionRef,
  type ExperimentIdentityMaterial,
  type ResearchArtifactRef,
} from "@/lib/investing/research/contracts";
import { deriveResearchArtifactIdentity } from "@/lib/investing/research/reproducibility/artifacts.server";
import { deriveReproducibleExecutionIdentity } from "@/lib/investing/research/reproducibility/executionIdentity.server";
import { hashCanonicalResearchMaterial } from "@/lib/investing/research/reproducibility/hashing.server";
import {
  deriveReproducibilityManifest,
  validateReproducibilityManifestIntegrity,
} from "@/lib/investing/research/reproducibility/manifest.server";
import {
  EXECUTION_ENVIRONMENT_VERSION,
  SOURCE_REVISION_VERSION,
  type ArtifactIdentityMaterial,
  type ExecutionEnvironmentRef,
  type ReproducibilityManifestCore,
  type ReproducibleExecutionIdentityMaterial,
  type SourceRevision,
} from "@/lib/investing/research/reproducibility/materials";
import { deriveScientificExperimentIdentity } from "@/lib/investing/research/reproducibility/scientificIdentity.server";
import {
  ARTIFACT_IDENTITY_DOMAIN,
  ARTIFACT_IDENTITY_VERSION,
  EXECUTION_IDENTITY_DOMAIN,
  REPRODUCIBILITY_MANIFEST_VERSION,
  REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
  RESEARCH_CANONICALIZATION_VERSION,
  RESEARCH_HASH_ALGORITHM,
  SCIENTIFIC_IDENTITY_DOMAIN,
  SCIENTIFIC_IDENTITY_VERSION,
} from "@/lib/investing/research/reproducibility/versions";
import {
  validateArtifactIdentityProjection,
} from "@/lib/investing/research/reproducibility/runtimeValidation";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2026-12-31T00:00:00.000Z";

const identityMaterial: ExperimentIdentityMaterial = {
  contractVersion: EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  scientificScope: {
    tenantId: "tenant-a",
    ownerId: "owner-a",
    portfolioId: "portfolio-a",
    accountId: "account-a",
  },
  candidateId: "candidate-a",
  candidateVersion: "v1",
  hypothesisId: "hypothesis-a",
  hypothesisVersion: "v1",
  strategyContract: { id: "strategy-a", version: "v1" },
  canonicalParameters: [
    { name: "allocation", value: 0.8 },
    { name: "rebalance_band", value: 0.05 },
  ],
  datasetVersionId: "dataset-a",
  datasetManifestHash: A,
  datasetContentHash: B,
  engineContract: { id: "engine-a", version: "v1" },
  validationProfile: { id: "validation-a", version: "v1" },
  portfolioConfiguration: {
    baseCurrency: "EUR",
    initialCapital: 100_000,
    allowLeverage: false,
    allowShorting: false,
    rebalanceFrequency: "monthly",
  },
  costModel: { id: "cost-a", version: "v1" },
  benchmark: { id: "benchmark-a", version: "v1" },
  splits: [{
    name: "holdout",
    purpose: "holdout",
    range: { from: AT, to: LATER },
  }],
  randomSeed: "seed-a",
  configurationVersion: "v1",
};

const dataset: DatasetVersionRef = {
  contractVersion: DATASET_VERSION_REF_VERSION,
  datasetVersionId: identityMaterial.datasetVersionId,
  datasetSchemaVersion: "v1",
  manifestHash: identityMaterial.datasetManifestHash,
  aggregateContentHash: identityMaterial.datasetContentHash,
  coverage: {
    instruments: ["IWDA"],
    timeframe: "1d",
    range: { from: AT, to: LATER },
    coverageRatio: 1,
    gapCount: 0,
  },
  quality: { status: "qualified", warningCodes: [] },
  provenanceRef: { id: "provider-a", version: "v1" },
  qualifiedAt: LATER,
};

const sourceRevision: SourceRevision = {
  contractVersion: SOURCE_REVISION_VERSION,
  repositoryId: "syntrake-signalcore",
  vcsKind: "git",
  commitHash: "d".repeat(40),
  workingTreeState: "clean",
  sourceContentHash: C,
};

const environment: ExecutionEnvironmentRef = {
  contractVersion: EXECUTION_ENVIRONMENT_VERSION,
  dependencyLockHash: "e".repeat(64),
  engineBuildHash: "f".repeat(64),
  runtime: { id: "node", version: "24.13.0" },
  platform: "linux",
  architecture: "x64",
  rng: { id: "pcg64", version: "v1" },
  numericPolicy: { id: "ieee754", version: "v1" },
  calendarPolicy: { id: "utc-market-calendar", version: "v1" },
};

const artifact: ResearchArtifactRef = {
  contractVersion: RESEARCH_ARTIFACT_REF_VERSION,
  artifactId: "artifact-logical-a",
  kind: "metrics",
  contentHash: A,
  mediaType: "application/json",
  schemaVersion: "v1",
  sizeBytes: 128,
  logicalRole: "primary-result",
  provenanceRef: { id: "research-worker", version: "v1" },
  retentionClass: "scientific_record",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function scientific(material: unknown = identityMaterial) {
  const result = deriveScientificExperimentIdentity(material);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected scientific identity");
  return result.value;
}

function executionMaterial(): ReproducibleExecutionIdentityMaterial {
  const scientificIdentity = scientific();
  return {
    contractVersion: REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
    scientificExperimentId: scientificIdentity.experimentId,
    scientificExperimentDigest: scientificIdentity.digest,
    sourceRevision,
    environment,
    contractVersions: {
      experimentIdentityMaterial: EXPERIMENT_IDENTITY_MATERIAL_VERSION,
      datasetVersionRef: DATASET_VERSION_REF_VERSION,
      artifactRef: RESEARCH_ARTIFACT_REF_VERSION,
    },
  };
}

function execution(material: unknown = executionMaterial()) {
  const result = deriveReproducibleExecutionIdentity(material);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected execution identity");
  return result.value;
}

function manifestCore(): ReproducibilityManifestCore {
  const scientificIdentity = scientific();
  const linkedExecutionMaterial = executionMaterial();
  const executionIdentity = execution(linkedExecutionMaterial);
  const artifactIdentity = deriveResearchArtifactIdentity({
    contractVersion: ARTIFACT_IDENTITY_VERSION,
    scientificIdentity,
    executionIdentity,
    executionMaterial: linkedExecutionMaterial,
    artifact,
  });
  expect(artifactIdentity.ok).toBe(true);
  if (!artifactIdentity.ok) throw new Error("expected artifact identity");
  return {
    contractVersion: REPRODUCIBILITY_MANIFEST_VERSION,
    scientificIdentity,
    executionIdentity,
    dataset,
    hypothesis: {
      id: identityMaterial.hypothesisId,
      version: identityMaterial.hypothesisVersion,
    },
    candidate: {
      id: identityMaterial.candidateId,
      version: identityMaterial.candidateVersion,
    },
    sourceRevision,
    environment,
    strategyContract: identityMaterial.strategyContract,
    engineContract: identityMaterial.engineContract,
    validationProfile: identityMaterial.validationProfile,
    configurationVersion: identityMaterial.configurationVersion,
    randomSeed: identityMaterial.randomSeed,
    artifactExpectations: [{
      kind: artifact.kind,
      logicalRole: artifact.logicalRole,
      mediaType: artifact.mediaType,
      schemaVersion: artifact.schemaVersion,
      required: true,
    }],
    artifacts: [{
      identity: artifactIdentity.value,
      scientificExperimentId: scientificIdentity.experimentId,
      reproducibleExecutionId: executionIdentity.executionId,
      contentHash: artifact.contentHash,
      kind: artifact.kind,
      mediaType: artifact.mediaType,
      schemaVersion: artifact.schemaVersion,
      logicalRole: artifact.logicalRole,
    }],
  };
}

describe("FASE 6C scientific and execution identity", () => {
  it("defines frozen version literals and full lowercase SHA-256 identifiers", () => {
    expect(RESEARCH_HASH_ALGORITHM).toBe("sha256");
    expect(RESEARCH_CANONICALIZATION_VERSION).toBe(
      "investing-research-canonical-json/v1",
    );
    const value = scientific();
    expect(value.contractVersion).toBe(SCIENTIFIC_IDENTITY_VERSION);
    expect(value.digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(value.experimentId).toMatch(/^irexp_v1_[a-f0-9]{64}$/u);
  });

  it("is stable across repetitions and object key order", () => {
    expect(scientific()).toEqual(scientific(clone(identityMaterial)));
    const reordered = {
      randomSeed: identityMaterial.randomSeed,
      ...identityMaterial,
    };
    expect(scientific(reordered)).toEqual(scientific(identityMaterial));
  });

  it("changes for every material scientific input", () => {
    const base = scientific().experimentId;
    const mutations: Array<(value: ExperimentIdentityMaterial) => void> = [
      (value) => { (value as { hypothesisId: string }).hypothesisId = "hypothesis-b"; },
      (value) => { (value as { candidateId: string }).candidateId = "candidate-b"; },
      (value) => { (value.canonicalParameters[0] as { value: number }).value = 0.7; },
      (value) => { (value as { datasetVersionId: string }).datasetVersionId = "dataset-b"; },
      (value) => { (value as { datasetManifestHash: string }).datasetManifestHash = C; },
      (value) => { (value as { datasetContentHash: string }).datasetContentHash = C; },
      (value) => { (value.engineContract as { version: string }).version = "v2"; },
      (value) => { (value.validationProfile as { version: string }).version = "v2"; },
      (value) => { (value.portfolioConfiguration as { initialCapital: number }).initialCapital = 200_000; },
      (value) => { (value.costModel as { version: string }).version = "v2"; },
      (value) => { (value.benchmark as { version: string }).version = "v2"; },
      (value) => { (value.splits[0] as { name: string }).name = "validation"; },
      (value) => { (value as { randomSeed: string | null }).randomSeed = "seed-b"; },
      (value) => { (value.scientificScope as { tenantId: string }).tenantId = "tenant-b"; },
      (value) => { (value.scientificScope as { ownerId: string }).ownerId = "owner-b"; },
      (value) => { (value.scientificScope as { portfolioId: string }).portfolioId = "portfolio-b"; },
      (value) => { (value.scientificScope as { accountId: string }).accountId = "account-b"; },
    ];
    for (const mutate of mutations) {
      const changed = clone(identityMaterial);
      mutate(changed);
      expect(scientific(changed).experimentId).not.toBe(base);
    }
  });

  it("excludes authenticated actor and membership from scientific identity", () => {
    const authorizationA = {
      authenticatedUserId: "user-a",
      membershipId: "membership-a",
    };
    const authorizationB = {
      authenticatedUserId: "user-b",
      membershipId: "membership-b",
    };
    expect(authorizationA).not.toEqual(authorizationB);
    expect(scientific()).toEqual(scientific());
    expect(scientific().canonicalMaterial).not.toContain("authenticatedUserId");
    expect(scientific().canonicalMaterial).not.toContain("membershipId");
  });

  it("fails closed before hashing invalid canonical input", () => {
    const invalid = clone(identityMaterial) as unknown as {
      canonicalParameters: Array<{ name: string; value: unknown }>;
    };
    invalid.canonicalParameters[0].value = new Date();
    expect(deriveScientificExperimentIdentity(invalid).ok).toBe(false);
  });

  it("domain-separates identical canonical payloads", () => {
    const payload = { stable: true };
    const scientificHash = hashCanonicalResearchMaterial(
      SCIENTIFIC_IDENTITY_DOMAIN,
      payload,
    );
    const executionHash = hashCanonicalResearchMaterial(
      EXECUTION_IDENTITY_DOMAIN,
      payload,
    );
    expect(scientificHash.ok && executionHash.ok).toBe(true);
    if (scientificHash.ok && executionHash.ok) {
      expect(scientificHash.value.digest).not.toBe(executionHash.value.digest);
    }
  });

  it("requires a clean resolved source revision", () => {
    expect(execution().executionId).toMatch(/^irexec_v1_[a-f0-9]{64}$/u);
    for (const state of ["dirty", "unavailable"] as const) {
      const material = clone(executionMaterial());
      (material.sourceRevision as { workingTreeState: string }).workingTreeState = state;
      if (state === "unavailable") {
        (material.sourceRevision as { commitHash: string }).commitHash = "";
        (material.sourceRevision as { sourceContentHash: string | null })
          .sourceContentHash = null;
      }
      expect(deriveReproducibleExecutionIdentity(material).ok).toBe(false);
    }
  });

  it("changes execution identity for source and environment changes", () => {
    const base = execution().executionId;
    const mutations: Array<(value: ReproducibleExecutionIdentityMaterial) => void> = [
      (value) => { (value.sourceRevision as { commitHash: string }).commitHash = "1".repeat(40); },
      (value) => { (value.environment as { dependencyLockHash: string }).dependencyLockHash = "1".repeat(64); },
      (value) => { (value.environment as { engineBuildHash: string }).engineBuildHash = "2".repeat(64); },
      (value) => { (value.environment.runtime as { version: string }).version = "25.0.0"; },
      (value) => { (value.environment.rng as { version: string }).version = "v2"; },
      (value) => { (value.environment.numericPolicy as { version: string }).version = "v2"; },
      (value) => { (value.environment.calendarPolicy as { version: string }).version = "v2"; },
    ];
    for (const mutate of mutations) {
      const changed = clone(executionMaterial());
      mutate(changed);
      expect(execution(changed).executionId).not.toBe(base);
    }
  });
});

describe("FASE 6C manifest and artifact identity", () => {
  it("keeps operational manifest metadata outside the core digest", () => {
    const core = manifestCore();
    const first = deriveReproducibilityManifest(core, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    });
    const second = deriveReproducibilityManifest(core, {
      createdAt: LATER,
      createdByProcess: { id: "orchestrator", version: "v2" },
      warnings: ["research.validation.inconclusive"],
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.manifestId).toBe(second.value.manifestId);
      expect(first.value.coreDigest).toBe(second.value.coreDigest);
      expect(first.value.createdAt).not.toBe(second.value.createdAt);
    }
  });

  it("changes the manifest identity when its core changes", () => {
    const first = deriveReproducibilityManifest(manifestCore(), {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    });
    const changed = clone(manifestCore());
    (changed.artifactExpectations[0] as { required: boolean }).required = false;
    const second = deriveReproducibilityManifest(changed, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.manifestId).not.toBe(second.value.manifestId);
    }
  });

  it("rejects manifest references inconsistent with identity material", () => {
    const mismatches = [
      { ...manifestCore(), hypothesis: { id: "hypothesis-b", version: "v1" } },
      { ...manifestCore(), candidate: { id: "candidate-b", version: "v1" } },
      {
        ...manifestCore(),
        dataset: { ...dataset, datasetVersionId: "dataset-b" },
      },
      {
        ...manifestCore(),
        sourceRevision: { ...sourceRevision, commitHash: "1".repeat(40) },
      },
      {
        ...manifestCore(),
        environment: { ...environment, dependencyLockHash: "1".repeat(64) },
      },
    ];
    for (const core of mismatches) {
      expect(deriveReproducibilityManifest(core, {
        createdAt: AT,
        createdByProcess: { id: "orchestrator", version: "v1" },
        warnings: [],
      }).ok).toBe(false);
    }
  });

  it("rejects tampered identity and manifest digests", () => {
    const generated = deriveReproducibilityManifest(manifestCore(), {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    expect(validateReproducibilityManifestIntegrity({
      ...generated.value,
      coreDigest: C,
      manifestId: `irman_v1_${C}`,
    }).ok).toBe(false);
    expect(validateReproducibilityManifestIntegrity({
      ...generated.value,
      core: {
        ...generated.value.core,
        scientificIdentity: {
          ...generated.value.core.scientificIdentity,
          digest: C,
          experimentId: `irexp_v1_${C}`,
        },
      },
    }).ok).toBe(false);
  });

  it("binds artifact content and scientific semantics", () => {
    const scientificIdentity = scientific();
    const executionIdentity = execution();
    const material: ArtifactIdentityMaterial = {
      contractVersion: ARTIFACT_IDENTITY_VERSION,
      scientificIdentity,
      executionIdentity,
      executionMaterial: executionMaterial(),
      artifact,
    };
    const base = deriveResearchArtifactIdentity(material);
    expect(base.ok).toBe(true);
    if (base.ok) {
      expect(base.value.artifactId).toMatch(/^irart_v1_[a-f0-9]{64}$/u);
      expect(base.value.domain).toBe(ARTIFACT_IDENTITY_DOMAIN);
    }
    const variants = [
      { ...artifact, contentHash: B },
      { ...artifact, logicalRole: "diagnostic" },
      { ...artifact, schemaVersion: "v2" },
      { ...artifact, kind: "equity-curve" },
    ];
    for (const variant of variants) {
      const next = deriveResearchArtifactIdentity({
        ...material,
        artifact: variant,
      });
      expect(next.ok).toBe(true);
      if (base.ok && next.ok) expect(next.value.artifactId).not.toBe(base.value.artifactId);
    }
    const operationalVariant = deriveResearchArtifactIdentity({
      ...material,
      artifact: {
        ...artifact,
        artifactId: "artifact-logical-b",
        sizeBytes: 999,
        provenanceRef: { id: "another-worker", version: "v2" },
        retentionClass: "diagnostic",
      },
    });
    expect(operationalVariant.ok).toBe(true);
    if (base.ok && operationalVariant.ok) {
      expect(operationalVariant.value.artifactId).toBe(base.value.artifactId);
    }
  });

  it("returns structured errors rather than throwing for external input", () => {
    const functions = [
      () => deriveScientificExperimentIdentity(null),
      () => deriveReproducibleExecutionIdentity({}),
      () => deriveReproducibilityManifest({}, {
        createdAt: "invalid",
        createdByProcess: { id: "", version: "" },
        warnings: [],
      }),
      () => deriveResearchArtifactIdentity({}),
    ];
    for (const invoke of functions) {
      expect(invoke).not.toThrow();
      expect(invoke().ok).toBe(false);
    }
  });

  it("rejects internally hashed but structurally incomplete identities", () => {
    const incomplete = {
      hypothesisId: identityMaterial.hypothesisId,
      hypothesisVersion: identityMaterial.hypothesisVersion,
      candidateId: identityMaterial.candidateId,
      candidateVersion: identityMaterial.candidateVersion,
      datasetVersionId: identityMaterial.datasetVersionId,
      datasetManifestHash: identityMaterial.datasetManifestHash,
      datasetContentHash: identityMaterial.datasetContentHash,
      strategyContract: identityMaterial.strategyContract,
      engineContract: identityMaterial.engineContract,
      validationProfile: identityMaterial.validationProfile,
      configurationVersion: identityMaterial.configurationVersion,
      randomSeed: identityMaterial.randomSeed,
    };
    const hashed = hashCanonicalResearchMaterial(
      SCIENTIFIC_IDENTITY_DOMAIN,
      incomplete,
    );
    expect(hashed.ok).toBe(true);
    if (!hashed.ok) return;
    const core = clone(manifestCore());
    Reflect.set(core, "scientificIdentity", {
      contractVersion: SCIENTIFIC_IDENTITY_VERSION,
      ...hashed.value,
      experimentId: `irexp_v1_${hashed.value.digest}`,
    });
    expect(deriveReproducibilityManifest(core, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);

    const executionCore = clone(manifestCore());
    const incompleteExecution = {
      scientificExperimentId: executionCore.scientificIdentity.experimentId,
      scientificExperimentDigest: executionCore.scientificIdentity.digest,
      sourceRevision,
      environment,
    };
    const executionHash = hashCanonicalResearchMaterial(
      EXECUTION_IDENTITY_DOMAIN,
      incompleteExecution,
    );
    expect(executionHash.ok).toBe(true);
    if (!executionHash.ok) return;
    Reflect.set(executionCore, "executionIdentity", {
      contractVersion: REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
      ...executionHash.value,
      executionId: `irexec_v1_${executionHash.value.digest}`,
    });
    expect(deriveReproducibilityManifest(executionCore, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);
  });

  it("validates metadata descriptors before reading values", () => {
    let invoked = 0;
    const metadata = {
      get createdAt() {
        invoked += 1;
        return AT;
      },
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    };
    expect(() => deriveReproducibilityManifest(manifestCore(), metadata))
      .not.toThrow();
    expect(deriveReproducibilityManifest(manifestCore(), metadata).ok)
      .toBe(false);
    expect(invoked).toBe(0);
    for (const invalid of [
      Object.assign({
        createdAt: AT,
        createdByProcess: { id: "orchestrator", version: "v1" },
        warnings: [],
      }, { unexpected: true }),
      Object.defineProperty({
        createdAt: AT,
        createdByProcess: { id: "orchestrator", version: "v1" },
        warnings: [],
      }, "hidden", { value: true, enumerable: false }),
      Object.assign({
        createdAt: AT,
        createdByProcess: { id: "orchestrator", version: "v1" },
        warnings: [],
      }, { [Symbol("unexpected")]: true }),
      Object.defineProperty({
        createdAt: AT,
        createdByProcess: { id: "orchestrator", version: "v1" },
        warnings: [],
      }, "unexpected", { set() {}, enumerable: true }),
    ]) {
      expect(deriveReproducibilityManifest(manifestCore(), invalid).ok)
        .toBe(false);
    }
  });

  it("normalizes concrete artifact order and rejects cross-linked artifacts", () => {
    const core = manifestCore();
    const collidingArtifact = {
      ...artifact,
      artifactId: "artifact-logical-collision",
      contentHash: B,
    };
    const collidingIdentity = deriveResearchArtifactIdentity({
      contractVersion: ARTIFACT_IDENTITY_VERSION,
      scientificIdentity: core.scientificIdentity,
      executionIdentity: core.executionIdentity,
      executionMaterial: executionMaterial(),
      artifact: collidingArtifact,
    });
    expect(collidingIdentity.ok).toBe(true);
    if (!collidingIdentity.ok) return;
    expect(deriveReproducibilityManifest({
      ...core,
      artifacts: [
        core.artifacts[0],
        {
          identity: collidingIdentity.value,
          scientificExperimentId: core.scientificIdentity.experimentId,
          reproducibleExecutionId: core.executionIdentity.executionId,
          contentHash: collidingArtifact.contentHash,
          kind: collidingArtifact.kind,
          mediaType: collidingArtifact.mediaType,
          schemaVersion: collidingArtifact.schemaVersion,
          logicalRole: collidingArtifact.logicalRole,
        },
      ],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);

    expect(deriveReproducibilityManifest({
      ...core,
      artifactExpectations: [{
        ...core.artifactExpectations[0],
        required: false,
      }],
      artifacts: [],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(true);

    const secondArtifact = {
      ...artifact,
      artifactId: "artifact-logical-b",
      contentHash: B,
      logicalRole: "secondary-result",
    };
    const secondIdentity = deriveResearchArtifactIdentity({
      contractVersion: ARTIFACT_IDENTITY_VERSION,
      scientificIdentity: core.scientificIdentity,
      executionIdentity: core.executionIdentity,
      executionMaterial: executionMaterial(),
      artifact: secondArtifact,
    });
    expect(secondIdentity.ok).toBe(true);
    if (!secondIdentity.ok) return;
    const second = {
      identity: secondIdentity.value,
      scientificExperimentId: core.scientificIdentity.experimentId,
      reproducibleExecutionId: core.executionIdentity.executionId,
      contentHash: secondArtifact.contentHash,
      kind: secondArtifact.kind,
      mediaType: secondArtifact.mediaType,
      schemaVersion: secondArtifact.schemaVersion,
      logicalRole: secondArtifact.logicalRole,
    };
    expect(deriveReproducibilityManifest({
      ...core,
      artifacts: [core.artifacts[0], second],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);
    const firstOrder = deriveReproducibilityManifest({
      ...core,
      artifactExpectations: [
        ...core.artifactExpectations,
        {
          kind: second.kind,
          logicalRole: second.logicalRole,
          mediaType: second.mediaType,
          schemaVersion: second.schemaVersion,
          required: true,
        },
      ],
      artifacts: [core.artifacts[0], second],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    });
    const reverseOrder = deriveReproducibilityManifest({
      ...core,
      artifactExpectations: [
        ...core.artifactExpectations,
        {
          kind: second.kind,
          logicalRole: second.logicalRole,
          mediaType: second.mediaType,
          schemaVersion: second.schemaVersion,
          required: true,
        },
      ],
      artifacts: [second, core.artifacts[0]],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    });
    expect(firstOrder.ok && reverseOrder.ok).toBe(true);
    if (firstOrder.ok && reverseOrder.ok) {
      expect(firstOrder.value.manifestId).toBe(reverseOrder.value.manifestId);
      const base = deriveReproducibilityManifest(core, {
        createdAt: AT,
        createdByProcess: { id: "orchestrator", version: "v1" },
        warnings: [],
      });
      expect(base.ok).toBe(true);
      if (base.ok) {
        expect(firstOrder.value.manifestId).not.toBe(base.value.manifestId);
      }
    }
    expect(deriveReproducibilityManifest({
      ...core,
      artifacts: [{
        ...core.artifacts[0],
        scientificExperimentId: `irexp_v1_${B}`,
      }],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);
    expect(deriveReproducibilityManifest({
      ...core,
      artifactExpectations: [
        core.artifactExpectations[0],
        core.artifactExpectations[0],
      ],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);
    expect(deriveReproducibilityManifest({
      ...core,
      artifacts: [core.artifacts[0], core.artifacts[0]],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);
    expect(deriveReproducibilityManifest({
      ...core,
      artifacts: [],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);
  });

  it("requires structural proof linking execution and experiment for artifacts", () => {
    const linkedScientific = scientific();
    const linkedExecutionMaterial = executionMaterial();
    const linkedExecution = execution(linkedExecutionMaterial);
    const valid = {
      contractVersion: ARTIFACT_IDENTITY_VERSION,
      scientificIdentity: linkedScientific,
      executionIdentity: linkedExecution,
      executionMaterial: linkedExecutionMaterial,
      artifact,
    };
    expect(deriveResearchArtifactIdentity(valid).ok).toBe(true);

    const otherScientificMaterial = clone(identityMaterial);
    Reflect.set(otherScientificMaterial.scientificScope, "portfolioId", "portfolio-b");
    const otherScientific = scientific(otherScientificMaterial);
    expect(deriveResearchArtifactIdentity({
      ...valid,
      scientificIdentity: otherScientific,
    }).ok).toBe(false);

    expect(deriveResearchArtifactIdentity({
      ...valid,
      executionIdentity: {
        ...linkedExecution,
        executionId: `irexec_v1_${B}`,
      },
    }).ok).toBe(false);

    expect(deriveResearchArtifactIdentity({
      contractVersion: ARTIFACT_IDENTITY_VERSION,
      scientificIdentity: { experimentId: `irexp_v1_${A}` },
      executionIdentity: { executionId: `irexec_v1_${B}` },
      executionMaterial: {},
      artifact,
    }).ok).toBe(false);
  });

  it("validates the artifact canonical projection as an exact closed schema", () => {
    const core = manifestCore();
    const projection = JSON.parse(
      core.artifacts[0].identity.canonicalMaterial,
    ) as Record<string, unknown>;
    expect(validateArtifactIdentityProjection(projection).ok).toBe(true);
    expect(validateArtifactIdentityProjection({
      ...projection,
      unexpected: "rejected",
    }).ok).toBe(false);
    const missing = { ...projection };
    delete missing.logicalRole;
    expect(validateArtifactIdentityProjection(missing).ok).toBe(false);
    expect(validateArtifactIdentityProjection({
      ...projection,
      [Symbol("unexpected")]: true,
    }).ok).toBe(false);
    let invoked = 0;
    const accessor = { ...projection };
    Object.defineProperty(accessor, "logicalRole", {
      enumerable: true,
      get() {
        invoked += 1;
        return "result";
      },
    });
    expect(validateArtifactIdentityProjection(accessor).ok).toBe(false);
    expect(invoked).toBe(0);

    const forgedHash = hashCanonicalResearchMaterial(
      ARTIFACT_IDENTITY_DOMAIN,
      { ...projection, unexpected: "rejected" },
    );
    expect(forgedHash.ok).toBe(true);
    if (!forgedHash.ok) return;
    const forgedIdentity = {
      contractVersion: ARTIFACT_IDENTITY_VERSION,
      ...forgedHash.value,
      artifactId: `irart_v1_${forgedHash.value.digest}`,
    };
    expect(deriveReproducibilityManifest({
      ...core,
      artifacts: [{
        ...core.artifacts[0],
        identity: forgedIdentity,
      }],
    }, {
      createdAt: AT,
      createdByProcess: { id: "orchestrator", version: "v1" },
      warnings: [],
    }).ok).toBe(false);
  });
});

import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatasetCatalogServiceV1 } from "@/lib/investing/research/dataset-catalog/composition.server";
import { ContentAddressedDatasetStorage } from "@/lib/investing/research/data-agent/storage.server";
import { canonicalizeResearchContract } from "@/lib/investing/research/contracts/runtimeValidation";
import { createDatasetQualityServiceV1 } from "@/lib/investing/research/dataset-quality/composition.server";
import { DATASET_QUALITY_POLICY_VERSION } from "@/lib/investing/research/dataset-quality";
import type { QualityGateId } from "@/lib/investing/research/dataset-quality/types";
import {
  ACQUISITION_POLICY_VERSION,
  ACQUISITION_REQUEST_VERSION,
  DATASET_REQUIREMENT_VERSION,
  DATASET_VERSION_MATERIAL_VERSION,
  NORMALIZATION_POLICY_VERSION,
} from "@/lib/investing/research/datasets";
import { createAcquisitionOrchestrationV1 } from
  "@/lib/investing/research/orchestration/composition.server";
import { ORCHESTRATION_RETRY_POLICY_VERSION } from
  "@/lib/investing/research/orchestration";
import {
  DATASET_REQUEST_VERSION,
  RESEARCH_HYPOTHESIS_VERSION,
  STRATEGY_CANDIDATE_VERSION,
  type ResearchHypothesis,
  type StrategyCandidate,
} from "@/lib/investing/research/contracts";
import { createHypothesisCandidateServiceV1 } from
  "@/lib/investing/research/hypotheses/composition.server";
import {
  deriveCandidateIdentity,
  deriveHypothesisIdentity,
} from "@/lib/investing/research/hypotheses/identity.server";
import { createBacktestApplicationServiceV1 } from
  "@/lib/investing/research/backtesting/composition.server";
import { PostgresScientificJobRepository } from
  "@/lib/investing/research/backtesting/postgresRepository.server";
import { OneShotBacktestWorker } from "@/lib/investing/research/backtesting/worker.server";
import { ContentAddressedBacktestArtifactStorage } from
  "@/lib/investing/research/backtesting/artifactStorage.server";
import { BACKTEST_INPUT_VERSION } from "@/lib/investing/research/backtesting";
import { deriveScientificExperimentIdentity } from
  "@/lib/investing/research/reproducibility/scientificIdentity.server";
import {
  DATASET_VERSION_REF_VERSION,
  EXPERIMENT_IDENTITY_MATERIAL_VERSION,
  RESEARCH_ARTIFACT_REF_VERSION,
  validateExperimentDefinition,
  validateExperimentResultEnvelope,
  validateScientificDecision,
  PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
} from "@/lib/investing/research/contracts";
import {
  EXECUTION_ENVIRONMENT_VERSION,
  ARTIFACT_IDENTITY_VERSION,
  REPRODUCIBILITY_MANIFEST_VERSION,
  REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
  SOURCE_REVISION_VERSION,
  type ReproducibleExecutionIdentityMaterial,
} from "@/lib/investing/research/reproducibility";
import {
  deriveReproducibleExecutionIdentity,
  validateReproducibleExecutionIdentityIntegrity,
} from
  "@/lib/investing/research/reproducibility/executionIdentity.server";
import { deriveResearchArtifactIdentity } from
  "@/lib/investing/research/reproducibility/artifacts.server";
import { deriveReproducibilityManifest } from
  "@/lib/investing/research/reproducibility/manifest.server";
import { validateScientificExperimentIdentityIntegrity } from
  "@/lib/investing/research/reproducibility/scientificIdentity.server";
import { PROMOTION_CANDIDATE_ENVELOPE_VERSION } from
  "@/lib/investing/research/architecture";
import { createScientificValidationServiceV1 } from
  "@/lib/investing/research/scientific-validation/composition.server";
import { PostgresContentAddressedDatasetBars } from
  "@/lib/investing/research/scientific-validation/datasetBars.server";
import {
  SCIENTIFIC_VALIDATION_PROFILE_VERSION,
  SCIENTIFIC_VALIDATION_REQUEST_VERSION,
} from "@/lib/investing/research/scientific-validation";
import { createPortfolioRiskServiceV1 } from
  "@/lib/investing/research/portfolio-risk/composition.server";
import {
  PORTFOLIO_RISK_PROFILE_VERSION,
  PORTFOLIO_RISK_REQUEST_VERSION,
} from "@/lib/investing/research/portfolio-risk";
import { createScientificMemoryServiceV1 } from
  "@/lib/investing/research/scientific-memory/composition.server";
import {
  SCIENTIFIC_MEMORY_PROFILE_VERSION,
  SCIENTIFIC_MEMORY_REQUEST_VERSION,
} from "@/lib/investing/research/scientific-memory";
import { createControlledPromotionServiceV1 } from
  "@/lib/investing/research/controlled-promotion/composition.server";
import {
  CONTROLLED_PROMOTION_PROFILE_VERSION,
  PROMOTION_ELIGIBILITY_REQUEST_VERSION,
} from "@/lib/investing/research/controlled-promotion";
import { createResearchOpsServiceV1 } from
  "@/lib/investing/research/ops/composition.server";
import { assertDestructiveInvestingQaDatabase } from "@/scripts/qa/investingDestructiveQaGuard";

const databaseUrl = process.env.INVESTING_6_INTEGRATED_TEST_DATABASE_URL;
const pgDescribe = databaseUrl ? describe : describe.skip;
const configured = databaseUrl ?? "postgresql://invalid/phase6_integrated_not_configured";
if (databaseUrl) {
  assertDestructiveInvestingQaDatabase(
    databaseUrl,
    process.env.ALLOW_DESTRUCTIVE_INVESTING_QA,
  );
}

const AT = "2026-01-01T00:00:00.000Z";
const END = "2026-02-01T00:00:00.000Z";
const scopes = {
  a: {
    tenantId: "11111111-1111-4111-8111-111111111111",
    ownerId: "55555555-5555-4555-8555-555555555555",
    portfolioId: "phase6-portfolio-a",
    accountId: "22222222-2222-4222-8222-222222222222",
  },
  b: {
    tenantId: "33333333-3333-4333-8333-333333333333",
    ownerId: "66666666-6666-4666-8666-666666666666",
    portfolioId: "phase6-portfolio-b",
    accountId: "44444444-4444-4444-8444-444444444444",
  },
} as const;

type ScopeKey = keyof typeof scopes;

function requirement(scopeKey: ScopeKey) {
  const scope = scopes[scopeKey];
  return {
    contractVersion: DATASET_REQUIREMENT_VERSION,
    scientificScope: scope,
    instrument: {
      symbol: scopeKey === "a" ? "IWDA" : "VWCE",
      assetClass: "fund",
      market: "XAMS",
      currency: "EUR",
    },
    dataKind: "price_bars",
    timeframe: "1day",
    range: { startInclusive: AT, endExclusive: END },
    timezonePolicy: {
      source: "Europe/Amsterdam",
      canonical: "UTC",
      calendar: "XAMS",
    },
    adjustmentPolicy: "all_adjusted",
    sessionPolicy: "regular",
    fields: ["timestamp", "open", "high", "low", "close", "volume"],
    normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION,
    scientificPurpose: "integrated phase 6 audit",
    requestedCoverage: { minimumRatio: 0.95 },
    provenanceRequirements: {
      providerRequestId: true,
      sourceTimezone: true,
    },
  } as const;
}

pgDescribe("Phase 6 integrated PostgreSQL vertical", () => {
  const pool = new pg.Pool({ connectionString: configured, max: 8 });
  let qaRoot = "";
  let datasetStorageRoot = "";
  let artifactStorageRoot = "";
  const requirements = new Map<ScopeKey, string>();
  const attempts = new Map<ScopeKey, string>();
  const sourceVersions = new Map<ScopeKey, string>();
  const researchReadyVersions = new Map<ScopeKey, string>();
  const readyCandidates = new Map<ScopeKey, string>();
  const readyCandidateValues = new Map<ScopeKey, StrategyCandidate>();
  const experiments = new Map<ScopeKey, Record<string, unknown>>();
  const completedResults = new Map<ScopeKey, Record<string, unknown>>();
  const executionMaterials =
    new Map<ScopeKey, ReproducibleExecutionIdentityMaterial>();
  const decisions = new Map<ScopeKey, Record<string, unknown>>();
  const riskAssessments = new Map<ScopeKey, Record<string, unknown>>();
  const memoryEvents = new Map<ScopeKey, Record<string, unknown>>();
  const promotionRequests = new Map<ScopeKey, string>();

  beforeAll(async () => {
    qaRoot = await mkdtemp(path.join(tmpdir(), "phase6-integrated-"));
    datasetStorageRoot = path.join(qaRoot, "datasets");
    artifactStorageRoot = path.join(qaRoot, "artifacts");
    for (const scope of Object.values(scopes)) {
      await pool.query(
        `insert into public.investing_tenants(id,owner_user_id)
         values ($1,$2)`,
        [scope.tenantId, scope.ownerId],
      );
      await pool.query(
        `insert into public.investing_tenant_memberships(
           tenant_id,user_id,permissions
         ) values ($1,$2,$3)`,
        [
          scope.tenantId,
          scope.ownerId,
          ["investing:read", "investing:create", "investing:verify", "investing:replay"],
        ],
      );
      await pool.query(
        `insert into public.investing_accounts(
           id,user_id,owner_user_id,tenant_id,portfolio_id
         ) values ($1,$2,$2,$3,$4)`,
        [scope.accountId, scope.ownerId, scope.tenantId, scope.portfolioId],
      );
    }
  });

  afterAll(async () => {
    await pool.end();
    if (qaRoot) await rm(qaRoot, { recursive: true, force: true });
  });

  function identityDependencies(scopeKey: ScopeKey) {
    const scope = scopes[scopeKey];
    return {
      session: {
        resolve: async () => ({
          authenticatedUserId: scope.ownerId,
          requestId: `phase6-integrated-${scopeKey}`,
        }),
      },
      directory: {
        findMemberships: async () => [{
          membershipId: `phase6-membership-${scopeKey}`,
          authenticatedUserId: scope.ownerId,
          ownerId: scope.ownerId,
          tenantId: scope.tenantId,
          role: "owner",
          permissions: [
            "investing:read" as const,
            "investing:create" as const,
            "investing:verify" as const,
            "investing:replay" as const,
          ] as const,
          status: "active" as const,
        }],
        findPortfolios: async () => [{
          portfolioId: scope.portfolioId,
          accountId: scope.accountId,
          ownerId: scope.ownerId,
          tenantId: scope.tenantId,
          status: "active" as const,
          investingEnabled: true,
        }],
      },
    };
  }

  function service(scopeKey: ScopeKey) {
    return createDatasetCatalogServiceV1({
      ...identityDependencies(scopeKey),
      database: pool,
      events: { emit: async () => undefined },
      clock: {
        now: () => ({ iso: AT, monotonicMs: 1 }),
      },
    });
  }

  function bars(scopeKey: ScopeKey) {
    const offset = scopeKey === "a" ? 0 : 20;
    return Array.from({ length: 30 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");
      const evenDay = (index + 1) % 2 === 0;
      const base = 100 + offset;
      const open = evenDay || index === 0 ? base : base + 10;
      const close = evenDay ? base + 10 : base;
      return {
        timestamp: `2026-01-${day}T00:00:00.000Z`,
        open, high: Math.max(open, close) + 0.5,
        low: Math.min(open, close) - 0.5, close,
        volume: 1_000_000 + index * 10_000,
      };
    });
  }

  it("creates isolated A/B requirements and converges equivalent requests", async () => {
    for (const scopeKey of ["a", "b"] as const) {
      const catalog = service(scopeKey);
      const created = await catalog.createRequirement(
        { fabricatedScope: scopes[scopeKey === "a" ? "b" : "a"] },
        requirement(scopeKey),
        { createdAt: AT, correlationId: `phase6-correlation-${scopeKey}` },
      );
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error("integrated_requirement_failed");
      requirements.set(scopeKey, created.value.requirementId);

      const replayed = await catalog.createRequirement(
        null,
        requirement(scopeKey),
        { createdAt: AT, correlationId: `phase6-correlation-${scopeKey}` },
      );
      expect(replayed).toEqual(created);

      const acquisition = {
        contractVersion: ACQUISITION_REQUEST_VERSION,
        requirementId: created.value.requirementId,
        scope: scopes[scopeKey],
        requirement: requirement(scopeKey),
        acquisitionPolicyVersion: ACQUISITION_POLICY_VERSION,
        providerPreference: "fixture",
        priority: "normal",
        idempotencyKey: `phase6-idempotency-${scopeKey}`,
        requestedAt: AT,
        requestedBy: scopes[scopeKey].ownerId,
        correlationId: `phase6-correlation-${scopeKey}`,
        state: "requested",
        attempt: { number: 1, priorAttemptId: null },
        outcome: null,
      } as const;
      const first = await catalog.requestAcquisition(null, acquisition);
      const second = await catalog.requestAcquisition(null, acquisition);
      expect(first.ok).toBe(true);
      expect(second).toEqual(first);
      if (!first.ok) throw new Error("integrated_acquisition_failed");
      attempts.set(scopeKey, first.value.acquisitionJobId);
    }

    const rows = await pool.query(
      `select tenant_id,owner_id,count(*)::integer as count
       from public.investing_research_dataset_requests
       group by tenant_id,owner_id order by owner_id`,
    );
    expect(rows.rows).toEqual([
      { tenant_id: scopes.a.tenantId, owner_id: scopes.a.ownerId, count: 1 },
      { tenant_id: scopes.b.tenantId, owner_id: scopes.b.ownerId, count: 1 },
    ]);
  });

  it("claims concurrently, fences stale workers, and publishes awaiting-quality A/B versions", async () => {
    const orchestration = createAcquisitionOrchestrationV1({ database: pool });
    const policy = {
      contractVersion: ORCHESTRATION_RETRY_POLICY_VERSION,
      maximumAttempts: 3,
      leaseSeconds: 60,
      heartbeatSeconds: 10,
      backoffSeconds: [1, 2],
      executionTimeoutSeconds: 30,
    } as const;

    for (const scopeKey of ["a", "b"] as const) {
      const scope = scopes[scopeKey];
      const acquisitionJobId = attempts.get(scopeKey);
      const requirementId = requirements.get(scopeKey);
      if (!acquisitionJobId || !requirementId) throw new Error("phase6_bootstrap_missing");

      const claims = await Promise.all([
        orchestration.repository.claim({
          scope,
          acquisitionJobId,
          leaseOwner: `worker-${scopeKey}-1`,
          leaseToken: `phase6-lease-${scopeKey}-worker-0001`,
          policy,
        }),
        orchestration.repository.claim({
          scope,
          acquisitionJobId,
          leaseOwner: `worker-${scopeKey}-2`,
          leaseToken: `phase6-lease-${scopeKey}-worker-0002`,
          policy,
        }),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const lease = claims.find(Boolean);
      if (!lease) throw new Error("phase6_claim_failed");

      const command = (value: typeof lease) => ({
        scope: value.scope,
        acquisitionJobId: value.acquisitionJobId,
        leaseToken: value.leaseToken,
        leaseOwner: value.leaseOwner,
        fencingToken: value.fencingToken,
        expectedStateVersion: value.stateVersion,
      });
      const stale = {
        ...command(lease),
        leaseToken: `${lease.leaseToken}-stale`,
      };
      await expect(orchestration.repository.finalize(stale, {
        nextState: "acquired_raw",
        outcome: null,
      })).resolves.toBeNull();

      const normalized = `${bars(scopeKey).map(value => JSON.stringify(value)).join("\n")}\n`;
      const hash = createHash("sha256").update(normalized).digest("hex");
      const stored = await new ContentAddressedDatasetStorage(datasetStorageRoot).publish({
        normalized, normalizedHash: hash, rawHash: hash, schemaVersion: "ohlcv/v1",
      });
      if (!stored.ok) throw new Error("phase6_dataset_storage_failed");
      const storage = stored.value;
      const outcome = {
        kind: "acquired",
        provider: "phase6-fixture",
        providerVersion: "v1",
        providerSymbol: requirement(scopeKey).instrument.symbol,
        providerRequestId: `provider-${scopeKey}`,
        sourceTimezone: "Europe/Amsterdam",
        rawHash: hash,
        normalizedHash: hash,
        recordCount: 30,
        observedCoverage: {
          observedStart: AT,
          observedEnd: "2026-01-30T00:00:00.000Z",
          firstTimestamp: AT,
          lastTimestamp: "2026-01-30T00:00:00.000Z",
        },
        storage,
      } as const;
      const raw = await orchestration.repository.finalize(command(lease), {
        nextState: "acquired_raw",
        outcome: null,
      });
      expect(raw?.stateVersion).toBeGreaterThan(lease.stateVersion);
      if (!raw) throw new Error("phase6_raw_transition_failed");
      const normalizedLease = await orchestration.repository.finalize(command(raw), {
        nextState: "normalized",
        outcome: null,
      });
      if (!normalizedLease) throw new Error("phase6_normalized_transition_failed");
      const awaiting = await orchestration.repository.finalize(command(normalizedLease), {
        nextState: "awaiting_quality",
        outcome,
      });
      if (!awaiting) throw new Error("phase6_awaiting_quality_transition_failed");

      const material = {
        contractVersion: DATASET_VERSION_MATERIAL_VERSION,
        requirementId,
        acquisitionJobId,
        acquisitionAttempt: awaiting.attempt,
        scope,
        provider: {
          id: outcome.provider,
          version: outcome.providerVersion,
          symbol: outcome.providerSymbol,
          requestId: outcome.providerRequestId,
        },
        storage,
        normalizationPolicyVersion: NORMALIZATION_POLICY_VERSION,
        coverage: {
          observedStart: AT,
          observedEnd: "2026-01-30T00:00:00.000Z",
          recordCount: 30,
          firstTimestamp: AT,
          lastTimestamp: "2026-01-30T00:00:00.000Z",
        },
        sourceTimezone: "Europe/Amsterdam",
        canonicalTimezone: "UTC",
        acquiredAt: AT,
        normalizedAt: AT,
        state: "awaiting_quality",
        supersedes: null,
      } as const;
      const published = await service(scopeKey).publishVersion(null, material);
      expect(published.ok).toBe(true);
      if (!published.ok) throw new Error("phase6_version_publication_failed");
      sourceVersions.set(scopeKey, published.value.datasetVersionId);
    }
  });

  it("publishes research-ready A/B versions with verified quality evidence", async () => {
    const evidence = (
      kind: QualityGateId,
      material: Record<string, string | number | boolean | null>,
    ) => {
      const canonical = canonicalizeResearchContract(material);
      if (!canonical.ok) throw new Error("phase6_evidence_invalid");
      const contentHash = createHash("sha256").update(
        `syntrake.investing.quality-evidence/v1\n${kind}\n${canonical.value}`,
      ).digest("hex");
      return {
        evidenceId: `irqev_v1_${contentHash}`,
        kind,
        contractVersion: "evidence/v1",
        contentHash,
        canonicalMaterial: canonical.value,
        state: "verified" as const,
        material,
      };
    };

    for (const scopeKey of ["a", "b"] as const) {
      const sourceDatasetVersionId = sourceVersions.get(scopeKey);
      if (!sourceDatasetVersionId) throw new Error("phase6_source_version_missing");
      const quality = createDatasetQualityServiceV1({
        session: {
          resolve: async () => ({
            authenticatedUserId: scopes[scopeKey].ownerId,
            requestId: `phase6-quality-${scopeKey}`,
          }),
        },
        directory: {
          findMemberships: async () => [{
            membershipId: `phase6-membership-${scopeKey}`,
            authenticatedUserId: scopes[scopeKey].ownerId,
            ownerId: scopes[scopeKey].ownerId,
            tenantId: scopes[scopeKey].tenantId,
            role: "owner",
            permissions: [
              "investing:read", "investing:create",
              "investing:verify", "investing:replay",
            ],
            status: "active",
          }],
          findPortfolios: async () => [{
            portfolioId: scopes[scopeKey].portfolioId,
            accountId: scopes[scopeKey].accountId,
            ownerId: scopes[scopeKey].ownerId,
            tenantId: scopes[scopeKey].tenantId,
            status: "active",
            investingEnabled: true,
          }],
        },
        database: pool,
        evidenceCollector: {
          async collect(input) {
            const hash = input.source.storage.normalizedContentHash;
            const key = input.source.storage.key;
            const last = input.source.coverage.lastTimestamp;
            return {
              ...input,
              evidence: [
                evidence("storage_integrity", {
                  normalizedContentHash: hash, rawContentHash: hash, storageKey: key,
                }),
                evidence("coverage", { coverageRatio: 1 }),
                evidence("calendar_session", {
                  calendar: "XAMS", sessionPolicy: "regular", verified: true,
                }),
                evidence("gaps", { gapCount: 0, calendar: "XAMS" }),
                evidence("duplicates", { duplicateCount: 0, conflictCount: 0 }),
                evidence("timezone", {
                  sourceTimezone: "Europe/Amsterdam", canonicalTimezone: "UTC",
                }),
                evidence("stale_data", { lastTimestamp: last }),
                evidence("ohlcv_outliers", {
                  invalidBarCount: 0, maximumObservedAbsoluteReturn: 0.2,
                }),
                evidence("adjustment_policy", {
                  adjustmentPolicy: "all_adjusted", verified: true,
                }),
                evidence("corporate_actions", {
                  verified: true, coveredThroughExclusive: END,
                }),
                evidence("look_ahead", { latestInformationAt: last }),
                evidence("provenance", {
                  complete: true, provider: "phase6-fixture",
                  providerSymbol: requirement(scopeKey).instrument.symbol,
                }),
              ],
            };
          },
        },
      });
      const result = await quality.evaluateAndPublish({
        requestedScope: { tenantId: "fabricated" },
        sourceDatasetVersionId,
        profile: {
          contractVersion: DATASET_QUALITY_POLICY_VERSION,
          asOfExclusive: END,
          maximumStalenessSeconds: 172800,
          maximumAbsoluteReturn: 0.5,
          universeMode: "single_instrument",
        },
        evaluatedAt: "2026-02-01T02:00:00.000Z",
        correlationId: `phase6-quality-${scopeKey}`,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("phase6_quality_failed");
      expect(result.value.datasetVersionId).toMatch(/^irdsv6f_v1_/u);
      if (result.value.datasetVersionId === null) {
        throw new Error("phase6_research_ready_missing");
      }
      researchReadyVersions.set(scopeKey, result.value.datasetVersionId);
    }
  });

  it("persists active hypotheses and ready candidates in isolated A/B scopes", async () => {
    for (const scopeKey of ["a", "b"] as const) {
      const datasetVersionId = researchReadyVersions.get(scopeKey);
      if (!datasetVersionId) throw new Error("phase6_research_ready_missing");
      const hypotheses = createHypothesisCandidateServiceV1({
        ...identityDependencies(scopeKey),
        database: pool,
        events: { emit: async () => undefined },
      });
      const initialHypothesis: ResearchHypothesis = {
        contractVersion: RESEARCH_HYPOTHESIS_VERSION,
        hypothesisId: "temporary-hypothesis",
        hypothesisVersion: "v1",
        state: "draft",
        statement: `Scope ${scopeKey} diversification reduces concentration risk.`,
        family: "strategic-allocation",
        rationale: "The relationship is falsifiable against a fixed benchmark.",
        universe: [requirement(scopeKey).instrument.symbol],
        horizon: "long-term",
        variables: [{ name: "equity_weight", value: 0.8 }],
        expectedBenchmark: { id: "benchmark-a", version: "v1" },
        falsificationCriteria: ["Does not exceed the benchmark."],
      };
      const hypothesisIdentity = deriveHypothesisIdentity(initialHypothesis);
      if (!hypothesisIdentity.ok) throw new Error("phase6_hypothesis_identity_failed");
      const hypothesis = {
        ...initialHypothesis,
        hypothesisId: hypothesisIdentity.value.id,
      };
      const created = await hypotheses.createHypothesis(null, hypothesis, AT);
      expect(created.ok).toBe(true);
      const activated = await hypotheses.transitionHypothesis(null, {
        hypothesisId: hypothesis.hypothesisId,
        expectedVersion: "v1",
        nextState: "active",
        createdAt: "2026-01-02T00:00:00.000Z",
      });
      expect(activated.ok).toBe(true);

      const initialCandidate: StrategyCandidate = {
        contractVersion: STRATEGY_CANDIDATE_VERSION,
        candidateId: "temporary-candidate",
        candidateVersion: "v1",
        hypothesisId: hypothesis.hypothesisId,
        hypothesisVersion: "v2",
        state: "draft",
        strategyContract: { id: "allocation-strategy", version: "v1" },
        parameters: [{ name: "equity_weight", value: 0.8 }],
        portfolioAssumptions: {
          baseCurrency: "EUR", initialCapital: 100000,
          allowLeverage: false, allowShorting: false,
          rebalanceFrequency: "monthly",
        },
        datasetRequirements: {
          contractVersion: DATASET_REQUEST_VERSION,
          requestId: datasetVersionId,
          instruments: [requirement(scopeKey).instrument.symbol],
          timeframe: "1d",
          range: { from: AT, to: END },
          dataKinds: ["price_bars"],
          quality: {
            minimumCoverageRatio: 0.95,
            maximumGapCount: 0,
            requireCorporateActionPolicy: true,
            timezone: "UTC",
          },
          scientificPurpose: "Evaluate the bounded hypothesis.",
        },
        intendedEvaluationRange: { from: AT, to: END },
        generation: {
          generatorId: "phase6-integrated",
          generatorVersion: "v1",
          generatedAt: AT,
          parentCandidateId: null,
        },
      };
      const candidateIdentity = deriveCandidateIdentity(initialCandidate);
      if (!candidateIdentity.ok) throw new Error("phase6_candidate_identity_failed");
      const candidate = {
        ...initialCandidate,
        candidateId: candidateIdentity.value.id,
      };
      const candidateCreated = await hypotheses.createCandidate(null, candidate, AT);
      expect(candidateCreated.ok).toBe(true);
      const candidateReady = await hypotheses.transitionCandidate(null, {
        candidateId: candidate.candidateId,
        expectedVersion: "v1",
        nextState: "ready",
        createdAt: "2026-01-03T00:00:00.000Z",
      });
      expect(candidateReady.ok).toBe(true);
      if (!candidateReady.ok) throw new Error("phase6_candidate_ready_failed");
      readyCandidates.set(scopeKey, candidate.candidateId);
      readyCandidateValues.set(scopeKey, candidateReady.value.value);
    }

    const rows = await pool.query(
      `select owner_id,count(*)::integer count
       from public.investing_research_candidates
       where state='ready' group by owner_id order by owner_id`,
    );
    expect(rows.rows).toEqual([
      { owner_id: scopes.a.ownerId, count: 1 },
      { owner_id: scopes.b.ownerId, count: 1 },
    ]);
  });

  it("runs reproducible backtests and persists completed A/B envelopes", async () => {
    for (const scopeKey of ["a", "b"] as const) {
      const scope = scopes[scopeKey];
      const candidate = readyCandidateValues.get(scopeKey);
      const datasetVersionId = researchReadyVersions.get(scopeKey);
      if (!candidate || !datasetVersionId) throw new Error("phase6_backtest_input_missing");
      const datasetRow = await pool.query(
        `select manifest_hash,content_hash,canonical_payload
         from public.investing_research_dataset_versions
         where tenant_id=$1 and owner_id=$2 and portfolio_id=$3 and account_id=$4
           and dataset_version_id=$5`,
        [scope.tenantId, scope.ownerId, scope.portfolioId, scope.accountId,
          datasetVersionId],
      );
      if (datasetRow.rows.length !== 1) throw new Error("phase6_dataset_ref_missing");
      const datasetMaterial = datasetRow.rows[0].canonical_payload as {
        storage: { schemaVersion: string };
      };
      const dataset = {
        contractVersion: DATASET_VERSION_REF_VERSION,
        datasetVersionId,
        datasetSchemaVersion: datasetMaterial.storage.schemaVersion,
        manifestHash: String(datasetRow.rows[0].manifest_hash),
        aggregateContentHash: String(datasetRow.rows[0].content_hash),
        coverage: {
          instruments: [requirement(scopeKey).instrument.symbol],
          timeframe: "1d",
          range: { from: AT, to: END },
          coverageRatio: 1,
          gapCount: 0,
        },
        quality: { status: "qualified" as const, warningCodes: [] },
        provenanceRef: { id: sourceVersions.get(scopeKey)!, version: "v1" },
        qualifiedAt: "2026-02-01T02:00:00.000Z",
      };
      const splits = [
        {
          name: "train", purpose: "training" as const,
          range: { from: AT, to: "2026-01-15T00:00:00.000Z" },
        },
        {
          name: "holdout", purpose: "holdout" as const,
          range: { from: "2026-01-15T00:00:00.000Z", to: END },
        },
      ];
      const portfolioConfiguration = candidate.portfolioAssumptions;
      const identityMaterial = {
        contractVersion: EXPERIMENT_IDENTITY_MATERIAL_VERSION,
        scientificScope: scope,
        candidateId: candidate.candidateId,
        candidateVersion: candidate.candidateVersion,
        hypothesisId: candidate.hypothesisId,
        hypothesisVersion: candidate.hypothesisVersion,
        strategyContract: candidate.strategyContract,
        canonicalParameters: candidate.parameters,
        datasetVersionId,
        datasetManifestHash: dataset.manifestHash,
        datasetContentHash: dataset.aggregateContentHash,
        engineContract: { id: "phase6-backtest", version: "v1" },
        validationProfile: { id: "phase6-validation", version: "v1" },
        portfolioConfiguration,
        costModel: { id: "zero-cost", version: "v1" },
        benchmark: { id: "buy-and-hold", version: "v1" },
        splits,
        randomSeed: null,
        configurationVersion: "v1",
      };
      const scientific = deriveScientificExperimentIdentity(identityMaterial);
      if (!scientific.ok) throw new Error("phase6_scientific_identity_failed");
      const experiment = {
        contractVersion: "investing-experiment-definition/v1",
        experimentId: scientific.value.experimentId,
        scope: {
          contractVersion: "investing-research-scope/v1",
          authenticatedUserId: scope.ownerId,
          membershipId: `phase6-membership-${scopeKey}`,
          ...scope,
        },
        candidate,
        dataset,
        evaluationRange: { from: AT, to: END },
        splits,
        portfolioConfiguration,
        costModel: identityMaterial.costModel,
        validationProfile: identityMaterial.validationProfile,
        benchmark: identityMaterial.benchmark,
        engineContract: identityMaterial.engineContract,
        randomSeed: null,
        configurationVersion: "v1",
        identityMaterial,
      };
      const executionMaterial = {
        contractVersion: REPRODUCIBLE_EXECUTION_IDENTITY_VERSION,
        scientificExperimentId: scientific.value.experimentId,
        scientificExperimentDigest: scientific.value.digest,
        sourceRevision: {
          contractVersion: SOURCE_REVISION_VERSION,
          repositoryId: "signalcore",
          vcsKind: "git" as const,
          commitHash: "3402338".padEnd(40, "0"),
          workingTreeState: "clean" as const,
          sourceContentHash: null,
        },
        environment: {
          contractVersion: EXECUTION_ENVIRONMENT_VERSION,
          dependencyLockHash: "d".repeat(64),
          engineBuildHash: "e".repeat(64),
          runtime: { id: "node", version: process.versions.node },
          platform: "win32" as const,
          architecture: "x64" as const,
          rng: { id: "none", version: "v1" },
          numericPolicy: { id: "ieee754", version: "v1" },
          calendarPolicy: { id: "utc", version: "v1" },
        },
        contractVersions: {
          experimentIdentityMaterial: EXPERIMENT_IDENTITY_MATERIAL_VERSION,
          datasetVersionRef: DATASET_VERSION_REF_VERSION,
          artifactRef: RESEARCH_ARTIFACT_REF_VERSION,
        },
      };
      const application = createBacktestApplicationServiceV1({
        ...identityDependencies(scopeKey), database: pool,
        emit: async () => undefined,
      });
      const created = await application.createOrReuse({
        experiment, executionMaterial,
        idempotencyKey: `phase6-backtest-${scopeKey}`,
        createdAt: "2026-02-02T00:00:00.000Z",
      });
      expect(created.ok).toBe(true);
      if (!created.ok || !("jobId" in created.value)) {
        throw new Error(`phase6_backtest_create_failed:${
          "reason" in created ? created.reason : "invalid_result"}`);
      }
      const worker = new OneShotBacktestWorker(
        new PostgresScientificJobRepository(pool),
        new ContentAddressedBacktestArtifactStorage(artifactStorageRoot),
      );
      const run = await worker.run({
        scope, jobId: created.value.jobId,
        leaseOwner: `phase6-backtest-worker-${scopeKey}`,
        leaseSeconds: 60, maximumAttempts: 1, executionTimeoutSeconds: 30,
        signal: new AbortController().signal, experiment,
        backtest: {
          contractVersion: BACKTEST_INPUT_VERSION,
          experimentId: created.value.experimentId,
          executionId: created.value.executionId,
          datasetVersionId, bars: bars(scopeKey),
          configuration: {
            initialCapital: 100_000, transactionCostBps: 0,
            slippageBps: 0, maximumPositionWeight: 1,
          },
        },
        strategy: {
          contractVersion: "phase6-alternating/v1",
          decide: context => Number(context.timestamp.slice(8, 10)) % 2 === 1 ? 1 : 0,
        },
      });
      expect(run).toEqual({ claimed: true, completed: true, retryScheduled: false });
      const persisted = await application.getRun(created.value.runId);
      expect(persisted.ok).toBe(true);
      if (!persisted.ok) throw new Error("phase6_backtest_run_missing");
      const row = persisted.value as Record<string, unknown>;
      const envelope = row.canonical_result as Record<string, unknown>;
      expect(row.state).toBe("completed");
      experiments.set(scopeKey, experiment);
      executionMaterials.set(scopeKey, executionMaterial);
      completedResults.set(scopeKey, envelope);
    }
  });

  it("validates scientific evidence and persists passed A/B risk assessments", async () => {
    for (const scopeKey of ["a", "b"] as const) {
      const experiment = experiments.get(scopeKey);
      const result = completedResults.get(scopeKey);
      if (!experiment || !result) throw new Error("phase6_validation_input_missing");
      const parsedExperiment = validateExperimentDefinition(experiment);
      const parsedResult = validateExperimentResultEnvelope(result);
      if (!parsedExperiment.ok || !parsedResult.ok) {
        throw new Error(`phase6_validation_contract_failed:${
          JSON.stringify({
            experiment: "issues" in parsedExperiment ? parsedExperiment.issues : "ok",
            result: "issues" in parsedResult ? parsedResult.issues : "ok",
          })}`);
      }
      const validationProfile = {
        contractVersion: SCIENTIFIC_VALIDATION_PROFILE_VERSION,
        profileId: "phase6-validation",
        profileVersion: "v1",
        minimumObservationsPerWindow: 2,
        minimumOutOfSampleWindows: 1,
        minimumPositiveWindowRatio: 0,
        maximumDrawdown: 1,
        maximumDegradation: 1,
        minimumRobustnessPassRatio: 0,
        costStressMultiplier: 1,
        benchmarkPolicy: "buy_and_hold_same_instrument" as const,
        significance: {
          method: "bonferroni" as const,
          baseTest: "one_sided_normal_approximation" as const,
          alpha: 0.99,
          familySize: 1,
        },
        requireTrainingSplit: true,
        requireHoldoutSplit: true,
      };
      const experimentDataset = experiment.dataset;
      if (typeof experimentDataset !== "object" || experimentDataset === null) {
        throw new Error("phase6_experiment_dataset_missing");
      }
      try {
        await new PostgresContentAddressedDatasetBars(
          pool,
          datasetStorageRoot,
        ).load(
          scopes[scopeKey],
          experimentDataset as never,
        );
      } catch (error) {
        throw new Error(`phase6_dataset_load_failed:${
          error instanceof Error ? error.message : "unknown"}`);
      }
      const validation = createScientificValidationServiceV1({
        ...identityDependencies(scopeKey), database: pool,
        profiles: {
          load: async () => validationProfile,
        },
        artifactStorageRoot, datasetStorageRoot,
        emit: async () => undefined,
      });
      const validated = await validation.validate({
        contractVersion: SCIENTIFIC_VALIDATION_REQUEST_VERSION,
        experiment, result,
        evaluatedAt: "2026-02-03T00:00:00.000Z",
        evaluatedBy: { id: "phase6-validator", version: "v1" },
      });
      if (!validated.ok || !("decision" in validated.value)) {
        throw new Error(`phase6_validation_failed:${
          "reason" in validated ? validated.reason : "unknown"}`);
      }
      expect(validated.ok).toBe(true);
      expect(validated.value.decision.outcome).toBe("validated");
      decisions.set(scopeKey, validated.value.decision as unknown as Record<string, unknown>);

      const riskProfile = {
        contractVersion: PORTFOLIO_RISK_PROFILE_VERSION,
        profileId: "phase6-risk",
        profileVersion: "v1",
        maximumAllocationWeight: 1,
        maximumGrossExposure: 1,
        maximumDrawdown: 1,
        maximumTurnover: 1_000,
        maximumTransactionCostRate: 1,
        maximumParticipationRate: 1,
        maximumConcentrationHhi: 1,
        maximumAbsoluteCorrelation: 1,
        minimumAverageDailyDollarVolume: 1,
        minimumCapacityMultiple: 0,
        allocationPolicy: "equal_weight" as const,
        minimumCorrelationObservations: 2,
      };
      const risk = createPortfolioRiskServiceV1({
        ...identityDependencies(scopeKey), database: pool,
        profiles: { load: async () => riskProfile },
        artifactStorageRoot, datasetStorageRoot,
        emit: async () => undefined,
      });
      const assessed = await risk.assess({
        contractVersion: PORTFOLIO_RISK_REQUEST_VERSION,
        decisionIds: [validated.value.decision.decisionId],
        evaluatedAt: "2026-02-04T00:00:00.000Z",
        evaluatedBy: { id: "phase6-risk-engine", version: "v1" },
      });
      if (!assessed.ok || !("assessment" in assessed.value)) {
        throw new Error(`phase6_risk_failed:${
          "reason" in assessed ? assessed.reason : "unknown"}`);
      }
      expect(assessed.ok).toBe(true);
      expect(assessed.value.assessment.outcome).toBe("passed");
      riskAssessments.set(
        scopeKey,
        assessed.value.assessment as unknown as Record<string, unknown>,
      );
    }
  });

  it("records positive memory and prepares controlled A/B promotions", async () => {
    for (const scopeKey of ["a", "b"] as const) {
      const decision = decisions.get(scopeKey);
      const risk = riskAssessments.get(scopeKey);
      const candidate = readyCandidateValues.get(scopeKey);
      const experiment = experiments.get(scopeKey);
      const executionMaterial = executionMaterials.get(scopeKey);
      if (!decision || !risk || !candidate || !experiment || !executionMaterial) {
        throw new Error("phase6_promotion_input_missing");
      }
      const parsedDecision = validateScientificDecision(decision);
      const parsedExperiment = validateExperimentDefinition(experiment);
      if (!parsedDecision.ok || !parsedExperiment.ok
        || parsedDecision.value.outcome !== "validated") {
        throw new Error("phase6_promotion_contract_missing");
      }
      const memory = createScientificMemoryServiceV1({
        ...identityDependencies(scopeKey), database: pool,
        profiles: {
          load: async () => ({
            contractVersion: SCIENTIFIC_MEMORY_PROFILE_VERSION,
            profileId: "phase6-memory",
            profileVersion: "v1",
            maximumAttemptsPerFamily: 10,
            maximumRejectedPerFamily: 5,
            maximumInconclusivePerFamily: 5,
          }),
        },
        emit: async () => undefined,
      });
      const recorded = await memory.record({
        contractVersion: SCIENTIFIC_MEMORY_REQUEST_VERSION,
        decisionId: String(decision.decisionId),
        recordedAt: "2026-02-05T00:00:00.000Z",
        recordedBy: { id: "phase6-memory", version: "v1" },
      });
      if (!recorded.ok || !("event" in recorded.value)) {
        throw new Error(`phase6_memory_failed:${
          "reason" in recorded ? recorded.reason : "invalid_result"}`);
      }
      expect(recorded.value.event.knowledge).toBe("positive");
      memoryEvents.set(
        scopeKey,
        recorded.value.event as unknown as Record<string, unknown>,
      );

      const promotion = createControlledPromotionServiceV1({
        ...identityDependencies(scopeKey), database: pool,
        profiles: {
          load: async () => ({
            contractVersion: CONTROLLED_PROMOTION_PROFILE_VERSION,
            profileId: "phase6-promotion",
            profileVersion: "v1",
          }),
        },
        emit: async () => undefined,
      });
      const eligible = await promotion.evaluate({
        contractVersion: PROMOTION_ELIGIBILITY_REQUEST_VERSION,
        decisionId: String(decision.decisionId),
        riskAssessmentId: String(risk.assessmentId),
        memoryEventId: recorded.value.event.eventId,
        evaluatedAt: "2026-02-06T00:00:00.000Z",
        evaluatedBy: { id: "phase6-promotion-boundary", version: "v1" },
      });
      if (!eligible.ok || !("value" in eligible.value)
        || !("eligibility" in eligible.value.value)) {
        throw new Error(`phase6_eligibility_failed:${
          "reason" in eligible ? eligible.reason : "invalid_result"}`);
      }
      expect(eligible.value.value.eligibility.state).toBe("promotion_eligible");
      const scientific = deriveScientificExperimentIdentity(
        parsedExperiment.value.identityMaterial,
      );
      const execution = deriveReproducibleExecutionIdentity(executionMaterial);
      const artifact = parsedDecision.value.validationReport.result.artifacts[0];
      if (!scientific.ok || !execution.ok || !artifact) {
        throw new Error("phase6_promotion_identity_missing");
      }
      const scientificIntegrity =
        validateScientificExperimentIdentityIntegrity(scientific.value);
      const executionIntegrity =
        validateReproducibleExecutionIdentityIntegrity(execution.value);
      if (!scientificIntegrity.ok || !executionIntegrity.ok) {
        throw new Error(`phase6_identity_integrity_failed:${
          JSON.stringify({
            scientific: "issues" in scientificIntegrity
              ? scientificIntegrity.issues : "ok",
            execution: "issues" in executionIntegrity
              ? executionIntegrity.issues : "ok",
          })}`);
      }
      const artifactIdentity = deriveResearchArtifactIdentity({
        contractVersion: ARTIFACT_IDENTITY_VERSION,
        scientificIdentity: scientific.value,
        executionIdentity: execution.value,
        executionMaterial,
        artifact,
      });
      if (!artifactIdentity.ok) throw new Error("phase6_artifact_identity_failed");
      const manifest = deriveReproducibilityManifest({
        contractVersion: REPRODUCIBILITY_MANIFEST_VERSION,
        scientificIdentity: scientific.value,
        executionIdentity: execution.value,
        dataset: parsedExperiment.value.dataset,
        hypothesis: {
          id: candidate.hypothesisId,
          version: candidate.hypothesisVersion,
        },
        candidate: {
          id: candidate.candidateId,
          version: candidate.candidateVersion,
        },
        sourceRevision: executionMaterial.sourceRevision,
        environment: executionMaterial.environment,
        strategyContract: candidate.strategyContract,
        engineContract: parsedExperiment.value.engineContract,
        validationProfile: parsedExperiment.value.validationProfile,
        configurationVersion: parsedExperiment.value.configurationVersion,
        randomSeed: parsedExperiment.value.randomSeed,
        artifactExpectations: [{
          kind: artifact.kind,
          logicalRole: artifact.logicalRole,
          mediaType: artifact.mediaType,
          schemaVersion: artifact.schemaVersion,
          required: true,
        }],
        artifacts: [{
          identity: artifactIdentity.value,
          scientificExperimentId: scientific.value.experimentId,
          reproducibleExecutionId: execution.value.executionId,
          contentHash: artifact.contentHash,
          kind: artifact.kind,
          mediaType: artifact.mediaType,
          schemaVersion: artifact.schemaVersion,
          logicalRole: artifact.logicalRole,
        }],
      }, {
        createdAt: "2026-02-06T12:00:00.000Z",
        createdByProcess: { id: "phase6-orchestrator", version: "v1" },
        warnings: [],
      });
      if (!manifest.ok) throw new Error("phase6_manifest_failed");
      const prepared = await promotion.prepare({
        candidateEnvelope: {
          contractVersion: PROMOTION_CANDIDATE_ENVELOPE_VERSION,
          requestedTarget: "shadow",
          scope: parsedDecision.value.scope,
          scientificIdentity: scientific.value,
          executionIdentity: execution.value,
          executionMaterial,
          manifest: manifest.value,
          datasets: [{
            version: parsedExperiment.value.dataset,
            state: "research_ready",
          }],
          validationReport: parsedDecision.value.validationReport,
          scientificDecision: parsedDecision.value,
          promotionEligibility: eligible.value.value.eligibility,
          candidate: {
            id: candidate.candidateId,
            version: candidate.candidateVersion,
          },
          riskCapacityReferences: [{
            id: String(risk.assessmentId),
            version: String(risk.assessmentHash),
          }],
          strategy: candidate.strategyContract,
          portfolioConfiguration: candidate.portfolioAssumptions,
          costModel: parsedExperiment.value.costModel,
          benchmark: parsedExperiment.value.benchmark,
          correlationId: `phase6-promotion-${scopeKey}`,
          idempotencyKey: `phase6-promotion-${scopeKey}`,
          contractVersions: {
            scientificContracts: PROMOTION_ELIGIBILITY_ENVELOPE_VERSION,
            reproducibility: REPRODUCIBILITY_MANIFEST_VERSION,
            promotionBoundary: PROMOTION_CANDIDATE_ENVELOPE_VERSION,
          },
        },
        riskAssessmentId: String(risk.assessmentId),
        memoryEventId: recorded.value.event.eventId,
        preparedAt: "2026-02-07T00:00:00.000Z",
        preparedBy: { id: "phase6-promotion-boundary", version: "v1" },
      });
      if (!prepared.ok || !("value" in prepared.value)
        || !("requestId" in prepared.value.value)) {
        throw new Error(`phase6_promotion_failed:${
          "reason" in prepared ? prepared.reason : "invalid_result"}`);
      }
      expect(prepared.value.value.state).toBe("promotion_prepared");
      promotionRequests.set(scopeKey, prepared.value.value.requestId);
    }
  });

  it("projects isolated read-only 6N operational snapshots", async () => {
    for (const scopeKey of ["a", "b"] as const) {
      const ops = createResearchOpsServiceV1({
        ...identityDependencies(scopeKey), database: pool,
        now: () => "2026-02-08T00:00:00.000Z",
      });
      const snapshot = await ops.load();
      if (!snapshot.ok) throw new Error(`phase6_ops_failed:${
        "reason" in snapshot ? snapshot.reason : "unknown"}`);
      expect(snapshot.ok).toBe(true);
      expect(snapshot.value.notices).toEqual([
        "read_only", "no_scientific_decision_writes", "no_ui_promotion",
      ]);
      expect(snapshot.value.counts).toEqual(expect.arrayContaining([
        expect.objectContaining({ category: "scientific_decisions", state: "validated" }),
        expect.objectContaining({ category: "promotions", state: "promotion_prepared" }),
      ]));
      expect(snapshot.value.recent.some(
        item => item.id === promotionRequests.get(scopeKey),
      )).toBe(true);
      expect(snapshot.value.recent.some(item =>
        item.id === promotionRequests.get(scopeKey === "a" ? "b" : "a"))).toBe(false);
    }
  });
});

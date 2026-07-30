import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatasetCatalogServiceV1 } from "@/lib/investing/research/dataset-catalog/composition.server";
import { canonicalizeResearchContract } from "@/lib/investing/research/contracts/runtimeValidation";
import { createDatasetQualityServiceV1 } from "@/lib/investing/research/dataset-quality/composition.server";
import { DATASET_QUALITY_POLICY_VERSION } from "@/lib/investing/research/dataset-quality";
import type { QualityGateId } from "@/lib/investing/research/dataset-quality/types";
import {
  ACQUISITION_POLICY_VERSION,
  ACQUISITION_REQUEST_VERSION,
  DATASET_REQUIREMENT_VERSION,
  DATASET_STORAGE_REFERENCE_VERSION,
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
    ownerId: "phase6-owner-a",
    portfolioId: "phase6-portfolio-a",
    accountId: "22222222-2222-4222-8222-222222222222",
  },
  b: {
    tenantId: "33333333-3333-4333-8333-333333333333",
    ownerId: "phase6-owner-b",
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
  const requirements = new Map<ScopeKey, string>();
  const attempts = new Map<ScopeKey, string>();
  const sourceVersions = new Map<ScopeKey, string>();
  const researchReadyVersions = new Map<ScopeKey, string>();
  const readyCandidates = new Map<ScopeKey, string>();

  beforeAll(async () => {
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
  });

  function service(scopeKey: ScopeKey) {
    const scope = scopes[scopeKey];
    return createDatasetCatalogServiceV1({
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
            "investing:read",
            "investing:create",
            "investing:verify",
            "investing:replay",
          ],
          status: "active",
        }],
        findPortfolios: async () => [{
          portfolioId: scope.portfolioId,
          accountId: scope.accountId,
          ownerId: scope.ownerId,
          tenantId: scope.tenantId,
          status: "active",
          investingEnabled: true,
        }],
      },
      database: pool,
      events: { emit: async () => undefined },
      clock: {
        now: () => ({ iso: AT, monotonicMs: 1 }),
      },
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

      const hash = scopeKey === "a" ? "a".repeat(64) : "b".repeat(64);
      const storage = {
        contractVersion: DATASET_STORAGE_REFERENCE_VERSION,
        key: `sha256/${hash.slice(0, 2)}/${hash}.ndjson`,
        rawContentHash: hash,
        normalizedContentHash: hash,
        mediaType: "application/x-ndjson",
        schemaVersion: "ohlcv/v1",
        byteSize: 42,
        integrityState: "verified",
      } as const;
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
      const normalized = await orchestration.repository.finalize(command(raw), {
        nextState: "normalized",
        outcome: null,
      });
      if (!normalized) throw new Error("phase6_normalized_transition_failed");
      const awaiting = await orchestration.repository.finalize(command(normalized), {
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
    const identityDependencies = (scopeKey: ScopeKey) => ({
      session: {
        resolve: async () => ({
          authenticatedUserId: scopes[scopeKey].ownerId,
          requestId: `phase6-hypothesis-${scopeKey}`,
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
            "investing:read" as const, "investing:create" as const,
            "investing:verify" as const, "investing:replay" as const,
          ],
          status: "active" as const,
        }],
        findPortfolios: async () => [{
          portfolioId: scopes[scopeKey].portfolioId,
          accountId: scopes[scopeKey].accountId,
          ownerId: scopes[scopeKey].ownerId,
          tenantId: scopes[scopeKey].tenantId,
          status: "active" as const,
          investingEnabled: true,
        }],
      },
    });

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
      readyCandidates.set(scopeKey, candidate.candidateId);
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
});

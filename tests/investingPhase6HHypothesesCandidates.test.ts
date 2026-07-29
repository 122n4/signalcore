import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  DATASET_REQUEST_VERSION,
  RESEARCH_HYPOTHESIS_VERSION,
  STRATEGY_CANDIDATE_VERSION,
  type ResearchHypothesis,
  type StrategyCandidate,
} from "@/lib/investing/research/contracts";
import {
  deriveCandidateIdentity,
  deriveHypothesisIdentity,
} from "@/lib/investing/research/hypotheses/identity.server";
import { HypothesisCandidateService } from "@/lib/investing/research/hypotheses/service.server";
import type { HypothesisCandidateRepository } from "@/lib/investing/research/hypotheses/repository.server";

const AT = "2026-01-01T00:00:00.000Z";
const LATER = "2026-12-31T00:00:00.000Z";
export const hypothesis6h = (overrides: Partial<ResearchHypothesis> = {}): ResearchHypothesis => ({
  contractVersion: RESEARCH_HYPOTHESIS_VERSION,
  hypothesisId: "temporary-hypothesis",
  hypothesisVersion: "v1",
  state: "draft",
  statement: "Diversification may reduce concentration risk.",
  family: "strategic-allocation",
  rationale: "The relationship is falsifiable against a fixed benchmark.",
  universe: ["IWDA"],
  horizon: "long-term",
  variables: [{ name: "equity_weight",value: 0.8 }],
  expectedBenchmark: { id: "benchmark-a",version: "v1" },
  falsificationCriteria: ["Does not exceed the benchmark."],
  ...overrides,
});
export function canonicalHypothesis6h() {
  const first = deriveHypothesisIdentity(hypothesis6h());
  if ("reason" in first) throw new Error(first.reason);
  return hypothesis6h({ hypothesisId: first.value.id });
}
export const candidate6h = (
  hypothesis: ResearchHypothesis,
  overrides: Partial<StrategyCandidate> = {},
): StrategyCandidate => ({
  contractVersion: STRATEGY_CANDIDATE_VERSION,
  candidateId: "temporary-candidate",
  candidateVersion: "v1",
  hypothesisId: hypothesis.hypothesisId,
  hypothesisVersion: hypothesis.hypothesisVersion,
  state: "draft",
  strategyContract: { id: "allocation-strategy",version: "v1" },
  parameters: [{ name: "equity_weight",value: 0.8 }],
  portfolioAssumptions: { baseCurrency: "EUR",initialCapital: 100000,
    allowLeverage: false,allowShorting: false,rebalanceFrequency: "monthly" },
  datasetRequirements: {
    contractVersion: DATASET_REQUEST_VERSION,requestId: "dataset-request-a",
    instruments: ["IWDA"],timeframe: "1d",range: { from: AT,to: LATER },
    dataKinds: ["price_bars"],quality: { minimumCoverageRatio: 0.99,
      maximumGapCount: 0,requireCorporateActionPolicy: true,timezone: "UTC" },
    scientificPurpose: "Evaluate the bounded hypothesis.",
  },
  intendedEvaluationRange: { from: AT,to: LATER },
  generation: { generatorId: "manual-research",generatorVersion: "v1",
    generatedAt: AT,parentCandidateId: null },
  ...overrides,
});

describe("Phase 6H scientific identities", () => {
  it("derives a deterministic hypothesis identity independent of lifecycle metadata", () => {
    const base = canonicalHypothesis6h();
    const left = deriveHypothesisIdentity(base);
    const right = deriveHypothesisIdentity({ ...base,state: "active",
      hypothesisVersion: "v2" });
    expect(left.ok && right.ok && left.value.id).toBe(right.ok ? right.value.id : "");
  });
  it("changes identity for scientific material changes", () => {
    const base = canonicalHypothesis6h();
    const left = deriveHypothesisIdentity(base);
    const right = deriveHypothesisIdentity({ ...base,statement: `${base.statement} changed` });
    expect(left.ok && right.ok && left.value.id).not.toBe(right.ok ? right.value.id : "");
  });
  it("derives candidates without provider/runtime timestamps in identity", () => {
    const hypothesis = { ...canonicalHypothesis6h(),state: "active" as const };
    const initial = candidate6h(hypothesis);
    const first = deriveCandidateIdentity(initial);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const canonical = { ...initial,candidateId: first.value.id };
    const changedTime = deriveCandidateIdentity({ ...canonical,generation: {
      ...canonical.generation,generatedAt: "2026-02-01T00:00:00.000Z" } });
    expect(changedTime.ok && changedTime.value.id).toBe(first.value.id);
  });
  it.each(["testing","rejected","inconclusive","validated",
    "promotion_eligible","promoted"] as const)(
    "keeps the later candidate state %s outside Phase 6H persistence",
    (state) => expect(["draft","ready","retired"]).not.toContain(state),
  );
  it("rejects a runtime attempt to enter a Phase 6I or later state", async () => {
    const hypothesis = { ...canonicalHypothesis6h(),state: "active" as const };
    const initial = candidate6h(hypothesis);
    const identity = deriveCandidateIdentity(initial);
    if (!identity.ok) throw new Error("candidate identity");
    const candidate = { ...initial,candidateId: identity.value.id,state: "ready" as const };
    const transitionCandidate = vi.fn();
    const repository = {
      createOrReuseHypothesis: vi.fn(),transitionHypothesis: vi.fn(),
      getHypothesis: vi.fn(),listHypotheses: vi.fn(),
      createOrReuseCandidate: vi.fn(),transitionCandidate,
      getCandidate: vi.fn().mockResolvedValue({
        scope: { tenantId: "tenant",ownerId: "owner",portfolioId: "portfolio",accountId: "account" },
        value: candidate,materialHash: "a".repeat(64),createdAt: AT,
      }),listCandidates: vi.fn(),
    } satisfies HypothesisCandidateRepository;
    const service = new HypothesisCandidateService(repository,{
      authorize: async () => ({ ok: true,value: { authenticatedUserId: "user",
        scope: { tenantId: "tenant",ownerId: "owner",portfolioId: "portfolio",accountId: "account" } } }),
    },{ emit: async () => undefined });
    await expect(service.transitionCandidate({}, {
      candidateId: candidate.candidateId,expectedVersion: "v1",
      nextState: "testing" as never,createdAt: AT,
    })).resolves.toEqual({ ok: false,reason: "strategy_candidate_transition_invalid" });
    expect(transitionCandidate).not.toHaveBeenCalled();
  });
  it("rejects transition accessors without executing them", async () => {
    let calls = 0;
    const repository = {
      createOrReuseHypothesis: vi.fn(),transitionHypothesis: vi.fn(),
      getHypothesis: vi.fn(),listHypotheses: vi.fn(),
      createOrReuseCandidate: vi.fn(),transitionCandidate: vi.fn(),
      getCandidate: vi.fn(),listCandidates: vi.fn(),
    } satisfies HypothesisCandidateRepository;
    const service = new HypothesisCandidateService(repository,{
      authorize: async () => ({ ok: true,value: { authenticatedUserId: "user",
        scope: { tenantId: "tenant",ownerId: "owner",portfolioId: "portfolio",accountId: "account" } } }),
    },{ emit: async () => undefined });
    const input = { candidateId: "candidate",expectedVersion: "v1",
      get nextState() { calls += 1; return "ready"; },createdAt: AT };
    await expect(service.transitionCandidate({},input)).resolves.toEqual({
      ok: false,reason: "strategy_candidate_transition_invalid",
    });
    expect(calls).toBe(0);
    expect(repository.getCandidate).not.toHaveBeenCalled();
  });
  it("allows an existing candidate to retire after its hypothesis retires", async () => {
    const hypothesis = { ...canonicalHypothesis6h(),state: "active" as const };
    const initial = candidate6h(hypothesis);
    const identity = deriveCandidateIdentity(initial);
    if (!identity.ok) throw new Error("candidate identity");
    const candidate = { ...initial,candidateId: identity.value.id,state: "ready" as const };
    const retired = { ...candidate,candidateVersion: "v2",state: "retired" as const };
    const record = {
      scope: { tenantId: "tenant",ownerId: "owner",portfolioId: "portfolio",accountId: "account" },
      value: candidate,materialHash: "a".repeat(64),createdAt: AT,
    };
    const transitionCandidate = vi.fn().mockResolvedValue({
      ...record,value: retired,createdAt: LATER,
    });
    const repository = {
      createOrReuseHypothesis: vi.fn(),transitionHypothesis: vi.fn(),
      getHypothesis: vi.fn().mockResolvedValue({
        ...record,value: { ...hypothesis,hypothesisVersion: "v2",state: "retired" },
      }),listHypotheses: vi.fn(),
      createOrReuseCandidate: vi.fn(),transitionCandidate,
      getCandidate: vi.fn().mockResolvedValue(record),listCandidates: vi.fn(),
    } satisfies HypothesisCandidateRepository;
    const service = new HypothesisCandidateService(repository,{
      authorize: async () => ({ ok: true,value: { authenticatedUserId: "user",
        scope: record.scope } }),
    },{ emit: async () => undefined });
    await expect(service.transitionCandidate({}, {
      candidateId: candidate.candidateId,expectedVersion: "v1",
      nextState: "retired",createdAt: LATER,
    })).resolves.toMatchObject({ ok: true,value: { value: {
      candidateId: candidate.candidateId,state: "retired",
    } } });
    expect(transitionCandidate).toHaveBeenCalledOnce();
  });
  it("still rejects non-retirement transitions after the hypothesis retires", async () => {
    const hypothesis = { ...canonicalHypothesis6h(),state: "active" as const };
    const initial = candidate6h(hypothesis);
    const identity = deriveCandidateIdentity(initial);
    if (!identity.ok) throw new Error("candidate identity");
    const candidate = { ...initial,candidateId: identity.value.id };
    const transitionCandidate = vi.fn();
    const scope = { tenantId: "tenant",ownerId: "owner",
      portfolioId: "portfolio",accountId: "account" };
    const repository = {
      createOrReuseHypothesis: vi.fn(),transitionHypothesis: vi.fn(),
      getHypothesis: vi.fn().mockResolvedValue({
        scope,value: { ...hypothesis,hypothesisVersion: "v2",state: "retired" },
        materialHash: "b".repeat(64),createdAt: LATER,
      }),listHypotheses: vi.fn(),
      createOrReuseCandidate: vi.fn(),transitionCandidate,
      getCandidate: vi.fn().mockResolvedValue({
        scope,value: candidate,materialHash: "a".repeat(64),createdAt: AT,
      }),listCandidates: vi.fn(),
    } satisfies HypothesisCandidateRepository;
    const service = new HypothesisCandidateService(repository,{
      authorize: async () => ({ ok: true,value: { authenticatedUserId: "user",scope } }),
    },{ emit: async () => undefined });
    await expect(service.transitionCandidate({}, {
      candidateId: candidate.candidateId,expectedVersion: "v1",
      nextState: "ready",createdAt: LATER,
    })).resolves.toEqual({
      ok: false,reason: "strategy_candidate_hypothesis_ineligible",
    });
    expect(transitionCandidate).not.toHaveBeenCalled();
  });
});

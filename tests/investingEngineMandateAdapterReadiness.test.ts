import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assessCanonicalInvestingEngineMandateAdapterReadinessV1,
  CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_REASON_CODES,
  hashCanonicalInvestingEngineMandateAdapterReadinessV1,
} from "@/lib/investing/authority/engineMandateAdapterReadiness";
import {
  CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES,
  composeCanonicalInvestingMandateAuthorityV1,
  hashCanonicalInvestingMandateAuthorityCompositionV1,
} from "@/lib/investing/authority/mandateAuthorityComposition";
import {
  sealCanonicalInvestingMandateIntentV1,
  type CanonicalInvestingMandateIntentInputV1,
} from "@/lib/investing/authority/mandateIntent";
import { assessCanonicalInvestingPolicyMethodologyV1 } from "@/lib/investing/authority/policyMethodology";
import { assessCanonicalPlanToMandateTranslationV1 } from "@/lib/investing/authority/planToMandateTranslation";
import { assessCanonicalInvestingRecommendationSuitabilityAuthorityV1 } from "@/lib/investing/authority/recommendationSuitabilityAuthority";
import { assessCanonicalInvestingSuitabilityEvidenceAuthorityV1 } from "@/lib/investing/authority/suitabilityEvidenceAuthority";
import { assessCanonicalInvestingSuitabilityReadinessV1 } from "@/lib/investing/authority/suitabilityReadiness";
import { INVESTING_ENGINE_INPUT_CONTRACT_VERSION } from "@/lib/investing/engine/v1/contracts";
import type { CanonicalInvestingPlan } from "@/lib/investing/server/plan";

const AUTHORED_AT = "2026-05-10T12:00:00.000Z";
const POLICY_ASSESSED_AT = "2026-05-10T13:00:00.000Z";
const READINESS_ASSESSED_AT = "2026-05-10T14:00:00.000Z";
const EVIDENCE_ASSESSED_AT = "2026-05-10T15:00:00.000Z";
const RECOMMENDATION_ASSESSED_AT = "2026-05-10T16:00:00.000Z";
const COMPOSITION_ASSESSED_AT = "2026-05-10T17:00:00.000Z";
const ADAPTER_ASSESSED_AT = "2026-05-10T18:00:00.000Z";

function canonicalPlan(overrides: Partial<CanonicalInvestingPlan> = {}): CanonicalInvestingPlan {
  return {
    id: "plan_123",
    mode: "investing",
    status: "active",
    version: 7,
    label: "Long-term plan",
    intent: "Invest over time",
    summary: "Free text is not mandate authority.",
    activatedAt: "2026-05-10T10:00:00.000Z",
    updatedAt: "2026-05-10T11:00:00.000Z",
    structured: {
      availability: "AVAILABLE",
      schemaVersion: 1,
      reason: null,
      objective: {
        type: "growth",
        targetAmount: { amount: 100000, currency: "EUR" },
        timeframeMonths: 120,
        monthlyContribution: { amount: 250, currency: "EUR" },
      },
      risk: { profile: "Balanced" },
    },
    ...overrides,
  };
}

function planAssessment(plan: CanonicalInvestingPlan = canonicalPlan(), currency = "EUR") {
  return assessCanonicalPlanToMandateTranslationV1({
    planState: { availability: "AVAILABLE", reason: null, value: plan },
    accountBaseCurrency: currency,
  });
}

function validMandateIntentInput(
  overrides: Partial<CanonicalInvestingMandateIntentInputV1> = {},
): CanonicalInvestingMandateIntentInputV1 {
  const assessment = overrides.planAssessment ?? planAssessment();
  return {
    tenant: {
      userId: "user_123",
      tenantId: "tenant_123",
      membershipId: "membership_123",
      role: "owner",
      permissions: ["investing:read"],
    },
    account: {
      id: "account_123",
      userId: "user_123",
      ownerUserId: "user_123",
      tenantId: "tenant_123",
      portfolioId: "portfolio_123",
      environment: "paper",
      status: "active",
      baseCurrency: assessment.account.baseCurrency ?? "EUR",
    },
    planAssessment: assessment,
    intent: {
      objective: "growth",
      riskProfile: "Balanced",
      horizon: "Medium",
    },
    authoredAt: AUTHORED_AT,
    ...overrides,
  };
}

function genuineIntent(overrides: Partial<CanonicalInvestingMandateIntentInputV1> = {}) {
  return sealCanonicalInvestingMandateIntentV1(validMandateIntentInput(overrides));
}

function genuineComposition(args: {
  plan?: CanonicalInvestingPlan;
  authoredAt?: string;
  compositionAssessedAt?: string;
  environment?: "paper" | "simulation";
} = {}) {
  const translation = planAssessment(args.plan);
  const intent = genuineIntent({
    planAssessment: translation,
    authoredAt: args.authoredAt ?? AUTHORED_AT,
    account: {
      ...validMandateIntentInput({ planAssessment: translation }).account,
      environment: args.environment ?? "paper",
    },
  });
  const policy = assessCanonicalInvestingPolicyMethodologyV1({
    intent,
    assessedAt: POLICY_ASSESSED_AT,
  });
  const readiness = assessCanonicalInvestingSuitabilityReadinessV1({
    intent,
    policyMethodologyAssessment: policy,
    assessedAt: READINESS_ASSESSED_AT,
  });
  const evidence = assessCanonicalInvestingSuitabilityEvidenceAuthorityV1({
    intent,
    policyMethodologyAssessment: policy,
    suitabilityReadiness: readiness,
    assessedAt: EVIDENCE_ASSESSED_AT,
  });
  const recommendation = assessCanonicalInvestingRecommendationSuitabilityAuthorityV1({
    intent,
    policyMethodologyAssessment: policy,
    suitabilityReadiness: readiness,
    suitabilityEvidenceAuthority: evidence,
    assessedAt: RECOMMENDATION_ASSESSED_AT,
  });

  return composeCanonicalInvestingMandateAuthorityV1({
    planTranslationAssessment: translation,
    intent,
    policyMethodologyAssessment: policy,
    suitabilityReadiness: readiness,
    suitabilityEvidenceAuthority: evidence,
    recommendationSuitabilityAuthority: recommendation,
    assessedAt: args.compositionAssessedAt ?? COMPOSITION_ASSESSED_AT,
  });
}

function assessFromComposition(composition = genuineComposition(), assessedAt = ADAPTER_ASSESSED_AT) {
  return assessCanonicalInvestingEngineMandateAdapterReadinessV1({
    mandateAuthorityComposition: composition,
    assessedAt,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function recomputeCompositionFingerprint(composition: any) {
  composition.compositionFingerprint = hashCanonicalInvestingMandateAuthorityCompositionV1(composition);
}

function rehashedCompositionForgery(mutate: (composition: any) => void) {
  const composition = clone(genuineComposition()) as any;
  mutate(composition);
  recomputeCompositionFingerprint(composition);
  expect(hashCanonicalInvestingMandateAuthorityCompositionV1(composition)).toBe(composition.compositionFingerprint);
  return composition;
}

function assertFrozenClosed(value: unknown, path = "$", seen = new WeakSet<object>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value), path).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    expect(typeof key, path).toBe("string");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    expect(descriptor, `${path}.${String(key)}`).toBeDefined();
    expect("value" in descriptor!, `${path}.${String(key)}`).toBe(true);
    if (Array.isArray(value) && key === "length") {
      expect(descriptor!.enumerable, `${path}.length`).toBe(false);
      continue;
    }
    expect(descriptor!.enumerable, `${path}.${String(key)}`).toBe(true);
    assertFrozenClosed(descriptor!.value, `${path}.${String(key)}`, seen);
  }
}

describe("canonical Investing engine mandate adapter readiness boundary", () => {
  it("emits a frozen fail-closed A3 artifact from genuine accepted A2.3C", () => {
    const composition = genuineComposition();
    const result = assessFromComposition(composition);

    expect(result.contractVersion).toBe("canonical-investing-engine-mandate-adapter-readiness/v1");
    expect(result.authority).toEqual(composition.authority);
    expect(result.lineage).toEqual({
      planId: composition.lineage.planId,
      planVersion: composition.lineage.planVersion,
      activatedAt: composition.lineage.activatedAt,
      updatedAt: composition.lineage.updatedAt,
      structuredSchemaVersion: composition.lineage.structuredSchemaVersion,
      planSemanticFingerprint: composition.lineage.planSemanticFingerprint,
      mandateAuthorityCompositionFingerprint: composition.compositionFingerprint,
    });
    expect(result.knownIntent).toEqual(composition.knownIntent);
    expect(result.engineTarget).toEqual({ inputContractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION });
    expect(result.upstreamAuthority).toEqual({
      availability: "UNAVAILABLE",
      authority: "NOT_ACCEPTED",
      mandate: null,
      reasonCodes: CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES,
    });
    expect(result.adapterReadiness).toEqual({
      availability: "UNAVAILABLE",
      authority: "NOT_ACCEPTED",
      adaptedMandate: null,
      canonicalInputEligible: false,
      runtimeActivationEligible: false,
      reasonCodes: CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_REASON_CODES,
    });
    expect(result.adapterFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCanonicalInvestingEngineMandateAdapterReadinessV1(result)).toBe(result.adapterFingerprint);
    assertFrozenClosed(result);
  });

  it("keeps exact reason ordering, frozen constants and deterministic fingerprints", () => {
    const first = assessFromComposition();
    const second = assessFromComposition();

    expect(CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_REASON_CODES).toEqual([
      "ENGINE_MANDATE_ADAPTER_AUTHORITY_NOT_ACCEPTED",
      "CANONICAL_MANDATE_AUTHORITY_UNAVAILABLE",
      "CANONICAL_MANDATE_AUTHORITY_NOT_ACCEPTED",
      "CANONICAL_MANDATE_NOT_COMPOSED",
      "ENGINE_MANDATE_ADAPTATION_NOT_PERFORMED",
      "RUNTIME_ACTIVATION_NOT_PERFORMED",
    ]);
    expect(Object.isFrozen(CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_REASON_CODES)).toBe(true);
    expect(() => {
      (CANONICAL_INVESTING_ENGINE_MANDATE_ADAPTER_READINESS_REASON_CODES as unknown as string[]).push("X");
    }).toThrow();
    expect(new Set(first.adapterReadiness.reasonCodes).size).toBe(first.adapterReadiness.reasonCodes.length);
    expect(first.upstreamAuthority.reasonCodes).toEqual(CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES);
    expect(first.adapterFingerprint).toBe(second.adapterFingerprint);
  });

  it("commits adapter fingerprints to every material A3 output family", () => {
    const result = assessFromComposition();
    const mutations: Array<[string, (draft: any) => void]> = [
      ["authority", (draft) => { draft.authority.membershipId = "membership_changed"; }],
      ["plan lineage", (draft) => { draft.lineage.planSemanticFingerprint = "b".repeat(64); }],
      ["composition fingerprint", (draft) => { draft.lineage.mandateAuthorityCompositionFingerprint = "c".repeat(64); }],
      ["known intent", (draft) => { draft.knownIntent.horizon = "Long"; }],
      [
        "adapter readiness semantics",
        (draft) => {
          draft.adapterReadiness.reasonCodes = [
            "ENGINE_MANDATE_ADAPTER_AUTHORITY_NOT_ACCEPTED",
            "CANONICAL_MANDATE_AUTHORITY_UNAVAILABLE",
          ];
        },
      ],
      ["assessedAt", (draft) => { draft.assessedAt = "2026-05-10T18:00:00.001Z"; }],
    ];

    for (const [label, mutate] of mutations) {
      const draft = clone(result) as any;
      delete draft.adapterFingerprint;
      mutate(draft);
      expect(hashCanonicalInvestingEngineMandateAdapterReadinessV1(draft), label)
        .not.toBe(result.adapterFingerprint);
    }
  });

  it("rejects invalid or fully rehashed A2.3C semantic forgeries", () => {
    const badFingerprint = clone(genuineComposition()) as any;
    badFingerprint.compositionFingerprint = "b".repeat(64);
    expect(() => assessFromComposition(badFingerprint)).toThrow(/composition_fingerprint_mismatch/);

    const cases: Array<[string, (composition: any) => void, RegExp]> = [
      [
        "mandate authority available",
        (composition) => { composition.mandateAuthority.availability = "AVAILABLE"; },
        /mandate_availability_invalid/,
      ],
      [
        "mandate authority accepted",
        (composition) => { composition.mandateAuthority.authority = "ACCEPTED"; },
        /mandate_authority_invalid/,
      ],
      [
        "mandate authority mandate",
        (composition) => {
          composition.mandateAuthority.mandate = {
            mandateSnapshotId: "mandate_1",
            objective: "growth",
            riskProfile: "Balanced",
            horizon: "Medium",
            baseCurrency: "EUR",
            constraints: [],
          };
        },
        /mandate_invalid/,
      ],
      [
        "translation mandate",
        (composition) => { composition.compositionBasis.planToMandateTranslation.mandate = { objective: "growth" }; },
        /translation_mandate_invalid/,
      ],
      [
        "policy accepted",
        (composition) => { composition.compositionBasis.policyMethodology.financialAuthority = "ACCEPTED"; },
        /policy_authority_invalid/,
      ],
      [
        "recommendation determination",
        (composition) => {
          composition.compositionBasis.recommendationSuitability.determination = { decision: "BUY" };
        },
        /recommendation_determination_invalid/,
      ],
    ];

    for (const [label, mutate, expected] of cases) {
      const forged = rehashedCompositionForgery(mutate);
      expect(() => assessFromComposition(forged), label).toThrow(expected);
    }
  });

  it("rejects rehashed wrong or duplicate upstream A2.3C reason codes", () => {
    const wrongOrder = rehashedCompositionForgery((composition) => {
      composition.mandateAuthority.reasonCodes = [
        CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES[1],
        CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES[0],
        ...CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES.slice(2),
      ];
    });
    expect(() => assessFromComposition(wrongOrder)).toThrow(/upstream_reason_codes_invalid/);

    const duplicate = rehashedCompositionForgery((composition) => {
      composition.mandateAuthority.reasonCodes = [
        CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES[0],
        CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES[0],
        ...CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES.slice(2),
      ];
    });
    expect(() => assessFromComposition(duplicate)).toThrow(/upstream_reason_codes_invalid/);
  });

  it("enforces retained A2.3C temporal lineage with equality allowed", () => {
    const activatedAfterUpdated = rehashedCompositionForgery((composition) => {
      composition.lineage.activatedAt = "2026-05-10T11:30:00.000Z";
      composition.lineage.updatedAt = "2026-05-10T11:00:00.000Z";
    });
    expect(() => assessFromComposition(activatedAfterUpdated)).toThrow(/temporal_lineage_invalid/);

    const updatedAfterComposition = rehashedCompositionForgery((composition) => {
      composition.lineage.updatedAt = "2026-05-10T17:00:00.001Z";
    });
    expect(() => assessFromComposition(updatedAfterComposition)).toThrow(/temporal_lineage_invalid/);

    expect(() => assessFromComposition(genuineComposition(), "2026-05-10T16:59:59.999Z"))
      .toThrow(/temporal_lineage_invalid/);

    const equalityAt = "2026-05-10T17:00:00.000Z";
    const equality = rehashedCompositionForgery((composition) => {
      composition.lineage.activatedAt = equalityAt;
      composition.lineage.updatedAt = equalityAt;
      composition.assessedAt = equalityAt;
    });
    expect(() => assessFromComposition(equality, equalityAt)).not.toThrow();
  });

  it("fails closed on object trust-boundary violations without invoking accessors", () => {
    expect(() => assessCanonicalInvestingEngineMandateAdapterReadinessV1({
      mandateAuthorityComposition: genuineComposition(),
      assessedAt: ADAPTER_ASSESSED_AT,
      futureDecisionNode: { decision: "BUY" },
    } as any)).toThrow(/input_closed_invalid/);

    const unknownNested = clone(genuineComposition()) as any;
    unknownNested.authority.futureDecisionNode = { decision: "BUY" };
    expect(() => assessFromComposition(unknownNested)).toThrow(/authority_closed_invalid/);

    const withSymbol = clone(genuineComposition()) as any;
    Object.defineProperty(withSymbol.authority, Symbol("decision"), {
      value: "BUY",
      enumerable: true,
    });
    expect(() => assessFromComposition(withSymbol)).toThrow(/authority_closed_invalid/);

    const withNonEnumerable = clone(genuineComposition()) as any;
    Object.defineProperty(withNonEnumerable.authority, "decision", {
      value: "BUY",
      enumerable: false,
    });
    expect(() => assessFromComposition(withNonEnumerable)).toThrow(/authority_closed_invalid/);

    const withAccessor = clone(genuineComposition()) as any;
    let getterCalls = 0;
    Object.defineProperty(withAccessor.mandateAuthority, "mandate", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return null;
      },
    });
    expect(() => assessFromComposition(withAccessor)).toThrow(/mandate_authority_closed_invalid/);
    expect(getterCalls).toBe(0);

    class CompositionLike {
      contractVersion = genuineComposition().contractVersion;
      authority = genuineComposition().authority;
      lineage = genuineComposition().lineage;
      knownIntent = genuineComposition().knownIntent;
      compositionBasis = genuineComposition().compositionBasis;
      mandateAuthority = genuineComposition().mandateAuthority;
      assessedAt = genuineComposition().assessedAt;
      compositionFingerprint = genuineComposition().compositionFingerprint;
    }
    expect(() => assessFromComposition(new CompositionLike() as any)).toThrow(/composition_closed_invalid/);
  });

  it("fails closed on array trust-boundary violations without invoking array methods or getters", () => {
    const baseReasons = [...CANONICAL_INVESTING_MANDATE_AUTHORITY_COMPOSITION_REASON_CODES];

    class CountingReasonArray extends Array<string> {
      invocations = 0;
      override map<U>(
        callbackfn: (value: string, index: number, array: string[]) => U,
        thisArg?: unknown,
      ): U[] {
        this.invocations += 1;
        return Array.prototype.map.call(this, callbackfn, thisArg) as U[];
      }
    }
    const subclass = new CountingReasonArray(...baseReasons);
    const subclassed = clone(genuineComposition()) as any;
    subclassed.mandateAuthority.reasonCodes = subclass;
    expect(() => assessFromComposition(subclassed)).toThrow(/upstream_reason_codes_invalid/);
    expect(subclass.invocations).toBe(0);

    const replacedPrototype = [...baseReasons];
    Object.setPrototypeOf(replacedPrototype, { map: () => { throw new Error("map_called"); } });
    const withReplacedPrototype = clone(genuineComposition()) as any;
    withReplacedPrototype.mandateAuthority.reasonCodes = replacedPrototype;
    expect(() => assessFromComposition(withReplacedPrototype)).toThrow(/upstream_reason_codes_invalid/);

    const prototypeGetter = [...baseReasons];
    let mapGetterCalls = 0;
    Object.setPrototypeOf(prototypeGetter, Object.create(Array.prototype, {
      map: {
        enumerable: false,
        get() {
          mapGetterCalls += 1;
          return () => baseReasons;
        },
      },
    }));
    const withPrototypeGetter = clone(genuineComposition()) as any;
    withPrototypeGetter.mandateAuthority.reasonCodes = prototypeGetter;
    expect(() => assessFromComposition(withPrototypeGetter)).toThrow(/upstream_reason_codes_invalid/);
    expect(mapGetterCalls).toBe(0);

    const sparse = [...baseReasons];
    delete sparse[1];
    const withSparse = clone(genuineComposition()) as any;
    withSparse.mandateAuthority.reasonCodes = sparse;
    expect(() => assessFromComposition(withSparse)).toThrow(/upstream_reason_codes_invalid/);

    const accessor = [...baseReasons];
    let indexGetterCalls = 0;
    Object.defineProperty(accessor, "1", {
      enumerable: true,
      get() {
        indexGetterCalls += 1;
        return baseReasons[1];
      },
    });
    const withAccessorIndex = clone(genuineComposition()) as any;
    withAccessorIndex.mandateAuthority.reasonCodes = accessor;
    expect(() => assessFromComposition(withAccessorIndex)).toThrow(/upstream_reason_codes_invalid/);
    expect(indexGetterCalls).toBe(0);

    const symbolExtra = [...baseReasons];
    Object.defineProperty(symbolExtra, Symbol("decision"), { value: "BUY", enumerable: true });
    const withSymbolExtra = clone(genuineComposition()) as any;
    withSymbolExtra.mandateAuthority.reasonCodes = symbolExtra;
    expect(() => assessFromComposition(withSymbolExtra)).toThrow(/upstream_reason_codes_invalid/);

    const nonEnumerableExtra = [...baseReasons];
    Object.defineProperty(nonEnumerableExtra, "futureDecision", { value: "BUY", enumerable: false });
    const withNonEnumerableExtra = clone(genuineComposition()) as any;
    withNonEnumerableExtra.mandateAuthority.reasonCodes = nonEnumerableExtra;
    expect(() => assessFromComposition(withNonEnumerableExtra)).toThrow(/upstream_reason_codes_invalid/);
  });

  it("does not construct mandates, engine input, constraints, runtime calls, or inferred authority", () => {
    const simulation = assessFromComposition(genuineComposition({ environment: "simulation" }));
    expect(simulation.authority.environment).toBe("simulation");
    expect(simulation.knownIntent).toEqual({ objective: "growth", riskProfile: "Balanced", horizon: "Medium" });
    expect(simulation.adapterReadiness.adaptedMandate).toBeNull();
    expect(simulation.adapterReadiness.canonicalInputEligible).toBe(false);
    expect(simulation.adapterReadiness.runtimeActivationEligible).toBe(false);
    expect(JSON.stringify(simulation)).not.toContain("mandateSnapshotId");
    expect(JSON.stringify(simulation)).not.toContain("constraints");

    const implementation = source("lib/investing/authority/engineMandateAdapterReadiness.ts");
    const implementationLower = implementation.toLowerCase();
    for (const forbidden of [
      "CanonicalMandateV1",
      "CanonicalInvestingInputV1",
      "InvestingMandateSnapshotSourceV1",
      "buildInvestingRuntimeSnapshot",
      "runtimeAdapter",
      "buildInvestingEngineV1CustomerBridge",
      "buildInvestingExecutionPlan",
      "buildCustomerDecisionProjection",
      "buildCanonicalInvestingInputFromSourcesV1",
      "CanonicalInvestingInputBuilderV1",
      "phase3c",
      "phase3d",
      "phase3e",
      "phase3f",
      "dailyCycle",
      "dashboard",
      "daily-bundle",
      "persistentPaper",
      "broker",
      "trading",
      "research",
      "supabase",
      "market quotes",
      "user_settings",
      "OfflineSetup",
      "Date.now",
      "new Date",
      "constraints",
      "targetAmount",
      "monthlyContribution",
      "timeframeMonths",
      "investing:read",
    ]) {
      expect(implementation).not.toContain(forbidden);
    }
    expect(implementationLower).not.toMatch(/\bcash\b/);
    expect(implementationLower).not.toMatch(/\bnav\b/);
    expect(implementationLower).not.toMatch(/\bholdings\b/);
  });
});

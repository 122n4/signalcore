import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION,
  CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES,
  assessCanonicalPlanToMandateTranslationV1,
  hashCanonicalPlanToMandateTranslationAssessmentV1,
  hashCanonicalPlanSemanticsForMandateTranslationV1,
  type CanonicalPlanToMandateTranslationReasonCodeV1,
} from "@/lib/investing/authority/planToMandateTranslation";
import type { CanonicalInvestingPlan, CanonicalInvestingPlanState } from "@/lib/investing/server/plan";

function canonicalPlan(overrides: Partial<CanonicalInvestingPlan> = {}): CanonicalInvestingPlan {
  return {
    id: "plan_123",
    mode: "investing",
    status: "active",
    version: 7,
    label: "Long-term plan",
    intent: "Invest over time",
    summary: "Free-text summary is not authoritative mandate input.",
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

function availablePlan(plan: CanonicalInvestingPlan = canonicalPlan()): CanonicalInvestingPlanState {
  return { availability: "AVAILABLE", reason: null, value: plan };
}

function assess(
  plan: CanonicalInvestingPlan = canonicalPlan(),
  args: { accountBaseCurrency?: string | null; expectedPlanSemanticFingerprint?: string | null } = {},
) {
  const accountBaseCurrency = Object.prototype.hasOwnProperty.call(args, "accountBaseCurrency")
    ? args.accountBaseCurrency
    : "EUR";
  return assessCanonicalPlanToMandateTranslationV1({
    planState: availablePlan(plan),
    accountBaseCurrency,
    expectedPlanSemanticFingerprint: args.expectedPlanSemanticFingerprint,
  });
}

function reasonCodes(plan: CanonicalInvestingPlan, accountBaseCurrency: string | null = "EUR") {
  return assess(plan, { accountBaseCurrency }).reasonCodes;
}

function expectReasons(
  actual: readonly CanonicalPlanToMandateTranslationReasonCodeV1[],
  expected: readonly CanonicalPlanToMandateTranslationReasonCodeV1[],
) {
  expect(actual).toEqual(expected);
  expect([...actual].sort()).not.toEqual(actual);
  expect(new Set(actual).size).toBe(actual.length);
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
    if (Array.isArray(value) && key === "length") continue;
    expect(descriptor!.enumerable, `${path}.${String(key)}`).toBe(true);
    assertFrozenClosed(descriptor!.value, `${path}.${String(key)}`, seen);
  }
}

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("canonical Plan to mandate translation boundary", () => {
  it("creates deterministic source Plan semantic and translation fingerprints", () => {
    const first = assess();
    const second = assess();

    expect(first.contractVersion).toBe(CANONICAL_PLAN_TO_MANDATE_TRANSLATION_CONTRACT_VERSION);
    expect(first.sourcePlan.semanticFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.translationFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.translationFingerprint).toBe(hashCanonicalPlanToMandateTranslationAssessmentV1(first));
    expect(second.sourcePlan.semanticFingerprint).toBe(first.sourcePlan.semanticFingerprint);
    expect(second.translationFingerprint).toBe(first.translationFingerprint);
    expect(first.availability).toBe("UNAVAILABLE");
    expect(first.mandate).toBeNull();
  });

  it("keeps object key ordering out of semantic fingerprints", () => {
    const ordered = canonicalPlan();
    const reordered = canonicalPlan({
      structured: {
        reason: null,
        schemaVersion: 1,
        guardrails: undefined,
        risk: { profile: "Balanced" },
        objective: {
          monthlyContribution: { currency: "EUR", amount: 250 },
          timeframeMonths: 120,
          targetAmount: { currency: "EUR", amount: 100000 },
          type: "growth",
        },
        availability: "AVAILABLE",
      },
    });

    expect(hashCanonicalPlanSemanticsForMandateTranslationV1(reordered)).toBe(
      hashCanonicalPlanSemanticsForMandateTranslationV1(ordered),
    );
  });

  it("recognizes only exact canonical objective literals as compatible semantics", () => {
    for (const objective of ["preservation", "growth", "income", "balanced"] as const) {
      const assessment = assess(canonicalPlan({ structured: { ...canonicalPlan().structured, objective: { type: objective } } }));

      expect(assessment.compatibleSemantics.objective).toBe(objective);
      expect(assessment.reasonCodes).not.toContain("OBJECTIVE_UNSUPPORTED");
      expect(assessment.availability).toBe("UNAVAILABLE");
      expect(assessment.mandate).toBeNull();
    }
  });

  it("rejects arbitrary, fuzzy and missing objectives without free-text inference", () => {
    for (const objective of [
      "retirement",
      "wealth",
      "build wealth",
      "aggressive growth",
      "passive income",
      "capital protection",
      "Growth with controlled risk",
      "Growth",
    ]) {
      const assessment = assess(canonicalPlan({ structured: { ...canonicalPlan().structured, objective: { type: objective } } }));

      expect(assessment.compatibleSemantics.objective).toBeNull();
      expect(assessment.reasonCodes).toContain("OBJECTIVE_UNSUPPORTED");
    }

    expect(reasonCodes(canonicalPlan({ structured: { ...canonicalPlan().structured, objective: undefined } }))).toContain(
      "OBJECTIVE_MISSING",
    );
  });

  it("maps only direct canonical risk profiles and rejects missing risk", () => {
    for (const riskProfile of ["Conservative", "Balanced", "Aggressive"] as const) {
      expect(
        assess(canonicalPlan({ structured: { ...canonicalPlan().structured, risk: { profile: riskProfile } } }))
          .compatibleSemantics.riskProfile,
      ).toBe(riskProfile);
    }

    const missing = assess(canonicalPlan({ structured: { ...canonicalPlan().structured, risk: undefined } }));
    expect(missing.compatibleSemantics.riskProfile).toBeNull();
    expect(missing.reasonCodes).toContain("RISK_PROFILE_MISSING");
  });

  it("never translates Plan v1 timeframeMonths into a mandate horizon", () => {
    for (const months of [1, 6, 12, 47, 48, 120, 360]) {
      const assessment = assess(
        canonicalPlan({
          structured: {
            ...canonicalPlan().structured,
            objective: { type: "growth", timeframeMonths: months },
          },
        }),
      );

      expect(assessment.compatibleSemantics.horizon).toBeNull();
      expect(assessment.reasonCodes).toContain("HORIZON_EXPLICIT_AUTHORING_REQUIRED");
      expect(JSON.stringify(assessment)).not.toContain("Short");
      expect(JSON.stringify(assessment)).not.toContain("Medium");
      expect(JSON.stringify(assessment)).not.toContain("Long");
    }
  });

  it("uses only authoritative account base currency and rejects missing or invalid account currency", () => {
    const plan = canonicalPlan({
      structured: {
        ...canonicalPlan().structured,
        objective: {
          type: "growth",
          targetAmount: { amount: 100000, currency: "EUR" },
          monthlyContribution: { amount: 250, currency: "GBP" },
        },
      },
    });

    const assessment = assess(plan, { accountBaseCurrency: "USD" });
    expect(assessment.account.baseCurrency).toBe("USD");
    expect(assessment.compatibleSemantics.baseCurrency).toBe("USD");
    expect(JSON.stringify(assessment)).not.toContain('"baseCurrency":"EUR"');
    expect(JSON.stringify(assessment)).not.toContain('"baseCurrency":"GBP"');

    for (const invalid of [null, "", "eur", "EURO"]) {
      const rejected = assess(plan, { accountBaseCurrency: invalid });
      expect(rejected.account.baseCurrency).toBeNull();
      expect(rejected.reasonCodes).toContain("BASE_CURRENCY_UNAVAILABLE");
    }
  });

  it("does not fabricate constraint evaluations from Plan guardrails", () => {
    const assessment = assess(
      canonicalPlan({
        structured: {
          ...canonicalPlan().structured,
          guardrails: { maxSinglePositionPct: 20, maxTop5Pct: 60 },
        },
      }),
    );
    const serialized = JSON.stringify(assessment);

    expect(assessment.compatibleSemantics.constraints).toBeNull();
    expect(assessment.mandate).toBeNull();
    expect(assessment.reasonCodes).toContain("GUARDRAIL_SEMANTICS_UNSUPPORTED");
    expect(assessment.reasonCodes).toContain("GUARDRAIL_ENGINE_SUPPORT_UNAVAILABLE");
    expect(serialized).not.toContain('"status":"pass"');
    expect(serialized).not.toContain('"observed":"0"');
    expect(serialized).not.toContain('"observed":0');
    expect(serialized).not.toContain('"kind":"hard"');
    expect(serialized).not.toContain('"kind":"soft"');
  });

  it("does not silently discard present unsupported guardrails", () => {
    expect(reasonCodes(canonicalPlan({
      structured: { ...canonicalPlan().structured, guardrails: { maxSinglePositionPct: 20 } },
    }))).toEqual(["HORIZON_EXPLICIT_AUTHORING_REQUIRED", "GUARDRAIL_SEMANTICS_UNSUPPORTED"]);

    expect(reasonCodes(canonicalPlan({
      structured: { ...canonicalPlan().structured, guardrails: { maxTop5Pct: 60 } },
    }))).toEqual([
      "HORIZON_EXPLICIT_AUTHORING_REQUIRED",
      "GUARDRAIL_SEMANTICS_UNSUPPORTED",
      "GUARDRAIL_ENGINE_SUPPORT_UNAVAILABLE",
    ]);
  });

  it("returns multiple unavailable reasons in deterministic closed order", () => {
    const assessment = assess(canonicalPlan({
      activatedAt: null,
      structured: {
        availability: "UNAVAILABLE",
        schemaVersion: null,
        reason: "structured_plan_missing",
      },
    }), { accountBaseCurrency: null });

    expectReasons(assessment.reasonCodes, [
      "PLAN_ACTIVATION_UNAVAILABLE",
      "STRUCTURED_PLAN_UNAVAILABLE",
      "STRUCTURED_SCHEMA_UNSUPPORTED",
      "OBJECTIVE_MISSING",
      "RISK_PROFILE_MISSING",
      "BASE_CURRENCY_UNAVAILABLE",
    ]);
    expect(CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES).toContain(
      "EXPECTED_PLAN_SEMANTIC_FINGERPRINT_INVALID",
    );
    expect(CANONICAL_PLAN_TO_MANDATE_TRANSLATION_REASON_CODES).toContain("PLAN_SOURCE_CHANGED");
  });

  it("reports missing and non-active Plan states without selecting alternate Plans", () => {
    const missing = assessCanonicalPlanToMandateTranslationV1({
      planState: { availability: "UNAVAILABLE", reason: "investing_plan_ambiguous", value: null },
      accountBaseCurrency: "EUR",
    });

    expect(missing.sourcePlan.semanticFingerprint).toBeNull();
    expect(missing.reasonCodes).toEqual(["PLAN_UNAVAILABLE"]);
    expect(missing.mandate).toBeNull();

    const nonActive = assess(canonicalPlan({ status: "draft" as any }));
    expect(nonActive.reasonCodes).toContain("PLAN_NOT_ACTIVE");
    expect(nonActive.mandate).toBeNull();
  });

  it("detects source Plan semantic changes with a caller-provided expected fingerprint", () => {
    const base = canonicalPlan();
    const expectedPlanSemanticFingerprint = hashCanonicalPlanSemanticsForMandateTranslationV1(base);
    const changed = canonicalPlan({ structured: { ...base.structured, objective: { type: "income" } } });

    expect(assess(base, { expectedPlanSemanticFingerprint }).reasonCodes).not.toContain("PLAN_SOURCE_CHANGED");
    expect(assess(changed, { expectedPlanSemanticFingerprint }).reasonCodes).toContain("PLAN_SOURCE_CHANGED");
  });

  it("fail-closes malformed expected Plan semantic fingerprints without disabling lineage checks", () => {
    const base = canonicalPlan();
    const matching = hashCanonicalPlanSemanticsForMandateTranslationV1(base);
    const different = hashCanonicalPlanSemanticsForMandateTranslationV1(
      canonicalPlan({ structured: { ...base.structured, objective: { type: "income" } } }),
    );
    const baseTranslationFingerprint = assess(base).translationFingerprint;
    const nullExpected = assess(base, { expectedPlanSemanticFingerprint: null });
    const matchingExpected = assess(base, { expectedPlanSemanticFingerprint: matching });
    const differentExpected = assess(base, { expectedPlanSemanticFingerprint: different });

    expect(assess(base).reasonCodes).toEqual(["HORIZON_EXPLICIT_AUTHORING_REQUIRED"]);
    expect(nullExpected.reasonCodes).toEqual(["HORIZON_EXPLICIT_AUTHORING_REQUIRED"]);
    expect(nullExpected.translationFingerprint).toBe(baseTranslationFingerprint);
    expect(matchingExpected.reasonCodes).toEqual(["HORIZON_EXPLICIT_AUTHORING_REQUIRED"]);
    expect(matchingExpected.translationFingerprint).toBe(baseTranslationFingerprint);
    expect(differentExpected.reasonCodes).toEqual([
      "HORIZON_EXPLICIT_AUTHORING_REQUIRED",
      "PLAN_SOURCE_CHANGED",
    ]);
    expect(differentExpected.translationFingerprint).not.toBe(baseTranslationFingerprint);

    for (const expectedPlanSemanticFingerprint of [
      "",
      " ",
      "abc123",
      `${"a".repeat(63)}g`,
      matching.toUpperCase(),
    ]) {
      const assessment = assess(base, { expectedPlanSemanticFingerprint });

      expect(assessment.reasonCodes).toEqual([
        "HORIZON_EXPLICIT_AUTHORING_REQUIRED",
        "EXPECTED_PLAN_SEMANTIC_FINGERPRINT_INVALID",
      ]);
      expect(assessment.reasonCodes).not.toContain("PLAN_SOURCE_CHANGED");
      expect(assessment.translationFingerprint).not.toBe(baseTranslationFingerprint);
    }
  });

  it("changes source Plan semantic fingerprint for every material Plan semantic field", () => {
    const base = hashCanonicalPlanSemanticsForMandateTranslationV1(canonicalPlan());
    const changes: Array<[string, CanonicalInvestingPlan]> = [
      ["id", canonicalPlan({ id: "plan_changed" })],
      ["version", canonicalPlan({ version: 8 })],
      ["activatedAt", canonicalPlan({ activatedAt: "2026-05-10T10:01:00.000Z" })],
      ["updatedAt", canonicalPlan({ updatedAt: "2026-05-10T11:01:00.000Z" })],
      ["schema", canonicalPlan({ structured: { ...canonicalPlan().structured, schemaVersion: 2 } })],
      ["objective type", canonicalPlan({ structured: { ...canonicalPlan().structured, objective: { type: "income" } } })],
      ["target amount", canonicalPlan({
        structured: {
          ...canonicalPlan().structured,
          objective: { ...canonicalPlan().structured.objective, targetAmount: { amount: 200000, currency: "EUR" } },
        },
      })],
      ["target currency", canonicalPlan({
        structured: {
          ...canonicalPlan().structured,
          objective: { ...canonicalPlan().structured.objective, targetAmount: { amount: 100000, currency: "USD" } },
        },
      })],
      ["timeframe", canonicalPlan({
        structured: { ...canonicalPlan().structured, objective: { ...canonicalPlan().structured.objective, timeframeMonths: 121 } },
      })],
      ["monthly contribution", canonicalPlan({
        structured: {
          ...canonicalPlan().structured,
          objective: {
            ...canonicalPlan().structured.objective,
            monthlyContribution: { amount: 300, currency: "EUR" },
          },
        },
      })],
      ["risk", canonicalPlan({ structured: { ...canonicalPlan().structured, risk: { profile: "Aggressive" } } })],
      ["guardrail single", canonicalPlan({
        structured: { ...canonicalPlan().structured, guardrails: { maxSinglePositionPct: 15 } },
      })],
      ["guardrail top5", canonicalPlan({
        structured: { ...canonicalPlan().structured, guardrails: { maxTop5Pct: 50 } },
      })],
    ];

    for (const [label, plan] of changes) {
      expect(hashCanonicalPlanSemanticsForMandateTranslationV1(plan), label).not.toBe(base);
    }
  });

  it("does not fingerprint non-authoritative free-text summary changes", () => {
    const first = hashCanonicalPlanSemanticsForMandateTranslationV1(canonicalPlan({ summary: "Summary A" }));
    const second = hashCanonicalPlanSemanticsForMandateTranslationV1(canonicalPlan({ summary: "Summary B" }));

    expect(second).toBe(first);
  });

  it("freezes and closes the assessment without exposing a fabricated mandate", () => {
    const assessment = assess();

    expect(Object.keys(assessment)).toEqual([
      "contractVersion",
      "sourcePlan",
      "account",
      "availability",
      "reasonCodes",
      "compatibleSemantics",
      "mandate",
      "translationFingerprint",
    ]);
    assertFrozenClosed(assessment);
    expect(assessment.availability).toBe("UNAVAILABLE");
    expect(assessment.mandate).toBeNull();
  });

  it("keeps current Plan v1 to canonical mandate unavailable by design", () => {
    const assessment = assess();

    expect(assessment.availability).toBe("UNAVAILABLE");
    expect(assessment.reasonCodes).toEqual(["HORIZON_EXPLICIT_AUTHORING_REQUIRED"]);
    expect(assessment.compatibleSemantics).toMatchObject({
      objective: "growth",
      riskProfile: "Balanced",
      horizon: null,
      baseCurrency: "EUR",
      constraints: null,
    });
    expect(assessment.mandate).toBeNull();
  });

  it("does not activate dashboard canonical decision authority", () => {
    const dashboard = readSource("lib/investing/server/dashboard.ts");

    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
  });

  it("keeps legacy authoring and defaults out of the translation boundary", () => {
    const source = readSource("lib/investing/authority/planToMandateTranslation.ts");

    expect(source).toContain("server-verified Investing account scope");
    expect(source).toContain("never client input");

    for (const forbidden of [
      "@/lib/investing/mandate",
      "lib/investing/mandate",
      "phase3c/authoring",
      "normalizeInvestingAuthoringV1",
      "OfflineSetup",
      "user_settings",
      "buildMandatePolicy",
      "target return",
      "expected return",
      "expectedReturn",
      "InvestingMandateSnapshotSourceV1",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

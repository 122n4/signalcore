import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_INVESTING_MANDATE_AUTHORITY_CONTRACT_VERSION,
  getPlanDerivedMandateAuthorityUnavailableV1,
  hashCanonicalInvestingMandateAuthorityV1,
  sealCanonicalInvestingMandateAuthorityV1,
  type CanonicalInvestingMandateAuthorityDraftV1,
} from "@/lib/investing/authority/mandateAuthority";
import { INVESTING_MANDATE_SNAPSHOT_SOURCE_V1_AUTHORITY_CLASSIFICATION } from "@/lib/investing/engine/v1/phase3c/types";

function constraint(overrides: Record<string, unknown> = {}): any {
  return {
    id: "max_single_position",
    kind: "hard",
    status: "pass",
    reasonCode: "accepted_fixture",
    observed: "0.12",
    limit: "0.2",
    evidenceRefs: ["plan_guardrail"],
    ...overrides,
  };
}

function validDraft(
  overrides: Partial<CanonicalInvestingMandateAuthorityDraftV1> = {},
): CanonicalInvestingMandateAuthorityDraftV1 {
  return {
    contractVersion: CANONICAL_INVESTING_MANDATE_AUTHORITY_CONTRACT_VERSION,
    authority: {
      userId: "user_123",
      tenantId: "tenant_123",
      membershipId: "membership_123",
      portfolioId: "portfolio_123",
      accountId: "account_123",
      environment: "paper",
      accountBaseCurrency: "EUR",
    },
    plan: {
      planId: "plan_123",
      planVersion: 7,
      mode: "investing",
      status: "active",
      activatedAt: "2026-05-10T10:00:00.000Z",
      updatedAt: "2026-05-10T11:00:00.000Z",
      structuredSchemaVersion: 1,
    },
    mandate: {
      mandateSnapshotId: "mandate_123",
      objective: "balanced",
      riskProfile: "Balanced",
      horizon: "Medium",
      baseCurrency: "EUR",
      constraints: [constraint()],
    },
    lineage: {
      asOf: "2026-05-10T12:00:00.000Z",
    },
    ...overrides,
  };
}

function changedFingerprint(mutator: (draft: any) => void) {
  const base = sealCanonicalInvestingMandateAuthorityV1(validDraft());
  const draft = validDraft() as any;
  mutator(draft);
  const changed = sealCanonicalInvestingMandateAuthorityV1(draft);
  expect(changed.lineage.authorityFingerprint).not.toBe(base.lineage.authorityFingerprint);
}

function expectInvalidDraft(mutator: (draft: any) => void) {
  const draft = validDraft() as any;
  mutator(draft);
  expect(() => sealCanonicalInvestingMandateAuthorityV1(draft)).toThrow();
}

function read(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function assertNoHiddenMutableDescendants(value: unknown, path = "$", seen = new WeakSet<object>()) {
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
    assertNoHiddenMutableDescendants(descriptor!.value, `${path}.${String(key)}`, seen);
  }
}

describe("canonical Investing mandate authority contract", () => {
  it("seals a valid server-verified authority fixture with a deterministic fingerprint", () => {
    const first = sealCanonicalInvestingMandateAuthorityV1(validDraft());
    const second = sealCanonicalInvestingMandateAuthorityV1(validDraft());

    expect(first.contractVersion).toBe("canonical-investing-mandate-authority/v1");
    expect(first.lineage.authorityFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.lineage.authorityFingerprint).toBe(first.lineage.authorityFingerprint);
    expect(hashCanonicalInvestingMandateAuthorityV1(first)).toBe(first.lineage.authorityFingerprint);
    expect(first.authority.accountBaseCurrency).toBe("EUR");
    expect(first.mandate.baseCurrency).toBe("EUR");
  });

  it("keeps object key ordering out of the fingerprint", () => {
    const ordered = sealCanonicalInvestingMandateAuthorityV1(validDraft());
    const reordered = sealCanonicalInvestingMandateAuthorityV1({
      lineage: { asOf: "2026-05-10T12:00:00.000Z" },
      mandate: {
        constraints: [
          {
            evidenceRefs: ["plan_guardrail"],
            limit: "0.2",
            observed: "0.12",
            reasonCode: "accepted_fixture",
            status: "pass",
            kind: "hard",
            id: "max_single_position",
          },
        ],
        baseCurrency: "EUR",
        horizon: "Medium",
        riskProfile: "Balanced",
        objective: "balanced",
        mandateSnapshotId: "mandate_123",
      },
      plan: {
        structuredSchemaVersion: 1,
        updatedAt: "2026-05-10T11:00:00.000Z",
        activatedAt: "2026-05-10T10:00:00.000Z",
        status: "active",
        mode: "investing",
        planVersion: 7,
        planId: "plan_123",
      },
      authority: {
        accountBaseCurrency: "EUR",
        environment: "paper",
        accountId: "account_123",
        portfolioId: "portfolio_123",
        membershipId: "membership_123",
        tenantId: "tenant_123",
        userId: "user_123",
      },
      contractVersion: CANONICAL_INVESTING_MANDATE_AUTHORITY_CONTRACT_VERSION,
    } as any);

    expect(reordered.lineage.authorityFingerprint).toBe(ordered.lineage.authorityFingerprint);
  });

  it("changes the fingerprint for each material authority, plan, mandate and lineage binding", () => {
    const changes: Array<[string, (draft: any) => void]> = [
      ["userId", (draft) => { draft.authority.userId = "user_changed"; }],
      ["tenantId", (draft) => { draft.authority.tenantId = "tenant_changed"; }],
      ["membershipId", (draft) => { draft.authority.membershipId = "membership_changed"; }],
      ["portfolioId", (draft) => { draft.authority.portfolioId = "portfolio_changed"; }],
      ["accountId", (draft) => { draft.authority.accountId = "account_changed"; }],
      ["environment", (draft) => { draft.authority.environment = "simulation"; }],
      ["accountBaseCurrency", (draft) => {
        draft.authority.accountBaseCurrency = "USD";
        draft.mandate.baseCurrency = "USD";
      }],
      ["planId", (draft) => { draft.plan.planId = "plan_changed"; }],
      ["planVersion", (draft) => { draft.plan.planVersion = 8; }],
      ["activatedAt", (draft) => { draft.plan.activatedAt = "2026-05-10T10:01:00.000Z"; }],
      ["updatedAt", (draft) => { draft.plan.updatedAt = "2026-05-10T11:01:00.000Z"; }],
      ["mandateSnapshotId", (draft) => { draft.mandate.mandateSnapshotId = "mandate_changed"; }],
      ["mandate objective", (draft) => { draft.mandate.objective = "growth"; }],
      ["mandate riskProfile", (draft) => { draft.mandate.riskProfile = "Aggressive"; }],
      ["mandate horizon", (draft) => { draft.mandate.horizon = "Long"; }],
      ["mandate baseCurrency", (draft) => {
        draft.authority.accountBaseCurrency = "GBP";
        draft.mandate.baseCurrency = "GBP";
      }],
      ["constraints", (draft) => { draft.mandate.constraints = [constraint({ limit: "0.25" })]; }],
      ["asOf", (draft) => { draft.lineage.asOf = "2026-05-10T12:01:00.000Z"; }],
    ];

    for (const [label, mutate] of changes) {
      expect(() => changedFingerprint(mutate), label).not.toThrow();
    }
  });

  it("commits structured schema version into the fingerprint input while accepting only v1", () => {
    const baseDraft = validDraft();
    const unsupportedSchemaDraft = validDraft() as any;
    unsupportedSchemaDraft.plan.structuredSchemaVersion = 2;

    expect(hashCanonicalInvestingMandateAuthorityV1(unsupportedSchemaDraft)).not.toBe(
      hashCanonicalInvestingMandateAuthorityV1(baseDraft),
    );
    expect(() => sealCanonicalInvestingMandateAuthorityV1(unsupportedSchemaDraft)).toThrow(
      /structured_schema_invalid/,
    );
  });

  it("rejects missing or malformed material identity and timestamp bindings", () => {
    for (const mutate of [
      (draft: any) => { draft.authority.userId = ""; },
      (draft: any) => { draft.authority.tenantId = ""; },
      (draft: any) => { draft.authority.membershipId = ""; },
      (draft: any) => { draft.authority.portfolioId = ""; },
      (draft: any) => { draft.authority.accountId = ""; },
      (draft: any) => { draft.plan.planId = ""; },
      (draft: any) => { draft.mandate.mandateSnapshotId = ""; },
      (draft: any) => { draft.plan.activatedAt = null; },
      (draft: any) => { draft.plan.activatedAt = "2026-05-10"; },
      (draft: any) => { draft.plan.updatedAt = "not-iso"; },
      (draft: any) => { draft.lineage.asOf = "2026-13-10T12:00:00.000Z"; },
    ]) {
      const draft = validDraft() as any;
      mutate(draft);
      expect(() => sealCanonicalInvestingMandateAuthorityV1(draft)).toThrow();
    }
  });

  it("rejects non-active non-investing plans, non-positive versions, unsupported schemas and live", () => {
    for (const mutate of [
      (draft: any) => { draft.plan.planVersion = 0; },
      (draft: any) => { draft.plan.planVersion = -1; },
      (draft: any) => { draft.plan.planVersion = Number.POSITIVE_INFINITY; },
      (draft: any) => { draft.plan.structuredSchemaVersion = 2; },
      (draft: any) => { draft.plan.mode = "trading"; },
      (draft: any) => { draft.plan.status = "draft"; },
      (draft: any) => { draft.authority.environment = "live"; },
    ]) {
      const draft = validDraft() as any;
      mutate(draft);
      expect(() => sealCanonicalInvestingMandateAuthorityV1(draft)).toThrow();
    }
  });

  it("rejects currency mismatches and unsupported mandate vocabularies", () => {
    for (const mutate of [
      (draft: any) => { draft.authority.accountBaseCurrency = "eur"; },
      (draft: any) => { draft.mandate.baseCurrency = "USD"; },
      (draft: any) => { draft.mandate.objective = "retirement"; },
      (draft: any) => { draft.mandate.riskProfile = "VeryHigh"; },
      (draft: any) => { draft.mandate.horizon = "30years"; },
    ]) {
      const draft = validDraft() as any;
      mutate(draft);
      expect(() => sealCanonicalInvestingMandateAuthorityV1(draft)).toThrow();
    }
  });

  it("rejects malformed or non-closed constraint evaluations and undefined canonical values", () => {
    for (const mutate of [
      (draft: any) => { draft.mandate.constraints = [constraint({ id: "" })]; },
      (draft: any) => { draft.mandate.constraints = [constraint({ kind: "medium" })]; },
      (draft: any) => { draft.mandate.constraints = [constraint({ status: "ok" })]; },
      (draft: any) => { draft.mandate.constraints = [constraint({ reasonCode: "" })]; },
      (draft: any) => { draft.mandate.constraints = [constraint({ observed: "01.20" })]; },
      (draft: any) => { draft.mandate.constraints = [constraint({ limit: undefined })]; },
      (draft: any) => { draft.mandate.constraints = [constraint({ evidenceRefs: [""] })]; },
      (draft: any) => { draft.mandate.constraints = [constraint(), constraint()]; },
      (draft: any) => { draft.mandate.constraints = [constraint({ futureField: "BUY" })]; },
      (draft: any) => { draft.mandate.futureField = "BUY"; },
    ]) {
      const draft = validDraft() as any;
      mutate(draft);
      expect(() => sealCanonicalInvestingMandateAuthorityV1(draft)).toThrow();
    }
  });

  it("rejects hidden, Symbol-keyed and accessor authority fields before hashing or sealing", () => {
    const rootSymbol = Symbol("futureAuthority");
    const authoritySymbol = Symbol("futureAuthority");
    const mandateSymbol = Symbol("futureAuthority");
    const constraintSymbol = Symbol("futureAuthority");

    expectInvalidDraft((draft) => {
      draft[rootSymbol] = { allowExecution: true };
    });
    expectInvalidDraft((draft) => {
      draft.authority[authoritySymbol] = { allowExecution: true };
    });
    expectInvalidDraft((draft) => {
      Object.defineProperty(draft.authority, "futureAuthority", {
        value: { allowNewRisk: true },
        enumerable: false,
      });
    });
    expectInvalidDraft((draft) => {
      draft.mandate[mandateSymbol] = { allowExecution: true };
    });
    expectInvalidDraft((draft) => {
      Object.defineProperty(draft.mandate, "futureAuthority", {
        value: { allowNewRisk: true },
        enumerable: false,
      });
    });
    expectInvalidDraft((draft) => {
      draft.mandate.constraints[0][constraintSymbol] = { decision: "BUY" };
    });
    expectInvalidDraft((draft) => {
      Object.defineProperty(draft.mandate.constraints[0], "futureAuthority", {
        value: { allowExecution: true },
        enumerable: false,
      });
    });
    expectInvalidDraft((draft) => {
      Object.defineProperty(draft.mandate.constraints, "futureAuthority", {
        value: { allowExecution: true },
        enumerable: false,
      });
    });
    expectInvalidDraft((draft) => {
      draft.mandate.constraints[0].evidenceRefs[Symbol("futureAuthority")] = { decision: "BUY" };
    });
  });

  it("rejects class-instance and accessor Plan objects without invoking getters", () => {
    class PlanFixture {
      planId = "plan_123";
      planVersion = 7;
      mode = "investing";
      status = "active";
      activatedAt = "2026-05-10T10:00:00.000Z";
      updatedAt = "2026-05-10T11:00:00.000Z";
      structuredSchemaVersion = 1;
    }

    expectInvalidDraft((draft) => {
      draft.plan = new PlanFixture();
    });

    let getterCalls = 0;
    expectInvalidDraft((draft) => {
      Object.defineProperty(draft.plan, "planId", {
        enumerable: true,
        get() {
          getterCalls += 1;
          return "plan_123";
        },
      });
    });
    expect(getterCalls).toBe(0);
  });

  it("rejects temporally incoherent Plan lineage while allowing equality and ordered lineage", () => {
    expect(() =>
      sealCanonicalInvestingMandateAuthorityV1(
        validDraft({
          plan: {
            ...validDraft().plan,
            activatedAt: "2026-05-10T10:00:00.000Z",
            updatedAt: "2026-05-10T10:00:00.000Z",
          },
          lineage: { asOf: "2026-05-10T10:00:00.000Z" },
        }),
      ),
    ).not.toThrow();

    expect(() => sealCanonicalInvestingMandateAuthorityV1(validDraft())).not.toThrow();

    expectInvalidDraft((draft) => {
      draft.plan.activatedAt = "2026-05-10T11:00:00.001Z";
      draft.plan.updatedAt = "2026-05-10T11:00:00.000Z";
    });
    expectInvalidDraft((draft) => {
      draft.plan.updatedAt = "2026-05-10T12:00:00.001Z";
      draft.lineage.asOf = "2026-05-10T12:00:00.000Z";
    });
    expectInvalidDraft((draft) => {
      draft.plan.activatedAt = "2026-05-10T12:00:00.001Z";
      draft.lineage.asOf = "2026-05-10T12:00:00.000Z";
    });
  });

  it("freezes the sealed result", () => {
    const sealed = sealCanonicalInvestingMandateAuthorityV1(validDraft());

    expect(Object.isFrozen(sealed)).toBe(true);
    expect(Object.isFrozen(sealed.authority)).toBe(true);
    expect(Object.isFrozen(sealed.plan)).toBe(true);
    expect(Object.isFrozen(sealed.mandate)).toBe(true);
    expect(Object.isFrozen(sealed.mandate.constraints)).toBe(true);
    expect(Object.isFrozen(sealed.mandate.constraints[0])).toBe(true);
    expect(Object.isFrozen(sealed.lineage)).toBe(true);
    assertNoHiddenMutableDescendants(sealed);
  });

  it("keeps market and quote observations out of durable mandate authority", () => {
    const sealed = sealCanonicalInvestingMandateAuthorityV1(validDraft());
    const serialized = JSON.stringify(sealed);

    expect(serialized).not.toContain("marketSnapshotId");
    expect(serialized).not.toContain("quote");
    expect(serialized).not.toContain("price");
    expect(serialized).not.toContain("provider");

    expect(() =>
      sealCanonicalInvestingMandateAuthorityV1({
        ...validDraft(),
        marketSnapshotId: "market_123",
      } as any),
    ).toThrow(/closed/);
  });

  it("does not perform implicit Plan to Mandate translation in A2.2", () => {
    const unavailable = getPlanDerivedMandateAuthorityUnavailableV1();

    expect(unavailable).toEqual({
      availability: "UNAVAILABLE",
      reason: "plan_to_mandate_translation_not_accepted",
      authority: null,
    });
    expect(Object.isFrozen(unavailable)).toBe(true);
  });

  it("keeps dashboard canonical decision authority closed", () => {
    const dashboard = read("lib/investing/server/dashboard.ts");

    expect(dashboard).toContain("function hasAcceptedCanonicalDecisionAuthority");
    expect(dashboard).toContain("return false;");
  });

  it("keeps legacy mandate policy builders out of the canonical authority contract", () => {
    const authoritySource = read("lib/investing/authority/mandateAuthority.ts");
    const phase3cTypes = read("lib/investing/engine/v1/phase3c/types.ts");

    expect(authoritySource).not.toContain("buildMandatePolicy");
    expect(authoritySource).not.toContain("@/lib/investing/mandate");
    expect(authoritySource).not.toContain("normalizeInvestingAuthoringV1");
    expect(INVESTING_MANDATE_SNAPSHOT_SOURCE_V1_AUTHORITY_CLASSIFICATION).toBe(
      "PRE_R5_ENGINE_INTERNAL/NOT_ACCEPTED_R5_AUTHORITY",
    );
    expect(phase3cTypes).toContain("PRE_R5_ENGINE_INTERNAL/NOT_ACCEPTED_R5_AUTHORITY");
  });
});

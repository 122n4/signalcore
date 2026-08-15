import { describe, expect, it } from "vitest";

import {
  INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
  canonicalDecimalFromString,
  canonicalJsonStringify,
  createStaticPilotInstrumentCatalogAdapter,
  sealCanonicalInvestingInputV1,
  sealMarketSnapshotV1,
  type CanonicalInvestingInputV1,
  type CanonicalMarketSnapshotV1,
  type InvestingConstraintEvaluationV1,
} from "@/lib/investing/engine/v1";
import {
  buildCanonicalInvestingInputFromSourcesV1,
  type InvestingFinancialReadModelV1,
  type InvestingPositionSourceV1,
} from "@/lib/investing/engine/v1/phase3c";
import {
  evaluateInvestingRiskPolicyV1,
  hashInvestingTechnicalPolicyDefinitionV1,
  INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
  TECHNICAL_INVESTING_POLICY_DEFINITION_V1,
  TECHNICAL_INVESTING_POLICY_VERSION_V1,
  type TechnicalInvestingPolicyDefinitionV1,
  type RiskPolicyEvaluationContextV1,
} from "@/lib/investing/engine/v1/phase3d";

const AS_OF = "2026-07-20T10:00:00.000Z";
const d = canonicalDecimalFromString;
const catalog = createStaticPilotInstrumentCatalogAdapter().snapshot();
const context: RiskPolicyEvaluationContextV1 = {
  expectedUserId: "user_phase3d_1",
  expectedAccountId: "account_phase3d_1",
  environment: "paper",
};

function rule(args: {
  id: string;
  kind?: "hard" | "soft";
  status?: "pass" | "fail" | "unknown";
  limit?: string | null;
  observed?: string | null;
}): InvestingConstraintEvaluationV1 {
  return {
    id: args.id,
    kind: args.kind ?? "hard",
    status: args.status ?? "pass",
    reasonCode: `rule_${args.id.replaceAll(":", "_")}`,
    observed: args.observed === undefined || args.observed === null ? null : d(args.observed),
    limit: args.limit === undefined || args.limit === null ? null : d(args.limit),
    evidenceRefs: ["mandate_phase3d_1"],
  };
}

function position(overrides: Partial<InvestingPositionSourceV1> = {}): InvestingPositionSourceV1 {
  return {
    accountId: "account_phase3d_1",
    symbol: "AGGH",
    quantity: "2",
    reservedQuantity: "0",
    costBasis: "45",
    currency: "EUR",
    ...overrides,
  };
}

function market(args: { omit?: readonly string[]; stale?: readonly string[] } = {}) {
  const omitted = new Set(args.omit ?? []);
  const stale = new Set(args.stale ?? []);
  return sealMarketSnapshotV1({
    contractVersion: "investing-market-snapshot/v1",
    marketSnapshotId: "market_phase3d_1",
    asOf: AS_OF,
    schemaVersion: "market-phase3d/v1",
    points: [
      ...catalog.instruments.filter((instrument) => !omitted.has(instrument.symbol)).map((instrument, index) => ({
        symbol: instrument.symbol,
        price: d(String([100, 200, 50, 150][index])),
        currency: instrument.currency,
        provider: "phase3d_fixture",
        providerAsOf: stale.has(instrument.symbol) ? "2026-07-20T09:00:00.000Z" : AS_OF,
        receivedAt: AS_OF,
        quality: "good" as const,
      })),
      ...(!omitted.has("USDEUR") ? [{
        symbol: "USDEUR",
        price: d("0.9"),
        currency: "EUR",
        provider: "phase3d_fixture",
        providerAsOf: AS_OF,
        receivedAt: AS_OF,
        quality: "good" as const,
      }] : []),
    ],
    issues: [],
  });
}

function financial(args: {
  cash?: string;
  positions?: readonly InvestingPositionSourceV1[];
  constraints?: readonly InvestingConstraintEvaluationV1[];
  riskProfile?: "Conservative" | "Balanced" | "Aggressive";
} = {}): InvestingFinancialReadModelV1 {
  return {
    identity: { requestedUserId: "user_phase3d_1", ownerUserId: "user_phase3d_1" },
    accounts: [{
      accountId: "account_phase3d_1",
      userId: "user_phase3d_1",
      portfolioId: "primary",
      environment: "paper",
      status: "active",
      baseCurrency: "EUR",
    }],
    cashBalances: [{
      accountId: "account_phase3d_1",
      currency: "EUR",
      available: args.cash ?? "1000",
      settled: args.cash ?? "1000",
      reserved: "0",
    }],
    positions: args.positions ?? [],
    orders: [],
    fills: [],
    mandateSnapshot: {
      userId: "user_phase3d_1",
      accountId: "account_phase3d_1",
      mandate: {
        mandateSnapshotId: "mandate_phase3d_1",
        objective: "balanced",
        riskProfile: args.riskProfile ?? "Balanced",
        horizon: "Long",
        baseCurrency: "EUR",
        constraints: args.constraints ?? [rule({ id: "paper_environment_only" })],
      },
    },
    authoring: {
      plan: { objective: "balanced", riskProfile: args.riskProfile ?? "Balanced", horizon: "Long" },
      settings: { marketDataMaxAgeSeconds: "900", orderStaleAfterSeconds: "86400" },
    },
  };
}

function buildInput(args: {
  cash?: string;
  positions?: readonly InvestingPositionSourceV1[];
  constraints?: readonly InvestingConstraintEvaluationV1[];
  riskProfile?: "Conservative" | "Balanced" | "Aggressive";
  market?: CanonicalMarketSnapshotV1;
  policyVersion?: string;
} = {}) {
  const snapshot = args.market ?? market();
  return buildCanonicalInvestingInputFromSourcesV1({
    request: {
      requestedUserId: "user_phase3d_1",
      requestedAccountId: "account_phase3d_1",
      inputSnapshotId: "input_phase3d_1",
      runId: "run_phase3d_1",
      asOf: AS_OF,
      marketSnapshotId: snapshot.marketSnapshotId,
      versions: {
        contractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
        engineVersion: "engine/v1.2.0-phase3d",
        policyVersion: args.policyVersion ?? "risk-policy/v1",
        modelVersion: "risk-model/v1",
        instrumentCatalogVersion: catalog.version,
        marketDataSchemaVersion: snapshot.schemaVersion,
      },
    },
    financial: financial(args),
    instrumentCatalog: catalog,
    market: snapshot,
  }).input;
}

function evaluate(input = buildInput(), authorization = context) {
  return evaluateInvestingRiskPolicyV1(input, authorization);
}

function constraint(result: ReturnType<typeof evaluate>, code: string) {
  return result.constraints.find((entry) => entry.code === code);
}

function reseal(input: CanonicalInvestingInputV1, changes: Partial<CanonicalInvestingInputV1>) {
  const draft: Record<string, unknown> = { ...input, ...changes };
  delete draft.inputHash;
  return sealCanonicalInvestingInputV1(draft as never);
}

function cloneTechnicalPolicyDefinitionV1(): TechnicalInvestingPolicyDefinitionV1 {
  return JSON.parse(JSON.stringify(TECHNICAL_INVESTING_POLICY_DEFINITION_V1)) as TechnicalInvestingPolicyDefinitionV1;
}

function mutableBalancedInstrumentLimit(definition: TechnicalInvestingPolicyDefinitionV1) {
  const riskProfile = definition.riskProfiles.find((entry) => entry.riskProfile === "Balanced");
  const limit = riskProfile?.declarations.find((entry) => entry.code === "maximum_instrument_weight");
  if (!limit) throw new Error("balanced_maximum_instrument_weight_fixture_missing");
  return limit as {
    value: ReturnType<typeof d>;
    kind: "hard" | "soft";
    scope: "instrument" | "asset_class" | "currency" | "cash" | "total_exposure" | "risk_score";
  };
}

function assertRecursivelyFrozen(value: unknown, path = "$", seen = new WeakSet<object>()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value), path).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    assertRecursivelyFrozen((value as Record<PropertyKey, unknown>)[key], `${path}.${String(key)}`, seen);
  }
}

describe("FASE 3D Risk, Policy and Constraints Engine", () => {
  it("binds risk-policy/v1 to the immutable current technical definition", () => {
    expect(TECHNICAL_INVESTING_POLICY_VERSION_V1).toBe("risk-policy/v1");
    expect(INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1).toBe(
      "5eb795d99220cdd038bd5d82113b40a94de80b4226098553631418bf9c02851a",
    );
    expect(hashInvestingTechnicalPolicyDefinitionV1(TECHNICAL_INVESTING_POLICY_DEFINITION_V1)).toBe(
      INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
    );
    expect(TECHNICAL_INVESTING_POLICY_DEFINITION_V1.riskProfiles).toEqual([
      {
        riskProfile: "Conservative",
        declarations: [
          { code: "maximum_instrument_weight", scope: "instrument", subject: null, kind: "hard", value: d("0.25") },
          { code: "maximum_asset_class_weight", scope: "asset_class", subject: null, kind: "hard", value: d("0.60") },
          { code: "maximum_currency_weight", scope: "currency", subject: null, kind: "soft", value: d("0.40") },
          { code: "minimum_cash_weight", scope: "cash", subject: null, kind: "hard", value: d("0.10") },
          { code: "maximum_total_exposure", scope: "total_exposure", subject: null, kind: "hard", value: d("0.90") },
          { code: "maximum_risk_score", scope: "risk_score", subject: null, kind: "soft", value: d("0.35") },
        ],
      },
      {
        riskProfile: "Balanced",
        declarations: [
          { code: "maximum_instrument_weight", scope: "instrument", subject: null, kind: "hard", value: d("0.35") },
          { code: "maximum_asset_class_weight", scope: "asset_class", subject: null, kind: "hard", value: d("0.75") },
          { code: "maximum_currency_weight", scope: "currency", subject: null, kind: "soft", value: d("0.60") },
          { code: "minimum_cash_weight", scope: "cash", subject: null, kind: "hard", value: d("0.05") },
          { code: "maximum_total_exposure", scope: "total_exposure", subject: null, kind: "hard", value: d("0.95") },
          { code: "maximum_risk_score", scope: "risk_score", subject: null, kind: "soft", value: d("0.50") },
        ],
      },
      {
        riskProfile: "Aggressive",
        declarations: [
          { code: "maximum_instrument_weight", scope: "instrument", subject: null, kind: "hard", value: d("0.50") },
          { code: "maximum_asset_class_weight", scope: "asset_class", subject: null, kind: "hard", value: d("0.90") },
          { code: "maximum_currency_weight", scope: "currency", subject: null, kind: "soft", value: d("0.80") },
          { code: "minimum_cash_weight", scope: "cash", subject: null, kind: "hard", value: d("0.02") },
          { code: "maximum_total_exposure", scope: "total_exposure", subject: null, kind: "hard", value: d("0.98") },
          { code: "maximum_risk_score", scope: "risk_score", subject: null, kind: "soft", value: d("0.70") },
        ],
      },
    ]);
  });

  it("changes the definition hash when a v1 declaration value changes", () => {
    const mutated = cloneTechnicalPolicyDefinitionV1();
    const limit = mutableBalancedInstrumentLimit(mutated);

    expect(mutated.policyVersion).toBe("risk-policy/v1");
    expect(limit.value).toBe(d("0.35"));
    limit.value = d("0.36");

    expect(hashInvestingTechnicalPolicyDefinitionV1(mutated)).not.toBe(
      INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
    );
    expect(INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1).toBe(
      "5eb795d99220cdd038bd5d82113b40a94de80b4226098553631418bf9c02851a",
    );
  });

  it("changes the definition hash when a v1 declaration kind changes", () => {
    const mutated = cloneTechnicalPolicyDefinitionV1();
    const limit = mutableBalancedInstrumentLimit(mutated);

    expect(mutated.policyVersion).toBe("risk-policy/v1");
    expect(limit.kind).toBe("hard");
    limit.kind = "soft";

    expect(hashInvestingTechnicalPolicyDefinitionV1(mutated)).not.toBe(
      INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
    );
    expect(INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1).toBe(
      "5eb795d99220cdd038bd5d82113b40a94de80b4226098553631418bf9c02851a",
    );
  });

  it("changes the definition hash when a v1 declaration scope changes", () => {
    const mutated = cloneTechnicalPolicyDefinitionV1();
    const limit = mutableBalancedInstrumentLimit(mutated);

    expect(mutated.policyVersion).toBe("risk-policy/v1");
    expect(limit.scope).toBe("instrument");
    limit.scope = "asset_class";

    expect(hashInvestingTechnicalPolicyDefinitionV1(mutated)).not.toBe(
      INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1,
    );
    expect(INVESTING_TECHNICAL_POLICY_DEFINITION_HASH_V1).toBe(
      "5eb795d99220cdd038bd5d82113b40a94de80b4226098553631418bf9c02851a",
    );
  });

  it("freezes the exported v1 technical definition recursively", () => {
    assertRecursivelyFrozen(TECHNICAL_INVESTING_POLICY_DEFINITION_V1);
  });

  it.each(["foo/v9", "investing_policy_v2", "risk-policy/v2", "risk-policy/V1", "arbitrary-valid/version"])(
    "fails closed instead of running v1 under caller-supplied policy version %s",
    (policyVersion) => {
      expect(() => evaluate(buildInput({ policyVersion }))).toThrow("investing_policy_version_unsupported");
    },
  );

  it("preserves current v1 policy output and source strings", () => {
    const result = evaluate(buildInput());
    expect(result.policy.policyVersion).toBe("risk-policy/v1");
    expect(result.policy.limits).toEqual([
      { code: "maximum_asset_class_weight", scope: "asset_class", subject: null, kind: "hard", value: d("0.75"), source: "policy_defaults:Balanced:v1" },
      { code: "minimum_cash_weight", scope: "cash", subject: null, kind: "hard", value: d("0.05"), source: "policy_defaults:Balanced:v1" },
      { code: "maximum_currency_weight", scope: "currency", subject: null, kind: "soft", value: d("0.60"), source: "policy_defaults:Balanced:v1" },
      { code: "maximum_instrument_weight", scope: "instrument", subject: null, kind: "hard", value: d("0.35"), source: "policy_defaults:Balanced:v1" },
      { code: "maximum_risk_score", scope: "risk_score", subject: null, kind: "soft", value: d("0.50"), source: "policy_defaults:Balanced:v1" },
      { code: "maximum_total_exposure", scope: "total_exposure", subject: null, kind: "hard", value: d("0.95"), source: "policy_defaults:Balanced:v1" },
    ]);
  });

  it("allows a known empty portfolio without inventing risk data", () => {
    const result = evaluate(buildInput({ cash: "0" }));
    expect(result.status).toBe("allowed");
    expect(result.risk.totalPortfolioValue.value).toBe("0");
    expect(result.risk.cashWeight.value).toBe("1");
    expect(result.risk.volatility.status).toBe("insufficient_data");
    expect(result.risk.drawdown.value).toBeNull();
  });

  it("allows cash-only and exposes explicit cash metrics", () => {
    const result = evaluate();
    expect(result.status).toBe("allowed");
    expect(result.risk.availableCash.value).toBe("1000");
    expect(result.risk.cashWeight.value).toBe("1");
    expect(result.risk.totalExposure.value).toBe("0");
  });

  it("blocks excessive instrument concentration", () => {
    const result = evaluate(buildInput({ cash: "0", positions: [position({ quantity: "20" })] }));
    expect(result.status).toBe("blocked");
    expect(constraint(result, "maximum_instrument_weight:AGGH")).toMatchObject({
      severity: "hard", status: "fail", observed: "1", allowedLimit: "0.35", consequence: "block",
    });
  });

  it("applies an authoritative per-instrument limit", () => {
    const result = evaluate(buildInput({
      cash: "700",
      positions: [position({ quantity: "6" })],
      constraints: [rule({ id: "max_instrument_weight:AGGH", limit: "0.2" })],
    }));
    expect(result.status).toBe("blocked");
    expect(constraint(result, "maximum_instrument_weight:AGGH")?.source).toContain("mandate:");
  });

  it("blocks an asset-class limit while individual instruments remain inside their limits", () => {
    const result = evaluate(buildInput({
      cash: "500",
      positions: [
        position({ symbol: "VWCE", quantity: "2", currency: "USD" }),
        position({ symbol: "SPY", quantity: "1", currency: "USD" }),
      ],
      constraints: [rule({ id: "max_asset_class_weight:equity", limit: "0.4" })],
    }));
    expect(result.status).toBe("blocked");
    expect(constraint(result, "maximum_asset_class_weight:equity")?.status).toBe("fail");
  });

  it("blocks cash below an authoritative minimum buffer", () => {
    const result = evaluate(buildInput({
      cash: "100",
      positions: [position({ quantity: "18" })],
      constraints: [
        rule({ id: "max_instrument_weight", limit: "1" }),
        rule({ id: "max_asset_class_weight", limit: "1" }),
        rule({ id: "maximum_total_exposure", limit: "1" }),
        rule({ id: "maximum_risk_score", kind: "soft", limit: "1" }),
        rule({ id: "minimum_cash_weight", limit: "0.2" }),
      ],
    }));
    expect(result.status).toBe("blocked");
    expect(constraint(result, "minimum_cash_weight")).toMatchObject({ status: "fail", observed: "0.1", allowedLimit: "0.2" });
  });

  it("blocks a held instrument outside an explicit universe", () => {
    const result = evaluate(buildInput({
      cash: "900",
      positions: [position()],
      constraints: [rule({ id: "allow_instrument:VWCE" })],
    }));
    expect(result.status).toBe("blocked");
    expect(constraint(result, "instrument_universe:AGGH")?.status).toBe("fail");
  });

  it("blocks an explicitly prohibited instrument", () => {
    const result = evaluate(buildInput({
      cash: "900",
      positions: [position()],
      constraints: [rule({ id: "prohibit_instrument:AGGH" })],
    }));
    expect(result.status).toBe("blocked");
    expect(constraint(result, "instrument_prohibited:AGGH")?.consequence).toBe("block");
    expect(result.prohibitedInstruments).toContain("AGGH");
    expect(result.policy.instrumentRules.find((entry) => entry.symbol === "AGGH")).toMatchObject({
      disposition: "prohibited",
      source: expect.stringContaining("mandate:"),
    });
  });

  it("excludes instruments that fail suitability without weakening the mandate", () => {
    const result = evaluate(buildInput({
      constraints: [rule({ id: "suitability_instrument:GLD", status: "fail" })],
    }));
    expect(result.status).toBe("allowed");
    expect(result.allowedInstruments).not.toContain("GLD");
    expect(result.prohibitedInstruments).toContain("GLD");
    expect(result.policy.instrumentRules.find((entry) => entry.symbol === "GLD")?.disposition).toBe("unsuitable");
  });

  it("degrades a soft foreign-currency exposure violation", () => {
    const result = evaluate(buildInput({
      cash: "550",
      positions: [position({ symbol: "VWCE", quantity: "5", currency: "USD" })],
      constraints: [
        rule({ id: "max_instrument_weight:VWCE", limit: "1" }),
        rule({ id: "max_asset_class_weight:equity", limit: "1" }),
        rule({ id: "max_currency_weight:USD", kind: "soft", limit: "0.3" }),
      ],
    }));
    expect(result.status).toBe("degraded");
    expect(constraint(result, "maximum_currency_weight:USD")).toMatchObject({
      severity: "soft", status: "fail", consequence: "degrade",
    });
  });

  it("rejects a structurally missing mandate before evaluation", () => {
    const input = buildInput();
    const invalid = { ...input } as Record<string, unknown>;
    delete invalid.mandate;
    expect(() => evaluateInvestingRiskPolicyV1(invalid as never, context)).toThrow("investing_risk_policy_input_invalid");
  });

  it("fails closed on contradictory mandate limit definitions", () => {
    const result = evaluate(buildInput({ constraints: [
      rule({ id: "max_instrument_weight:AGGH:first", limit: "0.2" }),
      rule({ id: "max_instrument_weight:AGGH:second", limit: "0.3" }),
    ] }));
    expect(result.status).toBe("blocked");
    expect(result.policy.status).toBe("conflict");
    expect(result.constraints.some((entry) => entry.status === "conflict" && entry.severity === "hard")).toBe(true);
  });

  it("degrades stale canonical market data", () => {
    const result = evaluate(buildInput({
      cash: "900",
      positions: [position()],
      market: market({ stale: ["AGGH"] }),
    }));
    expect(result.status).toBe("degraded");
    expect(result.risk.issues.map((entry) => entry.code)).toContain("risk_price_stale");
  });

  it("returns insufficient_data when a required price is absent", () => {
    const result = evaluate(buildInput({
      cash: "900", positions: [position()], market: market({ omit: ["AGGH"] }),
    }));
    expect(result.status).toBe("insufficient_data");
    expect(result.allowedInstruments).toEqual([]);
    expect(result.risk.issues.map((entry) => entry.code)).toContain("risk_price_missing");
  });

  it("returns insufficient_data when required FX is absent", () => {
    const result = evaluate(buildInput({
      cash: "900",
      positions: [position({ symbol: "VWCE", quantity: "1", currency: "USD" })],
      market: market({ omit: ["USDEUR"] }),
    }));
    expect(result.status).toBe("insufficient_data");
    expect(result.risk.issues.map((entry) => entry.code)).toContain("risk_fx_missing");
  });

  it("withholds decisions when canonical input quality is insufficient", () => {
    const input = buildInput();
    const insufficient = reseal(input, {
      quality: {
        status: "insufficient",
        issues: [{ code: "fixture_insufficient", severity: "error", domain: "fixture", message: "Required source missing", observedAt: AS_OF }],
      },
    });
    const result = evaluate(insufficient);
    expect(result.status).toBe("insufficient_data");
    expect(constraint(result, "canonical_data_quality")?.status).toBe("unknown");
  });

  it("preserves hard precedence when hard and soft constraints fail together", () => {
    const result = evaluate(buildInput({
      cash: "700",
      positions: [position({ quantity: "6" })],
      constraints: [
        rule({ id: "max_instrument_weight:AGGH", limit: "0.2" }),
        rule({ id: "max_currency_weight:EUR", kind: "soft", limit: "0.5" }),
      ],
    }));
    expect(result.status).toBe("blocked");
    expect(result.constraints).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: "hard", status: "fail", consequence: "block" }),
      expect.objectContaining({ severity: "soft", status: "fail", consequence: "degrade" }),
    ]));
  });

  it("fails closed on an inherited hard constraint conflict/unknown", () => {
    const unknown = evaluate(buildInput({ constraints: [rule({ id: "custom_loss_capacity", status: "unknown" })] }));
    expect(unknown.status).toBe("insufficient_data");
    expect(constraint(unknown, "mandate_constraint:custom_loss_capacity")?.consequence).toBe("block");
  });

  it("is invariant to source row and object-key order", () => {
    const positions = [position(), position({ symbol: "VWCE", quantity: "1", currency: "USD" })];
    const first = buildInput({ cash: "1000", positions });
    const second = buildInput({ cash: "1000", positions: [...positions].reverse() });
    const reordered = reseal(second, {
      projected: {
        positions: second.projected.positions,
        cash: second.projected.cash,
        stateVersion: second.projected.stateVersion,
      },
    });
    const firstResult = evaluate(first);
    const secondResult = evaluate(reordered);
    expect(first.inputHash).toBe(reordered.inputHash);
    expect(canonicalJsonStringify(firstResult)).toBe(canonicalJsonStringify(secondResult));
  });

  it("handles extreme decimals without financial Number arithmetic", () => {
    const amount = "999999999999999999999999999999.123456789012345678";
    const result = evaluate(buildInput({ cash: amount }));
    expect(result.status).toBe("allowed");
    expect(result.risk.availableCash.value).toBe(amount);
    expect(result.risk.cashWeight.value).toBe("1");
  });

  it("blocks invalid ownership context", () => {
    const result = evaluate(buildInput(), { ...context, expectedUserId: "other_user" });
    expect(result.status).toBe("blocked");
    expect(constraint(result, "authorization_ownership")?.status).toBe("fail");
  });

  it("blocks a canonical non-Paper account environment", () => {
    const simulation = reseal(buildInput(), { environment: "simulation" });
    const result = evaluate(simulation);
    expect(result.status).toBe("blocked");
    expect(constraint(result, "environment_paper_only")?.status).toBe("fail");
  });

  it("rejects attempts to introduce Live in input or evaluation context", () => {
    const forgedLive = { ...buildInput(), environment: "live" };
    expect(() => evaluateInvestingRiskPolicyV1(forgedLive as never, context)).toThrow("investing_risk_policy_input_invalid");
    expect(() => evaluateInvestingRiskPolicyV1(buildInput(), { ...context, environment: "live" } as never)).toThrow(
      "investing_risk_policy_context_invalid_or_live",
    );
  });

  it("produces byte-identical replay and stable nested/output hashes", () => {
    const input = buildInput({ cash: "900", positions: [position()] });
    const first = evaluate(input);
    const second = evaluate(input);
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
    expect(first.envelopeHash).toBe(second.envelopeHash);
    expect(first.risk.assessmentHash).toBe(second.risk.assessmentHash);
    expect(first.policy.policyHash).toBe(second.policy.policyHash);
  });

  it("returns only a feasible envelope and never construction/execution output", () => {
    const result = evaluate();
    expect(result).not.toHaveProperty("targetPortfolio");
    expect(result).not.toHaveProperty("targetWeights");
    expect(result).not.toHaveProperty("quantities");
    expect(result).not.toHaveProperty("proposal");
    expect(result).not.toHaveProperty("orders");
  });
});

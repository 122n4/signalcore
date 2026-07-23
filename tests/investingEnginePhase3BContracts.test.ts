import { describe, expect, it, vi } from "vitest";

import {
  INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
  INVESTING_ENGINE_STATES_V1,
  STATIC_PILOT_INVESTING_CATALOG_VERSION,
  canonicalDecimalFromFiniteNumberBoundary,
  canonicalDecimalFromString,
  canonicalJsonStringify,
  canonicalSha256,
  createStaticPilotInstrumentCatalogAdapter,
  normalizeIsoTimestamp,
  orchestrateInvestingEngineV1,
  sealCanonicalInvestingInputV1,
  sealInstrumentCatalogSnapshotV1,
  sealMarketSnapshotV1,
  type CanonicalInstrumentCatalogSnapshotV1,
  type CanonicalInvestingInputV1,
  type InvestingConstraintEvaluationV1,
} from "@/lib/investing/engine/v1";

const d = canonicalDecimalFromString;

function buildInput(args: {
  cash?: string;
  engineVersion?: string;
  policyVersion?: string;
  modelVersion?: string;
  catalogVersion?: string;
  asOf?: string;
  quality?: "good" | "degraded" | "insufficient";
  constraints?: readonly InvestingConstraintEvaluationV1[];
  environment?: "paper" | "simulation";
} = {}): CanonicalInvestingInputV1 {
  const adapter = createStaticPilotInstrumentCatalogAdapter();
  const baseCatalog = adapter.snapshot();
  const catalogVersion = args.catalogVersion ?? baseCatalog.version;
  const catalog: CanonicalInstrumentCatalogSnapshotV1 =
    catalogVersion === baseCatalog.version
      ? baseCatalog
      : sealInstrumentCatalogSnapshotV1({
          version: catalogVersion,
          instruments: baseCatalog.instruments,
        });
  const asOf = args.asOf ?? "2026-07-20T10:00:00.000Z";
  const market = sealMarketSnapshotV1({
    contractVersion: "investing-market-snapshot/v1",
    marketSnapshotId: "market_fixture_1",
    asOf,
    schemaVersion: "market-fixture/v1",
    points: catalog.instruments.map((instrument, index) => ({
      symbol: instrument.symbol,
      price: d(String(100 + index)),
      currency: instrument.currency,
      provider: "phase3b_fixture",
      providerAsOf: asOf,
      receivedAt: asOf,
      quality: "good" as const,
    })),
    issues: [],
  });
  const cash = d(args.cash ?? "1000");
  const constraints = args.constraints ?? [
    {
      id: "paper_environment_only",
      kind: "hard" as const,
      status: "pass" as const,
      reasonCode: "paper_environment_confirmed",
      observed: null,
      limit: null,
      evidenceRefs: ["account_fixture_1"],
    },
  ];

  return sealCanonicalInvestingInputV1({
    contractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
    inputSnapshotId: "input_fixture_1",
    runId: "run_fixture_1",
    userId: "user_fixture_1",
    portfolioId: "primary",
    accountId: "account_fixture_1",
    environment: args.environment ?? "paper",
    asOf,
    versions: {
      contractVersion: INVESTING_ENGINE_INPUT_CONTRACT_VERSION,
      engineVersion: args.engineVersion ?? "engine/v1.0.0",
      policyVersion: args.policyVersion ?? "policy/v1.0.0",
      modelVersion: args.modelVersion ?? "model/v1.0.0",
      instrumentCatalogVersion: catalog.version,
      marketDataSchemaVersion: market.schemaVersion,
    },
    mandate: {
      mandateSnapshotId: "mandate_fixture_1",
      objective: "balanced",
      riskProfile: "Balanced",
      horizon: "Long",
      baseCurrency: "EUR",
      constraints,
    },
    actual: {
      stateVersion: "actual/v1",
      cash: [{ currency: "EUR", available: cash, settled: cash, reserved: d("0") }],
      positions: [],
    },
    pendingOrders: [],
    projected: {
      stateVersion: "projected/v1",
      cash: [{ currency: "EUR", available: cash, settled: cash, reserved: d("0") }],
      positions: [],
    },
    instrumentCatalog: catalog,
    market,
    quality: { status: args.quality ?? "good", issues: [] },
    confidence: { value: d("1"), basis: ["fixture_complete"] },
    warnings: [],
  });
}

describe("FASE 3B canonical contracts and determinism", () => {
  it("exposes the four required engine states", () => {
    expect(INVESTING_ENGINE_STATES_V1).toEqual(["ready", "degraded", "blocked", "no_trade"]);
  });

  it("produces byte-identical output for repeated executions", () => {
    const input = buildInput();
    const first = orchestrateInvestingEngineV1(input);
    const second = orchestrateInvestingEngineV1(input);

    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
    expect(first.outputHash).toBe(second.outputHash);
    expect(first.state).toBe("no_trade");
    expect(first.proposal).toBeNull();
  });

  it("sorts object keys while preserving semantic array order", () => {
    const left = { z: "last", nested: { b: "2", a: "1" }, sequence: ["A", "B"] };
    const same = { sequence: ["A", "B"], nested: { a: "1", b: "2" }, z: "last" };
    const reorderedArray = { sequence: ["B", "A"], nested: { a: "1", b: "2" }, z: "last" };

    expect(canonicalJsonStringify(left)).toBe(canonicalJsonStringify(same));
    expect(canonicalSha256(left)).toBe(canonicalSha256(same));
    expect(canonicalSha256(left)).not.toBe(canonicalSha256(reorderedArray));
  });

  it("normalizes equivalent decimal spellings to one canonical string", () => {
    expect(d("+001000.2500")).toBe("1000.25");
    expect(d("-0.000")).toBe("0");
    expect(canonicalSha256({ amount: d("001.2300") })).toBe(
      canonicalSha256({ amount: d("1.23") }),
    );
  });

  it("changes input and output hashes when one financial decimal changes", () => {
    const first = buildInput({ cash: "1000" });
    const second = buildInput({ cash: "1000.01" });

    expect(first.inputHash).not.toBe(second.inputHash);
    expect(orchestrateInvestingEngineV1(first).outputHash).not.toBe(
      orchestrateInvestingEngineV1(second).outputHash,
    );
  });

  it.each([
    ["engineVersion", { engineVersion: "engine/v1.0.1" }],
    ["policyVersion", { policyVersion: "policy/v1.0.1" }],
    ["modelVersion", { modelVersion: "model/v1.0.1" }],
    ["instrumentCatalogVersion", { catalogVersion: "static-pilot-investing-catalog/v1.0.1" }],
  ])("changes hashes when %s changes", (_field, override) => {
    const baseline = buildInput();
    const changed = buildInput(override);

    expect(changed.inputHash).not.toBe(baseline.inputHash);
    expect(orchestrateInvestingEngineV1(changed).outputHash).not.toBe(
      orchestrateInvestingEngineV1(baseline).outputHash,
    );
  });

  it.each([
    "2026-07-20",
    "2026-07-20T10:00:00",
    "2026-02-30T10:00:00Z",
    "20/07/2026 10:00",
  ])("rejects invalid or ambiguous timestamp %s", (timestamp) => {
    expect(() => normalizeIsoTimestamp(timestamp)).toThrow("canonical_timestamp_invalid_or_ambiguous");
    expect(() => buildInput({ asOf: timestamp })).toThrow();
  });

  it("normalizes explicit timezone timestamps without consulting the clock", () => {
    expect(normalizeIsoTimestamp("2026-07-20T12:00:00+02:00")).toBe("2026-07-20T10:00:00.000Z");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite number %s",
    (value) => {
      expect(() => canonicalSha256({ value })).toThrow("canonical_non_finite_number");
      expect(() => canonicalDecimalFromFiniteNumberBoundary(value)).toThrow(
        "canonical_decimal_finite_number_required",
      );
    },
  );

  it("rejects raw financial numbers and accepts the single explicit number boundary", () => {
    const input = buildInput();
    const raw = {
      ...input,
      actual: {
        ...input.actual,
        cash: [{ ...input.actual.cash[0], available: 1000 }],
      },
    };

    expect(() => canonicalSha256(raw)).toThrow("canonical_number_not_allowed_use_decimal_string");
    expect(canonicalDecimalFromFiniteNumberBoundary(1000.25)).toBe("1000.25");
    expect(canonicalDecimalFromFiniteNumberBoundary(1e-7)).toBe("0.0000001");
  });

  it("rejects undefined canonical values and requires asOf", () => {
    expect(() => canonicalSha256({ amount: undefined })).toThrow("canonical_undefined_not_allowed");
    const input = buildInput();
    const { inputHash: _inputHash, asOf: _asOf, ...missingAsOf } = input;
    void _inputHash;
    void _asOf;
    expect(() => sealCanonicalInvestingInputV1(missingAsOf as never)).toThrow(
      "canonical_timestamp_string_required",
    );
  });

  it("blocks hard fail/unknown and degrades soft fail without an operational proposal", () => {
    const hard = (status: "fail" | "unknown"): InvestingConstraintEvaluationV1 => ({
      id: `hard_${status}`,
      kind: "hard",
      status,
      reasonCode: `hard_${status}`,
      observed: null,
      limit: null,
      evidenceRefs: [],
    });
    const soft: InvestingConstraintEvaluationV1 = {
      ...hard("fail"),
      id: "soft_fail",
      kind: "soft",
      reasonCode: "soft_fail",
    };

    expect(orchestrateInvestingEngineV1(buildInput({ constraints: [hard("fail")] })).state).toBe("blocked");
    expect(orchestrateInvestingEngineV1(buildInput({ constraints: [hard("unknown")] })).state).toBe("blocked");
    const degraded = orchestrateInvestingEngineV1(buildInput({ constraints: [soft] }));
    expect(degraded.state).toBe("degraded");
    expect(degraded.proposal).toBeNull();
  });

  it("rejects Live as an executable environment", () => {
    const input = buildInput();
    const liveDraft = {
      ...input,
      environment: "live",
    };
    const { inputHash: _inputHash, ...draft } = liveDraft;
    void _inputHash;

    expect(() => sealCanonicalInvestingInputV1(draft as never)).toThrow(
      "investing_input_environment_invalid",
    );
  });

  it("does not call fetch or mutate the frozen input/output", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const input = buildInput();
    const result = orchestrateInvestingEngineV1(input);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => ((result as { state: string }).state = "ready")).toThrow();
  });

  it("keeps the pilot catalog version and hash stable", () => {
    const first = createStaticPilotInstrumentCatalogAdapter().snapshot();
    const second = createStaticPilotInstrumentCatalogAdapter().snapshot();

    expect(first.version).toBe(STATIC_PILOT_INVESTING_CATALOG_VERSION);
    expect(first.catalogHash).toBe(second.catalogHash);
    expect(first.instruments.map((instrument) => instrument.symbol)).toEqual(["VWCE", "SPY", "AGGH", "GLD"]);
  });

  it("rejects duplicate and invalid catalog symbols", () => {
    const base = createStaticPilotInstrumentCatalogAdapter().snapshot();
    expect(() =>
      sealInstrumentCatalogSnapshotV1({
        version: "duplicate-test/v1",
        instruments: [base.instruments[0]!, base.instruments[0]!],
      }),
    ).toThrow("investing_catalog_duplicate_symbol");
    expect(() =>
      sealInstrumentCatalogSnapshotV1({
        version: "invalid-test/v1",
        instruments: [{ ...base.instruments[0]!, instrumentId: "bad_symbol", symbol: "bad symbol" }],
      }),
    ).toThrow("investing_instrument_symbol_invalid");
  });
});

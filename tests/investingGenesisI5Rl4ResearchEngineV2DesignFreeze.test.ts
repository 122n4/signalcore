import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const rl4ContractPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "I5_RL4_RESEARCH_ENGINE_V2_DESIGN_FREEZE_V1.md",
);
const v1EngineContractPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "I5_RESEARCH_EXECUTION_ENGINE_CONTRACT_V1.md",
);

const rl4 = fs.readFileSync(rl4ContractPath, "utf8");
const v1Engine = fs.readFileSync(v1EngineContractPath, "utf8");

function expectAll(source: string, values: readonly string[]): void {
  for (const value of values) {
    expect(source).toContain(value);
  }
}

function expectAllNormalized(source: string, values: readonly string[]): void {
  const normalized = source.replace(/\s+/gu, " ");
  for (const value of values) {
    expect(normalized).toContain(value);
  }
}

describe("I5 RL-4 Research Engine V2 design freeze", () => {
  it("is a candidate-only design freeze with no production or acceptance claim", () => {
    expect(rl4.startsWith("CANDIDATE / RL-4_RESEARCH_ENGINE_V2_DESIGN_FREEZE / UNNUMBERED")).toBe(true);
    expectAll(rl4, [
      "Canonical predecessor:\n`ff464e51444e438c2ae90c4bd17cfa08b7fdb3ab`",
      "Production mutation:\n`NONE / FORBIDDEN BY THIS SLICE`",
    ]);
    expectAllNormalized(rl4, [
      "does not implement runtime behavior",
      "does not add persistence",
      "does not create a migration",
      "does not apply anything to Supabase",
      "does not declare RL-4 accepted",
    ]);
    expect(rl4).not.toContain("CURRENT_ACCEPTED / RL-4");
    expect(rl4).not.toContain("RL-4 = CURRENT_ACCEPTED");
  });

  it("freezes constitutional boundaries and the V2 engine identity", () => {
    expectAll(rl4, [
      "CORE != LAB",
      "LAB != PAPER",
      "INVESTING != TRADING",
      "runType = HISTORICAL_BACKTEST",
      "researchEnvironment = HISTORICAL_BACKTEST",
      "researchSourceContext = PURE_RESEARCH",
      "operation_scope = TENANT_SCOPE",
      "accountResearchContext = ABSENT",
      "frequency = DAILY",
      "exchange/calendar family = XNYS",
      "valuation currency = USD",
      "long only",
      "no leverage",
      "engineId = HISTORICAL_EXECUTION_ADAPTER",
      "engineVersion = ENGINE_V20260926",
      "executionModelClass = NEXT_SESSION_ADJUSTED_OHLCV_RESEARCH_V2",
    ]);
    expectAll(rl4, ["latest", "current", "default", "stable", "active", "production"]);
  });

  it("preserves the accepted V1 engine tokens without changing historical V1 semantics", () => {
    const v1ContractTokens = [
      "ENGINE_V20260918",
      "CLOSE_TO_CLOSE_V1",
      "COSTS_ZERO_RESEARCH_V1",
      "SLIPPAGE_ZERO_RESEARCH_V1",
    ] as const;
    const rl4PreservedV1Tokens = [
      ...v1ContractTokens,
      "SYNTHETIC_ADJUSTED_CLOSE_RESEARCH_V1",
      "XNYS_TRADING_CALENDAR_V1",
      "EXACT_XNYS_SESSION_BOUNDARIES_V1",
    ] as const;

    expectAll(v1Engine, v1ContractTokens);
    expectAll(rl4, rl4PreservedV1Tokens);
    expectAll(rl4, [
      "RL-4 does not modify Historical Execution Engine V1.",
      "RL-5 must prove V1 scientific goldens are byte-identical.",
      "V1 validation remains byte-identical.",
    ]);
    expectAllNormalized(rl4, ["V1 remains max scale 16 and byte-identical."]);
  });

  it("does not introduce V2 hash domains and keeps owner-payload shape changes gated", () => {
    expectAll(rl4, [
      "RL-4 does not create new V2 hash domains merely for version naming.",
      "SYNTRAKE:RESEARCH_IR:V1",
      "SYNTRAKE:DATASET_SERIES:V1",
      "SYNTRAKE:DATASET_SNAPSHOT:V1",
      "SYNTRAKE:EXECUTION_CONFIG:V1",
      "SYNTRAKE:RUN_INPUT:V1",
      "SYNTRAKE:RESULT:V1",
      "SYNTRAKE:VALIDATION_PROTOCOL:V1",
      "SYNTRAKE:VALIDATION_RUN_INPUT:V1",
      "SYNTRAKE:VALIDATION_CHILD_RESULT:V1",
      "SYNTRAKE:EVIDENCE_OBJECT:V1",
      "RESEARCH_EXECUTION_EVIDENCE_V1",
      "EVIDENCE_CONTENT_DESCRIPTOR_V1",
      "RESEARCH_EXECUTION_EVIDENCE",
      "CANONICAL_JSON_UTF8_V1",
      "Result",
      "-> Evidence",
      "-> SUCCEEDED",
      "Evidence.engineVersion",
      "ENGINE_V20260926",
      "RESEARCH_PASSPORT_V1",
    ]);
    expectAllNormalized(rl4, [
      "Existing domains must not be version-bumped casually:",
      "If owner-payload shape must change, STOP",
      "A successful Research Execution cannot commit `SUCCEEDED` without Evidence.",
      "No new Evidence hash domain is required.",
      "Schema-version labels describe payload shape, not engine generation.",
      "must match both RunInput and Result exactly.",
    ]);
    expect(rl4).not.toContain("SYNTRAKE:RESULT:V2");
    expect(rl4).not.toContain("SYNTRAKE:VALIDATION_RESULT:V2");
    expect(rl4).not.toContain("SYNTRAKE:EVIDENCE_OBJECT:V2");
    expect(rl4).not.toContain("SYNTRAKE:RESEARCH_IR:V2");
    expect(rl4).not.toContain("SYNTRAKE:RUN_INPUT:V2");
    expect(rl4).not.toContain("SYNTRAKE:DATASET_SNAPSHOT:V2");
    expect(rl4).not.toContain("SYNTRAKE:METRIC_REQUEST_SET:V2");
    expect(rl4).not.toContain("SYNTRAKE:EXECUTION_CONFIG:V2");
  });

  it("freezes the complete Engine V2 RunInput scientific envelope", () => {
    expectAll(rl4, [
      "deterministicSeed = ABSENT",
      "UNSUPPORTED_V2_DETERMINISTIC_SEED",
      "EXACT_V2_MATERIAL_POLICY_SET",
      "DATASET_SNAPSHOT",
      "DATASET_SNAPSHOT_POLICY_V1",
      "EXECUTION_CONFIG",
      "EXECUTION_CONFIG_HASH_PAYLOAD_V1",
      "UNSUPPORTED_V2_MATERIAL_POLICIES",
      "DATASET_SNAPSHOT_HASH_PAYLOAD_V1",
      "METRIC_REQUEST_SET_HASH_PAYLOAD_V1",
      "METRIC_REGISTRY_V20260918",
      "TOTAL_RETURN / METRIC_V1",
      "MAX_DRAWDOWN / METRIC_V1",
      "UNSUPPORTED_V2_METRIC_REQUEST_SET",
      "RUN_INPUT_HASH_PAYLOAD_V1",
      "runType =",
      "HISTORICAL_BACKTEST",
      "researchSourceContext =",
      "PURE_RESEARCH",
      "accountResearchContext =",
      "ABSENT",
      "engineVersion =",
      "ENGINE_V20260926",
      "materialPolicies =",
      "researchSpec =",
      "SYNTRAKE:RESEARCH_SPEC:V1",
      "researchIr =",
      "SYNTRAKE:RESEARCH_IR:V1",
      "experiment =",
      "SYNTRAKE:EXPERIMENT:V1",
      "datasetSnapshot =",
      "SYNTRAKE:DATASET_SNAPSHOT:V1",
      "metricRequestSet =",
      "SYNTRAKE:METRIC_REQUEST_SET:V1",
      "executionConfig =",
      "SYNTRAKE:EXECUTION_CONFIG:V1",
      "RunInput.researchIr",
      "Experiment.researchIr",
      "RunInput.engineVersion",
      "ExecutionConfig.engineCompatibilityVersion",
      "RunInput.metricRegistryVersion",
      "MetricRequestSet.metricRegistryVersion",
    ]);
    expectAllNormalized(rl4, [
      "For `ENGINE_V20260926`, a RunInput containing `deterministicSeed` is not admitted.",
      "Allowing an arbitrary unused seed would create multiple scientific RunInput identities for identical deterministic behavior.",
      "materialPolicies = exactly:",
      "No additional material policy is admitted for `ENGINE_V20260926`.",
      "Missing, extra, duplicate, or differently-versioned material policies fail closed:",
      "V2 calendar identity remains bound by DatasetSeries and ExecutionConfig.",
      "No other snapshot policy is admitted by RL-4.",
      "Every exact DatasetSeries HashRef used by the V2 run must belong to the exact DatasetSnapshot.",
      "No new DatasetSnapshot hash domain is introduced.",
      "with exactly these two requests:",
      "No additional metric request is admitted for the RL-5 Engine V2 closure.",
      "No missing metric is admitted.",
      "RL-4 must not pre-authorize them.",
      "DatasetSnapshot exact membership must equal the proven DatasetSeries set.",
      "No mix-and-match scientific components are admitted.",
      "Same V2 scientific inputs must produce the same RunInput hash; unused identity-only variation cannot create an alternate admitted V2 RunInput.",
    ]);
  });

  it("freezes the V2 data contract, field registry, transforms, and strict missing behavior", () => {
    expectAll(rl4, [
      "ADJUSTED_OPEN",
      "ADJUSTED_HIGH",
      "ADJUSTED_LOW",
      "ADJUSTED_CLOSE",
      "VOLUME",
      "OBSERVATION_DATE",
      "HIGH >= OPEN",
      "HIGH >= CLOSE",
      "LOW <= OPEN",
      "LOW <= CLOSE",
      "HIGH >= LOW",
      "corporateActionPolicy = SYNTHETIC_ADJUSTED_OHLC_PROVIDER_V2",
      "I5_RL4_RESEARCH_IR_FIELD_CONTRACT_V2",
      "The initial ENGINE_V20260926 executable signal registry contains exactly:",
      "I5A_RESEARCH_IR_FIELD_CONTRACT_V1",
      "SYNTRAKE:RESEARCH_IR:V1",
      "UNSUPPORTED_V2_FIELD_VERSION",
      "POINT_IN_TIME_REPORTED_SESSION_VOLUME_V2",
      "VOLUME material is NOT admissible for Engine V2 signal evaluation",
      "VOLUME_POINT_IN_TIME_PROVENANCE_UNAVAILABLE",
      "TOTAL_RETURN(t) = ADJUSTED_CLOSE(t) / ADJUSTED_CLOSE(previous eligible XNYS session) - 1",
      "OPEN_TO_CLOSE_RETURN(t) = ADJUSTED_CLOSE(t) / ADJUSTED_OPEN(t) - 1",
      "INTRADAY_RANGE_RATIO(t) = (ADJUSTED_HIGH(t) - ADJUSTED_LOW(t)) / ADJUSTED_CLOSE(t)",
      "SMA_N(t) = arithmetic mean of ADJUSTED_CLOSE over t and prior N-1 eligible XNYS sessions",
      "ROLLING_HIGH_20(t) = max ADJUSTED_HIGH across t and prior 19 eligible sessions",
      "ROLLING_LOW_20(t) = min ADJUSTED_LOW across t and prior 19 eligible sessions",
      "missingDataPolicy = MISSING_DATA_STRICT_RESEARCH_V2",
      "MISSING_REQUIRED_EXECUTION_OPEN",
      "MISSING_REQUIRED_VALUATION_CLOSE",
      "MISSING_REQUIRED_BENCHMARK_CLOSE",
      "OHLC_INVARIANT_VIOLATION",
      "UNSUPPORTED_V2_FIELD",
      "UNSUPPORTED_V2_FIELD_VERSION",
      "NUMERIC_INVARIANT_VIOLATION",
      "ACCOUNTING_INVARIANT_VIOLATION",
      "Substituting CLOSE for a missing OPEN is forbidden.",
    ]);
    expectAllNormalized(rl4, [
      "No other Engine V2 signal field is admitted by RL-4.",
      "Adding another field ID or field methodology requires a separately reviewed contract/version change.",
      "Raw market data fields remain verified market-data/execution/valuation/transform inputs and are not direct unrestricted V2 Research IR signal fields:",
      "ENGINE_V20260918 accepts only the historical V1 executable field contract:",
      "ENGINE_V20260926 accepts only:",
      "Engine V2 must reject a V1 fieldVersion even where the fieldId has the same textual name.",
      "This ensures V2 methodology, V2 calendar semantics, V2 material semantics, and V2 field semantics cannot be silently mixed with V1.",
      "A V2 Experiment must bind the exact V2 Research IR hash.",
      "not retroactively adjusted using a corporate action whose effective date is after the observation session",
      "Do not silently substitute adjusted volume.",
      "Do not reverse-engineer volume from prices.",
      "Do not use future split information.",
      "A Research IR requiring VOLUME while no admissible V2 VOLUME series exists must fail closed.",
    ]);
    expect(rl4).not.toContain("The V2 executable signal registry contains at least:");
  });

  it("freezes next-session fills, costs, slippage, exact arithmetic, accounting, and benchmark policy", () => {
    expectAll(rl4, [
      "fillPolicy = NEXT_SESSION_OPEN_V1",
      "pre_trade_open_nav",
      "cash_before_trading",
      "sum(current_quantity * reference_open)",
      "reference_price = verified ADJUSTED_OPEN",
      "effective_buy_price",
      "= reference_price * (1 + slippage_bps / 10000)",
      "effective_sell_price",
      "= reference_price * (1 - slippage_bps / 10000)",
      "gross_fill_notional",
      "= quantity * effective_fill_price",
      "explicit_fee",
      "= gross_fill_notional * fee_bps / 10000",
      "SELL:",
      "cash_after",
      "= cash_before",
      "  + gross_fill_notional",
      "  - explicit_fee",
      "BUY:",
      "  - gross_fill_notional",
      "post_quantity = pre_quantity - fill_quantity",
      "post_quantity = pre_quantity + fill_quantity",
      "slippage_cost",
      "abs(quantity * (effective_fill_price - reference_price))",
      "Slippage MUST NOT be debited from cash separately",
      "Explicit fee is debited exactly once.",
      "load verified OPEN required for pre-trade state and target map",
      "calculate common pre-trade OPEN NAV",
      "derive complete sell/reduction set",
      "mutate cash exactly",
      "freeze available post-sell cash",
      "calculate desired buy requirements using effective BUY prices + fees",
      "derive final truncated BUY quantities",
      "assert cash >= 0 and accounting invariants",
      "value at verified CLOSE",
      "create next-session OPEN intent when applicable",
      "COMMISSION_FEES_ZERO_V1",
      "COMMISSION_FEES_NOTIONAL_25_BPS_V1",
      "explicit_fee = gross_fill_notional * fee_bps / 10000",
      "SLIPPAGE_ZERO_RESEARCH_V1",
      "SLIPPAGE_SPREAD_ADVERSE_50_BPS_V1",
      "BUY effective_fill_price = reference_open * (1 + s_bps / 10000)",
      "SELL effective_fill_price = reference_open * (1 - s_bps / 10000)",
      "RESEARCH_MONEY_INTERNAL_V2",
      "max scale = 24",
      "RESEARCH_RATIO_OUTPUT_V1",
      "ROUND_HALF_EVEN",
      "desired_target_quantity = truncate_toward_zero(desired_target_notional / reference_open, 8 decimals)",
      "lambda = available_cash / total_desired_buy_requirement",
      "RESEARCH_EXACT_RATIONAL_TRACE_V1",
      "numerator",
      "denominator",
      "gcd(abs(numerator), denominator) = 1",
      "denominator > 0",
      "denominator = \"1\"",
      "decimal approximation = forbidden",
      "scaleFactor:",
      "NAV = cash + sum(position_quantity * valuation_close)",
      "BENCHMARK_NORMALIZED_ADJUSTED_CLOSE_V2",
      "benchmark_value(D0) = starting_capital",
      "benchmark_value(t) = starting_capital * ADJUSTED_CLOSE(t) / ADJUSTED_CLOSE(D0)",
    ]);
    expectAllNormalized(rl4, [
      "Missing OPEN required to calculate pre-trade NAV for any currently held position fails closed.",
      "Missing OPEN required for any instrument whose target/order must be calculated fails closed.",
      "No CLOSE substitution is allowed.",
      "The exact rational `lambda` used to derive final quantities must be the exact same rational serialized into the trace.",
      "Do not serialize only a rounded 18-decimal approximation.",
      "`RESEARCH_RATIO_OUTPUT_V1` remains appropriate for metric/ratio output where its accepted rounding semantics apply, but not for exact buying-power control evidence.",
    ]);
  });

  it("freezes exact V2 money output serialization without changing V1 money", () => {
    expectAll(rl4, [
      "RESEARCH_MONEY_OUTPUT_V2",
      "input = exact finite decimal/rational that is mathematically representable",
      "output = exact canonical decimal string",
      "max scale = 24",
      "rounding = NONE",
      "trailing fractional zeros = removed canonically",
      "negative zero = forbidden",
      "exponent notation = forbidden",
      "locale formatting = forbidden",
      "NUMERIC_INVARIANT_VIOLATION",
      "Result startingNav",
      "Result endingNav",
      "Result terminalCash",
      "valuation cash",
      "valuation marketValue",
      "valuation NAV",
      "valuation cumulativeExplicitFees",
      "valuation cumulativeSlippageCost",
      "fill referencePrice",
      "fill effectiveFillPrice",
      "fill grossFillNotional",
      "fill explicitFee",
      "fill slippageCost",
      "fill cashBefore",
      "fill cashAfter",
      "max scale = 8",
      "TOWARD_ZERO",
      "RESEARCH_RATIO_OUTPUT_V1",
      "ROUND_HALF_EVEN",
    ]);
    expectAllNormalized(rl4, [
      "If an economic value would require more than scale 24:",
      "The engine must not silently round it.",
      "V1 money remains unchanged at its historical V1 semantics.",
    ]);
  });

  it("keeps USD/XNYS scope, result/validation compatibility, persistence gating, and no arbitrary code", () => {
    expectAll(rl4, [
      "fxPolicy = FX_USD_IDENTITY_V1",
      "valuationCurrency = USD",
      "startingCapital.currency = USD",
      "datasetSeries.calendar = XNYS_TRADING_CALENDAR_V2",
      "frequency = DAILY",
      "timezone = America/New_York",
      "calendar = XNYS_TRADING_CALENDAR_V2",
      "calendarSessionPolicy = XNYS_OPEN_CLOSE_SESSION_V2",
      "boundaryPolicy = EXACT_XNYS_SESSION_BOUNDARIES_V2",
      "valuationPolicy =",
      "USD_ADJUSTED_CLOSE_MARK_V2",
      "engineCompatibilityVersion =",
      "ENGINE_V20260926",
      "schemaVersion =",
      "EXECUTION_CONFIG_HASH_PAYLOAD_V1",
      "CLOSED_COST_POLICY_SET_V2",
      "CLOSED_SLIPPAGE_POLICY_SET_V2",
      "UNSUPPORTED_EXECUTION_CONFIG",
      "COMMISSION_FEES_ZERO_V1 -> 0 bps",
      "COMMISSION_FEES_NOTIONAL_25_BPS_V1 -> 25 bps",
      "SLIPPAGE_ZERO_RESEARCH_V1 -> 0 bps",
      "SLIPPAGE_SPREAD_ADVERSE_50_BPS_V1 -> 50 bps",
      "XNYS_TRADING_CALENDAR_V2",
      "EXACT_XNYS_SESSION_BOUNDARIES_V1",
      "leave `XNYS_TRADING_CALENDAR_V1` untouched",
      "artifact/version identity",
      "coverageStart",
      "coverageEnd",
      "ordered exact session set",
      "content SHA-256",
      "generator version",
      "source library versions",
      "independent cross-check evidence",
      "V2 session membership/order",
      "V1 session membership/order",
      "RESEARCH_EXECUTION_TRACE_V2",
      "RESEARCH_VALUATION_SERIES_V2",
      "RESEARCH_BENCHMARK_SERIES_V2",
      "METRIC_REGISTRY_V20260918",
      "TOTAL_RETURN / METRIC_V1",
      "MAX_DRAWDOWN / METRIC_V1",
      "METRIC_RESULT_SET_V1",
      "Current PostgreSQL persistence constraints admit only `ENGINE_V20260918`.",
      "RL-5 REQUIRES an additive PostgreSQL migration",
      "investing.research_execution_runs",
      "investing.research_results_scientific_identities",
      "investing.research_validation_run_inputs_scientific_identities",
      "investing.research_validation_execution_runs",
      "investing.research_validation_child_results_scientific_identities",
      "ENGINE_V20260926",
      "HISTORICAL_EXECUTION_ADAPTER",
      "arbitrary JavaScript",
      "TypeScript",
      "Python",
      "SQL",
      "WASM",
      "shell",
      "eval",
      "dynamic imports",
      "untrusted callbacks",
      "arbitrary indicator code",
    ]);
    expectAllNormalized(rl4, [
      "Engine V2 validation must not derive folds/session boundaries using V1 calendar helpers or artifacts.",
      "Any overlap drift requires STOP and independent review.",
      "No validation payload shape change is required merely for this because `boundaryPolicy` is already part of the existing scientific owner payload.",
      "No other ExecutionConfig token combination is admitted for `ENGINE_V20260926`.",
      "portfolio valuation occurs at verified V2 ADJUSTED_CLOSE for the exact admitted XNYS_TRADING_CALENDAR_V2 session using RESEARCH_MONEY_OUTPUT_V2",
      "RL-5 must not bypass these constraints or persist V2 using false V1 engine metadata.",
      "The future additive migration must widen exact admissible engine versions to the closed set:",
      "No UPDATE of historical scientific rows is allowed.",
      "No migration-history repair is allowed.",
      "No Production application is authorized by RL-4.",
      "RL-5 migration rehearsal/application remains a separate gate.",
      "arbitrary optimizer code",
    ]);
    expect(rl4).not.toContain("may need an additive migration");
  });

  it("keeps RL-4 out-of-scope boundaries and records the RL-5 implementation bar", () => {
    expectAll(rl4, [
      "shorting",
      "leverage",
      "derivatives",
      "intraday bars",
      "order books",
      "real broker",
      "Paper",
      "Live",
      "Metric Registry V2",
      "Blind Truth",
      "product API",
      "UI",
      "V1 golden preservation",
      "V2 golden fixtures",
      "lag/rolling no-lookahead",
      "next-session open fill",
      "buying-power scaling",
      "repeated-run byte-identical outputs",
      "V2 validation execution",
      "V1/V2 coexistence",
      "PG17 when persistence changes",
      "real investing_app authority when persistence changes",
      "V2 Evidence deterministic construction",
      "V2 successful Run requires Evidence before SUCCEEDED",
      "V2 Passport Run/Result/Evidence reconstruction",
      "point-in-time VOLUME provenance rejection",
      "exact rational buying-power lambda trace encoding",
      "complete ExecutionConfig V2 admission matrix",
      "V1 fieldVersion rejected by Engine V2",
      "V2 fieldVersion rejected by Engine V1",
      "V2 Result -> V2 Evidence = PASS",
      "V2 Evidence deterministic hash = PASS",
      "V2 SUCCEEDED without Evidence = IMPOSSIBLE",
      "V1 Evidence bytes/hash unchanged = PASS",
      "Research Passport reconstructs V2 Run/Result/Evidence = PASS",
      "V2 RunInput deterministicSeed absent",
      "V2 exact materialPolicies admitted",
      "missing/extra/wrong material policy rejected",
      "V2 DatasetSnapshot policy exact",
      "V2 MetricRequestSet exactly TOTAL_RETURN + MAX_DRAWDOWN",
      "extra metric rejected before RL-6",
      "missing metric rejected before RL-6",
      "cross-object V2 RunInput identity bindings proven",
      "same V2 scientific inputs produce same RunInput hash",
      "unused identity-only variation cannot create alternate admitted V2 RunInput",
    ]);
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashDomainStateV1 } from "../lib/investing/research";

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function squish(source: string): string {
  return source.replace(/\s+/gu, " ").trim();
}

const engine = () => read("docs/investing-genesis/I5_RESEARCH_EXECUTION_ENGINE_CONTRACT_V1.md");
const fields = () => read("docs/investing-genesis/I5_RESEARCH_EXECUTABLE_FIELD_SEMANTICS_V1.md");
const metrics = () => read("docs/investing-genesis/I5_RESEARCH_METRIC_REGISTRY_V1.md");
const state = () => read("docs/investing-genesis/CANONICAL_CURRENT_STATE.md");

describe("I5 Research execution engine contract freeze", () => {
  it("records candidate-only contract status without assigning acceptance or an A-number", () => {
    for (const source of [engine(), fields(), metrics()]) {
      expect(source).toContain("Status: CANDIDATE DESIGN CONTRACT - NOT CURRENT_ACCEPTED");
      expect(source).toContain("Classification: DESIGN CANDIDATE / NOT CURRENT_ACCEPTED");
      expect(source).toContain("Permanent A-number: NOT ASSIGNED");
      expect(source).not.toContain("Status: CURRENT ACCEPTED");
      expect(source).not.toContain("Classification: CURRENT_ACCEPTED");
    }

    expect(state()).toContain("I5 Research Execution Engine = DESIGN CANDIDATE / NOT CURRENT_ACCEPTED");
    expect(state()).toContain("Run execution lifecycle, Result and Evidence are not established");
  });

  it("freezes the PURE_RESEARCH HISTORICAL_BACKTEST-only V1 profile and current engine tokens", () => {
    const source = engine();

    expect(source).toContain("runType = HISTORICAL_BACKTEST");
    expect(source).toContain("researchEnvironment = HISTORICAL_BACKTEST");
    expect(source).toContain("researchSourceContext = PURE_RESEARCH");
    expect(source).toContain("operation_scope = TENANT_SCOPE");
    expect(source).toContain("accountResearchContext = ABSENT");
    expect(source).toContain("engineId = HISTORICAL_EXECUTION_ADAPTER");
    expect(source).toContain("engineVersion = ENGINE_V20260918");
    expect(source).toContain("No broader context is admitted");
  });

  it("pins deterministic kernel prohibitions and no-JS-number scientific arithmetic", () => {
    const source = engine();
    const compact = squish(source);

    for (const forbidden of ["Date.now()", "new Date() as execution truth", "Math.random()", "crypto.random*", "fetch()", "DB client", "process.env"]) {
      expect(source).toContain(forbidden);
    }

    expect(source).toContain("Scientific engine arithmetic must not use JavaScript `number`");
    expect(source).toContain("no exponent notation");
    expect(source).toContain("`-0` is forbidden");
    expect(source).toContain("RESEARCH_FRACTIONAL_QUANTITY_V1");
    expect(source).toContain("RESEARCH_EXACT_DECIMAL_RATIONAL_V1");
    expect(source).toContain("This behavior is owned by:");
    expect(source).toContain("ENGINE_V20260918");
    expect(source).toContain("coefficient: BigInt");
    expect(source).toContain("scale: non-negative integer");
    expect(source).toContain("No IEEE-754 floating-point representation may participate");
    expect(compact).toContain("division results are represented internally as an exact reduced rational");
    expect(source).toContain("The rational is reduced by GCD");
    expect(source).toContain("must not round a signal field before evaluating a predicate or rank");
    expect(source).toContain("max scale = 8");
    expect(source).toContain("rounding = TOWARD_ZERO");
  });

  it("freezes executable field methodology for TOTAL_RETURN and MOMENTUM_12M", () => {
    const source = fields();

    expect(source).toContain("previous_session(t)");
    expect(source).toContain("the immediately preceding eligible session in XNYS_TRADING_CALENDAR_V1");
    expect(source).toContain("ADJUSTED_CLOSE(t) / ADJUSTED_CLOSE(previous_session(t)) - 1");
    expect(source).toContain("`previous_session(t) < t`");
    expect(source).toContain("the exact `ADJUSTED_CLOSE` observation for `previous_session(t)` must exist");
    expect(source).toContain("if that exact observation is missing, `TOTAL_RETURN(t) = MISSING`");
    expect(source).toContain("do not search farther backward");
    expect(source).toContain("do not bridge the gap");
    expect(source).toContain("do not substitute the previous available observation");
    expect(source).toContain("the first eligible session for which no prior required calendar observation");
    expect(source).toContain("deterministic decimal arithmetic, never JS binary floating");
    expect(source).toContain("ADJUSTED_CLOSE(t) / ADJUSTED_CLOSE(anchor(t)) - 1");
    expect(source).toContain("anchor_target_date = t minus 12 calendar months");
    expect(source).toContain("clamp to final valid day of target month");
    expect(source).toContain("latest eligible session on or before anchor_target_date");
    expect(source).toContain("do not skip arbitrarily farther backwards");
    expect(source).toContain("MOMENTUM_12M != 12-1 momentum");
  });

  it("freezes close event ordering and forbids same-close lookahead fills", () => {
    const source = engine();
    const compact = squish(source);

    expect(source).toContain("1. resolve any target intent created on an earlier session");
    expect(source).toContain("2. execute that pending intent using D execution-close material");
    expect(source).toContain("5. value the portfolio at D close");
    expect(source).toContain("6. publish D close observation as newly available information");
    expect(source).toContain("8. evaluate Research IR using information available through D");
    expect(source).toContain("9. if D is a rebalance signal session, create target intent for next eligible session");
    expect(source).toContain("Information observed at close `D` cannot generate a fill at close `D`");
    expect(compact).toContain("A signal formed from close `D` may first fill at the next eligible session close");
  });

  it("pins deterministic pipeline, tie-break, missing-data, and policy semantics", () => {
    const source = engine();
    const compact = squish(source);

    expect(source).toContain("missingDataPolicy = MISSING_DATA_EXCLUDE_V1");
    expect(source).toContain("costsPolicy = COSTS_ZERO_RESEARCH_V1");
    expect(source).toContain("slippagePolicy = SLIPPAGE_ZERO_RESEARCH_V1");
    expect(source).toContain("corporateActionPolicy = ADJUSTED_PRICE_PROVIDER_V1");
    expect(source).toContain("canonical instrumentId ASCII/UTF-8 byte lexical order");
    expect(source).toContain("predicate result = not eligible");
    expect(source).toContain("MISSING_REQUIRED_EXECUTION_PRICE");
    expect(source).toContain("MISSING_REQUIRED_VALUATION_PRICE");
    expect(source).toContain("must not silently forward-fill a held position's valuation");
    expect(compact).toContain("must not independently book dividends, splits, or distributions");
  });

  it("freezes accounting invariants and close-to-close fill model", () => {
    const source = engine();
    const compact = squish(source);

    expect(source).toContain("NAV = cash + sum(position_quantity * valuation_price)");
    expect(source).toContain("cash_before + market_value_before");
    expect(source).toContain("cash_after + market_value_after");
    expect(source).toContain("no negative cash");
    expect(source).toContain("no negative position quantity");
    expect(source).toContain("target_quantity");
    expect(source).toContain("truncate_toward_zero");
    expect(source).toContain("8 decimal places");
    expect(source).toContain("fill_notional = quantity * price");
    expect(source).toContain("max scale = 16");
    expect(compact).toContain("Do not round cash or strategy NAV after each event beyond canonical normalization");
    expect(compact).toContain("no hidden leverage");
    expect(compact).toContain("no value created by rebalance");
    expect(source).toContain("CLOSE_TO_CLOSE_V1` is a synthetic Research Lab execution model");
    expect(source).toContain("execute reductions/sells");
    expect(compact).toContain("execute increases/buys");
    expect(source).toContain("`TOWARD_ZERO` rounding");
  });

  it("freezes Result manifest artifact split and Run is not Result", () => {
    const source = engine();
    const compact = squish(source);

    expect(source).toContain("RESEARCH_EXECUTION_TRACE_V1");
    expect(source).toContain("RESEARCH_VALUATION_SERIES_V1");
    expect(source).toContain("METRIC_RESULT_SET_V1");
    expect(source).toContain("RESULT_HASH_PAYLOAD_V1");
    expect(source).toContain("contentSha256");
    expect(source).toContain("contentByteLength");
    expect(source).toContain("recordCount");
    expect(source).toContain("Deterministic kernel");
    expect(source).toContain("-> ExecutionTrace artifact");
    expect(source).toContain("-> ValuationSeries artifact");
    expect(source).toContain("-> Metric engine consumes ValuationSeries truth");
    expect(source).toContain("-> MetricResultSet artifact");
    expect(source).toContain("-> Result manifest binds all artifact descriptors");
    expect(source).toContain("-> future Result hash");
    expect(compact).toContain("metric computation does not require an already-created Result hash");
    expect(source).toContain("Candidate `ResultHashPayloadV1` is a compact manifest binding");
    expect(source).toContain("`Run` is operational execution-attempt identity and lifecycle");
    expect(compact).toContain("`Result` is deterministic scientific output identity");
    expect(compact).toContain("must not include worker ID, queue ID, host, PID, timestamps, or attempt UUID");
  });

  it("pins metric formulas and keeps metrics downstream of deterministic Result truth", () => {
    const source = metrics();
    const compact = squish(source);

    expect(source).toContain("TOTAL_RETURN / METRIC_V1");
    expect(source).toContain("MAX_DRAWDOWN / METRIC_V1");
    expect(source).toContain("Metric calculations use exact rational arithmetic");
    expect(source).toContain("must not consume previously rounded ratio intermediates");
    expect(source).toContain("RESEARCH_RATIO_OUTPUT_V1");
    expect(source).toContain("scale <= 18");
    expect(source).toContain("ROUND_HALF_EVEN");
    expect(source).toContain("ending_nav / starting_nav - 1");
    expect(source).toContain("peak_t = max(NAV_0 ... NAV_t)");
    expect(source).toContain("drawdown_t = (peak_t - NAV_t) / peak_t");
    expect(source).toContain("MAX_DRAWDOWN = max(drawdown_t)");
    expect(source).toContain("non-negative magnitude ratio");
    expect(source).toContain("Metrics consume deterministic Result valuation truth");
    expect(compact).toContain("do not independently replay market data or strategy logic");
  });

  it("freezes benchmark D0 alignment and fail-closed valuation session coverage", () => {
    const source = engine();
    const compact = squish(source);

    expect(source).toContain("D0");
    expect(source).toContain("first eligible portfolio valuation session inside testPeriod");
    expect(source).toContain("under the accepted execution calendar");
    expect(source).toContain("the benchmark must have an admitted");
    expect(source).toContain("`ADJUSTED_CLOSE` observation on exactly `D0`");
    expect(source).toContain("benchmark_value(D0)");
    expect(source).toContain("starting_capital");
    expect(compact).toContain("The benchmark is evaluated on the exact same ordered valuation-session set as the portfolio");
    expect(source).toContain("benchmark_value(t)");
    expect(source).toContain("adjusted_close(D0)");
    expect(compact).toContain("If benchmark `ADJUSTED_CLOSE` is missing on `D0` or on any later required portfolio valuation session, fail closed");
    expect(compact).toContain("Do not shift the benchmark start, use its own first available date, forward-fill, back-fill, or silently omit a benchmark point");
  });

  it("freezes ratio and benchmark output serialization without contaminating signal comparison", () => {
    const source = engine();
    const compact = squish(source);

    expect(source).toContain("RESEARCH_RATIO_OUTPUT_V1");
    expect(source).toContain("max scale = 18");
    expect(source).toContain("rounding = ROUND_HALF_EVEN");
    expect(source).toContain("`TOTAL_RETURN` artifact value");
    expect(source).toContain("`MOMENTUM_12M` artifact value");
    expect(source).toContain("`TOTAL_RETURN / METRIC_V1`");
    expect(source).toContain("`MAX_DRAWDOWN / METRIC_V1`");
    expect(compact).toContain("Signal evaluation must use the exact internal rational, not the rounded 18-decimal serialized representation");
    expect(source).toContain("RESEARCH_MONEY_OUTPUT_V1");
    expect(source).toContain("max scale = 16");
    expect(source).toContain("The internal benchmark ratio remains exact until output serialization");
  });

  it("keeps Result and AccountResearchContext hashing disabled while preserving accepted RunInput", () => {
    const source = engine();

    expect(source).toContain("SYNTRAKE:RUN_INPUT:V1 = PREIMAGE_ENVELOPE_EXACT");
    expect(source).toContain("SYNTRAKE:RESULT:V1 = DECLARED_BUT_HASHING_DISABLED");
    expect(source).toContain("SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1 = DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:RUN_INPUT:V1")).toBe("PREIMAGE_ENVELOPE_EXACT");
    expect(hashDomainStateV1("SYNTRAKE:RESULT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(hashDomainStateV1("SYNTRAKE:ACCOUNT_RESEARCH_CONTEXT:V1")).toBe("DECLARED_BUT_HASHING_DISABLED");
    expect(source).toContain("D551B5200CB6E15E6A5479FE69CB958E11500BE747B0C911AD59A3098A728749");
  });

  it("records no migration, no production mutation, and no Result authority", () => {
    const source = engine();
    const compact = squish(source);

    expect(source).toContain("does not create a production migration");
    expect(compact).toContain("does not mutate production Supabase");
    expect(source).toContain("does not implement a runtime kernel");
    expect(compact).toContain("does not create Result authority");
    expect(source).toContain("does not assign an A-number");
  });
});

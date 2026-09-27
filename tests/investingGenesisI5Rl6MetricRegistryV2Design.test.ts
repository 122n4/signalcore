import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const contractPath = path.join(
  repoRoot,
  "docs",
  "investing-genesis",
  "I5_RL6_METRIC_REGISTRY_V2_DESIGN_FREEZE_V1.md",
);
const contract = fs.readFileSync(contractPath, "utf8");

function expectAll(values: readonly string[]): void {
  for (const value of values) expect(contract).toContain(value);
}

describe("I5 RL-6 Metric Registry V2 design freeze candidate", () => {
  it("starts from accepted RL-5 without claiming acceptance or Production mutation", () => {
    expect(contract.startsWith("# I5 RL-6 Metric Registry V2 Design Freeze V1")).toBe(true);
    expectAll([
      "Status: CANDIDATE DESIGN CONTRACT - RL-6 METRIC REGISTRY V2 - UNNUMBERED",
      "58ddae5171e8a8422e120fcc676d7c66d9162371",
      "Production mutation:\nNONE",
      "Migration:\nNONE IN THIS DESIGN SLICE",
      "RL-6 design = CANDIDATE",
      "RL-6 implementation = NOT STARTED BY THIS DESIGN COMMIT",
    ]);
    expect(contract).not.toContain("CURRENT_ACCEPTED / RL-6");
  });

  it("preserves V1 and freezes the exact V2 catalogue", () => {
    expectAll([
      "METRIC_REGISTRY_V20260918",
      "METRIC_RESULT_SET_V1",
      "METRIC_REGISTRY_V20260927",
      "METRIC_RESULT_SET_V2",
      "TOTAL_RETURN / METRIC_V1",
      "MAX_DRAWDOWN / METRIC_V1",
      "CAGR / METRIC_V1",
      "MAX_DRAWDOWN_DURATION / METRIC_V1",
      "MAX_DRAWDOWN_RECOVERY / METRIC_V1",
      "ANNUALIZED_VOLATILITY / METRIC_V1",
      "DOWNSIDE_DEVIATION / METRIC_V1",
      "SHARPE_RATIO / METRIC_V1",
      "SORTINO_RATIO / METRIC_V1",
      "CALMAR_RATIO / METRIC_V1",
      "TURNOVER / METRIC_V1",
      "AVERAGE_GROSS_EXPOSURE / METRIC_V1",
      "TRADE_COUNT / METRIC_V1",
      "REBALANCE_COUNT / METRIC_V1",
      "BENCHMARK_RELATIVE_RETURN / METRIC_V1",
      "TRACKING_ERROR / METRIC_V1",
      "SYNTRAKE:METRIC_REQUEST_SET:V1",
    ]);
  });

  it("freezes annualization, exact arithmetic and explicit unavailable states", () => {
    expectAll([
      "RESEARCH_RATIO_OUTPUT_V1",
      "ROUND_HALF_EVEN",
      "TRADING_SESSIONS_PER_YEAR = 252",
      "RISK_FREE_SESSION_RETURN = 0",
      "MINIMUM_ACCEPTABLE_SESSION_RETURN = 0",
      "JavaScript binary floating point is forbidden",
      "UNAVAILABLE_INSUFFICIENT_OBSERVATIONS",
      "UNAVAILABLE_ZERO_DENOMINATOR",
      "UNAVAILABLE_NO_RECOVERY",
      "UNAVAILABLE_BENCHMARK",
      "UNAVAILABLE_NONPOSITIVE_NAV",
      "UNAVAILABLE_CAGR_DOMAIN",
      "Missing or undefined truth must never\nbe converted to zero.",
    ]);
  });

  it("freezes the normative metric formulas", () => {
    expectAll([
      "CAGR = (ending_nav / starting_nav) ^ (year_days / elapsed_days) - 1",
      "sample_variance = sum((r_t - mean)^2) / (N - 1)",
      "DOWNSIDE_DEVIATION = sqrt(downside_second_moment * 252)",
      "SHARPE_RATIO = annualized_excess_return / ANNUALIZED_VOLATILITY",
      "SORTINO_RATIO = annualized_excess_over_mar / DOWNSIDE_DEVIATION",
      "CALMAR_RATIO = CAGR / MAX_DRAWDOWN",
      "TURNOVER\n= gross_traded_notional / average_nav",
      "AVERAGE_GROSS_EXPOSURE = sum(gross_exposure_t) / valuation_count",
      "Count accepted executed non-zero fill records.",
      "Count distinct fill-producing rebalance execution intents",
      "BENCHMARK_RELATIVE_RETURN = portfolio_return - benchmark_return",
      "TRACKING_ERROR = sqrt(sample_active_variance * 252)",
    ]);
  });

  it("keeps registry/result binding versioned and later RL scopes out", () => {
    expectAll([
      "engineVersion = ENGINE_V20260926",
      "RunInput.metricRegistryVersion = METRIC_REGISTRY_V20260927",
      "MetricRequestSet.metricRegistryVersion = METRIC_REGISTRY_V20260927",
      "metricResultSet.artifactSchemaVersion = METRIC_RESULT_SET_V2",
      "RESULT_HASH_PAYLOAD_V1",
      "SYNTRAKE:RESULT:V1",
      "historical V1 golden artifacts/hashes byte-identical",
      "Validation V2 child execution supports new registry without lookahead",
      "robustness/experiment comparison",
      "promotion eligibility",
      "Blind Truth / Evidence Vault",
      "Paper, broker or Live execution",
    ]);
  });
});

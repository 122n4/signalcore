import { buildMandatePolicy } from "@/lib/investing/mandate";
import type { BenchmarkPolicy, MandateInput } from "@/lib/investing/types";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildBenchmarkPolicy(mandateInput: MandateInput): BenchmarkPolicy {
  const mandate = buildMandatePolicy(mandateInput);

  const components =
    mandate.objective === "preservation"
      ? [
          {
            symbol: "AGGH",
            name: "Global Aggregate Bond ETF",
            weightPct: 55,
            assetClass: "bond" as const,
            rationale: "Core ballast for capital preservation and lower volatility.",
          },
          {
            symbol: "VWCE",
            name: "Global Equity ETF",
            weightPct: 20,
            assetClass: "equity" as const,
            rationale: "Limited equity sleeve to preserve purchasing power.",
          },
          {
            symbol: "GLD",
            name: "Gold ETF",
            weightPct: mandate.allowsGold ? 10 : 0,
            assetClass: "commodity" as const,
            rationale: "Inflation hedge inside a defensive benchmark.",
          },
          {
            symbol: mandate.baseCurrency,
            name: `${mandate.baseCurrency} Cash Reserve`,
            weightPct: mandate.allowsGold ? 15 : 25,
            assetClass: "cash" as const,
            rationale: "Liquidity reserve and drawdown stabilizer.",
          },
        ]
      : mandate.objective === "income"
        ? [
            {
              symbol: "AGGH",
              name: "Global Aggregate Bond ETF",
              weightPct: 45,
              assetClass: "bond" as const,
              rationale: "Primary income and ballast sleeve.",
            },
            {
              symbol: "VWCE",
              name: "Global Equity ETF",
              weightPct: 30,
              assetClass: "equity" as const,
              rationale: "Global equity sleeve for moderate growth.",
            },
            {
              symbol: "SPY",
              name: "S&P 500 ETF",
              weightPct: 10,
              assetClass: "equity" as const,
              rationale: "Liquid quality-growth sleeve inside the income benchmark.",
            },
            {
              symbol: "GLD",
              name: "Gold ETF",
              weightPct: mandate.allowsGold ? 5 : 0,
              assetClass: "commodity" as const,
              rationale: "Diversifier against inflation shocks.",
            },
            {
              symbol: mandate.baseCurrency,
              name: `${mandate.baseCurrency} Cash Reserve`,
              weightPct: mandate.allowsGold ? 10 : 15,
              assetClass: "cash" as const,
              rationale: "Liquidity reserve for income mandate execution.",
            },
          ]
        : mandate.objective === "growth"
          ? [
              {
                symbol: "VWCE",
                name: "Global Equity ETF",
                weightPct: 55,
                assetClass: "equity" as const,
                rationale: "Primary global compounding sleeve.",
              },
              {
                symbol: "SPY",
                name: "S&P 500 ETF",
                weightPct: 25,
                assetClass: "equity" as const,
                rationale: "High-liquidity equity benchmark anchor.",
              },
              {
                symbol: "AGGH",
                name: "Global Aggregate Bond ETF",
                weightPct: 10,
                assetClass: "bond" as const,
                rationale: "Stability sleeve even for growth mandates.",
              },
              {
                symbol: "GLD",
                name: "Gold ETF",
                weightPct: mandate.allowsGold ? 5 : 0,
                assetClass: "commodity" as const,
                rationale: "Tail-risk hedge for a growth benchmark.",
              },
              {
                symbol: mandate.baseCurrency,
                name: `${mandate.baseCurrency} Cash Reserve`,
                weightPct: mandate.allowsGold ? 5 : 10,
                assetClass: "cash" as const,
                rationale: "Execution reserve and volatility buffer.",
              },
            ]
          : [
              {
                symbol: "VWCE",
                name: "Global Equity ETF",
                weightPct: 40,
                assetClass: "equity" as const,
                rationale: "Balanced global equity sleeve.",
              },
              {
                symbol: "SPY",
                name: "S&P 500 ETF",
                weightPct: 15,
                assetClass: "equity" as const,
                rationale: "Liquid broad-market equity comparator.",
              },
              {
                symbol: "AGGH",
                name: "Global Aggregate Bond ETF",
                weightPct: 30,
                assetClass: "bond" as const,
                rationale: "Bond ballast for a balanced mandate.",
              },
              {
                symbol: "GLD",
                name: "Gold ETF",
                weightPct: mandate.allowsGold ? 5 : 0,
                assetClass: "commodity" as const,
                rationale: "Inflation hedge and diversifier.",
              },
              {
                symbol: mandate.baseCurrency,
                name: `${mandate.baseCurrency} Cash Reserve`,
                weightPct: mandate.allowsGold ? 10 : 15,
                assetClass: "cash" as const,
                rationale: "Liquidity reserve for balanced rebalancing.",
              },
            ];

  const normalized = components
    .filter((component) => component.weightPct > 0)
    .map((component) => ({ ...component }));
  const total = normalized.reduce((sum, component) => sum + component.weightPct, 0);
  if (total !== 100 && normalized.length > 0) {
    const last = normalized[normalized.length - 1];
    last.weightPct = round2(last.weightPct + (100 - total));
  }

  return {
    benchmarkId: `benchmark-${mandate.objective}-${mandate.riskProfile.toLowerCase()}-${mandate.horizon.toLowerCase()}`,
    benchmarkName: `${mandate.objective} benchmark (${mandate.riskProfile}/${mandate.horizon})`,
    objective: mandate.objective,
    riskProfile: mandate.riskProfile,
    horizon: mandate.horizon,
    expectedUse: "mandate_anchor",
    components: normalized,
    notes: [
      "Benchmark is mandate-relative and intended as a canonical anchor for future attribution.",
      "It is not yet a total-return validated research benchmark.",
    ],
  };
}

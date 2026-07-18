import { describe, expect, it } from "vitest";

import {
  buildBenchmarkPolicy,
  buildExecutionCostPolicy,
  buildInvestingBenchmarkRelativeValidation,
  buildInvestingGovernancePolicy,
  buildInvestingInstrumentScorecards,
  buildTargetPortfolio,
  getCanonicalInvestingInstrumentMaster,
} from "@/lib/investing";

describe("investing research layer", () => {
  it("builds instrument scorecards with governance-aware strengths and warnings", () => {
    const instruments = getCanonicalInvestingInstrumentMaster();
    const construction = buildTargetPortfolio({
      mandate: {
        objective: "balanced",
        riskProfile: "Balanced",
        horizon: "Long",
        baseCurrency: "EUR",
        allowsGold: true,
        allowsCrypto: false,
        needsLiquidityReserve: true,
      },
      instruments,
      budgetEur: 5_000,
    });

    const scorecards = buildInvestingInstrumentScorecards({
      instruments,
      mandate: construction.mandate,
    });

    expect(scorecards.length).toBeGreaterThan(0);
    expect(scorecards[0].compositeScore).toBeGreaterThan(0);
    expect(scorecards.some((row) => row.strengths.includes("benchmark_eligible"))).toBe(true);
    expect(scorecards.some((row) => row.warnings.includes("tax_drag"))).toBe(true);
  });

  it("builds benchmark-relative validation from construction and governance state", () => {
    const instruments = getCanonicalInvestingInstrumentMaster();
    const mandate = {
      objective: "growth" as const,
      riskProfile: "Balanced" as const,
      horizon: "Long" as const,
      baseCurrency: "EUR",
      allowsGold: true,
      allowsCrypto: false,
      needsLiquidityReserve: true,
    };
    const construction = buildTargetPortfolio({
      mandate,
      instruments,
      currentPositions: [
        { symbol: "SPY", valueEur: 7_000 },
        { symbol: "AGGH", valueEur: 1_000 },
      ],
      cashEur: 2_000,
    });
    const rebalance = {
      totalCapitalEur: construction.totalCapitalEur,
      withinPolicy: false,
      grossTurnoverPct: 18,
      actions: [
        {
          symbol: "SPY",
          action: "sell" as const,
          currentWeightPct: 70,
          targetWeightPct: 25,
          deltaWeightPct: -45,
          deltaValueEur: -4_500,
          rationale: "overweight",
        },
      ],
      notes: [],
    };
    const executionPolicy = buildExecutionCostPolicy({
      mandate,
      rebalance,
      instruments,
    });
    const governancePolicy = buildInvestingGovernancePolicy({
      mandate,
      rebalance,
      instruments,
    });
    const benchmark = buildBenchmarkPolicy(mandate);

    const validation = buildInvestingBenchmarkRelativeValidation({
      benchmark,
      construction,
      rebalance,
      executionPolicy,
      governancePolicy,
    });

    expect(validation.benchmarkId).toBe(benchmark.benchmarkId);
    expect(validation.activeSharePct).toBeGreaterThan(0);
    expect(validation.activeBets.length).toBeGreaterThan(0);
    expect(["aligned", "review", "divergent"]).toContain(validation.status);
    expect(validation.notes.length).toBeGreaterThan(0);
  });
});

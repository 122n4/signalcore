import type {
  BenchmarkPolicy,
  ConstructionResult,
  ExecutionCostPolicy,
  InvestingBenchmarkRelativePosition,
  InvestingGovernancePolicy,
  InvestingInstrument,
  InvestingInstrumentScorecard,
  InvestingResearchValidation,
  MandatePolicy,
  RebalanceResult,
} from "@/lib/investing/types";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function instrumentScore(instrument: InvestingInstrument) {
  const quality = Number(instrument.qualityScore ?? 50);
  const growth = Number(instrument.growthScore ?? 50);
  const income = Number(instrument.incomeScore ?? 50);
  const inflation = Number(instrument.inflationScore ?? 50);
  const liquidity = Number(instrument.liquidityScore ?? 50);
  const feePenalty = Math.max(0, Number(instrument.feeBps ?? 0) / 8);
  return round2((quality * 0.35) + (growth * 0.2) + (income * 0.15) + (inflation * 0.1) + (liquidity * 0.2) - feePenalty);
}

function deriveMandateFit(args: {
  instrument: InvestingInstrument;
  mandate: MandatePolicy;
}) {
  const { instrument, mandate } = args;
  if (instrument.qualityStatus === "blocked" || instrument.enabled === false) return "low" as const;
  if (instrument.assetClass === "commodity" && !mandate.allowsGold) return "low" as const;
  if (instrument.market === "crypto" && !mandate.allowsCrypto) return "low" as const;
  if (mandate.objective === "growth" && instrument.role === "core_growth") return "high" as const;
  if (mandate.objective === "income" && instrument.role === "income_ballast") return "high" as const;
  if (mandate.objective === "preservation" && (instrument.role === "income_ballast" || instrument.role === "liquidity_reserve")) {
    return "high" as const;
  }
  if (mandate.objective === "balanced" && instrument.benchmarkEligible) return "high" as const;
  return instrument.benchmarkEligible ? "medium" as const : "low" as const;
}

export function buildInvestingInstrumentScorecards(args: {
  instruments: InvestingInstrument[];
  mandate: MandatePolicy;
}): InvestingInstrumentScorecard[] {
  return args.instruments.map((instrument) => {
    const compositeScore = instrumentScore(instrument);
    const mandateFit = deriveMandateFit({
      instrument,
      mandate: args.mandate,
    });
    const strengths: string[] = [];
    const warnings: string[] = [];

    if ((instrument.liquidityTier ?? "medium") === "high") strengths.push("high_liquidity");
    if (instrument.benchmarkEligible) strengths.push("benchmark_eligible");
    if ((instrument.qualityScore ?? 0) >= 80) strengths.push("quality_approved");
    if ((instrument.feeBps ?? 99) <= 15) strengths.push("cost_efficient");

    if ((instrument.feeBps ?? 0) >= 30) warnings.push("high_fee");
    if ((instrument.taxTreatment ?? "ucits_accumulating") === "commodity_grantor_trust") warnings.push("tax_drag");
    if ((instrument.qualityStatus ?? "approved") !== "approved") warnings.push("governance_review");
    if (mandateFit === "low") warnings.push("weak_mandate_fit");

    return {
      symbol: instrument.symbol,
      name: instrument.name,
      assetClass: instrument.assetClass,
      role: instrument.role,
      market: instrument.market,
      benchmarkEligible: Boolean(instrument.benchmarkEligible),
      qualityStatus: instrument.qualityStatus ?? "approved",
      liquidityTier: instrument.liquidityTier ?? "medium",
      taxTreatment: instrument.taxTreatment ?? "ucits_accumulating",
      feeBps: Number(instrument.feeBps ?? 0),
      compositeScore,
      mandateFit,
      strengths,
      warnings,
    };
  }).sort((left, right) => right.compositeScore - left.compositeScore || left.symbol.localeCompare(right.symbol));
}

function weightMapFromBenchmark(benchmark: BenchmarkPolicy) {
  return new Map(
    benchmark.components.map((component) => [component.symbol.toUpperCase(), Number(component.weightPct || 0)]),
  );
}

function weightMapFromConstruction(construction: ConstructionResult) {
  return new Map(
    construction.targetAllocations
      .filter((allocation) => allocation.assetClass !== "cash")
      .map((allocation) => [allocation.symbol.toUpperCase(), Number(allocation.targetWeightPct || 0)]),
  );
}

export function buildInvestingBenchmarkRelativeValidation(args: {
  benchmark: BenchmarkPolicy;
  construction: ConstructionResult;
  rebalance: RebalanceResult;
  executionPolicy: ExecutionCostPolicy;
  governancePolicy: InvestingGovernancePolicy;
}): InvestingResearchValidation {
  const benchmarkWeights = weightMapFromBenchmark(args.benchmark);
  const targetWeights = weightMapFromConstruction(args.construction);
  const symbols = new Set<string>([...benchmarkWeights.keys(), ...targetWeights.keys()]);

  const activeBets: InvestingBenchmarkRelativePosition[] = [];
  let overlapWeightPct = 0;
  let activeSharePct = 0;

  for (const symbol of symbols) {
    const benchmarkWeightPct = Number(benchmarkWeights.get(symbol) ?? 0);
    const targetWeightPct = Number(targetWeights.get(symbol) ?? 0);
    const activeWeightPct = round2(targetWeightPct - benchmarkWeightPct);
    overlapWeightPct += Math.min(targetWeightPct, benchmarkWeightPct);
    activeSharePct += Math.abs(activeWeightPct);
    activeBets.push({
      symbol,
      targetWeightPct: round2(targetWeightPct),
      benchmarkWeightPct: round2(benchmarkWeightPct),
      activeWeightPct,
      classification:
        Math.abs(activeWeightPct) < 2
          ? "aligned"
          : activeWeightPct > 0
            ? "overweight"
            : "underweight",
    });
  }

  const targetTop = Math.max(0, ...[...targetWeights.values()].map((value) => Number(value || 0)));
  const benchmarkTop = Math.max(0, ...[...benchmarkWeights.values()].map((value) => Number(value || 0)));
  const concentrationDriftPct = round2(Math.abs(targetTop - benchmarkTop));
  overlapWeightPct = round2(overlapWeightPct);
  activeSharePct = round2(activeSharePct / 2);

  const status =
    args.governancePolicy.suitabilityStatus === "blocked" || activeSharePct >= 35
      ? "divergent"
      : args.governancePolicy.suitabilityStatus === "review" ||
          args.executionPolicy.turnoverBucket === "high" ||
          concentrationDriftPct >= 15 ||
          activeSharePct >= 20
        ? "review"
        : "aligned";

  const notes: string[] = [];
  notes.push(`Benchmark overlap is ${overlapWeightPct}% with active share ${activeSharePct}%.`);
  notes.push(`Concentration drift versus benchmark top weight is ${concentrationDriftPct}%.`);
  if (args.executionPolicy.turnoverBucket === "high") {
    notes.push("High turnover pressure weakens benchmark-relative execution quality.");
  }
  if (args.governancePolicy.suitabilityStatus !== "ok") {
    notes.push(`Governance status is ${args.governancePolicy.suitabilityStatus}, so benchmark deviations require supervision.`);
  }

  return {
    benchmarkId: args.benchmark.benchmarkId,
    benchmarkName: args.benchmark.benchmarkName,
    status,
    overlapWeightPct,
    activeSharePct,
    concentrationDriftPct,
    turnoverPct: round2(args.rebalance.grossTurnoverPct),
    activeBets: activeBets
      .filter((position) => Math.abs(position.activeWeightPct) >= 2)
      .sort((left, right) => Math.abs(right.activeWeightPct) - Math.abs(left.activeWeightPct) || left.symbol.localeCompare(right.symbol)),
    notes,
  };
}

import { buildBenchmarkPolicy } from "@/lib/investing/benchmark";
import { buildTargetPortfolio } from "@/lib/investing/construction";
import { buildExecutionCostPolicy } from "@/lib/investing/costs";
import { buildInvestingGovernancePolicy } from "@/lib/investing/governance";
import { getCanonicalInvestingInstrumentMaster } from "@/lib/investing/instrumentMaster";
import { buildRebalancePlan } from "@/lib/investing/rebalancing";
import {
  buildInvestingBenchmarkRelativeValidation,
  buildInvestingInstrumentScorecards,
} from "@/lib/investing/research";
import type {
  BenchmarkPolicy,
  ConstructionResult,
  CurrentPosition,
  ExecutionCostPolicy,
  InvestingGovernancePolicy,
  InvestingHorizon,
  InvestingInstrumentScorecard,
  InvestingObjective,
  InvestingResearchValidation,
  InvestingRiskProfile,
  RebalanceResult,
} from "@/lib/investing/types";

type StarterPriceHint = {
  symbol: string;
  name?: string | null;
  price?: number | null;
  price_source?: string | null;
  prev_close?: number | null;
  volume?: number | null;
  avg_volume?: number | null;
};

type InvestingStarterPackItem = {
  symbol: string;
  name: string;
  weight: number;
  rationale: string;
  value_eur: number;
  qty: number | null;
  price: number | null;
  price_ts: number | null;
  price_source: string | null;
  prev_close?: number | null;
  volume?: number | null;
  avg_volume?: number | null;
};

type InvestingStarterPackMeta = {
  source: "market_quotes" | "reference_quotes" | "static_fallback";
  strategySource: "canonical_mandate_engine";
  budgetEur: number;
  objective: InvestingObjective;
  mandateRiskProfile: InvestingRiskProfile;
  mandateHorizon: InvestingHorizon;
  residualCashEur: number;
};

export type InvestingRuntimeSnapshot = {
  objective: InvestingObjective;
  benchmark: BenchmarkPolicy;
  executionPolicy: ExecutionCostPolicy;
  governancePolicy: InvestingGovernancePolicy;
  instrumentScorecards: InvestingInstrumentScorecard[];
  benchmarkValidation: InvestingResearchValidation;
  starterPackItems: InvestingStarterPackItem[];
  starterPackMeta: InvestingStarterPackMeta | null;
  construction: ConstructionResult;
  rebalance: RebalanceResult;
  notes: string[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function roundQty(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function inferBudgetEur(args: {
  budgetOverrideEur?: number | null;
  referenceTotalEur?: number | null;
  targetValueEur?: number | null;
}) {
  const override = Number(args.budgetOverrideEur ?? Number.NaN);
  if (Number.isFinite(override) && override > 0) {
    return Math.round(clamp(override, 100, 50_000));
  }

  const reference = Number(args.referenceTotalEur ?? Number.NaN);
  if (Number.isFinite(reference) && reference >= 100) {
    return Math.round(clamp(reference * 0.35, 100, 25_000));
  }

  const target = Number(args.targetValueEur ?? Number.NaN);
  if (Number.isFinite(target) && target > 0) {
    return Math.round(clamp(target * 0.1, 100, 25_000));
  }

  return 1_000;
}

function deriveObjective(args: {
  planGoal?: string | null;
  userGoalType?: string | null;
  riskProfile: InvestingRiskProfile;
  horizon: InvestingHorizon;
}): InvestingObjective {
  const goal = `${args.planGoal || ""} ${args.userGoalType || ""}`.toLowerCase();
  if (/(income|yield|dividend|cashflow)/.test(goal)) return "income";
  if (/(preserv|protect|safety|capital preservation)/.test(goal)) return "preservation";
  if (/(balanc|stability|controlled risk|steady growth)/.test(goal)) return "balanced";
  if (/(growth|compound|aggressive)/.test(goal)) return "growth";
  if (args.riskProfile === "Conservative" || args.horizon === "Short") return "preservation";
  if (args.riskProfile === "Aggressive" && args.horizon === "Long") return "growth";
  return "balanced";
}

function buildCurrentPositions(args: {
  portfolioItems?: Array<Record<string, unknown>> | null;
  quotes?: Record<string, any> | null;
}): CurrentPosition[] {
  const items = Array.isArray(args.portfolioItems) ? args.portfolioItems : [];
  const quotes = args.quotes && typeof args.quotes === "object" ? args.quotes : {};
  return items
    .map((item) => {
      const symbol = String(item.symbol || "").trim().toUpperCase();
      if (!symbol) return null;
      const qty = Number(item.qty ?? Number.NaN);
      const quoted = Number((quotes as any)?.[symbol]?.price ?? Number.NaN);
      const directValue = Number(item.valueEur ?? item.value_eur ?? Number.NaN);
      const derivedValue =
        Number.isFinite(qty) && qty > 0 && Number.isFinite(quoted) && quoted > 0 ? qty * quoted : Number.NaN;
      const valueEur = Number.isFinite(directValue) ? directValue : Number.isFinite(derivedValue) ? derivedValue : 0;
      return { symbol, valueEur: round2(Math.max(0, valueEur)) };
    })
    .filter((row): row is CurrentPosition => Boolean(row && row.symbol));
}

function buildPriceHintMap(hints?: StarterPriceHint[] | null) {
  return new Map(
    (Array.isArray(hints) ? hints : [])
      .map((hint) => [String(hint.symbol || "").trim().toUpperCase(), hint] as const)
      .filter(([symbol]) => symbol.length > 0),
  );
}

function resolveMetaSource(priceHints: Map<string, StarterPriceHint>, allocations: ConstructionResult["targetAllocations"]) {
  const activeHints = allocations
    .filter((allocation) => allocation.assetClass !== "cash")
    .map((allocation) => priceHints.get(allocation.symbol.toUpperCase()))
    .filter(Boolean) as StarterPriceHint[];
  if (activeHints.length === 0) return "static_fallback" as const;
  const hasReferenceOnly = activeHints.some((hint) => String(hint.price_source || "").toLowerCase().includes("reference"));
  return hasReferenceOnly ? ("reference_quotes" as const) : ("market_quotes" as const);
}

export function buildInvestingRuntimeSnapshot(args: {
  budgetOverrideEur?: number | null;
  referenceTotalEur?: number | null;
  userSettings?: Record<string, any> | null;
  plan?: Record<string, any> | null;
  portfolioItems?: Array<Record<string, unknown>> | null;
  valuation?: Record<string, unknown> | null;
  quotes?: Record<string, any> | null;
  starterPriceHints?: StarterPriceHint[] | null;
}): InvestingRuntimeSnapshot | null {
  const riskProfile = String(args.userSettings?.risk_profile || "").trim();
  const horizon = String(args.userSettings?.horizon || "").trim();

  if (riskProfile !== "Conservative" && riskProfile !== "Balanced" && riskProfile !== "Aggressive") {
    return null;
  }
  if (horizon !== "Short" && horizon !== "Medium" && horizon !== "Long") {
    return null;
  }

  const targetValueEur = Number(args.userSettings?.goal_target_value ?? args.userSettings?.goal_amount ?? Number.NaN);
  const objective = deriveObjective({
    planGoal: String(args.plan?.goal || "").trim() || null,
    userGoalType: String(args.userSettings?.goal_type || "").trim() || null,
    riskProfile,
    horizon,
  });

  const cashEur = Number(args.valuation?.cashEur ?? 0) || 0;
  const currentPositions = buildCurrentPositions({
    portfolioItems: args.portfolioItems,
    quotes: args.quotes,
  });

  const budgetEur = inferBudgetEur({
    budgetOverrideEur: args.budgetOverrideEur,
    referenceTotalEur: args.referenceTotalEur,
    targetValueEur,
  });
  const universe = getCanonicalInvestingInstrumentMaster();

  const construction = buildTargetPortfolio({
    mandate: {
      objective,
      riskProfile,
      horizon,
      targetValueEur: Number.isFinite(targetValueEur) ? targetValueEur : null,
      baseCurrency: "EUR",
      allowsGold: true,
      allowsCrypto: false,
      needsLiquidityReserve: true,
    },
    instruments: universe,
    currentPositions,
    cashEur,
    budgetEur: currentPositions.length > 0 ? null : budgetEur,
  });
  const benchmark = buildBenchmarkPolicy({
    objective,
    riskProfile,
    horizon,
    targetValueEur: Number.isFinite(targetValueEur) ? targetValueEur : null,
    baseCurrency: "EUR",
    allowsGold: true,
    allowsCrypto: false,
    needsLiquidityReserve: true,
  });

  const rebalance = buildRebalancePlan({
    mandate: {
      objective,
      riskProfile,
      horizon,
      targetValueEur: Number.isFinite(targetValueEur) ? targetValueEur : null,
      baseCurrency: "EUR",
      allowsGold: true,
      allowsCrypto: false,
      needsLiquidityReserve: true,
    },
    instruments: universe,
    currentPositions,
    cashEur,
    budgetEur: currentPositions.length > 0 ? null : budgetEur,
  });
  const executionPolicy = buildExecutionCostPolicy({
    mandate: {
      objective,
      riskProfile,
      horizon,
      targetValueEur: Number.isFinite(targetValueEur) ? targetValueEur : null,
      baseCurrency: "EUR",
      allowsGold: true,
      allowsCrypto: false,
      needsLiquidityReserve: true,
    },
    rebalance,
    instruments: universe,
  });
  const governancePolicy = buildInvestingGovernancePolicy({
    mandate: {
      objective,
      riskProfile,
      horizon,
      targetValueEur: Number.isFinite(targetValueEur) ? targetValueEur : null,
      baseCurrency: "EUR",
      allowsGold: true,
      allowsCrypto: false,
      needsLiquidityReserve: true,
    },
    rebalance,
    instruments: universe,
  });
  const instrumentScorecards = buildInvestingInstrumentScorecards({
    instruments: universe,
    mandate: construction.mandate,
  });
  const benchmarkValidation = buildInvestingBenchmarkRelativeValidation({
    benchmark,
    construction,
    rebalance,
    executionPolicy,
    governancePolicy,
  });

  const priceHints = buildPriceHintMap(args.starterPriceHints);
  const starterPackItems: InvestingStarterPackItem[] = construction.targetAllocations
    .filter((allocation) => allocation.assetClass !== "cash")
    .map((allocation) => {
      const hint = priceHints.get(allocation.symbol.toUpperCase());
      const price = Number(hint?.price ?? Number.NaN);
      const qty = Number.isFinite(price) && price > 0 ? roundQty(allocation.targetValueEur / price) : null;
      return {
        symbol: allocation.symbol,
        name: hint?.name ? String(hint.name) : allocation.symbol,
        weight: round2(allocation.targetWeightPct / 100),
        rationale: allocation.rationale,
        value_eur: allocation.targetValueEur,
        qty,
        price: Number.isFinite(price) ? price : null,
        price_ts: null,
        price_source: hint?.price_source ?? null,
        prev_close: Number.isFinite(Number(hint?.prev_close ?? Number.NaN)) ? Number(hint?.prev_close) : null,
        volume: Number.isFinite(Number(hint?.volume ?? Number.NaN)) ? Number(hint?.volume) : null,
        avg_volume: Number.isFinite(Number(hint?.avg_volume ?? Number.NaN)) ? Number(hint?.avg_volume) : null,
      };
    });

  return {
    objective,
    benchmark,
    executionPolicy,
    governancePolicy,
    instrumentScorecards,
    benchmarkValidation,
    starterPackItems,
    starterPackMeta:
      currentPositions.length > 0
        ? null
        : {
            source: resolveMetaSource(priceHints, construction.targetAllocations),
            strategySource: "canonical_mandate_engine",
            budgetEur: construction.totalCapitalEur,
            objective,
            mandateRiskProfile: riskProfile,
            mandateHorizon: horizon,
            residualCashEur: construction.residualCashEur,
          },
    construction,
    rebalance,
    notes: [
      ...construction.notes,
      ...rebalance.notes,
      ...governancePolicy.notes,
      ...benchmarkValidation.notes,
      ...(governancePolicy.manualReviewReasons.length > 0
        ? [`Governance review reasons: ${governancePolicy.manualReviewReasons.join(", ")}.`]
        : []),
    ],
  };
}

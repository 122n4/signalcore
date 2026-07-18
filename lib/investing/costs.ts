import { buildMandatePolicy } from "@/lib/investing/mandate";
import type { ExecutionCostPolicy, InvestingInstrument, MandateInput, RebalanceResult } from "@/lib/investing/types";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildExecutionCostPolicy(args: {
  mandate: MandateInput;
  rebalance: RebalanceResult;
  instruments: InvestingInstrument[];
}): ExecutionCostPolicy {
  const mandate = buildMandatePolicy(args.mandate);
  const instrumentMap = new Map(
    args.instruments.map((instrument) => [instrument.symbol.toUpperCase(), instrument]),
  );
  const activeActions = args.rebalance.actions.filter((action) => action.action !== "hold");
  const turnoverPct = args.rebalance.grossTurnoverPct;

  const avgFeeBps =
    activeActions.length > 0
      ? activeActions.reduce((sum, action) => sum + Number(instrumentMap.get(action.symbol)?.feeBps ?? 15), 0) / activeActions.length
      : 0;

  const taxDragScore =
    activeActions.length > 0
      ? activeActions.reduce((sum, action) => {
          const treatment = instrumentMap.get(action.symbol)?.taxTreatment ?? "ucits_accumulating";
          if (treatment === "commodity_grantor_trust") return sum + 3;
          if (treatment === "us_distributing" || treatment === "bond_fund") return sum + 2;
          if (treatment === "cash_equivalent") return sum + 1;
          return sum;
        }, 0) / activeActions.length
      : 0;

  const estimatedSlippageBps =
    activeActions.length === 0
      ? 0
      : mandate.riskProfile === "Aggressive"
        ? 8
        : mandate.riskProfile === "Balanced"
          ? 6
          : 4;

  const tradedValueEur = round2((args.rebalance.totalCapitalEur * turnoverPct) / 100);
  const feeBudgetEur = round2((tradedValueEur * avgFeeBps) / 10_000);
  const slippageBudgetEur = round2((tradedValueEur * estimatedSlippageBps) / 10_000);
  const estimatedRoundTripCostEur = round2(feeBudgetEur + slippageBudgetEur);

  const turnoverBucket = turnoverPct >= 12 ? "high" : turnoverPct >= 5 ? "medium" : "low";
  const taxFrictionBucket = taxDragScore >= 2.5 ? "high" : taxDragScore >= 1.5 ? "medium" : "low";
  const executionMode =
    activeActions.length === 0 ? "hold" : args.rebalance.withinPolicy ? "rebalance_now" : "phase_rebalance";
  const minimumHoldingPeriodDays = turnoverBucket === "high" || taxFrictionBucket === "high" ? 30 : turnoverBucket === "medium" ? 14 : 7;
  const governanceStatus =
    activeActions.some((action) => instrumentMap.get(action.symbol)?.qualityStatus === "blocked")
      ? "blocked"
      : turnoverBucket === "high" || taxFrictionBucket === "high"
        ? "review"
        : "ok";

  const notes: string[] = [];
  if (activeActions.length === 0) {
    notes.push("No execution needed because the portfolio is inside the current drift policy.");
  } else {
    notes.push(`Estimated cost model uses average fee ${round2(avgFeeBps)} bps and slippage ${estimatedSlippageBps} bps.`);
    notes.push(`Tax friction bucket is ${taxFrictionBucket} with minimum holding period ${minimumHoldingPeriodDays} days.`);
    if (!args.rebalance.withinPolicy) {
      notes.push("Turnover breaches mandate cap, so execution should be phased across sessions.");
    }
    if (turnoverBucket === "high") {
      notes.push("High turnover bucket detected; review tax and spread impact before real execution.");
    }
  }

  return {
    avgFeeBps: round2(avgFeeBps),
    feeBudgetEur,
    estimatedSlippageBps,
    estimatedRoundTripCostEur,
    turnoverBucket,
    taxFrictionBucket,
    minimumHoldingPeriodDays,
    governanceStatus,
    executionMode,
    notes,
  };
}

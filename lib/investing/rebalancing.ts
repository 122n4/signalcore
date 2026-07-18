import type {
  CurrentPosition,
  RebalanceAction,
  RebalanceResult,
  TargetAllocation,
} from "@/lib/investing/types";
import { buildTargetPortfolio } from "@/lib/investing/construction";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildRebalancePlan(args: Parameters<typeof buildTargetPortfolio>[0]): RebalanceResult {
  const construction = buildTargetPortfolio(args);
  const totalCapitalEur = construction.totalCapitalEur;
  const currentPositions = new Map<string, CurrentPosition>(
    (args.currentPositions ?? []).map((position) => [position.symbol.toUpperCase(), position]),
  );
  const targetAllocations = new Map<string, TargetAllocation>(
    construction.targetAllocations
      .filter((allocation) => allocation.assetClass !== "cash")
      .map((allocation) => [allocation.symbol.toUpperCase(), allocation]),
  );

  const symbols = new Set<string>([...currentPositions.keys(), ...targetAllocations.keys()]);
  const actions: RebalanceAction[] = [];
  let grossTurnoverPct = 0;

  for (const symbol of [...symbols].sort()) {
    const currentValueEur = Number(currentPositions.get(symbol)?.valueEur ?? 0);
    const target = targetAllocations.get(symbol);
    const currentWeightPct = totalCapitalEur > 0 ? round2((currentValueEur / totalCapitalEur) * 100) : 0;
    const targetWeightPct = Number(target?.targetWeightPct ?? 0);
    const deltaWeightPct = round2(targetWeightPct - currentWeightPct);
    const deltaValueEur = round2((totalCapitalEur * deltaWeightPct) / 100);
    const absDeltaWeightPct = Math.abs(deltaWeightPct);
    const withinBand = absDeltaWeightPct <= construction.mandate.driftBandPct;

    let action: RebalanceAction["action"] = "hold";
    if (!withinBand && deltaValueEur > 0) action = "buy";
    else if (!withinBand && deltaValueEur < 0) action = "sell";

    if (action !== "hold") {
      grossTurnoverPct += absDeltaWeightPct;
    }

    actions.push({
      symbol,
      action,
      currentWeightPct,
      targetWeightPct,
      deltaWeightPct,
      deltaValueEur,
      rationale:
        action === "hold"
          ? `Within drift band (${construction.mandate.driftBandPct}%).`
          : `${action === "buy" ? "Underweight" : "Overweight"} versus mandate target.`,
    });
  }

  grossTurnoverPct = round2(grossTurnoverPct);
  const notes = [...construction.notes];
  const withinPolicy = grossTurnoverPct <= construction.mandate.maxTurnoverPct;
  if (!withinPolicy) {
    notes.push(
      `Gross turnover ${grossTurnoverPct}% exceeds mandate cap ${construction.mandate.maxTurnoverPct}%; execution must be phased.`,
    );
  }

  return {
    withinPolicy,
    totalCapitalEur,
    grossTurnoverPct,
    actions: actions.sort((a, b) => Math.abs(b.deltaWeightPct) - Math.abs(a.deltaWeightPct) || a.symbol.localeCompare(b.symbol)),
    notes,
  };
}

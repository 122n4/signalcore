import { buildMandatePolicy } from "@/lib/investing/mandate";
import type {
  AssetClass,
  ConstructionResult,
  CurrentPosition,
  InvestingInstrument,
  MandateInput,
  MandatePolicy,
  TargetAllocation,
} from "@/lib/investing/types";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function instrumentScore(instrument: InvestingInstrument, mandate: MandatePolicy) {
  const quality = Number(instrument.qualityScore ?? 50);
  const growth = Number(instrument.growthScore ?? 50);
  const income = Number(instrument.incomeScore ?? 50);
  const inflation = Number(instrument.inflationScore ?? 50);
  const liquidity = Number(instrument.liquidityScore ?? 50);
  const feePenalty = Math.max(0, Number(instrument.feeBps ?? 0) / 10);

  let score = quality;
  if (mandate.objective === "growth") score += growth * 0.9 + income * 0.1;
  else if (mandate.objective === "income") score += income * 0.9 + quality * 0.1;
  else if (mandate.objective === "preservation") score += liquidity * 0.6 + income * 0.3 + inflation * 0.1;
  else score += growth * 0.45 + income * 0.25 + liquidity * 0.2 + inflation * 0.1;

  if (instrument.role === "core_growth") score += 10;
  if (instrument.role === "income_ballast") score += mandate.objective === "income" ? 8 : 4;
  if (instrument.role === "inflation_hedge") score += mandate.allowsGold ? 6 : -100;
  if (instrument.role === "liquidity_reserve") score += mandate.needsLiquidityReserve ? 8 : 2;
  if (instrument.market === "crypto" && !mandate.allowsCrypto) score = -1000;

  return Math.max(0, round2(score - feePenalty));
}

function totalCapital(currentPositions: CurrentPosition[], cashEur: number) {
  const positions = currentPositions.reduce((sum, item) => sum + Math.max(0, Number(item.valueEur || 0)), 0);
  return round2(positions + Math.max(0, cashEur));
}

function pickAssetClassUniverse(
  instruments: InvestingInstrument[],
  assetClass: AssetClass,
  mandate: MandatePolicy,
) {
  return instruments
    .filter((instrument) => (instrument.enabled ?? true) && instrument.assetClass === assetClass)
    .map((instrument) => ({
      instrument,
      score: instrumentScore(instrument, mandate),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.instrument.symbol.localeCompare(b.instrument.symbol));
}

function buildAllocationRationale(instrument: InvestingInstrument, assetClass: AssetClass, mandate: MandatePolicy) {
  return `${instrument.role} inside ${assetClass} bucket for a ${mandate.objective} mandate (${mandate.riskProfile}/${mandate.horizon}).`;
}

export function buildTargetPortfolio(args: {
  mandate: MandateInput;
  instruments: InvestingInstrument[];
  currentPositions?: CurrentPosition[];
  cashEur?: number;
  budgetEur?: number | null;
}): ConstructionResult {
  const mandate = buildMandatePolicy(args.mandate);
  const currentPositions = args.currentPositions ?? [];
  const cashEur = Number(args.cashEur ?? 0);
  const totalCapitalEur = Math.max(
    0,
    round2(Number(args.budgetEur ?? 0) > 0 ? Number(args.budgetEur) : totalCapital(currentPositions, cashEur)),
  );

  const targetAllocations: TargetAllocation[] = [];
  const notes: string[] = [];
  let allocatedValue = 0;

  for (const assetClass of ["equity", "bond", "commodity", "cash", "other"] as AssetClass[]) {
    const classWeightPct = Number(mandate.assetClassTargets[assetClass] ?? 0);
    if (classWeightPct <= 0) continue;
    const classValue = round2((totalCapitalEur * classWeightPct) / 100);

    if (assetClass === "cash") {
      targetAllocations.push({
        symbol: mandate.baseCurrency,
        assetClass,
        role: "liquidity_reserve",
        targetWeightPct: classWeightPct,
        targetValueEur: classValue,
        rationale: `Liquidity reserve for ${mandate.objective} mandate.`,
      });
      allocatedValue += classValue;
      continue;
    }

    const universe = pickAssetClassUniverse(args.instruments, assetClass, mandate);
    if (universe.length === 0) {
      notes.push(`No enabled instruments for ${assetClass}; weight kept unallocated.`);
      continue;
    }

    const scoreTotal = universe.reduce((sum, row) => sum + row.score, 0);
    for (const row of universe) {
      const rawWeightPct = scoreTotal > 0 ? (classWeightPct * row.score) / scoreTotal : 0;
      const cappedWeightPct = Math.min(rawWeightPct, mandate.maxSinglePositionPct);
      const targetValueEur = round2((totalCapitalEur * cappedWeightPct) / 100);
      if (targetValueEur <= 0) continue;
      targetAllocations.push({
        symbol: row.instrument.symbol,
        assetClass,
        role: row.instrument.role,
        targetWeightPct: round2(cappedWeightPct),
        targetValueEur,
        rationale: buildAllocationRationale(row.instrument, assetClass, mandate),
      });
      allocatedValue += targetValueEur;
    }
  }

  const residualCashEur = Math.max(0, round2(totalCapitalEur - allocatedValue));
  if (residualCashEur > 0) {
    notes.push(`Residual cash ${residualCashEur.toFixed(2)} ${mandate.baseCurrency} kept as reserve.`);
  }

  return {
    mandate,
    totalCapitalEur,
    targetAllocations: targetAllocations.sort((a, b) => b.targetWeightPct - a.targetWeightPct || a.symbol.localeCompare(b.symbol)),
    residualCashEur,
    notes,
  };
}

import type {
  AssetClass,
  InvestingObjective,
  InvestingRiskProfile,
  MandateInput,
  MandatePolicy,
} from "@/lib/investing/types";

function cloneTargets(targets: Record<AssetClass, number>) {
  return {
    equity: targets.equity,
    bond: targets.bond,
    commodity: targets.commodity,
    cash: targets.cash,
    other: targets.other,
  } satisfies Record<AssetClass, number>;
}

function normalizeTargets(targets: Record<AssetClass, number>) {
  const out = cloneTargets(targets);
  const total = Object.values(out).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    return { equity: 0, bond: 0, commodity: 0, cash: 100, other: 0 } satisfies Record<AssetClass, number>;
  }
  for (const key of Object.keys(out) as AssetClass[]) {
    out[key] = Number(((Math.max(0, out[key]) / total) * 100).toFixed(2));
  }
  const roundedTotal = Object.values(out).reduce((sum, value) => sum + value, 0);
  out.cash = Number((out.cash + (100 - roundedTotal)).toFixed(2));
  return out;
}

function baseTargetsForRisk(riskProfile: InvestingRiskProfile) {
  switch (riskProfile) {
    case "Conservative":
      return { equity: 25, bond: 55, commodity: 10, cash: 10, other: 0 } satisfies Record<AssetClass, number>;
    case "Aggressive":
      return { equity: 80, bond: 10, commodity: 5, cash: 5, other: 0 } satisfies Record<AssetClass, number>;
    case "Balanced":
    default:
      return { equity: 55, bond: 25, commodity: 10, cash: 10, other: 0 } satisfies Record<AssetClass, number>;
  }
}

function applyObjectiveOverlay(
  targets: Record<AssetClass, number>,
  objective: InvestingObjective,
  horizon: MandateInput["horizon"],
) {
  const out = cloneTargets(targets);
  if (objective === "growth") {
    out.equity += 10;
    out.bond -= 5;
    out.cash -= 5;
  } else if (objective === "income") {
    out.bond += 15;
    out.equity -= 10;
    out.cash -= 5;
  } else if (objective === "preservation") {
    out.cash += 5;
    out.bond += 10;
    out.equity -= 10;
    out.commodity -= 5;
  }
  if (horizon === "Short") {
    out.cash += 5;
    out.bond += 5;
    out.equity -= 10;
  } else if (horizon === "Long") {
    out.equity += 5;
    out.bond -= 5;
  }
  return normalizeTargets(out);
}

export function buildMandatePolicy(input: MandateInput): MandatePolicy {
  const baseCurrency = String(input.baseCurrency || "EUR").trim().toUpperCase() || "EUR";
  const objective = input.objective;
  const riskProfile = input.riskProfile;
  const horizon = input.horizon;

  let assetClassTargets = applyObjectiveOverlay(baseTargetsForRisk(riskProfile), objective, horizon);

  const allowsGold = input.allowsGold !== false;
  const allowsCrypto = input.allowsCrypto === true;
  const needsLiquidityReserve = input.needsLiquidityReserve !== false;

  if (!allowsGold) {
    assetClassTargets = normalizeTargets({
      ...assetClassTargets,
      equity: assetClassTargets.equity + assetClassTargets.commodity,
      commodity: 0,
    });
  }

  if (needsLiquidityReserve) {
    const minCash = objective === "preservation" || horizon === "Short" ? 10 : 5;
    if (assetClassTargets.cash < minCash) {
      const diff = minCash - assetClassTargets.cash;
      assetClassTargets = normalizeTargets({
        ...assetClassTargets,
        equity: Math.max(0, assetClassTargets.equity - diff),
        cash: minCash,
      });
    }
  }

  return {
    objective,
    riskProfile,
    horizon,
    baseCurrency,
    assetClassTargets,
    driftBandPct: riskProfile === "Conservative" ? 3 : riskProfile === "Balanced" ? 5 : 7,
    maxSinglePositionPct: riskProfile === "Aggressive" ? 20 : riskProfile === "Balanced" ? 15 : 12,
    maxTurnoverPct: horizon === "Short" ? 8 : horizon === "Medium" ? 12 : 15,
    cashReservePct: assetClassTargets.cash,
    allowsGold,
    allowsCrypto,
    needsLiquidityReserve,
  };
}

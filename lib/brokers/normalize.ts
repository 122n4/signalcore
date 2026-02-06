import type { Holding, PortfolioSnapshot } from "./types";

export function computeWeights(holdings: Holding[], totalValue?: number) {
  const tv =
    typeof totalValue === "number" && Number.isFinite(totalValue) && totalValue > 0
      ? totalValue
      : holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0);

  if (!tv || tv <= 0) return holdings;

  return holdings.map((h) => ({
    ...h,
    weightPct: ((h.marketValue ?? 0) / tv) * 100,
  }));
}

export function computeMetrics(snapshot: PortfolioSnapshot) {
  const total =
    snapshot.holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0) +
    snapshot.cash.reduce((s, c) => s + (c.value ?? 0), 0);

  const weights = computeWeights(snapshot.holdings, total);
  const top5 = [...weights]
    .sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0))
    .slice(0, 5)
    .reduce((s, h) => s + (h.weightPct ?? 0), 0);

  return {
    totalValue: total,
    currency: snapshot.cash?.[0]?.currency ?? snapshot.holdings?.[0]?.currency ?? "EUR",
    concentrationTop5Pct: top5,
    holdingsCount: snapshot.holdings.length,
    holdingsWeighted: weights,
  };
}
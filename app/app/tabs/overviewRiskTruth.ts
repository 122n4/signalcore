type HoldingValue = {
  symbol?: unknown;
  valueEur?: unknown;
  value_eur?: unknown;
};

export function resolveOverviewTopRiskLeak(args: {
  canonicalTopLeak: any;
  holdings: HoldingValue[];
  maxSinglePositionPct: number;
}) {
  if (args.canonicalTopLeak) return args.canonicalTopLeak;

  const valued = args.holdings
    .map((holding) => ({
      symbol: String(holding?.symbol || "Holding").toUpperCase(),
      valueEur: Math.max(0, Number(holding?.valueEur ?? holding?.value_eur ?? 0) || 0),
    }))
    .filter((holding) => holding.valueEur > 0)
    .sort((a, b) => b.valueEur - a.valueEur);
  const investedTotalEur = valued.reduce((sum, holding) => sum + holding.valueEur, 0);
  const largest = valued[0];
  const limitPct = Math.max(1, Number(args.maxSinglePositionPct) || 33);
  const largestPct = largest && investedTotalEur > 0 ? (largest.valueEur / investedTotalEur) * 100 : 0;

  if (!largest || largestPct <= limitPct) return null;

  return {
    key: largestPct >= Math.max(50, limitPct * 1.5) ? "concentration_high" : "concentration_med",
    severity: largestPct >= Math.max(50, limitPct * 1.5) ? "high" : "med",
    title: `${largest.symbol} above concentration limit`,
    detail: `${largest.symbol} represents ${Math.round(largestPct)}% of invested capital, above the ${Math.round(limitPct)}% plan limit.`,
    source: "portfolio_structure_fallback",
  };
}

import type { AutopilotMode } from "@/lib/signalcore/modes";
import { getQuotes } from "@/lib/market/quotes";
import { isReferenceOnlyQuoteSource } from "@/lib/signalcore/quoteQuality";
import { getStarterPack } from "@/lib/signalcore/starterPack";

type Candidate = {
  symbol: string;
  name: string;
  weight: number;
  rationale: string;
};

export type DynamicStarterPackItem = {
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

export type DynamicStarterPackResult = {
  items: DynamicStarterPackItem[];
  budgetEur: number;
  source: "market_quotes" | "reference_quotes" | "static_fallback";
};

function roundMoney(v: number) {
  return Math.round(v);
}

function roundQty(v: number) {
  return Math.round(v * 1_000_000) / 1_000_000;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function normalizeWeights<T extends { weight: number }>(items: T[]): T[] {
  const total = items.reduce((acc, x) => acc + (Number.isFinite(x.weight) ? x.weight : 0), 0);
  if (!Number.isFinite(total) || total <= 0) return items;
  return items.map((x) => ({ ...x, weight: x.weight / total }));
}

function allocateByWeight(weights: number[], budgetEur: number) {
  if (!weights.length) return [];
  const raw = weights.map((w) => roundMoney(budgetEur * w));
  const delta = roundMoney(budgetEur) - raw.reduce((a, b) => a + b, 0);
  if (raw.length > 0 && delta !== 0) raw[0] += delta;
  return raw.map((x) => Math.max(0, x));
}

function defaultBudgetByMode(mode: AutopilotMode) {
  void mode;
  return 1000;
}

function inferBudgetEur(mode: AutopilotMode, referenceTotalEur?: number | null, budgetOverrideEur?: number | null) {
  const override = Number(budgetOverrideEur ?? NaN);
  if (Number.isFinite(override) && override > 0) {
    return roundMoney(clamp(override, 100, 50000));
  }

  const ref = Number(referenceTotalEur ?? 0);
  if (Number.isFinite(ref) && ref >= 100) {
    return roundMoney(clamp(ref * 0.35, 100, 25000));
  }
  return defaultBudgetByMode(mode);
}

function normalizeRiskProfile(x: unknown) {
  const v = String(x || "").toLowerCase().trim();
  if (v === "conservative") return "conservative" as const;
  if (v === "aggressive") return "aggressive" as const;
  return "balanced" as const;
}

function candidatesByMode(mode: AutopilotMode, riskProfile?: string | null): Candidate[] {
  void mode;
  const rp = normalizeRiskProfile(riskProfile);
  if (rp === "conservative") {
    return [
      { symbol: "VWCE", name: "Global Equity ETF", weight: 0.3, rationale: "Diversified growth core with lower amplitude." },
      { symbol: "AGGH", name: "Global Aggregate Bond ETF", weight: 0.45, rationale: "Stability anchor for conservative profile." },
      { symbol: "SPY", name: "S&P 500 ETF", weight: 0.1, rationale: "Liquid US equity sleeve." },
      { symbol: "GLD", name: "Gold ETF", weight: 0.15, rationale: "Diversifier during stress regimes." },
    ];
  }
  if (rp === "aggressive") {
    return [
      { symbol: "VWCE", name: "Global Equity ETF", weight: 0.58, rationale: "High growth core for long-term compounding." },
      { symbol: "AGGH", name: "Global Aggregate Bond ETF", weight: 0.1, rationale: "Small stabilizer for drawdown control." },
      { symbol: "SPY", name: "S&P 500 ETF", weight: 0.22, rationale: "High-liquidity US equity sleeve." },
      { symbol: "GLD", name: "Gold ETF", weight: 0.1, rationale: "Diversifier during regime stress." },
    ];
  }
  return [
    { symbol: "VWCE", name: "Global Equity ETF", weight: 0.45, rationale: "Global diversified equity core." },
    { symbol: "AGGH", name: "Global Aggregate Bond ETF", weight: 0.25, rationale: "Volatility control and smoother path." },
    { symbol: "SPY", name: "S&P 500 ETF", weight: 0.15, rationale: "High-liquidity US equity sleeve." },
    { symbol: "GLD", name: "Gold ETF", weight: 0.15, rationale: "Diversifier during regime stress." },
  ];
}

function fromStaticFallback(args: { mode: AutopilotMode; budgetEur: number }): DynamicStarterPackResult {
  const items = normalizeWeights(getStarterPack(args.mode)).map((x) => ({ ...x }));
  const allocations = allocateByWeight(items.map((x) => x.weight), args.budgetEur);
  return {
    items: items.map((x, i) => ({
      symbol: x.symbol,
      name: x.name,
      weight: x.weight,
      rationale: x.rationale,
      value_eur: allocations[i] ?? 0,
      qty: null,
      price: null,
      price_ts: null,
      price_source: null,
    })),
    budgetEur: args.budgetEur,
    source: "static_fallback",
  };
}

export async function buildDynamicStarterPack(args: {
  mode: AutopilotMode;
  referenceTotalEur?: number | null;
  budgetOverrideEur?: number | null;
  riskProfile?: string | null;
}): Promise<DynamicStarterPackResult> {
  const budgetEur = inferBudgetEur(args.mode, args.referenceTotalEur, args.budgetOverrideEur);
  const candidates = normalizeWeights(candidatesByMode(args.mode, args.riskProfile));
  let quotes: Record<
    string,
    {
      price: number;
      ts: number;
      source: string;
      currency?: string | null;
      prevClose?: number | null;
      volume?: number | null;
      averageVolume?: number | null;
    }
  > = {};
  try {
    quotes = await getQuotes({
      symbols: candidates.map((x) => x.symbol),
      ttlSec: 120,
    });
  } catch {
    return fromStaticFallback({ mode: args.mode, budgetEur });
  }

  const withQuotes = candidates
    .map((x) => {
      const q = quotes[x.symbol];
      return {
        ...x,
        price: Number(q?.price),
        priceTs: Number(q?.ts),
        priceSource: q?.source ?? null,
        prevClose: Number(q?.prevClose),
        volume: Number(q?.volume),
        averageVolume: Number(q?.averageVolume),
      };
    })
    .filter((x) => Number.isFinite(x.price) && (x.price as number) > 0);

  if (withQuotes.length < 2) {
    return fromStaticFallback({ mode: args.mode, budgetEur });
  }

  const normalized = normalizeWeights(withQuotes);
  const allocations = allocateByWeight(normalized.map((x) => x.weight), budgetEur);
  const source =
    withQuotes.length < candidates.length ||
    withQuotes.some((x) => isReferenceOnlyQuoteSource(x.priceSource))
      ? ("reference_quotes" as const)
      : ("market_quotes" as const);

  return {
    items: normalized.map((x, i) => {
      const valueEur = allocations[i] ?? 0;
      const qty = Number.isFinite(x.price) && (x.price as number) > 0 ? roundQty(valueEur / (x.price as number)) : null;
      return {
        symbol: x.symbol,
        name: x.name,
        weight: x.weight,
        rationale: x.rationale,
        value_eur: valueEur,
        qty,
        price: Number.isFinite(x.price) ? (x.price as number) : null,
        price_ts: Number.isFinite(x.priceTs) ? (x.priceTs as number) : null,
        price_source: x.priceSource,
        prev_close: Number.isFinite(x.prevClose) ? (x.prevClose as number) : null,
        volume: Number.isFinite(x.volume) ? (x.volume as number) : null,
        avg_volume: Number.isFinite(x.averageVolume) ? (x.averageVolume as number) : null,
      };
    }),
    budgetEur,
    source,
  };
}

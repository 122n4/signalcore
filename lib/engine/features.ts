export type VolatilityRegime = "low" | "medium" | "high";

export type CandleLike = {
  t?: number | null;
  o?: number | null;
  h?: number | null;
  l?: number | null;
  c?: number | null;
  v?: number | null;
};

export type MarketFeatureInput = {
  asset: string;
  marketData?: {
    price?: number | null;
    prevClose?: number | null;
    bid?: number | null;
    ask?: number | null;
    volume?: number | null;
    avgVolume?: number | null;
  } | null;
  historicalCandles?: CandleLike[] | null;
  volatilityMeasures?: {
    realizedVol?: number | null;
    atrPct?: number | null;
    stdevReturns?: number | null;
  } | null;
};

export type MarketFeatures = {
  asset: string;
  trend_score: number;
  momentum_strength: number;
  momentum: number;
  volatility_regime: VolatilityRegime;
  volatility_score: number;
  range_compression: number;
  compression: number;
  liquidity_pressure: number;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function safeNum(x: unknown, fallback = NaN) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function round4(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10_000) / 10_000;
}

function closesFromCandles(candles: CandleLike[]) {
  return candles
    .map((c) => safeNum(c?.c, NaN))
    .filter((x) => Number.isFinite(x) && x > 0);
}

function returnsFromCloses(closes: number[]) {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (!(prev > 0 && cur > 0)) continue;
    out.push(cur / prev - 1);
  }
  return out;
}

function stddev(xs: number[]) {
  if (!xs.length) return 0;
  const mean = xs.reduce((acc, x) => acc + x, 0) / xs.length;
  const variance = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / xs.length;
  return Math.sqrt(Math.max(0, variance));
}

function annualizedVolatilityFromCandles(candles: CandleLike[]) {
  const closes = closesFromCandles(candles);
  if (closes.length < 8) return null;
  const returns = returnsFromCloses(closes).slice(-30);
  if (returns.length < 5) return null;
  return stddev(returns) * Math.sqrt(252);
}

function momentumFromCandles(candles: CandleLike[]) {
  const closes = closesFromCandles(candles);
  if (closes.length < 6) return null;
  const lookback = Math.min(20, closes.length - 1);
  const start = closes[closes.length - 1 - lookback];
  const end = closes[closes.length - 1];
  if (!(start > 0 && end > 0)) return null;
  const raw = end / start - 1;
  return clamp(raw / 0.2, -1, 1);
}

function rangeCompressionFromCandles(candles: CandleLike[]) {
  const ranges = candles
    .map((c) => {
      const h = safeNum(c?.h, NaN);
      const l = safeNum(c?.l, NaN);
      const cpx = safeNum(c?.c, NaN);
      if (!(Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(cpx) && h > 0 && cpx > 0 && h >= l)) return NaN;
      return Math.max(0, (h - l) / cpx);
    })
    .filter((x) => Number.isFinite(x));
  if (ranges.length < 8) return null;
  const recent = ranges.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, ranges.length);
  const baseWindow = ranges.slice(Math.max(0, ranges.length - 18), Math.max(0, ranges.length - 3));
  const base = baseWindow.length
    ? baseWindow.reduce((a, b) => a + b, 0) / baseWindow.length
    : ranges.reduce((a, b) => a + b, 0) / ranges.length;
  if (!(base > 0)) return null;
  return clamp01(1 - recent / base);
}

function liquidityPressure(args: { candles: CandleLike[]; marketData: MarketFeatureInput["marketData"] }) {
  const md = args.marketData ?? {};
  const marketAvg = safeNum(md?.avgVolume, NaN);
  const marketNow = safeNum(md?.volume, NaN);

  const candleVolumes = args.candles
    .map((c) => safeNum(c?.v, NaN))
    .filter((x) => Number.isFinite(x) && x >= 0);
  const avgVolume = Number.isFinite(marketAvg)
    ? marketAvg
    : candleVolumes.length
      ? candleVolumes.reduce((a, b) => a + b, 0) / candleVolumes.length
      : NaN;
  const latestVolume = Number.isFinite(marketNow)
    ? marketNow
    : candleVolumes.length
      ? candleVolumes[candleVolumes.length - 1]
      : NaN;

  const volumePressure =
    Number.isFinite(avgVolume) && Number.isFinite(latestVolume) && avgVolume > 0
      ? clamp01(1 - latestVolume / avgVolume)
      : 0.5;

  const bid = safeNum(md?.bid, NaN);
  const ask = safeNum(md?.ask, NaN);
  const spreadPressure =
    Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0 && ask >= bid
      ? clamp01(((ask - bid) / ((ask + bid) / 2)) / 0.01)
      : 0.5;

  return clamp01(volumePressure * 0.75 + spreadPressure * 0.25);
}

function normalizedVolatilityInput(raw: number | null) {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw > 3) return raw / 100;
  if (raw > 1 && raw <= 3) return raw / 10;
  return raw;
}

function volatilityRegimeFromScore(volatilityScore: number): VolatilityRegime {
  if (volatilityScore < 0.28) return "low";
  if (volatilityScore < 0.62) return "medium";
  return "high";
}

export function extractMarketFeatures(input: MarketFeatureInput): MarketFeatures {
  const candles = Array.isArray(input.historicalCandles) ? input.historicalCandles : [];
  const md = input.marketData ?? {};
  const vm = input.volatilityMeasures ?? {};

  const candleMomentum = momentumFromCandles(candles);
  const price = safeNum(md?.price, NaN);
  const prevClose = safeNum(md?.prevClose, NaN);
  const fallbackMomentum =
    Number.isFinite(price) && Number.isFinite(prevClose) && prevClose > 0
      ? clamp((price / prevClose - 1) / 0.08, -1, 1)
      : 0;
  const momentum = typeof candleMomentum === "number" && Number.isFinite(candleMomentum) ? candleMomentum : fallbackMomentum;

  const volFromCandles = annualizedVolatilityFromCandles(candles);
  const volFromMeasures =
    normalizedVolatilityInput(normalizedVolatilityInput(safeNum(vm?.realizedVol, NaN))) ??
    normalizedVolatilityInput(safeNum(vm?.stdevReturns, NaN)) ??
    normalizedVolatilityInput(safeNum(vm?.atrPct, NaN));
  const volatilityRaw = volFromCandles ?? volFromMeasures ?? 0.18;
  const volatilityScore = clamp01(volatilityRaw / 0.7);
  const volatilityRegime = volatilityRegimeFromScore(volatilityScore);

  const rangeCompression = rangeCompressionFromCandles(candles);
  const compression = typeof rangeCompression === "number" && Number.isFinite(rangeCompression) ? rangeCompression : 0.5;
  const liqPressure = liquidityPressure({ candles, marketData: md });

  // Trend is a bounded structural score, not direction-only.
  const trendScore = clamp01(
    0.5 + momentum * 0.42 + (compression - 0.5) * 0.16 - volatilityScore * 0.12 - liqPressure * 0.12,
  );

  return {
    asset: String(input.asset || "").trim().toUpperCase(),
    trend_score: round4(trendScore),
    momentum_strength: round4(momentum),
    momentum: round4(momentum),
    volatility_regime: volatilityRegime,
    volatility_score: round4(volatilityScore),
    range_compression: round4(compression),
    compression: round4(compression),
    liquidity_pressure: round4(liqPressure),
  };
}

export function extractMarketFeaturesBatch(inputs: MarketFeatureInput[]) {
  const out: Record<string, MarketFeatures> = {};
  for (const input of inputs) {
    const f = extractMarketFeatures(input);
    if (!f.asset) continue;
    out[f.asset] = f;
  }
  return out;
}

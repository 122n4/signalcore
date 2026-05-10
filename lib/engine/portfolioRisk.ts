export type RiskLevel = "low" | "moderate" | "high";

export type PortfolioRiskHolding = {
  asset: string;
  value_eur: number;
  asset_class?: string | null;
  sector?: string | null;
  volatility_pct?: number | null;
};

export type CorrelationCluster = {
  key: string;
  exposure_pct: number;
};

export type PortfolioRiskOutput = {
  risk_level: RiskLevel;
  concentration_warning: boolean;
  diversification_score: number;
  concentration_top1_pct: number;
  concentration_top3_pct: number;
  volatility_exposure_pct: number;
  exposure_by_asset_class: Record<string, number>;
  exposure_by_sector: Record<string, number>;
  correlation_clusters: CorrelationCluster[];
};

function round2(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function clamp(x: number, min: number, max: number) {
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function normSymbol(x: unknown) {
  return String(x || "").trim().toUpperCase();
}

function isBondLike(symbol: string) {
  return /AGGH|BND|TLT|IEF|LQD|BOND|IBGL|SHY|VGIT|BIL/.test(symbol);
}

function isCommodityLike(symbol: string) {
  return /GLD|IAU|SLV|DBC|USO|XAU|GOLD|SILVER|PDBC/.test(symbol);
}

function inferAssetClass(symbol: string, provided?: string | null) {
  const explicit = String(provided || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (isBondLike(symbol)) return "bond";
  if (isCommodityLike(symbol)) return "commodity";
  return "equity";
}

function inferSector(symbol: string, provided?: string | null) {
  const explicit = String(provided || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (/NVDA|AAPL|MSFT|QQQ|XLK|SOXX|AMD|META|GOOG|GOOGL|TSM/.test(symbol)) return "technology";
  if (/JPM|BAC|GS|MS|XLF|VFH/.test(symbol)) return "financials";
  if (/XLE|CVX|XOM|USO/.test(symbol)) return "energy";
  if (/XLV|VHT|JNJ|PFE|MRK|UNH/.test(symbol)) return "healthcare";
  if (/XLP|PG|KO|PEP|WMT/.test(symbol)) return "consumer_defensive";
  if (isBondLike(symbol)) return "fixed_income";
  if (isCommodityLike(symbol)) return "commodities";
  return "broad_market";
}

function defaultVolatilityByClass(assetClass: string) {
  if (assetClass === "bond") return 8;
  if (assetClass === "commodity") return 24;
  return 20; // equity / unknown
}

function addPct(map: Record<string, number>, key: string, pct: number) {
  const k = key || "unknown";
  map[k] = round2((map[k] || 0) + pct);
}

export function computePortfolioRisk(args: {
  holdings: PortfolioRiskHolding[];
  total_value_eur?: number | null;
}): PortfolioRiskOutput {
  const holdings = Array.isArray(args.holdings) ? args.holdings : [];
  const values = holdings.map((h) => Math.max(0, Number(h.value_eur || 0)));
  const sumValues = values.reduce((a, b) => a + b, 0);
  const total = Math.max(0.000001, Number(args.total_value_eur || sumValues || 1));

  const weighted = holdings.map((h) => {
    const asset = normSymbol(h.asset);
    const valueEur = Math.max(0, Number(h.value_eur || 0));
    const exposure = (valueEur / total) * 100;
    const assetClass = inferAssetClass(asset, h.asset_class);
    const sector = inferSector(asset, h.sector);
    const vol = Number.isFinite(Number(h.volatility_pct))
      ? clamp(Number(h.volatility_pct), 0, 200)
      : defaultVolatilityByClass(assetClass);
    return { asset, valueEur, exposure, assetClass, sector, vol };
  });

  const sortedExposure = [...weighted].sort((a, b) => b.exposure - a.exposure);
  const top1 = sortedExposure[0]?.exposure || 0;
  const top3 = sortedExposure.slice(0, 3).reduce((acc, row) => acc + row.exposure, 0);

  const exposureByAssetClass: Record<string, number> = {};
  const exposureBySector: Record<string, number> = {};
  const clusterMap: Record<string, number> = {};
  let volatilityExposure = 0;

  for (const row of weighted) {
    addPct(exposureByAssetClass, row.assetClass, row.exposure);
    addPct(exposureBySector, row.sector, row.exposure);
    addPct(clusterMap, `${row.assetClass}:${row.sector}`, row.exposure);
    volatilityExposure += (row.exposure / 100) * row.vol;
  }

  const clusters = Object.entries(clusterMap)
    .map(([key, exposure]) => ({ key, exposure_pct: round2(exposure) }))
    .sort((a, b) => b.exposure_pct - a.exposure_pct);
  const dominantClassPct = Math.max(0, ...Object.values(exposureByAssetClass));

  const concentrationWarning = top1 > 24 || top3 > 68;

  const classCount = Object.keys(exposureByAssetClass).length;
  const sectorCount = Object.keys(exposureBySector).length;
  const diversificationScoreRaw =
    100 -
    top1 * 0.92 -
    top3 * 0.34 -
    dominantClassPct * 0.45 -
    volatilityExposure * 0.4 +
    classCount * 7 +
    Math.min(6, sectorCount) * 3;
  const diversificationScore = round2(clamp(diversificationScoreRaw, 0, 100));

  let riskLevel: RiskLevel = "low";
  if (
    concentrationWarning ||
    top1 > 35 ||
    top3 > 78 ||
    dominantClassPct > 72 ||
    volatilityExposure >= 34 ||
    diversificationScore < 42
  ) {
    riskLevel = "high";
  } else if (
    top1 > 22 ||
    top3 > 60 ||
    dominantClassPct > 55 ||
    volatilityExposure >= 22 ||
    diversificationScore < 65
  ) {
    riskLevel = "moderate";
  }

  return {
    risk_level: riskLevel,
    concentration_warning: concentrationWarning,
    diversification_score: diversificationScore,
    concentration_top1_pct: round2(top1),
    concentration_top3_pct: round2(top3),
    volatility_exposure_pct: round2(volatilityExposure),
    exposure_by_asset_class: exposureByAssetClass,
    exposure_by_sector: exposureBySector,
    correlation_clusters: clusters.slice(0, 8),
  };
}

import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  TradingProductCoverageSource,
  TradingProductCoverageStatus,
  TradingProductMarketCoverage,
} from "@/lib/trading/marketCoverageTypes";

type TradingMarketCoverageCatalog = {
  coverage_backed?: string[];
  staged_only?: string[];
};

const TRADING_MARKET_COVERAGE_CATALOG_PATH = path.resolve(
  process.cwd(),
  "config/trading-research/market-coverage-catalog.json",
);
const TRADING_MARKET_STAGING_CATALOG_PATH = path.resolve(
  process.cwd(),
  "config/trading-research/market-staging-catalog.json",
);
const TRADING_PRODUCT_COVERAGE_CACHE_TTL_MS = 5 * 60_000;

let tradingProductCoverageCache:
  | {
      exp: number;
      value: Map<string, TradingProductMarketCoverage>;
    }
  | null = null;

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeInstrument(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function buildCoverageRecord(args: {
  instrument: string;
  status: TradingProductCoverageStatus;
  source: TradingProductCoverageSource;
}): TradingProductMarketCoverage {
  if (args.status === "coverage_backed") {
    return {
      instrument: args.instrument,
      status: args.status,
      source: args.source,
      label: "Coverage-backed",
      detail: "Backed by the curated Syntrake market coverage catalog.",
    };
  }

  if (args.status === "staged_only") {
    return {
      instrument: args.instrument,
      status: args.status,
      source: args.source,
      label: "Staged / live",
      detail: "Prepared for expansion and visible in the live scanner, but not yet research-backed.",
    };
  }

  return {
    instrument: args.instrument,
    status: args.status,
    source: args.source,
    label: "Live-only",
    detail: "Visible via live scanner only. Research coverage is not audited yet.",
  };
}

export async function readTradingProductCoverageMap() {
  if (tradingProductCoverageCache && tradingProductCoverageCache.exp > Date.now()) {
    return tradingProductCoverageCache.value;
  }

  const coverageMap = new Map<string, TradingProductMarketCoverage>();
  const coverageCatalog =
    await readJsonIfExists<TradingMarketCoverageCatalog>(TRADING_MARKET_COVERAGE_CATALOG_PATH);
  const stagingCatalog =
    await readJsonIfExists<{ markets?: Array<{ instrument?: string }> }>(
      TRADING_MARKET_STAGING_CATALOG_PATH,
    );

  for (const instrument of coverageCatalog?.coverage_backed ?? []) {
    const normalizedInstrument = normalizeInstrument(instrument);
    if (!normalizedInstrument) continue;
    coverageMap.set(
      normalizedInstrument,
      buildCoverageRecord({
        instrument: normalizedInstrument,
        status: "coverage_backed",
        source: "dataset_health",
      }),
    );
  }

  for (const instrument of coverageCatalog?.staged_only ?? []) {
    const normalizedInstrument = normalizeInstrument(instrument);
    if (!normalizedInstrument || coverageMap.has(normalizedInstrument)) continue;
    coverageMap.set(
      normalizedInstrument,
      buildCoverageRecord({
        instrument: normalizedInstrument,
        status: "staged_only",
        source: "staging_catalog",
      }),
    );
  }

  for (const market of stagingCatalog?.markets ?? []) {
    const normalizedInstrument = normalizeInstrument(market.instrument);
    if (!normalizedInstrument || coverageMap.has(normalizedInstrument)) continue;
    coverageMap.set(
      normalizedInstrument,
      buildCoverageRecord({
        instrument: normalizedInstrument,
        status: "staged_only",
        source: "staging_catalog",
      }),
    );
  }

  tradingProductCoverageCache = {
    exp: Date.now() + TRADING_PRODUCT_COVERAGE_CACHE_TTL_MS,
    value: coverageMap,
  };

  return coverageMap;
}

export function resolveTradingProductCoverage(
  instrument: string,
  coverageMap?: Map<string, TradingProductMarketCoverage> | null,
): TradingProductMarketCoverage {
  const normalizedInstrument = normalizeInstrument(instrument);
  const resolved = coverageMap?.get(normalizedInstrument);

  if (resolved) {
    return resolved;
  }

  return buildCoverageRecord({
    instrument: normalizedInstrument,
    status: "live_only",
    source: "scanner_default",
  });
}

// lib/signalcore/valuation.ts

type Quote = {
  price: number;
  ts: number; // unix seconds
  source: string;
  currency?: string | null;
  prevClose?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
  averageVolume?: number | null;
};

import { isDirectProviderQuoteSource } from "@/lib/signalcore/quoteQuality";

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function normSymbol(x: any) {
  return String(x || "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * We treat numbers as EUR in MVP.
 * When currency conversion exists, we’ll map via FX layer.
 */
export function computePortfolioValuation(args: {
  cashEur: number;
  items: Array<{ symbol: string; qty?: number | null; valueEur?: number | null; value_eur?: number | null }>;
  quotes: Record<string, Quote>;
}) {
  const cashEur = safeNum(args.cashEur, 0);
  const items = Array.isArray(args.items) ? args.items : [];
  const quotes = args.quotes || {};

  let pricedCount = 0;
  let livePricedCount = 0;
  let manualValuedCount = 0;
  const totalCount = items.length;

  const missingSymbols: string[] = [];
  const missingLiveSymbols: string[] = [];
  let totalHoldingsEur = 0;
  let maxAgeSec = 0;

  for (const it of items) {
    const symbol = normSymbol(it?.symbol);
    if (!symbol) continue;

    // If valueEur already exists on item, use it for valuation.
    const explicitValue =
      it?.valueEur != null
        ? safeNum(it.valueEur, NaN)
        : it?.value_eur != null
          ? safeNum(it.value_eur, NaN)
          : NaN;

    const q = quotes[symbol];
    const price = q ? safeNum(q.price, NaN) : NaN;
    const qty = it?.qty == null ? NaN : safeNum(it.qty, NaN);
    const hasPriceReference = Number.isFinite(price) && price > 0 && Number.isFinite(qty);
    const hasLiveQuote = hasPriceReference && isDirectProviderQuoteSource(q?.source);

    if (Number.isFinite(explicitValue)) {
      totalHoldingsEur += Math.max(0, explicitValue);
      pricedCount += 1;
      manualValuedCount += 1;
      if (hasLiveQuote) {
        livePricedCount += 1;
      } else {
        missingLiveSymbols.push(symbol);
      }
      continue;
    }

    if (hasPriceReference) {
      totalHoldingsEur += Math.max(0, price * qty);
      pricedCount += 1;
      if (hasLiveQuote) {
        livePricedCount += 1;
      } else {
        missingLiveSymbols.push(symbol);
      }

      if (hasLiveQuote) {
        const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - (q.ts || 0));
        if (Number.isFinite(ageSec) && ageSec > maxAgeSec) maxAgeSec = ageSec;
      }
    } else {
      missingSymbols.push(symbol);
      missingLiveSymbols.push(symbol);
    }
  }

  const totalEur = Math.max(0, cashEur + totalHoldingsEur);

  // Coverage: % of holdings we can price OR have explicit value for
  const coveragePct = totalCount > 0 ? Math.round((pricedCount / totalCount) * 100) : 0;
  // Coverage from live market quotes only (manual values excluded).
  const liveCoveragePct = totalCount > 0 ? Math.round((livePricedCount / totalCount) * 100) : 0;
  const manualCoveragePct = totalCount > 0 ? Math.round((manualValuedCount / totalCount) * 100) : 0;

  return {
    cashEur,
    totalHoldingsEur,
    totalEur,

    pricedCount,
    livePricedCount,
    manualValuedCount,
    totalCount,
    coveragePct,
    liveCoveragePct,
    manualCoveragePct,

    missingSymbols,
    missingLiveSymbols,
    priceAgeSeconds: maxAgeSec,
  };
}

export function computeQuoteCoverage(args: {
  symbols: string[];
  quotes: Record<string, Quote>;
}) {
  const symbols = Array.isArray(args.symbols)
    ? Array.from(new Set(args.symbols.map(normSymbol).filter(Boolean)))
    : [];
  const quotes = args.quotes || {};

  let quotedCount = 0;
  let maxAgeSec = 0;
  const missingSymbols: string[] = [];

  for (const symbol of symbols) {
    const q = quotes[symbol];
    const price = q ? safeNum(q.price, NaN) : NaN;

    if (Number.isFinite(price) && price > 0) {
      quotedCount += 1;
      const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - (q.ts || 0));
      if (Number.isFinite(ageSec) && ageSec > maxAgeSec) maxAgeSec = ageSec;
    } else {
      missingSymbols.push(symbol);
    }
  }

  const totalCount = symbols.length;
  const coveragePct = totalCount > 0 ? Math.round((quotedCount / totalCount) * 100) : 0;

  return {
    totalCount,
    quotedCount,
    coveragePct,
    missingSymbols,
    priceAgeSeconds: maxAgeSec,
  };
}

export function computeFocusQuoteCoverage(args: {
  focusInstrument?: string | null;
  symbols: string[];
  quotes: Record<string, Quote>;
}) {
  const focusInstrument = normSymbol(args.focusInstrument);
  const scopedSymbols = focusInstrument ? [focusInstrument] : args.symbols;
  const base = computeQuoteCoverage({
    symbols: scopedSymbols,
    quotes: args.quotes,
  });

  return {
    ...base,
    scope: focusInstrument ? ("focus_instrument" as const) : ("tracked_universe" as const),
    focusInstrument: focusInstrument || null,
  };
}

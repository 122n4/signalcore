import { normalizeMode, type AutopilotMode } from "@/lib/signalcore/modes";
import type { BuildEngineContextSources, EngineContext, EngineContextHolding, EngineQuoteLite } from "./types";

function asNum(value: any, fallback = 0) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNum(value: any) {
  const n = asNum(value, NaN);
  return Number.isFinite(n) ? n : null;
}

function asBool(value: any, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(v)) return true;
    if (["0", "false", "no", "n"].includes(v)) return false;
  }
  return fallback;
}

function asStr(value: any) {
  const s = String(value ?? "").trim();
  return s.length > 0 ? s : null;
}

function normSymbol(value: any) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function pickNumber(obj: Record<string, any> | null | undefined, keys: string[]) {
  if (!obj) return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const n = asNullableNum((obj as any)[key]);
      if (n != null) return n;
    }
  }
  return null;
}

function pickString(obj: Record<string, any> | null | undefined, keys: string[]) {
  if (!obj) return null;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const s = asStr((obj as any)[key]);
      if (s) return s;
    }
  }
  return null;
}

function pickSeverity(value: any): "low" | "medium" | "high" | null {
  const s = String(value || "").trim().toLowerCase();
  if (s === "low" || s === "medium" || s === "high") return s;
  return null;
}

function normalizePortfolioItems(items: Array<Record<string, any>> | null | undefined): EngineContextHolding[] {
  const rows = Array.isArray(items) ? items : [];
  return rows
    .map((row) => {
      const symbol = normSymbol((row as any)?.symbol);
      if (!symbol) return null;
      const item: EngineContextHolding = {
        id: asStr((row as any)?.id),
        symbol,
        name: asStr((row as any)?.name),
        qty: asNullableNum((row as any)?.qty),
        valueEur: pickNumber(row, ["valueEur", "value_eur"]),
      };
      return item;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aa = a as EngineContextHolding;
      const bb = b as EngineContextHolding;
      if (aa.symbol !== bb.symbol) return aa.symbol.localeCompare(bb.symbol);
      return String(aa.id || "").localeCompare(String(bb.id || ""));
    }) as EngineContextHolding[];
}

function normalizeQuotes(quotes: Record<string, any> | null | undefined) {
  const src = quotes && typeof quotes === "object" ? quotes : {};
  const out: Record<string, EngineQuoteLite> = {};
  for (const key of Object.keys(src).sort()) {
    const symbol = normSymbol(key);
    if (!symbol) continue;
    const q = (src as any)[key] || {};
    out[symbol] = {
      price: asNullableNum(q?.price),
      ts: asNullableNum(q?.ts),
      source: asStr(q?.source),
    };
  }
  return out;
}

export function buildEngineContext(sources: BuildEngineContextSources): EngineContext {
  const asOf = asStr(sources?.asOf) || new Date().toISOString();
  const mode: AutopilotMode = normalizeMode(sources?.mode);
  const planRaw = (sources?.plan && typeof sources.plan === "object" ? sources.plan : null) as Record<string, any> | null;
  const valuation = (sources?.valuation && typeof sources.valuation === "object"
    ? sources.valuation
    : null) as Record<string, any> | null;
  const items = normalizePortfolioItems(sources?.portfolioItems ?? []);
  const quotes = normalizeQuotes(sources?.quotes ?? {});

  const coverageFromValuation = pickNumber(valuation, ["liveCoveragePct", "coverage_live_pct", "coveragePct"]);
  const coveragePct = Math.max(0, Math.min(100, Math.round(coverageFromValuation ?? 0)));
  const quoteCount = Object.values(quotes).filter((q) => q?.price != null && Number(q.price) > 0).length;
  const livePricedHoldings = items.filter((item) => {
    const q = quotes[item.symbol];
    const priceOk = q?.price != null && Number(q.price) > 0;
    const qtyOk = item.qty != null && Number.isFinite(Number(item.qty));
    return priceOk && qtyOk;
  }).length;
  const missingCount = Math.max(0, items.length - Math.min(items.length, livePricedHoldings));
  const dataQualityStatus = coveragePct >= 80 ? "good" : coveragePct >= 50 ? "limited" : "poor";

  const planStatus = pickString(planRaw, ["status"]);
  const hasPlan =
    !!planRaw &&
    (asBool((planRaw as any)?.is_active) ||
      String((planStatus || "")).toLowerCase() === "active" ||
      asStr((planRaw as any)?.id) != null);

  const targetEur = pickNumber(planRaw, ["targetEur", "target_eur", "goal_target_eur", "target_value", "targetValueEur"]);
  const monthlyContributionEur = pickNumber(planRaw, [
    "monthlyContributionEur",
    "monthly_contribution_eur",
    "monthly_amount_eur",
    "monthly",
  ]);
  const horizonMonths = pickNumber(planRaw, ["horizonMonths", "months", "duration_months", "horizon_months"]);

  const cashEurRaw = sources?.portfolioCashEur ?? pickNumber(valuation, ["cashEur", "cash_eur"]);
  const totalEurRaw = pickNumber(valuation, ["totalEur", "total_eur", "totalValueEur"]);
  const cashEur = Math.max(0, Math.round(asNum(cashEurRaw, 0) * 100) / 100);
  const totalValueEur = Math.max(0, Math.round(asNum(totalEurRaw, cashEur) * 100) / 100);

  const daily = (sources?.dailyState || {}) as Record<string, any>;
  const reliability = (sources?.reliability || {}) as Record<string, any>;
  const setupStatus = String(sources?.setupStatus || "").trim().toLowerCase();

  const executionRate7d = reliability.executionRate7d == null ? null : Math.max(0, Math.min(1, Number(reliability.executionRate7d)));
  const closeDayRate7d = reliability.closeDayRate7d == null ? null : Math.max(0, Math.min(1, Number(reliability.closeDayRate7d)));
  const dataCoveragePct =
    reliability.dataCoveragePct == null
      ? coveragePct
      : Math.max(0, Math.min(100, Math.round(Number(reliability.dataCoveragePct))));

  return {
    userId: String(sources?.userId || "").trim(),
    mode,
    asOf,
    setupComplete: setupStatus ? setupStatus === "complete" : hasPlan,
    plan: {
      hasPlan,
      id: asStr((planRaw as any)?.id),
      status: planStatus,
      goal: pickString(planRaw, ["goal", "goal_label", "objective"]),
      targetEur,
      monthlyContributionEur,
      horizonMonths: horizonMonths == null ? null : Math.max(0, Math.round(horizonMonths)),
      raw: planRaw,
    },
    portfolio: {
      hasHoldings: items.length > 0,
      items,
      holdingsCount: items.length,
      cashEur,
      totalValueEur,
      coveragePct,
    },
    market: {
      source: "daily-bundle-cache",
      quotes,
      dataQuality: {
        status: dataQualityStatus,
        coveragePct,
        quoteCount,
        missingCount,
      },
    },
    dayState: {
      doneToday: !!daily.doneToday,
      receiptsCount: Math.max(0, Math.round(Number(daily.receiptsCount || 0))),
      streak: Math.max(0, Math.round(Number(daily.streak || 0))),
      lastSnapshotAt: asStr(daily.lastSnapshotAt),
      lastProofAt: asStr(daily.lastProofAt),
      lastProofQuality:
        daily.lastProofQuality == null ? null : Math.max(0, Math.min(100, Math.round(Number(daily.lastProofQuality)))),
    },
    reliability: {
      executionRate7d,
      closeDayRate7d,
      dataCoveragePct,
    },
    access: {
      isPro: sources?.access?.isPro == null ? null : !!sources.access.isPro,
      modeAllowed: sources?.access?.modeAllowed == null ? null : !!sources.access.modeAllowed,
    },
    signals: {
      topRiskLeakKey: asStr(sources?.signals?.topRiskLeakKey),
      topRiskLeakTitle: asStr(sources?.signals?.topRiskLeakTitle),
      topRiskLeakSeverity: pickSeverity(sources?.signals?.topRiskLeakSeverity),
    },
  };
}

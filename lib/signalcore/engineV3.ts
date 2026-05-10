// lib/signalcore/engineV3.ts
import type { AutopilotMode } from "@/lib/signalcore/modes";

export type Quote = { price: number; ts: number; source: string; currency?: string | null };

export type PricingInfo = {
  coveragePct: number;          // 0..100
  missingSymbols: string[];     // symbols we couldn't price
  priceAgeSeconds: number;      // max age across usable quotes (conservative)
};

export type Diagnostics = {
  hasPlan: boolean;
  hasHoldings: boolean;

  holdingsCount: number;
  totalEur: number;
  cashEur: number;

  cashDragPct: number; // 0..100
  concentrationTop1Pct: number;
  concentrationTop3Pct: number;

  pricing: PricingInfo;

  changed: {
    totalEurDelta: number;
    cashEurDelta: number;
    holdingsCountDelta: number;
    coveragePctDelta: number;
  };

  riskLeaks: Array<{
    key: string;
    severity: "low" | "med" | "high";
    title: string;
    detail: string;
    // keep backwards compatible; optional metadata:
    fix?: { label: string; action: string; href: string };
  }>;
};

export type Candidate = {
  id: string;
  type: "fix_pricing" | "reduce_concentration" | "reduce_cash_drag" | "hold";
  title: string;
  rationale: string;
  impact: string;
  confidence: number; // process confidence (not return)
  score: number;
  cta?: { label: string; action: string; href: string };
};

export type NBA = {
  title: string;
  desc: string;
  kind: "primary" | "ghost";
  cta: { label: string; action: string; href: string };
};

export type AutopilotScoreV2 = {
  total: number; // 0..100
  safety: number; // 0..100
  growth: number; // 0..100
  reasons: Array<{ delta: number; reason: string }>;
  reasonsShort: string[]; // 2-4 bullets for UI
};

export type DecisionPressureV2 = {
  score: number; // 0..100
  drivers: Array<{ key: string; weight: number; label: string; detail?: string }>;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function safeNum(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : Number(String(x ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function pct(x: number) {
  return clamp(Math.round(x * 100), 0, 100);
}

function normSymbol(x: any) {
  return String(x || "").trim().toUpperCase().replace(/\s+/g, "");
}

function quoteAgeSeconds(q?: Quote | null) {
  if (!q || q.ts == null) return Number.POSITIVE_INFINITY;

  const ts = safeNum(q.ts, NaN);
  if (!Number.isFinite(ts) || ts <= 0) return Number.POSITIVE_INFINITY;

  // tolerate ms or seconds
  const ms = ts > 10_000_000_000 ? ts : ts * 1000;
  const ageMs = Date.now() - ms;
  if (!Number.isFinite(ageMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round(ageMs / 1000));
}

function thresholdsByMode(mode: AutopilotMode) {
  void mode;
  return {
    top1Med: 35,
    top1High: 50,
    cashDragMed: 30,
    cashDragHigh: 50,
    pricingMinOk: 80,
    pricingMinHard: 60,
    priceAgeWarnSec: 60 * 60,
    priceAgeBadSec: 6 * 60 * 60,
  };
}

/**
 * Optional helper (route can use it, but not required):
 * Normalizes quotes dict keys, tolerates lower-case or whitespace.
 */
export function normalizeQuotes(quotes?: Record<string, Quote> | null) {
  const out: Record<string, Quote> = {};
  if (!quotes) return out;
  for (const k of Object.keys(quotes)) {
    const nk = normSymbol(k);
    if (!nk) continue;
    out[nk] = quotes[k] as Quote;
  }
  return out;
}

/**
 * Optional helper (route can use it, but not required):
 * Computes PricingInfo when you have items + quotes and want the engine to decide coverage/staleness.
 */
export function computePricingInfo(args: {
  items: Array<{ symbol: string; qty?: number | null; valueEur?: number | null; value_eur?: number | null }>;
  quotes?: Record<string, Quote>;
}): PricingInfo {
  const items = Array.isArray(args.items) ? args.items : [];
  const quotes = normalizeQuotes(args.quotes);

  let priced = 0;
  const missing: string[] = [];
  const ages: number[] = [];

  for (const it of items) {
    const sym = normSymbol(it.symbol);
    if (!sym) continue;

    const explicit =
      it?.valueEur != null ? safeNum(it.valueEur, NaN)
      : it?.value_eur != null ? safeNum(it.value_eur, NaN)
      : NaN;

    // If user provides explicit EUR value, treat as priced
    if (Number.isFinite(explicit) && explicit > 0) {
      priced++;
      continue;
    }

    const q = quotes[sym];
    const price = q ? safeNum(q.price, NaN) : NaN;
    const qty = it?.qty == null ? NaN : safeNum(it.qty, NaN);

    if (Number.isFinite(price) && price > 0 && Number.isFinite(qty)) {
      priced++;
      const age = quoteAgeSeconds(q);
      if (Number.isFinite(age) && age !== Number.POSITIVE_INFINITY) ages.push(age);
    } else {
      missing.push(sym);
    }
  }

  const total = items.length || 0;
  const coveragePct = total === 0 ? 0 : clamp(Math.round((priced / total) * 100), 0, 100);

  // Conservative: use max age
  const priceAgeSeconds = ages.length ? Math.max(...ages) : 0;

  return { coveragePct, missingSymbols: missing.slice(0, 25), priceAgeSeconds };
}

function computeWeights(args: {
  cashEur: number;
  items: Array<{ symbol: string; qty?: number | null; valueEur?: number | null; value_eur?: number | null }>;
  quotes?: Record<string, Quote>;
}) {
  const cash = Math.max(0, safeNum(args.cashEur, 0));
  const items = Array.isArray(args.items) ? args.items : [];
  const quotes = normalizeQuotes(args.quotes);

  const values: Array<{ symbol: string; v: number; priceable: boolean }> = [];

  for (const it of items) {
    const sym = normSymbol(it.symbol);
    if (!sym) continue;

    const explicit =
      it?.valueEur != null ? safeNum(it.valueEur, NaN)
      : it?.value_eur != null ? safeNum(it.value_eur, NaN)
      : NaN;

    if (Number.isFinite(explicit)) {
      values.push({ symbol: sym, v: Math.max(0, explicit), priceable: true });
      continue;
    }

    const q = quotes[sym];
    const price = q ? safeNum(q.price, NaN) : NaN;
    const qty = it?.qty == null ? NaN : safeNum(it.qty, NaN);

    if (Number.isFinite(price) && price > 0 && Number.isFinite(qty)) {
      values.push({ symbol: sym, v: Math.max(0, price * qty), priceable: true });
    } else {
      values.push({ symbol: sym, v: 0, priceable: false });
    }
  }

  const holdingsValue = values.reduce((s, x) => s + x.v, 0);
  const total = cash + holdingsValue;

  const w = values
    .map((x) => ({ ...x, w: total > 0 ? x.v / total : 0 }))
    .sort((a, b) => b.w - a.w);

  const top1 = w[0]?.w ?? 0;
  const top3 = (w[0]?.w ?? 0) + (w[1]?.w ?? 0) + (w[2]?.w ?? 0);

  return {
    totalEur: Math.max(0, total),
    holdingsValue,
    top1Pct: pct(top1),
    top3Pct: pct(top3),
    cashDragPct: total > 0 ? pct(cash / total) : 0,
  };
}

export function computeDiagnostics(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  cashEur: number;
  items: Array<{ symbol: string; qty?: number | null; valueEur?: number | null; value_eur?: number | null }>;
  pricing: PricingInfo;
  quotes?: Record<string, Quote>;
  yesterday?: { total_eur?: number | null; cash_eur?: number | null; holdingsCount?: number | null; coveragePct?: number | null };
}): Diagnostics {
  const hasHoldings = (args.items?.length ?? 0) > 0;
  const cashEur = Math.max(0, safeNum(args.cashEur, 0));
  const t = thresholdsByMode(args.mode);

  const w = computeWeights({ cashEur, items: args.items, quotes: args.quotes });

  // Ensure pricing is sane
  const pricing: PricingInfo = {
    coveragePct: clamp(safeNum(args.pricing?.coveragePct, 0), 0, 100),
    missingSymbols: Array.isArray(args.pricing?.missingSymbols) ? args.pricing.missingSymbols.map(normSymbol).filter(Boolean).slice(0, 25) : [],
    priceAgeSeconds: Math.max(0, safeNum(args.pricing?.priceAgeSeconds, 0)),
  };

  const leaks: Diagnostics["riskLeaks"] = [];

  // Safety-first prerequisites
  if (!args.hasPlan) {
    leaks.push({
      key: "no_plan",
      severity: "high",
      title: "No active plan",
      detail: "Safety Brain needs constraints (goal/risk/horizon) before operating.",
      fix: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${args.mode}` },
    });
  } else if (args.hasPlan && !hasHoldings) {
    leaks.push({
      key: "no_holdings",
      severity: "high",
      title: "No holdings",
      detail: "Autopilot can’t scan drift/leaks without holdings.",
      fix: { label: "Go to Portfolio", action: "go_portfolio", href: `/app?tab=portfolio&mode=${args.mode}` },
    });
  }

  // Data quality leaks
  if (hasHoldings && pricing.coveragePct < t.pricingMinOk) {
    leaks.push({
      key: "pricing_low",
      severity: pricing.coveragePct < t.pricingMinHard ? "high" : "med",
      title: "Pricing coverage low",
      detail: `Only ${pricing.coveragePct}% of holdings are priced. Add qty/value or supported symbols.`,
      fix: { label: "Fix Portfolio", action: "open_portfolio", href: `/app?tab=portfolio&mode=${args.mode}` },
    });
  }

  if (hasHoldings && pricing.priceAgeSeconds > t.priceAgeBadSec) {
    leaks.push({
      key: "pricing_stale_high",
      severity: "high",
      title: "Pricing looks stale",
      detail: `Latest prices are ~${Math.round(pricing.priceAgeSeconds / 60)}m old. Decisions may be degraded.`,
      fix: { label: "Refresh", action: "refresh", href: `/app?tab=daily&mode=${args.mode}` },
    });
  } else if (hasHoldings && pricing.priceAgeSeconds > t.priceAgeWarnSec) {
    leaks.push({
      key: "pricing_stale_med",
      severity: "med",
      title: "Pricing may be delayed",
      detail: `Latest prices are ~${Math.round(pricing.priceAgeSeconds / 60)}m old.`,
      fix: { label: "Refresh", action: "refresh", href: `/app?tab=daily&mode=${args.mode}` },
    });
  }

  // Concentration & cash discipline
  if (hasHoldings && w.top1Pct >= t.top1High) {
    leaks.push({
      key: "concentration_high",
      severity: "high",
      title: "High concentration",
      detail: `Top holding is ~${w.top1Pct}% of total.`,
      fix: { label: "Review holdings", action: "review_portfolio", href: `/app?tab=portfolio&mode=${args.mode}` },
    });
  } else if (hasHoldings && w.top1Pct >= t.top1Med) {
    leaks.push({
      key: "concentration_med",
      severity: "med",
      title: "Concentration risk",
      detail: `Top holding is ~${w.top1Pct}% of total.`,
      fix: { label: "Review holdings", action: "review_portfolio", href: `/app?tab=portfolio&mode=${args.mode}` },
    });
  }

  if (hasHoldings && w.cashDragPct >= t.cashDragHigh) {
    leaks.push({
      key: "cash_drag_high",
      severity: "high",
      title: "Excess cash drag",
      detail: `Cash is ~${w.cashDragPct}% of total. Compounding is muted.`,
      fix: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${args.mode}` },
    });
  } else if (hasHoldings && w.cashDragPct >= t.cashDragMed) {
    leaks.push({
      key: "cash_drag_med",
      severity: "med",
      title: "Cash drag",
      detail: `Cash is ~${w.cashDragPct}% of total.`,
      fix: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${args.mode}` },
    });
  }

  // Basic sanity leak
  if (args.hasPlan && hasHoldings && w.totalEur <= 0) {
    leaks.push({
      key: "valuation_zero",
      severity: "high",
      title: "Portfolio valuation missing",
      detail: "Total appears to be 0. Add values/qty+pricing so the engine can operate.",
      fix: { label: "Fix Portfolio", action: "open_portfolio", href: `/app?tab=portfolio&mode=${args.mode}` },
    });
  }

  // Change deltas (for receipts/proof)
  const y = args.yesterday ?? {};
  const changed = {
    totalEurDelta: Math.round(w.totalEur - safeNum(y.total_eur, w.totalEur)),
    cashEurDelta: Math.round(cashEur - safeNum(y.cash_eur, cashEur)),
    holdingsCountDelta: (args.items?.length ?? 0) - (Number(y.holdingsCount) || (args.items?.length ?? 0)),
    coveragePctDelta: (pricing.coveragePct ?? 0) - (Number(y.coveragePct) || (pricing.coveragePct ?? 0)),
  };

  // Leak ordering: severity first, then priority
  const sevRank = (s: "low" | "med" | "high") => (s === "high" ? 3 : s === "med" ? 2 : 1);
  const keyRank: Record<string, number> = {
    no_plan: 100,
    no_holdings: 95,
    valuation_zero: 90,
    pricing_low: 85,
    pricing_stale_high: 80,
    pricing_stale_med: 75,
    concentration_high: 60,
    concentration_med: 55,
    cash_drag_high: 45,
    cash_drag_med: 40,
  };

  leaks.sort((a, b) => (sevRank(b.severity) - sevRank(a.severity)) || ((keyRank[b.key] ?? 0) - (keyRank[a.key] ?? 0)));

  return {
    hasPlan: args.hasPlan,
    hasHoldings,
    holdingsCount: args.items?.length ?? 0,
    totalEur: w.totalEur,
    cashEur,
    cashDragPct: w.cashDragPct,
    concentrationTop1Pct: w.top1Pct,
    concentrationTop3Pct: w.top3Pct,
    pricing,
    changed,
    riskLeaks: leaks,
  };
}

export function buildCandidates(args: { mode: AutopilotMode; diagnostics: Diagnostics }): Candidate[] {
  const d = args.diagnostics;
  const mode = args.mode;
  const t = thresholdsByMode(mode);

  const out: Candidate[] = [];

  // If prerequisites missing, don't spam candidates — keep it crisp & actionable
  if (!d.hasPlan) {
    out.push({
      id: "hold",
      type: "hold",
      title: "Activate your plan first",
      rationale: "Guardrails are required before the engine can operate safely.",
      impact: "Unlocks Safety Brain constraints",
      confidence: 0.95,
      score: 99,
      cta: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${mode}` },
    });
    return out;
  }

  if (d.hasPlan && !d.hasHoldings) {
    out.push({
      id: "hold",
      type: "hold",
      title: "Add holdings to unlock monitoring",
      rationale: "Holdings are needed to scan concentration, pricing and leaks.",
      impact: "Unlocks risk checks + daily decisions",
      confidence: 0.92,
      score: 98,
      cta: { label: "Go to Portfolio", action: "go_portfolio", href: `/app?tab=portfolio&mode=${mode}` },
    });
    return out;
  }

  // FIX FIRST: missing/stale pricing (data quality gate)
  if (d.pricing.coveragePct < t.pricingMinOk || d.pricing.priceAgeSeconds > t.priceAgeBadSec) {
    const stale = d.pricing.priceAgeSeconds > t.priceAgeBadSec;
    out.push({
      id: "fix_pricing",
      type: "fix_pricing",
      title: stale ? "Refresh / fix pricing inputs" : "Fix missing pricing",
      rationale: stale
        ? `Prices look stale (~${Math.round(d.pricing.priceAgeSeconds / 60)}m). Better data = better decisions.`
        : `Coverage is ${d.pricing.coveragePct}%. Better pricing = better engine decisions.`,
      impact: "Raises decision quality and unlocks stronger candidates.",
      confidence: 0.9,
      score: 92 + (stale ? 8 : clamp((t.pricingMinOk - d.pricing.coveragePct), 0, 12)),
      cta: { label: "Open Portfolio", action: "open_portfolio", href: `/app?tab=portfolio&mode=${mode}` },
    });
  }

  // Reduce concentration
  if (d.concentrationTop1Pct >= t.top1Med) {
    const high = d.concentrationTop1Pct >= t.top1High;
    out.push({
      id: "reduce_concentration",
      type: "reduce_concentration",
      title: high ? "Reduce high concentration" : "Reduce concentration",
      rationale: `Top holding is ~${d.concentrationTop1Pct}% of total.`,
      impact: "Lowers drawdown risk and improves plan coherence.",
      confidence: high ? 0.84 : 0.78,
      score: (high ? 86 : 78) + Math.round((d.concentrationTop1Pct - t.top1Med) * 0.6),
      cta: { label: "Review holdings", action: "review_portfolio", href: `/app?tab=portfolio&mode=${mode}` },
    });
  }

  // Reduce cash drag / deploy idle cash (disciplined)
  if (d.cashDragPct >= t.cashDragMed) {
    const high = d.cashDragPct >= t.cashDragHigh;
    out.push({
      id: "reduce_cash_drag",
      type: "reduce_cash_drag",
      title: high ? "Deploy idle cash (disciplined)" : "Reduce cash drag",
      rationale: `Cash is ~${d.cashDragPct}% of portfolio.`,
      impact: "Improves compounding potential while staying inside guardrails.",
      confidence: 0.76,
      score: (high ? 74 : 64) + Math.round((d.cashDragPct - t.cashDragMed) * 0.7),
      cta: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${mode}` },
    });
  }

  // Quiet day = explicit HOLD (institutional discipline)
  if (out.length === 0) {
    out.push({
      id: "hold",
      type: "hold",
      title: "Hold (discipline)",
      rationale: "No urgent leaks detected. Stability is a decision.",
      impact: "Avoids overtrading and protects compounding.",
      confidence: 0.86,
      score: 58,
      cta: { label: "Close the day", action: "mark_done", href: `/app?tab=daily&mode=${mode}` },
    });
  }

  // Max 3, sorted by score
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function buildNBA(args: {
  mode: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  starterPackCount: number;
  candidates: Candidate[];
}): NBA {
  const mode = args.mode;

  if (!args.hasPlan) {
    return {
      title: "Create & activate your plan",
      desc: "Safety Brain needs constraints before doing anything.",
      kind: "primary",
      cta: { label: "Go to Planning", action: "go_planning", href: `/app?tab=planning&mode=${mode}` },
    };
  }

  if (args.hasPlan && !args.hasHoldings) {
    return {
      title: "Add holdings to start compounding",
      desc: "Without holdings, the engine can’t scan drift, concentration, or leaks.",
      kind: "primary",
      cta:
        args.starterPackCount > 0
          ? { label: "Apply Starter Pack", action: "apply_starter_pack", href: `/app?tab=daily&mode=${mode}` }
          : { label: "Go to Portfolio", action: "go_portfolio", href: `/app?tab=portfolio&mode=${mode}` },
    };
  }

  if (args.doneToday) {
    return {
      title: "Done for today",
      desc: "Discipline confirmed. Come back tomorrow.",
      kind: "ghost",
      cta: { label: "Refresh", action: "refresh", href: `/app?tab=daily&mode=${mode}` },
    };
  }

  const top = args.candidates?.[0];

  if (top?.cta) {
    return {
      title: "Next best action",
      desc: `${top.title} — ${top.rationale}`,
      kind: "primary",
      cta: top.cta,
    };
  }

  return {
    title: "Next best action",
    desc: top?.title ? `${top.title} — ${top.rationale}` : "No urgent actions detected today.",
    kind: "primary",
    cta: { label: "Close the day", action: "mark_done", href: `/app?tab=daily&mode=${mode}` },
  };
}

/**
 * Backwards-compatible scoreExplained: route.ts expects {score, why}.
 * We now also include safety/growth & short reasons.
 */
export function scoreExplained(args: {
  mode?: AutopilotMode;
  hasPlan: boolean;
  hasHoldings: boolean;
  doneToday: boolean;
  diagnostics: Diagnostics;
  candidatesCount: number;
}): { score: number; why: Array<{ delta: number; reason: string }>; v2: AutopilotScoreV2 } {
  const mode = (args.mode ?? "investing") as AutopilotMode;
  const d = args.diagnostics;
  const t = thresholdsByMode(mode);

  // SAFETY score (protect capital) — start high, penalize leaks
  let safety = 88;
  const why: Array<{ delta: number; reason: string }> = [];

  if (!args.hasPlan) {
    safety -= 40; why.push({ delta: -40, reason: "No active plan" });
  } else {
    safety += 2; why.push({ delta: +2, reason: "Plan active" });
  }

  if (args.hasPlan && !args.hasHoldings) {
    safety -= 28; why.push({ delta: -28, reason: "No holdings yet" });
  } else if (args.hasHoldings) {
    safety += 2; why.push({ delta: +2, reason: "Holdings present" });
  }

  if (args.hasHoldings) {
    // Pricing gate
    if (d.pricing.coveragePct >= t.pricingMinOk) { safety += 3; why.push({ delta: +3, reason: "Pricing coverage OK" }); }
    if (d.pricing.coveragePct < t.pricingMinHard) { safety -= 14; why.push({ delta: -14, reason: "Pricing coverage low" }); }
    else if (d.pricing.coveragePct < t.pricingMinOk) { safety -= 7; why.push({ delta: -7, reason: "Pricing incomplete" }); }

    if (d.pricing.priceAgeSeconds > t.priceAgeBadSec) { safety -= 14; why.push({ delta: -14, reason: "Pricing stale" }); }
    else if (d.pricing.priceAgeSeconds > t.priceAgeWarnSec) { safety -= 6; why.push({ delta: -6, reason: "Pricing delayed" }); }

    // Concentration
    if (d.concentrationTop1Pct >= t.top1High) { safety -= 18; why.push({ delta: -18, reason: "High concentration" }); }
    else if (d.concentrationTop1Pct >= t.top1Med) { safety -= 9; why.push({ delta: -9, reason: "Concentration risk" }); }

    // Cash drag (safety impact smaller than concentration)
    if (d.cashDragPct >= t.cashDragHigh) { safety -= 9; why.push({ delta: -9, reason: "Excess cash drag" }); }
    else if (d.cashDragPct >= t.cashDragMed) { safety -= 4; why.push({ delta: -4, reason: "Cash drag" }); }
  }

  // Discipline
  if (args.doneToday) { safety += 2; why.push({ delta: +2, reason: "Discipline confirmed today" }); }

  safety = clamp(safety, 0, 100);

  // GROWTH score (compounding readiness) — only meaningful if safety is not broken
  let growth = 46;

  if (args.hasPlan) growth += 12;
  if (args.hasHoldings) growth += 12;

  if (args.hasHoldings) {
    if (d.pricing.coveragePct >= t.pricingMinOk) growth += 6;
    if (d.cashDragPct >= t.cashDragHigh) growth += 6;        // ammo available, but not a free lunch
    else if (d.cashDragPct >= t.cashDragMed) growth += 3;

    if (d.concentrationTop1Pct >= t.top1High) growth -= 10;
    else if (d.concentrationTop1Pct >= t.top1Med) growth -= 5;
  }

  // Quiet day bonus (avoid overtrading)
  if (args.candidatesCount === 0 && args.hasPlan && args.hasHoldings) growth += 6;

  // If safety has high leak, cap growth to avoid "rich vibes" while unsafe
  const topLeak = d.riskLeaks[0];
  if (topLeak?.severity === "high") growth = Math.min(growth, 45);

  growth = clamp(growth, 0, 100);

  // TOTAL: institutional blend (safety dominates)
  const total = clamp(Math.round(safety * 0.65 + growth * 0.35), 0, 100);

  // Short bullets (2-4)
  const reasonsShort: string[] = [];
  if (!args.hasPlan) reasonsShort.push("No plan active → Safety locked");
  else reasonsShort.push("Plan active → guardrails on");

  reasonsShort.push(args.hasHoldings ? `Top holding ~${d.concentrationTop1Pct}%` : "No holdings yet");
  reasonsShort.push(args.hasHoldings ? `Pricing ${d.pricing.coveragePct}% coverage` : "Pricing pending");
  if (topLeak) reasonsShort.push(`Top leak: ${topLeak.title}`);

  const v2: AutopilotScoreV2 = {
    total,
    safety,
    growth,
    reasons: why,
    reasonsShort: reasonsShort.slice(0, 4),
  };

  // keep your existing floor/ceiling behaviour
  return { score: clamp(total, 5, 99), why, v2 };
}

export function computeDecisionPressure(args: { mode: AutopilotMode; diagnostics: Diagnostics; doneToday: boolean }): DecisionPressureV2 {
  const mode = args.mode;
  const d = args.diagnostics;
  const t = thresholdsByMode(mode);

  // If done today, pressure should be low (discipline > action spam)
  if (args.doneToday) {
    return { score: 8, drivers: [{ key: "done_today", weight: 8, label: "Done today", detail: "Discipline confirmed." }] };
  }

  const drivers: DecisionPressureV2["drivers"] = [];

  // Leak-driven pressure: pick up to 2 top leaks (avoid repeating the same idea 5x)
  const sevWeight = (s: "low" | "med" | "high") => (s === "high" ? 40 : s === "med" ? 22 : 10);
  for (const leak of d.riskLeaks.slice(0, 2)) {
    drivers.push({ key: leak.key, weight: sevWeight(leak.severity), label: leak.title, detail: leak.detail });
  }

  // Quant drivers (institutional urgency)
  if (d.hasHoldings) {
    if (d.pricing.coveragePct < t.pricingMinOk) {
      drivers.push({
        key: "pricing_coverage",
        weight: clamp(t.pricingMinOk - d.pricing.coveragePct, 0, 26),
        label: "Low pricing coverage",
        detail: `Coverage ${d.pricing.coveragePct}%`,
      });
    }

    if (d.pricing.priceAgeSeconds > t.priceAgeWarnSec) {
      const w = d.pricing.priceAgeSeconds > t.priceAgeBadSec ? 22 : 12;
      drivers.push({
        key: "pricing_stale",
        weight: w,
        label: "Pricing delayed",
        detail: `Age ~${Math.round(d.pricing.priceAgeSeconds / 60)}m`,
      });
    }

    if (d.concentrationTop1Pct >= t.top1High) {
      drivers.push({ key: "concentration_high", weight: 20, label: "High concentration", detail: `Top ~${d.concentrationTop1Pct}%` });
    } else if (d.concentrationTop1Pct >= t.top1Med) {
      drivers.push({ key: "concentration_med", weight: 12, label: "Concentration risk", detail: `Top ~${d.concentrationTop1Pct}%` });
    }

    if (d.cashDragPct >= t.cashDragHigh) {
      drivers.push({ key: "cash_drag_high", weight: 16, label: "Excess cash drag", detail: `Cash ~${d.cashDragPct}%` });
    } else if (d.cashDragPct >= t.cashDragMed) {
      drivers.push({ key: "cash_drag_med", weight: 9, label: "Cash drag", detail: `Cash ~${d.cashDragPct}%` });
    }
  }

  // Aggregate with diminishing returns (smooth)
  const raw = drivers.reduce((s, x) => s + x.weight, 0);
  const score = clamp(Math.round(100 * (1 - Math.exp(-raw / 65))), 0, 100);

  // keep top 5 drivers by weight for UI
  drivers.sort((a, b) => b.weight - a.weight);

  return { score, drivers: drivers.slice(0, 5) };
}

export function proofFirst(args: { d: Diagnostics }) {
  const d = args.d;
  const bullets: string[] = [];

  if (d.changed.totalEurDelta !== 0) {
    const sign = d.changed.totalEurDelta > 0 ? "+" : "";
    bullets.push(`Portfolio total changed: ${sign}€${d.changed.totalEurDelta}`);
  } else {
    bullets.push("Portfolio total unchanged since yesterday");
  }

  bullets.push(
    d.changed.holdingsCountDelta !== 0
      ? `Holdings changed: ${d.changed.holdingsCountDelta > 0 ? "+" : ""}${d.changed.holdingsCountDelta}`
      : "Holdings count unchanged"
  );

  bullets.push(d.pricing.coveragePct < 100 ? `Pricing coverage: ${d.pricing.coveragePct}%` : "Pricing coverage: 100%");

  const meaning = d.riskLeaks.length
    ? `Risk leak detected: ${d.riskLeaks[0].title}`
    : "No critical leaks detected. Stability is a valid decision.";

  return { whatChanged: bullets.slice(0, 3), meaning };
}

export function decisionReceipt(args: {
  mode: AutopilotMode;
  diagnostics: Diagnostics;
  nba: NBA;
  candidates: Candidate[];
}) {
  const d = args.diagnostics;
  const items: Array<{ label: string; status: "ok" | "warn"; detail?: string }> = [];

  items.push({ label: "Guardrails checked", status: d.hasPlan ? "ok" : "warn" });

  if (d.hasHoldings) {
    items.push({ label: "Pricing scanned", status: d.pricing.coveragePct >= 70 ? "ok" : "warn", detail: `Coverage ${d.pricing.coveragePct}%` });
    items.push({ label: "Concentration scanned", status: d.concentrationTop1Pct >= 35 ? "warn" : "ok", detail: `Top ~${d.concentrationTop1Pct}%` });
    items.push({ label: "Cash drag scanned", status: d.cashDragPct >= 40 ? "warn" : "ok", detail: `Cash ~${d.cashDragPct}%` });
  } else {
    items.push({ label: "Holdings scanned", status: "warn", detail: "No holdings yet" });
  }

  items.push({ label: "Next best action", status: "ok", detail: args.nba.title });

  return {
    title: "Decision receipt",
    items,
    details: {
      diagnostics: d,
      nba: args.nba,
      topCandidates: args.candidates.slice(0, 3),
    },
  };
}

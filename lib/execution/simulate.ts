// lib/execution/simulate.ts
import { Candidate } from "@/lib/core/types";
import {
  ExecutionBatch,
  ExecutionMode,
  InstrumentType,
  OrderIntent,
  SimulationMetrics,
  SimulationResult,
} from "@/lib/execution/types";

/**
 * Instrument inference (v1):
 * - forex: 6 letters like EURUSD, GBPJPY (letters only)
 * - crypto: BTC, ETH, SOL, etc or symbols ending with "-USD"
 * - etf: tickers containing "ETF" or common ETFs list
 * - otherwise equity
 */
const COMMON_ETFS = new Set(["SPY", "QQQ", "VTI", "VOO", "IWM", "EEM", "TLT", "GLD"]);
const COMMON_CRYPTO = new Set(["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOGE", "DOT", "LINK"]);

export function inferInstrument(symbol: string): { instrument: InstrumentType; symbol: string } {
  const s = (symbol ?? "").toUpperCase().trim();

  if (/^[A-Z]{6}$/.test(s)) return { instrument: "forex", symbol: s };
  if (s.endsWith("-USD")) return { instrument: "crypto", symbol: s.replace("-USD", "") };
  if (COMMON_CRYPTO.has(s)) return { instrument: "crypto", symbol: s };
  if (COMMON_ETFS.has(s) || s.includes("ETF")) return { instrument: "etf", symbol: s };

  return { instrument: "equity", symbol: s || "UNKNOWN" };
}

/**
 * Convert a Candidate → one order intent (v1).
 * Buy/Sell “invisível”: Increase=Buy, Reduce=Sell, Replace/Rebalance -> Buy (proxy)
 */
export function candidateToIntent(c: Candidate): OrderIntent {
  const symRaw = (c.asset ?? c.label ?? "UNKNOWN").toString();
  const { instrument, symbol } = inferInstrument(symRaw);

  const action: OrderIntent["action"] =
    c.action === "Reduce" || c.action === "Hedge" ? "Sell" : "Buy";

  return {
    id: `oi_${c.id}`,
    instrument,
    symbol,
    action,
    sizePct: typeof c.sizePct === "number" ? c.sizePct : 1.0, // default 1%
    rationale: c.rationale,
    sourceCandidateId: c.id,
  };
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function baseMetrics(mode: ExecutionMode): SimulationMetrics {
  // Proxy baseline: mode changes “risk budget appetite”
  if (mode === "conservative") {
    return { volAnnual: 0.12, var95: 0.05, maxDrawdownEst: 0.22, drift: 0.10, concentrationTop5: 0.32, fxExposurePct: 0.45 };
  }
  if (mode === "return-seeking") {
    return { volAnnual: 0.16, var95: 0.07, maxDrawdownEst: 0.30, drift: 0.14, concentrationTop5: 0.38, fxExposurePct: 0.55 };
  }
  return { volAnnual: 0.14, var95: 0.06, maxDrawdownEst: 0.28, drift: 0.12, concentrationTop5: 0.36, fxExposurePct: 0.52 };
}

function instrumentCost(i: InstrumentType) {
  // proxy fees + friction
  if (i === "forex") return { cost: 0.0003, slip: 0.0004, note: "FX spread/slippage proxy" };
  if (i === "crypto") return { cost: 0.0010, slip: 0.0012, note: "Crypto fees + gap risk proxy" };
  if (i === "etf") return { cost: 0.0005, slip: 0.0006, note: "ETF spread proxy" };
  return { cost: 0.0006, slip: 0.0007, note: "Equity spread proxy" };
}

/**
 * Simulate batch impact (MAX++ v1 proxy):
 * - “Sell” reduces risk & drawdown slightly; “Buy” increases slightly
 * - If mode is conservative, buys are penalized more (risk)
 * - Drift generally decreases when rebalancing (mix of actions)
 */
export function simulateBatch(batch: ExecutionBatch, horizon: SimulationResult["horizon"] = "1M"): SimulationResult {
  const before = baseMetrics(batch.mode);

  let vol = before.volAnnual;
  let dd = before.maxDrawdownEst;
  let var95 = before.var95;
  let drift = before.drift;
  let conc = before.concentrationTop5;
  let fx = before.fxExposurePct;

  let totalCost = 0;
  let totalSlip = 0;
  const costNotes = new Set<string>();

  const derivedIntents: OrderIntent[] = [...batch.intents];

  for (const it of derivedIntents) {
    const sz = clamp01((it.sizePct ?? 0) / 100); // percent points → 0..1 scale factor
    const dir = it.action === "Sell" ? -1 : 1;

    // mode sensitivity
    const modeRisk = batch.mode === "conservative" ? 1.25 : batch.mode === "return-seeking" ? 0.85 : 1.0;

    // impact: forex/crypto carry more tail risk
    const instRisk =
      it.instrument === "crypto" ? 1.6 :
      it.instrument === "forex" ? 1.2 :
      it.instrument === "etf" ? 0.9 : 1.0;

    vol = clamp01(vol + dir * sz * 0.10 * modeRisk * instRisk);
    dd  = clamp01(dd  + dir * sz * 0.16 * modeRisk * instRisk);
    var95 = clamp01(var95 + dir * sz * 0.08 * modeRisk * instRisk);

    // drift: sells/buys both can reduce drift if they are “rebalancing” (proxy)
    drift = clamp01(drift - Math.abs(dir) * sz * 0.06);

    // concentration: buying single names increases, selling decreases (proxy)
    conc = clamp01(conc + dir * sz * 0.08);

    // fx: forex trades raise FX exposure, selling forex lowers (proxy)
    if (it.instrument === "forex") fx = clamp01(fx + dir * sz * 0.12);

    const c = instrumentCost(it.instrument);
    totalCost += c.cost * (it.sizePct ?? 1);
    totalSlip += c.slip * (it.sizePct ?? 1);
    costNotes.add(c.note);
  }

  // horizon scaling (proxy): longer horizon increases VaR/Drawdown perception
  const k = horizon === "1W" ? 0.5 : horizon === "1M" ? 1 : horizon === "3M" ? 1.25 : 1.45;
  const after: SimulationMetrics = {
    volAnnual: vol,
    var95: clamp01(var95 * k),
    maxDrawdownEst: clamp01(dd * k),
    drift,
    concentrationTop5: conc,
    fxExposurePct: fx,
  };

  const delta: SimulationResult["delta"] = {
    volAnnual: after.volAnnual - before.volAnnual,
    var95: after.var95 - before.var95,
    maxDrawdownEst: after.maxDrawdownEst - before.maxDrawdownEst,
    drift: after.drift - before.drift,
    concentrationTop5: after.concentrationTop5 - before.concentrationTop5,
    fxExposurePct: after.fxExposurePct - before.fxExposurePct,
  };

  const estCostPct = clamp01(totalCost / 100);     // proxy normalization
  const estSlippagePct = clamp01(totalSlip / 100); // proxy normalization

  const guardrailNotes: string[] = [];
  if (after.maxDrawdownEst > 0.25) guardrailNotes.push("Expected drawdown above 25% band (proxy).");
  if (after.concentrationTop5 > 0.40) guardrailNotes.push("Top-5 concentration above 40% (proxy).");
  if (after.fxExposurePct > 0.60) guardrailNotes.push("FX exposure above 60% (proxy).");

  const pass = guardrailNotes.length === 0;

  const tradeoffs: string[] = [];
  if ((delta.volAnnual ?? 0) > 0) tradeoffs.push("Higher volatility in exchange for potential return acceleration.");
  if ((delta.drift ?? 0) < 0) tradeoffs.push("Lower drift improves plan alignment.");
  if (estCostPct > 0.002) tradeoffs.push("Costs are meaningful; consider batching/optimizing.");
  if (after.fxExposurePct > before.fxExposurePct) tradeoffs.push("Higher FX exposure increases short-term variance.");

  return {
    horizon,
    before,
    after,
    delta,
    costs: { estCostPct, estSlippagePct, notes: Array.from(costNotes) },
    guardrails: { pass, notes: guardrailNotes },
    tradeoffs,
    derivedIntents,
    fromBatchId: batch.id,
  };
}

/**
 * Helper: build a batch from selected candidates (v1)
 */
export function candidatesToIntents(cands: Candidate[]): OrderIntent[] {
  return cands.map(candidateToIntent);
}
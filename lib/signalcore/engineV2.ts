// lib/signalcore/engineV2.ts
// Engine v2 — coherence breakdown + asset fit REACTIVO (mexe com portfolio + meta).

import type {
  AllocationRow,
  Bucket,
  CoherenceBreakdown,
  CoherenceDriver,
  EngineAction,
  EngineV2Output,
  Exposure,
  Goal,
  Horizon,
  MarketRegime,
  PortfolioItem,
  RiskProfile,
} from "./types";

import { clamp, id, round } from "./utils";

/* ---------------------------- regime helpers ---------------------------- */

function normalizeRegime(x: unknown): MarketRegime {
  const v = String(x ?? "").trim();
  const lower = v.toLowerCase();

  if (v === "Risk-on") return "Risk-on";
  if (v === "Risk-off") return "Risk-off";
  if (v === "Neutral") return "Neutral";
  if (v === "Range-bound") return "Range-bound";
  if (v === "Volatile") return "Volatile";
  if (v === "Crisis") return "Crisis";

  if (lower.includes("risk on")) return "Risk-on";
  if (lower.includes("risk off")) return "Risk-off";
  if (lower.includes("range")) return "Range-bound";
  if (lower.includes("crisis") || lower.includes("panic")) return "Crisis";
  if (lower.includes("volatil")) return "Volatile";
  if (lower.includes("neutral")) return "Neutral";

  return "Neutral";
}

function postureFromRegime(regime: MarketRegime): NonNullable<EngineV2Output["posture"]> {
  if (regime === "Risk-on") return "Risk-on";
  if (regime === "Risk-off" || regime === "Crisis") return "Risk-off";
  return "Neutral";
}

function decisionTempo(regime: MarketRegime, horizon: Horizon): NonNullable<EngineV2Output["tempo"]> {
  if (horizon === "Short" && (regime === "Risk-on" || regime === "Risk-off" || regime === "Volatile")) return "Fast";
  if (horizon === "Long") return "Slow";
  return "Normal";
}

function convictionDots(regime: MarketRegime): 1 | 2 | 3 {
  if (regime === "Crisis") return 1;
  if (regime === "Volatile") return 1;
  if (regime === "Range-bound") return 2;
  return 2;
}

function nextCheckCadence(regime: MarketRegime, horizon: Horizon): NonNullable<EngineV2Output["nextCheck"]> {
  if (horizon === "Short") return "Weekly";
  if (regime === "Volatile" || regime === "Crisis") return "Weekly";
  if (regime === "Range-bound") return "Biweekly";
  return "Monthly";
}

/* ----------------------- portfolio structure scoring ---------------------- */

function exposureWeight(x?: Exposure | null) {
  if (x === "low") return 1;
  if (x === "high") return 3;
  return 2;
}

function portfolioMetrics(items: PortfolioItem[]) {
  const weights = items.map((it) => exposureWeight(it.exposure));
  const sum = weights.reduce((a, b) => a + b, 0);

  if (!items.length || sum <= 0) return { count: 0, hhi: 1, effectiveN: 0, maxShare: 0 };

  const shares = weights.map((w) => w / sum);
  const hhi = shares.reduce((acc, s) => acc + s * s, 0);
  const effectiveN = 1 / hhi;
  const maxShare = Math.max(...shares);

  return { count: items.length, hhi, effectiveN, maxShare };
}

/* ---------------------------- driver scoring ---------------------------- */

function scoreGoal(goal: Goal): number {
  const amt = goal?.amount ?? null;
  const months = goal?.months ?? null;
  if (!amt || !months) return 62;

  let s = 84;
  if (months < 6) s -= 14;
  if (months >= 60) s += 5;

  if (months <= 12 && amt >= 20000) s -= 8;

  return clamp(s);
}

function scoreRisk(params: { risk: RiskProfile; regime: MarketRegime; horizon: Horizon; goal: Goal }): number {
  let s = 82;

  if (params.regime === "Risk-off" || params.regime === "Crisis") {
    if (params.risk === "Aggressive") s -= 18;
    if (params.risk === "Balanced") s -= 6;
  }

  if (params.horizon === "Short" && params.risk === "Aggressive") s -= 14;
  if (params.horizon === "Long" && params.risk === "Conservative") s -= 5;

  const amt = params.goal?.amount ?? null;
  const m = params.goal?.months ?? null;
  const ambitious = Boolean(amt && m && (amt >= 25000 || (m <= 24 && amt >= 15000)));
  if (ambitious && params.risk === "Conservative") s -= 10;

  return clamp(s);
}

function scoreHorizon(horizon: Horizon, regime: MarketRegime): number {
  let s = 80;
  if (horizon === "Short" && (regime === "Volatile" || regime === "Crisis")) s -= 14;
  if (horizon === "Short" && regime === "Range-bound") s -= 8;
  if (horizon === "Long") s += 4;
  return clamp(s);
}

function scoreRegime(regime: MarketRegime): number {
  if (regime === "Crisis") return 58;
  if (regime === "Volatile") return 64;
  if (regime === "Range-bound") return 72;
  if (regime === "Risk-off") return 70;
  return 78;
}

function scorePortfolioStructure(items: PortfolioItem[]): number {
  if (!items.length) return 65;

  const m = portfolioMetrics(items);

  const divScore =
    m.effectiveN >= 12 ? 95 :
    m.effectiveN >= 8  ? 90 :
    m.effectiveN >= 5  ? 80 :
    m.effectiveN >= 3  ? 68 :
    m.effectiveN >= 2  ? 58 :
    50;

  const simplicity =
    m.count <= 3  ? 84 :
    m.count <= 8  ? 78 :
    m.count <= 15 ? 70 :
    62;

  const concPenalty =
    m.maxShare >= 0.55 ? 24 :
    m.maxShare >= 0.45 ? 16 :
    m.maxShare >= 0.35 ? 10 :
    m.maxShare >= 0.25 ? 5  :
    0;

  const unknown = items.filter((p) => p.type === "other").length;
  const unknownPenalty = unknown >= 3 ? 6 : unknown === 2 ? 3 : 0;

  return clamp(round(0.55 * divScore + 0.45 * simplicity - concPenalty - unknownPenalty));
}

function processScore(params: { horizon: Horizon; regime: MarketRegime }): number {
  let s = 80;
  if (params.regime === "Volatile" || params.regime === "Crisis") s -= 8;
  if (params.regime === "Range-bound") s -= 4;
  if (params.horizon === "Short") s -= 6;
  return clamp(s);
}

/* ------------------------------ asset fit ------------------------------ */

function assetFitForAsset(params: {
  item: PortfolioItem;
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
}): { score: number; reasons: string[] } {
  const { item, regime, horizon, risk } = params;
  const t = item.type;
  const reasons: string[] = [];
  let s = 78;

  const highVol = t === "crypto" || t === "forex";
  const defensive = t === "bond" || t === "cash";
  const growthy = t === "stock" || t === "etf" || t === "real_estate";

  // ✅ Use meta to actually move the score
  const sector = item.meta?.sector ? String(item.meta.sector).toLowerCase() : "";
  const mcap = typeof item.meta?.marketCap === "number" ? item.meta.marketCap : null;

  const defensiveSector =
    sector.includes("utilities") ||
    sector.includes("consumer defensive") ||
    sector.includes("health") ||
    sector.includes("healthcare") ||
    sector.includes("staples");

  const megaCap = mcap != null && mcap >= 200; // ~200B+
  const largeCap = mcap != null && mcap >= 50;

  if (regime === "Risk-off" || regime === "Crisis") {
    if (highVol) { s -= 22; reasons.push("High volatility instruments are fragile in risk-off / crisis."); }
    if (defensive) { s += 12; reasons.push("Defensive exposure supports capital preservation in risk-off."); }
    if (growthy) { s -= 6; reasons.push("Growth exposure may need smaller sizing under risk-off."); }

    if (defensiveSector) { s += 6; reasons.push("Defensive sector tends to be more resilient in risk-off."); }
    if (megaCap) { s += 4; reasons.push("Mega-cap profile can improve robustness under stress."); }
    else if (largeCap) { s += 2; }
  }

  if (regime === "Risk-on") {
    if (highVol) { s += 6; reasons.push("Risk-on can tolerate measured high-vol exposure."); }
    if (defensive) { s -= 4; reasons.push("Too much defensive exposure can lag in risk-on."); }
    if (defensiveSector && (t === "stock" || t === "etf")) { s -= 2; reasons.push("In risk-on, overly defensive tilts can lag momentum."); }
  }

  if (regime === "Range-bound" && highVol) {
    s -= 10; reasons.push("Range-bound punishes forcing high-vol moves.");
  }

  if (regime === "Volatile") {
    if (highVol) { s -= 14; reasons.push("Volatility regime increases whipsaw risk for high-vol instruments."); }
    if (defensive) { s += 6; reasons.push("Defensive ballast helps in volatile regimes."); }
  }

  if (horizon === "Short") {
    if (highVol) { s -= 14; reasons.push("Short horizon + high-vol increases drawdown risk."); }
    if (defensive) { s += 6; reasons.push("Short horizon benefits from buffers/defensives."); }
  }

  if (risk === "Conservative" && highVol) {
    s -= 16; reasons.push("Conservative profile: high-vol should be small or avoided.");
  }

  if (risk === "Aggressive" && defensive) {
    s -= 4; reasons.push("Aggressive profile may be under-exposed if too defensive.");
  }

  const w = exposureWeight(item.exposure);
  if (highVol && w === 3) { s -= 6; reasons.push("High exposure amplifies risk in this instrument."); }
  if (defensive && w === 1) { s -= 2; reasons.push("Low defensive exposure may not buffer enough."); }

  const uniq = Array.from(new Set(reasons)).slice(0, 3);
  return { score: clamp(s), reasons: uniq.length ? uniq : ["Neutral fit given current context."] };
}

function scoreAssetFit(params: {
  portfolio: PortfolioItem[];
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
}) {
  if (!params.portfolio.length) return { overall: 60, byAsset: [] as EngineV2Output["assetFit"]["byAsset"] };

  const rows = params.portfolio.map((item) => {
    const r = assetFitForAsset({ item, regime: params.regime, horizon: params.horizon, risk: params.risk });
    return { name: item.name, type: item.type, score: r.score, reasons: r.reasons };
  });

  const weights = params.portfolio.map((p) => exposureWeight(p.exposure));
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;

  const overall = round(rows.reduce((acc, row, i) => acc + row.score * (weights[i] / wsum), 0));
  return { overall: clamp(overall), byAsset: rows };
}

/* ------------------------- allocation recommendation ------------------------- */

function baseAllocation(risk: RiskProfile): AllocationRow[] {
  if (risk === "Conservative") {
    return [
      { bucket: "US large-cap equities", weight: 22 },
      { bucket: "Intl developed equities", weight: 10 },
      { bucket: "Intermediate bonds", weight: 40 },
      { bucket: "Short-term bonds", weight: 15 },
      { bucket: "Cash / buffer", weight: 10 },
      { bucket: "Gold", weight: 3 },
    ];
  }

  if (risk === "Aggressive") {
    return [
      { bucket: "US large-cap equities", weight: 46 },
      { bucket: "Intl developed equities", weight: 18 },
      { bucket: "Emerging markets", weight: 8 },
      { bucket: "Intermediate bonds", weight: 10 },
      { bucket: "Cash / buffer", weight: 5 },
      { bucket: "Gold", weight: 3 },
      { bucket: "Real estate", weight: 4 },
      { bucket: "Crypto", weight: 6 },
    ];
  }

  return [
    { bucket: "US large-cap equities", weight: 40 },
    { bucket: "Intl developed equities", weight: 18 },
    { bucket: "Intermediate bonds", weight: 16 },
    { bucket: "Short-term bonds", weight: 6 },
    { bucket: "Cash / buffer", weight: 7 },
    { bucket: "Gold", weight: 5 },
    { bucket: "Commodities", weight: 4 },
    { bucket: "Real estate", weight: 4 },
  ];
}

function adjustForHorizon(rows: AllocationRow[], horizon: Horizon): AllocationRow[] {
  const out = rows.map((r) => ({ ...r }));

  const bump = (bucket: Bucket, delta: number) => {
    const i = out.findIndex((x) => x.bucket === bucket);
    if (i >= 0) out[i].weight += delta;
  };

  const rebalanceTo100 = () => {
    const sum = out.reduce((a, b) => a + b.weight, 0);
    bump("Cash / buffer", 100 - sum);
    for (const r of out) r.weight = Math.max(0, Math.round(r.weight));
  };

  if (horizon === "Short") {
    bump("Cash / buffer", 4);
    bump("Short-term bonds", 4);
    bump("Intermediate bonds", 2);
    bump("US large-cap equities", -6);
    bump("Intl developed equities", -4);
  } else if (horizon === "Long") {
    bump("US large-cap equities", 3);
    bump("Intl developed equities", 2);
    bump("Intermediate bonds", -3);
    bump("Cash / buffer", -2);
  }

  rebalanceTo100();
  return out;
}

/* ------------------------- text outputs (guardrails) ------------------------- */

function buildGuardrails(horizon: Horizon, regime: MarketRegime): string[] {
  const g: string[] = [
    "Plan > noise. Only adjust posture on persistent context shifts.",
    "Prefer repeatable actions over emotional intensity.",
    "If you can’t explain the move in one sentence, pause.",
  ];

  if (horizon === "Long") g.push("Long horizon: monthly cadence beats constant tweaking.");
  if (horizon === "Short") g.push("Short horizon: define risk budget + stop rules before execution.");
  if (regime === "Range-bound") g.push("Range-bound: reduce frequency; demand higher-quality setups.");
  if (regime === "Volatile") g.push("Volatile: size smaller; avoid revenge decisions.");
  if (regime === "Crisis") g.push("Crisis: protect capital first; avoid impulsive overexposure.");

  return g;
}

function buildNudges(params: {
  goal: Goal;
  portfolio: PortfolioItem[];
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  assetFitOverall: number;
}): string[] {
  const nudges: string[] = [];

  if (!params.goal?.amount || !params.goal?.months) nudges.push("Add a goal (amount + months) to unlock goal-aware coherence.");
  if (!params.portfolio.length) nudges.push("Add what you already hold so the Advisor becomes plan-aware (not generic).");

  if ((params.regime === "Risk-off" || params.regime === "Crisis") && params.risk === "Aggressive") {
    nudges.push("If created today: prioritize protection first; add risk only after confirmation.");
  }

  if (params.assetFitOverall <= 62 && params.portfolio.length) {
    nudges.push("Some holdings look misaligned with your regime/horizon. Consider simplifying into fewer buckets.");
  }

  if (params.horizon === "Short") nudges.push("Short horizon: execution quality > activity.");

  return nudges.slice(0, 4);
}

function buildTopActions(params: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  breakdown: CoherenceBreakdown;
  portfolio: PortfolioItem[];
}): EngineAction[] {
  const actions: EngineAction[] = [];
  const posture = postureFromRegime(params.regime);

  if (posture === "Risk-off") {
    actions.push({
      id: id("act"),
      title: "Tighten risk posture",
      detail: "In risk-off / crisis, reduce fragility: smaller size, fewer bets, more buffers.",
      impact: "high",
      openTab: "advisor",
    });
  } else if (posture === "Risk-on") {
    actions.push({
      id: id("act"),
      title: "Stay selective (quality > quantity)",
      detail: "Risk-on rewards selectivity. Keep decisions coherent and avoid scatter.",
      impact: "medium",
      openTab: "advisor",
    });
  } else {
    actions.push({
      id: id("act"),
      title: "Phase decisions",
      detail: "Mixed context: phase entries and keep the plan stable unless context persists.",
      impact: "medium",
      openTab: "advisor",
    });
  }

  if (params.portfolio.length >= 12) {
    actions.push({
      id: id("act"),
      title: "Reduce complexity",
      detail: "Too many positions increases decision load. Consolidate into fewer buckets.",
      impact: "medium",
      openTab: "portfolio",
    });
  }

  if (params.breakdown.assetFit < 65 && params.portfolio.length) {
    actions.push({
      id: id("act"),
      title: "Improve asset fit",
      detail: "Some instruments fit poorly. Tilt exposure toward better-aligned buckets.",
      impact: "medium",
      openTab: "advisor",
    });
  }

  if (params.horizon === "Long") {
    actions.push({
      id: id("act"),
      title: "Monthly cadence",
      detail: "Long horizon: schedule one calm monthly review to avoid overreacting.",
      impact: "low",
      openTab: "overview",
    });
  } else if (params.horizon === "Short") {
    actions.push({
      id: id("act"),
      title: "Execution rules",
      detail: "Short horizon: define stop rules + max loss per session before acting.",
      impact: "high",
      openTab: "planning",
    });
  }

  return actions.slice(0, 3);
}

function buildDeltas(b: CoherenceBreakdown): Partial<Record<CoherenceDriver, number>> {
  const deltas: Partial<Record<CoherenceDriver, number>> = {};
  (Object.keys(b) as Array<keyof CoherenceBreakdown>).forEach((k) => {
    if (k === "overall") return;
    const v = b[k as CoherenceDriver];
    if (v <= 60) deltas[k as CoherenceDriver] = -8;
    else if (v <= 70) deltas[k as CoherenceDriver] = -4;
    else if (v >= 88) deltas[k as CoherenceDriver] = +3;
  });
  return deltas;
}

function driftLabel(scoreDelta: number): EngineV2Output["drift"] {
  const d = Math.round(scoreDelta);
  if (Math.abs(d) <= 3) return { label: "stable", scoreDelta: d };
  if (Math.abs(d) <= 10) return { label: "mild", scoreDelta: d };
  return { label: "high", scoreDelta: d };
}

/* --------------------------------- MAIN --------------------------------- */

export function runEngineV2(input: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio?: PortfolioItem[] | null;
  previousOverall?: number | null;
}): EngineV2Output {
  const regime = normalizeRegime(input.regime);
  const horizon = input.horizon ?? "Long";
  const risk = input.risk ?? "Balanced";
  const goal = input.goal ?? null;
  const portfolio: PortfolioItem[] = Array.isArray(input.portfolio) ? input.portfolio : [];

  const posture = postureFromRegime(regime);
  const tempo = decisionTempo(regime, horizon);
  const dots = convictionDots(regime);
  const nextCheck = nextCheckCadence(regime, horizon);

  const goalScore = scoreGoal(goal);
  const riskScore = scoreRisk({ risk, regime, horizon, goal });
  const horizonScore = scoreHorizon(horizon, regime);
  const regimeScore = scoreRegime(regime);
  const portfolioScore = scorePortfolioStructure(portfolio);

  const af = scoreAssetFit({ portfolio, regime, horizon, risk });
  const process = processScore({ horizon, regime });

  const breakdown: CoherenceBreakdown = {
    overall: 0,
    goal: goalScore,
    risk: riskScore,
    horizon: horizonScore,
    regime: regimeScore,
    portfolio: portfolioScore,
    assetFit: af.overall,
    process,
  };

  // ✅ inclui assetFit + estrutura → mexe quando adicionas ativos/meta
  breakdown.overall = clamp(
    round(
      breakdown.goal * 0.18 +
        breakdown.risk * 0.16 +
        breakdown.horizon * 0.12 +
        breakdown.regime * 0.14 +
        breakdown.portfolio * 0.16 +
        breakdown.assetFit * 0.16 +
        breakdown.process * 0.08
    )
  );

  const suggestedAllocation = adjustForHorizon(baseAllocation(risk), horizon);

  const notes: string[] = [
    "Context → posture → actions.",
    `Regime: ${regime}`,
    `Horizon: ${horizon}`,
    `Risk: ${risk}`,
  ];

  const guardrails = buildGuardrails(horizon, regime);
  const nudges = buildNudges({ goal, portfolio, regime, horizon, risk, assetFitOverall: af.overall });
  const topActions = buildTopActions({ regime, horizon, risk, breakdown, portfolio });
  const deltas = buildDeltas(breakdown);

  const prev = typeof input.previousOverall === "number" ? input.previousOverall : null;
  const drift = prev == null ? { label: "stable", scoreDelta: 0 } : driftLabel(breakdown.overall - prev);

  return {
    posture,
    tempo,
    convictionDots: dots,
    nextCheck,
    breakdown,
    deltas,
    drift,
    notes,
    guardrails,
    nudges,
    assetFit: { overall: af.overall, byAsset: af.byAsset },
    suggestedAllocation,
    topActions,
    debug: {
      portfolioCount: portfolio.length,
      effectiveN: portfolioMetrics(portfolio).effectiveN,
      maxShare: portfolioMetrics(portfolio).maxShare,
      regime,
      horizon,
      risk,
    },
  };
}
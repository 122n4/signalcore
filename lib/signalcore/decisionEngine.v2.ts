// lib/signalcore/decisionEngine.v2.ts
/* Engine v2 — deterministic, fast, no async, no regex, no recursion */

export type MarketRegime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
export type Horizon = "Short" | "Medium" | "Long";
export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

export type Goal = {
  amount?: number | null;
  timeframeMonths?: number | null;
  label?: string | null;
};

export type Bucket =
  | "US large cap equities"
  | "Intl developed equities"
  | "Emerging markets"
  | "Intermediate bonds"
  | "Short-term bonds"
  | "Cash / buffer"
  | "Gold"
  | "Commodities"
  | "Real estate"
  | "Crypto";

export type PortfolioItem = {
  id?: string;
  name: string;
  type?: string;
  bucket?: Bucket;
  weight?: number; // optional
};

export type AllocationRow = { bucket: Bucket; weight: number };

export type EngineActionKind = "hold" | "reduce" | "review" | "rebalance" | "focus";

export type EngineAction = {
  title: string;
  detail: string;
  kind: EngineActionKind;
  // useful for UI routing
  openTab?: "overview" | "portfolio" | "planning" | "advisor";
  anchorId?: string;
};

export type CoherenceDrivers5 = {
  goalFit: number;          // goal ambition vs horizon/risk
  riskAlignment: number;    // horizon vs risk consistency
  regimeFit: number;        // regime execution difficulty vs risk stance
  diversification: number;  // bucket breadth + concentration
  simplicity: number;       // number of holdings complexity penalty
};

export type CoherenceDeltaImpact = "low" | "medium" | "high";

export type EngineDelta = {
  id: string;
  title: string;
  detail: string;
  impact: CoherenceDeltaImpact;
  deltaCoherence: number; // estimated +/-
  // optional “apply” patch for settings (safe for UI to apply)
  apply?: Partial<{
    horizon: Horizon;
    risk_profile: RiskProfile;
  }>;
  openTab?: "overview" | "portfolio" | "planning" | "advisor";
  anchorId?: string;
};

export type EngineV2Input = {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal | null;
  portfolio: PortfolioItem[];
  // optional: for future extensions without refactor
  constraints?: {
    maxCrypto?: number;     // 0..1
    maxSingleName?: number; // 0..1
  };
};

export type EngineV2Output = {
  posture: "Risk-on" | "Risk-off" | "Neutral";
  tempo: "Slow" | "Normal" | "Fast";
  convictionDots: 1 | 2 | 3;
  nextCheck: "Weekly" | "Biweekly" | "Monthly";

  coherenceScore: number;     // 0..100
  coherenceBreakdown: CoherenceDrivers5;

  deltas: EngineDelta[];      // “highest leverage improvements”
  notes: string[];
  guardrails: string[];
  nudges: string[];

  suggestedAllocation: AllocationRow[];
  topActions: EngineAction[];
};

/* -------------------------- small utils -------------------------- */

function clamp(n: number, lo: number, hi: number) {
  return n < lo ? lo : n > hi ? hi : n;
}

function round(n: number) {
  return Math.round(n);
}

function normalizeRegime(x: unknown): MarketRegime {
  const v = String(x ?? "").trim();
  if (v === "Risk-on") return "Risk-on";
  if (v === "Risk-off") return "Risk-off";
  if (v === "Transitional") return "Transitional";
  if (v === "Neutral / Range-bound") return "Neutral / Range-bound";

  const lower = v.toLowerCase();
  if (lower.includes("risk on")) return "Risk-on";
  if (lower.includes("risk off")) return "Risk-off";
  if (lower.includes("transit")) return "Transitional";
  if (lower.includes("neutral") || lower.includes("range")) return "Neutral / Range-bound";
  return "Neutral / Range-bound";
}

function isAmbitiousGoal(goal: Goal | null): boolean {
  if (!goal) return false;
  const amt = goal.amount ?? null;
  const months = goal.timeframeMonths ?? null;

  // Ambitious if big amount AND short-ish timeframe, or explicitly labeled
  const label = (goal.label ?? "").toLowerCase();
  if (label.includes("ambit")) return true;

  if (amt != null && months != null) {
    if (amt >= 50000 && months <= 24) return true;
    if (amt >= 100000 && months <= 48) return true;
  }

  // if only timeframe is present and it is short, we assume ambition exists
  if (months != null && months <= 18) return true;

  return false;
}

function uniqueBuckets(portfolio: PortfolioItem[]): Bucket[] {
  const set = new Set<Bucket>();
  for (let i = 0; i < portfolio.length; i++) {
    const b = portfolio[i].bucket;
    if (b) set.add(b);
  }
  return Array.from(set);
}

/* -------------------------- coherence v2 -------------------------- */
/**
 * 5 drivers, each 0..100
 * Output score is weighted, with “weakest-link pressure” to feel institutional.
 */
function computeCoherenceDrivers5(params: EngineV2Input): CoherenceDrivers5 {
  const regime = normalizeRegime(params.regime);
  const horizon = params.horizon;
  const risk = params.risk;
  const portfolio = params.portfolio ?? [];
  const n = portfolio.length;

  // 1) Goal fit (ambitious goal vs conservative posture / too long/too short horizon)
  let goalFit = 90;
  if (isAmbitiousGoal(params.goal)) {
    if (risk === "Conservative") goalFit = 62;
    else if (risk === "Balanced") goalFit = 78;
    else goalFit = 88;

    // Short horizon + ambitious goal usually implies pressure
    if (horizon === "Short") goalFit = Math.min(goalFit, 70);
  } else {
    // no goal or normal goal: less penalty
    if (!params.goal) goalFit = 86;
  }

  // 2) Risk alignment (horizon vs risk profile)
  let riskAlignment = 88;
  if (horizon === "Short" && risk === "Aggressive") riskAlignment = 72;
  if (horizon === "Long" && risk === "Conservative" && isAmbitiousGoal(params.goal)) riskAlignment = 60;
  if (horizon === "Long" && risk === "Aggressive") riskAlignment = 84;
  if (horizon === "Short" && risk === "Conservative") riskAlignment = 82;

  // 3) Regime fit (execution difficulty vs stance)
  let regimeFit = 88;
  if (regime === "Risk-off") {
    if (risk === "Aggressive") regimeFit = 70;
    else if (risk === "Balanced") regimeFit = 82;
    else regimeFit = 90;
  } else if (regime === "Transitional") {
    regimeFit = risk === "Aggressive" ? 76 : 84;
  } else if (regime === "Neutral / Range-bound") {
    // range-bound penalizes “forcing breakouts” style
    regimeFit = risk === "Aggressive" ? 80 : 88;
  }

  // 4) Diversification (bucket breadth + crude concentration)
  const buckets = uniqueBuckets(portfolio);
  let diversification = 90;
  if (buckets.length <= 1) diversification = 66;
  else if (buckets.length === 2) diversification = 74;
  else if (buckets.length === 3) diversification = 82;

  // If weights exist, check concentration quickly
  let maxW = 0;
  for (let i = 0; i < portfolio.length; i++) {
    const w = portfolio[i].weight ?? 0;
    if (w > maxW) maxW = w;
  }
  if (maxW >= 0.6) diversification = Math.min(diversification, 70);
  if (maxW >= 0.8) diversification = Math.min(diversification, 60);

  // 5) Simplicity (holdings count)
  let simplicity = 92;
  if (n >= 12) simplicity = 78;
  if (n >= 20) simplicity = 68;
  if (n >= 35) simplicity = 58;

  return {
    goalFit: clamp(round(goalFit), 0, 100),
    riskAlignment: clamp(round(riskAlignment), 0, 100),
    regimeFit: clamp(round(regimeFit), 0, 100),
    diversification: clamp(round(diversification), 0, 100),
    simplicity: clamp(round(simplicity), 0, 100),
  };
}

function aggregateCoherence(drivers: CoherenceDrivers5): number {
  // weighted average
  const wGoal = 0.25;
  const wRisk = 0.20;
  const wRegime = 0.20;
  const wDiv = 0.20;
  const wSimple = 0.15;

  const avg =
    drivers.goalFit * wGoal +
    drivers.riskAlignment * wRisk +
    drivers.regimeFit * wRegime +
    drivers.diversification * wDiv +
    drivers.simplicity * wSimple;

  // weakest-link pressure (institutional feel)
  const weakest = Math.min(
    drivers.goalFit,
    drivers.riskAlignment,
    drivers.regimeFit,
    drivers.diversification,
    drivers.simplicity
  );

  const pressure = (100 - weakest) * 0.18; // soft penalty
  return clamp(round(avg - pressure), 0, 100);
}

/* -------------------------- deltas v2 -------------------------- */

function buildCoherenceDeltas(params: {
  input: EngineV2Input;
  baseDrivers: CoherenceDrivers5;
  baseScore: number;
}): EngineDelta[] {
  const { input, baseDrivers, baseScore } = params;

  // pick the “lowest” driver as highest leverage
  const entries: Array<[keyof CoherenceDrivers5, number]> = [
    ["goalFit", baseDrivers.goalFit],
    ["riskAlignment", baseDrivers.riskAlignment],
    ["regimeFit", baseDrivers.regimeFit],
    ["diversification", baseDrivers.diversification],
    ["simplicity", baseDrivers.simplicity],
  ];

  entries.sort((a, b) => a[1] - b[1]); // lowest first
  const lowest = entries[0][0];

  const deltas: EngineDelta[] = [];

  // A) goal fit delta (ambitious goal + conservative long)
  if (lowest === "goalFit" || lowest === "riskAlignment") {
    if (input.horizon === "Long" && input.risk === "Conservative" && isAmbitiousGoal(input.goal)) {
      const estimated = clamp(round((75 - baseDrivers.goalFit) * 0.25 + 6), 1, 18);
      deltas.push({
        id: "ambition_vs_conservative",
        title: "Align risk profile with ambitious goal",
        detail:
          "Your goal looks ambitious, but Long + Conservative usually under-delivers. Consider Balanced, or keep Conservative but extend timeframe and focus on consistency.",
        impact: estimated >= 10 ? "high" : estimated >= 6 ? "medium" : "low",
        deltaCoherence: estimated,
        apply: { risk_profile: "Balanced" },
        openTab: "planning",
      });
    }
  }

  // B) range-bound playbook delta
  if (input.regime === "Neutral / Range-bound") {
    const estimated = clamp(round((88 - baseDrivers.regimeFit) * 0.18 + 3), 1, 10);
    deltas.push({
      id: "range_bound_playbook",
      title: "Adopt range-bound playbook",
      detail: "Less activity, higher selectivity. Avoid forcing breakouts; rebalance gradually and protect the plan.",
      impact: estimated >= 7 ? "medium" : "low",
      deltaCoherence: estimated,
      openTab: "advisor",
      anchorId: "playbook",
    });
  }

  // C) diversification delta
  if (baseDrivers.diversification <= 76) {
    const estimated = clamp(round((82 - baseDrivers.diversification) * 0.25 + 4), 2, 16);
    deltas.push({
      id: "increase_diversification",
      title: "Reduce concentration, add 1–2 stabilizers",
      detail:
        "Your portfolio looks concentrated. Add a stabilizer bucket (bonds / cash buffer) and reduce single-name exposure to improve execution quality.",
      impact: estimated >= 10 ? "high" : "medium",
      deltaCoherence: estimated,
      openTab: "portfolio",
    });
  }

  // D) simplicity delta
  if (baseDrivers.simplicity <= 75) {
    const estimated = clamp(round((80 - baseDrivers.simplicity) * 0.22 + 3), 2, 12);
    deltas.push({
      id: "simplify_portfolio",
      title: "Simplify holdings",
      detail:
        "Too many holdings increases decision friction. Consolidate overlapping exposures (same bucket) to improve discipline and review cadence.",
      impact: estimated >= 8 ? "medium" : "low",
      deltaCoherence: estimated,
      openTab: "portfolio",
    });
  }

  // Keep only positive and sort by delta desc
  const clean = deltas.filter((d) => d.deltaCoherence > 0);
  clean.sort((a, b) => b.deltaCoherence - a.deltaCoherence);

  // cap to top 3 (institutional: focus)
  return clean.slice(0, 3);
}

/* -------------------------- posture / tempo / conviction -------------------------- */

function postureFromRegime(regime: MarketRegime): "Risk-on" | "Risk-off" | "Neutral" {
  if (regime === "Risk-on") return "Risk-on";
  if (regime === "Risk-off") return "Risk-off";
  return "Neutral";
}

function decisionTempo(regime: MarketRegime, horizon: Horizon): "Slow" | "Normal" | "Fast" {
  if (regime === "Transitional") return "Normal";
  if (regime === "Risk-off") return horizon === "Short" ? "Fast" : "Normal";
  if (regime === "Risk-on") return horizon === "Short" ? "Normal" : "Slow";
  return "Normal";
}

function convictionDots(regime: MarketRegime): 1 | 2 | 3 {
  // conservative, institutional: avoid 3 unless clear risk-on/off
  if (regime === "Risk-on" || regime === "Risk-off") return 2;
  if (regime === "Transitional") return 1;
  return 1;
}

function nextCheckCadence(regime: MarketRegime, horizon: Horizon): "Weekly" | "Biweekly" | "Monthly" {
  if (regime === "Transitional") return "Weekly";
  if (horizon === "Short") return "Weekly";
  if (regime === "Risk-off") return "Biweekly";
  return "Monthly";
}

/* -------------------------- guardrails / nudges -------------------------- */

function buildGuardrails(horizon: Horizon, regime: MarketRegime, risk: RiskProfile): string[] {
  const g: string[] = [];
  if (horizon === "Short") g.push("Cap position sizing. Avoid averaging down.");
  if (horizon === "Long") g.push("Prefer phased rebalancing over reactive trades.");
  if (regime === "Risk-off") g.push("Preserve optionality: keep buffer and reduce tail risk.");
  if (regime === "Neutral / Range-bound") g.push("Range discipline: avoid breakout-chasing.");
  if (risk === "Conservative") g.push("Protect downside first: drawdown control > upside.");
  if (risk === "Aggressive") g.push("Define invalidation levels; avoid leverage creep.");
  return g;
}

function buildNudges(input: EngineV2Input, coherenceScore: number): string[] {
  const nudges: string[] = [];
  if (coherenceScore < 70) nudges.push("Raise coherence by fixing the lowest driver first (highest leverage).");
  if (isAmbitiousGoal(input.goal) && input.risk === "Conservative") {
    nudges.push("Ambitious goal detected: consider Balanced or extend timeframe to stay coherent.");
  }
  if ((input.portfolio?.length ?? 0) <= 1) nudges.push("Portfolio is minimal: add diversification to reduce execution risk.");
  return nudges;
}

/* -------------------------- allocation (simple but stable) -------------------------- */

function baseAllocation(risk: RiskProfile): AllocationRow[] {
  // Percentages sum ~100
  if (risk === "Conservative") {
    return [
      { bucket: "Intermediate bonds", weight: 35 },
      { bucket: "Short-term bonds", weight: 20 },
      { bucket: "US large cap equities", weight: 20 },
      { bucket: "Intl developed equities", weight: 10 },
      { bucket: "Cash / buffer", weight: 10 },
      { bucket: "Gold", weight: 5 },
    ];
  }
  if (risk === "Aggressive") {
    return [
      { bucket: "US large cap equities", weight: 40 },
      { bucket: "Intl developed equities", weight: 15 },
      { bucket: "Emerging markets", weight: 10 },
      { bucket: "Real estate", weight: 10 },
      { bucket: "Commodities", weight: 8 },
      { bucket: "Gold", weight: 5 },
      { bucket: "Cash / buffer", weight: 7 },
      { bucket: "Crypto", weight: 5 },
    ];
  }
  // Balanced
  return [
    { bucket: "US large cap equities", weight: 30 },
    { bucket: "Intl developed equities", weight: 15 },
    { bucket: "Emerging markets", weight: 5 },
    { bucket: "Intermediate bonds", weight: 25 },
    { bucket: "Short-term bonds", weight: 10 },
    { bucket: "Cash / buffer", weight: 8 },
    { bucket: "Gold", weight: 4 },
    { bucket: "Real estate", weight: 3 },
  ];
}

function adjustForRegime(rows: AllocationRow[], regime: MarketRegime): AllocationRow[] {
  // tiny regime tilt; keep it stable and safe
  const out = rows.map((r) => ({ ...r }));
  if (regime === "Risk-off") {
    // shift ~6% from equities to bonds/buffer
    for (let i = 0; i < out.length; i++) {
      if (out[i].bucket === "US large cap equities") out[i].weight = Math.max(0, out[i].weight - 4);
      if (out[i].bucket === "Intl developed equities") out[i].weight = Math.max(0, out[i].weight - 2);
      if (out[i].bucket === "Cash / buffer") out[i].weight += 3;
      if (out[i].bucket === "Short-term bonds") out[i].weight += 3;
      if (out[i].bucket === "Crypto") out[i].weight = Math.max(0, out[i].weight - 2);
    }
  } else if (regime === "Risk-on") {
    // shift ~4% from bonds/cash to equities
    for (let i = 0; i < out.length; i++) {
      if (out[i].bucket === "Intermediate bonds") out[i].weight = Math.max(0, out[i].weight - 2);
      if (out[i].bucket === "Cash / buffer") out[i].weight = Math.max(0, out[i].weight - 2);
      if (out[i].bucket === "US large cap equities") out[i].weight += 3;
      if (out[i].bucket === "Intl developed equities") out[i].weight += 1;
    }
  }
  // normalize to 100
  let sum = 0;
  for (let i = 0; i < out.length; i++) sum += out[i].weight;
  if (sum <= 0) return rows;
  for (let i = 0; i < out.length; i++) out[i].weight = round((out[i].weight * 100) / sum);
  // fix rounding drift
  let sum2 = 0;
  for (let i = 0; i < out.length; i++) sum2 += out[i].weight;
  const diff = 100 - sum2;
  if (diff !== 0 && out.length > 0) out[0].weight += diff;
  return out;
}

/* -------------------------- top actions -------------------------- */

function buildTopActions(input: EngineV2Input, score: number): EngineAction[] {
  const regime = normalizeRegime(input.regime);
  const posture = postureFromRegime(regime);

  const actions: EngineAction[] = [];

  if (score < 70) {
    actions.push({
      title: "Fix the weakest coherence driver",
      detail: "Improve the lowest driver first — it raises coherence fastest and reduces decision mistakes.",
      kind: "focus",
      openTab: "advisor",
    });
  }

  if (posture === "Risk-off") {
    actions.push({
      title: "Reduce tail risk & build buffer",
      detail: "Prioritize drawdown control. Keep a buffer and phase decisions instead of reacting.",
      kind: "reduce",
      openTab: "portfolio",
    });
  } else if (posture === "Risk-on") {
    actions.push({
      title: "Stay disciplined — avoid overtrading",
      detail: "Let winners run, rebalance on schedule, and keep guardrails intact.",
      kind: "hold",
      openTab: "planning",
    });
  } else {
    actions.push({
      title: "Neutral posture",
      detail: "Context is mixed. Prefer balance, phased decisions, and keep the plan coherent.",
      kind: "hold",
      openTab: "advisor",
    });
  }

  return actions.slice(0, 3);
}

/* -------------------------- public API -------------------------- */

export function runEngineV2(input: EngineV2Input): EngineV2Output {
  const regime = normalizeRegime(input.regime);

  const drivers = computeCoherenceDrivers5({
    ...input,
    regime,
    portfolio: input.portfolio ?? [],
  });

  const score = aggregateCoherence(drivers);

  const deltas = buildCoherenceDeltas({
    input: { ...input, regime },
    baseDrivers: drivers,
    baseScore: score,
  });

  const posture = postureFromRegime(regime);
  const tempo = decisionTempo(regime, input.horizon);
  const dots = convictionDots(regime);
  const nextCheck = nextCheckCadence(regime, input.horizon);

  const guardrails = buildGuardrails(input.horizon, regime, input.risk);
  const nudges = buildNudges(input, score);

  const suggestedAllocation = adjustForRegime(baseAllocation(input.risk), regime);
  const topActions = buildTopActions(input, score);

  const notes = [
    "Context → coherence → guardrails. No signals. No execution.",
    `5-driver model: goalFit / riskAlignment / regimeFit / diversification / simplicity.`,
  ];

  return {
    posture,
    tempo,
    convictionDots: dots,
    nextCheck,

    coherenceScore: score,
    coherenceBreakdown: drivers,

    deltas,
    notes,
    guardrails,
    nudges,

    suggestedAllocation,
    topActions,
  };
}
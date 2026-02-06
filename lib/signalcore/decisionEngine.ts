// lib/signalcore/decisionEngine.ts
export * from "./decisionEngine.v2";
export { runEngineV2 as runEngine } from "./decisionEngine.v2";

export type MarketRegime =
  | "Risk-on"
  | "Risk-off"
  | "Transitional"
  | "Neutral / Range-bound";

export type Horizon = "Short" | "Medium" | "Long";
export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

export type Goal =
  | {
      amount?: number | null;
      timeframeMonths?: number | null;
      currency?: "EUR" | "USD" | null;
    }
  | null;

export type PortfolioItem = {
  id?: string;
  name: string;
  type:
    | "stock"
    | "etf"
    | "crypto"
    | "bond"
    | "cash"
    | "commodity"
    | "real_estate"
    | "forex"
    | "other";
  weight?: number; // opcional (0-100)
  ticker?: string;
};

export type Bucket =
  | "US large-cap equities"
  | "Intl developed equities"
  | "Emerging markets"
  | "Intermediate bonds"
  | "Short-term bonds"
  | "Cash / buffer"
  | "Gold"
  | "Commodities"
  | "Real estate"
  | "Crypto";

export type AllocationRow = { bucket: Bucket; weight: number };

export type EngineAction = {
  title: string;
  detail: string;
  kind: "hold" | "reduce" | "review" | "rebalance" | "focus";
};

/**
 * ✅ Coherence Breakdown (5 drivers fixos)
 * - goal: quão completo/coerente é o objetivo
 * - risk: alinhamento risco vs horizonte/ambição
 * - regime: alinhamento com o regime atual
 * - complexity: complexidade do portfólio (nº posições)
 * - volatility: mistura de high-vol (crypto/forex) vs horizonte
 */
export type CoherenceBreakdown = {
  goal: number; // 0-100
  risk: number; // 0-100
  regime: number; // 0-100
  complexity: number; // 0-100
  volatility: number; // 0-100
  score: number; // 0-100 (agregado)
};

export type CoherenceDelta = {
  title: string; // ex: "If created today"
  subtitle: string; // ex: "Adjust risk posture under Risk-off"
  change: string; // descrição humana do que muda
  improvedBreakdown: CoherenceBreakdown;
  improvedScore: number;
  delta: number; // improvedScore - baseScore
};

export type EngineOutput = {
  posture: "Risk-on" | "Risk-off" | "Neutral";
  tempo: "Slow" | "Normal" | "Fast";
  convictionDots: 1 | 2 | 3;
  nextCheck: "Weekly" | "Biweekly" | "Monthly";

  coherenceScore: number; // 0-100
  coherenceBreakdown: CoherenceBreakdown;
  coherenceDeltas: CoherenceDelta[];

  notes: string[];
  guardrails: string[];
  nudges: string[];

  suggestedAllocation: AllocationRow[];
  topActions: EngineAction[];
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
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
  if (lower.includes("transition")) return "Transitional";
  if (lower.includes("neutral") || lower.includes("range")) return "Neutral / Range-bound";

  return "Neutral / Range-bound";
}

function postureFromRegime(regime: MarketRegime): EngineOutput["posture"] {
  if (regime === "Risk-on") return "Risk-on";
  if (regime === "Risk-off") return "Risk-off";
  return "Neutral";
}

function decisionTempo(regime: MarketRegime, horizon: Horizon): EngineOutput["tempo"] {
  // Urgência só se for curto + regime direcional
  if (horizon === "Short" && (regime === "Risk-on" || regime === "Risk-off")) return "Fast";
  if (horizon === "Long") return "Slow";
  return "Normal";
}

function convictionDots(regime: MarketRegime): 1 | 2 | 3 {
  // V2: Transitional = baixa; Range-bound = média; Risk-on/off = média
  if (regime === "Transitional") return 1;
  if (regime === "Neutral / Range-bound") return 2;
  return 2;
}

function nextCheckCadence(regime: MarketRegime, horizon: Horizon): EngineOutput["nextCheck"] {
  if (horizon === "Short") return "Weekly";
  if (regime === "Transitional") return "Biweekly";
  return "Monthly";
}

function baseAllocation(risk: RiskProfile): AllocationRow[] {
  if (risk === "Conservative") {
    return [
      { bucket: "US large-cap equities", weight: 25 },
      { bucket: "Intl developed equities", weight: 12 },
      { bucket: "Intermediate bonds", weight: 38 },
      { bucket: "Short-term bonds", weight: 15 },
      { bucket: "Cash / buffer", weight: 7 },
      { bucket: "Gold", weight: 3 },
    ];
  }

  if (risk === "Aggressive") {
    return [
      { bucket: "US large-cap equities", weight: 48 },
      { bucket: "Intl developed equities", weight: 20 },
      { bucket: "Emerging markets", weight: 8 },
      { bucket: "Intermediate bonds", weight: 12 },
      { bucket: "Cash / buffer", weight: 5 },
      { bucket: "Gold", weight: 3 },
      { bucket: "Real estate", weight: 4 },
    ];
  }

  // Balanced
  return [
    { bucket: "US large-cap equities", weight: 43 },
    { bucket: "Intl developed equities", weight: 19 },
    { bucket: "Intermediate bonds", weight: 16 },
    { bucket: "Cash / buffer", weight: 7 },
    { bucket: "Gold", weight: 5 },
    { bucket: "Commodities", weight: 5 },
    { bucket: "Real estate", weight: 5 },
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
    const diff = 100 - sum;

    // empurra diferença para cash
    bump("Cash / buffer", diff);

    // arredondar e evitar negativos
    for (const r of out) r.weight = Math.max(0, Math.round(r.weight));
  };

  if (horizon === "Short") {
    bump("Cash / buffer", 4);
    bump("Short-term bonds", 4);
    bump("Intermediate bonds", 3);
    bump("US large-cap equities", -6);
    bump("Intl developed equities", -3);
  } else if (horizon === "Long") {
    bump("US large-cap equities", 3);
    bump("Intl developed equities", 2);
    bump("Intermediate bonds", -3);
    bump("Cash / buffer", -2);
  }

  rebalanceTo100();
  return out;
}

function isAmbitiousGoal(goal: Goal): boolean {
  const amt = goal?.amount ?? null;
  const months = goal?.timeframeMonths ?? null;
  if (!amt || !months) return false;

  // Heurística simples e robusta:
  // “Ambicioso” se tentar acumular muito em pouco tempo.
  // Ex: >= 10k em <= 24 meses, ou >= 25k em <= 48 meses.
  if (months <= 24 && amt >= 10000) return true;
  if (months <= 48 && amt >= 25000) return true;

  // Ou taxa implícita (não é “promessa”, é só intensidade do objetivo)
  const perMonth = amt / months;
  if (perMonth >= 800) return true;

  return false;
}

/**
 * ✅ Calcula o breakdown base (drivers) e score agregado.
 * O score final é uma média ponderada (pesos estáveis).
 */
function computeCoherenceBreakdown(params: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
}): CoherenceBreakdown {
  const { regime, horizon, risk } = params;
  const goal = params.goal ?? null;
  const portfolio = Array.isArray(params.portfolio) ? params.portfolio : [];

  // 1) Goal completeness
  let goalScore = 86;
  const amt = goal?.amount ?? null;
  const months = goal?.timeframeMonths ?? null;

  if (!amt || !months) goalScore -= 18;
  if (amt && amt < 500) goalScore -= 6;
  if (months && months < 6) goalScore -= 10;
  if (isAmbitiousGoal(goal)) goalScore -= 6;
  goalScore = clamp(goalScore, 0, 100);

  // 2) Risk alignment
  let riskScore = 86;
  if (horizon === "Short" && risk === "Aggressive") riskScore -= 22;
  if (regime === "Risk-off" && risk === "Aggressive") riskScore -= 18;
  if (horizon === "Long" && risk === "Conservative" && isAmbitiousGoal(goal)) riskScore -= 16;
  riskScore = clamp(riskScore, 0, 100);

  // 3) Regime alignment
  let regimeScore = 88;
  if (regime === "Transitional") regimeScore -= 10;
  if (regime === "Neutral / Range-bound") regimeScore -= 6;
  if (regime === "Risk-off" && horizon === "Short") regimeScore -= 6; // mais ruído e reversões
  regimeScore = clamp(regimeScore, 0, 100);

  // 4) Complexity
  let complexityScore = 92;
  if (portfolio.length >= 10) complexityScore -= 8;
  if (portfolio.length >= 14) complexityScore -= 12;
  if (portfolio.length >= 20) complexityScore -= 18;
  complexityScore = clamp(complexityScore, 0, 100);

  // 5) Volatility mix
  let volScore = 90;
  const hv = portfolio.filter((p) => p.type === "crypto" || p.type === "forex").length;
  if (hv >= 2 && horizon !== "Long") volScore -= 10;
  if (hv >= 3 && horizon !== "Long") volScore -= 16;
  if (hv >= 4) volScore -= 22;
  volScore = clamp(volScore, 0, 100);

  // Agregação (pesos fixos e simples)
  // goal 22%, risk 26%, regime 18%, complexity 18%, volatility 16%
  const score = Math.round(
    goalScore * 0.22 +
      riskScore * 0.26 +
      regimeScore * 0.18 +
      complexityScore * 0.18 +
      volScore * 0.16
  );

  return {
    goal: goalScore,
    risk: riskScore,
    regime: regimeScore,
    complexity: complexityScore,
    volatility: volScore,
    score: clamp(score, 0, 100),
  };
}

/**
 * ✅ Cria cenários “delta” (o que melhorava o score se…)
 * Não é “comprar/vender X” — é estrutura e processo.
 */
function buildCoherenceDeltas(params: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
  baseBreakdown: CoherenceBreakdown;
}): CoherenceDelta[] {
  const deltas: CoherenceDelta[] = [];
  const base = params.baseBreakdown;

  const push = (d: Omit<CoherenceDelta, "delta">) => {
    deltas.push({ ...d, delta: d.improvedScore - base.score });
  };

  // 1) Goal completion delta
  if (!(params.goal?.amount && params.goal?.timeframeMonths)) {
    const improved: CoherenceBreakdown = {
      ...base,
      goal: Math.min(92, base.goal + 18),
    };
    const improvedScore = Math.round(
      improved.goal * 0.22 +
        improved.risk * 0.26 +
        improved.regime * 0.18 +
        improved.complexity * 0.18 +
        improved.volatility * 0.16
    );

    push({
      title: "Complete the goal",
      subtitle: "Unlock goal-aware planning",
      change: "Add amount + timeframe to reduce ambiguity and improve plan coherence.",
      improvedBreakdown: { ...improved, score: clamp(improvedScore, 0, 100) },
      improvedScore: clamp(improvedScore, 0, 100),
    });
  }

  // 2) Simplify portfolio delta
  if (params.portfolio.length >= 12) {
    const improved: CoherenceBreakdown = {
      ...base,
      complexity: Math.min(92, base.complexity + 14),
    };
    const improvedScore = Math.round(
      improved.goal * 0.22 +
        improved.risk * 0.26 +
        improved.regime * 0.18 +
        improved.complexity * 0.18 +
        improved.volatility * 0.16
    );

    push({
      title: "Reduce complexity",
      subtitle: "Lower decision load",
      change: "Consolidate into fewer buckets to reduce monitoring overhead and mistakes.",
      improvedBreakdown: { ...improved, score: clamp(improvedScore, 0, 100) },
      improvedScore: clamp(improvedScore, 0, 100),
    });
  }

  // 3) Risk alignment — Risk-off + Aggressive
  if (params.regime === "Risk-off" && params.risk === "Aggressive") {
    const improved: CoherenceBreakdown = {
      ...base,
      risk: Math.min(90, base.risk + 16),
      regime: Math.min(92, base.regime + 6),
    };
    const improvedScore = Math.round(
      improved.goal * 0.22 +
        improved.risk * 0.26 +
        improved.regime * 0.18 +
        improved.complexity * 0.18 +
        improved.volatility * 0.16
    );

    push({
      title: "If created today",
      subtitle: "Align risk posture under Risk-off",
      change: "Prioritize protection and wait for persistence before increasing aggressiveness.",
      improvedBreakdown: { ...improved, score: clamp(improvedScore, 0, 100) },
      improvedScore: clamp(improvedScore, 0, 100),
    });
  }

  // 4) Horizon + high-vol mix delta
  const hv = params.portfolio.filter((p) => p.type === "crypto" || p.type === "forex").length;
  if (hv >= 3 && params.horizon !== "Long") {
    const improved: CoherenceBreakdown = {
      ...base,
      volatility: Math.min(90, base.volatility + 16),
      risk: Math.min(90, base.risk + 6),
    };
    const improvedScore = Math.round(
      improved.goal * 0.22 +
        improved.risk * 0.26 +
        improved.regime * 0.18 +
        improved.complexity * 0.18 +
        improved.volatility * 0.16
    );

    push({
      title: "Stabilize volatility mix",
      subtitle: "Match volatility to horizon",
      change: "Reduce high-vol concentration or extend horizon so the plan is structurally coherent.",
      improvedBreakdown: { ...improved, score: clamp(improvedScore, 0, 100) },
      improvedScore: clamp(improvedScore, 0, 100),
    });
  }

  // 5) Long + Conservative + Ambitious goal
  if (params.horizon === "Long" && params.risk === "Conservative" && isAmbitiousGoal(params.goal)) {
    const improved: CoherenceBreakdown = {
      ...base,
      risk: Math.min(90, base.risk + 12),
      goal: Math.min(92, base.goal + 6),
    };
    const improvedScore = Math.round(
      improved.goal * 0.22 +
        improved.risk * 0.26 +
        improved.regime * 0.18 +
        improved.complexity * 0.18 +
        improved.volatility * 0.16
    );

    push({
      title: "Ambition vs posture",
      subtitle: "Conservative plan may underfit ambition",
      change: "Either relax the ambition, extend timeframe, or accept slightly more risk to match the goal.",
      improvedBreakdown: { ...improved, score: clamp(improvedScore, 0, 100) },
      improvedScore: clamp(improvedScore, 0, 100),
    });
  }

  // Ordenar por impacto (maior delta primeiro) e manter curto
  return deltas
    .filter((d) => d.delta >= 3)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 4);
}

function buildGuardrails(horizon: Horizon, regime: MarketRegime): string[] {
  const g: string[] = [
    "Don’t change the plan on headlines — only on persistent context shifts.",
    "Prefer consistency over intensity: small repeated actions > rare big decisions.",
    "Use checklists, not impulses. If you can’t explain the move, don’t do it.",
  ];

  if (horizon === "Long") g.push("Long horizon: monthly discipline beats constant tweaking.");
  if (horizon === "Short") g.push("Short horizon: define risk budget before the session; stop when violated.");

  if (regime === "Neutral / Range-bound") {
    g.push("Choppy regimes punish forcing trades — reduce frequency, increase quality.");
  }

  return g;
}

function buildNudges(params: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal;
  portfolio: PortfolioItem[];
}): string[] {
  const nudges: string[] = [];

  if (params.regime === "Risk-off" && params.risk === "Aggressive") {
    nudges.push("If created today: protection first — only add risk when conditions prove themselves.");
  }

  if (params.horizon === "Short") nudges.push("Short horizon: robustness (buffer + rules) before optimization.");

  if (!params.goal?.amount || !params.goal?.timeframeMonths) {
    nudges.push("Add a goal (amount + timeframe) to unlock goal-aware planning and stronger coherence checks.");
  }

  if (params.portfolio.length === 0) nudges.push("Add what you already own to make recommendations plan-aware (not generic).");

  if (params.horizon === "Long" && params.risk === "Conservative" && isAmbitiousGoal(params.goal)) {
    nudges.push("Ambitious goal + conservative posture: consider extending timeframe or accepting slightly more risk.");
  }

  return nudges;
}

function buildTopActions(params: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  portfolio: PortfolioItem[];
}): EngineAction[] {
  const actions: EngineAction[] = [];
  const posture = postureFromRegime(params.regime);

  if (posture === "Risk-off") {
    actions.push({
      kind: "reduce",
      title: "Reduce aggressiveness",
      detail: "Risk-off punishes forced risk-taking. Keep exposure deliberate and rules-based.",
    });
  } else if (posture === "Risk-on") {
    actions.push({
      kind: "focus",
      title: "Stay selective, not urgent",
      detail: "Risk-on doesn’t mean buy everything. Focus on quality + clarity.",
    });
  } else {
    actions.push({
      kind: "hold",
      title: "Neutral posture",
      detail: "Mixed context: phase decisions, keep balance, avoid over-optimization.",
    });
  }

  if (params.horizon === "Long") {
    actions.push({
      kind: "review",
      title: "Run a monthly review cadence",
      detail: "Long horizon works best with a clean monthly review process — not daily changes.",
    });
  } else if (params.horizon === "Short") {
    actions.push({
      kind: "review",
      title: "Define today’s risk budget",
      detail: "Short horizon: pre-define stop/limits and track execution quality, not activity.",
    });
  }

  if (params.portfolio.length >= 12) {
    actions.push({
      kind: "rebalance",
      title: "Reduce complexity",
      detail: "Too many positions increases decision load. Consolidate into fewer buckets.",
    });
  }

  return actions.slice(0, 3);
}

export function runDecisionEngine(input: {
  regime: MarketRegime;
  horizon: Horizon;
  risk: RiskProfile;
  goal: Goal; // nullable permitido
  portfolio?: PortfolioItem[] | null; // nullable/undefined permitido
}): EngineOutput {
  const regime = normalizeRegime(input.regime);
  const horizon: Horizon = input.horizon ?? "Long";
  const risk: RiskProfile = input.risk ?? "Balanced";
  const goal = input.goal ?? null;

  // ✅ sempre array
  const portfolio: PortfolioItem[] = Array.isArray(input.portfolio) ? input.portfolio : [];

  const posture = postureFromRegime(regime);
  const tempo = decisionTempo(regime, horizon);
  const dots = convictionDots(regime);
  const nextCheck = nextCheckCadence(regime, horizon);

  // ✅ V2: breakdown + score
  const coherenceBreakdown = computeCoherenceBreakdown({
    regime,
    horizon,
    risk,
    goal,
    portfolio,
  });

  const coherenceDeltas = buildCoherenceDeltas({
    regime,
    horizon,
    risk,
    goal,
    portfolio,
    baseBreakdown: coherenceBreakdown,
  });

  const base = baseAllocation(risk);
  const alloc = adjustForHorizon(base, horizon);

  const guardrails = buildGuardrails(horizon, regime);
  const nudges = buildNudges({ regime, horizon, risk, goal, portfolio });

  const notes: string[] = [
    "Context → posture → actions.",
    `Regime: ${regime}`,
    `Horizon: ${horizon}`,
  ];

  const topActions = buildTopActions({ regime, horizon, risk, portfolio });

  return {
    posture,
    tempo,
    convictionDots: dots,
    nextCheck,

    coherenceScore: coherenceBreakdown.score,
    coherenceBreakdown,
    coherenceDeltas,

    notes,
    guardrails,
    nudges,

    suggestedAllocation: alloc,
    topActions,
  };
}
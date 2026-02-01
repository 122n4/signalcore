// /lib/signalcore/decisionEngine.ts
export type MarketRegime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
export type Horizon = "Short" | "Medium" | "Long";
export type Goal = "Investing" | "Trading" | "Forex" | "Crypto";
export type RiskProfile = "Conservative" | "Balanced" | "Aggressive";

/**
 * Asset buckets (abstrações). A UI pode mapear isto para ETFs/ações reais depois.
 * Ex: "Equities_US_Large" => SPY / VOO, etc.
 */
export type Bucket =
  | "Cash"
  | "Bonds_Short"
  | "Bonds_Intermediate"
  | "Bonds_Long"
  | "Equities_US_Large"
  | "Equities_US_Small"
  | "Equities_Intl_Developed"
  | "Equities_Emerging"
  | "Commodities_Broad"
  | "Gold"
  | "RealEstate"
  | "Crypto_BTC"
  | "Crypto_Alt"
  | "FX_USD"
  | "FX_EUR"
  | "FX_JPY"
  | "FX_GBP";

export type Action =
  | "Increase"
  | "Decrease"
  | "Hold"
  | "Hedge"
  | "Rebalance"
  | "Avoid"
  | "PhaseIn"
  | "PhaseOut";

export type Decision = {
  bucket: Bucket;
  action: Action;
  strength: 1 | 2 | 3; // 1=leve, 2=moderado, 3=forte
  rationale: string;
};

export type Allocation = Partial<Record<Bucket, number>>; // pesos 0..100

export type PortfolioSnapshot = {
  // opcional: se tiveres alocação atual, o motor consegue sugerir rebalance.
  allocation?: Allocation;
  // opcional: horizonte alvo do user em meses/anos, etc. (tu decides depois)
};

export type EngineInput = {
  regime: MarketRegime;
  horizon: Horizon;
  goal: Goal;
  riskProfile: RiskProfile;

  // flags opcionais
  isPremium?: boolean;
  portfolio?: PortfolioSnapshot;
};

export type EngineOutput = {
  summaryTitle: string;
  summary: string;

  posture: {
    riskBias: "Defensive" | "Neutral" | "Offensive";
    tempo: "Slow" | "Normal" | "Fast";
    conviction: 1 | 2 | 3;
  };

  suggestedAllocation: Allocation; // “ideal” para este contexto
  decisions: Decision[]; // lista de ações/racionais para UI
  guardrails: string[]; // regras simples (disciplina)
  nextCheck: {
    cadence: "Daily" | "Weekly" | "Monthly";
    why: string;
  };
};

/** Helpers */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeAllocation(input: Allocation): Allocation {
  const entries = Object.entries(input).filter(([, v]) => typeof v === "number" && v! > 0);
  const total = entries.reduce((acc, [, v]) => acc + (v as number), 0);
  if (total <= 0) return {};
  const out: Allocation = {};
  for (const [k, v] of entries) {
    out[k as Bucket] = Math.round(((v as number) / total) * 100);
  }
  // ajuste para bater 100 (por arredondamentos)
  const sum = Object.values(out).reduce((a, b) => a + (b ?? 0), 0);
  const diff = 100 - sum;
  if (diff !== 0) {
    // empurra o diff para o maior bucket
    let best: Bucket | null = null;
    let bestV = -1;
    for (const [k, v] of Object.entries(out)) {
      if ((v ?? 0) > bestV) {
        bestV = v ?? 0;
        best = k as Bucket;
      }
    }
    if (best) out[best] = clamp((out[best] ?? 0) + diff, 0, 100);
  }
  return out;
}

function postureFromRegime(regime: MarketRegime): EngineOutput["posture"]["riskBias"] {
  if (regime === "Risk-on") return "Offensive";
  if (regime === "Risk-off") return "Defensive";
  if (regime === "Transitional") return "Neutral";
  return "Neutral";
}

function cadenceFrom(goal: Goal, horizon: Horizon): EngineOutput["nextCheck"]["cadence"] {
  if (goal === "Trading" || goal === "Forex") return "Daily";
  if (goal === "Crypto") return horizon === "Short" ? "Daily" : "Weekly";
  // Investing
  return horizon === "Long" ? "Monthly" : "Weekly";
}

/**
 * Base allocations (heurísticas, não “recomendações financeiras”).
 * A tua UI pode traduzir buckets em exemplos de produtos/ETFs e o user escolhe.
 */
function baseAllocationByContext(
  regime: MarketRegime,
  horizon: Horizon,
  riskProfile: RiskProfile,
  goal: Goal
): Allocation {
  // Defaults (Investing / Balanced / Neutral)
  let alloc: Allocation = {
    Equities_US_Large: 35,
    Equities_Intl_Developed: 15,
    Bonds_Intermediate: 25,
    Cash: 10,
    Gold: 5,
    Commodities_Broad: 5,
    RealEstate: 5,
  };

  // Horizon adjusts risk
  if (horizon === "Long") {
    alloc.Bonds_Intermediate = 15;
    alloc.Equities_US_Large = 40;
    alloc.Equities_Intl_Developed = 18;
    alloc.Cash = 7;
  } else if (horizon === "Short") {
    alloc.Bonds_Intermediate = 30;
    alloc.Bonds_Short = 10;
    alloc.Equities_US_Large = 25;
    alloc.Equities_Intl_Developed = 10;
    alloc.Cash = 15;
    alloc.Gold = 5;
    alloc.Commodities_Broad = 3;
    alloc.RealEstate = 2;
  }

  // RiskProfile adjusts
  if (riskProfile === "Conservative") {
    alloc.Bonds_Intermediate = (alloc.Bonds_Intermediate ?? 0) + 10;
    alloc.Cash = (alloc.Cash ?? 0) + 5;
    alloc.Equities_US_Small = 0;
    alloc.Equities_Emerging = 0;
  } else if (riskProfile === "Aggressive") {
    alloc.Equities_US_Large = (alloc.Equities_US_Large ?? 0) + 10;
    alloc.Equities_US_Small = 8;
    alloc.Equities_Emerging = 7;
    alloc.Bonds_Intermediate = Math.max(5, (alloc.Bonds_Intermediate ?? 0) - 10);
    alloc.Cash = Math.max(3, (alloc.Cash ?? 0) - 5);
  }

  // Regime adjusts
  if (regime === "Risk-on") {
    alloc.Equities_US_Large = (alloc.Equities_US_Large ?? 0) + 5;
    alloc.Equities_US_Small = (alloc.Equities_US_Small ?? 0) + 3;
    alloc.Bonds_Intermediate = Math.max(5, (alloc.Bonds_Intermediate ?? 0) - 5);
    alloc.Cash = Math.max(3, (alloc.Cash ?? 0) - 2);
  } else if (regime === "Risk-off") {
    alloc.Bonds_Intermediate = (alloc.Bonds_Intermediate ?? 0) + 8;
    alloc.Bonds_Short = (alloc.Bonds_Short ?? 0) + 4;
    alloc.Gold = (alloc.Gold ?? 0) + 3;
    alloc.Equities_US_Large = Math.max(15, (alloc.Equities_US_Large ?? 0) - 10);
    alloc.Equities_US_Small = Math.max(0, (alloc.Equities_US_Small ?? 0) - 4);
    alloc.Equities_Emerging = Math.max(0, (alloc.Equities_Emerging ?? 0) - 4);
  } else if (regime === "Transitional") {
    // foco em equilíbrio + phase-in/out
    alloc.Cash = (alloc.Cash ?? 0) + 3;
    alloc.Gold = (alloc.Gold ?? 0) + 2;
  }

  // Goal tweaks (sem promessas; apenas “configuração”)
  if (goal === "Crypto") {
    // pequena sleeve
    alloc.Crypto_BTC = 3;
    if (riskProfile !== "Conservative") alloc.Crypto_Alt = 2;
    alloc.Cash = Math.max(3, (alloc.Cash ?? 0) - 2);
  }

  if (goal === "Forex" || goal === "Trading") {
    // Não é alocação buy&hold; é “postura”.
    // Mantemos mais liquidez e menos duração.
    alloc = {
      Cash: 40,
      Bonds_Short: 25,
      Equities_US_Large: 15,
      Gold: 10,
      Commodities_Broad: 10,
    };
    if (regime === "Risk-on") {
      alloc.Equities_US_Large = 20;
      alloc.Cash = 35;
    }
    if (regime === "Risk-off") {
      alloc.Bonds_Short = 30;
      alloc.Cash = 45;
      alloc.Equities_US_Large = 10;
    }
  }

  return normalizeAllocation(alloc);
}

function buildDecisionsFromAllocation(
  alloc: Allocation,
  regime: MarketRegime,
  horizon: Horizon,
  goal: Goal
): Decision[] {
  const decisions: Decision[] = [];

  const riskBias = postureFromRegime(regime);

  // Macro decisions
  if (riskBias === "Defensive") {
    decisions.push({
      bucket: "Bonds_Short",
      action: "Increase",
      strength: 2,
      rationale: "Regime defensivo favorece duração curta + liquidez (reduz choques).",
    });
    decisions.push({
      bucket: "Equities_US_Small",
      action: "Avoid",
      strength: 2,
      rationale: "Small caps tendem a sofrer mais em stress / risco-off.",
    });
    decisions.push({
      bucket: "Gold",
      action: "Hold",
      strength: 1,
      rationale: "Ouro costuma funcionar como diversificador quando o risco aperta.",
    });
  }

  if (riskBias === "Offensive") {
    decisions.push({
      bucket: "Equities_US_Large",
      action: "Increase",
      strength: 2,
      rationale: "Regime risk-on suporta mais risco em equities de qualidade/liquidez.",
    });
    decisions.push({
      bucket: "Cash",
      action: "Decrease",
      strength: 1,
      rationale: "Demasiada liquidez num risk-on pode reduzir eficiência do plano.",
    });
  }

  if (regime === "Transitional") {
    decisions.push({
      bucket: "Cash",
      action: "Hold",
      strength: 2,
      rationale: "Transição pede fasear entradas/saídas em vez de movimentos bruscos.",
    });
    decisions.push({
      bucket: "Equities_US_Large",
      action: "PhaseIn",
      strength: 1,
      rationale: "Fasear exposição reduz arrependimento se houver reversão rápida.",
    });
  }

  // Horizon decisions
  if (horizon === "Short") {
    decisions.push({
      bucket: "Bonds_Short",
      action: "Increase",
      strength: 2,
      rationale: "Horizonte curto → prioridade é preservar capital e reduzir volatilidade.",
    });
  }

  if (goal === "Trading" || goal === "Forex") {
    decisions.push({
      bucket: "Cash",
      action: "Hold",
      strength: 3,
      rationale: "Para trading/FX, liquidez é munição e gestão de risco é a vantagem real.",
    });
    decisions.push({
      bucket: "Bonds_Long",
      action: "Avoid",
      strength: 2,
      rationale: "Duração longa não combina com objetivo tático de curto prazo.",
    });
  }

  // Add “what the model suggests” based on largest weights
  const top = Object.entries(alloc)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3);

  for (const [bucket] of top) {
    decisions.push({
      bucket: bucket as Bucket,
      action: "Hold",
      strength: 1,
      rationale: "Este bucket é estrutural no teu plano atual (mantém coerência).",
    });
  }

  // Deduplicate by bucket+action (keep strongest)
  const map = new Map<string, Decision>();
  for (const d of decisions) {
    const key = `${d.bucket}:${d.action}`;
    const prev = map.get(key);
    if (!prev || d.strength > prev.strength) map.set(key, d);
  }
  return Array.from(map.values());
}

function guardrails(goal: Goal, horizon: Horizon, regime: MarketRegime): string[] {
  const list: string[] = [
    "Não mudar o plano por headlines — só por mudanças persistentes no contexto.",
    "Preferir consistência a intensidade: pequenas ações repetidas > grandes decisões raras.",
  ];

  if (regime === "Transitional") {
    list.push("Em transição, fasear decisões (ex.: 3–6 entradas) reduz erro de timing.");
  }
  if (horizon === "Short") {
    list.push("Horizonte curto: evita concentração e prioriza liquidez/estabilidade.");
  }
  if (goal === "Trading" || goal === "Forex") {
    list.push("Trading/FX: define risco por trade (ex.: % fixo) antes de definir entradas.");
    list.push("Sem gestão de risco, qualquer “setup” vira ruído.");
  }
  if (goal === "Crypto") {
    list.push("Crypto: tratar como sleeve pequena; nunca como base do plano de longo prazo.");
  }

  return list;
}

/**
 * MAIN ENGINE
 */
export function runDecisionEngine(input: EngineInput): EngineOutput {
  const { regime, horizon, riskProfile, goal } = input;

  const riskBias = postureFromRegime(regime);

  const tempo: EngineOutput["posture"]["tempo"] =
    goal === "Trading" || goal === "Forex"
      ? "Fast"
      : regime === "Transitional"
      ? "Slow"
      : "Normal";

  const conviction: 1 | 2 | 3 =
    regime === "Transitional" ? 1 : regime === "Neutral / Range-bound" ? 2 : 3;

  const suggestedAllocation = baseAllocationByContext(regime, horizon, riskProfile, goal);
  const decisions = buildDecisionsFromAllocation(suggestedAllocation, regime, horizon, goal);

  const cadence = cadenceFrom(goal, horizon);

  const summaryTitle =
    riskBias === "Defensive"
      ? "Defensive posture"
      : riskBias === "Offensive"
      ? "Offensive posture"
      : "Neutral posture";

  const summary =
    riskBias === "Defensive"
      ? "Context favors protection, liquidity and selective exposure. Move slower, keep optionality."
      : riskBias === "Offensive"
      ? "Context supports risk, but still reward discipline. Increase exposure gradually and avoid overtrading."
      : "Context is mixed. Prefer balance, phase decisions, and keep the plan coherent.";

  return {
    summaryTitle,
    summary,
    posture: { riskBias, tempo, conviction },
    suggestedAllocation,
    decisions,
    guardrails: guardrails(goal, horizon, regime),
    nextCheck: {
      cadence,
      why:
        cadence === "Daily"
          ? "Because your goal is tactical and conditions can shift fast."
          : cadence === "Weekly"
          ? "Weekly is enough to adapt without feeding noise."
          : "Long horizon benefits from monthly discipline over constant tweaks.",
    },
  };
}
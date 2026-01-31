"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Locale = "en" | "pt";
type Scenario = "conservative" | "base" | "ambitious";
type Regime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";

type MarketRegimePayload = {
  market_regime: Regime;
  confidence: "Low" | "Moderate" | "High";
  summary: string;
  key_risks: string[];
  regime_change_triggers: string[];
  week?: string;
  updated_at?: string;
};

async function fetchRegime(): Promise<MarketRegimePayload> {
  const res = await fetch("/api/market-regime", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load /api/market-regime");
  return res.json();
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function round(n: number) {
  return Math.round(n);
}

function labelFromScore(score: number, locale: Locale) {
  const pt = locale === "pt";
  if (score >= 85) return pt ? "Sólida" : "Solid";
  if (score >= 65) return pt ? "Boa" : "Good";
  if (score >= 45) return pt ? "Frágil" : "Fragile";
  return pt ? "Desalinhada" : "Misaligned";
}

function driverLabel(score: number, locale: Locale) {
  const pt = locale === "pt";
  if (score >= 80) return pt ? "Boa" : "Good";
  if (score >= 60) return pt ? "Moderada" : "Moderate";
  return pt ? "Fraca" : "Weak";
}

/** =========================
 * Score formula (V1)
 * ========================= */
function coherenceTemporal(goal: number, months: number, contrib: number | null): number {
  // No return assumptions. Just discipline coverage.
  if (!goal || goal <= 0 || !months || months <= 0) return 50;

  const c = contrib ?? 0;
  const estimated = c * months;
  const ratio = goal > 0 ? estimated / goal : 0;

  if (ratio >= 1.1) return 100;
  if (ratio >= 0.9) return 85;
  if (ratio >= 0.7) return 65;
  if (ratio >= 0.5) return 45;
  return 25;
}

function marketDependence(
  scenario: Scenario,
  goal: number,
  months: number,
  regime: Regime
): number {
  // Base heuristic + small contextual adjustments.
  let base = scenario === "conservative" ? 90 : scenario === "base" ? 75 : 50;

  if (months > 0 && months < 12) base -= 10;
  if (goal > 10000) base -= 5;

  if (regime === "Risk-off") base -= 10;
  if (regime === "Risk-on" && scenario === "ambitious") base += 5;

  return clamp(base, 0, 100);
}

function regimeAlignment(regime: Regime, scenario: Scenario): number {
  const table: Record<Regime, Record<Scenario, number>> = {
    "Risk-on": { conservative: 80, base: 90, ambitious: 70 },
    Transitional: { conservative: 85, base: 75, ambitious: 55 },
    "Neutral / Range-bound": { conservative: 90, base: 80, ambitious: 60 },
    "Risk-off": { conservative: 95, base: 70, ambitious: 40 },
  };
  return table[regime][scenario];
}

function simplicityScore(months: number, contrib: number | null, changes: number): number {
  // Start high. Penalize “over-optimization”.
  let s = 100;

  if (changes > 1) s -= 15;

  // “Non-standard” horizon: not divisible by 6 (simple proxy)
  if (months > 0 && months % 6 !== 0) s -= 10;

  // Over-precise monthly amounts (e.g., 137) — small penalty
  if (contrib !== null && contrib > 0) {
    const cents = Math.abs(contrib - Math.round(contrib));
    const isWeird = cents !== 0 || (contrib >= 100 && contrib % 5 !== 0);
    if (isWeird) s -= 5;
  }

  return clamp(s, 60, 100);
}

function consistencyScoreDefault(): number {
  // V1: no history yet.
  return 80;
}

function computeCoherenceScore(args: {
  goal: number;
  months: number;
  contrib: number | null;
  scenario: Scenario;
  regime: Regime;
  changes: number;
}) {
  const t = coherenceTemporal(args.goal, args.months, args.contrib);
  const md = marketDependence(args.scenario, args.goal, args.months, args.regime);
  const ra = regimeAlignment(args.regime, args.scenario);
  const sp = simplicityScore(args.months, args.contrib, args.changes);
  const cs = consistencyScoreDefault();

  const score =
    t * 0.35 +
    md * 0.25 +
    ra * 0.2 +
    sp * 0.1 +
    cs * 0.1;

  return {
    score: clamp(round(score), 0, 100),
    drivers: { temporal: t, market: md, regime: ra, simplicity: sp, consistency: cs },
  };
}

function planAnchor(locale: Locale, scenario: Scenario): string {
  const pt = locale === "pt";
  if (scenario === "conservative") return pt ? "Disciplina > Timing" : "Discipline > Timing";
  if (scenario === "ambitious") return pt ? "Tempo vence precisão" : "Time beats precision";
  return pt ? "Consistência > Intensidade" : "Consistency > Intensity";
}

function formatCurrency(n: number, locale: Locale) {
  try {
    return new Intl.NumberFormat(locale === "pt" ? "pt-PT" : "en-GB", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `€${Math.round(n)}`;
  }
}

function suggestContribution(goal: number, months: number, scenario: Scenario): number {
  // Purely arithmetic baseline, then scenario nudge.
  if (!goal || goal <= 0 || !months || months <= 0) return 75;

  const base = goal / months; // no returns assumed
  const k = scenario === "conservative" ? 1.2 : scenario === "base" ? 1.0 : 0.85;
  return Math.max(10, Math.round(base * k));
}

function suggestScenario(regime: Regime): Scenario {
  if (regime === "Risk-off") return "conservative";
  if (regime === "Risk-on") return "base";
  return "base";
}

export default function PlanningTab({ locale }: { locale: Locale }) {
  const pt = locale === "pt";

  const t = useMemo(() => {
    return {
      title: pt ? "Planning" : "Planning",
      subtitle: pt
        ? "Define um objetivo à tua maneira. O SignalCore estrutura o caminho e acompanha a coerência ao longo do tempo."
        : "Define your goal your way. SignalCore structures the path and monitors coherence over time.",
      legal: pt ? "Contexto educativo. Não constitui recomendação." : "Educational context. Not a recommendation.",

      yourGoal: pt ? "O teu objetivo" : "Your goal",
      goalAmount: pt ? "Objetivo (€)" : "Goal (€)",
      horizon: pt ? "Horizonte" : "Time horizon",
      months: pt ? "meses" : "months",
      years: pt ? "anos" : "years",
      monthly: pt ? "Contribuição mensal (opcional)" : "Monthly contribution (optional)",
      hint: pt ? "Se não souberes, deixa em branco — o SignalCore sugere uma base." : "Don’t know? Leave it blank — SignalCore suggests a baseline.",

      scenarios: pt ? "Cenários" : "Scenarios",
      mostRobust: pt ? "Mais robusto" : "Most robust",
      mostCoherent: pt ? "Mais coerente" : "Most coherent",
      moreSensitive: pt ? "Mais sensível" : "More sensitive",

      conservative: pt ? "Conservador" : "Conservative",
      base: pt ? "Base" : "Base",
      ambitious: pt ? "Ambicioso" : "Ambitious",

      coherence: pt ? "Score de Coerência" : "Coherence Score",
      live: pt ? "Atualiza em tempo real conforme mexes nos inputs." : "Updates live as you change inputs.",
      why: pt ? "Porque este score?" : "Why this score?",

      anchorTitle: pt ? "Âncora do plano" : "Plan anchor",
      assumptionsTitle: pt ? "Como interpretámos o teu objetivo" : "How we interpreted your goal",
      breakTitle: pt ? "O que pode comprometer o plano" : "What could break this plan",
      weeklyTitle: pt ? "Revisão semanal" : "Weekly review",

      noAction: pt ? "Nenhuma ação necessária." : "No action needed.",
      watch: pt ? "O SignalCore vigia estes desvios silenciosamente." : "SignalCore watches for these drifts quietly.",

      confirm: pt ? "Confirmar este plano" : "Confirm this plan",
      savedNote: pt ? "Guardar na cloud entra no próximo passo (API /planning)." : "Cloud saving comes next (API /planning).",
    };
  }, [pt]);

  // Market regime
  const [regimePayload, setRegimePayload] = useState<MarketRegimePayload | null>(null);
  const [regimeLoading, setRegimeLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchRegime();
        if (!alive) return;
        setRegimePayload(data);
      } catch {
        if (!alive) return;
        setRegimePayload(null);
      } finally {
        if (alive) setRegimeLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const regime: Regime = regimePayload?.market_regime ?? "Transitional";

  // Inputs (free)
  const [goal, setGoal] = useState<number>(5000);
  const [horizonYears, setHorizonYears] = useState<number>(3);
  const [contribInput, setContribInput] = useState<string>(""); // allow blank
  const [scenario, setScenario] = useState<Scenario>(() => suggestScenario(regime));

  // track changes for simplicity score
  const changesRef = useRef(0);
  const [changes, setChanges] = useState(0);

  // If regime loads later, keep scenario sane only on first load (avoid constant override)
  const initialRegimeApplied = useRef(false);
  useEffect(() => {
    if (initialRegimeApplied.current) return;
    if (regimeLoading) return;
    setScenario(suggestScenario(regime));
    initialRegimeApplied.current = true;
  }, [regime, regimeLoading]);

  const months = useMemo(() => clamp(Math.round(horizonYears * 12), 1, 600), [horizonYears]);

  const contrib = useMemo(() => {
    const v = contribInput.trim();
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [contribInput]);

  // bump “changes” when key inputs change
  const lastKey = useRef<string>("");
  useEffect(() => {
    const key = `${goal}|${months}|${contrib ?? "x"}|${scenario}`;
    if (!lastKey.current) {
      lastKey.current = key;
      return;
    }
    if (lastKey.current !== key) {
      lastKey.current = key;
      changesRef.current += 1;
      setChanges(changesRef.current);
    }
  }, [goal, months, contrib, scenario]);

  const suggestedMonthly = useMemo(() => suggestContribution(goal, months, scenario), [goal, months, scenario]);

  const scorePack = useMemo(() => {
    return computeCoherenceScore({
      goal,
      months,
      contrib: contrib ?? suggestedMonthly,
      scenario,
      regime,
      changes,
    });
  }, [goal, months, contrib, suggestedMonthly, scenario, regime, changes]);

  const score = scorePack.score;
  const scoreLabel = labelFromScore(score, locale);

  const drivers = scorePack.drivers;

  const driverLine = useMemo(() => {
    return [
      { k: pt ? "Ajuste temporal" : "Temporal fit", v: driverLabel(drivers.temporal, locale) },
      { k: pt ? "Dependência do mercado" : "Market dependence", v: driverLabel(drivers.market, locale) },
      { k: pt ? "Alinhamento ao regime" : "Regime alignment", v: driverLabel(drivers.regime, locale) },
    ];
  }, [drivers.temporal, drivers.market, drivers.regime, pt, locale]);

  const assumptions = useMemo(() => {
    const usedContrib = contrib ?? suggestedMonthly;
    const scenarioLabel =
      scenario === "conservative" ? t.conservative : scenario === "base" ? t.base : t.ambitious;

    return [
      {
        title: pt ? `Horizonte considerado: ${months} meses` : `Horizon considered: ${months} months`,
        reason: pt
          ? "Menos tempo aumenta dependência do mercado e fragiliza o plano."
          : "Less time increases dependence on market conditions and fragility.",
      },
      {
        title: pt
          ? `Contribuição mensal de referência: ${formatCurrency(usedContrib, locale)}`
          : `Monthly baseline: ${formatCurrency(usedContrib, locale)}`,
        reason: pt
          ? "Equilibra disciplina com dependência moderada de contexto."
          : "Balances discipline with moderate dependence on context.",
      },
      {
        title: pt ? `Cenário selecionado: ${scenarioLabel}` : `Scenario selected: ${scenarioLabel}`,
        reason: pt
          ? "O cenário altera robustez vs sensibilidade ao contexto."
          : "Scenario shifts robustness vs sensitivity to context.",
      },
      {
        title: pt ? `Regime atual: ${regime}` : `Current regime: ${regime}`,
        reason: pt
          ? "O score ajusta-se ao ambiente semanal para reduzir incoerências."
          : "The score adapts weekly to reduce coherence drift.",
      },
    ];
  }, [pt, months, contrib, suggestedMonthly, scenario, t.conservative, t.base, t.ambitious, regime, locale]);

  const breaks = useMemo(() => {
    return pt
      ? [
          "Contribuições inconsistentes",
          "Encurtar horizonte repetidamente",
          "Aumentar exposição sensível em regimes defensivos",
          "Otimizar semanalmente sem necessidade",
        ]
      : [
          "Inconsistent contributions",
          "Shrinking horizon repeatedly",
          "Increasing sensitive exposure during defensive regimes",
          "Over-optimizing weekly without need",
        ];
  }, [pt]);

  const anchor = useMemo(() => planAnchor(locale, scenario), [locale, scenario]);

  const weeklyMessage = useMemo(() => {
    if (regimeLoading) return pt ? "A carregar…" : "Loading…";
    if (score >= 65) {
      return pt
        ? "Plano continua coerente esta semana."
        : "Plan remains coherent this week.";
    }
    return pt
      ? "Sensibilidade aumentou — considera ritmo mais robusto."
      : "Sensitivity increased — consider a more robust rhythm.";
  }, [score, regimeLoading, pt]);

  const [showWhy, setShowWhy] = useState(false);

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-ink-500">{t.title}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            {pt ? "Planeamento por objetivo" : "Goal-based planning"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-700">{t.subtitle}</p>
          <p className="mt-2 text-xs text-ink-500">{t.legal}</p>
        </div>

        <div className="rounded-2xl border border-border-soft bg-canvas-50 px-4 py-3 text-xs text-ink-700">
          <div className="font-semibold">{pt ? "Regime" : "Regime"}</div>
          <div className="mt-1">{regimeLoading ? (pt ? "A carregar…" : "Loading…") : regime}</div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Left: Inputs + Scenarios */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-border-soft bg-white p-6">
            <p className="text-sm font-semibold">{t.yourGoal}</p>

            <div className="mt-4 grid gap-4">
              <div>
                <label className="text-xs font-semibold text-ink-500">{t.goalAmount}</label>
                <input
                  className="mt-1 w-full rounded-2xl border border-border-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                  value={Number.isFinite(goal) ? String(goal) : ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    setGoal(clamp(n, 0, 1_000_000));
                  }}
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-500">{t.horizon}</label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setHorizonYears(1)}
                    className={cn(
                      "rounded-2xl border border-border-soft px-4 py-3 text-sm font-semibold",
                      horizonYears === 1 ? "bg-canvas-50" : "bg-white hover:bg-canvas-50"
                    )}
                  >
                    {pt ? "6–12 meses" : "6–12 months"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHorizonYears(2)}
                    className={cn(
                      "rounded-2xl border border-border-soft px-4 py-3 text-sm font-semibold",
                      horizonYears === 2 ? "bg-canvas-50" : "bg-white hover:bg-canvas-50"
                    )}
                  >
                    {pt ? "1–3 anos" : "1–3 years"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHorizonYears(4)}
                    className={cn(
                      "rounded-2xl border border-border-soft px-4 py-3 text-sm font-semibold",
                      horizonYears === 4 ? "bg-canvas-50" : "bg-white hover:bg-canvas-50"
                    )}
                  >
                    {pt ? "3+ anos" : "3+ years"}
                  </button>

                  <div className="rounded-2xl border border-border-soft bg-white px-4 py-3">
                    <div className="text-xs font-semibold text-ink-500">{pt ? "Livre" : "Custom"}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        className="w-20 rounded-xl border border-border-soft px-3 py-2 text-sm outline-none"
                        value={String(horizonYears)}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n)) return;
                          setHorizonYears(clamp(n, 0.1, 50));
                        }}
                        inputMode="decimal"
                      />
                      <span className="text-sm text-ink-700">{t.years}</span>
                    </div>
                    <div className="mt-2 text-xs text-ink-500">
                      {pt ? `≈ ${months} meses` : `≈ ${months} months`}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-ink-500">{t.monthly}</label>
                <input
                  className="mt-1 w-full rounded-2xl border border-border-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                  value={contribInput}
                  onChange={(e) => setContribInput(e.target.value)}
                  inputMode="decimal"
                  placeholder={pt ? "Ex: 50" : "e.g. 50"}
                />
                <p className="mt-2 text-xs text-ink-500">{t.hint}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold">{t.scenarios}</p>
              <p className="text-xs text-ink-500">
                {pt ? "Clique para selecionar" : "Click to select"}
              </p>
            </div>

            <div className="mt-4 grid gap-3">
              <ScenarioCard
                active={scenario === "conservative"}
                title={t.conservative}
                tag={t.mostRobust}
                desc={pt ? "Mais disciplina, menos dependência do mercado." : "More discipline, less dependence on the market."}
                monthly={formatCurrency(suggestContribution(goal, months, "conservative"), locale)}
                onClick={() => setScenario("conservative")}
              />
              <ScenarioCard
                active={scenario === "base"}
                title={t.base}
                tag={t.mostCoherent}
                desc={pt ? "Equilíbrio risco/tempo/contexto." : "Balanced risk/time/context."}
                monthly={formatCurrency(suggestContribution(goal, months, "base"), locale)}
                onClick={() => setScenario("base")}
              />
              <ScenarioCard
                active={scenario === "ambitious"}
                title={t.ambitious}
                tag={t.moreSensitive}
                desc={pt ? "Mais sensível a mudanças de regime." : "More sensitive to regime shifts."}
                monthly={formatCurrency(suggestContribution(goal, months, "ambitious"), locale)}
                onClick={() => setScenario("ambitious")}
              />
            </div>

            <button
              type="button"
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
              onClick={() => {}}
            >
              {t.confirm}
            </button>
            <p className="mt-3 text-xs text-ink-500">{t.savedNote}</p>
          </div>
        </div>

        {/* Right: Score + Assumptions + Anchor + Weekly */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-border-soft bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-ink-500">{t.coherence}</p>
                <div className="mt-2 text-3xl font-semibold tracking-tight">
                  {score}% — {scoreLabel}
                </div>
                <p className="mt-2 text-sm text-ink-700">{t.live}</p>
              </div>

              <button
                type="button"
                onClick={() => setShowWhy((v) => !v)}
                className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                {t.why}
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <ul className="space-y-2 text-sm text-ink-900">
                {driverLine.map((d) => (
                  <li key={d.k} className="flex items-center justify-between gap-4">
                    <span className="text-ink-700">{d.k}</span>
                    <span className="font-semibold">{d.v}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-xs text-ink-500">
                {pt
                  ? "Um score mais alto não significa mais retorno. Significa menor probabilidade de erro ao longo do tempo."
                  : "A higher score doesn’t mean higher returns. It means lower probability of plan error over time."}
              </p>
            </div>

            {showWhy ? (
              <div className="mt-5 rounded-2xl border border-border-soft bg-white p-4">
                <p className="text-sm font-semibold text-ink-900">
                  {pt ? "Breakdown (V1)" : "Breakdown (V1)"}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-ink-700">
                  <li>• {pt ? "Coerência temporal" : "Temporal fit"}: {round(drivers.temporal)}</li>
                  <li>• {pt ? "Dependência do mercado" : "Market dependence"}: {round(drivers.market)}</li>
                  <li>• {pt ? "Alinhamento ao regime" : "Regime alignment"}: {round(drivers.regime)}</li>
                  <li>• {pt ? "Simplicidade" : "Simplicity"}: {round(drivers.simplicity)}</li>
                  <li>• {pt ? "Consistência" : "Consistency"}: {round(drivers.consistency)}</li>
                </ul>
                <p className="mt-3 text-xs text-ink-500">
                  {pt
                    ? "Sem previsões. Sem retornos esperados. Só alinhamento estrutural."
                    : "No predictions. No expected returns. Structural alignment only."}
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6">
            <p className="text-xs font-semibold text-ink-500">{t.anchorTitle}</p>
            <div className="mt-2 text-lg font-semibold">{anchor}</div>
            <p className="mt-2 text-sm text-ink-700">
              {pt
                ? "Este plano foi construído para funcionar mesmo quando o mercado não ajuda. A tua vantagem é manter o rumo."
                : "This plan is built to work even when the market doesn’t help. Your edge is staying the course."}
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6">
            <p className="text-xs font-semibold text-ink-500">{t.assumptionsTitle}</p>
            <div className="mt-4 space-y-3">
              {assumptions.map((a) => (
                <div key={a.title} className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <p className="text-sm font-semibold text-ink-900">{a.title}</p>
                  <p className="mt-2 text-sm text-ink-700">{a.reason}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6">
            <p className="text-xs font-semibold text-ink-500">{t.breakTitle}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-ink-700">
              {breaks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ink-700">{t.watch}</p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6">
            <p className="text-xs font-semibold text-ink-500">{t.weeklyTitle}</p>
            <div className="mt-3 rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <p className="text-sm font-semibold text-ink-900">{weeklyMessage}</p>
              <p className="mt-2 text-sm text-ink-700">{t.noAction}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({
  active,
  title,
  tag,
  desc,
  monthly,
  onClick,
}: {
  active: boolean;
  title: string;
  tag: string;
  desc: string;
  monthly: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-3xl border border-border-soft p-5 text-left transition",
        active ? "bg-canvas-50" : "bg-white hover:bg-canvas-50"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          <p className="mt-1 text-xs font-semibold text-ink-500">{tag}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-500">€/month</p>
          <p className="text-sm font-semibold text-ink-900">{monthly}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-700">{desc}</p>
    </button>
  );
}

function cn(...x: Array<string | false | undefined | null>) {
  return x.filter(Boolean).join(" ");
}
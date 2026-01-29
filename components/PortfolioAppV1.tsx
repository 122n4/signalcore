"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";

/** =========================
 * Types
 * ========================= */
type Locale = "en" | "pt";

type MarketRegimePayload = {
  market_regime: "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
  confidence: "Low" | "Moderate" | "High";
  summary: string;
  key_risks: string[];
  regime_change_triggers: string[];
  week?: string;
  updated_at?: string;
};

type AssetType = "Stock" | "ETF" | "Crypto";

type Asset = {
  id: string;
  name: string;
  type: AssetType;
  ticker?: string;
  importance: "Small" | "Medium" | "Large";
  note?: string;
  addedAt: number;
};

type Horizon = "Short" | "Medium" | "Long";
type State = "Constructive" | "Neutral" | "Caution";
type Posture = "Favorable" | "Neutral" | "Cautious";

/** =========================
 * Utils
 * ========================= */
const uid = () => Math.random().toString(36).slice(2, 10);

function cn(...x: Array<string | false | undefined | null>) {
  return x.filter(Boolean).join(" ");
}

async function fetchRegime(): Promise<MarketRegimePayload> {
  const res = await fetch("/api/market-regime", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load /api/market-regime");
  return res.json();
}

function regimePT(r: MarketRegimePayload["market_regime"]) {
  switch (r) {
    case "Risk-on":
      return "Risk-on";
    case "Risk-off":
      return "Risk-off";
    case "Transitional":
      return "Transição";
    case "Neutral / Range-bound":
      return "Neutro / Lateral";
  }
}

function confidencePT(c: MarketRegimePayload["confidence"]) {
  switch (c) {
    case "Low":
      return "Baixa";
    case "Moderate":
      return "Moderada";
    case "High":
      return "Alta";
  }
}

function weekPT(x?: string) {
  if (!x) return x;
  return x.replace(/^Week\s+/i, "Semana ");
}

function weekdayPT(x?: string) {
  if (!x) return x;
  const m: Record<string, string> = {
    Monday: "Segunda-feira",
    Tuesday: "Terça-feira",
    Wednesday: "Quarta-feira",
    Thursday: "Quinta-feira",
    Friday: "Sexta-feira",
    Saturday: "Sábado",
    Sunday: "Domingo",
  };
  return m[x] ?? x;
}

function badge(locale: Locale, s: State) {
  const label =
    locale === "pt"
      ? s === "Constructive"
        ? "✅ Construtivo"
        : s === "Neutral"
        ? "◼️ Neutro"
        : "⚠️ Cautela"
      : s === "Constructive"
      ? "✅ Constructive"
      : s === "Neutral"
      ? "◼️ Neutral"
      : "⚠️ Caution";

  const color =
    s === "Constructive"
      ? "bg-signal-700/10 text-signal-800"
      : s === "Neutral"
      ? "bg-canvas-50 text-ink-800"
      : "bg-amber-500/10 text-amber-800";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border-soft px-3 py-1 text-xs font-semibold",
        color
      )}
    >
      {label}
    </span>
  );
}

function postureBadge(locale: Locale, p: Posture) {
  const label =
    locale === "pt"
      ? p === "Favorable"
        ? "🟢 Favorável"
        : p === "Neutral"
        ? "🟡 Neutro"
        : "🔴 Cauteloso"
      : p === "Favorable"
      ? "🟢 Favorable"
      : p === "Neutral"
      ? "🟡 Neutral"
      : "🔴 Cautious";

  const color =
    p === "Favorable"
      ? "bg-signal-700/10 text-signal-800"
      : p === "Neutral"
      ? "bg-amber-500/10 text-amber-800"
      : "bg-red-500/10 text-red-700";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border-soft px-3 py-1 text-xs font-semibold",
        color
      )}
    >
      {label}
    </span>
  );
}

/** =========================
 * Copy
 * ========================= */
function copy(locale: Locale) {
  const pt = locale === "pt";
  return {
    brand: "SignalCore · Market Context",
    title: pt ? "O Meu Portefólio" : "My Portfolio",
    subtitle: pt
      ? "O teu portefólio visto através do contexto do mercado — curto, médio e longo prazo."
      : "Your portfolio through the lens of market context — short, medium and long term.",
    marketContext: pt ? "Contexto de mercado" : "Market context",
    weeklyUpdate: pt ? "Atualização semanal" : "Weekly update",
    posture: pt ? "Postura desta semana" : "This week’s posture",
    addAsset: pt ? "Adicionar ativo" : "Add an asset",
    assets: pt ? "Ativos" : "Assets",
    empty: pt ? "Ainda não tens ativos. Adiciona o primeiro abaixo." : "No assets yet. Add your first one below.",
    horizon: {
      Short: pt ? "Curto prazo" : "Short term",
      Medium: pt ? "Médio prazo" : "Medium term",
      Long: pt ? "Long term" : "Long term",
    } as const,
    fields: {
      name: pt ? "Nome" : "Name",
      ticker: pt ? "Ticker (opcional)" : "Ticker (optional)",
      type: pt ? "Tipo" : "Type",
      importance: pt ? "Importância" : "Importance",
      note: pt ? "Nota (opcional)" : "Note (optional)",
      add: pt ? "Adicionar" : "Add",
      remove: pt ? "Remover" : "Remove",
      open: pt ? "Abrir" : "Open",
      close: pt ? "Fechar" : "Close",
    },
    types: {
      Stock: pt ? "Ação" : "Stock",
      ETF: "ETF",
      Crypto: pt ? "Cripto" : "Crypto",
    } as const,
    importance: {
      Small: pt ? "Pequena" : "Small",
      Medium: pt ? "Média" : "Medium",
      Large: pt ? "Grande" : "Large",
    } as const,
    whySimilarRegimes: pt ? "Comportamento em regimes semelhantes" : "Behavior in similar regimes",
    whatMeans: pt ? "O que isto significa?" : "What this means",
    microExplain: pt
      ? "Isto não é um sinal. É uma leitura de contexto para alinhar expectativa e disciplina ao regime atual."
      : "This is not a signal. It’s context reading to align expectations and discipline with the current regime.",
    legalTitle: pt ? "Nota de enquadramento" : "Framing note",
    legalBody: pt
      ? "O SignalCore fornece leitura de contexto e risco dos mercados por horizonte temporal. As decisões de investimento são sempre da responsabilidade do utilizador."
      : "SignalCore provides market context and risk reading across time horizons. Investment decisions remain the user’s responsibility.",
  };
}

/** =========================
 * Weekly update by regime (short/medium/long)
 * ========================= */
function weeklyUpdate(locale: Locale, r: MarketRegimePayload["market_regime"]) {
  const pt = locale === "pt";

  const blocks: Record<
    MarketRegimePayload["market_regime"],
    { short: string; medium: string; long: string }
  > = {
    "Risk-on": {
      short: pt
        ? "Curto: o mercado tende a recompensar consistência. Evita confundir confiança com pressa."
        : "Short: the market tends to reward consistency. Don’t confuse confidence with urgency.",
      medium: pt
        ? "Médio: tendências ficam mais claras. Menos ‘adivinhar’, mais disciplina."
        : "Medium: trends become clearer. Less guessing, more discipline.",
      long: pt
        ? "Longo: ambiente construtivo para manter o plano. O risco é emocional (entrar tarde, sair cedo)."
        : "Long: constructive for sticking to a plan. The risk is emotional (late entries, early exits).",
    },
    "Risk-off": {
      short: pt
        ? "Curto: maior probabilidade de ruído e reversões. Prioriza controlo de risco."
        : "Short: more noise and reversals. Prioritize risk control.",
      medium: pt
        ? "Médio: postura defensiva costuma pesar mais do que tentar acertar o timing."
        : "Medium: a defensive posture often matters more than timing.",
      long: pt
        ? "Longo: stress pode criar oportunidades futuras. A skill é paciência, não atividade."
        : "Long: stress can plant future opportunities. The skill is patience, not activity.",
    },
    Transitional: {
      short: pt
        ? "Curto: mais ruído do que direção. Mudanças impulsivas costumam sair caro."
        : "Short: more noise than direction. Impulsive changes often cost.",
      medium: pt
        ? "Médio: seletivo. Confirmações são frágeis — mantém expectativas realistas."
        : "Medium: selective. Confirmation is fragile — keep expectations realistic.",
      long: pt
        ? "Longo: transições preparam o próximo ciclo. Consistência vence timing."
        : "Long: transitions often set up the next cycle. Consistency beats timing.",
    },
    "Neutral / Range-bound": {
      short: pt
        ? "Curto: movimentos direcionais falham rápido. Mantém simples."
        : "Short: directional moves can fail quickly. Keep it simple.",
      medium: pt
        ? "Médio: resultados dependem mais de seleção do que do ‘vento’ do mercado."
        : "Medium: outcomes depend more on selection than market wind.",
      long: pt
        ? "Longo: acumulação gradual pode fazer sentido se as expectativas forem realistas."
        : "Long: gradual accumulation can work if expectations stay realistic.",
    },
  };

  return blocks[r];
}

/** =========================
 * Per-asset horizon matrix + "why"
 * ========================= */
function computeMatrix(r: MarketRegimePayload["market_regime"], t: AssetType): Record<Horizon, State> {
  // Base
  const base: Record<AssetType, Record<Horizon, State>> = {
    Stock: { Short: "Caution", Medium: "Neutral", Long: "Constructive" },
    ETF: { Short: "Neutral", Medium: "Neutral", Long: "Constructive" },
    Crypto: { Short: "Caution", Medium: "Caution", Long: "Neutral" },
  };

  const m = { ...base[t] };

  if (r === "Risk-on") {
    if (t === "Stock") m.Short = "Neutral";
    if (t === "ETF") m.Short = "Constructive";
    if (t === "Crypto") m.Medium = "Neutral";
  }

  if (r === "Risk-off") {
    if (t === "Stock") {
      m.Short = "Caution";
      m.Medium = "Caution";
    }
    if (t === "ETF") {
      m.Short = "Neutral";
      m.Medium = "Neutral";
    }
    if (t === "Crypto") {
      m.Short = "Caution";
      m.Medium = "Caution";
      m.Long = "Neutral";
    }
  }

  if (r === "Neutral / Range-bound") {
    if (t === "Stock") m.Short = "Neutral";
    if (t === "ETF") m.Short = "Neutral";
    if (t === "Crypto") m.Short = "Caution";
  }

  return m;
}

function whyFor(locale: Locale, r: MarketRegimePayload["market_regime"], t: AssetType) {
  const pt = locale === "pt";

  const byType: Record<AssetType, Record<MarketRegimePayload["market_regime"], string>> = {
    Stock: {
      "Risk-on": pt
        ? "Em risk-on, ações tendem a beneficiar de momentum — mas inversões podem ser rápidas."
        : "In risk-on, stocks often benefit from momentum — but reversals can be fast.",
      "Risk-off": pt
        ? "Em risk-off, ações costumam sofrer mais volatilidade e quedas mais profundas."
        : "In risk-off, stocks often see higher volatility and deeper pullbacks.",
      Transitional: pt
        ? "Em transição, a liderança muda frequentemente — paciência costuma valer mais do que pressa."
        : "In transitions, leadership shifts often — patience tends to matter more than speed.",
      "Neutral / Range-bound": pt
        ? "Em lateral, muitos movimentos falham — consistência ajuda mais do que reação."
        : "In range-bound markets, many moves fade — consistency helps more than reaction.",
    },
    ETF: {
      "Risk-on": pt
        ? "Em risk-on, ETFs amplos tendem a funcionar quando a amplitude do mercado melhora."
        : "In risk-on, broad ETFs can work as breadth improves.",
      "Risk-off": pt
        ? "Em risk-off, ETFs também oscilam, mas geralmente menos do que ações isoladas."
        : "In risk-off, ETFs still swing, but often less than single names.",
      Transitional: pt
        ? "Em transição, diversificação ajuda, mas correlações podem subir de repente."
        : "In transitions, diversification helps, but correlations can rise suddenly.",
      "Neutral / Range-bound": pt
        ? "Em lateral, um plano simples costuma bater perseguir ruído de curto prazo."
        : "In range-bound markets, a simple plan often beats chasing short-term noise.",
    },
    Crypto: {
      "Risk-on": pt
        ? "Em risk-on, cripto pode acelerar — mas também pode inverter rápido."
        : "In risk-on, crypto can accelerate — but can also reverse quickly.",
      "Risk-off": pt
        ? "Em risk-off, cripto costuma sofrer com liquidez e choques de sentimento."
        : "In risk-off, crypto often gets hit by liquidity and sentiment shocks.",
      Transitional: pt
        ? "Em transição, cripto pode ser ‘whipsaw’ — timing fica mais difícil."
        : "In transitions, crypto can be whipsawed — timing becomes harder.",
      "Neutral / Range-bound": pt
        ? "Em lateral, cripto ainda tem picos. Tamanho de risco importa."
        : "In range-bound markets, crypto can still spike. Risk sizing matters.",
    },
  };

  return byType[t][r];
}

/** =========================
 * Portfolio posture (simple, explainable)
 * ========================= */
function computePosture(regime: MarketRegimePayload["market_regime"], assets: Asset[]): Posture {
  // Simple scoring by risk sensitivity + importance
  let score = 0;
  for (const a of assets) {
    const imp = a.importance === "Large" ? 2 : a.importance === "Medium" ? 1 : 0.5;
    const sens = a.type === "Crypto" ? 2 : a.type === "Stock" ? 1.5 : 1;
    score += imp * sens;
  }

  if (assets.length === 0) return regime === "Risk-on" ? "Neutral" : "Cautious";

  if (regime === "Risk-on") return score >= 5 ? "Favorable" : "Neutral";
  if (regime === "Risk-off") return "Cautious";
  if (regime === "Transitional") return score >= 4 ? "Cautious" : "Neutral";
  return "Neutral";
}

/** =========================
 * Component
 * ========================= */
export default function PortfolioAppV1({ locale }: { locale: Locale }) {
  const c = useMemo(() => copy(locale), [locale]);
  const { user } = useUser();

  const storageKey = useMemo(() => {
    // one portfolio per user
    return user?.id ? `sc_portfolio_v1_${user.id}_${locale}` : `sc_portfolio_v1_anon_${locale}`;
  }, [user?.id, locale]);

  const [loadingRegime, setLoadingRegime] = useState(true);
  const [regime, setRegime] = useState<MarketRegimePayload | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // form
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState<AssetType>("Stock");
  const [importance, setImportance] = useState<Asset["importance"]>("Medium");
  const [note, setNote] = useState("");

  // load assets
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setAssets(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  // save assets
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(assets));
    } catch {}
  }, [storageKey, assets]);

  // fetch regime
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchRegime();
        if (!alive) return;
        setRegime(data);
      } catch {
        if (!alive) return;
        setRegime(null);
      } finally {
        if (alive) setLoadingRegime(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const currentRegime = regime?.market_regime ?? "Transitional";
  const posture = useMemo(() => computePosture(currentRegime, assets), [currentRegime, assets]);
  const weekly = useMemo(() => weeklyUpdate(locale, currentRegime), [locale, currentRegime]);

  const headerRegime = useMemo(() => {
    if (!regime) return null;
    if (locale === "pt") {
      return {
        regime: regimePT(regime.market_regime),
        confidence: confidencePT(regime.confidence),
        week: weekPT(regime.week),
        updated_at: weekdayPT(regime.updated_at),
        summary: ptSummaryFromRegime(regime.market_regime),
      };
    }
    return {
      regime: regime.market_regime,
      confidence: regime.confidence,
      week: regime.week,
      updated_at: regime.updated_at,
      summary: regime.summary,
    };
  }, [regime, locale]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;

    const a: Asset = {
      id: uid(),
      name: clean,
      ticker: ticker.trim() || undefined,
      type,
      importance,
      note: note.trim() || undefined,
      addedAt: Date.now(),
    };

    setAssets((prev) => [a, ...prev]);
    setOpenId(a.id);

    setName("");
    setTicker("");
    setType("Stock");
    setImportance("Medium");
    setNote("");
  }

  function remove(id: string) {
    setAssets((prev) => prev.filter((x) => x.id !== id));
    setOpenId((curr) => (curr === id ? null : curr));
  }

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-4 py-12 md:py-14">
        <p className="text-xs font-semibold text-ink-500">{c.brand}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{c.title}</h1>
        <p className="mt-2 text-ink-700">{c.subtitle}</p>

        {/* Regime + weekly */}
        <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-ink-500">{c.marketContext}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-700">
                <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-xs">
                  {headerRegime?.week ?? (locale === "pt" ? "Esta semana" : "This week")}
                  {headerRegime?.updated_at ? ` · ${locale === "pt" ? "Atualizado" : "Updated"} ${headerRegime.updated_at}` : ""}
                </span>

                <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs">
                  <strong>{headerRegime?.regime ?? currentRegime}</strong>
                  <span className="text-ink-500">
                    {" "}
                    · {locale === "pt" ? "Confiança" : "Confidence"} <strong>{headerRegime?.confidence ?? (locale === "pt" ? "Moderada" : "Moderate")}</strong>
                  </span>
                </span>
              </div>
            </div>

            <div>{postureBadge(locale, posture)}</div>
          </div>

          <div className="mt-4 rounded-3xl border border-ink-100 bg-ink-50/40 px-4 py-3">
            {loadingRegime ? (
              <p className="text-sm text-ink-600">{locale === "pt" ? "A carregar…" : "Loading…"}</p>
            ) : (
              <p className="text-sm text-ink-700">{headerRegime?.summary ?? (locale === "pt" ? ptSummaryFromRegime(currentRegime) : "Context is temporarily unavailable.")}</p>
            )}
          </div>

          {/* Weekly update */}
          <div className="mt-6">
            <p className="text-sm font-semibold">{c.weeklyUpdate}</p>
            <div className="mt-3 grid gap-3">
              <div className="rounded-2xl border border-border-soft bg-white p-4">
                <p className="text-xs font-semibold text-ink-500">{c.horizon.Short}</p>
                <p className="mt-2 text-sm text-ink-700">{weekly.short}</p>
              </div>
              <div className="rounded-2xl border border-border-soft bg-white p-4">
                <p className="text-xs font-semibold text-ink-500">{c.horizon.Medium}</p>
                <p className="mt-2 text-sm text-ink-700">{weekly.medium}</p>
              </div>
              <div className="rounded-2xl border border-border-soft bg-white p-4">
                <p className="text-xs font-semibold text-ink-500">{c.horizon.Long}</p>
                <p className="mt-2 text-sm text-ink-700">{weekly.long}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <p className="text-xs font-semibold text-ink-700">{c.whatMeans}</p>
              <p className="mt-2 text-sm text-ink-700">{c.microExplain}</p>
            </div>
          </div>
        </div>

        {/* Assets */}
        <div className="mt-10">
          <h2 className="text-lg font-semibold">{c.assets}</h2>
          {assets.length === 0 ? <p className="mt-3 text-sm text-ink-600">{c.empty}</p> : null}

          <div className="mt-6 space-y-4">
            {assets.map((a) => {
              const open = openId === a.id;
              const matrix = computeMatrix(currentRegime, a.type);

              return (
                <div key={a.id} className="rounded-3xl border border-border-soft bg-white shadow-soft">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : a.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {a.name}
                        {a.ticker ? <span className="ml-2 text-sm font-medium text-ink-500">({a.ticker})</span> : null}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {c.types[a.type]} · {c.importance[a.importance]}
                        {a.note ? ` · ${a.note}` : ""}
                      </p>
                    </div>

                    <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-xs font-semibold text-ink-800">
                      {open ? c.fields.close : c.fields.open}
                    </span>
                  </button>

                  {open ? (
                    <div className="px-5 pb-5">
                      {/* Matrix table */}
                      <div className="overflow-hidden rounded-2xl border border-border-soft">
                        <table className="w-full text-sm">
                          <thead className="bg-canvas-50 text-xs text-ink-500">
                            <tr>
                              <th className="px-4 py-3 text-left">{locale === "pt" ? "Horizonte" : "Horizon"}</th>
                              <th className="px-4 py-3 text-left">{locale === "pt" ? "Leitura" : "Reading"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(["Short", "Medium", "Long"] as Horizon[]).map((h, idx) => (
                              <tr key={h} className={idx ? "border-t border-border-soft" : ""}>
                                <td className="px-4 py-3">{c.horizon[h]}</td>
                                <td className="px-4 py-3">{badge(locale, matrix[h])}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Similar regime behavior */}
                      <div className="mt-4 rounded-2xl border border-ink-100 bg-ink-50/40 px-4 py-3">
                        <p className="text-xs font-semibold text-ink-500">{c.whySimilarRegimes}</p>
                        <p className="mt-2 text-sm text-ink-700">{whyFor(locale, currentRegime, a.type)}</p>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs text-ink-500">{locale === "pt" ? "Sem sinais. Sem previsões. Só contexto." : "No signals. No predictions. Just context."}</p>

                        <button
                          type="button"
                          onClick={() => remove(a.id)}
                          className="rounded-full border border-border-soft px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-canvas-50"
                        >
                          {c.fields.remove}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Add asset */}
          <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h3 className="text-lg font-semibold">{c.addAsset}</h3>

            <form onSubmit={onAdd} className="mt-5 grid gap-3">
              <div className="grid gap-2">
                <label className="text-xs font-semibold text-ink-500">{c.fields.name}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-2xl border border-border-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                  placeholder={locale === "pt" ? "Ex: Apple, MSCI World ETF, Bitcoin" : "e.g. Apple, MSCI World ETF, Bitcoin"}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold text-ink-500">{c.fields.ticker}</label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="w-full rounded-2xl border border-border-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                  placeholder={locale === "pt" ? "Ex: AAPL (opcional)" : "e.g. AAPL (optional)"}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold text-ink-500">{c.fields.type}</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AssetType)}
                  className="w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                >
                  <option value="Stock">{c.types.Stock}</option>
                  <option value="ETF">{c.types.ETF}</option>
                  <option value="Crypto">{c.types.Crypto}</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold text-ink-500">{c.fields.importance}</label>
                <select
                  value={importance}
                  onChange={(e) => setImportance(e.target.value as Asset["importance"])}
                  className="w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                >
                  <option value="Small">{c.importance.Small}</option>
                  <option value="Medium">{c.importance.Medium}</option>
                  <option value="Large">{c.importance.Large}</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-xs font-semibold text-ink-500">{c.fields.note}</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-2xl border border-border-soft px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                  placeholder={locale === "pt" ? "Ex: longo prazo, diversificação…" : "e.g. long-term, diversification…"}
                />
              </div>

              <button
                type="submit"
                className="mt-2 inline-flex items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
              >
                {c.fields.add}
              </button>
            </form>
          </div>

          {/* Legal */}
          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <p className="text-xs font-semibold text-ink-500">{c.legalTitle}</p>
            <p className="mt-2 text-sm text-ink-700">{c.legalBody}</p>
          </div>
        </div>
      </section>
    </main>
  );
}

/** =========================
 * PT summary helper
 * ========================= */
function ptSummaryFromRegime(r: MarketRegimePayload["market_regime"]) {
  switch (r) {
    case "Risk-on":
      return "O mercado está mais favorável ao risco. Mantém disciplina: o risco é confundir confiança com pressa.";
    case "Risk-off":
      return "O mercado está mais defensivo. A prioridade tende a ser preservação e gestão de volatilidade.";
    case "Transitional":
      return "O mercado está em transição: sinais mistos e sensível a notícias macro. Ajusta expectativas e evita decisões impulsivas.";
    case "Neutral / Range-bound":
      return "O mercado está mais lateral. Consistência e controlo de risco costumam valer mais do que emoção.";
  }
}
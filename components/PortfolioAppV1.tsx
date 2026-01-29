"use client";

import React, { useEffect, useMemo, useState } from "react";

type Locale = "en" | "pt";
type AssetType = "stock" | "etf" | "crypto" | "other";
type Importance = "small" | "medium" | "large";
type Horizon = "short" | "medium" | "long";
type Status = "favorable" | "neutral" | "caution";
type Regime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";

type MarketRegimePayload = {
  market_regime: Regime;
  confidence: "Low" | "Moderate" | "High";
  summary: string;
  week?: string;
  updated_at?: string;
};

type AssetItem = {
  id: string;
  name: string;
  type: AssetType;
  importance: Importance;
  note?: string;
  createdAt: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function weight(imp: Importance) {
  if (imp === "large") return 3;
  if (imp === "medium") return 2;
  return 1;
}

function safeRegime(x: any): Regime {
  if (x === "Risk-on" || x === "Risk-off" || x === "Transitional" || x === "Neutral / Range-bound") return x;
  return "Transitional";
}

function s(locale: Locale) {
  const pt = locale === "pt";
  return {
    brand: "SignalCore · Market Context",
    title: pt ? "O Meu Portefólio" : "My Portfolio",
    subtitle: pt
      ? "Um espelho do teu portefólio e um tradutor do mercado — por horizonte temporal, sem sinais."
      : "A mirror of your portfolio and a translator of the market — by time horizon, without signals.",
    updated: pt ? "Atualizado" : "Updated",
    confidence: pt ? "Confiança" : "Confidence",
    marketContext: pt ? "Contexto de mercado" : "Market context",
    postureTitle: pt ? "Estado do teu portefólio" : "Your portfolio status",
    translatorTitle: pt ? "Tradução do mercado" : "Market translation",
    assetsTitle: pt ? "Os teus ativos" : "Your assets",
    addTitle: pt ? "Adicionar ativo" : "Add an asset",
    addHint: pt
      ? "Não precisamos de quantidades nem preço. Só o que tens (ou queres acompanhar) e a importância relativa."
      : "No quantities or entry price needed. Just what you own (or track) and relative importance.",
    assetLabel: pt ? "Ativo" : "Asset",
    assetPlaceholder: pt ? "Apple, AAPL, ETF S&P 500, Bitcoin…" : "Apple, AAPL, S&P 500 ETF, Bitcoin…",
    typeLabel: pt ? "Tipo" : "Type",
    importanceLabel: pt ? "Importância" : "Importance",
    noteLabel: pt ? "Nota (opcional)" : "Note (optional)",
    notePlaceholder: pt ? "Ex: longo prazo, diversificação…" : "e.g. long-term, diversification…",
    addBtn: pt ? "Adicionar" : "Add",
    addExample: pt ? "Adicionar exemplo" : "Add example",
    remove: pt ? "Remover" : "Remove",
    expand: pt ? "Ver leitura por horizonte" : "View horizon reading",
    collapse: pt ? "Fechar" : "Close",
    horizonReading: pt ? "Leitura por horizonte" : "Horizon reading",
    short: pt ? "Curto prazo" : "Short term",
    medium: pt ? "Médio prazo" : "Medium term",
    long: pt ? "Longo prazo" : "Long term",
    whatMeans: pt ? "O que isto significa?" : "What does this mean?",
    memoryTitle: pt ? "Memória de mercado" : "Market memory",
    framingTitle: pt ? "Nota de enquadramento" : "Framing note",
    framing: pt
      ? "O SignalCore fornece leitura de contexto e risco dos mercados. As decisões de investimento são sempre da responsabilidade do utilizador."
      : "SignalCore provides market context and risk reading. Final investment decisions are always the user’s responsibility.",
    emptyTitle: pt ? "Começa simples" : "Start simple",
    emptyBody: pt
      ? "Adiciona 2–4 ativos que já tens. Vais ver uma leitura por horizonte + explicações humanas."
      : "Add 2–4 assets you already own. You’ll see a horizon reading + human explanations.",
    status: {
      favorable: pt ? "Favorável" : "Favorable",
      neutral: pt ? "Neutro" : "Neutral",
      caution: pt ? "Cauteloso" : "Cautious",
    },
    statusLine: {
      favorable: pt
        ? "O contexto tende a recompensar consistência. Evita confundir confiança com pressa."
        : "Context tends to reward consistency. Don’t confuse confidence with urgency.",
      neutral: pt
        ? "O mercado não ajuda nem impede claramente. Disciplina vence reação."
        : "The market isn’t clearly helping or hurting. Discipline beats reaction.",
      caution: pt
        ? "Mais ruído e reversões rápidas são prováveis. Prioriza controlo de risco e calma."
        : "More noise and fast reversals are likely. Prioritize risk control and calm.",
    },
    enums: {
      type: {
        stock: pt ? "Ação" : "Stock",
        etf: "ETF",
        crypto: pt ? "Cripto" : "Crypto",
        other: pt ? "Outro" : "Other",
      },
      importance: {
        small: pt ? "Pequena" : "Small",
        medium: pt ? "Média" : "Medium",
        large: pt ? "Grande" : "Large",
      },
      pill: {
        favorable: pt ? "✅ Construtivo" : "✅ Constructive",
        neutral: pt ? "◼️ Neutro" : "◼️ Neutral",
        caution: pt ? "⚠️ Cautela" : "⚠️ Caution",
      },
    },
    education: {
      line1: pt
        ? "Curto prazo não é “trading diário”. É sensibilidade a ruído, notícias e liquidez."
        : "Short term isn’t “day trading”. It’s sensitivity to noise, headlines and liquidity.",
      line2: pt
        ? "Um ativo pode ser frágil no curto prazo e ainda assim sólido no longo prazo."
        : "An asset can be fragile short term and still solid long term.",
    },
  };
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs text-ink-700">
      {children}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-xs font-medium text-ink-800">
      {children}
    </span>
  );
}

function statusPillLabel(locale: Locale, st: Status) {
  const c = s(locale);
  return c.enums.pill[st];
}

function postureFromScores(regime: Regime, items: AssetItem[]): Status {
  if (items.length === 0) return regime === "Risk-on" ? "neutral" : "caution";

  // “Heat” simples: cripto e ações pesam mais; importância pesa mais.
  let heat = 0;
  for (const it of items) {
    const w = weight(it.importance);
    const t = it.type === "crypto" ? 2.3 : it.type === "stock" ? 1.7 : it.type === "etf" ? 1.1 : 1.4;
    heat += w * t;
  }

  if (regime === "Risk-on") return heat >= 10 ? "favorable" : "neutral";
  if (regime === "Risk-off") return "caution";
  if (regime === "Transitional") return heat >= 8 ? "caution" : "neutral";
  return "neutral";
}

/**
 * Tradutor do mercado (texto curto), baseado no regime.
 * Sem buy/sell, sem previsões, só leitura de contexto.
 */
function marketTranslation(locale: Locale, regime: Regime) {
  const pt = locale === "pt";
  if (regime === "Risk-on") {
    return pt
      ? "Num regime Risk-on, o mercado tende a recompensar consistência e risco bem gerido. O perigo costuma ser emocional: entrar tarde, sair cedo."
      : "In Risk-on, markets tend to reward consistency and well-managed risk. The main danger is emotional: entering late, exiting early.";
  }
  if (regime === "Risk-off") {
    return pt
      ? "Num regime Risk-off, o mercado penaliza exposição ao risco e amplifica ruído. O foco é reduzir impulsividade e proteger disciplina."
      : "In Risk-off, markets punish risk exposure and amplify noise. The focus is lowering impulsivity and protecting discipline.";
  }
  if (regime === "Transitional") {
    return pt
      ? "Num regime Transitional, o mercado ainda não escolheu direção. Reversões rápidas são comuns e o curto prazo tende a ser mais “barulhento”."
      : "In Transitional, the market hasn’t chosen a direction. Fast reversals are common and short-term tends to be noisier.";
  }
  return pt
    ? "Num regime neutro/lateral, o mercado não oferece muita direção. Resultados dependem mais de seleção e paciência do que de timing."
    : "In range-bound regimes, the market offers less direction. Outcomes depend more on selection and patience than timing.";
}

/**
 * Leitura por horizonte para um ativo.
 * Isto é “compatibilidade com regime” + explicação humana. Não é recomendação.
 */
function horizonReading(regime: Regime, type: AssetType): Record<Horizon, { status: Status; notePT: string; noteEN: string }> {
  const vol = type === "crypto";
  const growthy = type === "stock" || type === "crypto";
  const broad = type === "etf";

  if (regime === "Risk-on") {
    return {
      short: {
        status: growthy ? "favorable" : "neutral",
        notePT: growthy ? "O contexto tende a apoiar convicção, mas ruído ainda existe — disciplina conta." : "Não é vento contra, mas o ritmo pode ser mais lento.",
        noteEN: growthy ? "Context can support conviction, but noise still exists — discipline matters." : "Not a headwind, but pace may be slower.",
      },
      medium: {
        status: broad || growthy ? "favorable" : "neutral",
        notePT: "Tendências tendem a ficar mais claras — evita mexer demais.",
        noteEN: "Trends can become clearer — avoid over-adjusting.",
      },
      long: {
        status: "favorable",
        notePT: vol ? "Bom para consistência, mas aceita volatilidade como custo emocional." : "Consistência e tempo fazem o trabalho em regimes construtivos.",
        noteEN: vol ? "Good for consistency, but accept volatility as an emotional cost." : "Consistency and time do heavy lifting in constructive regimes.",
      },
    };
  }

  if (regime === "Risk-off") {
    return {
      short: {
        status: "caution",
        notePT: "O curto prazo tende a penalizar risco. Volatilidade e reversões ficam mais agressivas.",
        noteEN: "Short term tends to punish risk. Volatility and reversals become more aggressive.",
      },
      medium: {
        status: broad ? "neutral" : "caution",
        notePT: vol ? "Alta sensibilidade a liquidez e narrativa." : "Postura defensiva costuma importar mais do que “acertar”.",
        noteEN: vol ? "High sensitivity to liquidity and narrative." : "Defensive posture tends to matter more than being right.",
      },
      long: {
        status: "neutral",
        notePT: "Regimes de stress podem plantar oportunidades futuras — paciência é a skill.",
        noteEN: "Stress regimes can plant future opportunities — patience is the skill.",
      },
    };
  }

  if (regime === "Transitional") {
    return {
      short: {
        status: growthy ? "caution" : "neutral",
        notePT: "Mais ruído do que direção. Reversões rápidas são comuns — evita decisões impulsivas.",
        noteEN: "More noise than direction. Fast reversals are common — avoid impulsive changes.",
      },
      medium: {
        status: "neutral",
        notePT: "Confirmações são frágeis. Mantém expectativas realistas e foco no processo.",
        noteEN: "Confirmation is fragile. Keep expectations realistic and focus on process.",
      },
      long: {
        status: broad ? "favorable" : "neutral",
        notePT: "Transições muitas vezes preparam o próximo ciclo. Consistência vence timing.",
        noteEN: "Transitions often set up the next cycle. Consistency beats timing.",
      },
    };
  }

  // Neutral / Range-bound
  return {
    short: {
      status: "neutral",
      notePT: "Movimentos direcionais podem falhar rápido. Mantém simples e sem pressa.",
      noteEN: "Directional moves can fail quickly. Keep it simple and unhurried.",
    },
    medium: {
      status: "neutral",
      notePT: "Resultados dependem mais de seleção do que do ‘vento’ do mercado.",
      noteEN: "Outcomes depend more on selection than market wind.",
    },
    long: {
      status: "neutral",
      notePT: "Acumulação gradual pode fazer sentido com expectativas realistas.",
      noteEN: "Gradual accumulation can make sense with realistic expectations.",
    },
  };
}

/**
 * Memória de mercado (texto curto), dependente do regime e do tipo.
 * Não é performance passada, é “comportamento típico” em ambientes semelhantes.
 */
function marketMemory(locale: Locale, regime: Regime, type: AssetType) {
  const pt = locale === "pt";
  const isCrypto = type === "crypto";
  const isGrowth = type === "stock" || type === "crypto";
  const isEtf = type === "etf";

  if (regime === "Transitional") {
    if (isCrypto) return pt ? "Em transições, cripto tende a amplificar ruído e narrativa — exige mais disciplina no curto prazo." : "In transitions, crypto tends to amplify noise and narrative — it demands more short-term discipline.";
    if (isEtf) return pt ? "ETFs amplos tendem a suavizar extremos, mas ainda seguem o regime. O curto prazo pode ser irregular." : "Broad ETFs can smooth extremes, but still follow the regime. Short-term can be uneven.";
    if (isGrowth) return pt ? "Ações growth costumam oscilar mais quando o mercado ainda não decidiu direção." : "Growth tends to swing more when the market hasn’t chosen direction.";
  }

  if (regime === "Risk-off") {
    if (isCrypto) return pt ? "Em Risk-off, cripto costuma ter assimetria negativa (quedas rápidas) quando liquidez contrai." : "In Risk-off, crypto can show negative asymmetry (fast drops) as liquidity contracts.";
    return pt ? "Em Risk-off, ativos sensíveis ao ciclo tendem a ter maior volatilidade e drawdowns mais frequentes." : "In Risk-off, cyclically sensitive assets tend to show higher volatility and more frequent drawdowns.";
  }

  if (regime === "Risk-on") {
    return pt ? "Em Risk-on, o mercado tende a “perdoar” ruído e recompensar consistência — o risco é emocional." : "In Risk-on, markets tend to ‘forgive’ noise and reward consistency — the risk is emotional.";
  }

  return pt ? "Em mercados laterais, seleção e paciência costumam importar mais do que tentar adivinhar direção." : "In range-bound markets, selection and patience tend to matter more than guessing direction.";
}

function aggregateHorizon(locale: Locale, regime: Regime, items: AssetItem[]) {
  // “Espelho”: estado por horizonte para o portfólio
  // V1: soma pesos por status por horizon, e decide o dominante.
  const totals: Record<Horizon, Record<Status, number>> = {
    short: { favorable: 0, neutral: 0, caution: 0 },
    medium: { favorable: 0, neutral: 0, caution: 0 },
    long: { favorable: 0, neutral: 0, caution: 0 },
  };

  for (const it of items) {
    const w = weight(it.importance);
    const hr = horizonReading(regime, it.type);
    (Object.keys(hr) as Horizon[]).forEach((h) => {
      totals[h][hr[h].status] += w;
    });
  }

  const pick = (h: Horizon): Status => {
    const t = totals[h];
    // se caution dominar, é caution; senão favorable se dominar; senão neutral
    if (t.caution >= t.neutral && t.caution >= t.favorable) return "caution";
    if (t.favorable >= t.neutral && t.favorable >= t.caution) return "favorable";
    return "neutral";
  };

  const summaryLine = () => {
    const pt = locale === "pt";
    const short = pick("short");
    const long = pick("long");

    if (short === "caution" && long === "favorable") {
      return pt
        ? "Estruturalmente coerente, mas exposto a fragilidade no curto prazo."
        : "Structurally coherent, but exposed to short-term fragility.";
    }
    if (short === "caution" && long !== "favorable") {
      return pt
        ? "Exposto a fragilidade no curto prazo. Mantém disciplina e evita impulsividade."
        : "Exposed to short-term fragility. Keep discipline and avoid impulsivity.";
    }
    if (short === "favorable") {
      return pt
        ? "O contexto favorece consistência. Evita confundir confiança com pressa."
        : "Context favors consistency. Don’t confuse confidence with urgency.";
    }
    return pt ? "Equilíbrio moderado: o mercado não está a ajudar nem a impedir claramente." : "Moderate balance: the market isn’t clearly helping or hurting.";
  };

  return {
    short: pick("short"),
    medium: pick("medium"),
    long: pick("long"),
    line: summaryLine(),
  };
}

export default function PortfolioAppV1({ locale }: { locale: Locale }) {
  const c = useMemo(() => s(locale), [locale]);

  const storageKey = locale === "pt" ? "signalcore.portfolio.v1.pt" : "signalcore.portfolio.v1.en";

  const [items, setItems] = useState<AssetItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>("stock");
  const [importance, setImportance] = useState<Importance>("medium");
  const [note, setNote] = useState("");

  const [regime, setRegime] = useState<Regime>("Transitional");
  const [regimeData, setRegimeData] = useState<MarketRegimePayload | null>(null);
  const [regimeError, setRegimeError] = useState(false);

  // Load portfolio
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AssetItem[];
      if (Array.isArray(parsed)) setItems(parsed);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save portfolio
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {}
  }, [items, storageKey]);

  // Fetch regime
  useEffect(() => {
    let mounted = true;
    async function run() {
      try {
        setRegimeError(false);
        const res = await fetch("/api/market-regime", { cache: "no-store" });
        if (!res.ok) throw new Error("bad response");
        const json = (await res.json()) as MarketRegimePayload;
        if (!mounted) return;
        const normalized = safeRegime(json.market_regime);
        setRegime(normalized);
        setRegimeData({ ...json, market_regime: normalized });
      } catch {
        if (!mounted) return;
        setRegimeError(true);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, []);

  const posture = useMemo(() => postureFromScores(regime, items), [regime, items]);
  const agg = useMemo(() => aggregateHorizon(locale, regime, items), [locale, regime, items]);

  function addAsset() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const next: AssetItem = {
      id: uid(),
      name: trimmed,
      type,
      importance,
      note: note.trim() ? note.trim() : undefined,
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => [next, ...prev]);
    setName("");
    setNote("");
  }

  function addExample() {
    const now = new Date().toISOString();
    setItems([
      { id: uid(), name: "AAPL", type: "stock", importance: "medium", createdAt: now, note: locale === "pt" ? "Qualidade / longo prazo" : "Quality / long-term" },
      { id: uid(), name: "S&P 500 ETF", type: "etf", importance: "large", createdAt: now, note: locale === "pt" ? "Base diversificada" : "Diversified base" },
      { id: uid(), name: "Bitcoin", type: "crypto", importance: "small", createdAt: now, note: locale === "pt" ? "Assimétrico" : "Asymmetric" },
    ]);
  }

  function removeAsset(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
    if (openId === id) setOpenId(null);
  }

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">{c.brand}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{c.title}</h1>
        <p className="mt-3 text-ink-700">{c.subtitle}</p>

        {/* 1) Espelho: estado do portfólio */}
        <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-ink-500">{c.postureTitle}</p>
              <p className="mt-2 text-xl font-semibold">{c.status[posture]}</p>
              <p className="mt-2 text-sm text-ink-700">{agg.line}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Pill>
                {c.short}: {statusPillLabel(locale, agg.short)}
              </Pill>
              <Pill>
                {c.medium}: {statusPillLabel(locale, agg.medium)}
              </Pill>
              <Pill>
                {c.long}: {statusPillLabel(locale, agg.long)}
              </Pill>
            </div>
          </div>

          <p className="mt-4 text-xs text-ink-500">{c.statusLine[posture]}</p>
        </div>

        {/* 2) Tradutor: contexto do mercado */}
        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-500">{c.marketContext}</span>

            <Badge>
              <strong>{regime}</strong>
              {regimeData?.confidence ? (
                <span className="ml-2 text-ink-500">
                  · {c.confidence}: <strong>{regimeData.confidence}</strong>
                </span>
              ) : null}
              {regimeData?.week ? <span className="ml-2 text-ink-500">· {regimeData.week}</span> : null}
              {regimeData?.updated_at ? (
                <span className="ml-2 text-ink-500">
                  · {c.updated} {regimeData.updated_at}
                </span>
              ) : null}
              {regimeError ? <span className="ml-2 text-ink-500">· fallback</span> : null}
            </Badge>
          </div>

          {regimeData?.summary ? (
            <div className="mt-4 rounded-3xl border border-ink-100 bg-ink-50/40 px-4 py-3">
              <p className="text-sm text-ink-700">{regimeData.summary}</p>
            </div>
          ) : null}

          <div className="mt-4 rounded-3xl border border-border-soft bg-white p-5">
            <p className="text-sm font-semibold">{c.translatorTitle}</p>
            <p className="mt-2 text-sm text-ink-700">{marketTranslation(locale, regime)}</p>
          </div>
        </div>

        {/* Educação humana */}
        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <p className="text-sm font-semibold">{c.whatMeans}</p>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-ink-700">
            <li>{c.education.line1}</li>
            <li>{c.education.line2}</li>
          </ul>
        </div>

        {/* 3) Add asset */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{c.addTitle}</h2>
          <p className="mt-2 text-sm text-ink-700">{c.addHint}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-sm font-semibold">{c.assetLabel}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={c.assetPlaceholder}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              />
            </div>

            <div>
              <label className="text-sm font-semibold">{c.typeLabel}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AssetType)}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              >
                <option value="stock">{c.enums.type.stock}</option>
                <option value="etf">{c.enums.type.etf}</option>
                <option value="crypto">{c.enums.type.crypto}</option>
                <option value="other">{c.enums.type.other}</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">{c.importanceLabel}</label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value as Importance)}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              >
                <option value="small">{c.enums.importance.small}</option>
                <option value="medium">{c.enums.importance.medium}</option>
                <option value="large">{c.enums.importance.large}</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-semibold">{c.noteLabel}</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={c.notePlaceholder}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={addAsset}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              {c.addBtn}
            </button>

            <button
              type="button"
              onClick={addExample}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold hover:bg-canvas-50"
            >
              {c.addExample}
            </button>
          </div>
        </div>

        {/* 4) Assets list */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{c.assetsTitle}</h2>

          {items.length === 0 ? (
            <div className="mt-4">
              <p className="text-sm font-semibold">{c.emptyTitle}</p>
              <p className="mt-2 text-sm text-ink-700">{c.emptyBody}</p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {items.map((it) => (
                <AssetCard
                  key={it.id}
                  locale={locale}
                  regime={regime}
                  item={it}
                  open={openId === it.id}
                  onToggle={() => setOpenId(openId === it.id ? null : it.id)}
                  onRemove={() => removeAsset(it.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Framing note */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <p className="text-xs font-semibold text-ink-500">{c.framingTitle}</p>
          <p className="mt-2 text-sm text-ink-700">{c.framing}</p>
        </div>
      </section>
    </main>
  );
}

function AssetCard({
  locale,
  regime,
  item,
  open,
  onToggle,
  onRemove,
}: {
  locale: Locale;
  regime: Regime;
  item: AssetItem;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const c = s(locale);
  const hr = useMemo(() => horizonReading(regime, item.type), [regime, item.type]);

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-ink-900">{item.name}</div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Pill>{c.enums.type[item.type]}</Pill>
            <Pill>{c.enums.importance[item.importance]}</Pill>
            {item.note ? <Pill>{item.note}</Pill> : null}
          </div>

          {/* Preview linha (espelho rápido do ativo) */}
          <p className="mt-3 text-sm text-ink-700">
            {c.short}: {statusPillLabel(locale, hr.short.status)} · {c.long}: {statusPillLabel(locale, hr.long.status)}
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl border border-border-soft px-3 py-2 text-xs hover:bg-canvas-50"
        >
          {c.remove}
        </button>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="mt-4 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm font-semibold hover:bg-canvas-50"
      >
        {open ? c.collapse : c.expand}
      </button>

      {open ? (
        <div className="mt-4 space-y-3">
          <HorizonBlock
            title={c.short}
            pill={statusPillLabel(locale, hr.short.status)}
            note={locale === "pt" ? hr.short.notePT : hr.short.noteEN}
          />
          <HorizonBlock
            title={c.medium}
            pill={statusPillLabel(locale, hr.medium.status)}
            note={locale === "pt" ? hr.medium.notePT : hr.medium.noteEN}
          />
          <HorizonBlock
            title={c.long}
            pill={statusPillLabel(locale, hr.long.status)}
            note={locale === "pt" ? hr.long.notePT : hr.long.noteEN}
          />

          <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
            <p className="text-xs font-semibold text-ink-700">{c.memoryTitle}</p>
            <p className="mt-2 text-sm text-ink-700">{marketMemory(locale, regime, item.type)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HorizonBlock({ title, pill, note }: { title: string; pill: string; note: string }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <Pill>{pill}</Pill>
      </div>
      <p className="mt-2 text-sm text-ink-700">{note}</p>
    </div>
  );
}
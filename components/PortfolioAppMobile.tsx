"use client";

import React, { useEffect, useMemo, useState } from "react";

type Locale = "en" | "pt";
type AssetType = "stock" | "etf" | "crypto" | "other";
type Horizon = "short" | "medium" | "long";
type Size = "small" | "medium" | "large";

type Regime =
  | "Risk-on"
  | "Risk-off"
  | "Transitional"
  | "Neutral / Range-bound";

type Tone = "favorable" | "neutral" | "cautious";

type PortfolioItem = {
  id: string;
  name: string;
  type: AssetType;
  size: Size; // importância relativa (sem quantidades)
  note?: string;
  createdAt: string;
};

type MarketRegimePayload = {
  market_regime: Regime;
  confidence: "Low" | "Moderate" | "High";
  summary: string;
  week?: string;
  updated_at?: string;
};

const STORAGE_KEY_EN = "signalcore.portfolio.v1.mobile.en";
const STORAGE_KEY_PT = "signalcore.portfolio.v1.mobile.pt";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function strings(locale: Locale) {
  const pt = locale === "pt";
  return {
    brand: "SignalCore · Market Context",
    title: pt ? "O Meu Portefólio" : "My Portfolio",
    subtitle: pt
      ? "Adiciona os ativos que já tens. Vais receber contexto por horizonte temporal — sem sinais de compra/venda."
      : "Add the assets you already own. You’ll get horizon-based context — without buy/sell signals.",
    marketContext: pt ? "Contexto de mercado" : "Market context",
    posture: pt ? "Postura desta semana" : "This week’s posture",
    postureHelp: pt
      ? "Isto não é um sinal. É uma forma calma de adaptar expectativas ao contexto."
      : "This is not a signal. It’s a calm way to align expectations with context.",
    addAsset: pt ? "Adicionar ativo" : "Add an asset",
    assetLabel: pt ? "Ativo" : "Asset",
    assetPlaceholder: pt
      ? "Apple, AAPL, ETF S&P 500, Bitcoin…"
      : "Apple, AAPL, S&P 500 ETF, Bitcoin…",
    typeLabel: pt ? "Tipo" : "Type",
    importanceLabel: pt ? "Importância" : "Importance",
    noteLabel: pt ? "Nota (opcional)" : "Note (optional)",
    notePlaceholder: pt
      ? "Ex: longo prazo, diversificação…"
      : "e.g. long-term, diversification…",
    addBtn: pt ? "Adicionar" : "Add",
    holdings: pt ? "Ativos" : "Holdings",
    emptyTitle: pt ? "Começa simples" : "Start simple",
    emptyBody: pt
      ? "Adiciona 2–4 ativos que já tens. O SignalCore dá-te contexto por horizonte (curto/médio/longo)."
      : "Add 2–4 assets you already own. SignalCore gives horizon context (short/medium/long).",
    addExample: pt ? "Adicionar exemplo" : "Add example",
    remove: pt ? "Remover" : "Remove",
    expand: pt ? "Ver leitura por horizonte" : "View horizon reading",
    collapse: pt ? "Fechar" : "Close",
    horizonsTitle: pt ? "Leitura por horizonte" : "Horizon reading",
    short: pt ? "Curto prazo" : "Short term",
    medium: pt ? "Médio prazo" : "Medium term",
    long: pt ? "Long term" : "Long term",
    fitGood: pt ? "Compatibilidade alta" : "Higher compatibility",
    fitMix: pt ? "Compatibilidade mista" : "Mixed compatibility",
    fitLow: pt ? "Compatibilidade baixa" : "Lower compatibility",
    riskLow: pt ? "Risco baixo" : "Low risk",
    riskMod: pt ? "Risco moderado" : "Moderate risk",
    riskHigh: pt ? "Risco elevado" : "High risk",
    whatMeans: pt ? "O que isto significa?" : "What does this mean?",
    noteFrameTitle: pt ? "Nota de enquadramento" : "Framing note",
    noteFrame: pt
      ? "O SignalCore fornece leitura de contexto e risco de mercado para apoiar decisões de investimento ao longo do tempo. As decisões finais são sempre da responsabilidade do utilizador."
      : "SignalCore provides market context and risk reading to support investment decisions over time. Final decisions are always the user’s responsibility.",
    enums: {
      type: {
        stock: pt ? "Ação" : "Stock",
        etf: "ETF",
        crypto: pt ? "Cripto" : "Crypto",
        other: pt ? "Outro" : "Other",
      },
      size: {
        small: pt ? "Pequena" : "Small",
        medium: pt ? "Média" : "Medium",
        large: pt ? "Grande" : "Large",
      },
    },
    tone: {
      favorable: pt ? "Favorável" : "Favorable",
      neutral: pt ? "Neutro" : "Neutral",
      cautious: pt ? "Cauteloso" : "Cautious",
    },
    toneLines: {
      favorable: pt
        ? "O contexto tende a recompensar consistência. Evita confundir confiança com pressa."
        : "Context tends to reward consistency. Don’t confuse confidence with urgency.",
      neutral: pt
        ? "O mercado não está claramente a ajudar nem a impedir. Disciplina vence reação."
        : "The market isn’t clearly helping or hurting. Discipline beats reaction.",
      cautious: pt
        ? "Mais ruído e reversões rápidas são prováveis. Prioriza controlo de risco e calma."
        : "More noise and fast reversals are likely. Prioritize risk control and calm.",
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

function normalizeRegime(x: any): Regime {
  if (x === "Risk-on" || x === "Risk-off" || x === "Transitional" || x === "Neutral / Range-bound") return x;
  return "Transitional";
}

// Postura global (v1) baseada em regime + mistura de tipos + importância
function computeTone(regime: Regime, items: PortfolioItem[]): Tone {
  if (items.length === 0) return regime === "Risk-on" ? "neutral" : "cautious";

  let heat = 0;
  for (const it of items) {
    const sizeW = it.size === "large" ? 2 : it.size === "medium" ? 1 : 0.5;
    const typeW = it.type === "crypto" ? 2 : it.type === "stock" ? 1.5 : it.type === "etf" ? 1 : 1.2;
    heat += sizeW * typeW;
  }

  if (regime === "Risk-on") return heat >= 5 ? "favorable" : "neutral";
  if (regime === "Risk-off") return "cautious";
  if (regime === "Transitional") return heat >= 4 ? "cautious" : "neutral";
  return heat >= 5 ? "neutral" : "neutral";
}

// “Leitura por horizonte” por ativo (v1)
function horizonAssessment(regime: Regime, type: AssetType) {
  // devolve: {fit, risk, note} por horizonte
  // Regras simples e explicáveis, não “previsão”.
  const make = (fit: "high" | "mixed" | "low", risk: "low" | "mod" | "high", noteEN: string, notePT: string) => ({
    fit,
    risk,
    noteEN,
    notePT,
  });

  // Base por tipo
  const typeIsVol = type === "crypto";
  const typeIsGrowthy = type === "stock" || type === "crypto";
  const typeIsBroad = type === "etf";

  if (regime === "Risk-on") {
    return {
      short: make(
        typeIsGrowthy ? "high" : "mixed",
        typeIsVol ? "high" : "mod",
        typeIsGrowthy ? "Momentum tends to have room, but discipline still matters." : "Not a headwind, but upside may be slower.",
        typeIsGrowthy ? "O momentum tende a ter espaço, mas disciplina conta." : "Não é um vento contra, mas o ritmo pode ser mais lento."
      ),
      medium: make(
        typeIsGrowthy || typeIsBroad ? "high" : "mixed",
        typeIsVol ? "high" : "mod",
        "Trends can become clearer — avoid overtrading.",
        "As tendências ficam mais claras — evita mexer demais."
      ),
      long: make(
        "high",
        typeIsVol ? "mod" : "low",
        "Consistency and time do heavy lifting in constructive regimes.",
        "Consistência e tempo fazem o trabalho em regimes construtivos."
      ),
    };
  }

  if (regime === "Risk-off") {
    return {
      short: make(
        "low",
        "high",
        "Short-term moves tend to punish risk exposure. Expect sharper swings.",
        "No curto prazo, o risco é penalizado. Espera oscilações mais fortes."
      ),
      medium: make(
        typeIsBroad ? "mixed" : "low",
        typeIsVol ? "high" : "mod",
        "A defensive stance tends to matter more than being right.",
        "Uma postura defensiva costuma importar mais do que acertar."
      ),
      long: make(
        "mixed",
        typeIsVol ? "high" : "mod",
        "Stress regimes can plant future opportunities — patience is the skill.",
        "Regimes de stress podem criar oportunidades futuras — paciência é a skill."
      ),
    };
  }

  if (regime === "Transitional") {
    return {
      short: make(
        typeIsGrowthy ? "low" : "mixed",
        typeIsVol ? "high" : "high",
        "More noise than direction. Reversals are common — avoid impulsive changes.",
        "Mais ruído do que direção. Reversões são comuns — evita decisões impulsivas."
      ),
      medium: make(
        "mixed",
        typeIsVol ? "high" : "mod",
        "Selectivity matters. Confirmation is fragile — keep expectations realistic.",
        "A seleção importa. A confirmação é frágil — mantém expectativas realistas."
      ),
      long: make(
        typeIsBroad ? "high" : "mixed",
        typeIsVol ? "high" : "mod",
        "Transitions often set up the next cycle. Consistency beats timing.",
        "Transições muitas vezes preparam o próximo ciclo. Consistência vence timing."
      ),
    };
  }

  // Neutral / Range-bound
  return {
    short: make(
      "low",
      "mod",
      "Directional moves can fail quickly. Keep it simple.",
      "Movimentos direcionais podem falhar rápido. Mantém simples."
    ),
    medium: make(
      "mixed",
      "mod",
      "Results depend more on selection than market wind.",
      "Resultados dependem mais de seleção do que do ‘vento’ do mercado."
    ),
    long: make(
      "mixed",
      "low",
      "Gradual accumulation can work if expectations stay realistic.",
      "Acumulação gradual pode funcionar com expectativas realistas."
    ),
  };
}

export default function PortfolioAppMobile({ locale }: { locale: Locale }) {
  const s = useMemo(() => strings(locale), [locale]);
  const storageKey = locale === "pt" ? STORAGE_KEY_PT : STORAGE_KEY_EN;

  const [items, setItems] = useState<PortfolioItem[]>([]);

  const [asset, setAsset] = useState("");
  const [type, setType] = useState<AssetType>("stock");
  const [size, setSize] = useState<Size>("medium");
  const [note, setNote] = useState("");

  const [regime, setRegime] = useState<Regime>("Transitional");
  const [regimeData, setRegimeData] = useState<MarketRegimePayload | null>(null);
  const [regimeError, setRegimeError] = useState(false);

  const tone = useMemo(() => computeTone(regime, items), [regime, items]);

  // Load saved portfolio
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PortfolioItem[];
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
        const norm = normalizeRegime(json.market_regime);
        setRegime(norm);
        setRegimeData({ ...json, market_regime: norm });
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

  function add() {
    const trimmed = asset.trim();
    if (!trimmed) return;

    const next: PortfolioItem = {
      id: uid(),
      name: trimmed,
      type,
      size,
      note: note.trim() ? note.trim() : undefined,
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => [next, ...prev]);
    setAsset("");
    setNote("");
  }

  function addExample() {
    const examples: PortfolioItem[] = [
      { id: uid(), name: "AAPL", type: "stock", size: "medium", createdAt: new Date().toISOString() },
      { id: uid(), name: "S&P 500 ETF", type: "etf", size: "large", createdAt: new Date().toISOString() },
      { id: uid(), name: "Bitcoin", type: "crypto", size: "small", createdAt: new Date().toISOString() },
    ];
    setItems(examples);
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">{s.brand}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{s.title}</h1>
        <p className="mt-3 text-ink-700">{s.subtitle}</p>

        {/* Market context */}
        <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-ink-500">{s.marketContext}</span>
            <Badge>
              <strong>{regime}</strong>
              {regimeData?.confidence ? (
                <span className="ml-2 text-ink-500">
                  · {locale === "pt" ? "Confiança" : "Confidence"}: <strong>{regimeData.confidence}</strong>
                </span>
              ) : null}
              {regimeData?.week ? <span className="ml-2 text-ink-500">· {regimeData.week}</span> : null}
              {regimeData?.updated_at ? (
                <span className="ml-2 text-ink-500">
                  · {locale === "pt" ? "Atualizado" : "Updated"} {regimeData.updated_at}
                </span>
              ) : null}
            </Badge>
            {regimeError ? <span className="text-xs text-ink-500">· {locale === "pt" ? "Fallback ativo" : "Fallback active"}</span> : null}
          </div>

          {regimeData?.summary ? (
            <div className="mt-4 rounded-3xl border border-ink-100 bg-ink-50/40 px-4 py-3">
              <p className="text-sm text-ink-700">{regimeData.summary}</p>
            </div>
          ) : null}
        </div>

        {/* Posture */}
        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-ink-500">{s.posture}</p>
              <p className="mt-2 text-xl font-semibold">{s.tone[tone]}</p>
            </div>
            <Pill>{regime}</Pill>
          </div>
          <p className="mt-3 text-sm text-ink-700">{s.toneLines[tone]}</p>
          <p className="mt-2 text-xs text-ink-500">{s.postureHelp}</p>
        </div>

        {/* Add asset */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{s.addAsset}</h2>

          <div className="mt-5 grid gap-4">
            <div>
              <label className="text-sm font-semibold">{s.assetLabel}</label>
              <input
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                placeholder={s.assetPlaceholder}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold">{s.typeLabel}</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AssetType)}
                  className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
                >
                  <option value="stock">{s.enums.type.stock}</option>
                  <option value="etf">{s.enums.type.etf}</option>
                  <option value="crypto">{s.enums.type.crypto}</option>
                  <option value="other">{s.enums.type.other}</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold">{s.importanceLabel}</label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value as Size)}
                  className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
                >
                  <option value="small">{s.enums.size.small}</option>
                  <option value="medium">{s.enums.size.medium}</option>
                  <option value="large">{s.enums.size.large}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold">{s.noteLabel}</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={s.notePlaceholder}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              />
            </div>

            <button
              type="button"
              onClick={add}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              {s.addBtn}
            </button>
          </div>
        </div>

        {/* Holdings */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{s.holdings}</h2>

          {items.length === 0 ? (
            <div className="mt-4">
              <p className="text-sm font-semibold">{s.emptyTitle}</p>
              <p className="mt-2 text-sm text-ink-700">{s.emptyBody}</p>

              <button
                type="button"
                onClick={addExample}
                className="mt-5 inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold hover:bg-canvas-50"
              >
                {s.addExample}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {items.map((it) => (
                <AssetCard
                  key={it.id}
                  locale={locale}
                  regime={regime}
                  item={it}
                  labels={s}
                  onRemove={() => remove(it.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Framing note */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <p className="text-xs font-semibold text-ink-500">{s.noteFrameTitle}</p>
          <p className="mt-2 text-sm text-ink-700">{s.noteFrame}</p>
        </div>
      </section>
    </main>
  );
}

function AssetCard({
  locale,
  regime,
  item,
  labels,
  onRemove,
}: {
  locale: Locale;
  regime: Regime;
  item: PortfolioItem;
  labels: ReturnType<typeof strings>;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  const a = useMemo(() => horizonAssessment(regime, item.type), [regime, item.type]);

  function fitLabel(fit: "high" | "mixed" | "low") {
    if (fit === "high") return labels.fitGood;
    if (fit === "mixed") return labels.fitMix;
    return labels.fitLow;
  }

  function riskLabel(risk: "low" | "mod" | "high") {
    if (risk === "low") return labels.riskLow;
    if (risk === "mod") return labels.riskMod;
    return labels.riskHigh;
  }

  const topLine =
    a.short.fit === "low" || a.short.risk === "high"
      ? `${labels.short}: ${fitLabel(a.short.fit)}`
      : a.medium.fit === "low" || a.medium.risk === "high"
      ? `${labels.medium}: ${fitLabel(a.medium.fit)}`
      : `${labels.long}: ${fitLabel(a.long.fit)}`;

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-ink-900">{item.name}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill>{labels.enums.type[item.type]}</Pill>
            <Pill>{labels.enums.size[item.size]}</Pill>
            {item.note ? <Pill>{item.note}</Pill> : null}
          </div>

          <p className="mt-3 text-sm text-ink-700">{topLine}</p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="rounded-xl border border-border-soft px-3 py-2 text-xs hover:bg-canvas-50"
        >
          {labels.remove}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-4 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm font-semibold hover:bg-canvas-50"
      >
        {open ? labels.collapse : labels.expand}
      </button>

      {open ? (
        <div className="mt-4 space-y-3">
          <HorizonRow locale={locale} title={labels.short} fit={fitLabel(a.short.fit)} risk={riskLabel(a.short.risk)} note={locale === "pt" ? a.short.notePT : a.short.noteEN} />
          <HorizonRow locale={locale} title={labels.medium} fit={fitLabel(a.medium.fit)} risk={riskLabel(a.medium.risk)} note={locale === "pt" ? a.medium.notePT : a.medium.noteEN} />
          <HorizonRow locale={locale} title={labels.long} fit={fitLabel(a.long.fit)} risk={riskLabel(a.long.risk)} note={locale === "pt" ? a.long.notePT : a.long.noteEN} />

          <div className="mt-3 rounded-2xl border border-border-soft bg-canvas-50 p-4">
            <p className="text-xs font-semibold text-ink-700">{labels.whatMeans}</p>
            <p className="mt-2 text-sm text-ink-700">
              {locale === "pt"
                ? "Isto é leitura de contexto, não previsão. Serve para ajustar expectativa e disciplina ao regime atual."
                : "This is context reading, not a forecast. It helps align expectations and discipline with the current regime."}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HorizonRow({
  title,
  fit,
  risk,
  note,
}: {
  locale: Locale;
  title: string;
  fit: string;
  risk: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <div className="flex flex-wrap gap-2">
          <Pill>{fit}</Pill>
          <Pill>{risk}</Pill>
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-700">{note}</p>
    </div>
  );
}
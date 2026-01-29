"use client";

import React, { useEffect, useMemo, useState } from "react";

type Locale = "en" | "pt";
type AssetType = "stock" | "etf" | "crypto" | "other";
type Horizon = "short" | "medium" | "long";
type Size = "small" | "medium" | "large";

type Fit = "aligned" | "neutral" | "misaligned";
type Risk = "low" | "moderate" | "high";

type Regime =
  | "Risk-on"
  | "Risk-off"
  | "Transitional"
  | "Neutral / Range-bound";

type PortfolioItem = {
  id: string;
  name: string;
  type: AssetType;
  horizon: Horizon;
  size: Size;
  note?: string;
  createdAt: string;
};

const STORAGE_KEY_EN = "signalcore.portfolio.v1.en";
const STORAGE_KEY_PT = "signalcore.portfolio.v1.pt";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function copy(locale: Locale) {
  const pt = locale === "pt";
  return {
    brand: "SignalCore · Market Context",
    title: pt ? "O Meu Portefólio" : "My Portfolio",
    subtitle: pt
      ? "Adiciona os ativos que já tens. O SignalCore dá contexto de risco e encaixe com o regime — sem sinais de compra/venda."
      : "Add the assets you already own. SignalCore gives risk context and regime fit — without buy/sell signals.",
    regimeLabel: pt ? "Regime atual" : "Current regime",
    portfolioFit: pt ? "Encaixe do portefólio" : "Portfolio fit",
    addTitle: pt ? "Adicionar ativo" : "Add an asset",
    addHint: pt
      ? "Não estamos a dizer se é “bom”. Estamos a avaliar contexto e comportamento do risco."
      : "We’re not judging if it’s “good”. We’re assessing context and risk behavior.",
    assetLabel: pt ? "Ativo" : "Asset",
    assetPlaceholder: pt
      ? "Apple, AAPL, ETF S&P 500, Bitcoin…"
      : "Apple, AAPL, S&P 500 ETF, Bitcoin…",
    typeLabel: pt ? "Tipo" : "Type",
    horizonLabel: pt ? "Horizonte" : "Horizon",
    sizeLabel: pt ? "Importância" : "Importance",
    noteLabel: pt ? "Nota (opcional)" : "Note (optional)",
    notePlaceholder: pt
      ? "Porque tens este ativo? (ex: longo prazo, diversificação…)"
      : "Why do you hold it? (e.g. long-term, diversification…)",
    addBtn: pt ? "Adicionar e analisar" : "Add & assess",
    holdings: pt ? "Ativos" : "Holdings",
    empty: pt
      ? "Ainda não há ativos. Adiciona o primeiro acima."
      : "No assets yet. Add your first one above.",
    thAsset: pt ? "Ativo" : "Asset",
    thType: pt ? "Tipo" : "Type",
    thHorizon: pt ? "Horizonte" : "Horizon",
    thFit: pt ? "Encaixe" : "Fit",
    thRisk: pt ? "Risco" : "Risk",
    thContext: pt ? "Contexto" : "Context",
    remove: pt ? "Remover" : "Remove",
    principle: pt
      ? "Resultados consistentes vêm de decisões consistentes. O SignalCore foca-se no contexto que sustenta ambos."
      : "Consistent results come from consistent decisions. SignalCore focuses on the context that supports both.",
    disclaimer: pt
      ? "Conteúdo educativo. Sem sinais. Sem previsões. O SignalCore não presta aconselhamento financeiro."
      : "Educational content only. No signals. No predictions. SignalCore does not provide investment advice.",
    enums: {
      types: {
        stock: pt ? "Ação" : "Stock",
        etf: "ETF",
        crypto: pt ? "Cripto" : "Crypto",
        other: pt ? "Outro" : "Other",
      },
      horizons: {
        short: pt ? "Curto" : "Short",
        medium: pt ? "Médio" : "Medium",
        long: pt ? "Longo" : "Long",
      },
      sizes: {
        small: pt ? "Pequena" : "Small",
        medium: pt ? "Média" : "Medium",
        large: pt ? "Grande" : "Large",
      },
      fit: {
        aligned: pt ? "Alinhado" : "Aligned",
        neutral: pt ? "Neutro" : "Neutral",
        misaligned: pt ? "Desalinhado" : "Misaligned",
      },
      risk: {
        low: pt ? "Baixo" : "Low",
        moderate: pt ? "Moderado" : "Moderate",
        high: pt ? "Elevado" : "High",
      },
    },
    tips: {
      fitTitle: pt ? "O que é “Encaixe”?" : "What is “Fit”?",
      fitBody: pt
        ? "Não é previsão de preço. É compatibilidade entre o regime atual e o comportamento típico deste tipo de ativo (especialmente no teu horizonte)."
        : "Not a price forecast. It’s a compatibility check between the current regime and how this type of asset typically behaves (especially for your horizon).",
      horizonTitle: pt ? "O que é “Horizonte”?" : "What is “Horizon”?",
      horizonBody: pt
        ? "É o tempo que consegues manter sem stress emocional — não o tempo “ideal”."
        : "It’s the time you can hold without emotional stress — not the “ideal” holding period.",
      volatilityTitle: pt ? "Volatilidade" : "Volatility",
      volatilityBody: pt
        ? "Variações de preço. Pode levar a decisões impulsivas — mesmo sem mudança real de fundamentos."
        : "Price swings. It can trigger impulsive decisions even without a real change in fundamentals.",
      correlationTitle: pt ? "Correlação" : "Correlation",
      correlationBody: pt
        ? "Quando vários ativos se mexem juntos, a diversificação perde força."
        : "When many assets move together, diversification becomes less effective.",
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

function Info({ title, body }: { title: string; body: string }) {
  return (
    <details className="inline-block">
      <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700">
        <span className="rounded-full border border-border-soft bg-white px-2 py-0.5">
          ⓘ
        </span>
        <span className="hidden sm:inline">{title}</span>
      </summary>
      <div className="mt-2 w-[300px] rounded-2xl border border-border-soft bg-white p-3 text-xs text-ink-700 shadow-soft">
        <div className="font-semibold text-ink-900">{title}</div>
        <div className="mt-1">{body}</div>
      </div>
    </details>
  );
}

/**
 * Compatibilidade contextual v1 (explicável).
 * NOTA: não é previsão. é “como tende a sentir-se” neste regime.
 */
function assess(regime: Regime, item: PortfolioItem) {
  const typeScore: Record<AssetType, number> = {
    stock: 2,
    etf: 1,
    crypto: 3,
    other: 2,
  };

  const horizonAdj: Record<Horizon, number> = {
    short: 1,
    medium: 0,
    long: -1,
  };

  const regimeAdj: Record<Regime, number> = {
    "Risk-on": -1,
    "Risk-off": 1,
    "Transitional": 1,
    "Neutral / Range-bound": 0,
  };

  const base = typeScore[item.type] + horizonAdj[item.horizon] + regimeAdj[regime];

  const risk: Risk = base <= 1 ? "low" : base <= 3 ? "moderate" : "high";

  let fit: Fit = "neutral";
  if (regime === "Risk-on") {
    fit = item.type === "crypto" || item.type === "stock" ? "aligned" : "neutral";
  } else if (regime === "Risk-off") {
    fit = item.type === "crypto" ? "misaligned" : "neutral";
  } else if (regime === "Transitional") {
    fit =
      item.horizon === "short" && (item.type === "crypto" || item.type === "stock")
        ? "misaligned"
        : "neutral";
  } else {
    fit = "neutral";
  }

  const flags: ("vol" | "corr" | "horizon")[] = [];
  if (item.type === "crypto") flags.push("vol");
  if (item.horizon === "short") flags.push("horizon");
  if (regime === "Transitional" || regime === "Risk-off") flags.push("corr");

  const contextEN =
    fit === "aligned"
      ? "Generally compatible with the current environment — discipline matters more than activity."
      : fit === "misaligned"
      ? "More likely to feel noisy in this regime. Focus on risk control and avoid impulsive changes."
      : "Not clearly helped or harmed by the regime. Consistency beats reaction.";

  const contextPT =
    fit === "aligned"
      ? "Geralmente compatível com o contexto atual — disciplina conta mais do que atividade."
      : fit === "misaligned"
      ? "Mais provável de sentir “ruído” neste regime. Foca-te no controlo de risco e evita mudanças impulsivas."
      : "Não está claramente favorecido nem penalizado. Consistência vence reação.";

  return { fit, risk, flags, contextEN, contextPT };
}

function overallFit(fits: Fit[]): Fit {
  if (fits.length === 0) return "neutral";
  const mis = fits.filter((f) => f === "misaligned").length;
  const ali = fits.filter((f) => f === "aligned").length;
  if (mis >= 2) return "misaligned";
  if (ali >= 2) return "aligned";
  if (mis === 1 && ali === 0) return "misaligned";
  return "neutral";
}

export default function PortfolioApp({
  locale,
  regime = "Transitional",
}: {
  locale: Locale;
  regime?: Regime;
}) {
  const c = useMemo(() => copy(locale), [locale]);
  const storageKey = locale === "pt" ? STORAGE_KEY_PT : STORAGE_KEY_EN;

  const [items, setItems] = useState<PortfolioItem[]>([]);

  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>("stock");
  const [horizon, setHorizon] = useState<Horizon>("long");
  const [size, setSize] = useState<Size>("medium");
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PortfolioItem[];
      if (Array.isArray(parsed)) setItems(parsed);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {}
  }, [items, storageKey]);

  const rows = useMemo(() => {
    return items.map((it) => ({ ...it, ...assess(regime, it) }));
  }, [items, regime]);

  const portfolioFitLabel = useMemo(() => {
    const fit = overallFit(rows.map((r) => r.fit));
    return c.enums.fit[fit];
  }, [rows, c.enums.fit]);

  function addItem() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const next: PortfolioItem = {
      id: uid(),
      name: trimmed,
      type,
      horizon,
      size,
      note: note.trim() ? note.trim() : undefined,
      createdAt: new Date().toISOString(),
    };

    setItems((prev) => [next, ...prev]);
    setName("");
    setNote("");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-xs font-semibold text-ink-500">{c.brand}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          {c.title}
        </h1>
        <p className="mt-3 text-ink-700">{c.subtitle}</p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Badge>
            {c.regimeLabel}: <strong className="ml-1">{regime}</strong>
          </Badge>
          <Badge>
            {c.portfolioFit}: <strong className="ml-1">{portfolioFitLabel}</strong>
          </Badge>

          <Info title={c.tips.fitTitle} body={c.tips.fitBody} />
          <Info title={c.tips.horizonTitle} body={c.tips.horizonBody} />
        </div>

        {/* Add asset */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{c.addTitle}</h2>
          <p className="mt-2 text-sm text-ink-700">{c.addHint}</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold">{c.assetLabel}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={c.assetPlaceholder}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              />
              <p className="mt-2 text-xs text-ink-500">
                {locale === "pt"
                  ? "Podes escrever o nome ou o ticker. Não precisa ser perfeito."
                  : "You can type the name or ticker. It doesn’t need to be perfect."}
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold">{c.typeLabel}</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AssetType)}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              >
                <option value="stock">{c.enums.types.stock}</option>
                <option value="etf">{c.enums.types.etf}</option>
                <option value="crypto">{c.enums.types.crypto}</option>
                <option value="other">{c.enums.types.other}</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">{c.horizonLabel}</label>
              <select
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as Horizon)}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              >
                <option value="short">{c.enums.horizons.short}</option>
                <option value="medium">{c.enums.horizons.medium}</option>
                <option value="long">{c.enums.horizons.long}</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">{c.sizeLabel}</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as Size)}
                className="mt-2 w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/30"
              >
                <option value="small">{c.enums.sizes.small}</option>
                <option value="medium">{c.enums.sizes.medium}</option>
                <option value="large">{c.enums.sizes.large}</option>
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
              onClick={addItem}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              {c.addBtn}
            </button>
            <p className="text-xs text-ink-500">{c.disclaimer}</p>
          </div>
        </div>

        {/* Holdings */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{c.holdings}</h2>

          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-ink-700">{c.empty}</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="text-xs text-ink-500">
                  <tr>
                    <th className="py-2 pr-4">{c.thAsset}</th>
                    <th className="py-2 pr-4">{c.thType}</th>
                    <th className="py-2 pr-4">{c.thHorizon}</th>
                    <th className="py-2 pr-4">{c.thFit}</th>
                    <th className="py-2 pr-4">{c.thRisk}</th>
                    <th className="py-2 pr-4">{c.thContext}</th>
                    <th className="py-2 pr-0"></th>
                  </tr>
                </thead>

                <tbody className="text-ink-700">
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border-soft">
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-ink-900">{r.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Pill>{c.enums.sizes[r.size]}</Pill>
                          {r.note ? <Pill>{r.note}</Pill> : null}
                        </div>
                      </td>

                      <td className="py-3 pr-4">{c.enums.types[r.type]}</td>
                      <td className="py-3 pr-4">{c.enums.horizons[r.horizon]}</td>
                      <td className="py-3 pr-4">
                        <Pill>{c.enums.fit[r.fit]}</Pill>
                      </td>
                      <td className="py-3 pr-4">
                        <Pill>{c.enums.risk[r.risk]}</Pill>
                      </td>

                      <td className="py-3 pr-4 max-w-[360px]">
                        <div>{locale === "pt" ? r.contextPT : r.contextEN}</div>

                        {r.flags.includes("vol") ? (
                          <div className="mt-2 text-xs text-ink-500">
                            ⓘ {c.tips.volatilityTitle}: {c.tips.volatilityBody}
                          </div>
                        ) : null}

                        {r.flags.includes("corr") ? (
                          <div className="mt-1 text-xs text-ink-500">
                            ⓘ {c.tips.correlationTitle}: {c.tips.correlationBody}
                          </div>
                        ) : null}

                        {r.flags.includes("horizon") ? (
                          <div className="mt-1 text-xs text-ink-500">
                            ⓘ {c.tips.horizonTitle}: {c.tips.horizonBody}
                          </div>
                        ) : null}
                      </td>

                      <td className="py-3 pr-0">
                        <button
                          type="button"
                          onClick={() => removeItem(r.id)}
                          className="rounded-xl border border-border-soft px-3 py-2 text-xs hover:bg-canvas-50"
                        >
                          {c.remove}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="mt-6 text-sm font-semibold text-ink-900">
                {c.principle}
              </p>
              <p className="mt-2 text-xs text-ink-500">{c.disclaimer}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
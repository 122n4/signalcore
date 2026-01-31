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

/** =========================
 * Cloud Portfolio (Supabase via /api/portfolio)
 * We store a simple shape in cloud:
 * { holdings: [{ name, type, ticker?, note? }] }
 * ========================= */
type CloudHolding = {
  name: string;
  type: "Stock" | "ETF" | "Crypto";
  ticker?: string;
  note?: string;
};

async function fetchCloudHoldings(): Promise<CloudHolding[] | null> {
  const res = await fetch("/api/portfolio", {
    method: "GET",
    credentials: "include",
  });

  if (!res.ok) return null;

  const json = await res.json();
  const holdings = json?.data?.holdings;
  return Array.isArray(holdings) ? holdings : [];
}

async function saveCloudHoldings(holdings: CloudHolding[]): Promise<void> {
  await fetch("/api/portfolio", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holdings }),
  });
}

function holdingsToAssets(holdings: CloudHolding[]): Asset[] {
  const now = Date.now();
  return holdings
    .filter((h) => (h?.name ?? "").trim().length > 0)
    .map((h) => ({
      id: uid(),
      name: h.name,
      type: h.type,
      ticker: h.ticker,
      note: h.note,
      importance: "Medium",
      addedAt: now,
    }));
}

function assetsToHoldings(assets: Asset[]): CloudHolding[] {
  return assets
    .filter((a) => (a?.name ?? "").trim().length > 0)
    .map((a) => ({
      name: a.name,
      type: a.type,
      ticker: a.ticker,
      note: a.note,
    }));
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

    assets: pt ? "Ativos" : "Assets",
    addAsset: pt ? "Adicionar ativo" : "Add an asset",
    empty: pt
      ? "Ainda não tens ativos. Adiciona o primeiro abaixo."
      : "No assets yet. Add your first one below.",

    tableTitle: pt
      ? "Como os teus ativos tendem a comportar-se por horizonte"
      : "How your assets tend to behave across horizons",

    horizon: {
      Short: pt ? "Curto prazo" : "Short term",
      Medium: pt ? "Médio prazo" : "Medium term",
      Long: pt ? "Longo prazo" : "Long term",
    } as const,

    state: {
      Caution: pt ? "Cautela" : "Caution",
      Neutral: pt ? "Neutro" : "Neutral",
      Constructive: pt ? "Construtivo" : "Constructive",
    } as const,

    explainShort: pt
      ? "Curto prazo tende a reagir mais a ruído, notícias e sentimento."
      : "Short-term tends to react more to noise, news and sentiment.",
    explainMedium: pt
      ? "Médio prazo começa a filtrar esse ruído, mas ainda depende de confirmação."
      : "Medium-term starts filtering that noise, but still requires confirmation.",
    explainLong: pt
      ? "Longo prazo tende a refletir fatores mais estruturais do mercado."
      : "Long-term tends to reflect more structural market forces.",

    whyDifferentBtn: pt
      ? "Porque estas leituras são diferentes?"
      : "Why do these readings differ?",
    whyDifferentBody: pt
      ? [
          "No curto prazo, mudanças rápidas de sentimento e notícias podem dominar o comportamento.",
          "No médio prazo, parte desse ruído desaparece, mas o mercado ainda pode não ter direção definida.",
          "No longo prazo, o tempo dilui oscilações de curto prazo e a estrutura passa a pesar mais.",
        ]
      : [
          "In the short term, fast shifts in sentiment and news can dominate behavior.",
          "In the medium term, some noise fades, but the market may still lack clear direction.",
          "In the long term, time dilutes short-term swings and structure tends to matter more.",
        ],

    tooltipPrefix: pt ? "Porque?" : "Why?",
    tooltipNote: pt
      ? "Leitura contextual: descreve comportamento típico, não dá instruções."
      : "Context reading: describes typical behavior, not instructions.",

    optionalTitle: pt
      ? "Explorar ativos compatíveis com este horizonte"
      : "Explore assets compatible with this horizon",
    optionalSubtitle: pt
      ? "Leitura contextual baseada no estado atual do mercado."
      : "Contextual view based on current market conditions.",

    optionalIntro: pt
      ? [
          "Esta tabela mostra como diferentes ativos tendem a alinhar-se com o horizonte selecionado, considerando o contexto atual do mercado.",
          "O objetivo é apoiar coerência temporal e risco, não indicar decisões específicas.",
        ]
      : [
          "This table shows how different assets tend to align with the selected horizon, considering the current market context.",
          "The goal is to support temporal coherence and risk awareness, not specific decisions.",
        ],

    exploreBtn: pt ? "Explorar ativos compatíveis" : "Explore compatible assets",
    hideBtn: pt ? "Fechar" : "Close",

    optCols: {
      asset: pt ? "Ativo / Categoria" : "Asset / Category",
      type: pt ? "Tipo" : "Type",
      align: pt ? "Alinhamento" : "Alignment",
      context: pt ? "Contexto" : "Context",
    },

    alignLegend: pt
      ? {
          strong: "✅ Forte",
          moderate: "◼️ Moderado / Dependente",
          sensitive: "⚠️ Sensível",
        }
      : {
          strong: "✅ Strong",
          moderate: "◼️ Moderate / Dependent",
          sensitive: "⚠️ Sensitive",
        },

    optionalOutro: pt
      ? "Leitura comparativa e contextual. Não constitui recomendação."
      : "Comparative and contextual. Not a recommendation.",

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

    legalTitle: pt ? "Nota de enquadramento" : "Framing note",
    legalBody: pt
      ? "O SignalCore fornece análise de contexto e leitura de risco por horizonte temporal. As decisões finais são sempre da responsabilidade do utilizador."
      : "SignalCore provides contextual market analysis and horizon-based risk perspective. Final decisions always remain the user’s responsibility.",
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
 * Per-asset horizon matrix
 * ========================= */
function computeMatrix(
  r: MarketRegimePayload["market_regime"],
  t: AssetType
): Record<Horizon, State> {
  const base: Record<AssetType, Record<Horizon, State>> = {
    Stock: { Short: "Caution", Medium: "Neutral", Long: "Constructive" },
    ETF: { Short: "Neutral", Medium: "Neutral", Long: "Constructive" },
    Crypto: { Short: "Caution", Medium: "Neutral", Long: "Neutral" },
  };

  const m = { ...base[t] };

  if (r === "Risk-on") {
    if (t === "Stock") m.Short = "Neutral";
    if (t === "ETF") m.Short = "Constructive";
    if (t === "Crypto") m.Medium = "Neutral";
    m.Long = "Constructive";
  }

  if (r === "Risk-off") {
    if (t === "Stock") {
      m.Short = "Caution";
      m.Medium = "Caution";
      m.Long = "Neutral";
    }
    if (t === "ETF") {
      m.Short = "Neutral";
      m.Medium = "Neutral";
      m.Long = "Constructive";
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
    m.Medium = "Neutral";
    m.Long = t === "Crypto" ? "Neutral" : "Constructive";
  }

  if (r === "Transitional") {
    if (t === "Stock") m.Long = "Constructive";
    if (t === "ETF") m.Long = "Constructive";
    if (t === "Crypto") m.Medium = "Neutral";
  }

  return m;
}

/** =========================
 * Portfolio posture (simple)
 * ========================= */
function computePosture(
  regime: MarketRegimePayload["market_regime"],
  assets: Asset[]
): Posture {
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
 * Status cell (icon + word + tooltip)
 * ========================= */
function statusMeta(locale: Locale, s: State) {
  const pt = locale === "pt";

  const icon = s === "Constructive" ? "✅" : s === "Neutral" ? "◼️" : "⚠️";
  const word = pt
    ? s === "Constructive"
      ? "Construtivo"
      : s === "Neutral"
      ? "Neutro"
      : "Cautela"
    : s === "Constructive"
    ? "Constructive"
    : s === "Neutral"
    ? "Neutral"
    : "Caution";

  const color =
    s === "Constructive"
      ? "bg-signal-700/10 text-signal-800"
      : s === "Neutral"
      ? "bg-canvas-50 text-ink-800"
      : "bg-amber-500/10 text-amber-800";

  return { icon, word, color };
}

function tooltipFor(
  locale: Locale,
  horizon: Horizon,
  state: State,
  regime: MarketRegimePayload["market_regime"]
) {
  const pt = locale === "pt";

  const base =
    horizon === "Short"
      ? pt
        ? "Curto prazo é mais sensível a ruído, notícias e sentimento."
        : "Short term is more sensitive to noise, news and sentiment."
      : horizon === "Medium"
      ? pt
        ? "Médio prazo filtra parte do ruído, mas ainda depende de confirmação."
        : "Medium term filters some noise, but still depends on confirmation."
      : pt
      ? "Longo prazo tende a refletir fatores mais estruturais do mercado."
      : "Long term tends to reflect more structural forces.";

  const stateLine =
    state === "Caution"
      ? pt
        ? "Neste contexto, a sensibilidade tende a ser maior."
        : "In this context, sensitivity tends to be higher."
      : state === "Neutral"
      ? pt
        ? "Neste contexto, o comportamento tende a ser misto."
        : "In this context, behavior tends to be mixed."
      : pt
      ? "Neste contexto, o alinhamento tende a ser mais consistente."
      : "In this context, alignment tends to be more consistent.";

  const regimeLine = pt ? `Regime atual: ${regimePT(regime)}` : `Current regime: ${regime}`;

  return `${base} ${stateLine} ${regimeLine}`;
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span title={text} className="inline-flex">
      {children}
    </span>
  );
}

function StatusCell({
  locale,
  horizon,
  state,
  regime,
}: {
  locale: Locale;
  horizon: Horizon;
  state: State;
  regime: MarketRegimePayload["market_regime"];
}) {
  const meta = statusMeta(locale, state);
  const tip = tooltipFor(locale, horizon, state, regime);

  return (
    <Tooltip text={tip}>
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border-soft px-3 py-1 text-xs font-semibold",
          meta.color
        )}
      >
        <span aria-hidden>{meta.icon}</span>
        <span>{meta.word}</span>
      </span>
    </Tooltip>
  );
}

/** =========================
 * Optional explore table logic (regime + horizon)
 * ========================= */
type ExploreRow = {
  label: string;
  type: AssetType | "Category";
  align: "Strong" | "Moderate" | "Sensitive";
  contextEN: string;
  contextPT: string;
};

function buildExploreRows(regime: MarketRegimePayload["market_regime"], horizon: Horizon): ExploreRow[] {
  const rows: ExploreRow[] = [
    {
      label: "Broad market ETF",
      type: "ETF",
      align: "Strong",
      contextEN: "Diversification tends to help across full cycles.",
      contextPT: "Diversificação tende a ajudar ao longo de ciclos completos.",
    },
    {
      label: "Quality large-caps",
      type: "Category",
      align: "Strong",
      contextEN: "More stable cashflows tend to improve long-horizon consistency.",
      contextPT: "Cashflows mais estáveis tendem a melhorar consistência no longo prazo.",
    },
    {
      label: "High-growth equities",
      type: "Category",
      align: "Moderate",
      contextEN: "Potentially constructive long term, but more sensitive in choppy regimes.",
      contextPT: "Podem funcionar no longo prazo, mas são mais sensíveis em regimes instáveis.",
    },
    {
      label: "Low-volatility ETF",
      type: "ETF",
      align: "Moderate",
      contextEN: "Can reduce swings, especially when risk appetite is weak.",
      contextPT: "Pode reduzir oscilações, especialmente quando o apetite ao risco é fraco.",
    },
    {
      label: "Crypto (large-cap)",
      type: "Crypto",
      align: "Sensitive",
      contextEN: "Volatility remains structural; horizon matters more than timing.",
      contextPT: "Volatilidade é estrutural; horizonte importa mais do que timing.",
    },
  ];

  function bump(row: ExploreRow, to: ExploreRow["align"]) {
    row.align = to;
  }

  for (const r of rows) {
    if (regime === "Risk-off") {
      if (r.label.includes("Crypto")) bump(r, "Sensitive");
      if (r.label.includes("High-growth")) bump(r, "Sensitive");
      if (r.label.includes("Low-volatility")) bump(r, "Strong");
      if (r.label.includes("Broad market")) bump(r, "Moderate");
    }

    if (regime === "Risk-on") {
      if (r.label.includes("Broad market")) bump(r, "Strong");
      if (r.label.includes("High-growth")) bump(r, horizon === "Long" ? "Strong" : "Moderate");
      if (r.label.includes("Crypto")) bump(r, "Moderate");
    }

    if (regime === "Transitional") {
      if (horizon === "Short") {
        if (r.label.includes("High-growth")) bump(r, "Sensitive");
        if (r.label.includes("Crypto")) bump(r, "Sensitive");
        if (r.label.includes("Broad market")) bump(r, "Moderate");
      }
      if (horizon === "Medium") {
        if (r.label.includes("High-growth")) bump(r, "Moderate");
        if (r.label.includes("Crypto")) bump(r, "Moderate");
      }
      if (horizon === "Long") {
        if (r.label.includes("Quality")) bump(r, "Strong");
        if (r.label.includes("Broad market")) bump(r, "Strong");
      }
    }

    if (regime === "Neutral / Range-bound") {
      if (r.align === "Strong") bump(r, "Moderate");
      if (r.label.includes("Crypto")) bump(r, "Sensitive");
    }
  }

  for (const r of rows) {
    if (horizon === "Long") {
      if (r.label.includes("Broad market")) r.align = "Strong";
      if (r.label.includes("Quality")) r.align = "Strong";
    }
    if (horizon === "Short") {
      if (r.label.includes("Crypto")) r.align = "Sensitive";
      if (r.label.includes("High-growth")) r.align = "Sensitive";
    }
  }

  return rows;
}

function alignBadge(locale: Locale, a: ExploreRow["align"]) {
  const pt = locale === "pt";
  const label =
    a === "Strong"
      ? pt
        ? "✅ Forte"
        : "✅ Strong"
      : a === "Moderate"
      ? pt
        ? "◼️ Moderado"
        : "◼️ Moderate"
      : pt
      ? "⚠️ Sensível"
      : "⚠️ Sensitive";

  const color =
    a === "Strong"
      ? "bg-signal-700/10 text-signal-800"
      : a === "Moderate"
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

/** =========================
 * Component
 * ========================= */
export default function PortfolioAppV1({ locale = "en" }: { locale?: Locale }) {
  const c = useMemo(() => copy(locale), [locale]);
  const { user } = useUser();

  const storageKey = useMemo(() => {
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

  // optional explore
  const [showExplore, setShowExplore] = useState(false);
  const [selectedHorizon, setSelectedHorizon] = useState<Horizon>("Long");

  /** =========================
   * LOAD assets (cloud-first for signed-in users)
   * ========================= */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) signed in -> try cloud first
      if (user?.id) {
        try {
          const cloudHoldings = await fetchCloudHoldings();
          if (cancelled) return;

          if (cloudHoldings !== null) {
            const cloudAssets = holdingsToAssets(cloudHoldings);
            setAssets(cloudAssets);

            // keep localStorage in sync
            try {
              localStorage.setItem(storageKey, JSON.stringify(cloudAssets));
            } catch {}

            // migrate local -> cloud if cloud empty and local has assets
            if (cloudHoldings.length === 0) {
              try {
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                  const localAssets = JSON.parse(raw) as Asset[];
                  if (Array.isArray(localAssets) && localAssets.length > 0) {
                    await saveCloudHoldings(assetsToHoldings(localAssets));
                    if (!cancelled) setAssets(localAssets);
                  }
                }
              } catch {}
            }

            return;
          }
        } catch {
          // fall through to localStorage
        }
      }

      // 2) fallback: localStorage
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw && !cancelled) setAssets(JSON.parse(raw));
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [storageKey, user?.id]);

  /** =========================
   * SAVE assets (local always + cloud debounced when signed-in)
   * ========================= */
  useEffect(() => {
    // local always
    try {
      localStorage.setItem(storageKey, JSON.stringify(assets));
    } catch {}

    // cloud only if signed in
    if (!user?.id) return;

    // remove empty-name items before saving
    const cleaned = assets.filter((a) => (a?.name ?? "").trim().length > 0);

    const tmr = setTimeout(() => {
      saveCloudHoldings(assetsToHoldings(cleaned)).catch(() => {});
    }, 800);

    return () => clearTimeout(tmr);
  }, [storageKey, assets, user?.id]);

  /** =========================
   * fetch regime
   * ========================= */
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

  const exploreRows = useMemo(() => buildExploreRows(currentRegime, selectedHorizon), [
    currentRegime,
    selectedHorizon,
  ]);

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
                  {headerRegime?.updated_at
                    ? ` · ${locale === "pt" ? "Atualizado" : "Updated"} ${headerRegime.updated_at}`
                    : ""}
                </span>

                <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs">
                  <strong>{headerRegime?.regime ?? currentRegime}</strong>
                  <span className="text-ink-500">
                    {" "}
                    · {locale === "pt" ? "Confiança" : "Confidence"}{" "}
                    <strong>
                      {headerRegime?.confidence ?? (locale === "pt" ? "Moderada" : "Moderate")}
                    </strong>
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
              <p className="text-sm text-ink-700">
                {headerRegime?.summary ??
                  (locale === "pt"
                    ? ptSummaryFromRegime(currentRegime)
                    : "Context is temporarily unavailable.")}
              </p>
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
                        {a.ticker ? (
                          <span className="ml-2 text-sm font-medium text-ink-500">({a.ticker})</span>
                        ) : null}
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
                      <p className="text-sm font-semibold">
                        {locale === "pt" ? "Comportamento por horizonte" : "Horizon behavior"}
                      </p>

                      <div className="mt-3 overflow-hidden rounded-2xl border border-border-soft">
                        <table className="w-full text-sm">
                          <thead className="bg-canvas-50 text-xs text-ink-500">
                            <tr>
                              <th className="px-4 py-3 text-left">{locale === "pt" ? "Horizonte" : "Horizon"}</th>
                              <th className="px-4 py-3 text-left">{locale === "pt" ? "Leitura" : "Reading"}</th>
                            </tr>
                          </thead>

                          <tbody>
                            <tr>
                              <td className="px-4 py-3">{c.horizon.Short}</td>
                              <td className="px-4 py-3">
                                <StatusCell locale={locale} horizon="Short" state={matrix.Short} regime={currentRegime} />
                              </td>
                            </tr>

                            <tr className="border-t border-border-soft">
                              <td className="px-4 py-3">{c.horizon.Medium}</td>
                              <td className="px-4 py-3">
                                <StatusCell locale={locale} horizon="Medium" state={matrix.Medium} regime={currentRegime} />
                              </td>
                            </tr>

                            <tr className="border-t border-border-soft">
                              <td className="px-4 py-3">{c.horizon.Long}</td>
                              <td className="px-4 py-3">
                                <StatusCell locale={locale} horizon="Long" state={matrix.Long} regime={currentRegime} />
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4 rounded-2xl border border-border-soft bg-white p-4">
                        <p className="text-sm text-ink-700">
                          {c.explainShort}
                          <br />
                          {c.explainMedium}
                          <br />
                          {c.explainLong}
                        </p>

                        <details className="mt-3">
                          <summary className="cursor-pointer text-sm font-semibold text-ink-900">
                            {c.whyDifferentBtn}
                          </summary>
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
                            {c.whyDifferentBody.map((x) => (
                              <li key={x}>{x}</li>
                            ))}
                          </ul>
                          <p className="mt-3 text-xs text-ink-500">{c.tooltipNote}</p>
                        </details>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs text-ink-500">
                          {locale === "pt"
                            ? "Sem sinais. Sem previsões. Só contexto."
                            : "No signals. No predictions. Just context."}
                        </p>

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

          {/* Optional Explore */}
          {assets.length > 0 ? (
            <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold">{c.optionalTitle}</p>
                  <p className="mt-1 text-sm text-ink-700">{c.optionalSubtitle}</p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedHorizon}
                    onChange={(e) => setSelectedHorizon(e.target.value as Horizon)}
                    className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                  >
                    <option value="Short">{c.horizon.Short}</option>
                    <option value="Medium">{c.horizon.Medium}</option>
                    <option value="Long">{c.horizon.Long}</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowExplore((v) => !v)}
                    className={cn(
                      "rounded-2xl px-4 py-2 text-sm font-semibold border border-border-soft",
                      showExplore ? "bg-canvas-50" : "bg-white hover:bg-canvas-50"
                    )}
                  >
                    {showExplore ? c.hideBtn : c.exploreBtn}
                  </button>
                </div>
              </div>

              {showExplore ? (
                <>
                  <div className="mt-4 space-y-2 text-sm text-ink-700">
                    {c.optionalIntro.map((x) => (
                      <p key={x}>{x}</p>
                    ))}
                  </div>

                  <div className="mt-4 overflow-hidden rounded-2xl border border-border-soft">
                    <table className="w-full text-sm">
                      <thead className="bg-canvas-50 text-xs text-ink-500">
                        <tr>
                          <th className="px-4 py-3 text-left">{c.optCols.asset}</th>
                          <th className="px-4 py-3 text-left">{c.optCols.type}</th>
                          <th className="px-4 py-3 text-left">{c.optCols.align}</th>
                          <th className="px-4 py-3 text-left">{c.optCols.context}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exploreRows.map((r, idx) => (
                          <tr key={`${r.label}-${idx}`} className={idx ? "border-t border-border-soft" : ""}>
                            <td className="px-4 py-3 font-medium">{r.label}</td>
                            <td className="px-4 py-3">
                              {r.type === "Category"
                                ? locale === "pt"
                                  ? "Categoria"
                                  : "Category"
                                : c.types[r.type]}
                            </td>
                            <td className="px-4 py-3">{alignBadge(locale, r.align)}</td>
                            <td className="px-4 py-3 text-ink-700">
                              {locale === "pt" ? r.contextPT : r.contextEN}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs">
                      {c.alignLegend.strong}
                    </span>
                    <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs">
                      {c.alignLegend.moderate}
                    </span>
                    <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs">
                      {c.alignLegend.sensitive}
                    </span>
                  </div>

                  <p className="mt-4 text-xs text-ink-500">{c.optionalOutro}</p>
                </>
              ) : null}
            </div>
          ) : null}

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
                  placeholder={locale === "pt" ? "Ex: Apple, ETF MSCI World, Bitcoin" : "e.g. Apple, MSCI World ETF, Bitcoin"}
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
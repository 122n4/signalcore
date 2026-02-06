"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

    assets: pt ? "Ativos" : "Assets",
    addAsset: pt ? "Adicionar ativo" : "Add an asset",
    empty: pt ? "Ainda não tens ativos. Adiciona o primeiro abaixo." : "No assets yet. Add your first one below.",

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

    // New: horizon decision table
    decisionTitle: pt ? "Horizonte de investimento (do utilizador)" : "Your investment horizon",
    decisionSubtitle: pt
      ? "Escolhe o horizonte. O SignalCore mostra uma leitura contextual para te manter coerente."
      : "Pick a horizon. SignalCore shows a context reading to keep you coherent.",
    opinionTitle: pt ? "Opinião SignalCore (contextual)" : "SignalCore view (contextual)",
    opinionNote: pt
      ? "Isto é leitura de contexto e risco — não é recomendação nem promessa de retorno."
      : "This is context & risk framing — not advice or return promises.",

    saved: pt ? "Guardado" : "Saved",
    saving: pt ? "A guardar…" : "Saving…",
    lastUpdated: pt ? "Atualizado" : "Updated",
    cloud: pt ? "Cloud" : "Cloud",
    local: pt ? "Local" : "Local",
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
        ? "Curto: consistência costuma ser recompensada. Evita confundir confiança com pressa."
        : "Short: consistency tends to be rewarded. Don’t confuse confidence with urgency.",
      medium: pt
        ? "Médio: tendências ficam mais claras. Menos ‘adivinhar’, mais disciplina."
        : "Medium: trends become clearer. Less guessing, more discipline.",
      long: pt
        ? "Longo: ambiente construtivo para manter o plano. O risco é emocional."
        : "Long: constructive for sticking to a plan. The risk is emotional.",
    },
    "Risk-off": {
      short: pt
        ? "Curto: mais ruído e reversões. Prioriza controlo de risco."
        : "Short: more noise and reversals. Prioritize risk control.",
      medium: pt
        ? "Médio: postura defensiva costuma pesar mais do que tentar timing."
        : "Medium: defensive posture often matters more than timing.",
      long: pt
        ? "Longo: stress pode criar oportunidades futuras. A skill é paciência."
        : "Long: stress can plant future opportunities. The skill is patience.",
    },
    Transitional: {
      short: pt
        ? "Curto: mais ruído do que direção. Mudanças impulsivas saem caro."
        : "Short: more noise than direction. Impulsive changes often cost.",
      medium: pt
        ? "Médio: confirmações são frágeis — mantém expectativas realistas."
        : "Medium: confirmation is fragile — keep expectations realistic.",
      long: pt
        ? "Longo: transições preparam o próximo ciclo. Consistência vence timing."
        : "Long: transitions set up the next cycle. Consistency beats timing.",
    },
    "Neutral / Range-bound": {
      short: pt
        ? "Curto: movimentos direcionais falham rápido. Mantém simples."
        : "Short: directional moves can fail quickly. Keep it simple.",
      medium: pt
        ? "Médio: depende mais de seleção do que do ‘vento’ do mercado."
        : "Medium: depends more on selection than market wind.",
      long: pt
        ? "Longo: acumulação gradual pode fazer sentido com expectativas realistas."
        : "Long: gradual accumulation can work if expectations stay realistic.",
    },
  };

  return blocks[r];
}

/** =========================
 * Per-asset horizon matrix (contextual behavior)
 * ========================= */
function computeMatrix(r: MarketRegimePayload["market_regime"], t: AssetType): Record<Horizon, State> {
  const base: Record<AssetType, Record<Horizon, State>> = {
    Stock: { Short: "Caution", Medium: "Neutral", Long: "Constructive" },
    ETF: { Short: "Neutral", Medium: "Neutral", Long: "Constructive" },
    Crypto: { Short: "Caution", Medium: "Neutral", Long: "Neutral" },
  };

  const m = { ...base[t] };

  if (r === "Risk-on") {
    if (t === "Stock") m.Short = "Neutral";
    if (t === "ETF") m.Short = "Constructive";
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
 * Portfolio-level view for a user-chosen horizon
 * (contextual, NOT advice)
 * ========================= */
function scoreState(s: State) {
  return s === "Constructive" ? 2 : s === "Neutral" ? 1 : 0;
}

function weightAsset(a: Asset) {
  const imp = a.importance === "Large" ? 2 : a.importance === "Medium" ? 1 : 0.5;
  const sens = a.type === "Crypto" ? 1.4 : a.type === "Stock" ? 1.15 : 1;
  return imp * sens;
}

function portfolioHorizonView(regime: MarketRegimePayload["market_regime"], horizon: Horizon, assets: Asset[]): State {
  if (assets.length === 0) return "Neutral";

  let sum = 0;
  let wsum = 0;
  for (const a of assets) {
    const m = computeMatrix(regime, a.type);
    const w = weightAsset(a);
    wsum += w;
    sum += scoreState(m[horizon]) * w;
  }
  const avg = wsum ? sum / wsum : 1;

  if (avg >= 1.55) return "Constructive";
  if (avg >= 0.85) return "Neutral";
  return "Caution";
}

function opinionBlock(locale: Locale, state: State, horizon: Horizon, regime: MarketRegimePayload["market_regime"]) {
  const pt = locale === "pt";

  const horizonLabel = pt
    ? horizon === "Short"
      ? "Curto"
      : horizon === "Medium"
      ? "Médio"
      : "Longo"
    : horizon;

  const regimeLabel = pt
    ? regime === "Risk-on"
      ? "Risk-on"
      : regime === "Risk-off"
      ? "Risk-off"
      : regime === "Transitional"
      ? "Transição"
      : "Neutro/Lateral"
    : regime;

  const head =
    state === "Constructive"
      ? pt
        ? `✅ ${horizonLabel}: contexto construtivo (com disciplina)`
        : `✅ ${horizonLabel}: constructive context (with discipline)`
      : state === "Neutral"
      ? pt
        ? `◼️ ${horizonLabel}: misto/neutral — exige coerência`
        : `◼️ ${horizonLabel}: mixed/neutral — requires coherence`
      : pt
      ? `⚠️ ${horizonLabel}: sensível — prioriza controlo de risco`
      : `⚠️ ${horizonLabel}: sensitive — prioritize risk control`;

  const bullets =
    state === "Constructive"
      ? pt
        ? [
            "Foco: consistência e horizonte (não timing).",
            "Evita: mexer no plano por ruído semanal.",
            `Regime: ${regimeLabel}.`,
          ]
        : [
            "Focus: consistency and horizon (not timing).",
            "Avoid: changing the plan due to weekly noise.",
            `Regime: ${regimeLabel}.`,
          ]
      : state === "Neutral"
      ? pt
        ? [
            "Foco: simplicidade, diversificação, e controlo emocional.",
            "Evita: aumentar complexidade sem necessidade.",
            `Regime: ${regimeLabel}.`,
          ]
        : [
            "Focus: simplicity, diversification, emotional control.",
            "Avoid: adding complexity without need.",
            `Regime: ${regimeLabel}.`,
          ]
      : pt
      ? [
          "Foco: preservação, reduzir decisões, manter liquidez/folga.",
          "Evita: pressa e overtrading.",
          `Regime: ${regimeLabel}.`,
        ]
      : [
          "Focus: preservation, reduce decisions, keep buffer/liquidity.",
          "Avoid: urgency and overtrading.",
          `Regime: ${regimeLabel}.`,
        ];

  return { head, bullets };
}

/** =========================
 * Component
 * ========================= */
export default function PortfolioAppV1({ locale }: { locale: Locale }) {
  const c = useMemo(() => copy(locale), [locale]);
  const { user, isSignedIn } = useUser();

  const [loadingRegime, setLoadingRegime] = useState(true);
  const [regime, setRegime] = useState<MarketRegimePayload | null>(null);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  // user horizon selection (new)
  const [userHorizon, setUserHorizon] = useState<Horizon>("Long");

  // save indicators
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [storageMode, setStorageMode] = useState<"cloud" | "local">("local");
  const lastSaveTimer = useRef<number | null>(null);

  // form
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState<AssetType>("Stock");
  const [importance, setImportance] = useState<Asset["importance"]>("Medium");
  const [note, setNote] = useState("");

  // Stable localStorage key (only used for signed-out fallback)
  const localKey = useMemo(() => {
    const uid = user?.id ?? "anon";
    return `sc_portfolio_v1_${uid}_${locale}`;
  }, [user?.id, locale]);

  /** ---------- Fetch regime ---------- */
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
  const weekly = useMemo(() => weeklyUpdate(locale, currentRegime), [locale, currentRegime]);

  /** ---------- Cloud load (signed-in) + local fallback ---------- */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Default to local until proven otherwise
      setStorageMode(isSignedIn ? "cloud" : "local");

      // Signed-in: try cloud first
      if (isSignedIn) {
        try {
          const res = await fetch("/api/portfolio", { cache: "no-store" });
          if (!res.ok) throw new Error("cloud load failed");
          const json = await res.json();
          if (cancelled) return;

          if (json?.data?.holdings && Array.isArray(json.data.holdings)) {
            // backward compat if your API returns {holdings:[...]} etc.
          }

          // We store v1 format: { holdings: Asset[] , userHorizon?: Horizon }
          const cloud = json?.data ?? null;

          if (cloud?.holdings && Array.isArray(cloud.holdings)) {
            setAssets(cloud.holdings);
            if (cloud.userHorizon) setUserHorizon(cloud.userHorizon);
            setStorageMode("cloud");
            return;
          }

          // If cloud empty, fallback to local
        } catch {
          // ignore and fallback below
        }
      }

      // Local fallback (signed-out or cloud empty)
      try {
        const raw = localStorage.getItem(localKey);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw);
          if (parsed?.holdings && Array.isArray(parsed.holdings)) {
            setAssets(parsed.holdings);
            if (parsed.userHorizon) setUserHorizon(parsed.userHorizon);
          } else if (Array.isArray(parsed)) {
            // older local format (assets array)
            setAssets(parsed);
          }
        }
        if (!cancelled) setStorageMode(isSignedIn ? "cloud" : "local");
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, localKey]);

  /** ---------- Save (debounced) ---------- */
  useEffect(() => {
    // initial load triggers this effect; don't instantly spam
    if (lastSaveTimer.current) window.clearTimeout(lastSaveTimer.current);

    // Always keep a local copy (fast UX)
    try {
      localStorage.setItem(localKey, JSON.stringify({ holdings: assets, userHorizon }));
    } catch {}

    // Signed-in: save to cloud
    if (isSignedIn) {
      setSaveState("saving");
      lastSaveTimer.current = window.setTimeout(async () => {
        try {
          const res = await fetch("/api/portfolio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ holdings: assets, userHorizon }),
          });

          if (!res.ok) throw new Error("save failed");

          setSaveState("saved");
          setStorageMode("cloud");
          window.setTimeout(() => setSaveState("idle"), 1200);
        } catch {
          // Cloud failed -> keep local
          setSaveState("idle");
          setStorageMode("local");
        }
      }, 500);
    } else {
      setSaveState("idle");
      setStorageMode("local");
    }

    return () => {
      if (lastSaveTimer.current) window.clearTimeout(lastSaveTimer.current);
    };
  }, [assets, userHorizon, isSignedIn, localKey]);

  /** ---------- Opinion table (new) ---------- */
  const portfolioView = useMemo(
    () => portfolioHorizonView(currentRegime, userHorizon, assets),
    [currentRegime, userHorizon, assets]
  );

  const opinion = useMemo(
    () => opinionBlock(locale, portfolioView, userHorizon, currentRegime),
    [locale, portfolioView, userHorizon, currentRegime]
  );

  function statusBadge(state: State) {
    const label =
      state === "Constructive" ? (locale === "pt" ? "✅ Construtivo" : "✅ Constructive") :
      state === "Neutral" ? (locale === "pt" ? "◼️ Neutro" : "◼️ Neutral") :
      (locale === "pt" ? "⚠️ Cautela" : "⚠️ Caution");

    const color =
      state === "Constructive"
        ? "bg-signal-700/10 text-signal-800"
        : state === "Neutral"
        ? "bg-canvas-50 text-ink-800"
        : "bg-amber-500/10 text-amber-800";

    return (
      <span className={cn("inline-flex items-center rounded-full border border-border-soft px-3 py-1 text-xs font-semibold", color)}>
        {label}
      </span>
    );
  }

  /** ---------- UI handlers ---------- */
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

        {/* Storage status */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-600">
          <span className="rounded-full border border-border-soft bg-white px-3 py-1">
            {c.cloud}: {storageMode === "cloud" ? "✓" : "—"}
          </span>
          <span className="rounded-full border border-border-soft bg-white px-3 py-1">
            {c.local}: ✓
          </span>
          <span className="rounded-full border border-border-soft bg-white px-3 py-1">
            {saveState === "saving" ? c.saving : saveState === "saved" ? `✓ ${c.saved}` : ""}
          </span>
        </div>

        {/* Market context + weekly */}
        <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <p className="text-xs font-semibold text-ink-500">{c.marketContext}</p>

          <div className="mt-3 rounded-2xl border border-border-soft bg-canvas-50 p-4">
            {loadingRegime ? (
              <p className="text-sm text-ink-600">{locale === "pt" ? "A carregar…" : "Loading…"}</p>
            ) : (
              <p className="text-sm text-ink-700">{regime?.summary ?? (locale === "pt" ? "Contexto temporariamente indisponível." : "Context is temporarily unavailable.")}</p>
            )}
          </div>

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

        {/* New: User horizon + SignalCore opinion table */}
        <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{c.decisionTitle}</p>
              <p className="mt-1 text-sm text-ink-700">{c.decisionSubtitle}</p>
            </div>

            <select
              value={userHorizon}
              onChange={(e) => setUserHorizon(e.target.value as Horizon)}
              className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
            >
              <option value="Short">{c.horizon.Short}</option>
              <option value="Medium">{c.horizon.Medium}</option>
              <option value="Long">{c.horizon.Long}</option>
            </select>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-border-soft">
            <table className="w-full text-sm">
              <thead className="bg-canvas-50 text-xs text-ink-500">
                <tr>
                  <th className="px-4 py-3 text-left">{locale === "pt" ? "Horizonte" : "Horizon"}</th>
                  <th className="px-4 py-3 text-left">{c.opinionTitle}</th>
                  <th className="px-4 py-3 text-left">{locale === "pt" ? "Estado" : "State"}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3">{c.horizon[userHorizon]}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{opinion.head}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-700">
                      {opinion.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-ink-500">{c.opinionNote}</p>
                  </td>
                  <td className="px-4 py-3">{statusBadge(portfolioView)}</td>
                </tr>
              </tbody>
            </table>
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

              const badge = (s: State) => (
                <span className="inline-flex items-center rounded-full border border-border-soft px-3 py-1 text-xs font-semibold bg-white">
                  {s === "Constructive" ? "✅" : s === "Neutral" ? "◼️" : "⚠️"}{" "}
                  {locale === "pt" ? (s === "Constructive" ? "Construtivo" : s === "Neutral" ? "Neutro" : "Cautela") : s}
                </span>
              );

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
                              <td className="px-4 py-3">{badge(matrix.Short)}</td>
                            </tr>
                            <tr className="border-t border-border-soft">
                              <td className="px-4 py-3">{c.horizon.Medium}</td>
                              <td className="px-4 py-3">{badge(matrix.Medium)}</td>
                            </tr>
                            <tr className="border-t border-border-soft">
                              <td className="px-4 py-3">{c.horizon.Long}</td>
                              <td className="px-4 py-3">{badge(matrix.Long)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs text-ink-500">
                          {locale === "pt" ? "Sem sinais. Sem previsões. Só contexto." : "No signals. No predictions. Just context."}
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

          <p className="mt-8 text-xs text-ink-500">
            {locale === "pt"
              ? "Conteúdo educativo. O SignalCore fornece leitura de contexto e risco — as decisões finais são do utilizador."
              : "Educational content. SignalCore provides context & risk framing — final decisions remain yours."}
          </p>
        </div>
      </section>
    </main>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";

type Locale = "en" | "pt";

type Holding = {
  name: string;          // "Apple", "S&P 500 ETF", "Bitcoin"
  ticker?: string;       // optional: "AAPL"
  type: "Stock" | "ETF" | "Crypto" | "Cash" | "Other";
  value?: number;        // optional: current value or amount
  note?: string;         // optional
};

type PortfolioShape = {
  holdings: Holding[];
};

function defaultPortfolio(): PortfolioShape {
  return { holdings: [] };
}

export default function PortfolioEditor({ locale }: { locale: Locale }) {
  const t = useMemo(() => {
    if (locale === "pt") {
      return {
        title: "Meu portefólio",
        subtitle: "Adiciona apenas o que já tens — isto fica guardado na cloud.",
        helper1: "Ex.: Apple, ETF MSCI World, S&P 500, Bitcoin",
        helper2: "O SignalCore não te empurra para trading — só organiza o teu plano.",
        loading: "A carregar…",
        saving: "A guardar…",
        saved: "Guardado",
        add: "Adicionar ativo",
        name: "Nome",
        ticker: "Ticker (opcional)",
        type: "Tipo",
        value: "Valor (opcional)",
        note: "Nota (opcional)",
        remove: "Remover",
        errLoad: "Não foi possível carregar o portefólio.",
        errSave: "Não foi possível guardar agora.",
      };
    }
    return {
      title: "My Portfolio",
      subtitle: "Add only what you already own — saved in the cloud.",
      helper1: "e.g. Apple, MSCI World ETF, S&P 500, Bitcoin",
      helper2: "SignalCore won’t push trading — it just structures your plan.",
      loading: "Loading…",
      saving: "Saving…",
      saved: "Saved",
      add: "Add asset",
      name: "Name",
      ticker: "Ticker (optional)",
      type: "Type",
      value: "Value (optional)",
      note: "Note (optional)",
      remove: "Remove",
      errLoad: "Couldn’t load portfolio.",
      errSave: "Couldn’t save right now.",
    };
  }, [locale]);

  const [portfolio, setPortfolio] = useState<PortfolioShape>(defaultPortfolio());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Load from cloud
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/portfolio", {
  method: "GET",
  credentials: "include",
}); 
        if (!res.ok) {
          if (!cancelled) setStatus("error");
          return;
        }
        const json = await res.json();
        const data = json?.data;

        // Expect our shape { holdings: [...] }
        if (!cancelled) {
          if (data && typeof data === "object" && Array.isArray(data.holdings)) {
            setPortfolio({ holdings: data.holdings });
          } else {
            setPortfolio(defaultPortfolio());
          }
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave (debounced)
  useEffect(() => {
    if (status !== "ready") return;

    setSaveState("saving");

    const tmr = setTimeout(async () => {
      try {
        const res = await fetch("/api/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(portfolio),
        });

        if (!res.ok) {
          setSaveState("error");
          return;
        }

        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1200);
      } catch {
        setSaveState("error");
      }
    }, 700);

    return () => clearTimeout(tmr);
  }, [portfolio, status]);

  function addHolding() {
    setPortfolio((p) => ({
      holdings: [
        ...p.holdings,
        { name: "", type: "Stock", ticker: "", value: undefined, note: "" },
      ],
    }));
  }

  function updateHolding(idx: number, patch: Partial<Holding>) {
    setPortfolio((p) => ({
      holdings: p.holdings.map((h, i) => (i === idx ? { ...h, ...patch } : h)),
    }));
  }

  function removeHolding(idx: number) {
    setPortfolio((p) => ({
      holdings: p.holdings.filter((_, i) => i !== idx),
    }));
  }

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-ink-500">{t.subtitle}</p>
          <h2 className="mt-2 text-xl font-semibold">{t.title}</h2>
          <p className="mt-3 text-sm text-ink-700">{t.helper1}</p>
          <p className="mt-1 text-sm text-ink-700">{t.helper2}</p>
        </div>

        <div className="text-xs text-ink-500">
          {saveState === "saving" && t.saving}
          {saveState === "saved" && t.saved}
          {saveState === "error" && t.errSave}
        </div>
      </div>

      <div className="mt-6">
        {status === "loading" && <p className="text-sm text-ink-700">{t.loading}</p>}
        {status === "error" && <p className="text-sm text-ink-700">{t.errLoad}</p>}

        {status === "ready" && (
          <>
            <div className="mt-6 space-y-4">
              {portfolio.holdings.map((h, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-border-soft bg-canvas-50 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-5">
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold text-ink-500">{t.name}</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
                        value={h.name}
                        onChange={(e) => updateHolding(idx, { name: e.target.value })}
                        placeholder={t.helper1}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-ink-500">{t.ticker}</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
                        value={h.ticker ?? ""}
                        onChange={(e) => updateHolding(idx, { ticker: e.target.value })}
                        placeholder="AAPL"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-ink-500">{t.type}</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
                        value={h.type}
                        onChange={(e) => updateHolding(idx, { type: e.target.value as Holding["type"] })}
                      >
                        <option value="Stock">Stock</option>
                        <option value="ETF">ETF</option>
                        <option value="Crypto">Crypto</option>
                        <option value="Cash">Cash</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-ink-500">{t.value}</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
                        value={typeof h.value === "number" ? h.value : ""}
                        onChange={(e) =>
                          updateHolding(idx, {
                            value: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        inputMode="decimal"
                        placeholder="1000"
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-5">
                    <div className="md:col-span-4">
                      <label className="text-xs font-semibold text-ink-500">{t.note}</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
                        value={h.note ?? ""}
                        onChange={(e) => updateHolding(idx, { note: e.target.value })}
                        placeholder={locale === "pt" ? "Ex.: longo prazo, diversificação…" : "e.g. long-term, diversification…"}
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeHolding(idx)}
                        className="w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                      >
                        {t.remove}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addHolding}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              {t.add}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
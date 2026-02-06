"use client";

import { useEffect, useMemo, useState } from "react";
import type { PortfolioItem, PortfolioItemType, Exposure } from "@/lib/signalcore";
import { useAssetSearch } from "@/lib/useAssetSearch";
import { useAssetEnrich } from "@/lib/useAssetEnrich";

function uid() {
  return `pf_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function cn(...x: Array<string | false | undefined | null>) {
  return x.filter(Boolean).join(" ");
}

const TYPE_OPTIONS: Array<{ value: PortfolioItemType; label: string }> = [
  { value: "stock", label: "Stock" },
  { value: "etf", label: "ETF" },
  { value: "bond", label: "Bond" },
  { value: "cash", label: "Cash" },
  { value: "crypto", label: "Crypto" },
  { value: "forex", label: "Forex" },
  { value: "commodity", label: "Commodity" },
  { value: "real_estate", label: "Real estate" },
  { value: "other", label: "Other" },
];

const EXPOSURE_OPTIONS: Array<{ value: Exposure; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function inferTypeFromFinnhubRow(row: { type: string; symbol: string }) : PortfolioItemType {
  const t = (row.type ?? "").toLowerCase();
  const s = (row.symbol ?? "").toUpperCase();

  if (t.includes("crypto")) return "crypto";
  if (t.includes("forex")) return "forex";
  if (t.includes("etf")) return "etf";
  if (t.includes("fund")) return "etf";
  if (t.includes("bond")) return "bond";

  // heurística: pares forex comuns
  if (s.length === 6 && /^[A-Z]{6}$/.test(s)) return "forex";

  return "stock";
}

export default function PortfolioEditor() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // form
  const [q, setQ] = useState("");
  const [pickedSymbol, setPickedSymbol] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<PortfolioItemType>("stock");
  const [exposure, setExposure] = useState<Exposure>("medium");
  const [notes, setNotes] = useState("");

  // search + enrich
  const { results, loading: loadingSearch } = useAssetSearch(q);
  const { data: enrich, loading: loadingEnrich } = useAssetEnrich(pickedSymbol);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/portfolio", { cache: "no-store" });
      const json = await res.json();
      const arr = Array.isArray(json?.items) ? json.items : [];
      setItems(arr);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function save(next: PortfolioItem[]) {
    try {
      setSaving(true);
      setStatus(null);
      setItems(next);

      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || "Save failed");

      setStatus("Saved.");
      setTimeout(() => setStatus(null), 1200);
    } catch (e: any) {
      setStatus(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // auto-apply enrich -> name/meta preview
  useEffect(() => {
    if (!enrich?.symbol) return;
    // se user ainda não escreveu nome manual, preenche
    if (!name.trim() && enrich.name) setName(enrich.name);
    // notes leve (ticker)
    if (!notes.trim()) setNotes(enrich.symbol);
  }, [enrich]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewLine = useMemo(() => {
    if (loadingEnrich) return "Fetching fundamentals…";
    if (!enrich?.symbol) return null;
    const px = enrich.price != null ? `~${Number(enrich.price).toFixed(2)}` : "—";
    return `${enrich.symbol} · ${enrich.exchange ?? "—"} · ${enrich.currency ?? "—"} · ${px}`;
  }, [enrich, loadingEnrich]);

  function pick(row: { symbol: string; description: string; type: string }) {
    setPickedSymbol(row.symbol);
    setName(row.description || row.symbol);
    setType(inferTypeFromFinnhubRow({ symbol: row.symbol, type: row.type }));
    setNotes(row.symbol);
  }

  function resetForm() {
    setQ("");
    setPickedSymbol(null);
    setName("");
    setType("stock");
    setExposure("medium");
    setNotes("");
  }

  async function add() {
    const n = name.trim();
    if (!n) return;

    const next: PortfolioItem[] = [
      ...items,
      {
        id: uid(),
        name: n,
        type,
        exposure,
        notes: notes.trim() ? notes.trim() : null,
        meta: {
          ticker: enrich?.symbol ?? pickedSymbol ?? null,
          exchange: enrich?.exchange ?? null,
          currency: enrich?.currency ?? null,
          country: enrich?.country ?? null,
          sector: enrich?.sector ?? null,
          industry: enrich?.industry ?? null,
          marketCap: enrich?.marketCap ?? null,
          price: enrich?.price ?? null,
          source: enrich ? "finnhub" : "manual",
          updatedAt: enrich?.updatedAt ?? new Date().toISOString(),
        },
      },
    ];

    await save(next);
    resetForm();
  }

  async function remove(id: string | undefined) {
    if (!id) return;
    const next = items.filter((x) => x.id !== id);
    await save(next);
  }

  return (
    <section className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink-500">Portfolio Desk</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Holdings (Cloud)</h2>
          <p className="mt-1 text-sm text-ink-600">
            Add assets with autofill (Finnhub). This feeds Advisor coherence + Asset Fit.
          </p>
        </div>

        <div className="text-xs text-ink-500">
          {saving ? "Saving…" : status ? status : null}
        </div>
      </div>

      {/* Add form */}
      <div className="mt-6 rounded-2xl border border-border-soft bg-canvas-50 p-4">
        <label className="text-xs font-semibold text-ink-800">Search</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type: Apple / AAPL / SPY / BTC…"
          className="mt-2 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
        />

        {loadingSearch ? (
          <p className="mt-2 text-xs text-ink-500">Searching…</p>
        ) : results.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {results.slice(0, 8).map((r) => (
              <button
                key={r.symbol}
                type="button"
                onClick={() => pick(r)}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-soft bg-white px-3 py-2 text-left hover:bg-canvas-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{r.description || r.symbol}</p>
                  <p className="text-xs text-ink-500">{r.symbol} · {r.type}</p>
                </div>
                <span className="text-xs font-semibold text-ink-700">Select</span>
              </button>
            ))}
          </div>
        ) : q.trim() ? (
          <p className="mt-2 text-xs text-ink-500">No results.</p>
        ) : null}

        {previewLine ? <p className="mt-3 text-xs text-ink-500">{previewLine}</p> : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-ink-800">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Asset name"
              className="mt-2 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-800">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as PortfolioItemType)}
              className="mt-2 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-800">Exposure</label>
            <select
              value={exposure}
              onChange={(e) => setExposure(e.target.value as Exposure)}
              className="mt-2 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
            >
              {EXPOSURE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-800">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="mt-2 w-full rounded-xl border border-border-soft bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={add}
            disabled={saving || !name.trim()}
            className="rounded-2xl bg-signal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-800 disabled:opacity-60"
          >
            Add to portfolio
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            Reset
          </button>
        </div>
      </div>

      {/* List */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink-900">Holdings</p>
          <p className="text-xs text-ink-500">{loading ? "Loading…" : `${items.length} items`}</p>
        </div>

        {loading ? (
          <div className="mt-3 rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
            Loading portfolio…
          </div>
        ) : items.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
            No holdings yet. Add your first asset above.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {items.map((it) => (
              <div key={it.id ?? it.name} className="rounded-2xl border border-border-soft bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{it.name}</p>
                    <p className="mt-1 text-xs text-ink-500">
                      {it.type} · exposure: {it.exposure ?? "medium"}
                      {it.meta?.ticker ? ` · ${it.meta.ticker}` : ""}
                      {it.meta?.exchange ? ` · ${it.meta.exchange}` : ""}
                      {typeof it.meta?.price === "number" ? ` · ~${it.meta.price.toFixed(2)}` : ""}
                    </p>
                    {it.meta?.sector ? (
                      <p className="mt-1 text-xs text-ink-500">sector: {it.meta.sector}</p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="rounded-xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold hover:bg-canvas-50"
                  >
                    Remove
                  </button>
                </div>

                {it.notes ? <p className="mt-2 text-xs text-ink-700">{it.notes}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
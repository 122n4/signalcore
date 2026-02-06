"use client";

import { useEffect, useMemo, useState } from "react";

type Fit = {
  asset: { id: string; name: string; type: string };
  coherence: number;
  deltaIfAdded: number;
  drivers: {
    goalFit: number;
    horizonFit: number;
    riskFit: number;
    regimeFit: number;
    diversification: number;
  };
  tradeoffs: string[];
  rationale: string[];
};

function pill(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 65) return "Moderate";
  return "Weak";
}

export default function AssetFitExplorer(props: {
  regime: any;
  horizon: any;
  risk: any;
  goal: any;
  portfolio: any[];
}) {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Fit[]>([]);
  const [selected, setSelected] = useState<Fit | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/asset-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            regime: props.regime,
            horizon: props.horizon,
            risk: props.risk,
            goal: props.goal,
            portfolio: props.portfolio ?? [],
          }),
        });
        const json = await res.json();
        if (!alive) return;
        setResults(Array.isArray(json?.results) ? json.results : []);
        setSelected((prev) => prev ?? (json?.results?.[0] ?? null));
      } catch {
        if (!alive) return;
        setResults([]);
        setSelected(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.regime, props.horizon, props.risk, JSON.stringify(props.goal), JSON.stringify(props.portfolio)]);

  const top = useMemo(() => results.slice(0, 6), [results]);

  return (
    <section className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-ink-500">ASSET FIT</p>
          <h3 className="mt-2 text-lg font-semibold">Top fits for your plan</h3>
          <p className="mt-2 text-sm text-ink-700">
            Not a signal. A coherence score: how well an asset fits your goal, horizon, risk profile and current context.
          </p>
        </div>
        {loading ? (
          <span className="text-xs text-ink-500">Loading…</span>
        ) : (
          <span className="text-xs text-ink-500">{results.length} candidates</span>
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* List */}
        <div className="rounded-2xl border border-border-soft bg-canvas-50 p-3">
          {loading ? (
            <p className="p-3 text-sm text-ink-700">Computing fits…</p>
          ) : top.length === 0 ? (
            <p className="p-3 text-sm text-ink-700">No results yet.</p>
          ) : (
            <div className="space-y-2">
              {top.map((r) => (
                <button
                  key={r.asset.id}
                  type="button"
                  onClick={() => setSelected(r)}
                  className={[
                    "w-full rounded-2xl border border-border-soft bg-white p-3 text-left hover:bg-canvas-50 transition",
                    selected?.asset.id === r.asset.id ? "ring-2 ring-ink-900/10" : "",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {r.asset.name} <span className="text-xs text-ink-500">({r.asset.id})</span>
                      </p>
                      <p className="text-xs text-ink-500">{r.asset.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink-900">{r.coherence}%</p>
                      <p className="text-xs text-ink-500">{pill(r.coherence)}</p>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-ink-600">
                    Estimated plan delta:{" "}
                    <span className={r.deltaIfAdded >= 0 ? "text-emerald-700 font-semibold" : "text-red-700 font-semibold"}>
                      {r.deltaIfAdded >= 0 ? "+" : ""}{r.deltaIfAdded}
                    </span>
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="rounded-2xl border border-border-soft bg-white p-4">
          {!selected ? (
            <p className="text-sm text-ink-700">Select an asset to see the coherence breakdown.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {selected.asset.name} <span className="text-xs text-ink-500">({selected.asset.id})</span>
                  </p>
                  <p className="text-xs text-ink-500">{selected.asset.type}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-ink-900">{selected.coherence}%</p>
                  <p className="text-xs text-ink-500">coherence</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Driver label="Goal fit" v={selected.drivers.goalFit} />
                <Driver label="Horizon fit" v={selected.drivers.horizonFit} />
                <Driver label="Risk fit" v={selected.drivers.riskFit} />
                <Driver label="Regime fit" v={selected.drivers.regimeFit} />
                <Driver label="Diversification" v={selected.drivers.diversification} />
                <div className="rounded-xl border border-border-soft bg-canvas-50 p-3">
                  <p className="text-xs font-semibold text-ink-500">Plan delta</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">
                    {selected.deltaIfAdded >= 0 ? "+" : ""}{selected.deltaIfAdded}
                  </p>
                  <p className="mt-1 text-xs text-ink-600">
                    Conservative estimate to avoid false precision.
                  </p>
                </div>
              </div>

              {selected.tradeoffs?.length ? (
                <div className="mt-4 rounded-2xl border border-border-soft bg-canvas-50 p-3">
                  <p className="text-xs font-semibold text-ink-500">Trade-offs</p>
                  <ul className="mt-2 space-y-1 text-xs text-ink-700">
                    {selected.tradeoffs.slice(0, 5).map((t, i) => (
                      <li key={i}>• {t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selected.rationale?.length ? (
                <div className="mt-3 text-xs text-ink-600">
                  {selected.rationale.slice(0, 3).map((x, i) => (
                    <p key={i}>• {x}</p>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Driver({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-xl border border-border-soft bg-white p-3">
      <p className="text-xs font-semibold text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{Math.round(v)}%</p>
      <div className="mt-2 h-2 w-full rounded-full bg-canvas-50">
        <div className="h-2 rounded-full bg-ink-900/20" style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
    </div>
  );
}
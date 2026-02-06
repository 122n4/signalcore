"use client";

import { useMemo } from "react";
import { useDriftHistory } from "@/lib/signalcore/useDriftHistory";

function badge(status: string | null) {
  if (status === "major") return "bg-red-600 text-white";
  if (status === "moderate") return "bg-amber-500 text-white";
  if (status === "minor") return "bg-ink-900 text-white";
  return "bg-canvas-50 text-ink-700 border border-border-soft";
}

function fmt(ts: string) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export default function DriftHistoryTimeline() {
  const { items, loading } = useDriftHistory(20);

  const rows = useMemo(() => items ?? [], [items]);

  return (
    <section className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink-500">DECISION MEMORY</p>
          <h3 className="mt-2 text-lg font-semibold">Drift history</h3>
          <p className="mt-2 text-sm text-ink-700">
            O SignalCore guarda snapshots do teu plano e mede drift quando o contexto muda.
            <span className="text-ink-500"> (não são sinais; é coerência)</span>
          </p>
        </div>
        {loading ? (
          <span className="text-xs text-ink-500">Loading…</span>
        ) : (
          <span className="text-xs text-ink-500">{rows.length} snapshots</span>
        )}
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
            A carregar histórico…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
            Ainda não há snapshots. Abre o Advisor e grava um snapshot.
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border-soft bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Coherence: {typeof r.coherence_overall === "number" ? `${r.coherence_overall}%` : "—"}
                  </p>
                  <p className="text-xs text-ink-500">{fmt(r.created_at)}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge(r.drift_status)}`}>
                    {r.drift_status ?? "stable"}
                  </span>
                  <span className="text-xs text-ink-700">
                    Δ {typeof r.drift_delta === "number" ? (r.drift_delta >= 0 ? `+${r.drift_delta}` : r.drift_delta) : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Mini label="Regime" value={r.regime ?? "—"} />
                <Mini label="Horizon" value={r.horizon ?? "—"} />
                <Mini label="Risk" value={r.risk ?? "—"} />
              </div>

              <p className="mt-3 text-xs text-ink-500">
                Tip: drift “major” = o plano devia ser revalidado (não é urgência; é disciplina).
              </p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-soft bg-canvas-50 p-3">
      <p className="text-[11px] font-semibold text-ink-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink-900">{value}</p>
    </div>
  );
}
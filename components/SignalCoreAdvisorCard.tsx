"use client";

import { useMemo } from "react";
import { buildAdvisor } from "@/lib/signalcoreAdvisor";
import { useUserMode } from "@/lib/useUserMode";

type Regime =
  | "Risk-on"
  | "Risk-off"
  | "Transitional"
  | "Neutral / Range-bound";

type Horizon = "Short" | "Medium" | "Long";

export default function SignalCoreAdvisorCard({
  regime,
  horizon,
}: {
  regime: Regime;
  horizon: Horizon;
}) {
  const { mode, loadingMode, saveMode } = useUserMode();

  const payload = useMemo(() => {
    return buildAdvisor({
      mode,
      regime,
      horizon,
      goalLabel: "12 months",
    });
  }, [mode, regime, horizon]);

  const badge =
    payload.action === "Increase"
      ? "🟢 Increase"
      : payload.action === "Hold"
      ? "🟡 Hold"
      : "🔴 Reduce";

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink-500">{payload.title}</p>
          <p className="mt-2 text-lg font-semibold text-ink-900">{payload.headline}</p>
          <p className="mt-1 text-xs text-ink-500">
            Confidence: <strong>{payload.confidence}</strong> · Regime:{" "}
            <strong>{regime}</strong> · Horizon: <strong>{horizon}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-xs font-semibold">
            {badge}
          </span>

          <div className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs">
            {loadingMode ? (
              <span className="text-ink-500">mode…</span>
            ) : (
              <select
                value={mode}
                onChange={(e) => saveMode(e.target.value as any)}
                className="bg-transparent outline-none"
              >
                <option value="investing">Investing</option>
                <option value="trading">Trading/Forex</option>
              </select>
            )}
          </div>
        </div>
      </div>

      <ul className="mt-5 space-y-2 text-sm text-ink-700">
        {payload.reasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>

      {payload.playbookHint ? (
        <div className="mt-6 rounded-2xl border border-border-soft bg-canvas-50 p-4">
          <p className="text-sm text-ink-700">
            <strong>Playbook:</strong> {payload.playbookHint}
          </p>
          {payload.riskBudget ? (
            <p className="mt-2 text-sm text-ink-700">
              <strong>Risk:</strong> {payload.riskBudget}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
        <p className="text-sm text-ink-700">
          <strong>If created today:</strong> {payload.ifCreatedToday}
        </p>
      </div>
    </div>
  );
}
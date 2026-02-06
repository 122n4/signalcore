"use client";

import React from "react";

type Props = {
  decision: {
    headline: string;
    actionLabel: string; // "Increase risk slightly", etc
    confidence: "Low" | "Moderate" | "High";
    riskBudget: "Tight" | "Normal";
    playbookHint: string;
    reasons: string[];
    ifCreatedToday: string;
  };

  goalImpact: {
    status: "On track" | "Behind" | "Ahead";
    deltaText: string; // "41% → 54%" or "+€340/mo gap"
    note: string;
  };

  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;

  primaryLabel?: string;
  secondaryLabel?: string;

  isPaid: boolean;
};

export function AdvisorExecutiveBrief({
  decision,
  goalImpact,
  onPrimaryAction,
  onSecondaryAction,
  primaryLabel = "Generate execution candidates",
  secondaryLabel = "Create smart alerts",
  isPaid,
}: Props) {
  const confidenceColor =
    decision.confidence === "High"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : decision.confidence === "Moderate"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-rose-50 text-rose-700 border-rose-200";

  const statusColor =
    goalImpact.status === "Ahead"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : goalImpact.status === "On track"
      ? "bg-neutral-50 text-neutral-700 border-neutral-200"
      : "bg-rose-50 text-rose-700 border-rose-200";

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-wide text-ink-500">
            SIGNALCORE ADVISOR
          </div>
          <div className="mt-1 text-xl font-semibold text-ink-900">
            Today’s Decision
          </div>
          <div className="mt-2 text-sm text-ink-700">{decision.headline}</div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${confidenceColor}`}
          >
            Confidence: {decision.confidence}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusColor}`}
          >
            Goal: {goalImpact.status}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <MiniCard
          label="Action"
          value={decision.actionLabel}
          sub="Your next best move"
        />
        <MiniCard
          label="Impact on goal"
          value={goalImpact.deltaText}
          sub={goalImpact.note}
        />
        <MiniCard
          label="Risk budget"
          value={decision.riskBudget}
          sub={decision.playbookHint}
        />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
          <div className="text-xs font-semibold text-ink-500">Why</div>
          <ul className="mt-2 space-y-2 text-sm text-ink-800">
            {(decision.reasons ?? []).slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" />
                <span className="leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border-soft bg-white p-4">
          <div className="text-xs font-semibold text-ink-500">
            If created today
          </div>
          <div className="mt-2 text-sm text-ink-800 leading-relaxed">
            {decision.ifCreatedToday}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={onPrimaryAction}
              className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              {primaryLabel}
            </button>

            <button
              onClick={onSecondaryAction}
              className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-800 hover:bg-neutral-50"
            >
              {secondaryLabel}
            </button>

            {!isPaid && (
              <span className="ml-auto inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Pro unlocks full automation
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-4">
      <div className="text-xs font-semibold text-ink-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-ink-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-ink-500">{sub}</div> : null}
    </div>
  );
}
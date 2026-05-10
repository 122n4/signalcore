"use client";

import React from "react";

export function AdvisorActionConsole(props: {
  isPaid: boolean;
  onGoExecution?: () => void;
  onGoPlanning?: () => void;
  onGoRisk?: () => void;
  onGoJournal?: () => void;
  onCreateAlerts?: () => void;
}) {
  const locked = !props.isPaid;

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink-900">
            Action Console
          </div>
          <div className="mt-1 text-sm text-ink-600">
            Turn decisions into execution. Everything stays inside your plan.
          </div>
        </div>

        {locked && (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Pro
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <ActionButton
          title="Generate execution candidates"
          desc="Get a clean shortlist of moves (no noisy signals)."
          primary
          onClick={props.onGoExecution}
        />

        <ActionButton
          title="Create smart alerts"
          desc="Breach, drift, candidate-ready, weekly check-ins."
          locked={locked}
          onClick={props.onCreateAlerts}
        />

        <ActionButton
          title="Tighten guardrails"
          desc="Improve drawdown control and reduce emotional pivots."
          onClick={props.onGoPlanning}
        />

        <ActionButton
          title="Run a risk snapshot"
          desc="Stress test + drivers + concentration warnings."
          onClick={props.onGoRisk}
        />

        <ActionButton
          title="Log today’s rationale"
          desc="Build your institutional journal automatically."
          onClick={props.onGoJournal}
        />

        <ActionButton
          title="Weekly stance briefing"
          desc="Get your regime stance and the 4-point checklist."
          onClick={props.onCreateAlerts}
          locked={locked}
        />
      </div>

      <div className="mt-4 text-xs text-ink-500">
        Syntrake is designed to feel simple — while keeping the institutional
        system working behind the scenes.
      </div>
    </div>
  );
}

function ActionButton(props: {
  title: string;
  desc: string;
  onClick?: () => void;
  primary?: boolean;
  locked?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`group rounded-2xl border p-4 text-left transition ${
        props.primary
          ? "border-transparent bg-brand text-white hover:opacity-95"
          : "border-border-soft bg-white hover:bg-neutral-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={`text-sm font-semibold ${
              props.primary ? "text-white" : "text-ink-900"
            }`}
          >
            {props.title}
          </div>
          <div
            className={`mt-1 text-sm leading-relaxed ${
              props.primary ? "text-white/90" : "text-ink-600"
            }`}
          >
            {props.desc}
          </div>
        </div>

        {props.locked ? (
          <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            Pro
          </span>
        ) : (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              props.primary
                ? "border-white/20 bg-white/10 text-white"
                : "border-border-soft bg-white text-ink-700"
            }`}
          >
            Run
          </span>
        )}
      </div>
    </button>
  );
}

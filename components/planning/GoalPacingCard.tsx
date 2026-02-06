"use client";
import React from "react";
import { Plan } from "@/lib/planning/types";
import { computePacing } from "@/lib/planning/engine";

function badge(status: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border";
  if (status === "behind") return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  if (status === "ahead") return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (status === "on_track") return `${base} border-neutral-200 bg-neutral-900 text-white`;
  return `${base} border-neutral-200 bg-white text-neutral-700`;
}

export default function GoalPacingCard(props: { plan: Plan; onChange: (p: Plan) => void }) {
  const { plan, onChange } = props;
  const pacing = React.useMemo(() => computePacing(plan), [plan]);

  function set<K extends keyof Plan>(k: K, v: any) {
    onChange({ ...plan, [k]: v, updatedAt: Date.now() });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Goal & pacing</div>
          <div className="text-xs text-neutral-500">Define the mission. The system optimizes decisions to reach it faster.</div>
        </div>
        <span className={badge(pacing.status)}>{pacing.status.toUpperCase()}</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Plan name</div>
          <input
            value={plan.name}
            onChange={(e) => set("name", e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            placeholder="e.g., Goal 2030 — Balanced"
          />
        </div>

        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Goal type</div>
          <select
            value={plan.goalType}
            onChange={(e) => set("goalType", e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="target_value">Target value by date</option>
            <option value="annual_return">Annual return</option>
            <option value="monthly_income">Monthly income</option>
            <option value="preservation">Preservation</option>
          </select>
        </div>

        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Risk posture</div>
          <select
            value={plan.riskPosture}
            onChange={(e) => set("riskPosture", e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="return_seeking">Return-seeking</option>
          </select>
        </div>
      </div>

      {plan.goalType === "target_value" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="text-xs font-semibold text-neutral-600">Target value (€)</div>
            <input
              type="number"
              value={plan.targetValue ?? ""}
              onChange={(e) => set("targetValue", e.target.value === "" ? undefined : Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              placeholder="100000"
            />
          </div>
          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="text-xs font-semibold text-neutral-600">Target date</div>
            <input
              type="date"
              value={plan.targetDate ?? ""}
              onChange={(e) => set("targetDate", e.target.value || undefined)}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="text-xs font-semibold text-neutral-600">Starting value (€)</div>
            <input
              type="number"
              value={plan.startingValue ?? ""}
              onChange={(e) => set("startingValue", e.target.value === "" ? undefined : Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
              placeholder="25000"
            />
          </div>
        </div>
      ) : null}

      {plan.goalType === "annual_return" ? (
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Annual return target (%)</div>
          <input
            type="number"
            step="0.1"
            value={plan.annualReturnPct ?? ""}
            onChange={(e) => set("annualReturnPct", e.target.value === "" ? undefined : Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            placeholder="8"
          />
        </div>
      ) : null}

      {plan.goalType === "monthly_income" ? (
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Monthly income (€)</div>
          <input
            type="number"
            value={plan.monthlyIncome ?? ""}
            onChange={(e) => set("monthlyIncome", e.target.value === "" ? undefined : Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            placeholder="500"
          />
        </div>
      ) : null}

      {plan.goalType === "preservation" ? (
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Max tolerated loss (%)</div>
          <input
            type="number"
            step="0.5"
            value={plan.preservationMaxLossPct ?? ""}
            onChange={(e) => set("preservationMaxLossPct", e.target.value === "" ? undefined : Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            placeholder="15"
          />
        </div>
      ) : null}

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <div className="text-xs font-semibold text-neutral-600">Pacing note</div>
        <div className="mt-1 text-sm text-neutral-800">{pacing.note}</div>
        {pacing.requiredAnnualReturnPct != null ? (
          <div className="mt-1 text-xs text-neutral-500">Required annual return (proxy): {pacing.requiredAnnualReturnPct.toFixed(1)}%</div>
        ) : null}
      </div>
    </div>
  );
}
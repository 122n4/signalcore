"use client";
import React from "react";
import { Plan, Regime } from "@/lib/planning/types";

const regimes: Regime[] = ["neutral", "bull", "bear", "sideways", "high_vol"];

export default function PlaybooksCard(props: { plan: Plan; onChange: (p: Plan) => void }) {
  const { plan, onChange } = props;

  function updateRule(id: string, patch: any) {
    const next = plan.playbooks.map((r) => (r.id === id ? { ...r, ...patch } : r));
    onChange({ ...plan, playbooks: next, updatedAt: Date.now() });
  }

  function addRule() {
    const id = `pb_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    onChange({
      ...plan,
      playbooks: [
        {
          id,
          enabled: true,
          whenRegime: "high_vol",
          action: "Reduce risk posture by 1 notch and increase Hedge bucket within band.",
        },
        ...plan.playbooks,
      ],
      updatedAt: Date.now(),
    });
  }

  function removeRule(id: string) {
    onChange({ ...plan, playbooks: plan.playbooks.filter((r) => r.id !== id), updatedAt: Date.now() });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Regime playbooks</div>
          <div className="text-xs text-neutral-500">
            If market regime changes, the plan tells the system how to behave.
          </div>
        </div>
        <button
          onClick={addRule}
          className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          Add rule
        </button>
      </div>

      <div className="space-y-2">
        {plan.playbooks.map((r) => (
          <div key={r.id} className="rounded-2xl border border-neutral-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  onClick={() => updateRule(r.id, { enabled: !r.enabled })}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-semibold " +
                    (r.enabled
                      ? "bg-neutral-900 text-white border-neutral-900"
                      : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50")
                  }
                >
                  {r.enabled ? "Enabled" : "Disabled"}
                </button>

                <select
                  value={r.whenRegime}
                  onChange={(e) => updateRule(r.id, { whenRegime: e.target.value })}
                  className="rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs"
                >
                  {regimes.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => removeRule(r.id)}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs hover:bg-neutral-50"
                >
                  Remove
                </button>
              </div>

              <div className="w-full md:w-[60%]">
                <div className="text-xs font-semibold text-neutral-600">Action</div>
                <textarea
                  value={r.action}
                  onChange={(e) => updateRule(r.id, { action: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
        Best practice: define at least <b>High-vol</b> and <b>Bear</b> behavior. That’s where institutions win.
      </div>
    </div>
  );
}
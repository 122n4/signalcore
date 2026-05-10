"use client";

import React from "react";
import { AlertRule } from "@/lib/alerts/types";

export function AlertsRules(props: {
  rules: AlertRule[];
  onChange: (rules: AlertRule[]) => void;
}) {
  const { rules, onChange } = props;

  function toggle(id: string) {
    onChange(rules.map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  }

  function updateParam(id: string, key: string, value: string) {
    onChange(
      rules.map(r => {
        if (r.id !== id) return r;
        return { ...r, params: { ...r.params, [key]: value === "" ? r.params[key] : Number(value) } };
      })
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <div className="text-sm font-semibold">Rules</div>
        <div className="text-xs text-neutral-500">Enable/disable monitoring rules (v1 thresholds are proxies).</div>
      </div>

      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.id} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-neutral-900">{r.label}</div>
                <div className="mt-1 text-xs text-neutral-500">{r.id}</div>
              </div>

              <button
                onClick={() => toggle(r.id)}
                className={
                  "rounded-xl border px-3 py-1.5 text-xs font-semibold " +
                  (r.enabled ? "bg-neutral-900 text-white border-neutral-900" : "bg-white text-neutral-800 border-neutral-200 hover:bg-neutral-50")
                }
              >
                {r.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>

            {/* Simple param editor for common numeric fields */}
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              {Object.entries(r.params).map(([k, v]) => (
                typeof v === "number" ? (
                  <div key={k} className="rounded-xl border border-neutral-200 p-2">
                    <div className="text-[11px] font-semibold text-neutral-600">{k}</div>
                    <input
                      type="number"
                      step="0.01"
                      value={String(v)}
                      onChange={(e) => updateParam(r.id, k, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1 text-sm"
                    />
                    <div className="mt-1 text-[11px] text-neutral-500">Proxy threshold</div>
                  </div>
                ) : null
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
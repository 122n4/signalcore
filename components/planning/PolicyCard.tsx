"use client";
import React from "react";
import { Plan } from "@/lib/planning/types";

export default function PolicyCard(props: { plan: Plan; onChange: (p: Plan) => void }) {
  const { plan, onChange } = props;

  function setPolicy(key: string, value: any) {
    onChange({ ...plan, policy: { ...plan.policy, [key]: value }, updatedAt: Date.now() });
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div>
        <div className="text-sm font-semibold">Policy — do’s & don’ts</div>
        <div className="text-xs text-neutral-500">
          This is the governance layer. Execution and Advisor must respect it.
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Allowed universe</div>
          <textarea
            value={plan.policy.allowedUniverse}
            onChange={(e) => setPolicy("allowedUniverse", e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            rows={3}
            placeholder="e.g., ETFs, large caps, IG bonds, gold"
          />
        </div>

        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Forbidden</div>
          <textarea
            value={plan.policy.forbidden}
            onChange={(e) => setPolicy("forbidden", e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            rows={3}
            placeholder="e.g., leverage, penny stocks, illiquid microcaps"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Max positions</div>
          <input
            type="number"
            value={plan.policy.maxPositions ?? ""}
            onChange={(e) =>
              setPolicy("maxPositions", e.target.value === "" ? undefined : Number(e.target.value))
            }
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
            placeholder="25"
          />
        </div>

        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Complexity</div>
          <select
            value={plan.policy.complexityLevel}
            onChange={(e) => setPolicy("complexityLevel", e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Trade frequency</div>
          <select
            value={plan.policy.tradeFrequency}
            onChange={(e) => setPolicy("tradeFrequency", e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs font-semibold text-neutral-600">Execution style</div>
          <select
            value={plan.executionStyle}
            onChange={(e) =>
              onChange({ ...plan, executionStyle: e.target.value as any, updatedAt: Date.now() })
            }
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
          >
            <option value="steady">Steady</option>
            <option value="opportunistic">Opportunistic</option>
            <option value="defensive">Defensive</option>
          </select>
        </div>
      </div>
    </div>
  );
}
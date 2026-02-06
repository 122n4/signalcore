"use client";
import React from "react";
import { Bucket, Plan } from "@/lib/planning/types";

function rowLabel(name: string) {
  return <div className="text-sm font-semibold text-neutral-900">{name}</div>;
}

export default function BucketsBlueprint(props: { plan: Plan; onChange: (p: Plan) => void }) {
  const { plan, onChange } = props;

  function updateBucket(id: string, patch: Partial<Bucket>) {
    const next = plan.buckets.map((b) => (b.id === id ? { ...b, ...patch } : b));
    onChange({ ...plan, buckets: next, updatedAt: Date.now() });
  }

  const total = plan.buckets.reduce((acc, b) => acc + (Number(b.targetPct) || 0), 0);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Blueprint — buckets</div>
          <div className="text-xs text-neutral-500">Institutional allocation structure: purpose first, weights second.</div>
        </div>
        <div className={"text-xs font-semibold " + (Math.abs(total - 100) <= 0.5 ? "text-emerald-700" : "text-amber-700")}>
          Total: {total.toFixed(1)}%
        </div>
      </div>

      <div className="space-y-2">
        {plan.buckets.map((b) => (
          <div key={b.id} className="rounded-2xl border border-neutral-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                {rowLabel(b.name)}
                <div className="mt-1 text-xs text-neutral-500">Allowed assets (v1): {b.allowedAssets || "—"}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                <div>
                  <div className="text-[11px] font-semibold text-neutral-600">Target %</div>
                  <input
                    type="number"
                    value={b.targetPct}
                    onChange={(e) => updateBucket(b.id, { targetPct: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-neutral-600">Min %</div>
                  <input
                    type="number"
                    value={b.minPct}
                    onChange={(e) => updateBucket(b.id, { minPct: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-neutral-600">Max %</div>
                  <input
                    type="number"
                    value={b.maxPct}
                    onChange={(e) => updateBucket(b.id, { maxPct: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-neutral-600">Risk budget</div>
                  <input
                    type="number"
                    value={b.riskBudget}
                    onChange={(e) => updateBucket(b.id, { riskBudget: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm"
                  />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <div className="text-[11px] font-semibold text-neutral-600">Allowed assets</div>
                  <input
                    value={b.allowedAssets}
                    onChange={(e) => updateBucket(b.id, { allowedAssets: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-2 py-2 text-sm"
                    placeholder='e.g. "ETFs, large caps, IG bonds"'
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
        Tip: Core should be stable, Satellite is controlled aggression, Hedge reduces tail risk, Cash is optionality.
      </div>
    </div>
  );
}
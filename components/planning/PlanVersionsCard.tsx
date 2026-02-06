"use client";
import React from "react";
import { PlanVersion } from "@/lib/planning/types";

export default function PlanVersionsCard(props: {
  versions: PlanVersion[];
  onLoadVersion: (v: PlanVersion) => void;
}) {
  const { versions, onLoadVersion } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
      <div>
        <div className="text-sm font-semibold">Plan versions</div>
        <div className="text-xs text-neutral-500">Each activation creates an audit-ready version.</div>
      </div>

      {!versions?.length ? (
        <div className="text-xs text-neutral-500">
          No versions yet. Activate the first plan to create history.
        </div>
      ) : (
        <div className="space-y-2">
          {versions.slice(0, 10).map((v) => (
            <div key={v.versionId} className="rounded-xl border border-neutral-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    {v.plan?.name || "Unnamed plan"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {new Date(v.activatedAt).toLocaleString()}
                  </div>
                  {v.reason ? (
                    <div className="mt-1 text-xs text-neutral-700">{v.reason}</div>
                  ) : null}
                </div>

                <button
                  onClick={() => onLoadVersion(v)}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
                >
                  Load
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
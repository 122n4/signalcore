"use client";
import React from "react";

export default function PlanningHeader(props: {
  activeName?: string;
  isActive: boolean;
  onSaveDraft: () => void;
  onActivate: () => void;
  onReset: () => void;
}) {
  const { activeName, isActive, onSaveDraft, onActivate, onReset } = props;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-lg font-semibold tracking-tight">Planning</div>
          <div className="text-sm text-neutral-600">
            Investment Policy Statement: goal → blueprint → rules → playbooks. Everything else executes this contract.
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            Status:{" "}
            <span className={isActive ? "font-semibold text-emerald-700" : "font-semibold text-neutral-700"}>
              {isActive ? `ACTIVE${activeName ? ` — ${activeName}` : ""}` : "DRAFT"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={onSaveDraft} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50">
            Save draft
          </button>
          <button onClick={onActivate} className="rounded-xl bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
            Activate plan
          </button>
          <button onClick={onReset} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold hover:bg-neutral-50">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
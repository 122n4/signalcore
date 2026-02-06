"use client";

import React from "react";

export type Filters = {
  risk: "all" | "low" | "medium" | "high";
  horizon: "all" | "weeks" | "months" | "quarters";
  minFit: number; // 0-100
};

export default function OpportunityFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  return (
    <div className="rounded-2xl border border-border-soft bg-white p-4 shadow-soft">
      <div className="text-xs font-semibold text-ink-700">Filters</div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs text-ink-600">
          Risk
          <select
            className="mt-1 w-full rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm"
            value={filters.risk}
            onChange={(e) => onChange({ ...filters, risk: e.target.value as any })}
          >
            <option value="all">All</option>
            <option value="low">Low risk</option>
            <option value="medium">Medium risk</option>
            <option value="high">High risk</option>
          </select>
        </label>

        <label className="text-xs text-ink-600">
          Horizon
          <select
            className="mt-1 w-full rounded-2xl border border-border-soft bg-white px-3 py-2 text-sm"
            value={filters.horizon}
            onChange={(e) => onChange({ ...filters, horizon: e.target.value as any })}
          >
            <option value="all">All</option>
            <option value="weeks">Weeks</option>
            <option value="months">Months</option>
            <option value="quarters">Quarters</option>
          </select>
        </label>

        <label className="text-xs text-ink-600">
          Minimum Fit Score: <span className="font-semibold">{filters.minFit}</span>
          <input
            className="mt-2 w-full"
            type="range"
            min={0}
            max={100}
            value={filters.minFit}
            onChange={(e) => onChange({ ...filters, minFit: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}
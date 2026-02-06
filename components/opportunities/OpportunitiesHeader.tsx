"use client";

import React from "react";

export default function OpportunitiesHeader({
  title,
  subtitle,
  onRefresh,
  pro,
  onTogglePro,
}: {
  title: string;
  subtitle: string;
  onRefresh: () => void;
  pro: boolean;
  onTogglePro: () => void;
}) {
  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-ink-900">{title}</div>
          <div className="mt-1 text-xs text-ink-600">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
          >
            Refresh
          </button>

          <button
            type="button"
            onClick={onTogglePro}
            className={
              "rounded-2xl px-3 py-2 text-xs font-semibold " +
              (pro
                ? "bg-brand text-white hover:opacity-95"
                : "border border-border-soft bg-white text-ink-700 hover:opacity-95")
            }
          >
            {pro ? "Pro ON" : "Open Pro"}
          </button>
        </div>
      </div>
    </div>
  );
}
"use client";

import React from "react";
import type { Opportunity } from "@/lib/signalcore/types";

export default function OpportunityDetailDrawer({
  open,
  onClose,
  opp,
  pro,
}: {
  open: boolean;
  onClose: () => void;
  opp: Opportunity | null;
  pro: boolean;
}) {
  if (!open || !opp) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-ink-900">{opp.name}</div>
            <div className="mt-1 text-xs text-ink-600">
              {opp.symbol} • {opp.vehicle} • {opp.horizon}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-4">
          <div className="text-xs font-semibold text-ink-700">Why now</div>
          <div className="mt-1 text-sm text-ink-800">{opp.whyNow}</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border-soft bg-white p-4">
            <div className="text-xs font-semibold text-ink-700">Fit Score</div>
            <div className="mt-1 text-lg font-semibold text-ink-900">{opp.fitScore}/100</div>
            <div className="mt-1 text-xs text-ink-600">Plan + regime alignment</div>
          </div>

          <div className="rounded-2xl border border-border-soft bg-white p-4">
            <div className="text-xs font-semibold text-ink-700">Confidence</div>
            <div className="mt-1 text-lg font-semibold text-ink-900">{opp.confidence}/100</div>
            <div className="mt-1 text-xs text-ink-600">Signal strength estimate</div>
          </div>

          <div className="rounded-2xl border border-border-soft bg-white p-4">
            <div className="text-xs font-semibold text-ink-700">Odds delta (est.)</div>
            <div className="mt-1 text-lg font-semibold text-ink-900">
              {opp.expectedOddsDelta >= 0 ? "+" : ""}
              {opp.expectedOddsDelta}%
            </div>
            <div className="mt-1 text-xs text-ink-600">Goal probability change</div>
          </div>

          <div className="rounded-2xl border border-border-soft bg-white p-4">
            <div className="text-xs font-semibold text-ink-700">Max size cap</div>
            <div className="mt-1 text-lg font-semibold text-ink-900">{opp.maxSizePct}%</div>
            <div className="mt-1 text-xs text-ink-600">Institutional sizing limit</div>
          </div>
        </div>

        {pro && (
          <div className="mt-4 rounded-2xl border border-border-soft bg-white p-4">
            <div className="text-xs font-semibold text-ink-700">Pro notes</div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-600">
              <li>Use staged entries if volatility spikes.</li>
              <li>Keep within max cap to preserve diversification.</li>
              <li>Re-evaluate on regime shift or correlation break.</li>
            </ul>
          </div>
        )}

        <div className="mt-6 text-[11px] text-ink-500">
          Estimates are not guarantees. Syntrake focuses on goal-aware decisions with risk control.
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import type { Opportunity, PortfolioSnapshot, ExecutionAction } from "@/lib/signalcore/types";
import type { ExecutionQueueItem } from "@/lib/execution/types";
import { enqueueExecutionServer, executionClientStore } from "@/lib/execution/clientStore";
import { formatMoneyCode } from "@/lib/ui/format";

function uid(prefix = "q") {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function money(n: number, ccy: string) {
  return formatMoneyCode(n, ccy || "EUR");
}

function buildActionFromOpp(opp: Opportunity, amountBase: number): ExecutionAction {
  return {
    id: uid("act"),
    kind: "BUY",
    symbol: opp.symbol,
    name: opp.name,
    bucket: opp.bucketHint,
    amountBase,
    priority: 1,
    rationale: `${opp.whyNow} (Fit ${opp.fitScore}/100)`,
    impact: { oddsDelta: opp.expectedOddsDelta, riskDelta: opp.riskLabel === "high" ? 1.4 : opp.riskLabel === "medium" ? 0.6 : -0.2 },
    guardrails: { ok: true, notes: ["OK"] },
  };
}

export default function OpportunityCards({
  portfolio,
  opportunities,
  pro,
  onOpenDetail,
}: {
  portfolio: PortfolioSnapshot | null;
  opportunities: Opportunity[];
  pro: boolean;
  onOpenDetail: (opp: Opportunity) => void;
}) {
  const base = portfolio?.baseCurrency ?? "EUR";
  const cash = portfolio?.cashBase ?? 0;

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const suggestedAmount = useMemo(() => {
    // Simple institutional sizing: min(monthly-like 200, 6% cash, cap 1000)
    const step = Math.min(200, Math.max(25, cash * 0.06), 1000);
    return Math.round(step);
  }, [cash]);

  async function sendToExecution(opp: Opportunity) {
    const amt = Math.min(suggestedAmount, Math.max(25, cash || suggestedAmount));
    const action = buildActionFromOpp(opp, amt);

    const item: ExecutionQueueItem = {
      id: uid("exq"),
      status: "queued",
      source: "opportunities",
      action,
      notes: `Opportunity: ${opp.symbol} | est odds delta ${opp.expectedOddsDelta}%`,
      copied: false,
      done_at: null,
    };

    setSendingId(opp.id);
    setToast(null);

    // Always keep local queue so UX never blocks.
    executionClientStore.push(item);

    // Try server insert (Supabase) in parallel architecture.
    const ok = await enqueueExecutionServer(item);
    setSendingId(null);

    setToast(ok ? "Sent to Execution Queue." : "Saved locally (server sync failed).");
    setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className="rounded-2xl border border-border-soft bg-white p-3 text-xs text-ink-700 shadow-soft">
          {toast}
        </div>
      )}

      <div className="rounded-2xl border border-border-soft bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-ink-700">Sizing suggestion</div>
            <div className="mt-1 text-sm font-semibold text-ink-900">{money(suggestedAmount, base)} per action</div>
            <div className="mt-1 text-xs text-ink-600">Based on current cash. Keep moves disciplined and repeatable.</div>
          </div>
          <div className="rounded-2xl border border-border-soft bg-neutral-50 px-3 py-2 text-xs text-ink-600">
            Cash: <span className="font-semibold">{money(cash, base)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {opportunities.map((opp) => (
          <div key={opp.id} className="rounded-2xl border border-border-soft bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-ink-900">{opp.name}</div>
                <div className="mt-1 text-xs text-ink-600">
                  {opp.symbol} | {opp.vehicle} | Risk: <span className="font-semibold">{opp.riskLabel}</span> | Horizon:{" "}
                  <span className="font-semibold">{opp.horizon}</span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1">
                <div className="rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] text-ink-700">Fit {opp.fitScore}/100</div>
                <div className="rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] text-ink-700">Conf {opp.confidence}/100</div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-border-soft bg-neutral-50 p-3">
              <div className="text-xs font-semibold text-ink-700">Why now</div>
              <div className="mt-1 text-xs text-ink-600 line-clamp-3">{opp.whyNow}</div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-ink-600">
                Odds delta (est.):{" "}
                <span className="font-semibold text-ink-900">
                  {opp.expectedOddsDelta >= 0 ? "+" : ""}
                  {opp.expectedOddsDelta}%
                </span>
                {pro && <span className="ml-2 text-[11px] text-ink-500">| cap {opp.maxSizePct}% | bucket {opp.bucketHint}</span>}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenDetail(opp)}
                  className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
                >
                  Details
                </button>

                <button
                  type="button"
                  onClick={() => sendToExecution(opp)}
                  disabled={sendingId === opp.id}
                  className="rounded-2xl bg-brand px-3 py-2 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
                >
                  {sendingId === opp.id ? "Sending..." : "Send to Execution"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border-soft bg-white p-4 shadow-soft">
        <div className="text-xs font-semibold text-ink-700">How this makes money without hype</div>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ink-600">
          <li>We rank opportunities by plan fit, regime alignment, and estimated odds impact.</li>
          <li>We cap sizing to protect against drawdowns and concentration traps.</li>
          <li>You execute inside your broker. Syntrake stays compliant and execution-focused.</li>
        </ul>
      </div>
    </div>
  );
}


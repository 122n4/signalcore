"use client";

import React from "react";
import Link from "next/link";
import { usePaid } from "@/lib/usePaid";

export default function DailyClient() {
  const { isPaid, loadingPaid } = usePaid();

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <div className="text-xs font-semibold text-ink-600">SignalCore • Daily</div>
        <div className="mt-2 text-2xl font-semibold text-ink-900">
          Your Next Best Action (today)
        </div>
        <div className="mt-2 text-sm text-ink-600">
          Daily is online. We’ll re-enable engine/feeds step-by-step without breaking the app.
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-600">
            {loadingPaid ? "Loading…" : isPaid ? "PRO" : "FREE"}
          </span>
          <Link
            href="/app?tab=planning"
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Build plan
          </Link>
          <Link
            href="/app?tab=advisor"
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:opacity-95"
          >
            Advisor
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-border-soft bg-neutral-50 p-6 shadow-soft">
        <div className="text-xs font-semibold text-ink-700">Debug</div>
        <div className="mt-2 text-xs text-ink-600">
          If you can see this card, routing + UI tabs are OK. Next we add broker card + engine calls safely.
        </div>
      </div>
    </div>
  );
}
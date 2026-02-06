"use client";

import React, { useMemo, useState } from "react";
import OpportunitiesPanel from "@/components/opportunities/OpportunitiesPanel";
import { usePaid } from "@/lib/usePaid";
import { useRouter } from "next/navigation";

/**
 * OpportunitiesTab
 * - Wrapper institucional para o OpportunitiesPanel
 * - Adiciona uma barra superior (mini) com CTA e estado (FREE/PRO)
 * - Evita qualquer lógica duplicada (resolve "defined multiple times")
 * - Mantém o feed viciante e orientado a conversão
 */

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] text-ink-600">
      {children}
    </span>
  );
}

export default function OpportunitiesTab() {
  const router = useRouter();
  const { isPaid, loadingPaid } = usePaid();

  const [view, setView] = useState<"beginner" | "pro">("beginner");

  const badge = useMemo(() => {
    if (loadingPaid) return "Loading…";
    return isPaid ? "PRO" : "FREE";
  }, [isPaid, loadingPaid]);

  return (
    <div className="space-y-4">
      {/* Mini header (premium + conversion) */}
      <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
              Opportunities
            </div>
            <div className="mt-1 text-xl font-semibold text-ink-900">
              High-signal opportunities — aligned with your plan
            </div>
            <div className="mt-1 text-sm text-ink-600">
              The “money-feeling feed” without hype: next best moves, sizing discipline, and risk notes.
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{badge}</Pill>
              <Pill>{view === "pro" ? "Pro view" : "Beginner view"}</Pill>
              {!loadingPaid && !isPaid ? <Pill>Upgrade unlocks deeper reasoning</Pill> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setView((v) => (v === "beginner" ? "pro" : "beginner"))}
              className={
                "rounded-2xl px-4 py-2 text-sm font-semibold " +
                (view === "pro"
                  ? "bg-brand text-white hover:opacity-95"
                  : "border border-border-soft bg-white text-ink-700 hover:opacity-95")
              }
            >
              {view === "pro" ? "Switch to Beginner" : "Open Pro"}
            </button>

            {!loadingPaid && !isPaid ? (
              <button
                type="button"
                onClick={() => router.push("/pricing")}
                className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
              >
                Upgrade
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/app/daily")}
                className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:opacity-95"
              >
                Go to Daily
              </button>
            )}
          </div>
        </div>

        {/* Small “how to use” to reduce confusion */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
            <div className="text-xs font-semibold text-ink-700">1) Pick one</div>
            <div className="mt-1 text-sm text-ink-600">
              Don’t overtrade. Choose the top opportunity only.
            </div>
          </div>
          <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
            <div className="text-xs font-semibold text-ink-700">2) Follow sizing</div>
            <div className="mt-1 text-sm text-ink-600">
              Discipline beats excitement. Stick to caps and guardrails.
            </div>
          </div>
          <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
            <div className="text-xs font-semibold text-ink-700">3) Go Daily</div>
            <div className="mt-1 text-sm text-ink-600">
              Daily turns this into a habit. One action, then stop.
            </div>
          </div>
        </div>
      </div>

      {/* Main panel (engine-connected feed) */}
      <OpportunitiesPanel />
    </div>
  );
}
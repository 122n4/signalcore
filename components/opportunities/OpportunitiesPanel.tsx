"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Opportunity, PortfolioMini } from "@/lib/opportunities/types";
import { demoOpportunities, demoPortfolio } from "@/lib/opportunities/demo";
import { usePaid } from "@/lib/usePaid";

/**
 * OpportunitiesPanel (Hybrid: Beginner + Pro)
 * - Fetches /api/opportunities (real engine: plan + portfolio + regime) with safe fallback
 * - Never empty (demo fallback)
 * - Pro view: shows deeper reasoning; if not paid → lock + CTA
 */

type ApiPayload = {
  ok?: boolean;
  mode?: "demo" | "user";
  asOf?: string;
  regime?: string;
  portfolio?: PortfolioMini;
  opportunities?: Opportunity[];
  note?: string;
  error?: string;
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border-soft bg-white px-2 py-0.5 text-[11px] text-ink-600">
      {children}
    </span>
  );
}

function Score({ v }: { v: number }) {
  const label = v >= 75 ? "High" : v >= 60 ? "Medium" : "Early";
  return (
    <Pill>
      Confidence: {label} ({Math.round(v)}%)
    </Pill>
  );
}

function formatAction(a: Opportunity["action"]) {
  if (!a) return "ACTION";
  return String(a).toUpperCase();
}

function safePct(n?: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n;
}

function Card({
  opp,
  onOpen,
  pro,
  proLocked,
}: {
  opp: Opportunity;
  onOpen: () => void;
  pro: boolean;
  proLocked: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-3xl border border-border-soft bg-white p-5 text-left shadow-soft hover:opacity-95"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
            {formatAction(opp.action)} {opp.symbol ? `· ${opp.symbol}` : ""}
          </div>
          <div className="mt-1 text-lg font-semibold text-ink-900">{opp.title}</div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Score v={opp.confidence} />
          {pro ? (
            proLocked ? (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                Pro details locked
              </span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
                Pro view enabled
              </span>
            )
          ) : (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
              Simple view
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 text-sm text-ink-700">{opp.rationale}</div>

      <div className="mt-4 grid gap-2 text-xs text-ink-600">
        <div>
          <span className="font-semibold text-ink-700">Why now:</span> {opp.why_now}
        </div>
        <div>
          <span className="font-semibold text-ink-700">Impact:</span> {opp.impact_hint}
        </div>
        <div>
          <span className="font-semibold text-ink-700">Risk note:</span> {opp.risk_note}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(opp.tags ?? []).slice(0, 5).map((t) => (
          <Pill key={t}>{t}</Pill>
        ))}
        <Pill>Horizon: {opp.horizon}</Pill>
      </div>

      <div className="mt-4 text-xs font-semibold text-brand">Open details →</div>
    </button>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="text-sm font-semibold text-ink-900">No opportunities yet</div>
      <div className="mt-2 text-sm text-ink-600">
        This feed becomes powerful once we see your portfolio + plan. For now, we’ll show a safe
        fallback so you’re never stuck.
      </div>
      <button
        onClick={onRefresh}
        type="button"
        className="mt-4 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
      >
        Refresh
      </button>
    </div>
  );
}

export default function OpportunitiesPanel() {
  const router = useRouter();
  const { isPaid } = usePaid();

  const [loading, setLoading] = useState(true);

  // Hybrid: beginner vs pro toggle
  const [pro, setPro] = useState(false);

  // Engine-connected meta
  const [mode, setMode] = useState<"demo" | "user">("demo");
  const [regime, setRegime] = useState<string>("Loading…");
  const [asOf, setAsOf] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Data
  const [portfolio, setPortfolio] = useState<PortfolioMini>(() => demoPortfolio());
  const [opps, setOpps] = useState<Opportunity[]>(() => demoOpportunities());
  const [selected, setSelected] = useState<Opportunity | null>(null);

  const proLocked = useMemo(() => pro && !isPaid, [pro, isPaid]);

  const hero = useMemo(() => {
    const top = opps?.[0];
    if (!top) return null;
    return {
      headline: "Today’s best opportunity",
      sub: "High-signal, plan-aware suggestions. No hype. Just the next best move.",
      top,
    };
  }, [opps]);

  async function refresh() {
    setLoading(true);
    setSelected(null);
    setNote(null);

    try {
      const res = await fetch("/api/opportunities", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ApiPayload;

      // Always keep stable values (even on partial payload)
      setMode(data?.mode ?? "demo");
      setRegime(data?.regime ?? "Neutral");
      setAsOf(data?.asOf ?? null);
      setNote(data?.note ?? (data?.error ? `Fallback: ${data.error}` : null));

      const safePortfolio =
        data?.portfolio && Array.isArray(data.portfolio.items) && data.portfolio.items.length
          ? data.portfolio
          : demoPortfolio();

      const safeOpps =
        data?.opportunities && Array.isArray(data.opportunities) && data.opportunities.length
          ? data.opportunities
          : demoOpportunities();

      setPortfolio(safePortfolio);
      setOpps(safeOpps);
    } catch {
      // Hard fallback (never empty)
      setMode("demo");
      setRegime("Fallback mode");
      setAsOf(new Date().toISOString());
      setNote("Could not fetch /api/opportunities. Showing safe fallback.");
      setPortfolio(demoPortfolio());
      setOpps(demoOpportunities());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cashPct = safePct(portfolio?.cashPct);
  const updatedLabel = asOf ? asOf.replace("T", " ").slice(0, 16) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
              Opportunities
            </div>
            <div className="mt-1 text-2xl font-semibold text-ink-900">
              A feed that feels like a financial brain
            </div>
            <div className="mt-2 text-sm text-ink-600 max-w-2xl">
              Spot what matters, explain why, and keep you aligned with your plan. This is designed
              to create daily clarity and habit.
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Pill>{mode === "user" ? "Connected" : "Demo"}</Pill>
              <Pill>Regime: {regime}</Pill>
              {cashPct != null ? <Pill>Cash: {cashPct.toFixed(1)}%</Pill> : null}
              {updatedLabel ? <Pill>As of: {updatedLabel}</Pill> : null}
              {loading ? <Pill>Refreshing…</Pill> : <Pill>Ready</Pill>}
            </div>

            {note ? (
              <div className="mt-3 rounded-2xl border border-border-soft bg-neutral-50 p-3 text-xs text-ink-600">
                {note}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refresh}
              className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
            >
              Refresh
            </button>

            <button
              type="button"
              onClick={() => setPro((s) => !s)}
              className={
                "rounded-2xl px-3 py-2 text-xs font-semibold " +
                (pro
                  ? "bg-brand text-white hover:opacity-95"
                  : "border border-border-soft bg-white text-ink-700 hover:opacity-95")
              }
            >
              {pro ? "Beginner view" : "Pro view"}
            </button>
          </div>
        </div>

        {/* Pro lock CTA */}
        {pro && !isPaid ? (
          <div className="mt-4 rounded-2xl border border-border-soft bg-neutral-50 p-4">
            <div className="text-sm font-semibold text-ink-900">Pro view is locked</div>
            <div className="mt-1 text-sm text-ink-600">
              Unlock sizing, guardrails checks, confidence breakdown, and drift-aware reasoning.
            </div>
            <button
              type="button"
              onClick={() => router.push("/pricing")}
              className="mt-3 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
            >
              Upgrade to Pro
            </button>
          </div>
        ) : null}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Left: feed */}
        <div className="space-y-4 xl:col-span-2">
          {/* Hero opportunity (always) */}
          {hero ? (
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink-900">{hero.headline}</div>
                  <div className="mt-1 text-sm text-ink-600">{hero.sub}</div>
                </div>
                <Score v={hero.top.confidence} />
              </div>

              <div className="mt-4">
                <Card opp={hero.top} onOpen={() => setSelected(hero.top)} pro={pro} proLocked={proLocked} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/app/daily")}
                  className="rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                  Go to Daily (next action)
                </button>

                <button
                  type="button"
                  onClick={() => router.push("/app")}
                  className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:opacity-95"
                >
                  Open app tabs
                </button>

                <button
                  type="button"
                  onClick={() => setPro(true)}
                  className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:opacity-95"
                >
                  Open Pro controls
                </button>
              </div>

              <div className="mt-3 text-[11px] text-ink-500">
                Educational decision-support tool. Not financial advice. You remain responsible for outcomes.
              </div>
            </div>
          ) : (
            <EmptyState onRefresh={refresh} />
          )}

          {/* More opportunities */}
          {opps?.length ? (
            <div className="grid grid-cols-1 gap-4">
              {opps.slice(1, 6).map((o) => (
                <Card key={o.id} opp={o} onOpen={() => setSelected(o)} pro={pro} proLocked={proLocked} />
              ))}
            </div>
          ) : null}
        </div>

        {/* Right: portfolio context + detail */}
        <div className="space-y-4 xl:sticky xl:top-4 h-fit">
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
              Portfolio context
            </div>
            <div className="mt-2 text-sm text-ink-700">
              We use your holdings to avoid generic recommendations.
            </div>

            <div className="mt-4 space-y-2">
              {(portfolio?.items ?? []).map((it) => (
                <div key={it.symbol} className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-ink-900">{it.symbol}</div>
                  <div className="text-sm text-ink-600">{(it.weightPct ?? 0).toFixed(1)}%</div>
                </div>
              ))}

              {cashPct != null ? (
                <div className="pt-3 text-xs text-ink-600">
                  Cash weight: <span className="font-semibold">{cashPct.toFixed(1)}%</span>
                </div>
              ) : null}

              <div className="pt-2 text-xs text-ink-500">
                {loading ? "Updating feed…" : "Up to date."}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
              Detail
            </div>

            {!selected ? (
              <div className="mt-3 text-sm text-ink-600">
                Click an opportunity to see details.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Pill>{formatAction(selected.action)}</Pill>
                  <Score v={selected.confidence} />
                  {selected.symbol ? <Pill>{selected.symbol}</Pill> : null}
                </div>

                <div className="text-lg font-semibold text-ink-900">{selected.title}</div>
                <div className="text-sm text-ink-700">{selected.rationale}</div>

                <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
                  <div className="text-xs font-semibold text-ink-700">Why now</div>
                  <div className="mt-1 text-sm text-ink-700">{selected.why_now}</div>
                </div>

                <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
                  <div className="text-xs font-semibold text-ink-700">Impact</div>
                  <div className="mt-1 text-sm text-ink-700">{selected.impact_hint}</div>
                </div>

                <div className="rounded-2xl border border-border-soft bg-neutral-50 p-4">
                  <div className="text-xs font-semibold text-ink-700">Risk note</div>
                  <div className="mt-1 text-sm text-ink-700">{selected.risk_note}</div>
                </div>

                {pro ? (
                  <div className="rounded-2xl border border-border-soft bg-white p-4">
                    <div className="text-xs font-semibold text-ink-700">Pro layer</div>
                    {isPaid ? (
                      <div className="mt-2 text-sm text-ink-700">
                        {selected.pro_note ??
                          "Pro: confidence breakdown + sizing + guardrails (wire to Engine next)."}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-ink-600">
                        Locked. Upgrade to see sizing + guardrails + confidence breakdown.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
              Why this sells
            </div>
            <div className="mt-2 text-sm text-ink-700">
              Users pay when they get clarity + momentum. This feed gives a daily “next best move”
              without overwhelming them.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
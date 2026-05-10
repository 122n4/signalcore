"use client";

import React from "react";
import Link from "next/link";

type TradingDiscoveryValueRailProps = {
  surface: "desk" | "opportunities";
  instrumentCount: number;
  marketOpenCount: number;
  discoveryInstrumentLimit: number | null | undefined;
  visibleHistoryDays: number | null | undefined;
  weeklyOpportunityBudget: number | null | undefined;
  pricingHref?: string;
};

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

export default function TradingDiscoveryValueRail({
  surface,
  instrumentCount,
  marketOpenCount,
  discoveryInstrumentLimit,
  visibleHistoryDays,
  weeklyOpportunityBudget,
  pricingHref = "/pricing?source=trading_discovery_rail",
}: TradingDiscoveryValueRailProps) {
  const headline =
    surface === "desk"
      ? "Discovery keeps the trading desk live before Pro."
      : "Discovery shows live flow first, not fake opportunity spam.";

  const body =
    surface === "desk"
      ? "Free users can inspect the desk, live chart, live feed, and the top market flow before paying. Pro starts when execution, risk framing, journal memory, and alerts need to become operational."
      : "Free users can see the ranked flow across execution, queue, watchlist, and radar. Pro takes the same flow deeper with execution packs, risk posture, alerting, and durable memory.";

  const scopeValue =
    discoveryInstrumentLimit && discoveryInstrumentLimit > 0
      ? `Top ${discoveryInstrumentLimit}`
      : `${instrumentCount}`;
  const scopeDetail =
    discoveryInstrumentLimit && discoveryInstrumentLimit > 0
      ? "highest-priority instruments visible in discovery"
      : "markets currently visible in the desk";

  const continuityValue =
    visibleHistoryDays && visibleHistoryDays > 0 ? `${visibleHistoryDays} days` : "Full";
  const continuityDetail =
    visibleHistoryDays && visibleHistoryDays > 0
      ? "live chart and feed continuity before upgrade"
      : "continuity visible in this tier";

  const budgetValue =
    weeklyOpportunityBudget && weeklyOpportunityBudget > 0 ? `${weeklyOpportunityBudget} ideas` : "Full flow";
  const budgetDetail =
    weeklyOpportunityBudget && weeklyOpportunityBudget > 0
      ? "ranked weekly opportunity budget in discovery"
      : "full ranked opportunity flow";

  const bullets =
    surface === "desk"
      ? [
          "Live chart and feed stay visible before payment.",
          "Discovery keeps the best markets on screen instead of hiding the product.",
          "Pro unlocks execution packs, deeper risk, journal memory, and alerts.",
        ]
      : [
          "Execution now, opportunity queue, watchlist, and radar stay separated on purpose.",
          "WAIT belongs in monitoring layers, not in fake opportunity spam.",
          "Pro adds deeper continuity and operating layers when timing matters.",
        ];

  return (
    <section className="rounded-[22px] border border-sky-700/30 bg-[linear-gradient(180deg,rgba(12,22,40,0.96)_0%,rgba(8,15,29,0.98)_100%)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Trading discovery</div>
          <div className="mt-2 text-2xl font-semibold text-white">{headline}</div>
          <div className="mt-2 text-sm text-slate-300">{body}</div>
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-right">
          <div className="text-[11px] uppercase tracking-[0.16em] text-sky-200">Markets open now</div>
          <div className="mt-1 text-2xl font-semibold text-white">
            {marketOpenCount}/{instrumentCount}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <StatCard label="Discovery scope" value={scopeValue} detail={scopeDetail} />
        <StatCard label="Continuity" value={continuityValue} detail={continuityDetail} />
        <StatCard label="Opportunity budget" value={budgetValue} detail={budgetDetail} />
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-slate-800 bg-[#0d1628] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">What stays useful before Pro</div>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {bullets.map((bullet) => (
              <li key={bullet}>- {bullet}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#0d1628] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Next unlock</div>
          <div className="mt-2 text-sm text-slate-300">
            Upgrade when you want Syntrake to move from discovery into execution, risk posture, journal continuity, and active alerts.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={pricingHref}
              className="inline-flex items-center justify-center rounded-xl bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Compare Trading Pro
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

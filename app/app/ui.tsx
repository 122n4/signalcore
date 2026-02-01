"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";
import SignalCoreAdvisorCard from "@/components/SignalCoreAdvisorCard";
import { usePaid } from "@/lib/usePaid";

type TabKey = "overview" | "portfolio" | "advisor";
type Regime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
type Horizon = "Short" | "Medium" | "Long";

export default function AppClient() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [horizon, setHorizon] = useState<Horizon>("Long");
  const regime: Regime = "Transitional"; // depois ligamos à API real

  const { isPaid, loadingPaid } = usePaid();

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-8">

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <Tab tab={tab} setTab={setTab} value="overview" />
          <Tab tab={tab} setTab={setTab} value="portfolio" />
          <Tab tab={tab} setTab={setTab} value="advisor" />
        </div>

        {/* CONTENT */}
        <div className="mt-8">

          {tab === "overview" && (
            <SignalCoreAdvisorCard regime={regime} horizon={horizon} />
          )}

          {tab === "portfolio" && (
            <SignedOut>
              <PortfolioPreview locale="en" />
            </SignedOut>
          )}

          {tab === "portfolio" && (
            <SignedIn>
              {loadingPaid ? (
                <p className="text-sm text-ink-500">Checking access…</p>
              ) : isPaid ? (
                <PortfolioEditor locale="en" />
              ) : (
                <Link
                  href="/pricing"
                  className="inline-flex rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white"
                >
                  Unlock portfolio
                </Link>
              )}
            </SignedIn>
          )}

          {tab === "advisor" && (
            <SignalCoreAdvisorCard regime={regime} horizon={horizon} />
          )}

        </div>
      </section>
    </main>
  );
}

function Tab({
  tab,
  setTab,
  value,
}: {
  tab: string;
  setTab: (v: any) => void;
  value: string;
}) {
  return (
    <button
      onClick={() => setTab(value as any)}
      className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
        tab === value
          ? "bg-ink-900 text-white"
          : "border border-border-soft bg-white text-ink-700"
      }`}
    >
      {value}
    </button>
  );
}
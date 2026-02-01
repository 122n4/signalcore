"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";
import SignalCoreAdvisorCard from "@/components/SignalCoreAdvisorCard";
import DecisionEnginePanel from "@/components/DecisionEnginePanel";

import { usePaid } from "@/lib/usePaid";
import { useMarketRegime, type Regime as MarketRegime } from "@/lib/useMarketRegime";

import type { Goal, RiskProfile, Horizon } from "@/lib/signalcore/decisionEngine";

type TabKey = "overview" | "portfolio" | "advisor";

export default function AppClient() {
  const [tab, setTab] = useState<TabKey>("overview");

  // These will be user settings soon (mode selector). For now, demo controls:
  const [goal, setGoal] = useState<Goal>("Investing");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("Balanced");
  const [horizon, setHorizon] = useState<Horizon>("Long");

  const { isPaid, loadingPaid } = usePaid();
  const { regime, loadingRegime } = useMarketRegime();

  // Cast regime from hook Regime -> decisionEngine MarketRegime union (same strings)
  const engineRegime = useMemo(() => {
    // hook Regime is compatible, but TS may treat them different types in different files
    return regime as unknown as MarketRegime;
  }, [regime]);

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
            Overview
          </TabButton>
          <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
            Portfolio
          </TabButton>
          <TabButton active={tab === "advisor"} onClick={() => setTab("advisor")}>
            Advisor
          </TabButton>
        </div>

        {/* Content */}
        <div className="mt-8">
          {/* OVERVIEW */}
          {tab === "overview" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="SignalCore" subtitle="Decision layer above brokers." />

                <div className="mt-5 rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <p className="text-sm text-ink-700">
                    Market regime: <strong>{loadingRegime ? "loading…" : regime}</strong>
                  </p>
                  <p className="mt-2 text-sm text-ink-700">
                    Horizon: <strong>{horizon}</strong>
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setTab("advisor")}
                    className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 shadow-soft"
                  >
                    Open Advisor
                  </button>

                  <button
                    type="button"
                    onClick={() => setTab("portfolio")}
                    className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                  >
                    Open Portfolio
                  </button>
                </div>

                <SignedIn>
                  <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                    <p className="text-sm text-ink-700">
                      Status:{" "}
                      {loadingPaid ? (
                        <span className="text-ink-500">checking…</span>
                      ) : isPaid ? (
                        <span className="font-semibold">Premium active</span>
                      ) : (
                        <span className="font-semibold">Free account</span>
                      )}
                    </p>

                    {!loadingPaid && !isPaid ? (
                      <p className="mt-2 text-xs text-ink-500">
                        Premium unlocks portfolio editing + cloud saving + allocation view.
                      </p>
                    ) : null}
                  </div>
                </SignedIn>

                <SignedOut>
                  <div className="mt-6">
                    <Link
                      href="/sign-in"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 shadow-soft"
                    >
                      Sign in
                    </Link>
                  </div>
                </SignedOut>
              </Card>

              {/* Controls (demo) + Engine output */}
              <Card className="bg-canvas-50">
                <CardHeader title="Mode controls (demo)" subtitle="Next step: store this per user." />

                <div className="mt-5 grid gap-3">
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold text-ink-500">Goal</label>
                    <select
                      value={goal}
                      onChange={(e) => setGoal(e.target.value as Goal)}
                      className="w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                    >
                      <option value="Investing">Investing</option>
                      <option value="Trading">Trading</option>
                      <option value="Forex">Forex</option>
                      <option value="Crypto">Crypto</option>
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-xs font-semibold text-ink-500">Risk profile</label>
                    <select
                      value={riskProfile}
                      onChange={(e) => setRiskProfile(e.target.value as RiskProfile)}
                      className="w-full rounded-2xl border border-border-soft bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-signal-700/20"
                    >
                      <option value="Conservative">Conservative</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Aggressive">Aggressive</option>
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-xs font-semibold text-ink-500">Horizon</label>
                    <div className="flex flex-wrap gap-2">
                      <Chip active={horizon === "Short"} onClick={() => setHorizon("Short")}>
                        Short
                      </Chip>
                      <Chip active={horizon === "Medium"} onClick={() => setHorizon("Medium")}>
                        Medium
                      </Chip>
                      <Chip active={horizon === "Long"} onClick={() => setHorizon("Long")}>
                        Long
                      </Chip>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Engine panel */}
              <div className="lg:col-span-2">
                {loadingRegime ? (
                  <Card className="bg-canvas-50">
                    <CardHeader title="Decision Engine" subtitle="Loading market regime…" />
                    <p className="mt-4 text-sm text-ink-700">Fetching live regime…</p>
                  </Card>
                ) : (
                  <DecisionEnginePanel
                    regime={engineRegime as any}
                    horizon={horizon}
                    goal={goal}
                    riskProfile={riskProfile}
                    isPremium={isPaid}
                  />
                )}
              </div>
            </div>
          )}

          {/* PORTFOLIO */}
          {tab === "portfolio" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <SignedOut>
                <PortfolioPreview locale="en" />
                <Card className="bg-canvas-50">
                  <CardHeader title="Portfolio (Premium)" subtitle="Sign in to unlock editing + saving." />
                  <div className="mt-6">
                    <Link
                      href="/sign-in"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 shadow-soft"
                    >
                      Sign in
                    </Link>
                  </div>
                </Card>
              </SignedOut>

              <SignedIn>
                {loadingPaid ? (
                  <Card className="bg-canvas-50">
                    <CardHeader title="Portfolio" subtitle="Checking membership…" />
                    <p className="mt-4 text-sm text-ink-700">Loading access…</p>
                  </Card>
                ) : isPaid ? (
                  <PortfolioEditor locale="en" />
                ) : (
                  <PaywallCard
                    title="Portfolio editing (Premium)"
                    subtitle="Premium unlocks editing + cloud saving."
                    cta="Unlock Portfolio"
                    href="/pricing"
                  />
                )}
              </SignedIn>

              <Card className="bg-canvas-50">
                <CardHeader title="Why this matters" subtitle="SignalCore keeps coherence, not noise." />
                <ul className="mt-5 space-y-2 text-sm text-ink-700">
                  <li>• Context drives posture.</li>
                  <li>• Horizon drives risk.</li>
                  <li>• Premium turns it into a plan.</li>
                </ul>
              </Card>
            </div>
          )}

          {/* ADVISOR */}
          {tab === "advisor" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-canvas-50">
                <CardHeader title="Advisor" subtitle="Context → action bias → reasons." />
                <p className="mt-4 text-sm text-ink-700">
                  Regime: <strong>{loadingRegime ? "loading…" : regime}</strong> · Horizon:{" "}
                  <strong>{horizon}</strong>
                </p>
                <p className="mt-2 text-xs text-ink-500">
                  Next step: advisor consumes Decision Engine output and becomes truly goal-aware.
                </p>
              </Card>

              <SignedIn>
                {loadingPaid ? (
                  <Card className="bg-canvas-50">
                    <CardHeader title="Advisor" subtitle="Checking access…" />
                    <p className="mt-4 text-sm text-ink-700">Loading…</p>
                  </Card>
                ) : isPaid ? (
                  loadingRegime ? (
                    <Card className="bg-canvas-50">
                      <CardHeader title="Advisor" subtitle="Loading market regime…" />
                      <p className="mt-4 text-sm text-ink-700">Fetching live regime…</p>
                    </Card>
                  ) : (
                    <SignalCoreAdvisorCard regime={engineRegime as any} horizon={horizon} />
                  )
                ) : (
                  <PaywallCard
                    title="Advisor (Premium)"
                    subtitle="Unlock Advisor: insinuations + reasons."
                    cta="Unlock Advisor"
                    href="/pricing"
                  />
                )}
              </SignedIn>

              <SignedOut>
                <PaywallCard title="Advisor (Premium)" subtitle="Sign in to unlock Advisor." cta="Sign in" href="/sign-in" />
              </SignedOut>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

/* ---------- UI helpers ---------- */

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-2 text-sm font-semibold transition",
        active ? "bg-ink-900 text-white" : "border border-border-soft bg-white text-ink-700 hover:bg-canvas-50",
      ].join(" ")}
      type="button"
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-2 text-sm font-semibold border border-border-soft transition",
        active ? "bg-ink-900 text-white" : "bg-white text-ink-700 hover:bg-canvas-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-border-soft bg-white p-8 shadow-soft ${className}`}>{children}</div>;
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-500">{title}</p>
      {subtitle ? <p className="mt-2 text-sm text-ink-700">{subtitle}</p> : null}
    </div>
  );
}

function PaywallCard({
  title,
  subtitle,
  cta = "Unlock Premium",
  href = "/pricing",
}: {
  title: string;
  subtitle: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-soft">
      <p className="text-xs font-semibold text-ink-500">{title}</p>
      <p className="mt-2 text-sm text-ink-700">{subtitle}</p>
      <div className="mt-6">
        <Link
          href={href}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
        >
          {cta}
        </Link>
      </div>
      <p className="mt-3 text-xs text-ink-500">Cancel anytime.</p>
    </div>
  );
}
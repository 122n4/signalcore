"use client";

import React, { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";
import SignalCoreAdvisorCard from "@/components/SignalCoreAdvisorCard";

type TabKey = "overview" | "marketmap" | "portfolio" | "planning" | "advisor";
type Regime = "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
type Horizon = "Short" | "Medium" | "Long";

/**
 * ✅ Wrap the component that uses useSearchParams() in Suspense
 */
export default function AppPage() {
  return (
    <Suspense fallback={<AppShellLoading />}>
      <AppInner />
    </Suspense>
  );
}

function AppShellLoading() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-soft">
          <p className="text-sm text-ink-700">Loading app…</p>
        </div>
      </section>
    </main>
  );
}

function AppInner() {
  const params = useSearchParams();

  const [tab, setTab] = useState<TabKey>("overview");

  const [isPaid, setIsPaid] = useState(false);
  const [loadingPaid, setLoadingPaid] = useState(true);

  const [regime, setRegime] = useState<Regime>("Transitional");
  const [loadingRegime, setLoadingRegime] = useState(true);

  const [horizon, setHorizon] = useState<Horizon>("Long");
  const [loadingHorizon, setLoadingHorizon] = useState(true);

  // Deep-link: /app?tab=marketmap
  useEffect(() => {
    const t = params.get("tab");
    if (t === "overview" || t === "marketmap" || t === "portfolio" || t === "planning" || t === "advisor") {
      setTab(t);
    }
  }, [params]);

  // Paid status via /api/me
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;
        setIsPaid(Boolean(data?.isPaid));
      } catch {
        if (!alive) return;
        setIsPaid(false);
      } finally {
        if (!alive) return;
        setLoadingPaid(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Regime via /api/market-regime
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/market-regime", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;

        const r = data?.market_regime;
        if (r === "Risk-on" || r === "Risk-off" || r === "Transitional" || r === "Neutral / Range-bound") {
          setRegime(r);
        } else {
          setRegime("Transitional");
        }
      } catch {
        if (!alive) return;
        setRegime("Transitional");
      } finally {
        if (!alive) return;
        setLoadingRegime(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Horizon via /api/portfolio (fallback Long)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const meRes = await fetch("/api/me", { cache: "no-store" });
        const me = await meRes.json();
        if (!alive) return;

        if (!me?.isAuthenticated) {
          setHorizon("Long");
          setLoadingHorizon(false);
          return;
        }

        const pr = await fetch("/api/portfolio", { cache: "no-store" });
        const pj = await pr.json();
        if (!alive) return;

        const h = pj?.data?.userHorizon;
        if (h === "Short" || h === "Medium" || h === "Long") setHorizon(h);
        else setHorizon("Long");
      } catch {
        if (!alive) return;
        setHorizon("Long");
      } finally {
        if (!alive) return;
        setLoadingHorizon(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Demo weekly summary (podes ligar ao regime summary mais tarde)
  const weekly = useMemo(
    () => ({
      updatedAt: "This week · Updated",
      market: regime === "Risk-on" ? "Constructive" : regime === "Risk-off" ? "Defensive" : "Selective",
      crypto: regime === "Risk-on" ? "Constructive" : "Neutral",
      teaser:
        regime === "Risk-off"
          ? "This environment punishes urgency. Protect your plan."
          : regime === "Risk-on"
          ? "Constructive conditions — add risk gradually, not emotionally."
          : "Selectivity beats activity. Let confirmation do the heavy lifting.",
    }),
    [regime]
  );

  const advisorReady = !(loadingRegime || loadingHorizon);

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-8">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
            Overview
          </TabButton>
          <TabButton active={tab === "marketmap"} onClick={() => setTab("marketmap")}>
            Market Map
          </TabButton>
          <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
            Portfolio
          </TabButton>
          <TabButton active={tab === "planning"} onClick={() => setTab("planning")}>
            Planning
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
                <CardHeader title="THIS WEEK" subtitle={weekly.updatedAt} />

                <div className="mt-5 space-y-2">
                  <p className="text-lg font-semibold">
                    Market stance: <span className="text-ink-900">{weekly.market}</span>
                  </p>
                  <p className="text-lg font-semibold">
                    Crypto stance: <span className="text-ink-900">{weekly.crypto}</span>
                  </p>
                </div>

                <div className="mt-6 rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <p className="text-sm text-ink-700 italic">{weekly.teaser}</p>
                  <p className="mt-3 text-xs text-ink-500">
                    Regime: <strong>{loadingRegime ? "loading…" : regime}</strong> · Horizon:{" "}
                    <strong>{loadingHorizon ? "loading…" : horizon}</strong>
                  </p>
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
                        Premium unlocks portfolio saving + planning + Advisor.
                      </p>
                    ) : null}
                  </div>
                </SignedIn>

                <SignedOut>
                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Link
                      href="/sign-in"
                      className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 shadow-soft"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/market-map"
                      className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                    >
                      Market Map (preview)
                    </Link>
                  </div>
                </SignedOut>
              </Card>

              <Card className="bg-canvas-50">
                <CardHeader title="SignalCore" subtitle="A decision layer above brokers." />
                <ul className="mt-5 space-y-3 text-sm text-ink-700">
                  <li>• Context → posture.</li>
                  <li>• Portfolio coherence by horizon.</li>
                  <li>• Advisor insinuates Increase / Hold / Reduce (Premium).</li>
                </ul>
              </Card>
            </div>
          )}

          {/* MARKET MAP */}
          {tab === "marketmap" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-canvas-50">
                <CardHeader title="Market Map (preview)" subtitle="Short context (free)." />
                <p className="mt-4 text-sm text-ink-700">
                  Current regime: <strong>{loadingRegime ? "loading…" : regime}</strong>
                </p>
                <div className="mt-6">
                  <Link
                    href="/market-map"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                  >
                    Open public Market Map
                  </Link>
                </div>
              </Card>

              <SignedIn>
                {loadingPaid ? (
                  <Card className="bg-canvas-50">
                    <CardHeader title="Full Market Map" subtitle="Checking access…" />
                    <p className="mt-4 text-sm text-ink-700">Loading…</p>
                  </Card>
                ) : isPaid ? (
                  <Card>
                    <CardHeader title="Full Market Map (Premium)" subtitle="Move your full weekly map + archive here next." />
                    <p className="mt-4 text-sm text-ink-700">
                      Next: import your real weekly map content into this tab.
                    </p>
                  </Card>
                ) : (
                  <PaywallCard title="Full Market Map (Premium)" subtitle="Unlock full weekly map + archive." cta="Unlock Market Map" />
                )}
              </SignedIn>

              <SignedOut>
                <PaywallCard title="Full Market Map (Premium)" subtitle="Sign in to unlock the full Market Map." cta="Sign in" href="/sign-in" />
              </SignedOut>
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
                  <PaywallCard title="Portfolio editing (Premium)" subtitle="Premium unlocks editing + cloud saving." cta="Unlock Portfolio" />
                )}
              </SignedIn>

              <Card className="bg-canvas-50">
                <CardHeader title="Horizon" subtitle="Used by the Advisor." />
                <p className="mt-4 text-sm text-ink-700">
                  Current horizon: <strong>{loadingHorizon ? "loading…" : horizon}</strong>
                </p>
                <p className="mt-2 text-xs text-ink-500">
                  Tip: set your horizon inside Portfolio / Planning so the Advisor speaks your language.
                </p>
              </Card>
            </div>
          )}

          {/* PLANNING */}
          {tab === "planning" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-canvas-50">
                <CardHeader title="Planning preview" subtitle="Goal → path → discipline." />
                <ul className="mt-4 space-y-2 text-sm text-ink-700">
                  <li>• Choose target and horizon</li>
                  <li>• Monthly contribution range</li>
                  <li>• “If created today” nudges when context changes</li>
                </ul>
              </Card>

              <SignedIn>
                {loadingPaid ? (
                  <Card className="bg-canvas-50">
                    <CardHeader title="Planning" subtitle="Checking access…" />
                    <p className="mt-4 text-sm text-ink-700">Loading…</p>
                  </Card>
                ) : isPaid ? (
                  <Card>
                    <CardHeader title="Goal-based planning (Premium)" subtitle="Next: add the planning form here." />
                    <p className="mt-4 text-sm text-ink-700">
                      We’ll plug: target (€) + horizon + monthly contribution → plan + weekly checks.
                    </p>
                  </Card>
                ) : (
                  <PaywallCard title="Goal-based planning (Premium)" subtitle="Unlock planning + coherence checks." cta="Unlock Planning" />
                )}
              </SignedIn>

              <SignedOut>
                <PaywallCard title="Goal-based planning (Premium)" subtitle="Sign in to unlock planning." cta="Sign in" href="/sign-in" />
              </SignedOut>
            </div>
          )}

          {/* ADVISOR */}
          {tab === "advisor" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-canvas-50">
                <CardHeader title="Advisor preview" subtitle="Context → action bias → reasons." />
                <p className="mt-4 text-sm text-ink-700">
                  Advisor uses your <strong>Market Regime</strong> + your <strong>Horizon</strong>.
                </p>
                <p className="mt-2 text-xs text-ink-500">
                  Regime: <strong>{loadingRegime ? "loading…" : regime}</strong> · Horizon:{" "}
                  <strong>{loadingHorizon ? "loading…" : horizon}</strong>
                </p>
              </Card>

              <SignedIn>
                {loadingPaid ? (
                  <Card className="bg-canvas-50">
                    <CardHeader title="Advisor" subtitle="Checking access…" />
                    <p className="mt-4 text-sm text-ink-700">Loading…</p>
                  </Card>
                ) : isPaid ? (
                  advisorReady ? (
                    <SignalCoreAdvisorCard regime={regime} horizon={horizon} />
                  ) : (
                    <Card className="bg-canvas-50">
                      <CardHeader title="Advisor" subtitle="Loading market context…" />
                      <p className="mt-4 text-sm text-ink-700">Fetching regime and horizon…</p>
                    </Card>
                  )
                ) : (
                  <PaywallCard title="Advisor (Premium)" subtitle="Unlock Advisor: insinuations + reasons." cta="Unlock Advisor" />
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
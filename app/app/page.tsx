"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";

import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";
import SignalCoreAdvisorCard from "@/components/SignalCoreAdvisorCard";

type TabKey = "overview" | "marketmap" | "portfolio" | "planning" | "advisor";

export default function AppHome() {
  const params = useSearchParams();

  const [tab, setTab] = useState<TabKey>("overview");
  const [isPaid, setIsPaid] = useState(false);
  const [loadingPaid, setLoadingPaid] = useState(true);

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

  // Demo weekly summary (podes ligar ao /api/market-regime depois)
  const weekly = useMemo(
    () => ({
      updatedAt: "This week · Updated",
      market: "Cautious",
      crypto: "Neutral",
      teaser: "This week rewards selectivity over urgency. Doing less often beats doing more.",
    }),
    []
  );

  // Para já usamos um regime/horizon fixo no Advisor (depois ligamos ao /api/market-regime + user horizon)
  const regime = "Transitional" as const;
  const horizon = "Long" as const;

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
                  <p className="mt-3 text-xs text-ink-500">No noise. Just context.</p>
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
                        You can explore previews. Premium unlocks portfolio saving + planning + Advisor.
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
                <CardHeader
                  title="What SignalCore does"
                  subtitle="A decision layer above brokers. Built to reduce mistakes."
                />

                <ul className="mt-5 space-y-3 text-sm text-ink-700">
                  <li>• Turns context into weekly posture.</li>
                  <li>• Helps structure a plan around your goal.</li>
                  <li>• Trading/Forex mode: playbooks + risk budget (Premium).</li>
                </ul>

                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700">
                    SignalCore doesn’t execute orders. It governs decisions — calmly.
                  </p>
                </div>
              </Card>
            </div>
          )}

          {/* MARKET MAP */}
          {tab === "marketmap" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-canvas-50">
                <CardHeader title="Market Map (preview)" subtitle="Short context (free)." />
                <p className="mt-4 text-sm text-ink-700">
                  “Selectivity over urgency. Keep the plan calm.”
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
                    <CardHeader title="Full Market Map (Premium)" subtitle="This is where the full weekly map lives." />
                    <p className="mt-4 text-sm text-ink-700">
                      Next step: move your real weekly map + archive into this tab.
                    </p>
                  </Card>
                ) : (
                  <PaywallCard
                    title="Full Market Map (Premium)"
                    subtitle="Unlock full weekly map + archive inside the App."
                    cta="Unlock Market Map"
                  />
                )}
              </SignedIn>

              <SignedOut>
                <PaywallCard
                  title="Full Market Map (Premium)"
                  subtitle="Sign in to unlock the full Market Map."
                  cta="Sign in"
                  href="/sign-in"
                />
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
                  <PaywallCard
                    title="Portfolio editing (Premium)"
                    subtitle="Premium unlocks editing + cloud saving."
                    cta="Unlock Portfolio"
                  />
                )}
              </SignedIn>

              <Card className="bg-canvas-50">
                <CardHeader title="Goal-based planning" subtitle="Tell us where you want to get. We keep the path clear." />
                <div className="mt-5 space-y-3 text-sm text-ink-700">
                  <p>• Target: €5,000</p>
                  <p>• Horizon: 3 years</p>
                  <p>• Contribution: monthly range (no promises)</p>
                </div>
                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700">
                    Premium adds planning + weekly checks — the plan stays sane as conditions change.
                  </p>
                </div>
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
                    <CardHeader title="Goal-based planning (Premium)" subtitle="Planning is unlocked." />
                    <p className="mt-4 text-sm text-ink-700">
                      Next step: we plug your planning form + saved plans here.
                    </p>
                  </Card>
                ) : (
                  <PaywallCard
                    title="Goal-based planning (Premium)"
                    subtitle="Unlock planning + coherence checks."
                    cta="Unlock Planning"
                  />
                )}
              </SignedIn>

              <SignedOut>
                <PaywallCard
                  title="Goal-based planning (Premium)"
                  subtitle="Sign in to unlock planning."
                  cta="Sign in"
                  href="/sign-in"
                />
              </SignedOut>
            </div>
          )}

          {/* ADVISOR */}
          {tab === "advisor" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-canvas-50">
                <CardHeader
                  title="Advisor preview"
                  subtitle="Not signals. Not noise. A decision layer."
                />
                <p className="mt-4 text-sm text-ink-700">
                  SignalCore can insinuate “Increase / Hold / Reduce” based on context — and explain it in human language.
                </p>
                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700 italic">
                    “If you started today, you would take less risk — not because of fear, but because the environment punishes urgency.”
                  </p>
                </div>
              </Card>

              <SignedIn>
                {loadingPaid ? (
                  <Card className="bg-canvas-50">
                    <CardHeader title="Advisor" subtitle="Checking access…" />
                    <p className="mt-4 text-sm text-ink-700">Loading…</p>
                  </Card>
                ) : isPaid ? (
                  <SignalCoreAdvisorCard regime={regime} horizon={horizon} />
                ) : (
                  <PaywallCard
                    title="Advisor (Premium)"
                    subtitle="Unlock Advisor: context → action bias → reasons."
                    cta="Unlock Advisor"
                  />
                )}
              </SignedIn>

              <SignedOut>
                <PaywallCard
                  title="Advisor (Premium)"
                  subtitle="Sign in to unlock Advisor."
                  cta="Sign in"
                  href="/sign-in"
                />
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
        active
          ? "bg-ink-900 text-white"
          : "border border-border-soft bg-white text-ink-700 hover:bg-canvas-50",
      ].join(" ")}
      type="button"
    >
      {children}
    </button>
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl border border-border-soft bg-white p-8 shadow-soft ${className}`}>
      {children}
    </div>
  );
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
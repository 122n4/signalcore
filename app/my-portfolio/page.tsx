"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import PremiumGate from "@/components/PremiumGate";
import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";

type TabKey = "portfolio" | "marketmap" | "planning" | "advisor";

export default function MyPortfolioPage() {
  const [tab, setTab] = useState<TabKey>("portfolio");

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-ink-500">SignalCore</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-2 text-sm text-ink-700">
              Everything happens here: portfolio, market map, planning and advisor.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Go to App
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-8 flex flex-wrap gap-2">
          <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")}>
            Portfolio
          </TabButton>
          <TabButton active={tab === "marketmap"} onClick={() => setTab("marketmap")}>
            Market Map
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
          {/* Signed out: only preview + sign in CTA */}
          <SignedOut>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader title="Sign in" subtitle="To unlock your dashboard." />
                <p className="mt-4 text-sm text-ink-700">
                  You can explore previews before subscribing. Sign in to start.
                </p>
                <div className="mt-6">
                  <Link
                    href="/sign-in"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 shadow-soft"
                  >
                    Sign in
                  </Link>
                </div>
              </Card>

              <PortfolioPreview locale="en" />
            </div>
          </SignedOut>

          {/* Signed in: tabs content */}
          <SignedIn>
            {tab === "portfolio" && (
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Preview always visible */}
                <PortfolioPreview locale="en" />

                {/* Editor premium */}
                <PremiumGate
                  title="Portfolio editor (Premium)"
                  subtitle="Editing + cloud saving is included in Premium."
                  ctaText="Unlock Portfolio"
                >
                  <PortfolioEditor locale="en" />
                </PremiumGate>
              </div>
            )}

            {tab === "marketmap" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="bg-canvas-50">
                  <CardHeader
                    title="Market Map preview"
                    subtitle="Short weekly context (free)."
                  />
                  <p className="mt-4 text-sm text-ink-700">
                    This is the short view. Premium unlocks the full map + archive.
                  </p>
                  <div className="mt-6">
                    <Link
                      href="/app"
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                    >
                      Open App
                    </Link>
                  </div>
                </Card>

                <PremiumGate
                  title="Full Market Map (Premium)"
                  subtitle="Full weekly map + archive access."
                  ctaText="Unlock Market Map"
                >
                  <Card>
                    <CardHeader
                      title="Full Market Map"
                      subtitle="Put the full content here (next)."
                    />
                    <p className="mt-4 text-sm text-ink-700">
                      Next step: we move/import your real Market Map content into this tab.
                    </p>
                  </Card>
                </PremiumGate>
              </div>
            )}

            {tab === "planning" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="bg-canvas-50">
                  <CardHeader
                    title="Planning preview"
                    subtitle="How planning works."
                  />
                  <ul className="mt-4 space-y-2 text-sm text-ink-700">
                    <li>• Choose target and horizon</li>
                    <li>• Monthly contribution range</li>
                    <li>• Weekly coherence checks (no urgency)</li>
                  </ul>
                </Card>

                <PremiumGate
                  title="Planning (Premium)"
                  subtitle="Goal-based planning is included in Premium."
                  ctaText="Unlock Planning"
                >
                  <Card>
                    <CardHeader title="Planning unlocked" subtitle="Premium active." />
                    <p className="mt-4 text-sm text-ink-700">
                      Next step: we plug your planning form + saved plans here.
                    </p>
                  </Card>
                </PremiumGate>
              </div>
            )}

            {tab === "advisor" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="bg-canvas-50">
                  <CardHeader
                    title="Advisor preview"
                    subtitle="What you get."
                  />
                  <p className="mt-4 text-sm text-ink-700">
                    Advisor doesn’t tell you what to buy. It checks if your plan still makes sense.
                  </p>
                </Card>

                <PremiumGate
                  title="Advisor (Premium)"
                  subtitle="Advisor is included in Premium."
                  ctaText="Unlock Advisor"
                >
                  <Card>
                    <CardHeader title="Advisor unlocked" subtitle="Premium active." />
                    <p className="mt-4 text-sm text-ink-700">
                      Next step: we connect it to your Market Map + your goal plan.
                    </p>
                  </Card>
                </PremiumGate>
              </div>
            )}
          </SignedIn>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Educational content only. Investing involves risk.
        </p>
      </section>
    </main>
  );
}

/* UI helpers */
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

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
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
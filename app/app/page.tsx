"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";

type TabKey = "overview" | "portfolio" | "advisor";

export default function AppHome() {
  const [tab, setTab] = useState<TabKey>("overview");

  const weekly = useMemo(
    () => ({
      updatedAt: "This week · Updated",
      market: "Cautious",
      crypto: "Neutral",
      teaser:
        "This week rewards selectivity over urgency. Doing less often beats doing more.",
    }),
    []
  );

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
                    Educational context only. No predictions.
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
                  >
                    Activate full weekly view
                  </Link>
                  <Link
                    href="/example"
                    className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                  >
                    See example
                  </Link>
                </div>
              </Card>

              <Card className="bg-canvas-50">
                <CardHeader
                  title="What SignalCore does"
                  subtitle="Built to reduce decisions, not increase them."
                />

                <ul className="mt-5 space-y-3 text-sm text-ink-700">
                  <li>• Turns market context into calm weekly posture.</li>
                  <li>• Helps you structure a plan around your goal.</li>
                  <li>• Checks if your plan still makes sense as conditions change.</li>
                </ul>

                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700">
                    Use any broker. SignalCore doesn’t execute orders. It keeps your plan coherent.
                  </p>
                </div>
              </Card>
            </div>
          )}

          {tab === "portfolio" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <SignedOut>
                <PortfolioPreview locale="en" />
              </SignedOut>

              <SignedIn>
                <PortfolioEditor locale="en" />
              </SignedIn>

              <Card className="bg-canvas-50">
                <CardHeader
                  title="Goal-based planning"
                  subtitle="Tell us where you want to get. We keep the path clear."
                />

                <div className="mt-5 space-y-3 text-sm text-ink-700">
                  <p>• Target: €5,000</p>
                  <p>• Horizon: 3 years</p>
                  <p>• Contribution: calculated monthly (ranges, not promises)</p>
                </div>

                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700">
                    Members get a plan + weekly checks. If conditions change materially,
                    SignalCore “nudges” the plan direction — without urgency.
                  </p>
                </div>

                <div className="mt-6">
                  <Link
                    href="/pricing"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
                  >
                    Unlock planning & Advisor
                  </Link>
                </div>
              </Card>
            </div>
          )}

          {tab === "advisor" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Advisor (members)"
                  subtitle="We don’t tell you what to buy. We keep your plan sane."
                />

                <div className="mt-5 rounded-2xl border border-border-soft bg-canvas-50 p-4">
                  <p className="text-sm text-ink-700 italic">
                    If your goal is to reach €5,000 in 3 years, SignalCore structures a monthly plan and checks
                    if it still makes sense as market conditions evolve.
                  </p>
                </div>

                <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
                  <p className="text-sm text-ink-700">
                    You’ll see: plan alignment, posture shifts, and “if created today” nudges — only when
                    changes are material.
                  </p>
                  <p className="mt-2 text-xs text-ink-500">
                    No signals. No predictions. Just context and discipline.
                  </p>
                </div>

                <div className="mt-6">
                  <Link
                    href="/pricing"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
                  >
                    Activate Advisor
                  </Link>
                </div>
              </Card>

              <Card className="bg-canvas-50">
                <CardHeader
                  title="Why this is different"
                  subtitle="Top brokers execute well. SignalCore helps you decide well."
                />
                <ul className="mt-5 space-y-3 text-sm text-ink-700">
                  <li>• No incentive for you to trade more.</li>
                  <li>• Your plan is the center — not the market noise.</li>
                  <li>• Weekly guidance that reduces emotional decisions.</li>
                </ul>
              </Card>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
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
  children: React.ReactNode;
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
"use client";

import Link from "next/link";
import PremiumGate from "@/components/PremiumGate";
import PortfolioEditor from "@/components/PortfolioEditor";

export default function MyPortfolioPage() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-ink-500">SignalCore</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">My Portfolio</h1>
            <p className="mt-2 text-sm text-ink-700">
              Portfolio editing + saving is Premium.
            </p>
          </div>

          <Link
            href="/app"
            className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            Go to App
          </Link>
        </div>

        <div className="mt-8">
          <PremiumGate
            title="My Portfolio (Premium)"
            subtitle="To edit & save your portfolio, activate Premium."
          >
            <PortfolioEditor locale="en" />
          </PremiumGate>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Educational content only. Investing involves risk.
        </p>
      </section>
    </main>
  );
}
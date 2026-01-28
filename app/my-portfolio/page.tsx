"use client";

import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import PortfolioApp from "@/components/PortfolioApp";

export default function MyPortfolioPage() {
  return (
    <>
      <SignedOut>
        <main className="min-h-screen bg-white text-ink-900">
          <section className="mx-auto max-w-3xl px-6 py-16">
            <p className="text-xs font-semibold text-ink-500">SignalCore</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              My Portfolio
            </h1>
            <p className="mt-3 text-ink-700">
              This area is private. Sign in to build your portfolio and see contextual risk guidance.
            </p>

            <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/sign-in?redirect_url=/my-portfolio"
                  className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-95"
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up?redirect_url=/my-portfolio"
                  className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                >
                  Create account
                </Link>
              </div>
              <p className="mt-4 text-xs text-ink-500">
                Educational content only. No buy/sell signals.
              </p>
            </div>
          </section>
        </main>
      </SignedOut>

      <SignedIn>
        <PortfolioApp locale="en" regime="Transitional" />
      </SignedIn>
    </>
  );
}
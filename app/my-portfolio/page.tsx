"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import PortfolioPreview from "@/components/PortfolioPreview";
import PortfolioEditor from "@/components/PortfolioEditor";

export default function MyPortfolioPage() {
  const [isPaid, setIsPaid] = useState(false);
  const [loadingPaid, setLoadingPaid] = useState(true);

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

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">My Portfolio</h1>
          <Link
            href="/app"
            className="rounded-2xl border border-border-soft px-4 py-2 text-sm font-semibold hover:bg-canvas-50"
          >
            Go to App
          </Link>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <SignedOut>
            <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
              <p className="text-sm text-ink-700">
                Sign in to access your portfolio.
              </p>
              <div className="mt-4">
                <Link
                  href="/sign-in"
                  className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white"
                >
                  Sign in
                </Link>
              </div>
            </div>

            <PortfolioPreview locale="en" />
          </SignedOut>

          <SignedIn>
            {loadingPaid ? (
              <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-soft">
                <p className="text-sm text-ink-700">Checking membership status…</p>
              </div>
            ) : isPaid ? (
              <PortfolioEditor locale="en" />
            ) : (
              <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-soft">
                <p className="text-sm text-ink-700">
                  You’re signed in, but Portfolio editing is locked for free accounts.
                </p>
                <div className="mt-6">
                  <Link
                    href="/pricing"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
                  >
                    Unlock Portfolio
                  </Link>
                </div>
                <p className="mt-3 text-xs text-ink-500">
                  Preview is free. Editing requires Premium.
                </p>
              </div>
            )}

            {/* do lado direito (ou em baixo) mostras sempre preview se quiseres */}
            <PortfolioPreview locale="en" />
          </SignedIn>
        </div>
      </section>
    </main>
  );
}
"use client";

import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { useEffect } from "react";

export default function MarketMapPublicPage() {
  // Se o user está logado, mandamos para o dashboard (tab Market Map)
  // (mantém a organização: ferramentas dentro de my-portfolio)
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-5xl px-6 py-12">
        <SignedIn>
          <RedirectToDashboard />
        </SignedIn>

        <SignedOut>
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Market Map</h1>
          <p className="mt-2 text-sm text-ink-700">
            A weekly, calm view of market context across horizons. This page is a preview.
          </p>

          {/* Preview card */}
          <div className="mt-8 rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-soft">
            <p className="text-xs font-semibold text-ink-500">Preview · This week</p>

            <div className="mt-4 space-y-2 text-sm text-ink-700">
              <p>
                <strong>Short-term:</strong> more noise than direction. Avoid urgency.
              </p>
              <p>
                <strong>Medium-term:</strong> selective. Confirmation is fragile.
              </p>
              <p>
                <strong>Long-term:</strong> consistency beats timing. Keep the plan calm.
              </p>
            </div>

            <p className="mt-5 text-xs text-ink-500">
              Educational context only. No signals. No predictions.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-90 shadow-soft"
              >
                Sign in to use the App
              </Link>

              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                Unlock full Market Map
              </Link>
            </div>
          </div>

          {/* Why it matters */}
          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
            <p className="text-xs font-semibold text-ink-500">Why this matters</p>
            <ul className="mt-4 space-y-2 text-sm text-ink-700">
              <li>• Most people lose money from emotional decisions, not lack of information.</li>
              <li>• Market Map reduces noise and frames risk by horizon.</li>
              <li>• Premium adds full map + archive + portfolio planning.</li>
            </ul>

            <div className="mt-6">
              <Link
                href="/example"
                className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                See example
              </Link>
            </div>
          </div>

          <p className="mt-10 text-xs text-ink-500">
            Educational content only. Investing involves risk.
          </p>
        </SignedOut>
      </section>
    </main>
  );
}

function RedirectToDashboard() {
  useEffect(() => {
    // envia para dashboard; vamos usar query para abrir a tab Market Map
    window.location.href = "/my-portfolio?tab=marketmap";
  }, []);

  return (
    <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
      <p className="text-sm text-ink-700">Redirecting to your dashboard…</p>
    </div>
  );
}
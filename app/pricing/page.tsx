"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";
import { usePaid } from "@/lib/usePaid";

const FOUNDING_TOTAL = 500;

function getFoundingRemainingClient(): number | null {
  // Optional: set NEXT_PUBLIC_FOUNDING_LEFT="312" in .env.local
  // This should be "remaining spots" (e.g., 312 means 312/500 remaining).
  const raw = process.env.NEXT_PUBLIC_FOUNDING_LEFT;
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(FOUNDING_TOTAL, Math.floor(n)));
  return clamped;
}

function StatusChip({ isPaid }: { isPaid: boolean }) {
  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
        isPaid
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-border-soft bg-white text-ink-700",
      ].join(" ")}
    >
      <span className={["h-2 w-2 rounded-full", isPaid ? "bg-emerald-600" : "bg-ink-400"].join(" ")} />
      {isPaid ? "Status: Pro active" : "Status: Free mode"}
    </div>
  );
}

export default function Pricing() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { isPaid, loadingPaid } = usePaid();

  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const foundingRemaining = useMemo(() => getFoundingRemainingClient(), []);

  async function goCheckout() {
    setError(null);
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      setError("Please sign in to continue.");
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress;
    if (!email) {
      setError("We couldn’t find your email address.");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Checkout failed.");
        setLoading(false);
        return;
      }

      if (!data?.url) {
        setError("Checkout URL missing.");
        setLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Checkout failed.");
      setLoading(false);
    }
  }

  async function openCustomerPortal() {
    setError(null);
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      setError("Please sign in to continue.");
      return;
    }

    try {
      setPortalLoading(true);

      const res = await fetch("/api/stripe/customer-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: "/app" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Could not open customer portal.");
        setPortalLoading(false);
        return;
      }

      if (!data?.url) {
        setError("Portal URL missing.");
        setPortalLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch (e: any) {
      setError(e?.message || "Could not open customer portal.");
      setPortalLoading(false);
    }
  }

  const showManage = !loadingPaid && isPaid;

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-5xl px-4 py-16 md:py-20">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold text-ink-500">Pricing</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">One plan. Everything included.</h1>
            <p className="mt-4 text-ink-700">
              SignalCore turns your goal into a professional plan, monitors risk in real time, and tells you the next
              best action — in human language.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-semibold text-ink-700">
                <span className="h-2 w-2 rounded-full bg-signal-700" />
                Founding Members: first {FOUNDING_TOTAL} get <span className="text-ink-900">$19/mo forever</span>
                {foundingRemaining !== null ? (
                  <span className="ml-1 rounded-full border border-border-soft bg-canvas-50 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                    {foundingRemaining}/{FOUNDING_TOTAL} remaining
                  </span>
                ) : (
                  <span className="ml-1 rounded-full border border-border-soft bg-canvas-50 px-2 py-0.5 text-[11px] font-semibold text-ink-700">
                    Limited spots
                  </span>
                )}
              </div>

              {/* Status */}
              {!loadingPaid ? <StatusChip isPaid={isPaid} /> : null}
            </div>

            <div className="mt-6 text-sm text-ink-600">
              Cancel anytime.{" "}
              <span className="text-ink-500">
                See{" "}
                <Link className="underline underline-offset-4" href="/terms">
                  Terms
                </Link>
                ,{" "}
                <Link className="underline underline-offset-4" href="/privacy">
                  Privacy
                </Link>
                ,{" "}
                <Link className="underline underline-offset-4" href="/disclaimer">
                  Disclaimer
                </Link>
                .
              </span>
            </div>
          </div>

          <Link
            href="/"
            className="hidden sm:inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
          >
            ← Home
          </Link>
        </div>

        {/* Main */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Plan card */}
          <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">SignalCore Pro</h2>
                <p className="mt-2 text-sm text-ink-500">
                  Institutional-grade tools — calm, clear, and actionable.
                </p>
              </div>

              <div className="rounded-2xl border border-border-soft bg-canvas-50 px-3 py-1 text-xs font-semibold text-ink-700">
                Best value
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border-soft bg-canvas-50 p-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-ink-500">Standard</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-4xl font-semibold">$29</span>
                    <span className="text-sm text-ink-500">/ month</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-semibold text-ink-700">$290 / year</div>
                  <div className="text-xs text-ink-500">2 months free</div>
                </div>
              </div>

              <div className="mt-4 text-xs text-ink-700">
                <span className="font-semibold">Founding Members:</span> first {FOUNDING_TOTAL} get{" "}
                <span className="font-semibold">$19/mo forever</span>.
              </div>
            </div>

            <ul className="mt-6 space-y-3 text-sm text-ink-700">
              <li>✓ Goal-based Planning (buckets + guardrails)</li>
              <li>✓ Advisor (Next Best Action)</li>
              <li>✓ Risk monitoring + stress testing</li>
              <li>✓ Alerts (drift, breaches, candidates)</li>
              <li>✓ Execution Desk (safe, plan-aware actions)</li>
              <li>✓ Journal (audit trail + rationale)</li>
              <li>✓ Multi-language Copilot guidance</li>
            </ul>

            {/* CTA area */}
            {showManage ? (
              <div className="mt-8 space-y-2">
                <button
                  type="button"
                  onClick={openCustomerPortal}
                  disabled={portalLoading}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft disabled:opacity-60"
                >
                  {portalLoading ? "Opening portal…" : "Manage subscription"}
                </button>

                <Link
                  href="/app"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
                >
                  Go to app
                </Link>
              </div>
            ) : (
              <>
                <button
                  onClick={goCheckout}
                  disabled={loading || loadingPaid}
                  className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft disabled:opacity-60"
                >
                  {loadingPaid ? "Checking membership…" : loading ? "Redirecting…" : "Subscribe"}
                </button>

                {!isSignedIn && (
                  <div className="mt-3 text-center">
                    <SignInButton mode="modal">
                      <button className="text-sm font-semibold text-signal-700 underline underline-offset-4">
                        Sign in to continue
                      </button>
                    </SignInButton>
                  </div>
                )}
              </>
            )}

            {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

            <p className="mt-4 text-center text-xs text-ink-500">
              Educational decision-support tool. Not financial advice. Investing involves risk.
            </p>
          </div>

          {/* Notes card */}
          <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-card">
            <h3 className="text-sm font-semibold">How free mode works</h3>

            <ul className="mt-4 space-y-3 text-sm text-ink-700">
              <li>• Explore the app and build confidence</li>
              <li>• See Copilot summaries and the workflow</li>
              <li>• Upgrade only when you want full execution + alerts</li>
            </ul>

            <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
              <div className="text-xs font-semibold text-ink-500">What unlocks on Pro</div>
              <div className="mt-2 text-sm text-ink-700">
                Execution actions, smart alerts, full risk tooling, and a complete decision journal — all plan-aware.
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border-soft bg-white p-4">
              <div className="text-xs font-semibold text-ink-500">What to do next</div>
              <div className="mt-2 text-sm text-ink-700">
                Go to the app, build your first plan, then upgrade when you’re ready to unlock full execution and alerts.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/app"
                  className="inline-flex items-center justify-center rounded-2xl bg-ink-900 px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Open app
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold text-ink-900 hover:bg-canvas-50"
                >
                  How it works
                </Link>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-border-soft bg-white p-4">
              <div className="text-xs font-semibold text-ink-500">Need details?</div>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <Link className="underline underline-offset-4" href="/why-signalcore">
                  Why SignalCore
                </Link>
                <Link className="underline underline-offset-4" href="/disclaimer">
                  Disclaimer
                </Link>
              </div>
            </div>

            <p className="mt-6 text-xs text-ink-500">
              When you switch Stripe from test to live later, you only change env keys and Stripe dashboard prices — the
              code and endpoints stay the same.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
"use client";

import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { usePaid } from "@/lib/usePaid";

export default function PremiumGate({
  children,
  title = "Premium feature",
  subtitle = "This requires an active subscription.",
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const { isPaid, loadingPaid } = usePaid();

  return (
    <>
      <SignedOut>
        <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-2 text-sm text-ink-700">Sign in to continue.</p>
          <div className="mt-6">
            <Link
              href="/sign-in"
              className="inline-flex w-full items-center justify-center rounded-2xl bg-ink-900 px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
            >
              Sign in
            </Link>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        {loadingPaid ? (
          <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-soft">
            <p className="text-sm text-ink-700">Checking membership…</p>
          </div>
        ) : isPaid ? (
          <>{children}</>
        ) : (
          <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-soft">
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-2 text-sm text-ink-700">{subtitle}</p>
            <div className="mt-6">
              <Link
                href="/pricing"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
              >
                Upgrade to Premium
              </Link>
            </div>
          </div>
        )}
      </SignedIn>
    </>
  );
}
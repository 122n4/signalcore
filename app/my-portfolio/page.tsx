"use client";

import React from "react";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";

import { usePaid } from "@/lib/usePaid";
import PremiumGate from "@/components/PremiumGate";
import PortfolioEditor from "@/components/PortfolioEditor";

type FetchStatus = "idle" | "loading" | "ok" | "error";

function PortfolioEditorPlaceholder() {
  // Placeholder seguro para build (se quiseres usar o PortfolioEditor real, troca em baixo)
  return (
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="text-sm font-semibold text-ink-900">Portfolio Editor</div>
      <div className="mt-2 text-sm text-ink-700">
        This page is legacy. The main experience is now inside <span className="font-semibold">/app</span> tabs.
      </div>
    </div>
  );
}

export default function MyPortfolioPage() {
  const { isSignedIn } = useUser();
  const { isPaid, loadingPaid } = usePaid();

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-ink-900">My Portfolio</div>
            <div className="mt-1 text-xs text-ink-600">
              Legacy route — recommended: use the Portfolio/Planning tabs in the main app.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/app"
              className="rounded-2xl border border-border-soft bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:opacity-95"
            >
              Go to App
            </Link>
            {isSignedIn ? <UserButton afterSignOutUrl="/" /> : null}
          </div>
        </div>

        <div className="mt-4">
          {/* Premium gated content */}
          <PremiumGate
            title="Unlock Portfolio"
            subtitle="Portfolio tools help SignalCore compute drift, risk, and execution packs."
            ctaHref="/pricing"
            ctaText="Upgrade to Pro"
          >
            {/* Se quiseres o editor real aqui, usa: <PortfolioEditor /> */}
            <PortfolioEditorPlaceholder />
          </PremiumGate>

          {/* Pequeno fallback para free */}
          {!loadingPaid && !isPaid ? (
            <div className="mt-4 rounded-3xl border border-border-soft bg-white p-5 text-sm text-ink-700">
              Tip: The best experience is now inside <span className="font-semibold">/app</span> tabs (Daily, Planning,
              Execution, Opportunities).
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
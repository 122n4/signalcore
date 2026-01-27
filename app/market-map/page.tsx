import React from "react";
import { getMarketRegime, type MarketRegimePayload } 
from "../../lib/getMarketRegime";

function Paywall({
  title = "Members-only",
  description = "Unlock the full risk analysis and regime conditions.",
  cta = "Unlock full access",
  href = "/pricing",
  children,
}: {
  title?: string;
  description?: string;
  cta?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mt-8">
      <div className="pointer-events-none select-none blur-sm">{children}</div>

      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-border-soft bg-white/90 p-6 text-center shadow-card backdrop-blur">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-signal-700/10 px-3 py-1 text-xs font-semibold text-signal-800">
            🔒 {title}
          </span>

          <p className="mt-3 text-sm text-ink-700">{description}</p>

          <a
            href={href}
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            {cta}
          </a>

          <p className="mt-3 text-xs text-ink-500">
            Cancel anytime. Early access pricing.
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function MarketMap() {
  const regime: MarketRegimePayload = await getMarketRegime();

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-4 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Weekly Market Map
        </h1>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs text-ink-700">
            {regime.week ?? "This week"}
            {regime.updated_at ? ` · Updated ${regime.updated_at}` : ""}
          </span>
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs text-ink-700">
            Risk-first perspective
          </span>
        </div>

        <p className="mt-6 text-ink-700">
          This weekly Market Map offers a structured view of market conditions — focused on context, risk, and posture.
        </p>

        {/* FREE */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Market Regime</h2>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-sm font-medium text-ink-800">
              {regime.market_regime}
            </span>
            <span className="text-sm text-ink-500">
              Confidence: <strong>{regime.confidence}</strong>
            </span>
          </div>

          <p className="mt-4 text-ink-700">{regime.summary}</p>
        </div>

        {/* PAYWALL */}
        <Paywall
          title="Key Risk Factors"
          description="Members unlock the detailed risk breakdown behind the current regime."
          href="/pricing"
          cta="Unlock full access"
        >
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Key Risk Factors</h2>
            <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
              {regime.key_risks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </Paywall>

        <Paywall
          title="Regime Change Conditions"
          description="See what would actually change the regime — and what to watch for."
          href="/pricing"
          cta="Unlock full access"
        >
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">What Would Change This Regime</h2>
            <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
              {regime.regime_change_triggers.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </Paywall>

        <p className="mt-10 text-xs text-ink-500">
          Educational content only. No signals. No predictions.
        </p>
      </section>
    </main>
  );
}
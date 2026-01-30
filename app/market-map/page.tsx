import React from "react";
import { getMarketRegime, type MarketRegimePayload } from "../../lib/getMarketRegime";

function PaidTeaser({
  href = "/pricing",
  cta = "Unlock clarity (€9/month)",
}: {
  href?: string;
  cta?: string;
}) {
  return (
    <section className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        {/* Left */}
        <div className="md:flex-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-semibold text-ink-700">
            🔒 Members unlock
          </div>

          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            The full Market Map — built for consistency over time
          </h2>

          <p className="mt-2 text-sm text-ink-700">
            The free snapshot tells you where the market is. Members get the context
            that helps you avoid overreacting week-to-week.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Regime history (see how conditions evolved)</li>
            <li>• Change alerts when the regime shifts</li>
            <li>• Short / medium / long-term posture guidance</li>
            <li>• “What changed” notes (fast, human, weekly)</li>
          </ul>
        </div>

        {/* Right (CTA) */}
        <div className="md:w-[340px]">
          <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-card">
            <p className="text-sm font-semibold text-ink-900">Early access</p>
            <p className="mt-1 text-sm text-ink-700">
              Calm, risk-first structure — every week.
            </p>

            <a
              href={href}
              className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              {cta}
            </a>

            <p className="mt-3 text-xs text-ink-500">
              Cancel anytime · No hype · No “buy/sell signals”
            </p>
          </div>
        </div>
      </div>
    </section>
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
          A structured view of market conditions — focused on context, risk, and posture.
        </p>

        {/* ===== FREE SECTION (3 cards) ===== */}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {/* Card 1: Regime */}
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Market Regime</h2>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-sm font-medium text-ink-800">
                {regime.market_regime}
              </span>

              <span className="text-sm text-ink-500">
                Confidence: <strong>{regime.confidence}</strong>
              </span>
            </div>

            <p className="mt-4 text-sm text-ink-700">{regime.summary}</p>
          </div>

          {/* Card 2: Rule */}
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">This week’s rule</h2>
            <p className="mt-3 text-sm text-ink-700">
              In transitional markets, doing less is often the best decision.
            </p>
          </div>

          {/* Card 3: What it means */}
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">What this means for you</h2>

            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li>• If you’re a beginner: your edge is avoiding mistakes, not chasing moves.</li>
              <li>• If you’re already invested: protect decision quality and keep position sizes honest.</li>
              <li>• If you feel urgency: that’s usually your signal to slow down.</li>
            </ul>

            <p className="mt-4 text-sm font-medium text-ink-900">
              Bottom line: this week rewards patience more than activity.
            </p>
          </div>
        </div>

        {/* ===== PAID TEASER (no blur) ===== */}
        <PaidTeaser href="/pricing" cta="Unlock clarity (€9/month)" />

        <p className="mt-10 text-xs text-ink-500">
          Educational content only. No signals. No predictions.
        </p>
      </section>
      {/* What would change the regime? */}
<section className="mt-10 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
  <h2 className="text-lg font-semibold">What would change my mind?</h2>
  <p className="mt-2 text-sm text-ink-700">
    SignalCore changes slowly on purpose. These are the kinds of shifts that matter.
  </p>

  <ul className="mt-4 space-y-2 text-sm text-ink-700">
    <li>• A sustained change in volatility and market stress (not a one-day spike)</li>
    <li>• A consistent shift in cross-asset behavior (risk-on vs risk-off)</li>
    <li>• A clear break in trend structure with confirmation (not a headline move)</li>
  </ul>

  <p className="mt-4 text-xs text-ink-500">
    Educational context only — not signals, not predictions.
  </p>
</section>
    </main>
  );
}
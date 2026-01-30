import React from "react";
import { getMarketRegime, type MarketRegimePayload } from "../lib/getMarketRegime";

export default async function Home() {
  const regime: MarketRegimePayload = await getMarketRegime();

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-14">
        {/* HERO */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
            Clarity when the market doesn’t.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-ink-700 md:text-lg">
            A calm, risk-first view of the market — built to help you decide less, and better.
            <span className="block mt-2 text-ink-600">
              No signals. No predictions. No hype.
            </span>
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/market-map"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              See the Market Map
            </a>

            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Pricing (€9 / month)
            </a>
          </div>
<p className="mt-4 text-sm">
  <a href="/example" className="text-signal-700 underline underline-offset-4">
    See a real example →
  </a>
</p>

          <p className="mt-4 text-xs text-ink-500">
            Educational content only. Context, not triggers.
          </p>
        </div>

        {/* THIS WEEK (FREE SNAPSHOT) */}
        <section className="mx-auto mt-10 max-w-5xl rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="md:flex-1">
              <p className="text-xs font-semibold text-ink-500">This week (free snapshot)</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-sm font-medium text-ink-800">
                  {regime.market_regime}
                </span>

                <span className="text-sm text-ink-500">
                  Confidence: <strong>{regime.confidence}</strong>
                </span>

                <span className="text-xs text-ink-500">
                  {regime.week ? `· ${regime.week}` : ""}
                  {regime.updated_at ? ` · Updated ${regime.updated_at}` : ""}
                </span>
              </div>

              <p className="mt-3 text-sm text-ink-700">{regime.summary}</p>
            </div>

            <div className="md:w-[280px]">
              <a
                href="/market-map"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
              >
                See the full Market Map
              </a>
              <p className="mt-2 text-center text-xs text-ink-500">
                The free snapshot shows the “what”. Members get the “why” + guardrails.
              </p>
            </div>
          </div>
        </section>

        {/* WHAT YOU GET */}
        <section className="mx-auto mt-12 max-w-6xl">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-lg font-semibold">Market Regime</h3>
              <p className="mt-3 text-sm text-ink-700">
                A slow, intentional read of the environment. It doesn’t flip on headlines.
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-lg font-semibold">Horizons (S / M / L)</h3>
              <p className="mt-3 text-sm text-ink-700">
                The same market, read three ways — so you never confuse noise with thesis.
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-lg font-semibold">Your Portfolio in Context</h3>
              <p className="mt-3 text-sm text-ink-700">
                Not green/red. Just: where risk matters most and where patience is an edge.
              </p>
            </div>
          </div>
        </section>

        {/* ANTI-FEATURES */}
        <section className="mx-auto mt-14 max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">
            What SignalCore doesn’t do (on purpose)
          </h2>
          <p className="mt-2 text-sm text-ink-700">
            Most tools optimize for more activity. SignalCore optimizes for better decisions under uncertainty.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-base font-semibold">No triggers</h3>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>• No buy/sell signals</li>
                <li>• No short-term predictions</li>
                <li>• No constant alerts</li>
                <li>• No daily hot takes</li>
              </ul>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-base font-semibold">Just context</h3>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>• A weekly Market Map</li>
                <li>• Horizons that prevent confusion</li>
                <li>• Risk-first guardrails</li>
                <li>• Calm decision-making by design</li>
              </ul>
            </div>
          </div>
        </section>

        {/* WEEKLY RITUAL */}
        <section className="mx-auto mt-14 max-w-6xl rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-semibold tracking-tight">10 minutes. Once a week.</h2>
          <p className="mt-2 text-sm text-ink-700">
            A simple ritual that reduces noise — and helps you avoid reactive decisions.
          </p>

          <ol className="mt-5 space-y-2 text-sm text-ink-700">
            <li>1) Open the Market Map</li>
            <li>2) Check the regime + confidence</li>
            <li>3) Read short / medium / long</li>
            <li>4) Adjust only what is slow and necessary (if anything)</li>
          </ol>

          <p className="mt-4 text-sm text-ink-700">
            If the best decision is to do nothing, SignalCore will say that — clearly.
          </p>
        </section>

        {/* PRINCIPLES */}
        <section className="mx-auto mt-14 max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">Our principles</h2>
          <p className="mt-2 text-sm text-ink-700">How SignalCore thinks about markets.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-base font-semibold">Risk comes first</h3>
              <p className="mt-3 text-sm text-ink-700">
                Markets don’t punish curiosity — they punish ignoring risk.
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-base font-semibold">Context beats prediction</h3>
              <p className="mt-3 text-sm text-ink-700">
                We don’t try to guess. We try to understand the environment we’re in.
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-base font-semibold">Discipline beats emotion</h3>
              <p className="mt-3 text-sm text-ink-700">
                Calm decisions usually outperform impulsive reactions.
              </p>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="mx-auto mt-14 max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">How SignalCore works</h2>

          <div className="mt-4 space-y-3 text-sm text-ink-700">
            <p>
              SignalCore continuously studies market conditions — price action, volatility,
              macro context, and how assets behave together.
            </p>
            <p>
              Instead of reacting to every move, it classifies the current regime and highlights
              the most relevant risks.
            </p>
            <p>
              You get a structured weekly Market Map — designed to reduce noise, not amplify it.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/why-signalcore"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Method
            </a>
            <a
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              How it works
            </a>
          </div>
        </section>

        {/* PRICING CTA */}
        <section className="mx-auto mt-14 max-w-3xl text-center">
          <p className="text-sm font-semibold text-ink-900">Early access</p>
          <div className="mt-2 text-4xl font-semibold tracking-tight">
            €9 <span className="text-base font-medium text-ink-500">/ month</span>
          </div>
          <p className="mt-2 text-sm text-ink-700">One plan. Full access. Early price.</p>

          <div className="mt-6">
            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-8 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              Get early access
            </a>
            <p className="mt-3 text-xs text-ink-500">Price may increase later. Cancel anytime.</p>
          </div>
        </section>

        {/* FOOTER TRUST */}
        <section className="mx-auto mt-14 max-w-3xl text-center">
          <p className="text-xs text-ink-500">
            Educational content only. No signals. No promises. Just context.
          </p>
        </section>
      </section>
    </main>
  );
}
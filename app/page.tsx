export default function Home() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      {/* HERO */}
      <section className="mx-auto max-w-4xl px-4 py-24 text-center">
        <p className="text-xs font-semibold text-ink-500">
          SignalCore
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Investing doesn’t need to be confusing.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-700">
          SignalCore is a calm, risk-first perspective on the market.
          Built for people who want clarity — not noise.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="/pricing"
            className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            Get early access
          </a>

          <span className="text-sm text-ink-500">
            €9 / month · Early access price
          </span>
        </div>
      </section>

      {/* VALUE */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h3 className="font-semibold">
              A clear market regime
            </h3>
            <p className="mt-3 text-sm text-ink-700">
              Understand whether the market is risk-on, risk-off, or in transition —
              without predictions.
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h3 className="font-semibold">
              Risk-first thinking
            </h3>
            <p className="mt-3 text-sm text-ink-700">
              Focus on what can go wrong, what matters most, and what would
              change the current environment.
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h3 className="font-semibold">
              Built for consistency
            </h3>
            <p className="mt-3 text-sm text-ink-700">
              A weekly perspective designed to help you stay disciplined
              when markets feel noisy.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20">
  <h2 className="text-2xl font-semibold tracking-tight">
    Our principles
  </h2>

  <p className="mt-2 text-sm text-ink-500">
    How SignalCore thinks about markets
  </p>

  <div className="mt-10 grid gap-6 md:grid-cols-3">
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <h3 className="font-semibold">Risk comes first</h3>
      <p className="mt-3 text-sm text-ink-700">
        Markets don’t fail because people miss opportunities.
        They fail because people underestimate risk.
      </p>
    </div>

    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <h3 className="font-semibold">Context over prediction</h3>
      <p className="mt-3 text-sm text-ink-700">
        We don’t try to guess what happens next.
        We focus on understanding the environment we are in.
      </p>
    </div>

    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <h3 className="font-semibold">Discipline beats emotion</h3>
      <p className="mt-3 text-sm text-ink-700">
        Consistency matters more than conviction.
        Calm decisions outperform reactive ones.
      </p>
    </div>
  </div>
</section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-4xl px-4 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          How SignalCore works
        </h2>

        <div className="mt-8 space-y-6">
          <p className="text-ink-700">
            SignalCore continuously studies market conditions — price action,
            volatility, macro context and cross-asset behavior.
          </p>

          <p className="text-ink-700">
            Instead of reacting to every move, it classifies the current market
            regime and highlights the risks that matter most.
          </p>

          <p className="text-ink-700">
            You get a structured weekly Market Map — designed to reduce noise,
            not increase it.
          </p>
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
          <p className="text-sm text-ink-500">
            Early access
          </p>

          <p className="mt-3 text-4xl font-semibold">
            €9 <span className="text-base font-normal text-ink-500">/ month</span>
          </p>

          <p className="mt-4 text-sm text-ink-700">
            One plan. Full access. Early-stage pricing.
          </p>

          <a
            href="/pricing"
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            Get early access
          </a>

          <p className="mt-3 text-xs text-ink-500">
            Price will increase in the future. Cancel anytime.
          </p>
        </div>
      </section>

      {/* FOOTER NOTE */}
      <p className="pb-10 text-center text-xs text-ink-500">
        Educational content only. No signals. No predictions.
      </p>
    </main>
  );
}
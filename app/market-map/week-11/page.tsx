export default function MarketMapWeek11() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <header className="sticky top-0 z-50 border-b border-border-soft bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-2xl bg-ink-900" />
            <span className="font-semibold">SignalCore</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm text-ink-700 md:flex">
            <a className="hover:text-ink-900" href="/how-it-works">
              How it works
            </a>
            <a className="hover:text-ink-900" href="/market-map">
              Market Map
            </a>
            <a className="hover:text-ink-900" href="/market-map/archive">
              Archive
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="/pt/market-map/week-11"
              className="hidden rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-canvas-50 md:inline-flex"
            >
              PT
            </a>
            <a
              href="/#pricing"
              className="rounded-2xl bg-signal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Unlock full access
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Weekly Market Map
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700">
            Week 11 · Archived edition
          </span>
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700">
            Risk-first perspective
          </span>
          <a
            href="/market-map/archive"
            className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-canvas-50"
          >
            Back to archive
          </a>
        </div>

        <p className="mt-6 text-ink-700">
          A shorter edition from the weekly series — focused on context, risk, and posture.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Market state</h2>
          <p className="mt-2 text-ink-700">
            The market remained <span className="font-semibold">range-bound and sensitive</span> to headlines.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-700">
            <li>Volatility was uneven across sectors</li>
            <li>Risk appetite improved briefly, then faded</li>
            <li>Liquidity remained selective</li>
          </ul>
        </div>

        <div className="mt-4 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">What changed</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-700">
            <li>Short-term momentum strengthened in a few pockets</li>
            <li>Defensive positioning softened slightly</li>
          </ul>
          <p className="mt-4 text-ink-700">
            The shift was not broad — it required selectivity.
          </p>
        </div>

        <div className="mt-4 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Risk watch</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-700">
            <li>Headline reversals</li>
            <li>False breakouts in low liquidity</li>
            <li>Overconfidence after short rallies</li>
          </ul>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight">Time horizons</h2>
          <p className="mt-2 text-ink-500">Posture by horizon — kept separate.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="text-sm font-semibold">Short-term</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Posture:</strong> Selective, avoid chasing
              </p>
            </div>
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="text-sm font-semibold">Medium-term</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Posture:</strong> Constructive, wait for confirmation
              </p>
            </div>
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="text-sm font-semibold">Long-term</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Posture:</strong> Patient, focus on structure
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">What we’re not doing</h2>
          <p className="mt-2 text-ink-700">Avoiding impulsive risk increases after short-term moves.</p>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">Members-only note</h2>
            <span className="rounded-full bg-signal-700/10 px-3 py-1 text-xs font-semibold text-signal-800 border border-border-soft">
              🔒 Members
            </span>
          </div>
          <p className="mt-4 text-ink-700">
            Members unlock detailed scenarios, risk management, portfolio structure guidance, and the full archive.
          </p>
          <a
            href="/#pricing"
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            Unlock full access
          </a>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Educational content only. Investing involves risk. No signals. No predictions.
        </p>
      </section>
    </main>
  );
}
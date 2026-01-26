export default function MarketMapArchive() {
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
            <a className="hover:text-ink-900" href="/#pricing">
              Pricing
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="/pt/market-map/archive"
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
          Weekly Market Map — Archive
        </h1>

        <p className="mt-4 text-ink-700">
          A simple weekly series. Each edition captures market context, risk, and posture — without noise.
        </p>

        <div className="mt-10 grid gap-4">
          <a
            href="/market-map"
            className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft hover:bg-canvas-50 transition"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Week 12</p>
                <p className="mt-1 text-sm text-ink-500">Updated Monday · Current edition</p>
              </div>
              <span className="rounded-full bg-signal-700/10 px-3 py-1 text-xs font-semibold text-signal-800 border border-border-soft">
                Current
              </span>
            </div>
          </a>

          <a
            href="/market-map/week-11"
            className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft hover:bg-canvas-50 transition"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Week 11</p>
                <p className="mt-1 text-sm text-ink-500">Archived edition</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-700 border border-border-soft">
                Archived
              </span>
            </div>
          </a>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Educational content only. Investing involves risk. No signals. No predictions.
        </p>
      </section>
    </main>
  );
}
export default function NotForYou() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          SignalCore is not for everyone
        </h1>

        <p className="mt-4 text-base text-ink-700">
          This is intentional. SignalCore is built to reduce noise and protect decision quality —
          not to maximize activity.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">It’s not for you if you want…</h2>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Buy/sell signals or “entries”</li>
            <li>• Short-term predictions</li>
            <li>• Constant alerts and notifications</li>
            <li>• A product you check every day</li>
            <li>• Certainty and quick answers</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">It is for you if you value…</h2>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• A weekly ritual, not a daily feed</li>
            <li>• Risk-first thinking</li>
            <li>• Clear horizons (short / medium / long)</li>
            <li>• Fewer decisions — made with better context</li>
            <li>• Calm, disciplined investing</li>
          </ul>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold">Want to see it in practice?</h2>
          <p className="mt-2 text-sm text-ink-700">
            Start with a real example, then set up your weekly ritual in 5 minutes.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/example"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              See an example
            </a>

            <a
              href="/start"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Start (5 min)
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-500">
            Educational content only · No signals · No predictions
          </p>
        </div>
      </section>
    </main>
  );
}
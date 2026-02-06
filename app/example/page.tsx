export default function ExamplePage() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore · Example</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          A real example — what SignalCore means by “context”
        </h1>

        {/* Rule of the week */}
        <p className="mt-4 text-sm italic text-ink-500">
          <strong>Rule of the week:</strong> If you feel urgency, slow down.
        </p>

        <p className="mt-6 text-base text-ink-700">
          This page shows the kind of weekly clarity SignalCore provides: a simple market regime read,
          horizon separation, and calm guardrails — without signals or predictions.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">This week (example)</h2>
          <p className="mt-2 text-sm text-ink-700">
            Market conditions are mixed. Volatility remains elevated and momentum is fragile — the market
            is searching for direction rather than committing to one.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Short-term</p>
              <p className="mt-2 text-sm text-ink-700">
                More noise than direction. Avoid impulsive changes.
              </p>
            </div>

            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Medium-term</p>
              <p className="mt-2 text-sm text-ink-700">
                Selective. Confirmation is fragile — keep expectations realistic.
              </p>
            </div>

            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Long-term</p>
              <p className="mt-2 text-sm text-ink-700">
                Constructive. Transitions often prepare the next cycle — consistency wins.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">Guardrails (the point)</h2>
          <p className="mt-2 text-sm text-ink-700">
            Not “what to buy”. Just what tends to protect decision quality in this environment.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Keep actions slow and deliberate</li>
            <li>• Avoid chasing short moves out of urgency</li>
            <li>• Prioritize position sizing over “timing”</li>
            <li>• If you feel urgency, that’s usually the signal to slow down</li>
          </ul>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold">Want this every week?</h2>
          <p className="mt-2 text-sm text-ink-700">
            Full access includes the complete weekly Market Map, horizon posture, and member-only context.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/market-map"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Explore the Market Map
            </a>

            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Get early access (€9 / month)
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
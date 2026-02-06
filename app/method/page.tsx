export default function Method() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore · Method</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Method — how SignalCore thinks
        </h1>

        <p className="mt-4 text-base text-ink-700">
          SignalCore is not a prediction engine. It’s a structured way to read market context,
          separate time horizons, and reduce reactive decision-making.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">What we look at</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Price action and trend structure (context, not targets)</li>
            <li>• Volatility and drawdown sensitivity</li>
            <li>• Cross-asset behavior (how things move together)</li>
            <li>• Macro context as a pressure system (not as a headline feed)</li>
            <li>• Market participation/breadth (when relevant)</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">How regimes are classified</h2>
          <p className="mt-2 text-sm text-ink-700">
            Regimes are deliberately slow to change. SignalCore prioritizes stability over responsiveness.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• A regime is a description of the environment (not a trade idea)</li>
            <li>• It doesn’t flip because of a single move or a single news item</li>
            <li>• Changes require consistent confirmation across multiple dimensions</li>
            <li>• Low confidence means “be humble”, not “act faster”</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Time horizons (on purpose)</h2>
          <p className="mt-2 text-sm text-ink-700">
            Most mistakes come from mixing horizons. SignalCore keeps them separate:
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Short-term: more noise and traps — be selective</li>
            <li>• Medium-term: wait for confirmation — avoid misreads</li>
            <li>• Long-term: focus on structure — avoid unnecessary churn</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">What SignalCore will never do</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Provide buy/sell signals</li>
            <li>• Promise returns</li>
            <li>• Pretend uncertainty can be removed</li>
            <li>• Optimize for constant checking</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">How to use it</h2>
          <ol className="mt-4 space-y-2 text-sm text-ink-700">
            <li>1) Check the Market Map once a week</li>
            <li>2) Read horizons (S / M / L) separately</li>
            <li>3) Apply guardrails: act slowly, avoid urgency</li>
            <li>4) Update your portfolio only when change is necessary</li>
          </ol>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/example"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              See a real example
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
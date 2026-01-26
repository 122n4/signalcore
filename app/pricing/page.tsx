export default function Pricing() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-4xl px-4 py-20">
        <p className="text-xs font-semibold text-ink-500">Pricing</p>

        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Simple pricing. Early access.
        </h1>

        <p className="mt-4 max-w-2xl text-ink-700">
          SignalCore is in its early stage. This price reflects early access
          for people who want to build a long-term perspective from the start.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {/* Plan */}
          <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
            <h2 className="text-lg font-semibold">
              SignalCore — Full Access
            </h2>

            <p className="mt-2 text-sm text-ink-500">
              Early access price
            </p>

            <div className="mt-6 flex items-baseline gap-2">
              <span className="text-4xl font-semibold">€9</span>
              <span className="text-sm text-ink-500">/ month</span>
            </div>

            <ul className="mt-6 space-y-3 text-sm text-ink-700">
              <li>✓ Weekly Market Map</li>
              <li>✓ Full archive access</li>
              <li>✓ Short, medium & long-term horizons</li>
              <li>✓ Risk-first market perspective</li>
              <li>✓ Continuous updates</li>
            </ul>

            <a
              href="#"
              className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Get early access
            </a>

            <p className="mt-4 text-xs text-ink-500 text-center">
              Price will increase in the future. Cancel anytime.
            </p>
          </div>

          {/* Notes */}
          <div className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-card">
            <h3 className="text-sm font-semibold">
              Who this is for
            </h3>

            <ul className="mt-4 space-y-3 text-sm text-ink-700">
              <li>• People who want clarity, not noise</li>
              <li>• Beginners who don’t want to study for hours</li>
              <li>• Investors focused on risk and consistency</li>
              <li>• Long-term thinkers</li>
            </ul>

            <p className="mt-6 text-sm text-ink-700">
              SignalCore is not about signals or predictions.
              It’s about thinking clearly and acting with discipline.
            </p>
          </div>
        </div>

        <p className="mt-12 text-xs text-ink-500">
          Educational content only. Investing involves risk.
        </p>
      </section>
    </main>
  );
}
export default function WhySignalCore() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-4 py-20">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Why SignalCore exists
        </h1>

        <p className="mt-6 text-lg text-ink-700">
          Markets today are loud, emotional, and overwhelming — especially for
          people who are just starting.
        </p>

        <p className="mt-4 text-ink-700">
          Most content pushes you to react faster, predict better, or follow
          someone else’s conviction. SignalCore was built as a response to that.
        </p>

        {/* THE PROBLEM */}
        <div className="mt-14">
          <h2 className="text-2xl font-semibold">The problem</h2>

          <p className="mt-4 text-ink-700">
            Beginners don’t lack information. They lack structure.
          </p>

          <p className="mt-3 text-ink-700">
            Charts, opinions, alerts, and predictions create the illusion of
            control — but often lead to anxiety, overtrading, and inconsistency.
          </p>
        </div>

        {/* THE WRONG APPROACH */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold">The common mistake</h2>

          <p className="mt-4 text-ink-700">
            Most people search for answers to questions like:
          </p>

          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>What should I buy?</li>
            <li>When should I sell?</li>
            <li>What will the market do next?</li>
          </ul>

          <p className="mt-4 text-ink-700">
            These questions assume the future can be predicted.
            SignalCore assumes it cannot.
          </p>
        </div>

        {/* SIGNALCORE APPROACH */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold">The SignalCore approach</h2>

          <p className="mt-4 text-ink-700">
            SignalCore does not try to predict markets.
            It classifies the environment.
          </p>

          <p className="mt-3 text-ink-700">
            Instead of asking “what will happen?”, it asks:
          </p>

          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>What regime are we in?</li>
            <li>Where are the risks?</li>
            <li>What would change this picture?</li>
          </ul>
        </div>

        {/* FOR WHO */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold">Who SignalCore is for</h2>

          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>People who want clarity, not constant alerts</li>
            <li>Beginners who don’t want to study markets for hours every day</li>
            <li>Investors focused on risk and consistency</li>
            <li>Long-term thinkers</li>
          </ul>
        </div>

        {/* NOT FOR */}
        <div className="mt-10">
          <h2 className="text-2xl font-semibold">Who it is not for</h2>

          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>People looking for trading signals</li>
            <li>Anyone chasing fast profits</li>
            <li>Those who want certainty in uncertain markets</li>
          </ul>
        </div>

        {/* HOW AI THINKS */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold">How SignalCore thinks</h2>

          <p className="mt-4 text-ink-700">
            SignalCore uses an AI system designed to think like a calm,
            risk-aware analyst — not a prediction engine.
          </p>

          <p className="mt-3 text-ink-700">
            It studies the market continuously, but only communicates when
            something meaningful changes.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-16 rounded-3xl border border-border-soft bg-white p-8 text-center shadow-soft">
          <p className="text-sm text-ink-500">Early access</p>

          <p className="mt-2 text-3xl font-semibold">
            €9 <span className="text-base font-normal text-ink-500">/ month</span>
          </p>

          <p className="mt-4 text-sm text-ink-700">
            One plan. Full access. Early-stage pricing.
          </p>

          <a
            href="/pricing"
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            Get early access
          </a>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Educational content only. No signals. No predictions.
        </p>
      </section>
    </main>
  );
}
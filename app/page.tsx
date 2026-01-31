export default function Home() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
            Weekly market guidance.
            <br />
            Nothing more. Nothing less.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-ink-700 md:text-lg">
            A calm, advisor-style view of markets — so you know how the environment looks before you act.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/sign-up"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              Join SignalCore
            </a>

            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Pricing
            </a>
          </div>

          <p className="mt-5 text-sm">
            <a href="/example" className="text-signal-700 underline underline-offset-4">
              See a real example →
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
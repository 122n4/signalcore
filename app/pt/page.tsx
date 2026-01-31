export default function HomePT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
            Orientação semanal de mercado.
            <br />
            Nada mais. Nada menos.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-ink-700 md:text-lg">
            Uma visão calma, ao estilo de um conselheiro, para perceberes o
            ambiente do mercado antes de agir.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/pt/sign-up"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              Criar conta
            </a>

            <a
              href="/pt/pricing"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Preço
            </a>
          </div>

          <p className="mt-5 text-sm">
            <a
              href="/pt/example"
              className="text-signal-700 underline underline-offset-4"
            >
              Ver um exemplo real →
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
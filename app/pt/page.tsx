export default function HomePT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      {/* HERO */}
      <section className="mx-auto max-w-4xl px-4 py-24 text-center">
        <p className="text-xs font-semibold text-ink-500">
          SignalCore
        </p>

        <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          Investir não precisa de ser confuso.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-700">
          O SignalCore oferece uma perspetiva calma e focada no risco.
          Criado para quem procura clareza — não ruído.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <a
            href="/pt/pricing"
            className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            Obter acesso antecipado
          </a>

          <span className="text-sm text-ink-500">
            €9 / mês · Preço de acesso antecipado
          </span>
        </div>
      </section>

      {/* VALUE */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h3 className="font-semibold">
              Regime de mercado claro
            </h3>
            <p className="mt-3 text-sm text-ink-700">
              Percebe se o mercado está em risk-on, risk-off ou transição —
              sem previsões.
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h3 className="font-semibold">
              Pensamento focado no risco
            </h3>
            <p className="mt-3 text-sm text-ink-700">
              Foco no que pode correr mal, no que realmente importa
              e no que mudaria o contexto atual.
            </p>
          </div>

          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h3 className="font-semibold">
              Criado para consistência
            </h3>
            <p className="mt-3 text-sm text-ink-700">
              Uma visão semanal pensada para manter disciplina
              quando o mercado parece confuso.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-20">
  <h2 className="text-2xl font-semibold tracking-tight">
    Os nossos princípios
  </h2>

  <p className="mt-2 text-sm text-ink-500">
    Como o SignalCore pensa sobre os mercados
  </p>

  <div className="mt-10 grid gap-6 md:grid-cols-3">
    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <h3 className="font-semibold">O risco vem primeiro</h3>
      <p className="mt-3 text-sm text-ink-700">
        Os mercados não falham porque as pessoas perdem oportunidades.
        Falham porque subestimam o risco.
      </p>
    </div>

    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <h3 className="font-semibold">Contexto acima de previsão</h3>
      <p className="mt-3 text-sm text-ink-700">
        Não tentamos adivinhar o que vai acontecer.
        Tentamos compreender o ambiente em que estamos.
      </p>
    </div>

    <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <h3 className="font-semibold">Disciplina vence a emoção</h3>
      <p className="mt-3 text-sm text-ink-700">
        A consistência é mais importante do que a convicção.
        Decisões calmas superam reações impulsivas.
      </p>
    </div>
  </div>
</section>

      {/* COMO FUNCIONA */}
      <section className="mx-auto max-w-4xl px-4 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">
          Como funciona o SignalCore
        </h2>

        <div className="mt-8 space-y-6">
          <p className="text-ink-700">
            O SignalCore analisa continuamente as condições do mercado —
            ação do preço, volatilidade, contexto macro e comportamento entre ativos.
          </p>

          <p className="text-ink-700">
            Em vez de reagir a cada movimento, classifica o regime atual
            e destaca os riscos mais relevantes.
          </p>

          <p className="text-ink-700">
            Recebes uma Market Map semanal estruturada —
            desenhada para reduzir ruído, não para o amplificar.
          </p>
        </div>
      </section>

      {/* PREÇO */}
      <section className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
          <p className="text-sm text-ink-500">
            Acesso antecipado
          </p>

          <p className="mt-3 text-4xl font-semibold">
            €9 <span className="text-base font-normal text-ink-500">/ mês</span>
          </p>

          <p className="mt-4 text-sm text-ink-700">
            Um plano. Acesso completo. Preço inicial.
          </p>

          <a
            href="/pt/pricing"
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            Obter acesso antecipado
          </a>

          <p className="mt-3 text-xs text-ink-500">
            O preço irá aumentar no futuro. Cancela quando quiseres.
          </p>
        </div>
      </section>

      {/* FOOTER NOTE */}
      <p className="pb-10 text-center text-xs text-ink-500">
        Conteúdo educativo. Sem sinais. Sem previsões.
      </p>
    </main>
  );
}
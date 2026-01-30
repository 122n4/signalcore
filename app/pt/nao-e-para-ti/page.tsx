export default function NaoEParaTi() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          O SignalCore não é para toda a gente
        </h1>

        <p className="mt-4 text-base text-ink-700">
          Isto é intencional. O SignalCore foi feito para reduzir ruído e proteger a qualidade da decisão —
          não para maximizar atividade.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Não é para ti se procuras…</h2>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Sinais de compra/venda ou “entradas”</li>
            <li>• Previsões de curto prazo</li>
            <li>• Alertas e notificações constantes</li>
            <li>• Um produto para abrir todos os dias</li>
            <li>• Certezas e respostas rápidas</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">É para ti se valorizas…</h2>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Um ritual semanal, não um feed diário</li>
            <li>• Pensamento orientado ao risco</li>
            <li>• Horizontes claros (curto / médio / longo)</li>
            <li>• Menos decisões — com melhor contexto</li>
            <li>• Investir com calma e disciplina</li>
          </ul>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold">Queres ver isto na prática?</h2>
          <p className="mt-2 text-sm text-ink-700">
            Começa por um exemplo real e depois faz o setup do ritual semanal em 5 minutos.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/pt/example"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Ver um exemplo
            </a>

            <a
              href="/pt/start"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Começar (5 min)
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-500">
            Conteúdo educativo · Sem sinais · Sem previsões
          </p>
        </div>
      </section>
    </main>
  );
}
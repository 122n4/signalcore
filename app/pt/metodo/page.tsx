export default function Metodo() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore · Método</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Método — como o SignalCore pensa
        </h1>

        <p className="mt-4 text-base text-ink-700">
          O SignalCore não é um motor de previsões. É uma forma estruturada de ler contexto,
          separar horizontes e reduzir decisões reativas.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">O que observamos</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Ação do preço e estrutura de tendência (contexto, não alvos)</li>
            <li>• Volatilidade e sensibilidade a drawdowns</li>
            <li>• Comportamento cross-asset (como os ativos se movem juntos)</li>
            <li>• Contexto macro como “sistema de pressão” (não como feed de notícias)</li>
            <li>• Participação/breadth (quando relevante)</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">Como classificamos regimes</h2>
          <p className="mt-2 text-sm text-ink-700">
            Os regimes mudam devagar, de propósito. O SignalCore privilegia estabilidade em vez de reatividade.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Um regime descreve o ambiente (não é uma ideia de trade)</li>
            <li>• Não muda por um único movimento nem por uma notícia</li>
            <li>• Mudanças exigem confirmação consistente em várias dimensões</li>
            <li>• Confiança baixa significa “humildade”, não “agir mais depressa”</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Horizontes (de propósito)</h2>
          <p className="mt-2 text-sm text-ink-700">
            Muitos erros vêm de misturar horizontes. O SignalCore separa:
          </p>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Curto prazo: mais ruído e armadilhas — sê seletivo</li>
            <li>• Médio prazo: espera confirmação — evita leituras erradas</li>
            <li>• Longo prazo: foco na estrutura — evita churn desnecessário</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">O que o SignalCore nunca fará</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Dar sinais de compra/venda</li>
            <li>• Prometer retornos</li>
            <li>• Fingir que remove incerteza</li>
            <li>• Otimizar para check constante</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Como usar</h2>
          <ol className="mt-4 space-y-2 text-sm text-ink-700">
            <li>1) Ver o Market Map 1 vez por semana</li>
            <li>2) Ler horizontes (curto / médio / longo) separadamente</li>
            <li>3) Aplicar guardrails: agir devagar, evitar urgência</li>
            <li>4) Ajustar o portefólio apenas quando for necessário</li>
          </ol>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/pt/example"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Ver um exemplo real
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
export default function ExamplePagePT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore · Exemplo</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Um exemplo real — o que o SignalCore quer dizer com “contexto”
        </h1>

        {/* Regra da semana */}
        <p className="mt-4 text-sm italic text-ink-500">
          <strong>Regra da semana:</strong> Se sentires urgência, abranda.
        </p>

        <p className="mt-6 text-base text-ink-700">
          Esta página mostra o tipo de clareza semanal que o SignalCore oferece: leitura simples do regime,
          separação por horizontes e guardrails calmos — sem sinais nem previsões.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Esta semana (exemplo)</h2>
          <p className="mt-2 text-sm text-ink-700">
            As condições continuam mistas. A volatilidade mantém-se elevada e o momentum está frágil — o mercado
            procura direção em vez de se comprometer com uma tendência clara.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Curto prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                Mais ruído do que direção. Evita mudanças impulsivas.
              </p>
            </div>

            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Médio prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                Seletivo. Confirmações são frágeis — mantém expectativas realistas.
              </p>
            </div>

            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Longo prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                Construtivo. Transições preparam o próximo ciclo — consistência vence.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">Guardrails (o ponto)</h2>
          <p className="mt-2 text-sm text-ink-700">
            Não é “o que comprar”. É o que tende a proteger a qualidade da decisão neste ambiente.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Mantém ações lentas e deliberadas</li>
            <li>• Evita perseguir movimentos por urgência</li>
            <li>• Prioriza tamanho de posição em vez de “timing”</li>
            <li>• Se sentires urgência, normalmente é sinal para abrandar</li>
          </ul>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold">Queres isto todas as semanas?</h2>
          <p className="mt-2 text-sm text-ink-700">
            O acesso completo inclui o Market Map semanal completo, postura por horizonte e contexto para membros.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/pt/market-map"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Explorar o Market Map
            </a>

            <a
              href="/pt/pricing"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Acesso antecipado (€9 / mês)
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
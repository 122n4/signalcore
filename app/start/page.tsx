export default function StartPT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore · Começar</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Um setup de 5 minutos para investir com mais calma
        </h1>

        <p className="mt-4 text-base text-ink-700">
          O SignalCore funciona melhor como ritual semanal. Este setup ajuda-te a usá-lo sem ruído,
          alertas ou check constante.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <p className="text-sm font-semibold text-ink-500">Passo 1</p>
          <h2 className="mt-2 text-lg font-semibold">Escolhe o teu horizonte principal</h2>
          <p className="mt-2 text-sm text-ink-700">
            O mesmo mercado parece diferente conforme o horizonte. Escolhe o que queres proteger.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Curto prazo</p>
              <p className="mt-2 text-sm text-ink-700">Mais ruído. Mais armadilhas. Sê seletivo.</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Médio prazo</p>
              <p className="mt-2 text-sm text-ink-700">Espera confirmação. Evita leituras erradas.</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">Longo prazo</p>
              <p className="mt-2 text-sm text-ink-700">Foco na estrutura. Evita churn.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <p className="text-sm font-semibold text-ink-500">Passo 2</p>
          <h2 className="mt-2 text-lg font-semibold">Adiciona 3–5 ativos que tens (ou queres ter)</h2>
          <p className="mt-2 text-sm text-ink-700">
            Mantém simples. O SignalCore não é um terminal — é contexto para as tuas decisões reais.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <a
              href="/pt/my-portfolio"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Ir para o Meu Portefólio
            </a>
            <a
              href="/pt/example"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Ver um exemplo primeiro
            </a>
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <p className="text-sm font-semibold text-ink-500">Passo 3</p>
          <h2 className="mt-2 text-lg font-semibold">Usa o ritual semanal</h2>

          <ol className="mt-4 space-y-2 text-sm text-ink-700">
            <li>1) Abrir o Market Map</li>
            <li>2) Ver regime + confiança</li>
            <li>3) Ler curto / médio / longo</li>
            <li>4) Ajustar só o que for lento e necessário (se for preciso)</li>
          </ol>

          <p className="mt-4 text-sm text-ink-700">
            Se sentires urgência, normalmente é sinal para abrandar.
          </p>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold">Pronto?</h2>
          <p className="mt-2 text-sm text-ink-700">
            Começa pelo Market Map, depois adiciona ativos — e volta 1 vez por semana.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/pt/market-map"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Abrir o Market Map
            </a>
            <a
              href="/pt/pricing"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Acesso antecipado (€9 / mês)
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-500">Conteúdo educativo · Sem sinais · Sem previsões</p>
        </div>
      </section>
    </main>
  );
}
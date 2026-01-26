export default function MarketMapWeek11PT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      <header className="sticky top-0 z-50 border-b border-border-soft bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/pt" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-2xl bg-ink-900" />
            <span className="font-semibold">SignalCore</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm text-ink-700 md:flex">
            <a className="hover:text-ink-900" href="/pt/how-it-works">
              Como funciona
            </a>
            <a className="hover:text-ink-900" href="/pt/market-map">
              Market Map
            </a>
            <a className="hover:text-ink-900" href="/pt/market-map/archive">
              Arquivo
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="/market-map/week-11"
              className="hidden rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-canvas-50 md:inline-flex"
            >
              EN
            </a>
            <a
              href="/#pricing"
              className="rounded-2xl bg-signal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              Desbloquear acesso
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Weekly Market Map
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700">
            Semana 11 · Edição arquivada
          </span>
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700">
            Perspetiva focada no risco
          </span>
          <a
            href="/pt/market-map/archive"
            className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-canvas-50"
          >
            Voltar ao arquivo
          </a>
        </div>

        <p className="mt-6 text-ink-700">
          Edição mais curta do arquivo semanal — focada em contexto, risco e postura.
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Estado do mercado</h2>
          <p className="mt-2 text-ink-700">
            O mercado manteve-se <span className="font-semibold">lateral e sensível</span> a notícias.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-700">
            <li>Volatilidade irregular entre setores</li>
            <li>Apetite ao risco melhorou brevemente e depois perdeu força</li>
            <li>Liquidez continuou seletiva</li>
          </ul>
        </div>

        <div className="mt-4 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">O que mudou</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-700">
            <li>Momentum de curto prazo fortaleceu em alguns pontos</li>
            <li>Posicionamento defensivo suavizou ligeiramente</li>
          </ul>
          <p className="mt-4 text-ink-700">
            A mudança não foi ampla — exigiu seletividade.
          </p>
        </div>

        <div className="mt-4 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Riscos em foco</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-ink-700">
            <li>Reversões rápidas por notícias</li>
            <li>Falsos rompimentos com baixa liquidez</li>
            <li>Excesso de confiança após rallies curtos</li>
          </ul>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-semibold tracking-tight">Horizontes temporais</h2>
          <p className="mt-2 text-ink-500">Postura por horizonte — sem misturar prazos.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="text-sm font-semibold">Curto prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Postura:</strong> Seletiva, evitar perseguir
              </p>
            </div>
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="text-sm font-semibold">Médio prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Postura:</strong> Construtiva, esperar confirmação
              </p>
            </div>
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="text-sm font-semibold">Longo prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Postura:</strong> Paciente, foco na estrutura
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">O que não estamos a fazer</h2>
          <p className="mt-2 text-ink-700">
            Evitar aumentos impulsivos de risco após movimentos de curto prazo.
          </p>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold">Nota para membros</h2>
            <span className="rounded-full bg-signal-700/10 px-3 py-1 text-xs font-semibold text-signal-800 border border-border-soft">
              🔒 Membros
            </span>
          </div>

          <p className="mt-4 text-ink-700">
            Membros desbloqueiam cenários detalhados, gestão de risco, orientação de portefólio e o arquivo completo.
          </p>

          <a
            href="/#pricing"
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            Desbloquear acesso completo
          </a>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Conteúdo educativo. Investir envolve risco. Sem sinais. Sem previsões.
        </p>
      </section>
    </main>
  );
}
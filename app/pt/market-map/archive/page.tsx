function Paywall({
  title = "Apenas para membros",
  description = "Desbloqueia acesso completo a cenários detalhados, gestão de risco e ao arquivo semanal.",
  cta = "Desbloquear acesso completo",
  href = "/#pricing",
  children,
}: {
  title?: string;
  description?: string;
  cta?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mt-10">
      {/* Conteúdo desfocado */}
      <div className="pointer-events-none select-none blur-sm">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-border-soft bg-white/90 p-6 text-center shadow-card backdrop-blur">
          <span className="inline-flex items-center gap-2 rounded-full bg-signal-700/10 px-3 py-1 text-xs font-semibold text-signal-800 border border-border-soft">
            🔒 {title}
          </span>

          <p className="mt-3 text-sm text-ink-700">
            {description}
          </p>

          <a
            href={href}
            className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            {cta}
          </a>

          <p className="mt-3 text-xs text-ink-500">
            Cancela quando quiseres. Sem hype. Foco no risco.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MarketMapPT() {
  return (
    <main className="min-h-screen bg-white text-ink-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border-soft bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/pt" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-2xl bg-ink-900" />
            <span className="font-semibold">SignalCore</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm text-ink-700 md:flex">
            <a href="/pt/how-it-works" className="hover:text-ink-900">
              Como funciona
            </a>
            <a href="/pt/market-map" className="hover:text-ink-900">
              Market Map
            </a>
            <a href="/pt/market-map/archive" className="hover:text-ink-900">
              Arquivo
            </a>
            <a href="/#pricing" className="hover:text-ink-900">
              Preços
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="/market-map"
              className="hidden md:inline-flex rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-canvas-50"
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

      {/* Conteúdo */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Weekly Market Map
        </h1>

        {/* Badges */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700">
            Semana 12 · Atualizado à segunda-feira
          </span>
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700">
            Perspetiva focada no risco
          </span>
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700">
            Série semanal contínua
          </span>
          <a
            href="/pt/market-map/archive"
            className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-canvas-50"
          >
            Ver arquivo
          </a>
        </div>

        <p className="mt-6 text-ink-700">
          Esta Market Map semanal oferece uma visão clara e estruturada do mercado —
          sem ruído, sem urgência e sem complexidade desnecessária.
        </p>

        <p className="mt-3 text-ink-700">
          Não se trata de previsões. Trata-se de{" "}
          <strong>contexto</strong>, <strong>risco</strong> e <strong>postura</strong>.
        </p>

        {/* Estado do mercado */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Estado do mercado</h2>
          <p className="mt-2 text-ink-700">
            O ambiente geral do mercado mantém-se{" "}
            <strong>frágil, mas seletivo</strong>.
          </p>
          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>As condições de liquidez continuam apertadas</li>
            <li>A volatilidade mantém-se elevada nos ativos de risco</li>
            <li>As reações do mercado são cada vez mais guiadas por notícias</li>
            <li>Movimentos de curto prazo são menos fiáveis do que o habitual</li>
          </ul>
          <p className="mt-4 text-ink-700">
            A incerteza — e não a direção — é a característica dominante esta semana.
          </p>
        </div>

        {/* O que mudou */}
        <div className="mt-4 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">O que mudou desde a semana passada</h2>
          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>O sentimento passou de cauteloso para mais defensivo</li>
            <li>O momentum de curto prazo enfraqueceu em áreas sensíveis ao risco</li>
            <li>As correlações entre ativos aumentaram, reduzindo diversificação</li>
          </ul>
          <p className="mt-4 text-ink-700">
            Estas mudanças aumentam o risco no curto prazo sem invalidar a estrutura de longo prazo.
          </p>
        </div>

        {/* PAYWALL — Riscos detalhados */}
        <Paywall
          title="Riscos detalhados"
          description="Membros têm acesso ao detalhe completo dos riscos, cenários e fatores que podem mudar o contexto."
        >
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Riscos em foco</h2>
            <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
              <li>Reprecificação súbita motivada por notícias</li>
              <li>Reações exageradas a dados isolados</li>
              <li>Liquidez comprimida a amplificar pequenos movimentos</li>
              <li>Aumento de correlações em momentos críticos</li>
            </ul>
            <p className="mt-4 text-ink-700">
              Esta semana, gerir o risco é mais importante do que tentar acertar no timing.
            </p>
          </div>
        </Paywall>

        {/* Horizontes */}
        <div className="mt-10">
          <h2 className="text-xl font-semibold">Horizontes temporais</h2>
          <p className="mt-2 text-ink-500">
            Postura por horizonte — sem misturar prazos.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="font-semibold text-sm">Curto prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Ambiente:</strong> Volátil e reativo
              </p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Postura:</strong> Observar, não perseguir
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="font-semibold text-sm">Médio prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Ambiente:</strong> Misto e irregular
              </p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Postura:</strong> Seletiva
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <p className="font-semibold text-sm">Longo prazo</p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Ambiente:</strong> Construtivo, mas sensível
              </p>
              <p className="mt-2 text-sm text-ink-700">
                <strong>Postura:</strong> Paciente
              </p>
            </div>
          </div>
        </div>

        {/* O que não estamos a fazer */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">O que não estamos a fazer esta semana</h2>
          <p className="mt-2 text-ink-700">
            Escolher não agir também é uma decisão — não é inatividade.
          </p>
          <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
            <li>Aumentar agressivamente a exposição ao risco</li>
            <li>Reagir a dados isolados</li>
            <li>Misturar volatilidade de curto prazo com decisões de longo prazo</li>
          </ul>
        </div>

        {/* PAYWALL — Nota para membros */}
        <Paywall>
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">Nota para membros</h2>
              <span className="rounded-full bg-signal-700/10 px-3 py-1 text-xs font-semibold text-signal-800 border border-border-soft">
                🔒 Membros
              </span>
            </div>

            <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
              <li>Cenários detalhados por horizonte</li>
              <li>Gestão de risco e proteção de capital</li>
              <li>Orientação de estrutura de portefólio</li>
              <li>Acesso ao arquivo semanal completo</li>
            </ul>
          </div>
        </Paywall>

        {/* Link arquivo */}
        <div className="mt-10">
          <a
            href="/pt/market-map/archive"
            className="text-sm font-medium text-ink-700 hover:text-ink-900"
          >
            ← Ver edições anteriores no arquivo
          </a>
        </div>

        <p className="mt-10 text-xs text-ink-500">
          Conteúdo educativo. Investir envolve risco. Sem sinais. Sem previsões.
        </p>
      </section>
    </main>
  );
}
type MarketRegimePayload = {
  market_regime: "Risk-on" | "Risk-off" | "Transitional" | "Neutral / Range-bound";
  confidence: "Low" | "Moderate" | "High";
  summary: string;
  key_risks: string[];
  regime_change_triggers: string[];
  week?: string;
  updated_at?: string;
};

async function getRegime(): Promise<MarketRegimePayload> {
  const res = await fetch("http://localhost:3000/api/regime", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to load /api/regime");
  return res.json();
}

function Paywall({
  title = "Apenas para membros",
  description = "Desbloqueia a análise completa de risco e as condições de mudança de regime.",
  cta = "Desbloquear acesso completo",
  href = "/pt/pricing",
  children,
}: {
  title?: string;
  description?: string;
  cta?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative mt-8">
      <div className="pointer-events-none select-none blur-sm">
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-border-soft bg-white/90 p-6 text-center shadow-card backdrop-blur">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-signal-700/10 px-3 py-1 text-xs font-semibold text-signal-800">
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
            Cancela quando quiseres. Preço de acesso antecipado.
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function MarketMapPT() {
  const regime = await getRegime();

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-4 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Weekly Market Map
        </h1>

        {/* META */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs text-ink-700">
            {regime.week ?? "Esta semana"}
            {regime.updated_at ? ` · Atualizado ${regime.updated_at}` : ""}
          </span>
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs text-ink-700">
            Perspetiva focada no risco
          </span>
        </div>

        {/* INTRO */}
        <p className="mt-6 text-ink-700">
          Esta Market Map semanal oferece uma visão estruturada do ambiente de
          mercado — com foco no contexto, no risco e na postura, e não em
          previsões.
        </p>

        {/* REGIME DE MERCADO (FREE) */}
        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Regime de Mercado</h2>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-sm font-medium text-ink-800">
              {regime.market_regime}
            </span>
            <span className="text-sm text-ink-500">
              Confiança: <strong>{regime.confidence}</strong>
            </span>
          </div>

          <p className="mt-4 text-ink-700">
            {regime.summary}
          </p>

          <p className="mt-3 text-ink-700">
            Este não é um ambiente de alta convicção. A seletividade e a gestão
            de risco são mais importantes do que a velocidade.
          </p>
        </div>

        {/* FATORES DE RISCO (PAYWALL) */}
        <Paywall
          title="Fatores de Risco Principais"
          description="Os membros têm acesso ao detalhe completo dos riscos por trás do regime atual."
        >
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Fatores de Risco Principais</h2>
            <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
              {regime.key_risks.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>

            <p className="mt-4 text-ink-700">
              Estes riscos podem não ser novos — mas a sua interação é
              determinante.
            </p>
          </div>
        </Paywall>

        {/* CONDIÇÕES DE MUDANÇA DE REGIME (PAYWALL) */}
        <Paywall
          title="Condições de Mudança de Regime"
          description="Percebe o que teria realmente de acontecer para o regime mudar."
        >
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">
              O Que Mudaria Este Regime
            </h2>

            <p className="mt-3 text-ink-700">
              Este regime mudaria se:
            </p>

            <ul className="mt-4 list-disc pl-5 space-y-2 text-ink-700">
              {regime.regime_change_triggers.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>

            <p className="mt-4 text-ink-700">
              Até lá, a prudência continua a ser apropriada.
            </p>
          </div>
        </Paywall>

        {/* FOOTNOTE */}
        <p className="mt-10 text-xs text-ink-500">
          Conteúdo educativo. Sem sinais. Sem previsões.
        </p>
      </section>
    </main>
  );
}
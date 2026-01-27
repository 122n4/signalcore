import React from "react";
import { getMarketRegime, type MarketRegimePayload } from "../../lib/getMarketRegime";

/* =========================
   Traduções para PT (snippet)
========================= */

function tRegime(regime: MarketRegimePayload["market_regime"]) {
  const map: Record<MarketRegimePayload["market_regime"], string> = {
    "Risk-on": "Risk-on",
    "Risk-off": "Risk-off",
    "Transitional": "Transição",
    "Neutral / Range-bound": "Neutro / Lateral",
  };
  return map[regime] ?? regime;
}

function tConfidence(confidence: MarketRegimePayload["confidence"]) {
  const map: Record<MarketRegimePayload["confidence"], string> = {
    Low: "Baixa",
    Moderate: "Moderada",
    High: "Alta",
  };
  return map[confidence] ?? confidence;
}

function tWeek(week?: string) {
  if (!week) return "";
  return week.replace(/^Week\s+/i, "Semana ");
}

function tDay(day?: string) {
  if (!day) return "";
  const map: Record<string, string> = {
    Monday: "Segunda-feira",
    Tuesday: "Terça-feira",
    Wednesday: "Quarta-feira",
    Thursday: "Quinta-feira",
    Friday: "Sexta-feira",
    Saturday: "Sábado",
    Sunday: "Domingo",
  };
  return map[day] ?? day;
}

function tSummary(summary: string) {
  const map: Record<string, string> = {
    "Market conditions remain fragile with mixed signals across risk assets. Volatility is still elevated while momentum has weakened, suggesting a market that is searching for direction rather than committing to one.":
      "As condições de mercado continuam frágeis, com sinais mistos entre ativos de risco. A volatilidade mantém-se elevada e o momentum enfraqueceu, sugerindo um mercado à procura de direção em vez de se comprometer com uma tendência clara.",
  };
  return map[summary] ?? summary;
}

export default async function HomePT() {
  const regime: MarketRegimePayload = await getMarketRegime();

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-7xl px-6 py-14">
        {/* HERO */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold text-ink-500">SignalCore</p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
            Investir não precisa de ser confuso.
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-ink-700 md:text-lg">
            O SignalCore oferece uma perspetiva calma e focada no risco — criado para quem
            procura clareza, não ruído.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/pt/market-map"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              Ver o Market Map desta semana
            </a>

            <a
              href="/pt/pricing"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Preços (9€/mês)
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-500">
            Conteúdo educativo. Sem sinais. Sem previsões.
          </p>
        </div>

        {/* ESTA SEMANA (AMOSTRA GRÁTIS) */}
        <section className="mx-auto mt-10 max-w-5xl rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="md:flex-1">
              <p className="text-xs font-semibold text-ink-500">Esta semana (amostra grátis)</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-sm font-medium text-ink-800">
                  {tRegime(regime.market_regime)}
                </span>

                <span className="text-sm text-ink-500">
                  Confiança: <strong>{tConfidence(regime.confidence)}</strong>
                </span>

                <span className="text-xs text-ink-500">
                  {regime.week ? `· ${tWeek(regime.week)}` : ""}
                  {regime.updated_at ? ` · Atualizado ${tDay(regime.updated_at)}` : ""}
                </span>
              </div>

              <p className="mt-3 text-sm text-ink-700">{tSummary(regime.summary)}</p>
            </div>

            <div className="md:w-[280px]">
              <a
                href="/pt/market-map"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
              >
                Ver o Market Map completo
              </a>
              <p className="mt-2 text-center text-xs text-ink-500">
                O grátis mostra o “quê”. Os membros recebem o “porquê”.
              </p>
            </div>
          </div>
        </section>

        {/* 3 CORE CARDS */}
        <section className="mx-auto mt-12 max-w-6xl">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-lg font-semibold">Regime de mercado claro</h3>
              <p className="mt-3 text-sm text-ink-700">
                Percebe se o mercado está em risk-on, risk-off ou transição — sem previsões.
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-lg font-semibold">Pensamento focado no risco</h3>
              <p className="mt-3 text-sm text-ink-700">
                Foco no que pode correr mal, no que realmente importa e no que mudaria o contexto atual.
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-lg font-semibold">Criado para consistência</h3>
              <p className="mt-3 text-sm text-ink-700">
                Uma visão semanal pensada para manter disciplina quando o mercado parece confuso.
              </p>
            </div>
          </div>
        </section>

        {/* PRINCÍPIOS */}
        <section className="mx-auto mt-14 max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">Os nossos princípios</h2>
          <p className="mt-2 text-sm text-ink-700">Como o SignalCore pensa sobre os mercados.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-base font-semibold">O risco vem primeiro</h3>
              <p className="mt-3 text-sm text-ink-700">
                Os mercados não falham porque as pessoas perdem oportunidades. Falham porque subestimam o risco.
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-base font-semibold">Contexto acima de previsão</h3>
              <p className="mt-3 text-sm text-ink-700">
                Não tentamos adivinhar o que vai acontecer. Tentamos compreender o ambiente em que estamos.
              </p>
            </div>

            <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
              <h3 className="text-base font-semibold">Disciplina vence a emoção</h3>
              <p className="mt-3 text-sm text-ink-700">
                A consistência é mais importante do que a convicção. Decisões calmas superam reações impulsivas.
              </p>
            </div>
          </div>
        </section>

        {/* COMO FUNCIONA */}
        <section className="mx-auto mt-14 max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">Como funciona o SignalCore</h2>

          <div className="mt-4 space-y-3 text-sm text-ink-700">
            <p>
              O SignalCore analisa continuamente as condições do mercado — ação do preço, volatilidade,
              contexto macro e comportamento entre ativos.
            </p>
            <p>
              Em vez de reagir a cada movimento, classifica o regime atual e destaca os riscos mais relevantes.
            </p>
            <p>
              Recebes uma Market Map semanal estruturada — desenhada para reduzir ruído, não para o amplificar.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href="/pt/why-signalcore"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Método
            </a>
            <a
              href="/pt/how-it-works"
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              Como funciona
            </a>
          </div>
        </section>

        {/* CTA PREÇOS */}
        <section className="mx-auto mt-14 max-w-3xl text-center">
          <p className="text-sm font-semibold text-ink-900">Acesso antecipado</p>
          <div className="mt-2 text-4xl font-semibold tracking-tight">
            9€ <span className="text-base font-medium text-ink-500">/ mês</span>
          </div>
          <p className="mt-2 text-sm text-ink-700">Um plano. Acesso completo. Preço inicial.</p>

          <div className="mt-6">
            <a
              href="/pt/pricing"
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-8 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              Obter acesso antecipado
            </a>
            <p className="mt-3 text-xs text-ink-500">
              O preço irá aumentar no futuro. Cancela quando quiseres.
            </p>
          </div>
        </section>

        {/* FRASE FINAL */}
        <section className="mx-auto mt-14 max-w-3xl text-center">
          <p className="text-xs text-ink-500">
            Conteúdo educativo. Sem sinais. Sem promessas. Apenas contexto.
          </p>
        </section>
      </section>
    </main>
  );
}
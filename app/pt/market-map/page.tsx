import React from "react";
import { getMarketRegime, type MarketRegimePayload } from "../../../lib/getMarketRegime";

/* =========================
   Traduções (PT)
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
  if (!week) return "Esta semana";
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

/* =========================
   Teaser pago (sem blur)
========================= */

function PaidTeaserPT({
  href = "/pt/pricing",
  cta = "Desbloquear clareza (€9/mês)",
}: {
  href?: string;
  cta?: string;
}) {
  return (
    <section className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        {/* Left */}
        <div className="md:flex-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-white px-3 py-1 text-xs font-semibold text-ink-700">
            🔒 Os membros desbloqueiam
          </div>

          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            O Market Map completo — consistência ao longo do tempo
          </h2>

          <p className="mt-2 text-sm text-ink-700">
            O grátis mostra onde o mercado está. Os membros recebem o contexto que ajuda
            a evitar reações impulsivas semana após semana.
          </p>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>• Histórico do regime (como as condições evoluíram)</li>
            <li>• Alertas quando o regime muda</li>
            <li>• Postura curto / médio / longo prazo</li>
            <li>• Notas “o que mudou” (rápidas, humanas, semanais)</li>
          </ul>
        </div>

        {/* Right (CTA) */}
        <div className="md:w-[340px]">
          <div className="rounded-3xl border border-border-soft bg-white p-5 shadow-card">
            <p className="text-sm font-semibold text-ink-900">Acesso antecipado</p>
            <p className="mt-1 text-sm text-ink-700">
              Estrutura calma e risk-first — todas as semanas.
            </p>

            <a
              href={href}
              className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              {cta}
            </a>

            <p className="mt-3 text-xs text-ink-500">
              Podes cancelar quando quiseres · Sem hype · Sem “sinais”
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================
   Página PT
========================= */

export default async function MarketMapPT() {
  const regime: MarketRegimePayload = await getMarketRegime();

  return (
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-4 py-14">
        <p className="text-xs font-semibold text-ink-500">SignalCore</p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Market Map Semanal
        </h1>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs text-ink-700">
            {tWeek(regime.week)}
            {regime.updated_at ? ` · Atualizado ${tDay(regime.updated_at)}` : ""}
          </span>

          <span className="rounded-full border border-border-soft bg-white px-3 py-1 text-xs text-ink-700">
            Perspetiva risk-first
          </span>
        </div>

        <p className="mt-6 text-ink-700">
          Uma visão estruturada das condições de mercado — com foco em contexto, risco e postura.
        </p>

        {/* ===== GRÁTIS (3 cards) ===== */}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {/* Card 1: Regime */}
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Regime de Mercado</h2>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-border-soft bg-canvas-50 px-3 py-1 text-sm font-medium text-ink-800">
                {tRegime(regime.market_regime)}
              </span>

              <span className="text-sm text-ink-500">
                Confiança: <strong>{tConfidence(regime.confidence)}</strong>
              </span>
            </div>

            <p className="mt-4 text-sm text-ink-700">{tSummary(regime.summary)}</p>
          </div>

          {/* Card 2: Regra */}
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">Regra da semana</h2>
            <p className="mt-3 text-sm text-ink-700">
              Em mercados de transição, fazer menos é muitas vezes a melhor decisão.
            </p>
          </div>

          {/* Card 3: O que significa */}
          <div className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-lg font-semibold">O que isto significa para ti</h2>

            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li>• Se estás a começar: a tua vantagem é evitar erros, não perseguir movimentos.</li>
              <li>• Se já estás investido: protege a qualidade das decisões e mantém o tamanho das posições sob controlo.</li>
              <li>• Se sentes urgência: normalmente é o teu sinal para abrandar.</li>
            </ul>

            <p className="mt-4 text-sm font-medium text-ink-900">
              Em resumo: esta semana recompensa paciência mais do que atividade.
            </p>
          </div>
        </div>

        {/* ===== PAGO (teaser sem blur) ===== */}
        <PaidTeaserPT href="/pt/pricing" cta="Desbloquear clareza (€9/mês)" />

        <p className="mt-10 text-xs text-ink-500">
          Conteúdo educativo. Sem sinais. Sem previsões.
        </p>
      </section>
      {/* What would change the regime? */}
<section className="mt-10 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
  <h2 className="text-lg font-semibold">What would change my mind?</h2>
  <p className="mt-2 text-sm text-ink-700">
    SignalCore changes slowly on purpose. These are the kinds of shifts that matter.
  </p>

  <ul className="mt-4 space-y-2 text-sm text-ink-700">
    <li>• A sustained change in volatility and market stress (not a one-day spike)</li>
    <li>• A consistent shift in cross-asset behavior (risk-on vs risk-off)</li>
    <li>• A clear break in trend structure with confirmation (not a headline move)</li>
  </ul>

  <p className="mt-4 text-xs text-ink-500">
    Educational context only — not signals, not predictions.
  </p>
</section>
    </main>
  );
}
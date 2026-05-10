import type { Metadata } from "next";
import Link from "next/link";
import ProofRail from "@/components/ProofRail";
import { pickByLang, type Multilingual, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "How Syntrake Works",
  description:
    "See how Syntrake moves from plan to monitoring to execution with a free Investing layer and a paid Trading depth layer.",
};

function t(
  lang: SiteLang,
  value: Multilingual
) {
  return pickByLang(lang, value);
}

export default async function HowItWorksPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams> | PageSearchParams;
}) {
  const params =
    searchParams && typeof (searchParams as Promise<PageSearchParams>).then === "function"
      ? await (searchParams as Promise<PageSearchParams>)
      : (searchParams as PageSearchParams | undefined);
  const lang = await resolveRequestSiteLang(params);
  const link = (href: string) => withLangQuery(href, lang);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-12">
      <section className="rounded-3xl border border-border-soft bg-white p-8 shadow-card">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-500">
          {t(lang, {
            en: "How it works",
            pt: "Como funciona",
            es: "Como funciona",
            fr: "Comment ca marche",
            de: "So funktioniert es",
            it: "Come funziona",
          })}
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink-900">
          {t(lang, {
            en: "From plan to execution without hiding the decision process.",
            pt: "Do plano ate a execucao sem esconder o processo de decisao.",
          })}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-700">
          {t(lang, {
            en: "Syntrake is designed to show what changes first, what stays free, and when Trading Pro becomes worth paying for. The point is not more signals. The point is fewer avoidable mistakes around capital, timing, and risk.",
            pt: "O Syntrake foi desenhado para mostrar o que muda primeiro, o que fica gratis e quando o Trading Pro passa a valer a pena. O objetivo nao e mais sinais. O objetivo e menos erros evitaveis em capital, timing e risco.",
          })}
        </p>
        <p className="mt-4 text-sm text-ink-600">
          <Link href={link("/")} className="underline">
            {t(lang, {
              en: "Back to home",
              pt: "Voltar ao inicio",
              es: "Volver al inicio",
              fr: "Retour accueil",
              de: "Zurueck zur Startseite",
              it: "Torna alla home",
            })}
          </Link>
        </p>
      </section>

      <ProofRail
        eyebrow={t(lang, {
          en: "System map",
          pt: "Mapa do sistema",
        })}
        title={t(lang, {
          en: "Syntrake is a decision system with visible layers, not a black-box signal feed.",
          pt: "O Syntrake e um sistema de decisao com camadas visiveis, nao um feed opaco de sinais.",
        })}
        body={t(lang, {
          en: "Investing handles the capital plan and the daily operating loop. Trading reads the market, ranks what deserves attention, and prepares broker-ready execution only when depth actually matters.",
          pt: "O Investing trata do plano de capital e do loop diario. O Trading le o mercado, ranqueia o que merece atencao e prepara execucao pronta para broker so quando a profundidade importa mesmo.",
        })}
        stats={[
          {
            label: t(lang, { en: "Workspaces", pt: "Workspaces" }),
            value: t(lang, { en: "2 clear systems", pt: "2 sistemas claros" }),
            detail: t(lang, {
              en: "Investing handles the plan and capital operating logic. Trading handles market scan and execution prep.",
              pt: "O Investing trata do plano e da logica operacional do capital. O Trading trata da leitura de mercado e da preparacao da execucao.",
            }),
          },
          {
            label: t(lang, { en: "Decision loop", pt: "Loop de decisao" }),
            value: t(lang, { en: "1 next best action", pt: "1 proxima melhor acao" }),
            detail: t(lang, {
              en: "Daily and Advisor keep the user focused on the highest-value move now.",
              pt: "Daily e Advisor mantem o utilizador focado na acao de maior valor agora.",
            }),
          },
          {
            label: t(lang, { en: "Execution model", pt: "Modelo de execucao" }),
            value: t(lang, { en: "External broker control", pt: "Controlo via broker externo" }),
            detail: t(lang, {
              en: "Syntrake prepares the order logic and checklist while the user keeps execution control.",
              pt: "O Syntrake prepara a logica da ordem e a checklist enquanto o utilizador mantem o controlo da execucao.",
            }),
          },
          {
            label: t(lang, { en: "Verification", pt: "Verificacao" }),
            value: t(lang, { en: "Real-time cross-check", pt: "Cross-check em tempo real" }),
            detail: t(lang, {
              en: "Valid trades can be compared against external references before execution.",
              pt: "Os trades validos podem ser comparados com referencias externas antes da execucao.",
            }),
          },
        ]}
        cards={[
          {
            title: t(lang, { en: "Investing OS", pt: "Investing OS" }),
            body: t(lang, {
              en: "Goal, horizon, guardrails, portfolio, and advisor logic stay visible so the user understands the capital path before subscribing to anything.",
              pt: "Objetivo, horizonte, guardrails, portfolio e logica do advisor mantem-se visiveis para o utilizador perceber o caminho do capital antes de subscrever qualquer coisa.",
            }),
            bullets: [
              t(lang, { en: "The plan becomes a live operating contract.", pt: "O plano torna-se um contrato operacional vivo." }),
              t(lang, { en: "Portfolio surfaces leaks and valuation issues clearly.", pt: "O portfolio mostra leaks e problemas de valorizacao de forma clara." }),
              t(lang, { en: "Receipts create proof over time.", pt: "Os recibos criam prova ao longo do tempo." }),
            ],
          },
          {
            title: t(lang, { en: "Trading Desk", pt: "Trading Desk" }),
            body: t(lang, {
              en: "Radar, Watchlist, Opportunities, Execution, Risk, Journal, and Alerts each have a distinct role instead of one noisy surface pretending everything is actionable.",
              pt: "Radar, Watchlist, Opportunities, Execution, Risk, Journal e Alerts tem um papel distinto em vez de uma unica superficie ruidosa a fingir que tudo e acionavel.",
            }),
            bullets: [
              t(lang, { en: "Radar separates market scan from execution-ready setups.", pt: "O Radar separa a leitura de mercado dos setups prontos para execucao." }),
              t(lang, { en: "Execution stays intentionally selective instead of flooding the user with noise.", pt: "A Execution mantem-se seletiva em vez de inundar o utilizador com ruido." }),
              t(lang, { en: "Risk framing and verification stay visible before money moves.", pt: "O enquadramento de risco e a verificacao mantem-se visiveis antes do dinheiro se mover." }),
            ],
          },
        ]}
        links={[
          {
            label: t(lang, { en: "Trust center", pt: "Trust center" }),
            href: link("/trust"),
            tone: "secondary",
          },
          {
            label: t(lang, { en: "Pricing", pt: "Precos" }),
            href: link("/pricing"),
            tone: "primary",
          },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            step: t(lang, { en: "Step 1", pt: "Passo 1" }),
            title: t(lang, {
              en: "Set the target",
              pt: "Define o alvo",
            }),
            body: t(lang, {
              en: "Define the goal and timeframe. Syntrake anchors every later decision to that target.",
              pt: "Define o objetivo e o horizonte temporal. O Syntrake ancora as decisoes seguintes a esse alvo.",
            }),
          },
          {
            step: t(lang, { en: "Step 2", pt: "Passo 2" }),
            title: t(lang, {
              en: "Build the operating rules",
              pt: "Constroi as regras operacionais",
            }),
            body: t(lang, {
              en: "Buckets, guardrails, policy, and playbooks turn intent into a repeatable framework.",
              pt: "Buckets, guardrails, politica e playbooks transformam a intencao num framework repetivel.",
            }),
          },
          {
            step: t(lang, { en: "Step 3", pt: "Passo 3" }),
            title: t(lang, {
              en: "Follow the next best action",
              pt: "Segue a proxima melhor acao",
            }),
            body: t(lang, {
              en: "Syntrake ranks the next move, explains why it matters, and shows the risk around it.",
              pt: "O Syntrake ranqueia o proximo movimento, explica porque importa e mostra o risco a volta.",
            }),
          },
          {
            step: t(lang, { en: "Step 4", pt: "Passo 4" }),
            title: t(lang, {
              en: "Unlock Pro when depth becomes valuable",
              pt: "Desbloqueia o Pro quando a profundidade ganhar valor",
            }),
            body: t(lang, {
              en: "Execution, alerts, journal continuity, and tighter risk framing become the paid layer because that is where recurring operational value lives.",
              pt: "Execution, alerts, continuidade de journal e enquadramento de risco mais apertado tornam-se a camada paga porque e ai que vive o valor operacional recorrente.",
            }),
          },
        ].map((item) => (
          <div key={item.title} className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="text-xs font-semibold text-ink-500">{item.step}</div>
            <div className="mt-2 text-lg font-semibold text-ink-900">{item.title}</div>
            <p className="mt-2 text-sm leading-6 text-ink-700">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            {t(lang, { en: "Free first", pt: "Gratis primeiro" })}
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
            {t(lang, {
              en: "You can prove the core value before paying.",
              pt: "Podes comprovar o valor central antes de pagar.",
            })}
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "Investing stays open with Daily, Plan, Portfolio, Advisor, and Autonomy.", pt: "O Investing fica aberto com Daily, Plan, Portfolio, Advisor e Autonomy." })}</li>
            <li>- {t(lang, { en: "Trading Discovery exposes the desk and opportunity flow before the depth paywall.", pt: "O Trading Discovery expõe a desk e o fluxo de oportunidades antes da paywall de profundidade." })}</li>
            <li>- {t(lang, { en: "Trust, pricing, and broker model stay inspectable in public.", pt: "Trust, pricing e modelo de broker mantem-se inspecionaveis em publico." })}</li>
          </ul>
        </div>

        <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            {t(lang, { en: "Paid for depth", pt: "Pago pela profundidade" })}
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
            {t(lang, {
              en: "The monthly subscription exists to reduce live execution mistakes.",
              pt: "A subscricao mensal existe para reduzir erros de execucao em live.",
            })}
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "Execution, Risk, Journal, and Alerts get deeper instead of noisier.", pt: "Execution, Risk, Journal e Alerts ficam mais profundos em vez de mais ruidosos." })}</li>
            <li>- {t(lang, { en: "Broker execution stays manual, but the workflow becomes cleaner and more auditable.", pt: "A execucao no broker continua manual, mas o workflow fica mais limpo e auditavel." })}</li>
            <li>- {t(lang, { en: "Recurring value comes from adaptation, continuity, and risk control over time.", pt: "O valor recorrente vem da adaptacao, continuidade e controlo de risco ao longo do tempo." })}</li>
          </ul>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href={link("/sign-up")} className="rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800">
          {t(lang, {
            en: "Start free",
            pt: "Comecar gratis",
            es: "Empezar gratis",
            fr: "Commencer gratuit",
            de: "Kostenlos starten",
            it: "Inizia gratis",
          })}
        </Link>
        <Link href={link("/pricing")} className="rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold hover:bg-canvas-50">
          {t(lang, {
            en: "See pricing",
            pt: "Ver precos",
            es: "Ver precios",
            fr: "Voir les tarifs",
            de: "Preise ansehen",
            it: "Vedi prezzi",
          })}
        </Link>
      </div>
    </main>
  );
}

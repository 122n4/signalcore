import type { Metadata } from "next";
import Link from "next/link";
import ProofRail from "@/components/ProofRail";
import { pickByLang, type Multilingual, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Why Pay for Syntrake",
  description:
    "Understand why Syntrake keeps core access free and charges for deeper Trading execution, live-data verification, risk gates, alerts, and continuity.",
};

function t(
  lang: SiteLang,
  value: Multilingual
) {
  return pickByLang(lang, value);
}

export default async function WhySyntrakePage({
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
            en: "Why Syntrake",
            pt: "Porque Syntrake",
            es: "Por que Syntrake",
            fr: "Pourquoi Syntrake",
            de: "Warum Syntrake",
            it: "Perche Syntrake",
          })}
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-ink-900">
          {t(lang, {
            en: "The paid layer exists for the expensive moment: right before the broker opens.",
            pt: "A camada paga existe para o momento caro: mesmo antes do broker abrir.",
          })}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-700">
          {t(lang, {
            en: "Syntrake should prove itself before asking for recurring revenue. Trading Pro exists because stale data, weak no-trade discipline, bad sizing, and poor continuity become expensive when live capital is moving.",
            pt: "O Syntrake deve provar-se antes de pedir receita recorrente. O Trading Pro existe porque dados stale, fraca disciplina de nao operar, sizing mau e pouca continuidade ficam caros quando o capital esta em movimento.",
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
          en: "Why pay",
          pt: "Porque pagar",
        })}
        title={t(lang, {
          en: "Syntrake charges for decision depth, not for basic access.",
          pt: "O Syntrake cobra pela profundidade da decisao, nao pelo acesso basico.",
        })}
        body={t(lang, {
          en: "The free layer proves the system. The paid layer exists when timing, sizing, invalidation, freshness, alerts, and journal continuity matter before a broker decision.",
          pt: "A camada gratuita prova o sistema. A camada paga existe quando timing, sizing, invalidation, frescura, alerts e continuidade de journal importam antes de uma decisao no broker.",
        })}
        stats={[
          {
            label: t(lang, { en: "Investing", pt: "Investing" }),
            value: t(lang, { en: "Free forever", pt: "Gratis para sempre" }),
            detail: t(lang, {
              en: "The product earns trust before it asks for money.",
              pt: "O produto ganha confianca antes de pedir dinheiro.",
            }),
          },
          {
            label: t(lang, { en: "Trading free", pt: "Trading free" }),
            value: t(lang, { en: "Discovery first", pt: "Discovery primeiro" }),
            detail: t(lang, {
              en: "Users can inspect the desk and opportunity flow before paying for depth.",
              pt: "Os utilizadores podem inspecionar a desk e o fluxo de oportunidades antes de pagar pela profundidade.",
            }),
          },
          {
            label: t(lang, { en: "Trading Pro", pt: "Trading Pro" }),
            value: t(lang, { en: "Decision depth", pt: "Profundidade de decisao" }),
            detail: t(lang, {
              en: "Trade/Wait, Execution, Risk, Journal, Alerts, and live verification become operational instead of shallow.",
              pt: "Trade/Wait, Execution, Risk, Journal, Alerts e verificacao live tornam-se operacionais em vez de superficiais.",
            }),
          },
          {
            label: t(lang, { en: "Subscription logic", pt: "Logica da subscricao" }),
            value: t(lang, { en: "Process edge", pt: "Edge de processo" }),
            detail: t(lang, {
              en: "Recurring value comes from better decisions and fewer avoidable mistakes over time.",
              pt: "O valor recorrente vem de melhores decisoes e menos erros evitaveis ao longo do tempo.",
            }),
          },
        ]}
        cards={[
          {
            title: t(lang, { en: "What the user pays for", pt: "Pelo que o utilizador paga" }),
            body: t(lang, {
              en: "A cleaner pre-broker decision: whether to trade, wait, reduce risk, or verify more before acting.",
              pt: "Uma decisao pre-broker mais limpa: entrar, esperar, reduzir risco ou verificar mais antes de agir.",
            }),
            bullets: [
              t(lang, { en: "Not more signal noise. A stronger decision gate.", pt: "Nao mais ruido de sinais. Um gate de decisao mais forte." }),
              t(lang, { en: "Not fake urgency. Better timing, freshness, and discipline.", pt: "Nao urgencia falsa. Melhor timing, frescura e disciplina." }),
              t(lang, { en: "Not blind trust. More visible proof before broker execution.", pt: "Nao confianca cega. Mais prova visivel antes da execucao no broker." }),
            ],
          },
          {
            title: t(lang, { en: "Why that can feel worth it every month", pt: "Porque isso pode valer a pena todos os meses" }),
            body: t(lang, {
              en: "Markets change, data quality changes, and discipline decays without structure. Syntrake earns retention by adapting the user's process every cycle.",
              pt: "Os mercados mudam, a qualidade dos dados muda e a disciplina degrada-se sem estrutura. O Syntrake ganha retencao ao adaptar o processo do utilizador a cada ciclo.",
            }),
            bullets: [
              t(lang, { en: "The loop keeps running after the first setup.", pt: "O loop continua a correr depois do primeiro setup." }),
              t(lang, { en: "The user sees when WAIT is discipline, not indecision.", pt: "O utilizador ve quando WAIT e disciplina, nao indecisao." }),
              t(lang, { en: "That supports retention better than raw signal volume.", pt: "Isso suporta melhor a retencao do que puro volume de sinais." }),
            ],
          },
        ]}
        links={[
          {
            label: t(lang, { en: "See pricing", pt: "Ver precos" }),
            href: link("/pricing"),
            tone: "primary",
          },
          {
            label: t(lang, { en: "How it works", pt: "Como funciona" }),
            href: link("/how-it-works"),
            tone: "secondary",
          },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: t(lang, {
              en: "Fewer unforced broker mistakes",
              pt: "Menos erros evitaveis no broker",
            }),
            body: t(lang, {
              en: "The product becomes valuable when it blocks bad timing, weak sizing, stale snapshots, and poor risk framing before they reach the broker.",
              pt: "O produto ganha valor quando bloqueia mau timing, sizing fraco, snapshots stale e risco mal enquadrado antes de chegarem ao broker.",
            }),
          },
          {
            title: t(lang, {
              en: "No-trade becomes a product feature",
              pt: "Nao operar torna-se uma feature",
            }),
            body: t(lang, {
              en: "Syntrake does not need to force action to be valuable. It earns trust by making WAIT explicit when the setup is not clean.",
              pt: "O Syntrake nao precisa de forcar acao para ter valor. Ganha confianca ao tornar WAIT explicito quando o setup nao esta limpo.",
            }),
          },
          {
            title: t(lang, {
              en: "Continuity that compounds",
              pt: "Continuidade que acumula",
            }),
            body: t(lang, {
              en: "Journal memory, alerts, and repeated risk checks create recurring value because the process improves with use.",
              pt: "Memoria de journal, alerts e verificacoes repetidas de risco criam valor recorrente porque o processo melhora com o uso.",
            }),
          },
        ].map((card) => (
          <div key={card.title} className="rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">{card.title}</h2>
            <p className="mt-3 text-sm leading-6 text-ink-700">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-border-soft bg-white p-8 shadow-card">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
          {t(lang, { en: "Free vs Pro", pt: "Free vs Pro" })}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          {t(lang, {
            en: "What changes when you stay free and what changes when you upgrade.",
            pt: "O que muda quando ficas no free e o que muda quando fazes upgrade.",
          })}
        </h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div className="text-sm font-semibold text-ink-900">{t(lang, { en: "Still free", pt: "Continua gratis" })}</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li>- {t(lang, { en: "Daily, Plan, Portfolio, Advisor, and Autonomy in Investing", pt: "Daily, Plan, Portfolio, Advisor e Autonomy no Investing" })}</li>
              <li>- {t(lang, { en: "Trading desk and opportunity flow in discovery mode", pt: "Desk de Trading e fluxo de oportunidades em discovery mode" })}</li>
              <li>- {t(lang, { en: "Enough access to verify if the product fits your style", pt: "Acesso suficiente para verificares se o produto encaixa no teu estilo" })}</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
            <div className="text-sm font-semibold text-ink-900">{t(lang, { en: "Paid for depth", pt: "Pago pela profundidade" })}</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li>- {t(lang, { en: "Execution, Risk, Journal, and Alerts become fully operational", pt: "Execution, Risk, Journal e Alerts tornam-se totalmente operacionais" })}</li>
              <li>- {t(lang, { en: "Live decisions gain freshness checks, verification, and discipline support", pt: "As decisoes live ganham checks de frescura, verificacao e suporte de disciplina" })}</li>
              <li>- {t(lang, { en: "The subscription pays for fewer avoidable broker mistakes under pressure, not for basic access", pt: "A subscricao paga menos erros evitaveis no broker sob pressao, nao o acesso basico" })}</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href={link("/sign-up")}
          className="rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
        >
          {t(lang, {
            en: "Start free",
            pt: "Comecar gratis",
            es: "Empezar gratis",
            fr: "Commencer gratuit",
            de: "Kostenlos starten",
            it: "Inizia gratis",
          })}
        </Link>
        <Link
          href={link("/pricing")}
          className="rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold hover:bg-canvas-50"
        >
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

import type { Metadata } from "next";
import TrackedLink from "@/components/TrackedLink";
import { pickByLang, type Multilingual, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Syntrake for Beginners",
  description:
    "Start investing with a calm, goal-based process. Syntrake helps beginners act with discipline, not panic.",
};

function t(
  lang: SiteLang,
  value: Multilingual
) {
  return pickByLang(lang, value);
}

export default async function ForBeginnersPage({
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
    <main className="min-h-screen bg-transparent text-ink-900">
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-3xl border border-border-soft bg-white/95 p-8 shadow-card">
          <p className="text-xs font-semibold text-ink-500">
            {t(lang, {
              en: "Campaign landing",
              pt: "Landing de campanha",
              es: "Landing de campana",
              fr: "Landing de campagne",
              de: "Kampagnen-Landing",
              it: "Landing di campagna",
            })}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {t(lang, {
              en: "Invest without panic.",
              pt: "Investe sem panico.",
              es: "Invierte sin panico.",
              fr: "Investissez sans panique.",
              de: "Investiere ohne Panik.",
              it: "Investi senza panico.",
            })}
          </h1>
          <p className="mt-4 max-w-3xl text-ink-700">
            {t(lang, {
              en: "Syntrake gives you one clear next step at a time. No noise, no random decisions, and no need to act like a pro on day one.",
              pt: "Syntrake da-te um proximo passo claro de cada vez. Sem ruido, sem decisoes aleatorias e sem precisares agir como pro no dia um.",
              es: "Syntrake te da un siguiente paso claro cada vez. Sin ruido, sin decisiones aleatorias y sin actuar como pro el primer dia.",
              fr: "Syntrake vous donne une etape suivante claire a la fois. Pas de bruit, pas de decisions aleatoires, pas besoin d agir comme un pro des le premier jour.",
              de: "Syntrake gibt dir immer einen klaren naechsten Schritt. Kein Rauschen, keine zufaelligen Entscheidungen und kein Pro-Verhalten am ersten Tag.",
              it: "Syntrake ti da un passo successivo chiaro alla volta. Niente rumore, niente decisioni casuali e nessun bisogno di agire da pro al primo giorno.",
            })}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
              {t(lang, {
                en: "Build a goal-based plan in minutes.",
                pt: "Constroi um plano baseado em objetivo em minutos.",
                es: "Construye un plan por objetivo en minutos.",
                fr: "Construisez un plan base sur objectif en quelques minutes.",
                de: "Erstelle in Minuten einen zielbasierten Plan.",
                it: "Costruisci in minuti un piano basato su obiettivo.",
              })}
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
              {t(lang, {
                en: "Use guardrails to avoid emotional mistakes.",
                pt: "Usa guardrails para evitar erros emocionais.",
                es: "Usa guardrails para evitar errores emocionales.",
                fr: "Utilisez des guardrails pour eviter les erreurs emotionnelles.",
                de: "Nutze Guardrails, um emotionale Fehler zu vermeiden.",
                it: "Usa i guardrail per evitare errori emotivi.",
              })}
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
              {t(lang, {
                en: "Upgrade only when you want full execution tools.",
                pt: "Faz upgrade so quando quiseres ferramentas completas de execucao.",
                es: "Haz upgrade solo cuando quieras herramientas completas de ejecucion.",
                fr: "Passez en Pro seulement quand vous voulez les outils d execution complets.",
                de: "Upgrade nur, wenn du volle Execution-Tools willst.",
                it: "Fai upgrade solo quando vuoi strumenti completi di esecuzione.",
              })}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <TrackedLink
              href={link("/sign-up")}
              eventName="cta_click"
              eventData={{ location: "landing_beginners", target: "sign_up" }}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              {t(lang, {
                en: "Start free",
                pt: "Comecar gratis",
                es: "Empezar gratis",
                fr: "Commencer gratuit",
                de: "Kostenlos starten",
                it: "Inizia gratis",
              })}
            </TrackedLink>
            <TrackedLink
              href={link("/pricing")}
              eventName="cta_click"
              eventData={{ location: "landing_beginners", target: "pricing" }}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              {t(lang, { en: "See pricing", pt: "Ver precos", es: "Ver precios", fr: "Voir les tarifs", de: "Preise ansehen", it: "Vedi prezzi" })}
            </TrackedLink>
          </div>
        </div>
      </section>
    </main>
  );
}


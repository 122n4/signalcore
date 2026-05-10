import type { Metadata } from "next";
import TrackedLink from "@/components/TrackedLink";
import { pickByLang, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Syntrake for Advanced Investors",
  description:
    "Run a disciplined process with policy, risk guardrails, and explainable actions. Built for advanced investors.",
};

function t(
  lang: SiteLang,
  value: { en: string; pt?: string; es?: string; fr?: string; de?: string; it?: string }
) {
  return pickByLang(lang, value);
}

export default async function ForProsPage({
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
              en: "Institutional discipline for personal capital.",
              pt: "Disciplina institucional para capital pessoal.",
              es: "Disciplina institucional para capital personal.",
              fr: "Discipline institutionnelle pour capital personnel.",
              de: "Institutionelle Disziplin fuer persoenliches Kapital.",
              it: "Disciplina istituzionale per capitale personale.",
            })}
          </h1>
          <p className="mt-4 max-w-3xl text-ink-700">
            {t(lang, {
              en: "Syntrake helps you operate with policy, constraints, and explainable execution. Keep full control with a tighter process.",
              pt: "Syntrake ajuda-te a operar com politica, limites e execucao explicavel. Mantem controlo total com um processo mais rigoroso.",
              es: "Syntrake te ayuda a operar con politica, limites y ejecucion explicable. Mantiene control total con un proceso mas riguroso.",
              fr: "Syntrake vous aide a operer avec politique, contraintes et execution explicable. Gardez le controle total avec un processus plus strict.",
              de: "Syntrake hilft dir mit Policy, Grenzen und erklaerbarer Ausfuehrung zu arbeiten. Behalte volle Kontrolle mit einem strengeren Prozess.",
              it: "Syntrake ti aiuta a operare con policy, vincoli ed esecuzione spiegabile. Mantieni pieno controllo con un processo piu rigoroso.",
            })}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
              {t(lang, {
                en: "Policy + guardrails before position changes.",
                pt: "Politica + guardrails antes de mudar posicoes.",
                es: "Politica + guardrails antes de cambiar posiciones.",
                fr: "Politique + guardrails avant les changements de position.",
                de: "Policy + Guardrails vor Positionsaenderungen.",
                it: "Policy + guardrail prima di cambiare posizioni.",
              })}
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
              {t(lang, {
                en: "Risk drivers, stress checks, and drift monitoring.",
                pt: "Drivers de risco, stress checks e monitorizacao de drift.",
                es: "Drivers de riesgo, stress checks y monitorizacion de deriva.",
                fr: "Drivers de risque, stress checks et suivi de derive.",
                de: "Risikotreiber, Stress-Checks und Drift-Monitoring.",
                it: "Driver di rischio, stress check e monitoraggio drift.",
              })}
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4 text-sm text-ink-700">
              {t(lang, {
                en: "Full rationale trail for every action.",
                pt: "Trilha completa de racional para cada acao.",
                es: "Rastro completo de razonamiento para cada accion.",
                fr: "Trace complete de rationale pour chaque action.",
                de: "Vollstaendige Begruendungsspur fuer jede Aktion.",
                it: "Traccia completa di razionale per ogni azione.",
              })}
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <TrackedLink
              href={link("/pricing")}
              eventName="cta_click"
              eventData={{ location: "landing_pros", target: "pricing" }}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800"
            >
              {t(lang, {
                en: "Get Pro",
                pt: "Obter Pro",
                es: "Obtener Pro",
                fr: "Passer Pro",
                de: "Pro holen",
                it: "Ottieni Pro",
              })}
            </TrackedLink>
            <TrackedLink
              href={link("/sign-up")}
              eventName="cta_click"
              eventData={{ location: "landing_pros", target: "sign_up" }}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
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
          </div>
        </div>
      </section>
    </main>
  );
}


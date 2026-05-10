import Link from "next/link";
import { pickByLang, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

function t(
  lang: SiteLang,
  value: { en: string; pt?: string; es?: string; fr?: string; de?: string; it?: string }
) {
  return pickByLang(lang, value);
}

export default async function DisclaimerPage({
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
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t(lang, {
            en: "Disclaimer",
            pt: "Aviso legal",
            es: "Aviso legal",
            fr: "Avertissement",
            de: "Hinweis",
            it: "Disclaimer",
          })}
        </h1>
        <p className="text-sm text-ink-600">
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
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "No financial advice",
            pt: "Sem aconselhamento financeiro",
            es: "Sin asesoramiento financiero",
            fr: "Pas de conseil financier",
            de: "Keine Finanzberatung",
            it: "Nessuna consulenza finanziaria",
          })}
        </h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Syntrake is an educational decision-support tool. It does not provide investment, legal, tax, or accounting advice. Any examples, templates, outputs, or mentions of securities/tickers are informational only.",
            pt: "Syntrake e uma ferramenta educacional de suporte a decisao. Nao fornece aconselhamento de investimento, legal, fiscal ou contabilistico. Quaisquer exemplos, templates, outputs ou mencoes de ativos/tickers sao apenas informativos.",
            es: "Syntrake es una herramienta educativa de soporte a decisiones. No ofrece asesoramiento de inversion, legal, fiscal o contable. Cualquier ejemplo, plantilla, salida o mencion de activos/tickers es solo informativa.",
            fr: "Syntrake est un outil educatif d aide a la decision. Il ne fournit pas de conseil en investissement, juridique, fiscal ou comptable. Les exemples, modeles, sorties ou mentions d actifs/tickers sont informatifs uniquement.",
            de: "Syntrake ist ein lehrreiches Entscheidungsunterstuetzungstool. Es bietet keine Anlage-, Rechts-, Steuer- oder Buchhaltungsberatung. Beispiele, Vorlagen, Ausgaben oder Erwaehnungen von Wertpapieren/Tickern dienen nur der Information.",
            it: "Syntrake e uno strumento educativo di supporto decisionale. Non fornisce consulenza su investimenti, legale, fiscale o contabile. Esempi, template, output o menzioni di asset/ticker sono solo informativi.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "You are responsible",
            pt: "Tu es responsavel",
            es: "Tu eres responsable",
            fr: "Vous etes responsable",
            de: "Du bist verantwortlich",
            it: "Sei responsabile",
          })}
        </h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "You are solely responsible for your investment decisions and outcomes. Always do your own research and consider consulting qualified professionals.",
            pt: "Tu es o unico responsavel pelas tuas decisoes e resultados de investimento. Faz sempre a tua propria pesquisa e considera consultar profissionais qualificados.",
            es: "Tu eres el unico responsable de tus decisiones y resultados de inversion. Haz siempre tu propia investigacion y considera consultar profesionales cualificados.",
            fr: "Vous etes seul responsable de vos decisions et resultats d investissement. Faites toujours vos propres recherches et envisagez de consulter des professionnels qualifies.",
            de: "Du bist allein verantwortlich fuer deine Anlageentscheidungen und Ergebnisse. Recherchiere immer selbst und ziehe qualifizierte Fachleute hinzu.",
            it: "Sei l unico responsabile delle tue decisioni e risultati di investimento. Fai sempre le tue ricerche e valuta la consulenza di professionisti qualificati.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "Risk of loss",
            pt: "Risco de perda",
            es: "Riesgo de perdida",
            fr: "Risque de perte",
            de: "Verlustrisiko",
            it: "Rischio di perdita",
          })}
        </h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Investing involves risk, including possible loss of principal. Past performance does not guarantee future results. Markets may be volatile and unpredictable.",
            pt: "Investir envolve risco, incluindo possivel perda de capital. Resultados passados nao garantem resultados futuros. Os mercados podem ser volateis e imprevisiveis.",
            es: "Invertir implica riesgo, incluida posible perdida de capital. El rendimiento pasado no garantiza resultados futuros. Los mercados pueden ser volatiles e impredecibles.",
            fr: "Investir comporte des risques, y compris la perte possible du capital. Les performances passees ne garantissent pas les resultats futurs. Les marches peuvent etre volatils et imprevisibles.",
            de: "Investieren ist mit Risiken verbunden, einschliesslich moeglichem Kapitalverlust. Vergangene Performance garantiert keine kuenftigen Ergebnisse. Maerkte koennen volatil und unvorhersehbar sein.",
            it: "Investire comporta rischi, inclusa la possibile perdita del capitale. Le performance passate non garantiscono risultati futuri. I mercati possono essere volatili e imprevedibili.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "Contact",
            pt: "Contacto",
            es: "Contacto",
            fr: "Contact",
            de: "Kontakt",
            it: "Contatto",
          })}
        </h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Questions about this disclaimer:",
            pt: "Perguntas sobre este aviso legal:",
            es: "Preguntas sobre este aviso legal:",
            fr: "Questions sur cet avertissement :",
            de: "Fragen zu diesem Hinweis:",
            it: "Domande su questo disclaimer:",
          })}{" "}
          <a href="mailto:support@syntrake.com" className="underline">
            support@syntrake.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}


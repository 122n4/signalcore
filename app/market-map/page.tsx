import Link from "next/link";
import { pickByLang, type Multilingual, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

function t(
  lang: SiteLang,
  value: Multilingual
) {
  return pickByLang(lang, value);
}

export default async function PreviewPage({
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
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t(lang, { en: "Preview", pt: "Preview", es: "Vista previa", fr: "Apercu", de: "Vorschau", it: "Anteprima" })}
        </h1>
        <p className="text-sm text-ink-600">
          {t(lang, {
            en: "A quick look at the Syntrake experience -",
            pt: "Uma visao rapida da experiencia Syntrake -",
            es: "Una vista rapida de la experiencia Syntrake -",
            fr: "Un apercu rapide de l experience Syntrake -",
            de: "Ein schneller Blick auf die Syntrake-Erfahrung -",
            it: "Uno sguardo rapido all esperienza Syntrake -",
          })}{" "}
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

      <section className="rounded-3xl border border-border-soft bg-canvas-50 p-8 shadow-card space-y-4">
        <div className="text-xs font-semibold text-ink-500">
          {t(lang, {
            en: "Copilot Daily Pulse (example)",
            pt: "Pulso diario do Copilot (exemplo)",
            es: "Pulso diario del Copilot (ejemplo)",
            fr: "Pulse quotidienne Copilot (exemple)",
            de: "Copilot Daily Pulse (Beispiel)",
            it: "Copilot Daily Pulse (esempio)",
          })}
        </div>
        <div className="rounded-2xl border border-border-soft bg-white p-5">
          <div className="text-sm font-semibold">{t(lang, { en: "Status", pt: "Estado", es: "Estado", fr: "Statut", de: "Status", it: "Stato" })}</div>
          <div className="mt-1 text-sm text-ink-700">
            {t(lang, {
              en: "You're close to a safety limit (FX exposure).",
              pt: "Estas perto de um limite de seguranca (exposicao FX).",
              es: "Estas cerca de un limite de seguridad (exposicion FX).",
              fr: "Vous etes proche d une limite de securite (exposition FX).",
              de: "Du bist nahe an einem Sicherheitslimit (FX-Exposure).",
              it: "Sei vicino a un limite di sicurezza (esposizione FX).",
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-border-soft bg-white p-5">
          <div className="text-sm font-semibold">{t(lang, { en: "Why", pt: "Porque", es: "Por que", fr: "Pourquoi", de: "Warum", it: "Perche" })}</div>
          <ul className="mt-2 list-disc pl-5 text-sm text-ink-700 space-y-1">
            <li>
              {t(lang, {
                en: "Portfolio drifted outside plan bands.",
                pt: "O portfolio saiu das bandas do plano.",
                es: "El portafolio se desvio de las bandas del plan.",
                fr: "Le portefeuille a derive hors des bandes du plan.",
                de: "Das Portfolio ist aus den Plan-Baendern gedriftet.",
                it: "Il portafoglio e uscito dalle bande del piano.",
              })}
            </li>
            <li>
              {t(lang, {
                en: "Concentration is rising faster than target.",
                pt: "A concentracao esta a subir mais rapido que o alvo.",
                es: "La concentracion sube mas rapido que el objetivo.",
                fr: "La concentration monte plus vite que la cible.",
                de: "Die Konzentration steigt schneller als das Ziel.",
                it: "La concentrazione sta salendo piu veloce del target.",
              })}
            </li>
          </ul>
        </div>
        <div className="rounded-2xl border border-border-soft bg-white p-5">
          <div className="text-sm font-semibold">
            {t(lang, {
              en: "Next step",
              pt: "Proximo passo",
              es: "Siguiente paso",
              fr: "Etape suivante",
              de: "Naechster Schritt",
              it: "Passo successivo",
            })}
          </div>
          <div className="mt-1 text-sm text-ink-700">
            {t(lang, {
              en: "Reduce FX risk by ~3% before adding new positions.",
              pt: "Reduz risco FX em ~3% antes de adicionar novas posicoes.",
              es: "Reduce riesgo FX en ~3% antes de anadir nuevas posiciones.",
              fr: "Reduire le risque FX de ~3% avant d ajouter de nouvelles positions.",
              de: "FX-Risiko um ~3% reduzieren, bevor neue Positionen hinzugefuegt werden.",
              it: "Riduci rischio FX di ~3% prima di aggiungere nuove posizioni.",
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="rounded-2xl bg-ink-900 px-4 py-2 text-xs font-semibold text-white">
              {t(lang, {
                en: "Send to Execution",
                pt: "Enviar para Execution",
                es: "Enviar a Execution",
                fr: "Envoyer vers Execution",
                de: "An Execution senden",
                it: "Invia a Execution",
              })}
            </div>
            <div className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold">
              {t(lang, {
                en: "Explain simply",
                pt: "Explicar simples",
                es: "Explicar simple",
                fr: "Expliquer simplement",
                de: "Einfach erklaeren",
                it: "Spiega in modo semplice",
              })}
            </div>
            <div className="rounded-2xl border border-border-soft bg-white px-4 py-2 text-xs font-semibold">
              {t(lang, {
                en: "Show Pro details",
                pt: "Mostrar detalhes Pro",
                es: "Mostrar detalles Pro",
                fr: "Afficher details Pro",
                de: "Pro-Details zeigen",
                it: "Mostra dettagli Pro",
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-3 flex-wrap">
        <Link href={link("/sign-up")} className="rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white shadow-soft hover:bg-signal-800">
          {t(lang, {
            en: "Start your plan",
            pt: "Comecar o teu plano",
            es: "Empezar tu plan",
            fr: "Commencer votre plan",
            de: "Starte deinen Plan",
            it: "Inizia il tuo piano",
          })}
        </Link>
        <Link href={link("/pricing")} className="rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold hover:bg-canvas-50">
          {t(lang, { en: "Pricing", pt: "Precos", es: "Precios", fr: "Tarifs", de: "Preise", it: "Prezzi" })}
        </Link>
      </div>
    </main>
  );
}


import { pickByLang, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

function t(
  lang: SiteLang,
  value: { en: string; pt?: string; es?: string; fr?: string; de?: string; it?: string }
) {
  return pickByLang(lang, value);
}

export default async function NotForYou({
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
    <main className="min-h-screen bg-white text-ink-900">
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-semibold text-ink-500">Syntrake</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          {t(lang, {
            en: "Syntrake is not for everyone",
            pt: "Syntrake nao e para toda a gente",
            es: "Syntrake no es para todos",
            fr: "Syntrake n est pas pour tout le monde",
            de: "Syntrake ist nicht fuer alle",
            it: "Syntrake non e per tutti",
          })}
        </h1>

        <p className="mt-4 text-base text-ink-700">
          {t(lang, {
            en: "This is intentional. Syntrake is built to reduce noise and protect decision quality - not to maximize activity.",
            pt: "Isto e intencional. Syntrake foi criado para reduzir ruido e proteger qualidade de decisao - nao para maximizar atividade.",
            es: "Esto es intencional. Syntrake fue creado para reducir ruido y proteger calidad de decision - no para maximizar actividad.",
            fr: "C est intentionnel. Syntrake est concu pour reduire le bruit et proteger la qualite de decision - pas pour maximiser l activite.",
            de: "Das ist Absicht. Syntrake wurde entwickelt, um Rauschen zu reduzieren und Entscheidungsqualitaet zu schuetzen - nicht um Aktivitaet zu maximieren.",
            it: "E intenzionale. Syntrake e stato creato per ridurre il rumore e proteggere la qualita decisionale - non per massimizzare l attivita.",
          })}
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">
            {t(lang, {
              en: "It is not for you if you want...",
              pt: "Nao e para ti se queres...",
              es: "No es para ti si quieres...",
              fr: "Ce n est pas pour vous si vous voulez...",
              de: "Es ist nichts fuer dich, wenn du willst...",
              it: "Non fa per te se vuoi...",
            })}
          </h2>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "Buy/sell signals or entries", pt: "Sinais de compra/venda ou entradas", es: "Senales de compra/venta o entradas", fr: "Signaux d achat/vente ou entrees", de: "Kauf/Verkauf-Signale oder Entries", it: "Segnali di acquisto/vendita o entrate" })}</li>
            <li>- {t(lang, { en: "Short-term predictions", pt: "Previsoes de curto prazo", es: "Predicciones de corto plazo", fr: "Predictions court terme", de: "Kurzfristige Vorhersagen", it: "Previsioni di breve termine" })}</li>
            <li>- {t(lang, { en: "Constant alerts and notifications", pt: "Alertas e notificacoes constantes", es: "Alertas y notificaciones constantes", fr: "Alertes et notifications constantes", de: "Staendige Alerts und Benachrichtigungen", it: "Alert e notifiche costanti" })}</li>
            <li>- {t(lang, { en: "A product you check every day", pt: "Um produto para veres todos os dias", es: "Un producto para revisar todos los dias", fr: "Un produit a verifier tous les jours", de: "Ein Produkt, das du taeglich pruefst", it: "Un prodotto da controllare ogni giorno" })}</li>
            <li>- {t(lang, { en: "Certainty and quick answers", pt: "Certeza e respostas rapidas", es: "Certeza y respuestas rapidas", fr: "Certitude et reponses rapides", de: "Sicherheit und schnelle Antworten", it: "Certezza e risposte rapide" })}</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">
            {t(lang, {
              en: "It is for you if you value...",
              pt: "E para ti se valorizas...",
              es: "Es para ti si valoras...",
              fr: "C est pour vous si vous valorisez...",
              de: "Es ist fuer dich, wenn du schaetzt...",
              it: "Fa per te se apprezzi...",
            })}
          </h2>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "A weekly ritual, not a daily feed", pt: "Um ritual semanal, nao feed diario", es: "Un ritual semanal, no feed diario", fr: "Un rituel hebdo, pas un feed quotidien", de: "Ein Wochenritual, kein taeglicher Feed", it: "Un rituale settimanale, non feed giornaliero" })}</li>
            <li>- {t(lang, { en: "Risk-first thinking", pt: "Pensamento risco-primeiro", es: "Pensamiento riesgo-primero", fr: "Approche risque d abord", de: "Risiko-zuerst-Denken", it: "Pensiero rischio-prima" })}</li>
            <li>- {t(lang, { en: "Clear horizons (short / medium / long)", pt: "Horizontes claros (curto / medio / longo)", es: "Horizontes claros (corto / medio / largo)", fr: "Horizons clairs (court / moyen / long)", de: "Klare Horizonte (kurz / mittel / lang)", it: "Orizzonti chiari (breve / medio / lungo)" })}</li>
            <li>- {t(lang, { en: "Fewer decisions - made with better context", pt: "Menos decisoes - com melhor contexto", es: "Menos decisiones - con mejor contexto", fr: "Moins de decisions - avec meilleur contexte", de: "Weniger Entscheidungen - mit besserem Kontext", it: "Meno decisioni - con contesto migliore" })}</li>
            <li>- {t(lang, { en: "Calm, disciplined investing", pt: "Investimento calmo e disciplinado", es: "Inversion calmada y disciplinada", fr: "Investissement calme et discipline", de: "Ruhiges, diszipliniertes Investieren", it: "Investimento calmo e disciplinato" })}</li>
          </ul>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold">
            {t(lang, {
              en: "Want to see it in practice",
              pt: "Queres ver isto na pratica",
              es: "Quieres verlo en practica",
              fr: "Vous voulez le voir en pratique",
              de: "Willst du es in der Praxis sehen",
              it: "Vuoi vederlo in pratica",
            })}
          </h2>
          <p className="mt-2 text-sm text-ink-700">
            {t(lang, {
              en: "Start with a real example, then set up your weekly ritual in 5 minutes.",
              pt: "Comeca com um exemplo real e depois configura o teu ritual semanal em 5 minutos.",
              es: "Empieza con un ejemplo real y luego configura tu ritual semanal en 5 minutos.",
              fr: "Commencez par un exemple reel puis configurez votre rituel hebdo en 5 minutes.",
              de: "Starte mit einem echten Beispiel und richte dann in 5 Minuten dein Wochenritual ein.",
              it: "Inizia con un esempio reale, poi imposta il tuo rituale settimanale in 5 minuti.",
            })}
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={link("/example")}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              {t(lang, { en: "See an example", pt: "Ver um exemplo", es: "Ver un ejemplo", fr: "Voir un exemple", de: "Ein Beispiel ansehen", it: "Vedi un esempio" })}
            </a>

            <a
              href={link("/start")}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              {t(lang, { en: "Start (5 min)", pt: "Comecar (5 min)", es: "Empezar (5 min)", fr: "Demarrer (5 min)", de: "Start (5 Min)", it: "Inizia (5 min)" })}
            </a>
          </div>

          <p className="mt-4 text-xs text-ink-500">
            {t(lang, {
              en: "Educational content only - No signals - No predictions",
              pt: "Conteudo educacional - Sem sinais - Sem previsoes",
              es: "Contenido educativo - Sin senales - Sin predicciones",
              fr: "Contenu educatif - Aucun signal - Aucune prediction",
              de: "Nur Bildungsinhalt - Keine Signale - Keine Prognosen",
              it: "Contenuto educativo - Niente segnali - Niente previsioni",
            })}
          </p>
        </div>
      </section>
    </main>
  );
}


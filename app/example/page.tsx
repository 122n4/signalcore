import { pickByLang, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

function t(
  lang: SiteLang,
  value: { en: string; pt?: string; es?: string; fr?: string; de?: string; it?: string }
) {
  return pickByLang(lang, value);
}

export default async function ExamplePage({
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
        <p className="text-xs font-semibold text-ink-500">Syntrake - {t(lang, { en: "Example", pt: "Exemplo", es: "Ejemplo", fr: "Exemple", de: "Beispiel", it: "Esempio" })}</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          {t(lang, {
            en: "A real example - what Syntrake means by \"context\"",
            pt: "Um exemplo real - o que Syntrake quer dizer com \"contexto\"",
            es: "Un ejemplo real - lo que Syntrake quiere decir por \"contexto\"",
            fr: "Un exemple reel - ce que Syntrake entend par \"contexte\"",
            de: "Ein echtes Beispiel - was Syntrake mit \"Kontext\" meint",
            it: "Un esempio reale - cosa intende Syntrake per \"contesto\"",
          })}
        </h1>

        <p className="mt-4 text-sm italic text-ink-500">
          <strong>{t(lang, { en: "Rule of the week:", pt: "Regra da semana:", es: "Regla de la semana:", fr: "Regle de la semaine :", de: "Regel der Woche:", it: "Regola della settimana:" })}</strong>{" "}
          {t(lang, {
            en: "If you feel urgency, slow down.",
            pt: "Se sentes urgencia, abranda.",
            es: "Si sientes urgencia, desacelera.",
            fr: "Si vous ressentez de l urgence, ralentissez.",
            de: "Wenn du Dringlichkeit spuerrst, werde langsamer.",
            it: "Se senti urgenza, rallenta.",
          })}
        </p>

        <p className="mt-6 text-base text-ink-700">
          {t(lang, {
            en: "This page shows the kind of weekly clarity Syntrake provides: a simple market regime read, horizon separation, and calm guardrails - without signals or predictions.",
            pt: "Esta pagina mostra o tipo de clareza semanal que o Syntrake oferece: leitura simples de regime de mercado, separacao de horizontes e guardrails calmos - sem sinais ou previsoes.",
            es: "Esta pagina muestra la claridad semanal que ofrece Syntrake: lectura simple del regimen de mercado, separacion de horizontes y guardrails calmados - sin senales ni predicciones.",
            fr: "Cette page montre la clarte hebdomadaire de Syntrake : lecture simple du regime de marche, separation des horizons et guardrails calmes - sans signaux ni predictions.",
            de: "Diese Seite zeigt die woechentliche Klarheit von Syntrake: einfache Marktregime-Lesung, Horizonttrennung und ruhige Guardrails - ohne Signale oder Prognosen.",
            it: "Questa pagina mostra la chiarezza settimanale offerta da Syntrake: lettura semplice del regime di mercato, separazione orizzonti e guardrail calmi - senza segnali o previsioni.",
          })}
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{t(lang, { en: "This week (example)", pt: "Esta semana (exemplo)", es: "Esta semana (ejemplo)", fr: "Cette semaine (exemple)", de: "Diese Woche (Beispiel)", it: "Questa settimana (esempio)" })}</h2>
          <p className="mt-2 text-sm text-ink-700">
            {t(lang, {
              en: "Market conditions are mixed. Volatility remains elevated and momentum is fragile - the market is searching for direction rather than committing to one.",
              pt: "As condicoes de mercado estao mistas. A volatilidade continua elevada e o momentum fragil - o mercado procura direcao em vez de assumir uma.",
              es: "Las condiciones del mercado estan mixtas. La volatilidad sigue elevada y el momentum fragil - el mercado busca direccion en vez de comprometerse con una.",
              fr: "Les conditions de marche sont mixtes. La volatilite reste elevee et le momentum fragile - le marche cherche une direction plutot que de s engager.",
              de: "Die Marktbedingungen sind gemischt. Die Volatilitaet bleibt hoch und das Momentum fragil - der Markt sucht Richtung statt sich festzulegen.",
              it: "Le condizioni di mercato sono miste. La volatilita resta elevata e il momentum fragile - il mercato cerca direzione invece di impegnarsi.",
            })}
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">{t(lang, { en: "Short-term", pt: "Curto prazo", es: "Corto plazo", fr: "Court terme", de: "Kurzfristig", it: "Breve termine" })}</p>
              <p className="mt-2 text-sm text-ink-700">{t(lang, { en: "More noise than direction. Avoid impulsive changes.", pt: "Mais ruido que direcao. Evita mudancas impulsivas.", es: "Mas ruido que direccion. Evita cambios impulsivos.", fr: "Plus de bruit que de direction. Evitez les changements impulsifs.", de: "Mehr Rauschen als Richtung. Vermeide impulsive Aenderungen.", it: "Piu rumore che direzione. Evita cambi impulsivi." })}</p>
            </div>

            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">{t(lang, { en: "Medium-term", pt: "Medio prazo", es: "Medio plazo", fr: "Moyen terme", de: "Mittelfristig", it: "Medio termine" })}</p>
              <p className="mt-2 text-sm text-ink-700">{t(lang, { en: "Selective. Confirmation is fragile - keep expectations realistic.", pt: "Seletivo. A confirmacao e fragil - mantem expectativas realistas.", es: "Selectivo. La confirmacion es fragil - manten expectativas realistas.", fr: "Selectif. La confirmation est fragile - gardez des attentes realistes.", de: "Selektiv. Bestaetigung ist fragil - halte Erwartungen realistisch.", it: "Selettivo. La conferma e fragile - mantieni aspettative realistiche." })}</p>
            </div>

            <div className="rounded-2xl border border-border-soft bg-white p-4">
              <p className="text-sm font-semibold">{t(lang, { en: "Long-term", pt: "Longo prazo", es: "Largo plazo", fr: "Long terme", de: "Langfristig", it: "Lungo termine" })}</p>
              <p className="mt-2 text-sm text-ink-700">{t(lang, { en: "Constructive. Transitions often prepare the next cycle - consistency wins.", pt: "Construtivo. Transicoes muitas vezes preparam o proximo ciclo - consistencia vence.", es: "Constructivo. Las transiciones suelen preparar el siguiente ciclo - la consistencia gana.", fr: "Constructif. Les transitions preparent souvent le cycle suivant - la constance gagne.", de: "Konstruktiv. Uebergaenge bereiten oft den naechsten Zyklus vor - Konsistenz gewinnt.", it: "Costruttivo. Le transizioni spesso preparano il ciclo successivo - la costanza vince." })}</p>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">{t(lang, { en: "Guardrails (the point)", pt: "Guardrails (o ponto)", es: "Guardrails (el punto)", fr: "Guardrails (l essentiel)", de: "Guardrails (der Punkt)", it: "Guardrail (il punto)" })}</h2>
          <p className="mt-2 text-sm text-ink-700">{t(lang, { en: "Not \"what to buy\". Just what tends to protect decision quality in this environment.", pt: "Nao e \"o que comprar\". E o que tende a proteger qualidade de decisao neste ambiente.", es: "No es \"que comprar\". Es lo que tiende a proteger la calidad de decision en este entorno.", fr: "Ce n est pas \"quoi acheter\". C est ce qui protege la qualite de decision dans cet environnement.", de: "Nicht \"was kaufen\". Sondern was in diesem Umfeld die Entscheidungsqualitaet schuetzt.", it: "Non e \"cosa comprare\". E cio che tende a proteggere la qualita decisionale in questo ambiente." })}</p>

          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "Keep actions slow and deliberate", pt: "Mantem acoes lentas e deliberadas", es: "Manten acciones lentas y deliberadas", fr: "Gardez des actions lentes et deliberees", de: "Halte Aktionen langsam und bewusst", it: "Mantieni azioni lente e deliberate" })}</li>
            <li>- {t(lang, { en: "Avoid chasing short moves out of urgency", pt: "Evita perseguir movimentos curtos por urgencia", es: "Evita perseguir movimientos cortos por urgencia", fr: "Evitez de poursuivre des mouvements courts par urgence", de: "Vermeide es, aus Dringlichkeit kurze Bewegungen zu jagen", it: "Evita di inseguire movimenti brevi per urgenza" })}</li>
            <li>- {t(lang, { en: "Prioritize position sizing over timing", pt: "Prioriza dimensionamento de posicao sobre timing", es: "Prioriza tamano de posicion sobre timing", fr: "Priorisez le dimensionnement de position plutot que le timing", de: "Priorisiere Positionsgroesse vor Timing", it: "Dai priorita al dimensionamento posizione rispetto al timing" })}</li>
            <li>- {t(lang, { en: "If you feel urgency, that is usually the signal to slow down", pt: "Se sentires urgencia, normalmente esse e o sinal para abrandar", es: "Si sientes urgencia, normalmente esa es la senal para desacelerar", fr: "Si vous ressentez de l urgence, c est souvent le signal pour ralentir", de: "Wenn du Dringlichkeit spuerrst, ist das meist das Signal langsamer zu werden", it: "Se senti urgenza, di solito e il segnale per rallentare" })}</li>
          </ul>
        </div>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold">{t(lang, { en: "Want this every week", pt: "Queres isto todas as semanas", es: "Quieres esto cada semana", fr: "Vous voulez cela chaque semaine", de: "Willst du das jede Woche", it: "Vuoi questo ogni settimana" })}</h2>
          <p className="mt-2 text-sm text-ink-700">{t(lang, { en: "Full access includes the complete weekly Market Map, horizon posture, and member-only context.", pt: "O acesso completo inclui Market Map semanal completo, postura por horizonte e contexto exclusivo para membros.", es: "El acceso completo incluye Market Map semanal completo, postura por horizonte y contexto solo para miembros.", fr: "L acces complet inclut le Market Map hebdo complet, la posture par horizon et le contexte reserve aux membres.", de: "Der volle Zugang umfasst die komplette woechentliche Market Map, Horizont-Posture und mitgliedsexklusiven Kontext.", it: "L accesso completo include Market Map settimanale completo, postura per orizzonte e contesto riservato ai membri." })}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={link("/market-map")}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              {t(lang, { en: "Explore the Market Map", pt: "Explorar o Market Map", es: "Explorar el Market Map", fr: "Explorer le Market Map", de: "Market Map erkunden", it: "Esplora il Market Map" })}
            </a>

            <a
              href={link("/pricing")}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
            >
              {t(lang, { en: "Get early access", pt: "Obter acesso antecipado", es: "Obtener acceso anticipado", fr: "Obtenir acces anticipe", de: "Fruehzugang erhalten", it: "Ottieni accesso anticipato" })}
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


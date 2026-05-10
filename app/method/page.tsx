import { pickByLang, type Multilingual, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

function t(
  lang: SiteLang,
  value: Multilingual
) {
  return pickByLang(lang, value);
}

export default async function Method({
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
        <p className="text-xs font-semibold text-ink-500">Syntrake - {t(lang, { en: "Method", pt: "Metodo", es: "Metodo", fr: "Methode", de: "Methode", it: "Metodo" })}</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          {t(lang, {
            en: "Method - how Syntrake thinks",
            pt: "Metodo - como o Syntrake pensa",
            es: "Metodo - como piensa Syntrake",
            fr: "Methode - comment pense Syntrake",
            de: "Methode - wie Syntrake denkt",
            it: "Metodo - come pensa Syntrake",
          })}
        </h1>

        <p className="mt-4 text-base text-ink-700">
          {t(lang, {
            en: "Syntrake is not a prediction engine. It is a structured way to read market context, separate time horizons, and reduce reactive decision-making.",
            pt: "Syntrake nao e um motor de previsao. E uma forma estruturada de ler contexto de mercado, separar horizontes temporais e reduzir decisoes reativas.",
            es: "Syntrake no es un motor de prediccion. Es una forma estructurada de leer contexto de mercado, separar horizontes temporales y reducir decisiones reactivas.",
            fr: "Syntrake n est pas un moteur de prediction. C est une facon structuree de lire le contexte de marche, separer les horizons et reduire les decisions reactives.",
            de: "Syntrake ist keine Vorhersage-Engine. Es ist eine strukturierte Art, Marktkontext zu lesen, Zeithorizonte zu trennen und reaktive Entscheidungen zu reduzieren.",
            it: "Syntrake non e un motore di previsione. E un modo strutturato di leggere il contesto di mercato, separare orizzonti temporali e ridurre decisioni reattive.",
          })}
        </p>

        <div className="mt-10 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{t(lang, { en: "What we look at", pt: "O que analisamos", es: "Que analizamos", fr: "Ce que nous analysons", de: "Was wir ansehen", it: "Cosa analizziamo" })}</h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "Price action and trend structure (context, not targets)", pt: "Price action e estrutura de tendencia (contexto, nao alvos)", es: "Price action y estructura de tendencia (contexto, no objetivos)", fr: "Price action et structure de tendance (contexte, pas objectifs)", de: "Price Action und Trendstruktur (Kontext, keine Ziele)", it: "Price action e struttura trend (contesto, non target)" })}</li>
            <li>- {t(lang, { en: "Volatility and drawdown sensitivity", pt: "Volatilidade e sensibilidade a drawdown", es: "Volatilidad y sensibilidad a drawdown", fr: "Volatilite et sensibilite au drawdown", de: "Volatilitaet und Drawdown-Sensitivitaet", it: "Volatilita e sensibilita al drawdown" })}</li>
            <li>- {t(lang, { en: "Cross-asset behavior (how things move together)", pt: "Comportamento cross-asset (como os ativos se movem juntos)", es: "Comportamiento cross-asset (como se mueven juntos)", fr: "Comportement cross-asset (comment les actifs bougent ensemble)", de: "Cross-Asset-Verhalten (wie sich Dinge gemeinsam bewegen)", it: "Comportamento cross-asset (come si muovono insieme)" })}</li>
            <li>- {t(lang, { en: "Macro context as a pressure system (not as a headline feed)", pt: "Contexto macro como sistema de pressao (nao feed de manchetes)", es: "Contexto macro como sistema de presion (no feed de titulares)", fr: "Contexte macro comme systeme de pression (pas fil d actualites)", de: "Makrokontext als Drucksystem (nicht als Schlagzeilen-Feed)", it: "Contesto macro come sistema di pressione (non feed di notizie)" })}</li>
            <li>- {t(lang, { en: "Market participation/breadth (when relevant)", pt: "Participacao/largura de mercado (quando relevante)", es: "Participacion/amplitud de mercado (cuando relevante)", fr: "Participation/largeur de marche (quand pertinent)", de: "Marktteilnahme/Breite (wenn relevant)", it: "Partecipazione/ampiezza mercato (quando rilevante)" })}</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-canvas-50 p-6 shadow-card">
          <h2 className="text-lg font-semibold">{t(lang, { en: "How regimes are classified", pt: "Como os regimes sao classificados", es: "Como se clasifican los regimenes", fr: "Comment les regimes sont classes", de: "Wie Regime klassifiziert werden", it: "Come vengono classificati i regimi" })}</h2>
          <p className="mt-2 text-sm text-ink-700">{t(lang, { en: "Regimes are deliberately slow to change. Syntrake prioritizes stability over responsiveness.", pt: "Os regimes mudam de forma deliberadamente lenta. Syntrake prioriza estabilidade sobre reatividade.", es: "Los regimenes cambian deliberadamente lento. Syntrake prioriza estabilidad sobre reactividad.", fr: "Les regimes changent deliberement lentement. Syntrake privilegie la stabilite sur la reactivite.", de: "Regime wechseln bewusst langsam. Syntrake priorisiert Stabilitaet vor Reaktionsgeschwindigkeit.", it: "I regimi cambiano deliberatamente lentamente. Syntrake privilegia stabilita rispetto a reattivita." })}</p>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "A regime is a description of the environment (not a trade idea)", pt: "Um regime e descricao do ambiente (nao ideia de trade)", es: "Un regimen describe el entorno (no una idea de trade)", fr: "Un regime decrit l environnement (pas une idee de trade)", de: "Ein Regime beschreibt das Umfeld (keine Trade-Idee)", it: "Un regime descrive l ambiente (non idea di trade)" })}</li>
            <li>- {t(lang, { en: "It does not flip because of a single move or a single news item", pt: "Nao muda por um unico movimento ou noticia", es: "No cambia por un solo movimiento o noticia", fr: "Il ne change pas a cause d un seul mouvement ou d une seule nouvelle", de: "Es wechselt nicht wegen einer einzelnen Bewegung oder Nachricht", it: "Non cambia per un singolo movimento o notizia" })}</li>
            <li>- {t(lang, { en: "Changes require consistent confirmation across multiple dimensions", pt: "Mudancas exigem confirmacao consistente em varias dimensoes", es: "Los cambios requieren confirmacion consistente en varias dimensiones", fr: "Les changements exigent une confirmation coherente sur plusieurs dimensions", de: "Aenderungen brauchen konsistente Bestaetigung ueber mehrere Dimensionen", it: "I cambi richiedono conferma coerente su piu dimensioni" })}</li>
            <li>- {t(lang, { en: "Low confidence means be humble, not act faster", pt: "Baixa confianca significa ser humilde, nao agir mais rapido", es: "Baja confianza significa humildad, no actuar mas rapido", fr: "Faible confiance signifie rester humble, pas agir plus vite", de: "Niedrige Konfidenz heisst demuetig bleiben, nicht schneller handeln", it: "Bassa confidenza significa essere umili, non agire piu veloce" })}</li>
          </ul>
        </div>

        <div className="mt-6 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold">{t(lang, { en: "How to use it", pt: "Como usar", es: "Como usarlo", fr: "Comment l utiliser", de: "So nutzt du es", it: "Come usarlo" })}</h2>
          <ol className="mt-4 space-y-2 text-sm text-ink-700">
            <li>1) {t(lang, { en: "Check the Market Map once a week", pt: "Verifica o Market Map uma vez por semana", es: "Revisa el Market Map una vez por semana", fr: "Consultez le Market Map une fois par semaine", de: "Pruefe die Market Map einmal pro Woche", it: "Controlla il Market Map una volta a settimana" })}</li>
            <li>2) {t(lang, { en: "Read horizons (S / M / L) separately", pt: "Lê os horizontes (S / M / L) separadamente", es: "Lee horizontes (S / M / L) por separado", fr: "Lisez les horizons (S / M / L) separement", de: "Lies Horizonte (S / M / L) getrennt", it: "Leggi gli orizzonti (S / M / L) separatamente" })}</li>
            <li>3) {t(lang, { en: "Apply guardrails: act slowly, avoid urgency", pt: "Aplica guardrails: age devagar, evita urgencia", es: "Aplica guardrails: actua despacio, evita urgencia", fr: "Appliquez les guardrails : agissez lentement, evitez l urgence", de: "Wende Guardrails an: handle langsam, vermeide Dringlichkeit", it: "Applica i guardrail: agisci lentamente, evita urgenza" })}</li>
            <li>4) {t(lang, { en: "Update your portfolio only when change is necessary", pt: "Atualiza o portfolio apenas quando a mudanca for necessaria", es: "Actualiza la cartera solo cuando el cambio sea necesario", fr: "Mettez a jour le portefeuille seulement quand le changement est necessaire", de: "Aktualisiere dein Portfolio nur wenn Aenderung noetig ist", it: "Aggiorna il portafoglio solo quando il cambiamento e necessario" })}</li>
          </ol>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a
              href={link("/example")}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-6 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              {t(lang, { en: "See a real example", pt: "Ver um exemplo real", es: "Ver un ejemplo real", fr: "Voir un exemple reel", de: "Ein echtes Beispiel sehen", it: "Vedi un esempio reale" })}
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


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
            es: "Del plan a la ejecucion sin ocultar el proceso de decision.",
            fr: "Du plan a l'execution sans cacher le processus de decision.",
            de: "Vom Plan bis zur Ausfuhrung, ohne den Entscheidungsprozess zu verbergen.",
            it: "Dal piano all'esecuzione senza nascondere il processo decisionale.",
          })}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-700">
          {t(lang, {
            en: "Syntrake is designed to show what changes first, what stays free, and when Trading Pro becomes worth paying for. The point is not more signals. The point is fewer avoidable mistakes around capital, timing, and risk.",
            pt: "O Syntrake foi desenhado para mostrar o que muda primeiro, o que fica gratis e quando o Trading Pro passa a valer a pena. O objetivo nao e mais sinais. O objetivo e menos erros evitaveis em capital, timing e risco.",
            es: "Syntrake esta disenado para mostrar que cambia primero, que sigue siendo gratuito y cuando vale la pena pagar por Trading Pro. La cuestion no es mas senales. La cuestion es que habra menos errores evitables en torno al capital, el momento oportuno y el riesgo.",
            fr: "Syntrake est concu pour montrer ce qui change en premier, ce qui reste gratuit et quand Trading Pro vaut la peine d'etre paye. Il ne s'agit pas de plus de signaux. L'objectif est de reduire le nombre d'erreurs evitables en matiere de capital, de timing et de risque.",
            de: "Syntrake soll zeigen, was sich zuerst andert, was kostenlos bleibt und wann sich Trading Pro lohnt. Es geht nicht um mehr Signale. Es geht darum, weniger vermeidbare Fehler in Bezug auf Kapital, Timing und Risiko zu machen.",
            it: "Syntrake e progettato per mostrare cosa cambia per primo, cosa rimane gratuito e quando vale la pena pagare per Trading Pro. Il punto non sono piu segnali. Il punto e che ci sono meno errori evitabili in termini di capitale, tempistica e rischio.",
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
          es: "Mapa del sistema",
          fr: "Carte du systeme",
          de: "Systemkarte",
          it: "Mappa del sistema",
        })}
        title={t(lang, {
          en: "Syntrake is a decision system with visible layers, not a black-box signal feed.",
          pt: "O Syntrake e um sistema de decisao com camadas visiveis, nao um feed opaco de sinais.",
          es: "Syntrake es un sistema de decision con capas visibles, no una senal de caja negra.",
          fr: "Syntrake est un systeme de decision avec des couches visibles, et non un signal de type boite noire.",
          de: "Syntrake ist ein Entscheidungssystem mit sichtbaren Schichten, kein Black-Box-Signalfeed.",
          it: "Syntrake e un sistema decisionale con livelli visibili, non un feed di segnali a scatola nera.",
        })}
        body={t(lang, {
          en: "Investing handles the capital plan and the daily operating loop. Trading reads the market, ranks what deserves attention, and prepares broker-ready execution only when depth actually matters.",
          pt: "O Investing trata do plano de capital e do loop diario. O Trading le o mercado, ranqueia o que merece atencao e prepara execucao pronta para broker so quando a profundidade importa mesmo.",
          es: "La inversion se encarga del plan de capital y del ciclo operativo diario. El trading lee el mercado, clasifica lo que merece atencion y prepara la ejecucion lista para el broker solo cuando la profundidad realmente importa.",
          fr: "L'investissement gere le plan de capital et la boucle operationnelle quotidienne. Le trading lit le marche, classe ce qui merite attention et prepare une execution prete pour le broker uniquement lorsque la profondeur compte reellement.",
          de: "Investing kummert sich um den Kapitalplan und die tagliche Betriebsschleife. Der Handel erkennt den Markt, ordnet ein, was Aufmerksamkeit verdient, und bereitet die maklerbereite Ausfuhrung nur dann vor, wenn es tatsachlich auf die Tiefe ankommt.",
          it: "L'investimento gestisce il piano di capitale e il ciclo operativo quotidiano. Il trading legge il mercato, classifica cio che merita attenzione e prepara l'esecuzione pronta per il broker solo quando la profondita conta davvero.",
        })}
        stats={[
          {
            label: t(lang, { en: "Workspaces", pt: "Workspaces",
            es: "Espacios de trabajo",
            fr: "Espaces de travail",
            de: "Arbeitsbereiche",
            it: "Spazi di lavoro", }),
            value: t(lang, { en: "2 clear systems", pt: "2 sistemas claros",
            es: "2 sistemas claros",
            fr: "2 systemes clairs",
            de: "2 klare Systeme",
            it: "2 sistemi chiari", }),
            detail: t(lang, {
              en: "Investing handles the plan and capital operating logic. Trading handles market scan and execution prep.",
              pt: "O Investing trata do plano e da logica operacional do capital. O Trading trata da leitura de mercado e da preparacao da execucao.",
              es: "La inversion maneja el plan y la logica operativa del capital. Trading se encarga del escaneo del mercado y la preparacion de la ejecucion.",
              fr: "L'investissement gere la logique de fonctionnement du plan et du capital. Le trading gere l'analyse du marche et la preparation de l'execution.",
              de: "Investing kummert sich um die Plan- und Kapitalbetriebslogik. Der Handel ubernimmt die Marktanalyse und die Ausfuhrungsvorbereitung.",
              it: "L'investimento gestisce il piano e la logica operativa del capitale. Il trading gestisce la scansione del mercato e la preparazione dell'esecuzione.",
            }),
          },
          {
            label: t(lang, { en: "Decision loop", pt: "Loop de decisao",
            es: "Bucle de decision",
            fr: "Boucle de decision",
            de: "Entscheidungsschleife",
            it: "Ciclo decisionale", }),
            value: t(lang, { en: "1 next best action", pt: "1 proxima melhor acao",
            es: "1 siguiente mejor accion",
            fr: "1 prochaine meilleure action",
            de: "1 nachstbeste Aktion",
            it: "1 azione migliore successiva", }),
            detail: t(lang, {
              en: "Daily and Advisor keep the user focused on the highest-value move now.",
              pt: "Daily e Advisor mantem o utilizador focado na acao de maior valor agora.",
              es: "Daily y Advisor mantienen al usuario enfocado en el movimiento de mayor valor ahora.",
              fr: "Daily et Advisor maintiennent l'utilisateur concentre sur le mouvement le plus rentable du moment.",
              de: "Daily und Advisor sorgen dafur, dass sich der Benutzer jetzt auf die Bewegung mit dem hochsten Wert konzentriert.",
              it: "Daily e Advisor mantengono ora l'utente concentrato sulla mossa di maggior valore.",
            }),
          },
          {
            label: t(lang, { en: "Execution model", pt: "Modelo de execucao",
            es: "Modelo de ejecucion",
            fr: "Modele d'execution",
            de: "Ausfuhrungsmodell",
            it: "Modello di esecuzione", }),
            value: t(lang, { en: "External broker control", pt: "Controlo via broker externo",
            es: "Control de intermediario externo",
            fr: "Controle des brokers externes",
            de: "Externe Maklersteuerung",
            it: "Controllo del broker esterno", }),
            detail: t(lang, {
              en: "Syntrake prepares the order logic and checklist while the user keeps execution control.",
              pt: "O Syntrake prepara a logica da ordem e a checklist enquanto o utilizador mantem o controlo da execucao.",
              es: "Syntrake prepara la logica de la orden y la lista de verificacion mientras el usuario mantiene el control de la ejecucion.",
              fr: "Syntrake prepare la logique de commande et la liste de controle tandis que l'utilisateur garde le controle de l'execution.",
              de: "Syntrake bereitet die Bestelllogik und Checkliste vor, wahrend der Benutzer die Kontrolle uber die Ausfuhrung behalt.",
              it: "Syntrake prepara la logica dell'ordine e la lista di controllo mentre l'utente mantiene il controllo dell'esecuzione.",
            }),
          },
          {
            label: t(lang, { en: "Verification", pt: "Verificacao",
            es: "Verificacion",
            fr: "Verification",
            de: "Uberprufung",
            it: "Verifica", }),
            value: t(lang, { en: "Real-time cross-check", pt: "Cross-check em tempo real",
            es: "Verificacion cruzada en tiempo real",
            fr: "Verification croisee en temps reel",
            de: "Gegenprufung in Echtzeit",
            it: "Controllo incrociato in tempo reale", }),
            detail: t(lang, {
              en: "Valid trades can be compared against external references before execution.",
              pt: "Os trades validos podem ser comparados com referencias externas antes da execucao.",
              es: "Las operaciones validas se pueden comparar con referencias externas antes de su ejecucion.",
              fr: "Les transactions valides peuvent etre comparees a des references externes avant leur execution.",
              de: "Gultige Trades konnen vor der Ausfuhrung mit externen Referenzen verglichen werden.",
              it: "Le operazioni valide possono essere confrontate con riferimenti esterni prima dell'esecuzione.",
            }),
          },
        ]}
        cards={[
          {
            title: t(lang, { en: "Investing OS", pt: "Investing OS",
            es: "Invertir en sistema operativo",
            fr: "Investir dans le systeme d'exploitation",
            de: "Betriebssystem investieren",
            it: "Investire nel sistema operativo", }),
            body: t(lang, {
              en: "Goal, horizon, guardrails, portfolio, and advisor logic stay visible so the user understands the capital path before subscribing to anything.",
              pt: "Objetivo, horizonte, guardrails, portfolio e logica do advisor mantem-se visiveis para o utilizador perceber o caminho do capital antes de subscrever qualquer coisa.",
              es: "La logica de objetivos, horizontes, barreras, cartera y asesor permanece visible para que el usuario comprenda el camino del capital antes de suscribirse a cualquier cosa.",
              fr: "L'objectif, l'horizon, les garde-fous, le portefeuille et la logique du conseiller restent visibles afin que l'utilisateur comprenne le cheminement du capital avant de souscrire a quoi que ce soit.",
              de: "Ziel, Horizont, Leitplanken, Portfolio und Beraterlogik bleiben sichtbar, sodass der Benutzer den Kapitalpfad versteht, bevor er etwas abonniert.",
              it: "Obiettivo, orizzonte, guardrail, portafoglio e logica del consulente rimangono visibili in modo che l'utente comprenda il percorso del capitale prima di sottoscrivere qualsiasi cosa.",
            }),
            bullets: [
              t(lang, { en: "The plan becomes a live operating contract.", pt: "O plano torna-se um contrato operacional vivo.",
              es: "El plan se convierte en un contrato operativo en vivo.",
              fr: "Le plan devient un contrat d'exploitation en direct.",
              de: "Der Plan wird zu einem Live-Betriebsvertrag.",
              it: "Il piano diventa un contratto operativo live.", }),
              t(lang, { en: "Portfolio surfaces leaks and valuation issues clearly.", pt: "O portfolio mostra leaks e problemas de valorizacao de forma clara.",
              es: "La cartera saca a la luz claramente las filtraciones y los problemas de valoracion.",
              fr: "Le portefeuille fait clairement apparaitre des fuites et des problemes de valorisation.",
              de: "Das Portfolio zeigt Lecks und Bewertungsprobleme deutlich auf.",
              it: "Il portafoglio evidenzia chiaramente le perdite e i problemi di valutazione.", }),
              t(lang, { en: "Receipts create proof over time.", pt: "Os recibos criam prova ao longo do tempo.",
              es: "Los recibos crean pruebas con el tiempo.",
              fr: "Les recus creent une preuve au fil du temps.",
              de: "Quittungen stellen im Laufe der Zeit einen Beweis dar.",
              it: "Le ricevute creano prova nel tempo.", }),
            ],
          },
          {
            title: t(lang, { en: "Trading Desk", pt: "Trading Desk",
            es: "Mesa de operaciones",
            fr: "Trading Desk",
            de: "Handelsschalter",
            it: "Banco di negoziazione", }),
            body: t(lang, {
              en: "Radar, Watchlist, Opportunities, Execution, Risk, Journal, and Alerts each have a distinct role instead of one noisy surface pretending everything is actionable.",
              pt: "Radar, Watchlist, Opportunities, Execution, Risk, Journal e Alerts tem um papel distinto em vez de uma unica superficie ruidosa a fingir que tudo e acionavel.",
              es: "Radar, Lista de vigilancia, Oportunidades, Ejecucion, Riesgo, Diario y Alertas tienen cada uno una funcion distinta en lugar de una superficie ruidosa que finge que todo es procesable.",
              fr: "Radar, liste de surveillance, opportunites, execution, risque, journal et alertes ont chacun un role distinct au lieu d'une surface bruyante pretendant que tout est exploitable.",
              de: "Radar, Beobachtungsliste, Chancen, Ausfuhrung, Risiko, Journal und Warnungen spielen jeweils eine eigene Rolle und nicht eine laute Oberflache, die vorgibt, alles sei umsetzbar.",
              it: "Radar, Watchlist, Opportunita, Esecuzione, Rischio, Diario e Avvisi hanno ciascuno un ruolo distinto invece di una superficie rumorosa che finge che tutto sia utilizzabile.",
            }),
            bullets: [
              t(lang, { en: "Radar separates market scan from execution-ready setups.", pt: "O Radar separa a leitura de mercado dos setups prontos para execucao.",
              es: "Radar separa el escaneo de mercado de las configuraciones listas para ejecutar.",
              fr: "Radar separe l'analyse du marche des configurations pretes a l'execution.",
              de: "Radar trennt den Marktscan von ausfuhrungsbereiten Setups.",
              it: "Il radar separa la scansione del mercato dalle configurazioni pronte per l'esecuzione.", }),
              t(lang, { en: "Execution stays intentionally selective instead of flooding the user with noise.", pt: "A Execution mantem-se seletiva em vez de inundar o utilizador com ruido.",
              es: "La ejecucion se mantiene intencionalmente selectiva en lugar de inundar al usuario con ruido.",
              fr: "L'execution reste intentionnellement selective au lieu d'inonder l'utilisateur de bruit.",
              de: "Die Ausfuhrung bleibt bewusst selektiv, anstatt den Benutzer mit Larm zu uberfluten.",
              it: "L'esecuzione rimane intenzionalmente selettiva invece di inondare l'utente di rumore.", }),
              t(lang, { en: "Risk framing and verification stay visible before money moves.", pt: "O enquadramento de risco e a verificacao mantem-se visiveis antes do dinheiro se mover.",
              es: "El marco de riesgo y la verificacion permanecen visibles antes de que se mueva el dinero.",
              fr: "Le cadrage et la verification des risques restent visibles avant les mouvements d'argent.",
              de: "Risikoabgrenzung und -uberprufung bleiben sichtbar, bevor Geld bewegt wird.",
              it: "L'inquadramento e la verifica del rischio rimangono visibili prima che il denaro si muova.", }),
            ],
          },
        ]}
        links={[
          {
            label: t(lang, { en: "Trust center", pt: "Trust center",
            es: "Centro de confianza",
            fr: "Centre de confiance",
            de: "Vertrauenszentrum",
            it: "Centro fiducia", }),
            href: link("/trust"),
            tone: "secondary",
          },
          {
            label: t(lang, { en: "Pricing", pt: "Precos",
            es: "Precios",
            fr: "Tarifs",
            de: "Preise",
            it: "Prezzi", }),
            href: link("/pricing"),
            tone: "primary",
          },
        ]}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            step: t(lang, { en: "Step 1", pt: "Passo 1",
            es: "Paso 1",
            fr: "Etape 1",
            de: "Schritt 1",
            it: "Passaggio 1", }),
            title: t(lang, {
              en: "Set the target",
              pt: "Define o alvo",
              es: "Establecer el objetivo",
              fr: "Definir la cible",
              de: "Legen Sie das Ziel fest",
              it: "Imposta l'obiettivo",
            }),
            body: t(lang, {
              en: "Define the goal and timeframe. Syntrake anchors every later decision to that target.",
              pt: "Define o objetivo e o horizonte temporal. O Syntrake ancora as decisoes seguintes a esse alvo.",
              es: "Definir el objetivo y el plazo. Syntrake ancla cada decision posterior a ese objetivo.",
              fr: "Definir l'objectif et le calendrier. Syntrake ancre chaque decision ulterieure sur cet objectif.",
              de: "Definieren Sie das Ziel und den Zeitrahmen. Syntrake verankert jede spatere Entscheidung an diesem Ziel.",
              it: "Definire l'obiettivo e il periodo di tempo. Syntrake ancora ogni decisione successiva a quell'obiettivo.",
            }),
          },
          {
            step: t(lang, { en: "Step 2", pt: "Passo 2",
            es: "Paso 2",
            fr: "Etape 2",
            de: "Schritt 2",
            it: "Passaggio 2", }),
            title: t(lang, {
              en: "Build the operating rules",
              pt: "Constroi as regras operacionais",
              es: "Construir las reglas operativas.",
              fr: "Construire les regles de fonctionnement",
              de: "Erstellen Sie die Betriebsregeln",
              it: "Costruire le regole operative",
            }),
            body: t(lang, {
              en: "Buckets, guardrails, policy, and playbooks turn intent into a repeatable framework.",
              pt: "Buckets, guardrails, politica e playbooks transformam a intencao num framework repetivel.",
              es: "Los cubos, las barreras, las politicas y los manuales convierten la intencion en un marco repetible.",
              fr: "Les compartiments, les garde-fous, les politiques et les playbooks transforment l'intention en un cadre reproductible.",
              de: "Buckets, Leitplanken, Richtlinien und Playbooks verwandeln die Absicht in einen wiederholbaren Rahmen.",
              it: "Sezioni, guardrail, policy e playbook trasformano le intenzioni in un quadro ripetibile.",
            }),
          },
          {
            step: t(lang, { en: "Step 3", pt: "Passo 3",
            es: "Paso 3",
            fr: "Etape 3",
            de: "Schritt 3",
            it: "Passaggio 3", }),
            title: t(lang, {
              en: "Follow the next best action",
              pt: "Segue a proxima melhor acao",
              es: "Siga la siguiente mejor accion",
              fr: "Suivez la prochaine meilleure action",
              de: "Befolgen Sie die nachstbeste Aktion",
              it: "Segui la migliore azione successiva",
            }),
            body: t(lang, {
              en: "Syntrake ranks the next move, explains why it matters, and shows the risk around it.",
              pt: "O Syntrake ranqueia o proximo movimento, explica porque importa e mostra o risco a volta.",
              es: "Syntrake clasifica el proximo paso, explica por que es importante y muestra el riesgo que conlleva.",
              fr: "Syntrake classe le prochain mouvement, explique pourquoi il est important et montre le risque qui l'entoure.",
              de: "Syntrake bewertet den nachsten Schritt, erklart, warum er wichtig ist, und zeigt das damit verbundene Risiko auf.",
              it: "Syntrake classifica la mossa successiva, spiega perche e importante e mostra i rischi che la comportano.",
            }),
          },
          {
            step: t(lang, { en: "Step 4", pt: "Passo 4",
            es: "Paso 4",
            fr: "Etape 4",
            de: "Schritt 4",
            it: "Passaggio 4", }),
            title: t(lang, {
              en: "Unlock Pro when depth becomes valuable",
              pt: "Desbloqueia o Pro quando a profundidade ganhar valor",
              es: "Desbloquea Pro cuando la profundidad se vuelve valiosa",
              fr: "Debloquez Pro lorsque la profondeur devient precieuse",
              de: "Schalten Sie Pro frei, wenn die Tiefe wertvoll wird",
              it: "Sblocca Pro quando la profondita diventa preziosa",
            }),
            body: t(lang, {
              en: "Execution, alerts, journal continuity, and tighter risk framing become the paid layer because that is where recurring operational value lives.",
              pt: "Execution, alerts, continuidade de journal e enquadramento de risco mais apertado tornam-se a camada paga porque e ai que vive o valor operacional recorrente.",
              es: "La ejecucion, las alertas, la continuidad del diario y un marco de riesgo mas estricto se convierten en la capa paga porque es alli donde reside el valor operativo recurrente.",
              fr: "L'execution, les alertes, la continuite du journal et un cadrage plus strict des risques deviennent la couche payante, car c'est la que reside la valeur operationnelle recurrente.",
              de: "Ausfuhrung, Warnungen, Journalkontinuitat und eine strengere Risikoabgrenzung werden zur kostenpflichtigen Ebene, da dort der wiederkehrende betriebliche Wert entsteht.",
              it: "L'esecuzione, gli avvisi, la continuita del journal e un quadro di rischio piu rigoroso diventano il livello pagato perche e li che risiede il valore operativo ricorrente.",
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
            {t(lang, { en: "Free first", pt: "Gratis primeiro",
            es: "Gratis primero",
            fr: "Gratuit d'abord",
            de: "Zuerst kostenlos",
            it: "Prima gratis", })}
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
            {t(lang, {
              en: "You can prove the core value before paying.",
              pt: "Podes comprovar o valor central antes de pagar.",
              es: "Puede demostrar el valor fundamental antes de pagar.",
              fr: "Vous pouvez prouver la valeur fondamentale avant de payer.",
              de: "Sie konnen den Kernwert vor der Zahlung nachweisen.",
              it: "Puoi dimostrare il valore fondamentale prima di pagare.",
            })}
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "Investing stays open with Daily, Plan, Portfolio, Advisor, and Autonomy.", pt: "O Investing fica aberto com Daily, Plan, Portfolio, Advisor e Autonomy.",
            es: "La inversion permanece abierta con Daily, Plan, Portfolio, Advisor y Autonomy.",
            fr: "L'investissement reste ouvert avec Daily, Plan, Portfolio, Advisor et Autonomy.",
            de: "Das Investieren bleibt mit Taglich, Plan, Portfolio, Berater und Autonomie offen.",
            it: "L'investimento rimane aperto con Giornaliero, Piano, Portafoglio, Consulente e Autonomia.", })}</li>
            <li>- {t(lang, { en: "Trading Discovery exposes the desk and opportunity flow before the depth paywall.", pt: "O Trading Discovery expõe a desk e o fluxo de oportunidades antes da paywall de profundidade.",
            es: "Trading Discovery expone la mesa y el flujo de oportunidades antes del muro de pago profundo.",
            fr: "Trading Discovery expose le flux de bureau et d'opportunites avant le paywall en profondeur.",
            de: "Trading Discovery deckt den Desk- und Opportunity-Flow vor der Tiefen-Paywall auf.",
            it: "Trading Discovery espone il desk e il flusso di opportunita prima del paywall di profondita.", })}</li>
            <li>- {t(lang, { en: "Trust, pricing, and broker model stay inspectable in public.", pt: "Trust, pricing e modelo de broker mantem-se inspecionaveis em publico.",
            es: "La confianza, los precios y el modelo de broker siguen siendo inspeccionables en publico.",
            fr: "La confiance, la tarification et le modele de broker restent inspectables en public.",
            de: "Vertrauen, Preisgestaltung und Maklermodell bleiben in der Offentlichkeit einsehbar.",
            it: "La fiducia, i prezzi e il modello del broker rimangono ispezionabili in pubblico.", })}</li>
          </ul>
        </div>

        <div className="rounded-3xl border border-border-soft bg-white p-8 shadow-card">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
            {t(lang, { en: "Paid for depth", pt: "Pago pela profundidade",
            es: "Pagado por profundidad",
            fr: "Paye pour la profondeur",
            de: "Bezahlt fur die Tiefe",
            it: "Pagato per la profondita", })}
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
            {t(lang, {
              en: "The monthly subscription exists to reduce live execution mistakes.",
              pt: "A subscricao mensal existe para reduzir erros de execucao em live.",
              es: "La suscripcion mensual existe para reducir los errores de ejecucion en vivo.",
              fr: "L'abonnement mensuel existe pour reduire les erreurs d'execution en direct.",
              de: "Das monatliche Abonnement dient dazu, Fehler bei der Live-Ausfuhrung zu reduzieren.",
              it: "L'abbonamento mensile esiste per ridurre gli errori di esecuzione dal vivo.",
            })}
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-ink-700">
            <li>- {t(lang, { en: "Execution, Risk, Journal, and Alerts get deeper instead of noisier.", pt: "Execution, Risk, Journal e Alerts ficam mais profundos em vez de mais ruidosos.",
            es: "La ejecucion, el riesgo, el diario y las alertas se vuelven mas profundos en lugar de mas ruidosos.",
            fr: "L'execution, le risque, le journal et les alertes deviennent plus profonds au lieu d'etre plus bruyants.",
            de: "Ausfuhrung, Risiko, Journal und Warnungen werden tiefer statt lauter.",
            it: "Esecuzione, Rischio, Diario e Avvisi diventano piu profondi invece che piu rumorosi.", })}</li>
            <li>- {t(lang, { en: "Broker execution stays manual, but the workflow becomes cleaner and more auditable.", pt: "A execucao no broker continua manual, mas o workflow fica mais limpo e auditavel.",
            es: "La ejecucion del broker sigue siendo manual, pero el flujo de trabajo se vuelve mas limpio y auditable.",
            fr: "L'execution du broker reste manuelle, mais le flux de travail devient plus propre et plus verifiable.",
            de: "Die Broker-Ausfuhrung bleibt manuell, aber der Arbeitsablauf wird sauberer und uberprufbarer.",
            it: "L'esecuzione del broker rimane manuale, ma il flusso di lavoro diventa piu pulito e controllabile.", })}</li>
            <li>- {t(lang, { en: "Recurring value comes from adaptation, continuity, and risk control over time.", pt: "O valor recorrente vem da adaptacao, continuidade e controlo de risco ao longo do tempo.",
            es: "El valor recurrente proviene de la adaptacion, la continuidad y el control de riesgos en el tiempo.",
            fr: "La valeur recurrente vient de l'adaptation, de la continuite et du controle des risques au fil du temps.",
            de: "Wiederkehrender Wert entsteht durch Anpassung, Kontinuitat und Risikokontrolle im Laufe der Zeit.",
            it: "Il valore ricorrente deriva dall'adattamento, dalla continuita e dal controllo del rischio nel tempo.", })}</li>
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

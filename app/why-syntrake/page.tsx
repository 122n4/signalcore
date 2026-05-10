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
            es: "La capa paga existe para el momento costoso: justo antes de que abra el broker.",
            fr: "La couche payante existe pour le moment couteux : juste avant l'ouverture du broker.",
            de: "Die kostenpflichtige Ebene existiert fur den teuren Moment: kurz bevor der Broker offnet.",
            it: "Il livello pagato esiste per il momento costoso: subito prima dell'apertura del broker.",
          })}
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-700">
          {t(lang, {
            en: "Syntrake should prove itself before asking for recurring revenue. Trading Pro exists because stale data, weak no-trade discipline, bad sizing, and poor continuity become expensive when live capital is moving.",
            pt: "O Syntrake deve provar-se antes de pedir receita recorrente. O Trading Pro existe porque dados stale, fraca disciplina de nao operar, sizing mau e pouca continuidade ficam caros quando o capital esta em movimento.",
            es: "Syntrake deberia demostrar su valia antes de solicitar ingresos recurrentes. Trading Pro existe porque los datos obsoletos, la debil disciplina de no-trade, el mal dimensionamiento y la mala continuidad se vuelven costosos cuando el capital vivo se mueve.",
            fr: "Syntrake devrait faire ses preuves avant de demander des revenus recurrents. Trading Pro existe parce que des donnees obsoletes, une faible discipline no-trade, un mauvais dimensionnement et une mauvaise continuite deviennent couteux lorsque le capital reel bouge.",
            de: "Syntrake sollte sich beweisen, bevor es wiederkehrende Einnahmen verlangt. Trading Pro existiert, weil veraltete Daten, schwache No-Trade-Disziplin, schlechte Grossenbestimmung und schlechte Kontinuitat teuer werden, wenn lebendiges Kapital bewegt wird.",
            it: "Syntrake dovrebbe mettersi alla prova prima di chiedere entrate ricorrenti. Trading Pro esiste perche i dati obsoleti, la debole disciplina del no-trade, il cattivo dimensionamento e la scarsa continuita diventano costosi quando il capitale vivo si muove.",
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
          es: "Por que pagar?",
          fr: "Pourquoi payer",
          de: "Warum bezahlen?",
          it: "Perche pagare",
        })}
        title={t(lang, {
          en: "Syntrake charges for decision depth, not for basic access.",
          pt: "O Syntrake cobra pela profundidade da decisao, nao pelo acesso basico.",
          es: "Syntrake cobra por la profundidad de la decision, no por el acceso basico.",
          fr: "Syntrake facture la profondeur de decision, pas l'acces de base.",
          de: "Syntrake erhebt Gebuhren fur die Entscheidungstiefe, nicht fur den Basiszugriff.",
          it: "Syntrake addebita i costi per la profondita decisionale, non per l'accesso di base.",
        })}
        body={t(lang, {
          en: "The free layer proves the system. The paid layer exists when timing, sizing, invalidation, freshness, alerts, and journal continuity matter before a broker decision.",
          pt: "A camada gratuita prova o sistema. A camada paga existe quando timing, sizing, invalidation, frescura, alerts e continuidade de journal importam antes de uma decisao no broker.",
          es: "La capa libre prueba el sistema. La capa paga existe cuando el tiempo, el tamano, la invalidacion, la actualidad, las alertas y la continuidad del diario son importantes antes de que un broker tome una decision.",
          fr: "La couche libre prouve le systeme. La couche payante existe lorsque le timing, le dimensionnement, l'invalidation, la fraicheur, les alertes et la continuite du journal sont importants avant la decision d'un broker.",
          de: "Die freie Schicht beweist das System. Die kostenpflichtige Ebene existiert, wenn Timing, Grosse, Invalidierung, Aktualitat, Warnungen und Journalkontinuitat vor einer Broker-Entscheidung von Bedeutung sind.",
          it: "Lo strato libero dimostra il sistema. Il livello a pagamento esiste quando la tempistica, il dimensionamento, l'invalidazione, l'aggiornamento, gli avvisi e la continuita del journal sono importanti prima di una decisione del broker.",
        })}
        stats={[
          {
            label: t(lang, { en: "Investing", pt: "Investing",
            es: "Invertir",
            fr: "Investir",
            de: "Investieren",
            it: "Investire", }),
            value: t(lang, { en: "Free forever", pt: "Gratis para sempre",
            es: "Gratis para siempre",
            fr: "Libre pour toujours",
            de: "Fur immer kostenlos",
            it: "Libero per sempre", }),
            detail: t(lang, {
              en: "The product earns trust before it asks for money.",
              pt: "O produto ganha confianca antes de pedir dinheiro.",
              es: "El producto se gana la confianza antes de pedir dinero.",
              fr: "Le produit gagne la confiance avant de demander de l'argent.",
              de: "Das Produkt gewinnt Vertrauen, bevor es Geld verlangt.",
              it: "Il prodotto guadagna fiducia prima di chiedere denaro.",
            }),
          },
          {
            label: t(lang, { en: "Trading free", pt: "Trading free",
            es: "Trading free",
            fr: "Trading gratuit",
            de: "Kostenloser Handel",
            it: "Negoziazione gratuita", }),
            value: t(lang, { en: "Discovery first", pt: "Discovery primeiro",
            es: "Descubrimiento primero",
            fr: "La decouverte d'abord",
            de: "Entdeckung zuerst",
            it: "Prima la scoperta", }),
            detail: t(lang, {
              en: "Users can inspect the desk and opportunity flow before paying for depth.",
              pt: "Os utilizadores podem inspecionar a desk e o fluxo de oportunidades antes de pagar pela profundidade.",
              es: "Los usuarios pueden inspeccionar el escritorio y el flujo de oportunidades antes de pagar por la profundidad.",
              fr: "Les utilisateurs peuvent inspecter le bureau et le flux des opportunites avant de payer pour la profondeur.",
              de: "Benutzer konnen den Schreibtisch und den Opportunity-Flow uberprufen, bevor sie fur die Tiefe bezahlen.",
              it: "Gli utenti possono ispezionare la scrivania e il flusso di opportunita prima di pagare per approfondimenti.",
            }),
          },
          {
            label: t(lang, { en: "Trading Pro", pt: "Trading Pro",
            es: "Trading Pro",
            fr: "Trading Pro",
            de: "Trading-Profi",
            it: "Trading Pro", }),
            value: t(lang, { en: "Decision depth", pt: "Profundidade de decisao",
            es: "Profundidad de decision",
            fr: "Profondeur de decision",
            de: "Entscheidungstiefe",
            it: "Profondita decisionale", }),
            detail: t(lang, {
              en: "Trade/Wait, Execution, Risk, Journal, Alerts, and live verification become operational instead of shallow.",
              pt: "Trade/Wait, Execution, Risk, Journal, Alerts e verificacao live tornam-se operacionais em vez de superficiais.",
              es: "Comercio/Espera, Ejecucion, Riesgo, Diario, Alertas y verificacion en vivo se vuelven operativos en lugar de superficiales.",
              fr: "Trade/Wait, l'execution, les risques, le journal, les alertes et la verification en direct deviennent operationnels au lieu d'etre superficiels.",
              de: "Handel/Warten, Ausfuhrung, Risiko, Journal, Warnungen und Live-Verifizierung werden betriebsbereit statt oberflachlich.",
              it: "Commercio/Attesa, Esecuzione, Rischio, Diario, Avvisi e verifica in tempo reale diventano operativi invece che superficiali.",
            }),
          },
          {
            label: t(lang, { en: "Subscription logic", pt: "Logica da subscricao",
            es: "Logica de suscripcion",
            fr: "Logique d'abonnement",
            de: "Abonnementlogik",
            it: "Logica di abbonamento", }),
            value: t(lang, { en: "Process edge", pt: "Edge de processo",
            es: "Ventaja del proceso",
            fr: "Bord du processus",
            de: "Prozesskante",
            it: "Bordo del processo", }),
            detail: t(lang, {
              en: "Recurring value comes from better decisions and fewer avoidable mistakes over time.",
              pt: "O valor recorrente vem de melhores decisoes e menos erros evitaveis ao longo do tempo.",
              es: "El valor recurrente proviene de mejores decisiones y menos errores evitables con el tiempo.",
              fr: "La valeur recurrente provient de meilleures decisions et de moins d'erreurs evitables au fil du temps.",
              de: "Wiederkehrender Mehrwert entsteht durch bessere Entscheidungen und weniger vermeidbare Fehler im Laufe der Zeit.",
              it: "Il valore ricorrente deriva da decisioni migliori e da un minor numero di errori evitabili nel tempo.",
            }),
          },
        ]}
        cards={[
          {
            title: t(lang, { en: "What the user pays for", pt: "Pelo que o utilizador paga",
            es: "Por que paga el usuario",
            fr: "Ce que l'utilisateur paie",
            de: "Wofur der Benutzer bezahlt",
            it: "Cio per cui paga l'utente", }),
            body: t(lang, {
              en: "A cleaner pre-broker decision: whether to trade, wait, reduce risk, or verify more before acting.",
              pt: "Uma decisao pre-broker mais limpa: entrar, esperar, reduzir risco ou verificar mais antes de agir.",
              es: "Una decision previa al broker mas clara: si comerciar, esperar, reducir el riesgo o verificar mas antes de actuar.",
              fr: "Une decision plus claire avant le courtage: s'il faut negocier, attendre, reduire les risques ou verifier davantage avant d'agir.",
              de: "Eine klarere Entscheidung vor dem Broker: ob Sie handeln, abwarten, das Risiko reduzieren oder mehr uberprufen, bevor Sie handeln.",
              it: "Una decisione pre-broker piu chiara: se negoziare, aspettare, ridurre il rischio o verificare di piu prima di agire.",
            }),
            bullets: [
              t(lang, { en: "Not more signal noise. A stronger decision gate.", pt: "Nao mais ruido de sinais. Um gate de decisao mais forte.",
              es: "No mas ruido de senal. Una puerta de decision mas fuerte.",
              fr: "Pas plus de bruit de signal. Une porte de decision plus forte.",
              de: "Kein Signalrauschen mehr. Ein starkeres Entscheidungstor.",
              it: "Non piu rumore del segnale. Un cancello decisionale piu forte.", }),
              t(lang, { en: "Not fake urgency. Better timing, freshness, and discipline.", pt: "Nao urgencia falsa. Melhor timing, frescura e disciplina.",
              es: "No falsa urgencia. Mejor sincronizacion, frescura y disciplina.",
              fr: "Ce n'est pas une fausse urgence. Meilleur timing, fraicheur et discipline.",
              de: "Keine vorgetauschte Dringlichkeit. Besseres Timing, Frische und Disziplin.",
              it: "Non una finta urgenza. Miglior tempismo, freschezza e disciplina.", }),
              t(lang, { en: "Not blind trust. More visible proof before broker execution.", pt: "Nao confianca cega. Mais prova visivel antes da execucao no broker.",
              es: "No confianza ciega. Pruebas mas visibles antes de la ejecucion del broker.",
              fr: "Pas de confiance aveugle. Preuve plus visible avant l'execution du broker.",
              de: "Kein blindes Vertrauen. Besser sichtbarer Beweis vor der Ausfuhrung durch den Broker.",
              it: "Non la fiducia cieca. Prove piu visibili prima dell'esecuzione del broker.", }),
            ],
          },
          {
            title: t(lang, { en: "Why that can feel worth it every month", pt: "Porque isso pode valer a pena todos os meses",
            es: "Por que puede parecer que vale la pena cada mes?",
            fr: "Pourquoi cela peut en valoir la peine chaque mois",
            de: "Warum sich das jeden Monat lohnen kann",
            it: "Perche puo valerne la pena ogni mese", }),
            body: t(lang, {
              en: "Markets change, data quality changes, and discipline decays without structure. Syntrake earns retention by adapting the user's process every cycle.",
              pt: "Os mercados mudam, a qualidade dos dados muda e a disciplina degrada-se sem estrutura. O Syntrake ganha retencao ao adaptar o processo do utilizador a cada ciclo.",
              es: "Los mercados cambian, la calidad de los datos cambia y la disciplina decae sin estructura. Syntrake gana retencion adaptando el proceso del usuario en cada ciclo.",
              fr: "Les marches changent, la qualite des donnees change et la discipline se desintegre sans structure. Syntrake gagne en fidelisation en adaptant le processus de l'utilisateur a chaque cycle.",
              de: "Markte verandern sich, die Datenqualitat verandert sich und Disziplin verfallt ohne Struktur. Syntrake verdient Kundenbindung, indem es den Prozess des Benutzers in jedem Zyklus anpasst.",
              it: "I mercati cambiano, la qualita dei dati cambia e la disciplina decade senza struttura. Syntrake guadagna fidelizzazione adattando il processo dell'utente a ogni ciclo.",
            }),
            bullets: [
              t(lang, { en: "The loop keeps running after the first setup.", pt: "O loop continua a correr depois do primeiro setup.",
              es: "El bucle continua ejecutandose despues de la primera configuracion.",
              fr: "La boucle continue de fonctionner apres la premiere configuration.",
              de: "Die Schleife lauft nach dem ersten Setup weiter.",
              it: "Il ciclo continua a funzionare dopo la prima configurazione.", }),
              t(lang, { en: "The user sees when WAIT is discipline, not indecision.", pt: "O utilizador ve quando WAIT e disciplina, nao indecisao.",
              es: "El usuario ve cuando ESPERAR es disciplina, no indecision.",
              fr: "L'utilisateur voit quand WAIT est une discipline et non une indecision.",
              de: "Der Benutzer sieht, wenn WAIT Disziplin und keine Unentschlossenheit bedeutet.",
              it: "L'utente vede quando ATTESA e disciplina, non indecisione.", }),
              t(lang, { en: "That supports retention better than raw signal volume.", pt: "Isso suporta melhor a retencao do que puro volume de sinais.",
              es: "Eso admite la retencion mejor que el volumen de la senal sin procesar.",
              fr: "Cela prend mieux en charge la retention que le volume du signal brut.",
              de: "Das unterstutzt die Retention besser als die reine Signallautstarke.",
              it: "Cio supporta la ritenzione meglio del volume del segnale grezzo.", }),
            ],
          },
        ]}
        links={[
          {
            label: t(lang, { en: "See pricing", pt: "Ver precos",
            es: "Ver precios",
            fr: "Voir les tarifs",
            de: "Siehe Preise",
            it: "Vedi i prezzi", }),
            href: link("/pricing"),
            tone: "primary",
          },
          {
            label: t(lang, { en: "How it works", pt: "Como funciona",
            es: "como funciona",
            fr: "Comment ca marche",
            de: "Wie es funktioniert",
            it: "Come funziona", }),
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
              es: "Menos errores no forzados del broker",
              fr: "Moins d'erreurs directes des brokers",
              de: "Weniger ungezwungene Maklerfehler",
              it: "Meno errori non forzati del broker",
            }),
            body: t(lang, {
              en: "The product becomes valuable when it blocks bad timing, weak sizing, stale snapshots, and poor risk framing before they reach the broker.",
              pt: "O produto ganha valor quando bloqueia mau timing, sizing fraco, snapshots stale e risco mal enquadrado antes de chegarem ao broker.",
              es: "El producto se vuelve valioso cuando bloquea el mal momento, el dimensionamiento debil, las instantaneas obsoletas y el marco de riesgo deficiente antes de que lleguen al broker.",
              fr: "Le produit devient precieux lorsqu'il bloque un mauvais timing, un dimensionnement faible, des instantanes obsoletes et une mauvaise definition des risques avant qu'ils n'atteignent le broker.",
              de: "Das Produkt wird wertvoll, wenn es schlechtes Timing, schwache Dimensionierung, veraltete Snapshots und schlechte Risikoeinschatzung blockiert, bevor sie den Broker erreichen.",
              it: "Il prodotto diventa prezioso quando blocca i tempi errati, il dimensionamento debole, le istantanee obsolete e la scarsa definizione del rischio prima che raggiungano il broker.",
            }),
          },
          {
            title: t(lang, {
              en: "No-trade becomes a product feature",
              pt: "Nao operar torna-se uma feature",
              es: "La prohibicion del comercio se convierte en una caracteristica del producto",
              fr: "Le no-trade devient une fonctionnalite du produit",
              de: "No-Trade wird zum Produktmerkmal",
              it: "Il no-trade diventa una caratteristica del prodotto",
            }),
            body: t(lang, {
              en: "Syntrake does not need to force action to be valuable. It earns trust by making WAIT explicit when the setup is not clean.",
              pt: "O Syntrake nao precisa de forcar acao para ter valor. Ganha confianca ao tornar WAIT explicito quando o setup nao esta limpo.",
              es: "Syntrake no necesita forzar la accion para que sea valiosa. Se gana confianza al hacer WAIT explicito cuando la configuracion no esta limpia.",
              fr: "Syntrake n'a pas besoin de forcer l'action pour avoir de la valeur. Il gagne la confiance en rendant WAIT explicite lorsque la configuration n'est pas propre.",
              de: "Syntrake muss keine Massnahmen erzwingen, um wertvoll zu sein. Es schafft Vertrauen, indem WAIT explizit angegeben wird, wenn das Setup nicht sauber ist.",
              it: "Syntrake non ha bisogno di forzare l'azione per avere valore. Guadagna fiducia rendendo WAIT esplicito quando l'installazione non e pulita.",
            }),
          },
          {
            title: t(lang, {
              en: "Continuity that compounds",
              pt: "Continuidade que acumula",
              es: "Continuidad que se agrava",
              fr: "Une continuite qui compose",
              de: "Kontinuitat, die verbindet",
              it: "Continuita che si compone",
            }),
            body: t(lang, {
              en: "Journal memory, alerts, and repeated risk checks create recurring value because the process improves with use.",
              pt: "Memoria de journal, alerts e verificacoes repetidas de risco criam valor recorrente porque o processo melhora com o uso.",
              es: "La memoria del diario, las alertas y las comprobaciones repetidas de riesgos crean un valor recurrente porque el proceso mejora con el uso.",
              fr: "La memoire du journal, les alertes et les controles repetes des risques creent une valeur recurrente car le processus s'ameliore avec l'utilisation.",
              de: "Journalspeicher, Warnungen und wiederholte Risikoprufungen schaffen einen wiederkehrenden Wert, da sich der Prozess mit der Nutzung verbessert.",
              it: "La memoria del diario, gli avvisi e i controlli ripetuti dei rischi creano valore ricorrente perche il processo migliora con l'uso.",
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
          {t(lang, { en: "Free vs Pro", pt: "Free vs Pro",
          es: "Gratis vs Pro",
          fr: "Gratuit ou Pro",
          de: "Kostenlos vs. Pro",
          it: "Gratuito contro professionista", })}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink-900">
          {t(lang, {
            en: "What changes when you stay free and what changes when you upgrade.",
            pt: "O que muda quando ficas no free e o que muda quando fazes upgrade.",
            es: "Que cambia cuando sigues siendo gratuito y que cambia cuando actualizas.",
            fr: "Qu'est-ce qui change lorsque vous restez gratuit et qu'est-ce qui change lorsque vous effectuez une mise a niveau.",
            de: "Was andert sich, wenn Sie kostenlos bleiben, und was andert sich, wenn Sie ein Upgrade durchfuhren?",
            it: "Cosa cambia quando rimani gratuito e cosa cambia quando fai l'upgrade.",
          })}
        </h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div className="text-sm font-semibold text-ink-900">{t(lang, { en: "Still free", pt: "Continua gratis",
            es: "Todavia libre",
            fr: "Toujours gratuit",
            de: "Noch frei",
            it: "Ancora libero", })}</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li>- {t(lang, { en: "Daily, Plan, Portfolio, Advisor, and Autonomy in Investing", pt: "Daily, Plan, Portfolio, Advisor e Autonomy no Investing",
              es: "Diario, Plan, Portafolio, Asesor y Autonomia en la Inversion",
              fr: "Quotidien, Plan, Portefeuille, Conseiller et Autonomie en investissement",
              de: "Taglich, Plan, Portfolio, Berater und Autonomie beim Investieren",
              it: "Daily, Piano, Portafoglio, Advisor e Autonomia negli investimenti", })}</li>
              <li>- {t(lang, { en: "Trading desk and opportunity flow in discovery mode", pt: "Desk de Trading e fluxo de oportunidades em discovery mode",
              es: "Mesa de operaciones y flujo de oportunidades en modo descubrimiento",
              fr: "Trading desk et flux d'opportunites en mode decouverte",
              de: "Trading Desk und Opportunity Flow im Discovery-Modus",
              it: "Trading desk e flusso di opportunita in modalita scoperta", })}</li>
              <li>- {t(lang, { en: "Enough access to verify if the product fits your style", pt: "Acesso suficiente para verificares se o produto encaixa no teu estilo",
              es: "Acceso suficiente para verificar si el producto se ajusta a tu estilo.",
              fr: "Acces suffisant pour verifier si le produit correspond a votre style",
              de: "Genug Zugriff, um zu uberprufen, ob das Produkt zu Ihrem Stil passt",
              it: "Accesso sufficiente per verificare se il prodotto si adatta al tuo stile", })}</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5">
            <div className="text-sm font-semibold text-ink-900">{t(lang, { en: "Paid for depth", pt: "Pago pela profundidade",
            es: "Pagado por profundidad",
            fr: "Paye pour la profondeur",
            de: "Bezahlt fur die Tiefe",
            it: "Pagato per la profondita", })}</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li>- {t(lang, { en: "Execution, Risk, Journal, and Alerts become fully operational", pt: "Execution, Risk, Journal e Alerts tornam-se totalmente operacionais",
              es: "La ejecucion, el riesgo, el diario y las alertas se vuelven completamente operativos",
              fr: "L'execution, les risques, le journal et les alertes deviennent pleinement operationnels",
              de: "Ausfuhrung, Risiko, Journal und Warnungen sind voll funktionsfahig",
              it: "Esecuzione, Rischio, Diario e Avvisi diventano pienamente operativi", })}</li>
              <li>- {t(lang, { en: "Live decisions gain freshness checks, verification, and discipline support", pt: "As decisoes live ganham checks de frescura, verificacao e suporte de disciplina",
              es: "Las decisiones en vivo obtienen controles de actualizacion, verificacion y soporte disciplinario.",
              fr: "Les decisions en direct beneficient de controles de fraicheur, de verification et de support disciplinaire",
              de: "Live-Entscheidungen erhalten Aktualitatsprufungen, Verifizierung und Disziplinarunterstutzung",
              it: "Le decisioni in tempo reale ottengono controlli di aggiornamento, verifica e supporto disciplinare", })}</li>
              <li>- {t(lang, { en: "The subscription pays for fewer avoidable broker mistakes under pressure, not for basic access", pt: "A subscricao paga menos erros evitaveis no broker sob pressao, nao o acesso basico",
              es: "La suscripcion paga por menos errores evitables de los brokers bajo presion, no por el acceso basico",
              fr: "L'abonnement paie pour moins d'erreurs de broker evitables sous pression, pas pour un acces de base",
              de: "Das Abonnement zahlt sich fur weniger vermeidbare Maklerfehler unter Druck aus, nicht fur den Basiszugang",
              it: "L'abbonamento paga per un minor numero di errori evitabili del broker sotto pressione, non per l'accesso di base", })}</li>
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

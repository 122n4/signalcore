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

export default async function TermsPage({
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
            en: "Terms of Service",
            pt: "Termos de Servico",
            es: "Terminos de Servicio",
            fr: "Conditions d Utilisation",
            de: "Nutzungsbedingungen",
            it: "Termini di Servizio",
          })}
        </h1>
        <p className="text-sm text-ink-600">
          {t(lang, {
            en: "Effective date:",
            pt: "Data efetiva:",
            es: "Fecha efectiva:",
            fr: "Date d effet :",
            de: "Gueltig ab:",
            it: "Data di entrata in vigore:",
          })}{" "}
          {new Date().toISOString().slice(0, 10)} -{" "}
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
        <h2 className="text-xl font-semibold">{t(lang, { en: "1) What Syntrake is", pt: "1) O que e Syntrake", es: "1) Que es Syntrake", fr: "1) Ce qu est Syntrake", de: "1) Was Syntrake ist", it: "1) Cos e Syntrake" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Syntrake is an educational and decision-support software product. It provides tools for planning, risk monitoring, and decision organization. It does not provide personalized financial advice.",
            pt: "Syntrake e um produto de software educacional e de suporte a decisao. Fornece ferramentas para planeamento, monitorizacao de risco e organizacao de decisoes. Nao fornece aconselhamento financeiro personalizado.",
            es: "Syntrake es un producto de software educativo y de soporte a decisiones. Ofrece herramientas para planificacion, monitorizacion de riesgo y organizacion de decisiones. No ofrece asesoramiento financiero personalizado.",
            fr: "Syntrake est un logiciel educatif d aide a la decision. Il fournit des outils de planification, surveillance du risque et organisation des decisions. Il ne fournit pas de conseil financier personnalise.",
            de: "Syntrake ist ein lehrreiches Softwareprodukt zur Entscheidungsunterstuetzung. Es bietet Werkzeuge fuer Planung, Risiko-Monitoring und Entscheidungsorganisation. Es bietet keine personalisierte Finanzberatung.",
            it: "Syntrake e un prodotto software educativo di supporto decisionale. Fornisce strumenti per pianificazione, monitoraggio rischio e organizzazione decisioni. Non fornisce consulenza finanziaria personalizzata.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "2) No financial advice", pt: "2) Sem aconselhamento financeiro", es: "2) Sin asesoramiento financiero", fr: "2) Pas de conseil financier", de: "2) Keine Finanzberatung", it: "2) Nessuna consulenza finanziaria" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Syntrake does not provide investment, legal, tax, or accounting advice. Any information, outputs, or examples (including tickers and portfolio templates) are provided for educational purposes only. You are solely responsible for your investment decisions and outcomes.",
            pt: "Syntrake nao fornece aconselhamento de investimento, legal, fiscal ou contabilistico. Qualquer informacao, output ou exemplo (incluindo tickers e templates de portfolio) e apenas para fins educacionais. Tu es o unico responsavel pelas tuas decisoes e resultados.",
            es: "Syntrake no ofrece asesoramiento de inversion, legal, fiscal o contable. Cualquier informacion, salida o ejemplo (incluyendo tickers y plantillas de cartera) se ofrece solo con fines educativos. Tu eres el unico responsable de tus decisiones y resultados.",
            fr: "Syntrake ne fournit pas de conseil en investissement, juridique, fiscal ou comptable. Toute information, sortie ou exemple (y compris tickers et modeles de portefeuille) est fournie a des fins educatives uniquement. Vous etes seul responsable de vos decisions et resultats.",
            de: "Syntrake bietet keine Anlage-, Rechts-, Steuer- oder Buchhaltungsberatung. Informationen, Ausgaben oder Beispiele (einschliesslich Ticker und Portfolio-Vorlagen) dienen nur Bildungszwecken. Du bist allein fuer deine Entscheidungen und Ergebnisse verantwortlich.",
            it: "Syntrake non fornisce consulenza su investimenti, legale, fiscale o contabile. Qualsiasi informazione, output o esempio (inclusi ticker e template portfolio) e solo a scopo educativo. Sei l unico responsabile delle tue decisioni e risultati.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "3) Risk disclosure", pt: "3) Divulgacao de risco", es: "3) Divulgacion de riesgo", fr: "3) Divulgation des risques", de: "3) Risikohinweis", it: "3) Disclosure rischio" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Investing involves risk, including possible loss of principal. Past performance does not guarantee future results. Markets can be volatile. You should consider your financial situation and consult qualified professionals before making investment decisions.",
            pt: "Investir envolve risco, incluindo possivel perda de capital. Resultados passados nao garantem resultados futuros. Os mercados podem ser volateis. Deves considerar a tua situacao financeira e consultar profissionais qualificados antes de investir.",
            es: "Invertir implica riesgo, incluida posible perdida de capital. El rendimiento pasado no garantiza resultados futuros. Los mercados pueden ser volatiles. Debes considerar tu situacion financiera y consultar profesionales cualificados antes de invertir.",
            fr: "Investir comporte des risques, y compris la perte possible du capital. Les performances passees ne garantissent pas les resultats futurs. Les marches peuvent etre volatils. Vous devez tenir compte de votre situation financiere et consulter des professionnels qualifies avant d investir.",
            de: "Investieren ist mit Risiken verbunden, einschliesslich moeglichem Kapitalverlust. Vergangene Performance garantiert keine kuenftigen Ergebnisse. Maerkte koennen volatil sein. Beruecksichtige deine finanzielle Situation und konsultiere qualifizierte Fachleute vor Anlageentscheidungen.",
            it: "Investire comporta rischi, inclusa la possibile perdita del capitale. Le performance passate non garantiscono risultati futuri. I mercati possono essere volatili. Devi considerare la tua situazione finanziaria e consultare professionisti qualificati prima di investire.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "4) Accounts & acceptable use", pt: "4) Contas e uso aceitavel", es: "4) Cuentas y uso aceptable", fr: "4) Comptes et usage acceptable", de: "4) Konten und zulaessige Nutzung", it: "4) Account e uso consentito" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "You agree to provide accurate information, keep your account secure, and not use Syntrake for illegal purposes, abuse, or to attempt to reverse engineer, disrupt, or compromise the service.",
            pt: "Concordas em fornecer informacao correta, manter a conta segura e nao usar o Syntrake para fins ilegais, abuso ou para tentar engenharia reversa, interromper ou comprometer o servico.",
            es: "Aceptas proporcionar informacion correcta, mantener tu cuenta segura y no usar Syntrake para fines ilegales, abuso o para intentar ingenieria inversa, interrumpir o comprometer el servicio.",
            fr: "Vous acceptez de fournir des informations exactes, de garder votre compte securise et de ne pas utiliser Syntrake a des fins illegales, abusives, ni pour tenter de retro-ingenierie, perturber ou compromettre le service.",
            de: "Du verpflichtest dich, korrekte Informationen bereitzustellen, dein Konto zu sichern und Syntrake nicht fuer illegale Zwecke, Missbrauch oder Reverse Engineering, Stoerung oder Kompromittierung des Dienstes zu nutzen.",
            it: "Accetti di fornire informazioni corrette, mantenere sicuro il tuo account e non usare Syntrake per fini illegali, abuso o tentativi di reverse engineering, interruzione o compromissione del servizio.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "5) Subscriptions & billing", pt: "5) Subscricoes e faturacao", es: "5) Suscripciones y cobro", fr: "5) Abonnements et facturation", de: "5) Abos und Abrechnung", it: "5) Abbonamenti e fatturazione" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Subscriptions renew automatically unless canceled. You can cancel at any time through your account billing portal. Fees paid are non-refundable except where required by law or explicitly stated otherwise.",
            pt: "As subscricoes renovam automaticamente salvo cancelamento. Podes cancelar a qualquer momento no portal de faturacao. Valores pagos nao sao reembolsaveis exceto quando exigido por lei ou indicado de forma explicita.",
            es: "Las suscripciones se renuevan automaticamente salvo cancelacion. Puedes cancelar en cualquier momento en el portal de cobro. Los importes pagados no son reembolsables excepto cuando la ley lo exija o se indique explicitamente.",
            fr: "Les abonnements se renouvellent automatiquement sauf annulation. Vous pouvez annuler a tout moment via le portail de facturation. Les frais payes ne sont pas remboursables sauf obligation legale ou mention explicite contraire.",
            de: "Abonnements verlaengern sich automatisch, sofern sie nicht gekuendigt werden. Du kannst jederzeit im Abrechnungsportal kuendigen. Gezahlte Gebuehren sind nicht erstattungsfaehig, ausser wenn gesetzlich erforderlich oder ausdruecklich anders angegeben.",
            it: "Gli abbonamenti si rinnovano automaticamente salvo cancellazione. Puoi annullare in qualsiasi momento dal portale di fatturazione. Gli importi pagati non sono rimborsabili salvo obblighi di legge o indicazione esplicita contraria.",
          })}
        </p>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Founding Member pricing (if available) is limited to the first qualifying users and may be subject to availability and eligibility rules displayed at purchase time.",
            pt: "O preco Founding Member (quando disponivel) esta limitado aos primeiros utilizadores elegiveis e pode depender de disponibilidade e regras de elegibilidade mostradas no momento da compra.",
            es: "El precio Founding Member (si disponible) esta limitado a los primeros usuarios elegibles y puede depender de disponibilidad y reglas de elegibilidad mostradas al comprar.",
            fr: "Le tarif Founding Member (si disponible) est limite aux premiers utilisateurs eligibles et peut dependre de la disponibilite et des regles d eligibilite affichees lors de l achat.",
            de: "Der Founding-Member-Preis (falls verfuegbar) ist auf die ersten qualifizierten Nutzer begrenzt und kann von Verfuegbarkeit und Eignungsregeln zum Kaufzeitpunkt abhaengen.",
            it: "Il prezzo Founding Member (se disponibile) e limitato ai primi utenti idonei e puo dipendere da disponibilita e regole di idoneita mostrate al momento dell acquisto.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "6) Service changes", pt: "6) Alteracoes de servico", es: "6) Cambios del servicio", fr: "6) Changements de service", de: "6) Serviceaenderungen", it: "6) Modifiche al servizio" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "We may update, modify, or discontinue features over time. We may also update these Terms. If changes are material, we will take reasonable steps to provide notice.",
            pt: "Podemos atualizar, modificar ou descontinuar funcionalidades ao longo do tempo. Tambem podemos atualizar estes Termos. Se as alteracoes forem materiais, tomaremos medidas razoaveis para notificar.",
            es: "Podemos actualizar, modificar o descontinuar funciones con el tiempo. Tambien podemos actualizar estos Terminos. Si los cambios son materiales, tomaremos medidas razonables para avisar.",
            fr: "Nous pouvons mettre a jour, modifier ou interrompre des fonctionnalites au fil du temps. Nous pouvons aussi mettre a jour ces Conditions. Si les changements sont importants, nous prendrons des mesures raisonnables pour notifier.",
            de: "Wir koennen Funktionen im Laufe der Zeit aktualisieren, aendern oder einstellen. Wir koennen auch diese Bedingungen aktualisieren. Bei wesentlichen Aenderungen werden wir angemessen informieren.",
            it: "Possiamo aggiornare, modificare o interrompere funzionalita nel tempo. Possiamo anche aggiornare questi Termini. Se le modifiche sono rilevanti, adotteremo misure ragionevoli per avvisare.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "7) Intellectual property", pt: "7) Propriedade intelectual", es: "7) Propiedad intelectual", fr: "7) Propriete intellectuelle", de: "7) Geistiges Eigentum", it: "7) Proprieta intellettuale" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "Syntrake and its content, software, and branding are protected by intellectual property laws. You may not copy, sell, sublicense, or redistribute the service except as permitted by law or written permission.",
            pt: "Syntrake e os seus conteudos, software e marca estao protegidos por leis de propriedade intelectual. Nao podes copiar, vender, sublicenciar ou redistribuir o servico exceto quando permitido por lei ou autorizacao escrita.",
            es: "Syntrake y su contenido, software y marca estan protegidos por leyes de propiedad intelectual. No puedes copiar, vender, sublicenciar o redistribuir el servicio salvo permiso legal o escrito.",
            fr: "Syntrake et son contenu, logiciel et marque sont proteges par les lois de propriete intellectuelle. Vous ne pouvez pas copier, vendre, sous-licencier ou redistribuer le service sauf autorisation legale ou ecrite.",
            de: "Syntrake sowie Inhalte, Software und Branding sind durch Gesetze zum geistigen Eigentum geschuetzt. Du darfst den Dienst nicht kopieren, verkaufen, unterlizenzieren oder weiterverbreiten, ausser gesetzlich oder schriftlich erlaubt.",
            it: "Syntrake e i suoi contenuti, software e brand sono protetti dalle leggi sulla proprieta intellettuale. Non puoi copiare, vendere, sublicenziare o ridistribuire il servizio salvo autorizzazione legale o scritta.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "8) Limitation of liability", pt: "8) Limitacao de responsabilidade", es: "8) Limitacion de responsabilidad", fr: "8) Limitation de responsabilite", de: "8) Haftungsbeschraenkung", it: "8) Limitazione di responsabilita" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "To the maximum extent permitted by law, Syntrake is provided \"as is\" without warranties. We are not liable for any indirect, incidental, special, consequential, or punitive damages, or any investment losses, arising out of your use of the service.",
            pt: "Na maxima medida permitida por lei, Syntrake e fornecido \"como esta\", sem garantias. Nao somos responsaveis por danos indiretos, incidentais, especiais, consequenciais ou punitivos, nem por perdas de investimento decorrentes do uso do servico.",
            es: "En la maxima medida permitida por ley, Syntrake se ofrece \"tal cual\", sin garantias. No somos responsables por danos indirectos, incidentales, especiales, consecuenciales o punitivos, ni por perdidas de inversion derivadas del uso del servicio.",
            fr: "Dans les limites maximales permises par la loi, Syntrake est fourni \"tel quel\" sans garanties. Nous ne sommes pas responsables des dommages indirects, accessoires, speciaux, consecutifs ou punitifs, ni des pertes d investissement liees a l usage du service.",
            de: "Soweit gesetzlich zulaessig wird Syntrake \"wie besehen\" ohne Gewaehrleistung bereitgestellt. Wir haften nicht fuer indirekte, zufaellige, besondere, Folge- oder Strafschaeden sowie nicht fuer Anlageverluste aus der Nutzung des Dienstes.",
            it: "Nella massima misura consentita dalla legge, Syntrake e fornito \"cosi com e\" senza garanzie. Non siamo responsabili per danni indiretti, incidentali, speciali, consequenziali o punitivi, ne per perdite di investimento derivanti dall uso del servizio.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "9) Contact", pt: "9) Contacto", es: "9) Contacto", fr: "9) Contact", de: "9) Kontakt", it: "9) Contatto" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "For questions about these Terms, contact us at",
            pt: "Para questoes sobre estes Termos, contacta-nos em",
            es: "Para preguntas sobre estos Terminos, contactanos en",
            fr: "Pour les questions sur ces Conditions, contactez-nous a",
            de: "Bei Fragen zu diesen Bedingungen kontaktiere uns unter",
            it: "Per domande su questi Termini, contattaci a",
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


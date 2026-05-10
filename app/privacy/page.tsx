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

export default async function PrivacyPage({
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
            en: "Privacy Policy",
            pt: "Politica de Privacidade",
            es: "Politica de Privacidad",
            fr: "Politique de Confidentialite",
            de: "Datenschutzrichtlinie",
            it: "Informativa Privacy",
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
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "1) What we collect",
            pt: "1) O que recolhemos",
            es: "1) Que recopilamos",
            fr: "1) Ce que nous collectons",
            de: "1) Was wir erfassen",
            it: "1) Cosa raccogliamo",
          })}
        </h2>
        <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
          <li>{t(lang, { en: "Account information (e.g., email, authentication identifiers).", pt: "Informacao de conta (ex.: email, identificadores de autenticacao).", es: "Informacion de cuenta (ej.: email, identificadores de autenticacion).", fr: "Informations de compte (ex. email, identifiants d authentification).", de: "Kontoinformationen (z. B. E-Mail, Authentifizierungskennungen).", it: "Informazioni account (es. email, identificatori di autenticazione)." })}</li>
          <li>{t(lang, { en: "Plan and preferences you enter (goals, risk settings, guardrails, policy choices).", pt: "Plano e preferencias inseridos por ti (objetivos, risco, guardrails, escolhas de politica).", es: "Plan y preferencias que introduces (objetivos, riesgo, guardrails, elecciones de politica).", fr: "Plan et preferences saisis (objectifs, niveau de risque, guardrails, choix de politique).", de: "Von dir eingegebene Plaene und Praeferenzen (Ziele, Risikoeinstellungen, Guardrails, Policy-Wahlen).", it: "Piano e preferenze inserite (obiettivi, impostazioni rischio, guardrail, scelte di policy)." })}</li>
          <li>{t(lang, { en: "Usage and diagnostic data (e.g., pages viewed, feature usage, error logs).", pt: "Dados de utilizacao e diagnostico (ex.: paginas vistas, uso de funcionalidades, logs de erro).", es: "Datos de uso y diagnostico (ej.: paginas vistas, uso de funciones, logs de error).", fr: "Donnees d usage et de diagnostic (ex. pages vues, usage des fonctionnalites, logs d erreur).", de: "Nutzungs- und Diagnosedaten (z. B. aufgerufene Seiten, Feature-Nutzung, Fehlerprotokolle).", it: "Dati di utilizzo e diagnostica (es. pagine viste, uso funzioni, log errori)." })}</li>
          <li>{t(lang, { en: "Billing status and subscription metadata (not your full payment card details).", pt: "Estado de faturacao e metadados de subscricao (nao detalhes completos do cartao).", es: "Estado de cobro y metadatos de suscripcion (no detalles completos de tarjeta).", fr: "Statut de facturation et metadonnees d abonnement (pas les details complets de carte).", de: "Abrechnungsstatus und Abonnement-Metadaten (nicht deine vollstaendigen Kartendaten).", it: "Stato fatturazione e metadati abbonamento (non i dettagli completi della carta)." })}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "2) How we use data",
            pt: "2) Como usamos os dados",
            es: "2) Como usamos los datos",
            fr: "2) Comment nous utilisons les donnees",
            de: "2) Wie wir Daten nutzen",
            it: "2) Come usiamo i dati",
          })}
        </h2>
        <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
          <li>{t(lang, { en: "Provide and improve the service (plans, summaries, alerts, audit trail).", pt: "Fornecer e melhorar o servico (planos, resumos, alertas, trilha de auditoria).", es: "Proveer y mejorar el servicio (planes, resumenes, alertas, rastro de auditoria).", fr: "Fournir et ameliorer le service (plans, resumes, alertes, piste d audit).", de: "Bereitstellung und Verbesserung des Dienstes (Plaene, Zusammenfassungen, Alerts, Audit-Trail).", it: "Fornire e migliorare il servizio (piani, riepiloghi, alert, traccia audit)." })}</li>
          <li>{t(lang, { en: "Maintain security, prevent fraud, and debug issues.", pt: "Manter seguranca, prevenir fraude e depurar problemas.", es: "Mantener seguridad, prevenir fraude y depurar problemas.", fr: "Maintenir la securite, prevenir la fraude et corriger les problemes.", de: "Sicherheit gewaehrleisten, Betrug verhindern und Probleme beheben.", it: "Mantenere sicurezza, prevenire frodi e risolvere problemi." })}</li>
          <li>{t(lang, { en: "Operate subscriptions and account access.", pt: "Gerir subscricoes e acesso a conta.", es: "Gestionar suscripciones y acceso de cuenta.", fr: "Gerer abonnements et acces au compte.", de: "Abonnements und Kontozugriff verwalten.", it: "Gestire abbonamenti e accesso account." })}</li>
          <li>{t(lang, { en: "Communicate service updates and support.", pt: "Comunicar atualizacoes do servico e suporte.", es: "Comunicar actualizaciones del servicio y soporte.", fr: "Communiquer les mises a jour du service et le support.", de: "Service-Updates und Support kommunizieren.", it: "Comunicare aggiornamenti del servizio e supporto." })}</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "3) Cookies & analytics",
            pt: "3) Cookies e analytics",
            es: "3) Cookies y analytics",
            fr: "3) Cookies et analytics",
            de: "3) Cookies und Analytics",
            it: "3) Cookie e analytics",
          })}
        </h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "We may use cookies and similar technologies to keep you signed in, remember preferences, and measure usage for product improvement. You can control cookies through your browser settings.",
            pt: "Podemos usar cookies e tecnologias semelhantes para manter sessao, lembrar preferencias e medir utilizacao para melhorar o produto. Podes controlar cookies no teu navegador.",
            es: "Podemos usar cookies y tecnologias similares para mantener sesion, recordar preferencias y medir uso para mejorar el producto. Puedes controlar cookies en tu navegador.",
            fr: "Nous pouvons utiliser des cookies et technologies similaires pour maintenir la connexion, memoriser les preferences et mesurer l usage afin d ameliorer le produit. Vous pouvez controler les cookies via votre navigateur.",
            de: "Wir koennen Cookies und aehnliche Technologien verwenden, um dich angemeldet zu halten, Praeferenzen zu speichern und die Nutzung zur Produktverbesserung zu messen. Du kannst Cookies in deinem Browser steuern.",
            it: "Possiamo usare cookie e tecnologie simili per mantenere l accesso, ricordare preferenze e misurare l uso per migliorare il prodotto. Puoi controllare i cookie nelle impostazioni del browser.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "4) Data sharing",
            pt: "4) Partilha de dados",
            es: "4) Comparticion de datos",
            fr: "4) Partage des donnees",
            de: "4) Datenweitergabe",
            it: "4) Condivisione dati",
          })}
        </h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "We do not sell your personal data. We may share data with service providers necessary to operate the product (e.g., authentication and billing providers) under contractual protections.",
            pt: "Nao vendemos os teus dados pessoais. Podemos partilhar dados com fornecedores necessarios para operar o produto (ex.: autenticacao e faturacao) sob protecoes contratuais.",
            es: "No vendemos tus datos personales. Podemos compartir datos con proveedores necesarios para operar el producto (ej.: autenticacion y cobro) bajo protecciones contractuales.",
            fr: "Nous ne vendons pas vos donnees personnelles. Nous pouvons partager des donnees avec des prestataires necessaires au fonctionnement du produit (ex. authentification et facturation) sous protections contractuelles.",
            de: "Wir verkaufen deine personenbezogenen Daten nicht. Wir koennen Daten mit Dienstleistern teilen, die fuer den Betrieb des Produkts notwendig sind (z. B. Authentifizierung und Abrechnung), unter vertraglichen Schutzmassnahmen.",
            it: "Non vendiamo i tuoi dati personali. Possiamo condividere dati con fornitori necessari al funzionamento del prodotto (es. autenticazione e fatturazione) con protezioni contrattuali.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "5) Data retention",
            pt: "5) Retencao de dados",
            es: "5) Retencion de datos",
            fr: "5) Conservation des donnees",
            de: "5) Datenspeicherung",
            it: "5) Conservazione dati",
          })}
        </h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "We retain data as long as needed to provide the service and comply with legal obligations. You may request deletion of your account and associated data where applicable.",
            pt: "Retemos dados enquanto necessario para prestar o servico e cumprir obrigacoes legais. Podes pedir eliminacao da conta e dados associados quando aplicavel.",
            es: "Conservamos datos mientras sea necesario para prestar el servicio y cumplir obligaciones legales. Puedes solicitar eliminacion de tu cuenta y datos asociados cuando aplique.",
            fr: "Nous conservons les donnees aussi longtemps que necessaire pour fournir le service et respecter les obligations legales. Vous pouvez demander la suppression de votre compte et des donnees associees lorsque applicable.",
            de: "Wir speichern Daten so lange, wie es fuer den Service und gesetzliche Pflichten noetig ist. Du kannst die Loeschung deines Kontos und zugehoeriger Daten beantragen, soweit anwendbar.",
            it: "Conserviamo i dati per il tempo necessario a fornire il servizio e rispettare obblighi legali. Puoi richiedere la cancellazione del tuo account e dei dati associati dove applicabile.",
          })}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">
          {t(lang, {
            en: "6) Your choices",
            pt: "6) As tuas opcoes",
            es: "6) Tus opciones",
            fr: "6) Vos choix",
            de: "6) Deine Optionen",
            it: "6) Le tue scelte",
          })}
        </h2>
        <ul className="list-disc pl-5 text-sm text-ink-700 space-y-1">
          <li>{t(lang, { en: "You can update your plan and preferences at any time.", pt: "Podes atualizar plano e preferencias a qualquer momento.", es: "Puedes actualizar plan y preferencias en cualquier momento.", fr: "Vous pouvez mettre a jour plan et preferences a tout moment.", de: "Du kannst Plan und Praeferenzen jederzeit aktualisieren.", it: "Puoi aggiornare piano e preferenze in qualsiasi momento." })}</li>
          <li>{t(lang, { en: "You can cancel your subscription from your billing portal.", pt: "Podes cancelar a subscricao no portal de faturacao.", es: "Puedes cancelar la suscripcion en tu portal de cobro.", fr: "Vous pouvez annuler l abonnement depuis le portail de facturation.", de: "Du kannst dein Abo im Abrechnungsportal kuendigen.", it: "Puoi annullare l abbonamento dal portale di fatturazione." })}</li>
          <li>
            {t(lang, {
              en: "You can request account deletion by contacting",
              pt: "Podes pedir eliminacao da conta contactando",
              es: "Puedes solicitar eliminacion de cuenta contactando a",
              fr: "Vous pouvez demander la suppression du compte en contactant",
              de: "Du kannst die Kontoloeschung anfordern ueber",
              it: "Puoi richiedere cancellazione account contattando",
            })}{" "}
            <a href="mailto:support@syntrake.com" className="underline">
              support@syntrake.com
            </a>
            .
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t(lang, { en: "7) Contact", pt: "7) Contacto", es: "7) Contacto", fr: "7) Contact", de: "7) Kontakt", it: "7) Contatto" })}</h2>
        <p className="text-sm text-ink-700">
          {t(lang, {
            en: "For privacy questions, contact",
            pt: "Para questoes de privacidade, contacta",
            es: "Para dudas de privacidad, contacta a",
            fr: "Pour les questions de confidentialite, contactez",
            de: "Bei Datenschutzfragen kontaktiere",
            it: "Per domande sulla privacy, contatta",
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


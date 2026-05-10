import type { Metadata } from "next";
import Link from "next/link";
import ProofRail from "@/components/ProofRail";
import { pickByLang, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Trust Center",
  description:
    "Syntrake trust center: security, billing transparency, live-data safeguards, broker execution model, and legal disclosures.",
};

function t(
  lang: SiteLang,
  value: { en: string; pt?: string; es?: string; fr?: string; de?: string; it?: string }
) {
  return pickByLang(lang, value);
}

export default async function TrustPage({
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
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="rounded-3xl border border-border-soft bg-white/95 p-8 shadow-card">
          <p className="text-xs font-semibold text-ink-500">
            {t(lang, {
              en: "Trust Center",
              pt: "Centro de Confianca",
              es: "Centro de Confianza",
              fr: "Centre de Confiance",
              de: "Trust Center",
              it: "Centro Fiducia",
            })}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            {t(lang, {
              en: "Trust before the broker. Control after the decision.",
              pt: "Confianca antes do broker. Controlo depois da decisao.",
              es: "Seguridad, transparencia y control.",
              fr: "Securite, transparence et controle.",
              de: "Sicherheit, Transparenz und Kontrolle.",
              it: "Sicurezza, trasparenza e controllo.",
            })}
          </h1>
          <p className="mt-4 max-w-3xl text-ink-700">
            {t(lang, {
              en: "Syntrake is built to help decision quality, not to push risky behavior. This page summarizes how we handle accounts, billing, disclosures, and operational safeguards.",
              pt: "Syntrake foi criado para melhorar qualidade de decisao, nao para empurrar comportamento de risco. Esta pagina resume como tratamos contas, faturacao, dados live, execucao no broker, divulgacoes e protecoes operacionais.",
              es: "Syntrake fue creado para mejorar calidad de decision, no para empujar comportamiento de riesgo. Esta pagina resume como manejamos cuentas, cobros, divulgaciones y salvaguardas operativas.",
              fr: "Syntrake est concu pour ameliorer la qualite des decisions, pas pour pousser au risque. Cette page resume comment nous gerons comptes, facturation, divulgations et protections operationnelles.",
              de: "Syntrake wurde entwickelt, um Entscheidungsqualitaet zu verbessern, nicht um riskantes Verhalten zu foerdern. Diese Seite fasst zusammen, wie wir Konten, Abrechnung, Offenlegungen und Schutzmechanismen handhaben.",
              it: "Syntrake e stato creato per migliorare la qualita decisionale, non per spingere comportamenti rischiosi. Questa pagina riassume come gestiamo account, fatturazione, disclosure e salvaguardie operative.",
            })}
          </p>
          <p className="mt-2 text-sm text-ink-600">
            Support:{" "}
            <a href="mailto:support@syntrake.com" className="underline">
              support@syntrake.com
            </a>
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">Billing</div>
              <div className="mt-2 text-lg font-semibold text-ink-900">Stripe checkout + self-serve portal</div>
              <p className="mt-2 text-sm text-ink-700">You can inspect pricing, checkout logic, and cancellation flow before subscribing.</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">Broker model</div>
              <div className="mt-2 text-lg font-semibold text-ink-900">No custody lock-in</div>
              <p className="mt-2 text-sm text-ink-700">Syntrake frames the decision. Your broker remains the execution venue.</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">Verification</div>
              <div className="mt-2 text-lg font-semibold text-ink-900">Freshness before execution</div>
              <p className="mt-2 text-sm text-ink-700">Open markets should not look executable when live data is stale, fallback-only, or missing.</p>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">Decision model</div>
              <div className="mt-2 text-lg font-semibold text-ink-900">Trade / Wait / Reduce Risk</div>
              <p className="mt-2 text-sm text-ink-700">No-trade is treated as a real decision when conditions are not clean enough.</p>
            </div>
          </div>

          <div className="mt-8">
            <ProofRail
              eyebrow={t(lang, {
                en: "Operational trust proof",
                pt: "Prova operacional de confianca",
              })}
              title={t(lang, {
                en: "Trust is built by what the product proves, not by vague promises.",
                pt: "A confianca constroi-se pelo que o produto prova, nao por promessas vagas.",
              })}
              body={t(lang, {
                en: "Syntrake is designed to keep value visible before payment, keep broker execution in the user's control, and make live trading decisions easier to verify before action.",
                pt: "O Syntrake foi desenhado para manter valor visivel antes do pagamento, manter a execucao no broker sob controlo do utilizador e tornar decisoes live mais verificaveis antes da acao.",
              })}
              stats={[
                {
                  label: t(lang, { en: "Live freshness", pt: "Frescura live" }),
                  value: t(lang, { en: "Fresh or blocked", pt: "Fresco ou bloqueado" }),
                  detail: t(lang, {
                    en: "If open-market data is stale or fallback-only, Syntrake should not present it as broker-ready.",
                    pt: "Se dados de mercado aberto estao stale ou em fallback, o Syntrake nao os deve apresentar como prontos para broker.",
                  }),
                },
                {
                  label: t(lang, { en: "Trading access", pt: "Acesso Trading" }),
                  value: t(lang, { en: "Discovery + Pro depth", pt: "Discovery + profundidade Pro" }),
                  detail: t(lang, {
                    en: "Free users see the desk and opportunity flow first. Pro unlocks execution, risk, journal, and alerts.",
                    pt: "Os utilizadores free veem primeiro o desk e o fluxo de oportunidades. O Pro desbloqueia execucao, risco, journal e alerts.",
                  }),
                },
                {
                  label: t(lang, { en: "Trade verification", pt: "Verificacao de trades" }),
                  value: t(lang, { en: "External cross-check", pt: "Cross-check externo" }),
                  detail: t(lang, {
                    en: "Valid trades can now be compared against public and provider references in real time.",
                    pt: "Os trades validos podem agora ser comparados com referencias publicas e de providers em tempo real.",
                  }),
                },
                {
                  label: t(lang, { en: "Execution model", pt: "Modelo de execucao" }),
                  value: t(lang, { en: "Manual broker control", pt: "Controlo manual no broker" }),
                  detail: t(lang, {
                    en: "Syntrake prepares the decision and workflow, but the user remains in control of execution.",
                    pt: "O Syntrake prepara a decisao e o workflow, mas o utilizador continua no controlo da execucao.",
                  }),
                },
              ]}
              cards={[
                {
                  title: t(lang, { en: "What Syntrake does", pt: "O que o Syntrake faz" }),
                  body: t(lang, {
                    en: "Improve decision quality, risk framing, and execution discipline with clear next actions and an auditable process.",
                    pt: "Melhora a qualidade da decisao, o enquadramento de risco e a disciplina de execucao com proximas acoes claras e um processo auditavel.",
                  }),
                  bullets: [
                    t(lang, { en: "Shows value before charging.", pt: "Mostra valor antes de cobrar." }),
                    t(lang, { en: "Keeps rationale visible in product language.", pt: "Mantem o racional visivel em linguagem de produto." }),
                    t(lang, { en: "Supports accountability through receipts and journal trails.", pt: "Suporta accountability atraves de recibos e trilhas de journal." }),
                  ],
                },
                {
                  title: t(lang, { en: "What Syntrake does not do", pt: "O que o Syntrake nao faz" }),
                  body: t(lang, {
                    en: "It does not custody money, promise profits, or remove user responsibility from execution and risk decisions.",
                    pt: "Nao guarda dinheiro, nao promete lucros e nao remove a responsabilidade do utilizador na execucao e nas decisoes de risco.",
                  }),
                  bullets: [
                    t(lang, { en: "No automatic-profit narrative.", pt: "Sem narrativa de lucros automaticos." }),
                    t(lang, { en: "No broker lock-in.", pt: "Sem lock-in de broker." }),
                    t(lang, { en: "No manufactured urgency to force attention.", pt: "Sem urgencia fabricada para forcar atencao." }),
                  ],
                },
              ]}
              links={[
                {
                  label: t(lang, { en: "How it works", pt: "Como funciona" }),
                  href: link("/how-it-works"),
                  tone: "secondary",
                },
                {
                  label: t(lang, { en: "Pricing", pt: "Precos" }),
                  href: link("/pricing"),
                  tone: "primary",
                },
              ]}
              footnote={t(lang, {
                en: "Trust is strongest when the product keeps the user informed before, during, and after execution.",
                pt: "A confianca e mais forte quando o produto mantem o utilizador informado antes, durante e depois da execucao.",
              })}
            />
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-5">
              <div className="text-sm font-semibold">
                {t(lang, {
                  en: "Account security",
                  pt: "Seguranca da conta",
                  es: "Seguridad de cuenta",
                  fr: "Securite du compte",
                  de: "Kontosicherheit",
                  it: "Sicurezza account",
                })}
              </div>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>- {t(lang, { en: "Authentication handled by Clerk", pt: "Autenticacao gerida pela Clerk", es: "Autenticacion gestionada por Clerk", fr: "Authentification geree par Clerk", de: "Authentifizierung durch Clerk", it: "Autenticazione gestita da Clerk" })}</li>
                <li>- {t(lang, { en: "Protected app routes for signed-in users", pt: "Rotas protegidas para utilizadores autenticados", es: "Rutas protegidas para usuarios autenticados", fr: "Routes protegees pour utilisateurs connectes", de: "Geschuetzte App-Routen fuer angemeldete Nutzer", it: "Route protette per utenti autenticati" })}</li>
                <li>- {t(lang, { en: "Session-based access controls", pt: "Controlo de acesso baseado em sessao", es: "Control de acceso basado en sesion", fr: "Controle d acces base sur session", de: "Sitzungsbasierte Zugriffskontrolle", it: "Controllo accesso basato su sessione" })}</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-5">
              <div className="text-sm font-semibold">
                {t(lang, {
                  en: "Billing integrity",
                  pt: "Integridade de faturacao",
                  es: "Integridad de cobro",
                  fr: "Integrite de facturation",
                  de: "Abrechnungsintegritaet",
                  it: "Integrita fatturazione",
                })}
              </div>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>- {t(lang, { en: "Subscriptions handled by Stripe Checkout", pt: "Subscricoes geridas pelo Stripe Checkout", es: "Suscripciones gestionadas por Stripe Checkout", fr: "Abonnements geres par Stripe Checkout", de: "Abos ueber Stripe Checkout", it: "Abbonamenti gestiti da Stripe Checkout" })}</li>
                <li>- {t(lang, { en: "Customer portal for self-serve cancellation", pt: "Portal do cliente para cancelamento autonomo", es: "Portal de cliente para cancelacion autonoma", fr: "Portail client pour annulation autonome", de: "Kundenportal fuer Selbstkuendigung", it: "Portale cliente per cancellazione autonoma" })}</li>
                <li>- {t(lang, { en: "No hidden feature packs", pt: "Sem pacotes de funcionalidades escondidos", es: "Sin paquetes de funciones ocultos", fr: "Pas de packs de fonctionnalites caches", de: "Keine versteckten Feature-Pakete", it: "Nessun pacchetto funzionalita nascosto" })}</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-5">
              <div className="text-sm font-semibold">
                {t(lang, {
                  en: "Product safeguards",
                  pt: "Salvaguardas do produto",
                  es: "Salvaguardas del producto",
                  fr: "Protections produit",
                  de: "Produktschutz",
                  it: "Salvaguardie prodotto",
                })}
              </div>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>- {t(lang, { en: "Goal and risk guardrails before actions", pt: "Guardrails de objetivo e risco antes de agir", es: "Guardrails de objetivo y riesgo antes de actuar", fr: "Guardrails objectif/risque avant action", de: "Ziel- und Risiko-Guardrails vor Aktionen", it: "Guardrail obiettivo/rischio prima delle azioni" })}</li>
                <li>- {t(lang, { en: "Stale live snapshots should block broker-ready output", pt: "Snapshots live stale devem bloquear output pronto para broker" })}</li>
                <li>- {t(lang, { en: "Explainable rationale for decisions", pt: "Racional explicavel para decisoes", es: "Razonamiento explicable para decisiones", fr: "Rationale explicable pour decisions", de: "Erklaerbare Begruendung fuer Entscheidungen", it: "Razionale spiegabile per decisioni" })}</li>
                <li>- {t(lang, { en: "Journal trail for accountability", pt: "Trilha de journal para accountability", es: "Rastro de journal para trazabilidad", fr: "Trace journal pour responsabilite", de: "Journal-Spur fuer Nachvollziehbarkeit", it: "Traccia journal per accountability" })}</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border-soft bg-canvas-50 p-5">
              <div className="text-sm font-semibold">
                {t(lang, {
                  en: "Legal transparency",
                  pt: "Transparencia legal",
                  es: "Transparencia legal",
                  fr: "Transparence legale",
                  de: "Rechtliche Transparenz",
                  it: "Trasparenza legale",
                })}
              </div>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>- {t(lang, { en: "Educational decision-support, not financial advice", pt: "Suporte educacional a decisao, nao aconselhamento financeiro", es: "Soporte educativo de decision, no asesoramiento financiero", fr: "Support educatif a la decision, pas conseil financier", de: "Lehrreiche Entscheidungsunterstuetzung, keine Finanzberatung", it: "Supporto decisionale educativo, non consulenza finanziaria" })}</li>
                <li>- {t(lang, { en: "Risk disclosures published and visible", pt: "Divulgacoes de risco publicadas e visiveis", es: "Divulgaciones de riesgo publicadas y visibles", fr: "Divulgations de risque publiees et visibles", de: "Risikohinweise veroeffentlicht und sichtbar", it: "Disclosure di rischio pubbliche e visibili" })}</li>
                <li>- {t(lang, { en: "Terms and privacy accessible at all times", pt: "Termos e privacidade acessiveis sempre", es: "Terminos y privacidad accesibles siempre", fr: "Conditions et confidentialite accessibles en permanence", de: "AGB und Datenschutz jederzeit erreichbar", it: "Termini e privacy sempre accessibili" })}</li>
                <li>- Support: support@syntrake.com</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={link("/sign-up")}
              className="inline-flex items-center justify-center rounded-2xl bg-signal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-signal-800"
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
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              {t(lang, {
                en: "Go to pricing",
                pt: "Ir para precos",
                es: "Ir a precios",
                fr: "Aller aux tarifs",
                de: "Zu Preisen",
                it: "Vai ai prezzi",
              })}
            </Link>
            <Link
              href={link("/terms")}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              {t(lang, { en: "Terms", pt: "Termos", es: "Terminos", fr: "Conditions", de: "AGB", it: "Termini" })}
            </Link>
            <Link
              href={link("/privacy")}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              {t(lang, { en: "Privacy", pt: "Privacidade", es: "Privacidad", fr: "Confidentialite", de: "Datenschutz", it: "Privacy" })}
            </Link>
            <Link
              href={link("/disclaimer")}
              className="inline-flex items-center justify-center rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
            >
              {t(lang, { en: "Disclaimer", pt: "Aviso legal", es: "Aviso legal", fr: "Avertissement", de: "Hinweis", it: "Disclaimer" })}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}


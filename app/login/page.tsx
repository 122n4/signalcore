import React from "react";
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

export default async function LoginPage({
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
      <section className="mx-auto max-w-7xl px-6 py-14">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-semibold text-ink-500">Syntrake</p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            {t(lang, {
              en: "Sign in to Syntrake",
              pt: "Entrar no Syntrake",
              es: "Entrar en Syntrake",
              fr: "Connexion a Syntrake",
              de: "Bei Syntrake anmelden",
              it: "Accedi a Syntrake",
            })}
          </h1>

          <p className="mt-2 text-sm text-ink-700">
            {t(lang, {
              en: "Create your free account in seconds. No card required.",
              pt: "Cria a tua conta gratis em segundos. Sem cartao.",
              es: "Crea tu cuenta gratis en segundos. Sin tarjeta.",
              fr: "Creez votre compte gratuit en quelques secondes. Sans carte.",
              de: "Erstelle dein kostenloses Konto in Sekunden. Keine Karte noetig.",
              it: "Crea il tuo account gratuito in pochi secondi. Nessuna carta richiesta.",
            })}
          </p>

          <p className="mt-4 text-xs text-ink-500">
            {t(lang, {
              en: "Calm, risk-first market context updated weekly.",
              pt: "Contexto de mercado calmo e risco-primeiro atualizado semanalmente.",
              es: "Contexto de mercado calmado y riesgo-primero actualizado semanalmente.",
              fr: "Contexte de marche calme et risque-d abord mis a jour chaque semaine.",
              de: "Ruhiger, risiko-zuerst Marktkontext woechentlich aktualisiert.",
              it: "Contesto di mercato calmo e rischio-prima aggiornato settimanalmente.",
            })}
          </p>

          <div className="mt-8 rounded-3xl border border-border-soft bg-white p-6 shadow-soft">
            <div className="space-y-3">
              <Link
                href={link("/sign-in")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-95"
              >
                {t(lang, {
                  en: "Continue with Google",
                  pt: "Continuar com Google",
                  es: "Continuar con Google",
                  fr: "Continuer avec Google",
                  de: "Mit Google fortfahren",
                  it: "Continua con Google",
                })}
              </Link>

              <Link
                href={link("/sign-in")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                {t(lang, {
                  en: "Continue with email",
                  pt: "Continuar com email",
                  es: "Continuar con email",
                  fr: "Continuer avec email",
                  de: "Mit E-Mail fortfahren",
                  it: "Continua con email",
                })}
              </Link>

              <Link
                href={link("/sign-up")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border-soft bg-white px-5 py-3 text-sm font-semibold text-ink-900 hover:bg-canvas-50"
              >
                {t(lang, {
                  en: "Create account",
                  pt: "Criar conta",
                  es: "Crear cuenta",
                  fr: "Creer un compte",
                  de: "Konto erstellen",
                  it: "Crea account",
                })}
              </Link>

              <p className="pt-2 text-xs text-ink-500">
                {t(lang, {
                  en: "We will never post anything. Your account is only used to save your preferences and your private portfolio view.",
                  pt: "Nunca vamos publicar nada. A tua conta serve apenas para guardar preferencias e a tua vista privada do portfolio.",
                  es: "Nunca publicaremos nada. Tu cuenta solo se usa para guardar preferencias y tu vista privada de cartera.",
                  fr: "Nous ne publierons jamais rien. Votre compte sert uniquement a sauvegarder vos preferences et votre vue privee du portefeuille.",
                  de: "Wir werden niemals etwas posten. Dein Konto dient nur zum Speichern deiner Praeferenzen und deiner privaten Portfolioansicht.",
                  it: "Non pubblicheremo mai nulla. Il tuo account serve solo a salvare preferenze e vista privata del portafoglio.",
                })}
              </p>
            </div>

            <div className="mt-8">
              <h2 className="text-base font-semibold">
                {t(lang, {
                  en: "Why create an account",
                  pt: "Porque criar conta",
                  es: "Por que crear cuenta",
                  fr: "Pourquoi creer un compte",
                  de: "Warum ein Konto erstellen",
                  it: "Perche creare un account",
                })}
              </h2>

              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li>- {t(lang, { en: "Save your Market Map preferences (EN/PT)", pt: "Guardar preferencias do Market Map (EN/PT)", es: "Guardar preferencias de Market Map (EN/PT)", fr: "Sauvegarder les preferences Market Map (EN/PT)", de: "Market-Map-Praeferenzen speichern (EN/PT)", it: "Salvare preferenze Market Map (EN/PT)" })}</li>
                <li>- {t(lang, { en: "Build a private \"My Portfolio\" view", pt: "Construir uma vista privada \"My Portfolio\"", es: "Construir una vista privada \"My Portfolio\"", fr: "Construire une vue privee \"My Portfolio\"", de: "Eine private \"My Portfolio\"-Ansicht erstellen", it: "Costruire una vista privata \"My Portfolio\"" })}</li>
                <li>- {t(lang, { en: "Get calm weekly structure, not alert spam", pt: "Receber estrutura semanal calma, nao spam de alertas", es: "Recibir estructura semanal calmada, no spam de alertas", fr: "Recevoir une structure hebdo calme, pas du spam d alertes", de: "Ruhige Wochenstruktur statt Alert-Spam", it: "Ricevere struttura settimanale calma, non spam di alert" })}</li>
              </ul>

              <p className="mt-4 text-sm text-ink-700">
                <span className="font-semibold">
                  {t(lang, {
                    en: "Syntrake does not tell you what to buy.",
                    pt: "Syntrake nao te diz o que comprar.",
                    es: "Syntrake no te dice que comprar.",
                    fr: "Syntrake ne vous dit pas quoi acheter.",
                    de: "Syntrake sagt dir nicht, was du kaufen sollst.",
                    it: "Syntrake non ti dice cosa comprare.",
                  })}
                </span>{" "}
                {t(lang, {
                  en: "It helps you make better decisions over time.",
                  pt: "Ajuda-te a tomar melhores decisoes ao longo do tempo.",
                  es: "Te ayuda a tomar mejores decisiones con el tiempo.",
                  fr: "Il vous aide a prendre de meilleures decisions au fil du temps.",
                  de: "Es hilft dir, mit der Zeit bessere Entscheidungen zu treffen.",
                  it: "Ti aiuta a prendere decisioni migliori nel tempo.",
                })}
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-border-soft bg-canvas-50 p-4">
              <h3 className="text-sm font-semibold">
                {t(lang, {
                  en: "Privacy & security",
                  pt: "Privacidade e seguranca",
                  es: "Privacidad y seguridad",
                  fr: "Confidentialite et securite",
                  de: "Datenschutz und Sicherheit",
                  it: "Privacy e sicurezza",
                })}
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-ink-700">
                <li>- {t(lang, { en: "Your portfolio is private", pt: "O teu portfolio e privado", es: "Tu cartera es privada", fr: "Votre portefeuille est prive", de: "Dein Portfolio ist privat", it: "Il tuo portafoglio e privato" })}</li>
                <li>- {t(lang, { en: "No bank/broker connections", pt: "Sem ligacoes a banco/broker", es: "Sin conexiones banco/broker", fr: "Aucune connexion banque/broker", de: "Keine Bank/Broker-Verbindungen", it: "Nessun collegamento banca/broker" })}</li>
                <li>- {t(lang, { en: "You can delete your account anytime", pt: "Podes apagar a conta a qualquer momento", es: "Puedes eliminar tu cuenta en cualquier momento", fr: "Vous pouvez supprimer votre compte a tout moment", de: "Du kannst dein Konto jederzeit loeschen", it: "Puoi eliminare il tuo account in qualsiasi momento" })}</li>
              </ul>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-500">
              <Link className="hover:underline" href={link("/pricing")}>
                {t(lang, { en: "Pricing", pt: "Precos", es: "Precios", fr: "Tarifs", de: "Preise", it: "Prezzi" })}
              </Link>
              <Link className="hover:underline" href={link("/why-syntrake")}>
                {t(lang, { en: "Method", pt: "Metodo", es: "Metodo", fr: "Methode", de: "Methode", it: "Metodo" })}
              </Link>
              <Link className="hover:underline" href={link("/")}>
                {t(lang, { en: "Home", pt: "Inicio", es: "Inicio", fr: "Accueil", de: "Startseite", it: "Home" })}
              </Link>
            </div>
          </div>

          <p className="mt-6 text-xs text-ink-500">
            {t(lang, {
              en: "Educational content only. No signals. No predictions.",
              pt: "Conteudo educacional apenas. Sem sinais. Sem previsoes.",
              es: "Contenido educativo solo. Sin senales. Sin predicciones.",
              fr: "Contenu educatif seulement. Aucun signal. Aucune prediction.",
              de: "Nur Bildungsinhalt. Keine Signale. Keine Prognosen.",
              it: "Solo contenuto educativo. Niente segnali. Niente previsioni.",
            })}
          </p>
        </div>
      </section>
    </main>
  );
}


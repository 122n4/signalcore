import { pickByLang } from "@/lib/i18n/siteLanguage";
import type { DailyDecisionView } from "./dailyDecisionViewModel";

type Mode = "investing";
type Lang = "en" | "pt" | "es" | "fr" | "de" | "it";

export type AdvisorDecisionAction = "planning" | "portfolio" | "fix" | "daily" | "refresh";

export type AdvisorDecisionView = {
  kind:
    | "no_plan"
    | "no_holdings"
    | "starter_warmup"
    | "fatal_fallback"
    | "low_data_quality"
    | "fix_leak"
    | "continue_daily"
    | "done_today";
  title: string;
  detail: string;
  actionLabel: string;
  action: AdvisorDecisionAction;
  badgeLabel: string;
  badgeTone: "good" | "warn" | "bad";
};

export function buildAdvisorDecisionView(args: {
  lang: Lang;
  mode: Mode;
  decisionView: DailyDecisionView;
  hasPlan: boolean;
  hasHoldings: boolean;
  starterWarmupActive: boolean;
  fallbackActive: boolean;
  lowDataQualityActive: boolean;
  hasFixPath: boolean;
  doneToday: boolean;
}): AdvisorDecisionView {
  if (!args.hasPlan) {
    return {
      kind: "no_plan",
      title: pickByLang(args.lang, {
        en: "Step 1: create your plan first",
        pt: "Passo 1: cria primeiro o teu plano",
        es: "Paso 1: crea primero tu plan",
        fr: "Etape 1 : creez d'abord votre plan",
        de: "Schritt 1: Erstelle zuerst deinen Plan",
        it: "Passo 1: crea prima il tuo piano",
      }),
      detail: pickByLang(args.lang, {
        en: "No plan means no guardrails. Open Planning and activate your plan.",
        pt: "Sem plano nao ha guardrails. Abre Planning e ativa o teu plano.",
        es: "Sin plan no hay guardrails. Abre Planning y activa tu plan.",
        fr: "Sans plan, pas de garde-fous. Ouvrez Planning et activez votre plan.",
        de: "Ohne Plan gibt es keine Leitplanken. Offne Planning und aktiviere deinen Plan.",
        it: "Senza piano non ci sono guardrail. Apri Planning e attiva il tuo piano.",
      }),
      actionLabel: pickByLang(args.lang, {
        en: "Open Planning",
        pt: "Abrir Planning",
        es: "Abrir Planning",
        fr: "Ouvrir Planning",
        de: "Planning offnen",
        it: "Apri Planning",
      }),
      action: "planning",
      badgeLabel: "Action needed",
      badgeTone: "warn",
    };
  }

  if (!args.hasHoldings) {
    return {
      kind: "no_holdings",
      title: pickByLang(args.lang, {
        en: "Step 2: add holdings",
        pt: "Passo 2: adiciona holdings",
        es: "Paso 2: agrega holdings",
        fr: "Etape 2 : ajoutez des positions",
        de: "Schritt 2: Holdings hinzufugen",
        it: "Passo 2: aggiungi posizioni",
      }),
      detail: pickByLang(args.lang, {
        en: "Without holdings, Syntrake cannot detect risk leaks.",
        pt: "Sem holdings, o Syntrake nao consegue detetar leaks de risco.",
        es: "Sin holdings, Syntrake no puede detectar fugas de riesgo.",
        fr: "Sans positions, Syntrake ne peut pas detecter les fuites de risque.",
        de: "Ohne Holdings kann Syntrake keine Risiko-Lecks erkennen.",
        it: "Senza posizioni, Syntrake non puo rilevare leak di rischio.",
      }),
      actionLabel: pickByLang(args.lang, {
        en: "Open Portfolio",
        pt: "Abrir Portfolio",
        es: "Abrir Cartera",
        fr: "Ouvrir Portefeuille",
        de: "Portfolio offnen",
        it: "Apri Portafoglio",
      }),
      action: "portfolio",
      badgeLabel: "Action needed",
      badgeTone: "warn",
    };
  }

  if (args.starterWarmupActive) {
    return {
      kind: "starter_warmup",
      title: pickByLang(args.lang, {
        en: "Step 3: observe starter pack",
        pt: "Passo 3: observar starter pack",
        es: "Paso 3: observar starter pack",
        fr: "Etape 3 : observer le starter pack",
        de: "Schritt 3: Starter-Pack beobachten",
        it: "Passo 3: osserva lo starter pack",
      }),
      detail: pickByLang(args.lang, {
        en: "Starter warmup is active. Let the initial allocation settle before fixing leaks or increasing risk.",
        pt: "O warmup do starter esta ativo. Deixa a alocacao inicial assentar antes de corrigir leaks ou aumentar risco.",
        es: "El warmup del starter esta activo. Deja que la asignacion inicial se asiente antes de corregir leaks o aumentar riesgo.",
        fr: "Le warmup du starter est actif. Laissez l allocation initiale se stabiliser avant de corriger les leaks ou d augmenter le risque.",
        de: "Starter-Warmup ist aktiv. Lass die erste Allokation sich setzen, bevor du Lecks behebst oder Risiko erhohst.",
        it: "Il warmup dello starter e attivo. Lascia stabilizzare l allocazione iniziale prima di correggere leak o aumentare il rischio.",
      }),
      actionLabel: pickByLang(args.lang, {
        en: "Open Daily",
        pt: "Abrir Daily",
        es: "Abrir Daily",
        fr: "Ouvrir Daily",
        de: "Daily offnen",
        it: "Apri Daily",
      }),
      action: "daily",
      badgeLabel: "Observe",
      badgeTone: "good",
    };
  }

  if (args.fallbackActive) {
    return {
      kind: "fatal_fallback",
      title: pickByLang(args.lang, {
        en: "Step 3: wait for recovery",
        pt: "Passo 3: esperar recuperacao",
        es: "Paso 3: esperar recuperacion",
        fr: "Etape 3 : attendre la recuperation",
        de: "Schritt 3: Auf Erholung warten",
        it: "Passo 3: attendi il recupero",
      }),
      detail: pickByLang(args.lang, {
        en: "Fallback mode is active. Avoid strategic changes until the decision system recovers.",
        pt: "O modo fallback esta ativo. Evita mudancas estrategicas ate o sistema recuperar.",
        es: "El modo fallback esta activo. Evita cambios estrategicos hasta que el sistema se recupere.",
        fr: "Le mode fallback est actif. Evitez les changements strategiques jusqu au retour du systeme.",
        de: "Fallback-Modus ist aktiv. Vermeide strategische Anderungen, bis das System sich erholt.",
        it: "La modalita fallback e attiva. Evita cambi strategici finche il sistema non si riprende.",
      }),
      actionLabel: pickByLang(args.lang, {
        en: "Open Daily",
        pt: "Abrir Daily",
        es: "Abrir Daily",
        fr: "Ouvrir Daily",
        de: "Daily offnen",
        it: "Apri Daily",
      }),
      action: "daily",
      badgeLabel: "Paused",
      badgeTone: "warn",
    };
  }

  if (args.lowDataQualityActive && args.hasFixPath) {
    return {
      kind: "low_data_quality",
      title: pickByLang(args.lang, {
        en: "Step 3: fix data quality first",
        pt: "Passo 3: corrigir qualidade de dados primeiro",
        es: "Paso 3: corregir calidad de datos primero",
        fr: "Etape 3 : corriger la qualite des donnees d abord",
        de: "Schritt 3: Zuerst Datenqualitat beheben",
        it: "Passo 3: correggi prima la qualita dei dati",
      }),
      detail: pickByLang(args.lang, {
        en: "Repair pricing and valuation quality before trusting strategic growth or leak-repair directives.",
        pt: "Repara pricing e valorizacao antes de confiar em diretivas de crescimento ou correcao de leaks.",
        es: "Repara pricing y valoracion antes de confiar en directivas de crecimiento o reparacion de leaks.",
        fr: "Reparez le pricing et la valorisation avant de suivre des directives de croissance ou de correction.",
        de: "Behebe Pricing und Bewertung, bevor du Wachstums- oder Leak-Reparatur-Anweisungen vertraust.",
        it: "Ripara pricing e valutazione prima di fidarti di direttive di crescita o correzione leak.",
      }),
      actionLabel: pickByLang(args.lang, {
        en: "Fix data quality",
        pt: "Corrigir qualidade dos dados",
        es: "Corregir calidad de datos",
        fr: "Corriger la qualite des donnees",
        de: "Datenqualitat beheben",
        it: "Correggi qualita dati",
      }),
      action: "fix",
      badgeLabel: "Action needed",
      badgeTone: "warn",
    };
  }

  if (args.hasFixPath) {
    return {
      kind: "fix_leak",
      title: pickByLang(args.lang, {
        en: "Step 3: fix leak before growth",
        pt: "Passo 3: corrige o leak antes de crescer",
        es: "Paso 3: corrige la fuga antes de crecer",
        fr: "Etape 3 : corrigez la fuite avant la croissance",
        de: "Schritt 3: Leak vor Wachstum beheben",
        it: "Passo 3: correggi il leak prima della crescita",
      }),
      detail: pickByLang(args.lang, {
        en: "There is an active risk leak. Fix it now before adding risk.",
        pt: "Existe um leak de risco ativo. Corrige agora antes de aumentar risco.",
        es: "Hay una fuga de riesgo activa. Corrigela antes de aumentar riesgo.",
        fr: "Il y a une fuite de risque active. Corrigez-la avant d'ajouter du risque.",
        de: "Es gibt ein aktives Risiko-Leck. Behebe es vor neuem Risiko.",
        it: "C'e un leak di rischio attivo. Correggilo prima di aggiungere rischio.",
      }),
      actionLabel: pickByLang(args.lang, {
        en: "Fix now",
        pt: "Corrigir agora",
        es: "Corregir ahora",
        fr: "Corriger maintenant",
        de: "Jetzt beheben",
        it: "Correggi ora",
      }),
      action: "fix",
      badgeLabel: "Action needed",
      badgeTone: "warn",
    };
  }

  if (!args.doneToday) {
    return {
      kind: "continue_daily",
      title: pickByLang(args.lang, {
        en: "Step 4: continue in Daily",
        pt: "Passo 4: continuar no Daily",
        es: "Paso 4: continuar en Daily",
        fr: "Etape 4 : continuer dans Daily",
        de: "Schritt 4: in Daily fortsetzen",
        it: "Passo 4: continua in Daily",
      }),
      detail: args.decisionView.rationale,
      actionLabel: pickByLang(args.lang, {
        en: "Open Daily",
        pt: "Abrir Daily",
        es: "Abrir Daily",
        fr: "Ouvrir Daily",
        de: "Daily offnen",
        it: "Apri Daily",
      }),
      action: "daily",
      badgeLabel: "On track",
      badgeTone: "good",
    };
  }

  return {
    kind: "done_today",
    title: pickByLang(args.lang, {
      en: "Today is complete",
      pt: "Hoje esta completo",
      es: "Hoy esta completo",
      fr: "La journee est terminee",
      de: "Heute abgeschlossen",
      it: "Oggi e completato",
    }),
    detail: pickByLang(args.lang, {
      en: "You are done. Come back tomorrow for one clear action.",
      pt: "Terminaste. Volta amanha para uma acao clara.",
      es: "Has terminado. Vuelve manana para una accion clara.",
      fr: "Vous avez termine. Revenez demain pour une action claire.",
      de: "Du bist fertig. Komm morgen fur eine klare Aktion zuruck.",
      it: "Hai finito. Torna domani per un'azione chiara.",
    }),
    actionLabel: pickByLang(args.lang, {
      en: "Refresh",
      pt: "Atualizar",
      es: "Actualizar",
      fr: "Actualiser",
      de: "Aktualisieren",
      it: "Aggiorna",
    }),
    action: "refresh",
    badgeLabel: "On track",
    badgeTone: "good",
  };
}

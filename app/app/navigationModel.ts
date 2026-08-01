import type { SiteLang } from "@/lib/i18n/siteLanguage";
import { pickByLang } from "@/lib/i18n/siteLanguage";
import type { AutopilotMode } from "@/lib/signalcore/modes";

export type ViewKey =
  | "daily"
  | "planning"
  | "advisor"
  | "portfolio"
  | "autonomy"
  | "trading"
  | "opportunities"
  | "execution"
  | "risk"
  | "journal"
  | "alerts";

export type ShellNavItem = {
  key: ViewKey;
  label: string;
  locked?: boolean;
};

function asNavItem(key: ViewKey, label: string, locked: boolean): ShellNavItem {
  return locked ? { key, label, locked: true } : { key, label };
}

const INVESTING_VIEWS: ViewKey[] = ["daily", "planning", "portfolio", "advisor", "autonomy"];
const TRADING_VIEWS: ViewKey[] = ["trading", "alerts", "journal"];
const LEGACY_TRADING_VIEWS: ViewKey[] = ["opportunities", "execution", "risk"];

function getModeViews(mode: AutopilotMode): ViewKey[] {
  return mode === "trading" ? TRADING_VIEWS : INVESTING_VIEWS;
}

export function getModeHomeView(mode: AutopilotMode): ViewKey {
  return mode === "trading" ? "trading" : "daily";
}

export function inferModeFromView(rawView: string | null | undefined): AutopilotMode | null {
  const raw = String(rawView ?? "").toLowerCase().trim();
  const normalized =
    raw === "plan"
      ? "planning"
      : raw === "opportunity"
        ? "opportunities"
        : raw === "alert"
          ? "alerts"
          : raw;

  if (
    TRADING_VIEWS.includes(normalized as ViewKey) ||
    LEGACY_TRADING_VIEWS.includes(normalized as ViewKey)
  ) {
    return "trading";
  }
  if (INVESTING_VIEWS.includes(normalized as ViewKey)) return "investing";
  return null;
}

export function isAuxiliarySurfaceMode(mode: AutopilotMode) {
  return mode === "trading";
}

export function resolveModeAwareView(args: {
  rawView: string | null | undefined;
  mode: AutopilotMode;
  allowHiddenPortfolio?: boolean;
}) {
  const raw = String(args.rawView ?? getModeHomeView(args.mode)).toLowerCase().trim();
  const normalized =
    raw === "plan"
      ? "planning"
      : raw === "opportunity"
        ? "opportunities"
        : raw === "alert"
          ? "alerts"
          : raw;

  const allowedViews = new Set<ViewKey>(getModeViews(args.mode));
  if (args.mode === "trading" && LEGACY_TRADING_VIEWS.includes(normalized as ViewKey)) {
    return "trading" as const;
  }
  if (normalized === "portfolio" && args.allowHiddenPortfolio && args.mode === "investing") {
    return "portfolio" as const;
  }

  if (allowedViews.has(normalized as ViewKey)) {
    return normalized as ViewKey;
  }

  return getModeHomeView(args.mode);
}

export function toModeAwareTab(args: {
  view: ViewKey;
  mode: AutopilotMode;
}) {
  return resolveModeAwareView({
    rawView: args.view,
    mode: args.mode,
  });
}

export function buildModeAwareNavItems(args: {
  mode: AutopilotMode;
  lang: SiteLang;
  lockedKeys?: ViewKey[];
}): ShellNavItem[] {
  const locked = new Set<ViewKey>(args.lockedKeys ?? []);
  if (args.mode === "trading") {
    return [
      asNavItem(
        "trading",
        pickByLang(args.lang, {
          en: "Trading",
          pt: "Trading",
          es: "Trading",
          fr: "Trading",
          de: "Trading",
          it: "Trading",
        }),
        locked.has("trading"),
      ),
      asNavItem(
        "alerts",
        pickByLang(args.lang, {
          en: "Alerts",
          pt: "Alertas",
          es: "Alertas",
          fr: "Alertes",
          de: "Alarme",
          it: "Avvisi",
        }),
        locked.has("alerts"),
      ),
      asNavItem(
        "journal",
        pickByLang(args.lang, {
          en: "Journal",
          pt: "Journal",
          es: "Journal",
          fr: "Journal",
          de: "Journal",
          it: "Journal",
        }),
        locked.has("journal"),
      ),
    ];
  }

  return [
    asNavItem(
      "daily",
      pickByLang(args.lang, {
        en: "Overview",
        pt: "Visao geral",
        es: "Resumen",
        fr: "Vue generale",
        de: "Ubersicht",
        it: "Panoramica",
      }),
      locked.has("daily"),
    ),
    asNavItem(
      "portfolio",
      pickByLang(args.lang, {
        en: "Portfolio",
        pt: "Portfolio",
        es: "Cartera",
        fr: "Portefeuille",
        de: "Portfolio",
        it: "Portafoglio",
      }),
      locked.has("portfolio"),
    ),
    asNavItem(
      "advisor",
      pickByLang(args.lang, {
        en: "Recommendations",
        pt: "Recomendacoes",
        es: "Recomendaciones",
        fr: "Recommandations",
        de: "Empfehlungen",
        it: "Raccomandazioni",
      }),
      locked.has("advisor"),
    ),
    asNavItem(
      "planning",
      pickByLang(args.lang, {
        en: "Plan",
        pt: "Plano",
        es: "Plan",
        fr: "Plan",
        de: "Plan",
        it: "Piano",
      }),
      locked.has("planning"),
    ),
    asNavItem(
      "autonomy",
      pickByLang(args.lang, {
        en: "Settings",
        pt: "Definicoes",
        es: "Ajustes",
        fr: "Parametres",
        de: "Einstellungen",
        it: "Impostazioni",
      }),
      locked.has("autonomy"),
    ),
  ];
}

export function buildShellCopy(args: {
  mode: AutopilotMode;
  view: ViewKey;
  lang: SiteLang;
}) {
  if (args.mode === "trading") {
    if (args.view === "execution") {
      return {
        title: pickByLang(args.lang, {
          en: "Trading Execution",
          pt: "Execucao Trading",
          es: "Ejecucion Trading",
          fr: "Execution Trading",
          de: "Trading-Ausfuhrung",
          it: "Esecuzione Trading",
        }),
        subtitle: pickByLang(args.lang, {
          en: "Turn setups into a calm execution pack with sizing, simulation, and fewer mistakes.",
          pt: "Transforma setups num pack de execucao calmo, com sizing, simulacao e menos erros.",
          es: "Convierte setups en un pack de ejecucion calmado, con sizing, simulacion y menos errores.",
          fr: "Transformez les setups en pack d execution calme avec sizing, simulation et moins d erreurs.",
          de: "Mache aus Setups ein ruhiges Ausfuhrungspaket mit Sizing, Simulation und weniger Fehlern.",
          it: "Trasforma i setup in un pacchetto di esecuzione calmo con sizing, simulazione e meno errori.",
        }),
      };
    }

    if (args.view === "risk") {
      return {
        title: pickByLang(args.lang, {
          en: "Trading Risk",
          pt: "Risco Trading",
          es: "Riesgo Trading",
          fr: "Risque Trading",
          de: "Trading-Risiko",
          it: "Rischio Trading",
        }),
        subtitle: pickByLang(args.lang, {
          en: "Stress, guardrails, and factor heat before you add fresh trade risk.",
          pt: "Stress, guardrails e heat de fatores antes de adicionares risco novo por trade.",
          es: "Stress, guardrails y heat de factores antes de anadir riesgo nuevo por trade.",
          fr: "Stress, garde-fous et heat de facteurs avant d ajouter un nouveau risque de trade.",
          de: "Stress, Leitplanken und Faktor-Heat bevor du neues Trade-Risiko hinzufugst.",
          it: "Stress, guardrail e heat dei fattori prima di aggiungere nuovo rischio per trade.",
        }),
      };
    }

    return {
      title: pickByLang(args.lang, {
        en: "Trading Cockpit",
        pt: "Cockpit Trading",
        es: "Cockpit Trading",
        fr: "Cockpit Trading",
        de: "Trading-Cockpit",
        it: "Cockpit Trading",
      }),
      subtitle: pickByLang(args.lang, {
        en: "Opportunity flow, execution discipline, and post-trade learning in one trading-native workspace.",
        pt: "Fluxo de oportunidades, disciplina de execucao e aprendizagem pos-trade num workspace nativo de trading.",
        es: "Flujo de oportunidades, disciplina de ejecucion y aprendizaje post-trade en un workspace nativo de trading.",
        fr: "Flux d opportunites, discipline d execution et apprentissage post-trade dans un workspace trading natif.",
        de: "Opportunity-Flow, Ausfuhrungsdisziplin und Post-Trade-Lernen in einem trading-nativen Workspace.",
        it: "Flusso di opportunita, disciplina di esecuzione e apprendimento post-trade in uno workspace nativo di trading.",
      }),
    };
  }

  if (args.view === "planning") {
    return {
      title: pickByLang(args.lang, {
        en: "Investing Plan",
        pt: "Plano Investing",
        es: "Plan Investing",
        fr: "Plan Investing",
        de: "Investing-Plan",
        it: "Piano Investing",
      }),
      subtitle: pickByLang(args.lang, {
        en: "Translate goals, risk, and horizon into a capital plan that the daily loop can actually enforce.",
        pt: "Traduz objetivo, risco e horizonte num plano de capital que o daily loop consegue mesmo impor.",
        es: "Traduce objetivo, riesgo y horizonte en un plan de capital que el daily loop pueda imponer.",
        fr: "Traduisez objectif, risque et horizon en plan de capital que la boucle daily peut vraiment appliquer.",
        de: "Ubersetze Ziel, Risiko und Horizont in einen Kapitalplan, den der Daily-Loop wirklich durchsetzen kann.",
        it: "Traduce obiettivo, rischio e orizzonte in un piano di capitale che il daily loop puo davvero applicare.",
      }),
    };
  }

  if (args.view === "portfolio") {
    return {
      title: pickByLang(args.lang, {
        en: "Investing Portfolio",
        pt: "Portfolio Investing",
        es: "Portfolio Investing",
        fr: "Portefeuille Investing",
        de: "Investing-Portfolio",
        it: "Portafoglio Investing",
      }),
      subtitle: pickByLang(args.lang, {
        en: "Capital, holdings, starter packs, and leak repair for long-term compounding.",
        pt: "Capital, holdings, starter packs e reparacao de leaks para compounding de longo prazo.",
        es: "Capital, holdings, starter packs y reparacion de leaks para compounding de largo plazo.",
        fr: "Capital, positions, starter packs et reparation des leaks pour le compounding de longo prazo.",
        de: "Kapital, Holdings, Starter-Packs und Leak-Reparatur fur langfristiges Compounding.",
        it: "Capitale, posizioni, starter pack e riparazione dei leak per compounding di lungo periodo.",
      }),
    };
  }

  return {
    title: pickByLang(args.lang, {
      en: "Investing OS",
      pt: "Investing OS",
      es: "Investing OS",
      fr: "Investing OS",
      de: "Investing OS",
      it: "Investing OS",
    }),
    subtitle: pickByLang(args.lang, {
      en: "Goal-led capital decisions, calmer daily actions, and institutional risk control for long-term investors.",
      pt: "Decisoes de capital guiadas por objetivo, acoes diarias mais calmas e controlo de risco institucional para investidores.",
      es: "Decisiones de capital guiadas por objetivo, acciones diarias mas calmadas y control de riesgo institucional para inversores.",
      fr: "Decisions de capital guidees par objectif, actions quotidiennes plus calmes et controle de risque institutionnel pour investisseurs.",
      de: "Zielgeleitete Kapitalentscheidungen, ruhigere Tagesaktionen und institutionelle Risikokontrolle fur langfristige Investoren.",
      it: "Decisioni di capitale guidate dall obiettivo, azioni quotidiane piu calme e controllo del rischio istituzionale per investitori.",
    }),
  };
}

import type { SiteLang } from "@/lib/i18n/siteLanguage";
import { pickByLang } from "@/lib/i18n/siteLanguage";
import type { AutopilotMode } from "@/lib/signalcore/modes";

export type ViewKey =
  | "trading"
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

const TRADING_VIEWS: ViewKey[] = ["trading", "alerts", "journal"];

export function getModeHomeView(mode: AutopilotMode): ViewKey {
  void mode;
  return "trading";
}

export function inferModeFromView(rawView: string | null | undefined): AutopilotMode | null {
  const raw = String(rawView ?? "").toLowerCase().trim();
  const normalized = raw === "alert" ? "alerts" : raw;

  if (TRADING_VIEWS.includes(normalized as ViewKey)) {
    return "trading";
  }
  return null;
}

export function isAuxiliarySurfaceMode(mode: AutopilotMode) {
  void mode;
  return true;
}

export function resolveModeAwareView(args: {
  rawView: string | null | undefined;
  mode: AutopilotMode;
}) {
  const raw = String(args.rawView ?? getModeHomeView(args.mode)).toLowerCase().trim();
  const normalized = raw === "alert" ? "alerts" : raw;

  if (TRADING_VIEWS.includes(normalized as ViewKey)) {
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
  void args.mode;
  const locked = new Set<ViewKey>(args.lockedKeys ?? []);
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

export function buildShellCopy(args: {
  mode: AutopilotMode;
  view: ViewKey;
  lang: SiteLang;
}) {
  void args.mode;
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

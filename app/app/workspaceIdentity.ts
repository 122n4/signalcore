import { pickByLang, type SiteLang } from "@/lib/i18n/siteLanguage";
import type { AutopilotMode } from "@/lib/signalcore/modes";

import type { ViewKey } from "./navigationModel";

export type WorkspaceIdentityTone = "investing" | "trading";

export type WorkspaceIdentityStat = {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn" | "accent";
};

export type WorkspaceIdentityRailModel = {
  tone: WorkspaceIdentityTone;
  eyebrow: string;
  headline: string;
  summary: string;
  primaryLabel: string;
  secondaryLabel: string;
  stats: WorkspaceIdentityStat[];
  proofPoints: string[];
};

export function buildWorkspaceIdentityRailModel(args: {
  mode: AutopilotMode;
  view: ViewKey;
  tier: "free" | "trial" | "pro";
  lang: SiteLang;
}): WorkspaceIdentityRailModel {
  if (args.mode === "trading") {
    const executionDepth =
      args.tier === "free"
        ? pickByLang(args.lang, {
            en: "Discovery",
            pt: "Discovery",
            es: "Discovery",
            fr: "Discovery",
            de: "Discovery",
            it: "Discovery",
          })
        : pickByLang(args.lang, {
            en: "Full stack",
            pt: "Stack completo",
            es: "Stack completo",
            fr: "Stack complet",
            de: "Voller Stack",
            it: "Stack completo",
          });

    return {
      tone: "trading",
      eyebrow: pickByLang(args.lang, {
        en: "Trading workspace",
        pt: "Workspace trading",
        es: "Workspace trading",
        fr: "Workspace trading",
        de: "Trading-Workspace",
        it: "Workspace trading",
      }),
      headline: pickByLang(args.lang, {
        en: "Read broad market flow. Escalate only what deserves execution.",
        pt: "Ler o fluxo amplo do mercado. Escalar so o que merece execucao.",
        es: "Lee el flujo amplio del mercado. Escala solo lo que merece ejecucion.",
        fr: "Lire le flux large du marche. Escalader seulement ce qui merite execution.",
        de: "Lies den breiten Marktfluss. Skaliere nur, was Ausfuehrung verdient.",
        it: "Leggi il flusso ampio del mercato. Scala solo cio che merita esecuzione.",
      }),
      summary: pickByLang(args.lang, {
        en: "Syntrake now separates market radar, watchlist, true opportunities, and execution. The desk can stay broad without pretending every WAIT market is actionable.",
        pt: "O Syntrake separa agora market radar, watchlist, oportunidades reais e execucao. A desk pode ficar ampla sem fingir que cada mercado em WAIT e acionavel.",
        es: "Syntrake separa ahora market radar, watchlist, oportunidades reales y ejecucion. La desk puede ser amplia sin fingir que cada mercado en WAIT es accionable.",
        fr: "Syntrake separe maintenant market radar, watchlist, vraies opportunites et execution. Le desk peut rester large sans pretendre que chaque marche en WAIT est actionnable.",
        de: "Syntrake trennt jetzt Market Radar, Watchlist, echte Chancen und Execution. Das Desk kann breit bleiben, ohne so zu tun, als sei jeder WAIT-Markt handelbar.",
        it: "Syntrake ora separa market radar, watchlist, opportunita reali ed esecuzione. La desk puo restare ampia senza fingere che ogni mercato in WAIT sia azionabile.",
      }),
      primaryLabel:
        args.view === "opportunities"
          ? pickByLang(args.lang, {
              en: "Open Desk",
              pt: "Abrir Desk",
              es: "Abrir Desk",
              fr: "Ouvrir Desk",
              de: "Desk oeffnen",
              it: "Apri Desk",
            })
          : pickByLang(args.lang, {
              en: "Open Opportunities",
              pt: "Abrir Opportunities",
              es: "Abrir Opportunities",
              fr: "Ouvrir Opportunities",
              de: "Opportunities oeffnen",
              it: "Apri Opportunities",
            }),
      secondaryLabel:
        args.tier === "free"
          ? pickByLang(args.lang, {
              en: "Compare Trading Pro",
              pt: "Comparar Trading Pro",
              es: "Comparar Trading Pro",
              fr: "Comparer Trading Pro",
              de: "Trading Pro vergleichen",
              it: "Confronta Trading Pro",
            })
          : pickByLang(args.lang, {
              en: "Open Execution",
              pt: "Abrir Execution",
              es: "Abrir Execution",
              fr: "Ouvrir Execution",
              de: "Execution oeffnen",
              it: "Apri Execution",
            }),
      stats: [
        {
          label: pickByLang(args.lang, {
            en: "Universe",
            pt: "Universo",
            es: "Universo",
            fr: "Univers",
            de: "Universum",
            it: "Universo",
          }),
          value: "8 live",
          tone: "accent",
        },
        {
          label: pickByLang(args.lang, {
            en: "Flow model",
            pt: "Modelo de fluxo",
            es: "Modelo de flujo",
            fr: "Modele de flux",
            de: "Flow-Modell",
            it: "Modello di flusso",
          }),
          value: "Radar -> Execution",
          tone: "good",
        },
        {
          label: pickByLang(args.lang, {
            en: "Broker path",
            pt: "Caminho broker",
            es: "Ruta broker",
            fr: "Parcours broker",
            de: "Broker-Pfad",
            it: "Percorso broker",
          }),
          value: "External",
          tone: "neutral",
        },
        {
          label: pickByLang(args.lang, {
            en: "Depth",
            pt: "Profundidade",
            es: "Profundidad",
            fr: "Profondeur",
            de: "Tiefe",
            it: "Profondita",
          }),
          value: executionDepth,
          tone: args.tier === "free" ? "warn" : "good",
        },
      ],
      proofPoints: [
        pickByLang(args.lang, {
          en: "Radar stays broad, but Opportunities only surface what deserves attention.",
          pt: "O Radar fica amplo, mas Opportunities so mostra o que merece atencao.",
          es: "Radar sigue amplio, pero Opportunities solo muestra lo que merece atencion.",
          fr: "Le Radar reste large, mais Opportunities ne montre que ce qui merite l attention.",
          de: "Das Radar bleibt breit, aber Opportunities zeigt nur, was Aufmerksamkeit verdient.",
          it: "Il Radar resta ampio, ma Opportunities mostra solo cio che merita attenzione.",
        }),
        pickByLang(args.lang, {
          en: "Execution happens in the user's broker with clearer invalidation, size, and checklist.",
          pt: "A execucao acontece no broker do utilizador com invalidation, size e checklist mais claros.",
          es: "La ejecucion ocurre en el broker del usuario con invalidation, size y checklist mas claros.",
          fr: "L execution se passe dans le broker de l utilisateur avec invalidation, taille et checklist plus clairs.",
          de: "Execution passiert im Broker des Nutzers mit klarerer Invalidation, Groesse und Checkliste.",
          it: "L esecuzione avviene nel broker dell utente con invalidation, size e checklist piu chiari.",
        }),
        pickByLang(args.lang, {
          en: "Pro deepens discipline. It does not hide the desk.",
          pt: "O Pro aprofunda a disciplina. Nao esconde a desk.",
          es: "Pro profundiza la disciplina. No esconde la desk.",
          fr: "Pro approfondit la discipline. Il ne cache pas le desk.",
          de: "Pro vertieft Disziplin. Es versteckt nicht das Desk.",
          it: "Il Pro approfondisce la disciplina. Non nasconde la desk.",
        }),
      ],
    };
  }

  return {
    tone: "investing",
    eyebrow: pickByLang(args.lang, {
      en: "Investing workspace",
      pt: "Workspace investing",
      es: "Workspace investing",
      fr: "Workspace investing",
      de: "Investing-Workspace",
      it: "Workspace investing",
    }),
    headline: pickByLang(args.lang, {
      en: "Calmer capital decisions with a visible plan and visible risk.",
      pt: "Decisoes de capital mais calmas com plano visivel e risco visivel.",
      es: "Decisiones de capital mas calmadas con plan visible y riesgo visible.",
      fr: "Decisions de capital plus calmes avec plan visible et risque visible.",
      de: "Ruhigere Kapitalentscheidungen mit sichtbarem Plan und sichtbarem Risiko.",
      it: "Decisioni di capitale piu calme con piano visibile e rischio visibile.",
    }),
    summary: pickByLang(args.lang, {
      en: "Syntrake keeps Investing open before premium: Today, Plan, Portfolio, Advisor, and Autonomy stay usable so the product proves value before it ever asks for money.",
      pt: "O Syntrake mantem Investing aberto antes do premium: Today, Plan, Portfolio, Advisor e Autonomy ficam usaveis para o produto provar valor antes de pedir dinheiro.",
      es: "Syntrake mantiene Investing abierto antes del premium: Today, Plan, Portfolio, Advisor y Autonomy siguen utilizables para demostrar valor antes de pedir dinero.",
      fr: "Syntrake garde Investing ouvert avant le premium : Today, Plan, Portfolio, Advisor et Autonomy restent utilisables pour prouver la valeur avant de demander de l argent.",
      de: "Syntrake haelt Investing vor Premium offen: Today, Plan, Portfolio, Advisor und Autonomy bleiben nutzbar, damit das Produkt Wert beweist, bevor es Geld verlangt.",
      it: "Syntrake mantiene Investing aperto prima del premium: Today, Plan, Portfolio, Advisor e Autonomy restano utilizzabili per dimostrare valore prima di chiedere denaro.",
    }),
    primaryLabel:
      args.view === "planning"
        ? pickByLang(args.lang, {
            en: "Open Today",
            pt: "Abrir Today",
            es: "Abrir Today",
            fr: "Ouvrir Today",
            de: "Today oeffnen",
            it: "Apri Today",
          })
        : pickByLang(args.lang, {
            en: "Open Plan",
            pt: "Abrir Plano",
            es: "Abrir Plan",
            fr: "Ouvrir Plan",
            de: "Plan oeffnen",
            it: "Apri Piano",
          }),
    secondaryLabel: pickByLang(args.lang, {
      en: "Open Trust Center",
      pt: "Abrir Trust Center",
      es: "Abrir Trust Center",
      fr: "Ouvrir Trust Center",
      de: "Trust Center oeffnen",
      it: "Apri Trust Center",
    }),
    stats: [
      {
        label: pickByLang(args.lang, {
          en: "Operating mode",
          pt: "Modo operativo",
          es: "Modo operativo",
          fr: "Mode operatif",
          de: "Betriebsmodus",
          it: "Modo operativo",
        }),
        value: "Goal-led",
        tone: "accent",
      },
      {
        label: pickByLang(args.lang, {
          en: "Decision cadence",
          pt: "Cadencia de decisao",
          es: "Cadencia de decision",
          fr: "Cadence de decision",
          de: "Entscheidungsrhythmus",
          it: "Cadenza di decisione",
        }),
        value: "Daily loop",
        tone: "good",
      },
      {
        label: pickByLang(args.lang, {
          en: "Risk posture",
          pt: "Postura de risco",
          es: "Postura de riesgo",
          fr: "Posture de risque",
          de: "Risikohaltung",
          it: "Postura di rischio",
        }),
        value: "Visible first",
        tone: "neutral",
      },
      {
        label: pickByLang(args.lang, {
          en: "Price",
          pt: "Preco",
          es: "Precio",
          fr: "Prix",
          de: "Preis",
          it: "Prezzo",
        }),
        value: "Free forever",
        tone: "good",
      },
    ],
    proofPoints: [
      pickByLang(args.lang, {
        en: "The user sees the daily loop, plan, and portfolio before any paywall pressure.",
        pt: "O utilizador ve o daily loop, o plano e o portfolio antes de qualquer pressao de paywall.",
        es: "El usuario ve el daily loop, el plan y la cartera antes de cualquier presion de paywall.",
        fr: "L utilisateur voit la boucle daily, le plan et le portefeuille avant toute pression de paywall.",
        de: "Der Nutzer sieht Daily-Loop, Plan und Portfolio vor jedem Paywall-Druck.",
        it: "L utente vede daily loop, piano e portafoglio prima di qualsiasi pressione di paywall.",
      }),
      pickByLang(args.lang, {
        en: "Risk comes before speed: posture, drift, and next action stay explicit.",
        pt: "O risco vem antes da velocidade: postura, drift e proxima acao ficam explicitos.",
        es: "El riesgo va antes que la velocidad: postura, drift y siguiente accion quedan explicitos.",
        fr: "Le risque vient avant la vitesse : posture, derive et action suivante restent explicites.",
        de: "Risiko kommt vor Tempo: Haltung, Drift und naechste Aktion bleiben explizit.",
        it: "Il rischio viene prima della velocita: postura, drift e prossima azione restano espliciti.",
      }),
      pickByLang(args.lang, {
        en: "Broker independence stays intact. Syntrake wraps guidance around the user's existing setup.",
        pt: "A independencia do broker mantem-se. O Syntrake envolve orientacao a volta do setup existente do utilizador.",
        es: "La independencia del broker se mantiene. Syntrake envuelve orientacion alrededor del setup existente del usuario.",
        fr: "L independance du broker reste intacte. Syntrake entoure le setup existant de guidance.",
        de: "Die Broker-Unabhaengigkeit bleibt erhalten. Syntrake legt Guidance um das bestehende Setup des Nutzers.",
        it: "L indipendenza dal broker resta intatta. Syntrake avvolge guida attorno al setup esistente dell utente.",
      }),
    ],
  };
}

import type { Metadata } from "next";

import TrackedLink from "@/components/TrackedLink";
import { pickByLang, type Multilingual, type SiteLang } from "@/lib/i18n/siteLanguage";
import { resolveRequestSiteLang, withLangQuery } from "@/lib/i18n/requestSiteLang";

type PageSearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Syntrake for Serious Traders",
  description:
    "A trading decision desk built around timeframe, thesis, trigger, invalidation, stale-data checks, crisis validation, and execution proof.",
};

function t(lang: SiteLang, value: Multilingual) {
  return pickByLang(lang, value);
}

function metricCards(lang: SiteLang) {
  return [
    {
      label: "PF",
      value: "1.69",
      detail: t(lang, {
        en: "Current baseline research snapshot. Not a guarantee.",
        pt: "Snapshot atual do baseline de research. Nao e garantia.",
        es: "Snapshot actual del baseline de research. No es garantia.",
        fr: "Snapshot actuel du baseline de recherche. Ce n'est pas une garantie.",
        de: "Aktueller Research-Baseline-Snapshot. Keine Garantie.",
        it: "Snapshot attuale del baseline di ricerca. Non e una garanzia.",
      }),
    },
    {
      label: "Trades",
      value: "243",
      detail: t(lang, {
        en: "Baseline sample used to keep frequency visible.",
        pt: "Amostra baseline usada para manter frequencia visivel.",
        es: "Muestra baseline usada para mantener frecuencia visible.",
        fr: "Echantillon baseline utilise pour garder la frequence visible.",
        de: "Baseline-Stichprobe, um Frequenz sichtbar zu halten.",
        it: "Campione baseline usato per mantenere visibile la frequenza.",
      }),
    },
    {
      label: "Expectancy",
      value: "+0.20R",
      detail: t(lang, {
        en: "The lab still rejects candidates that fail crisis and robustness gates.",
        pt: "O laboratorio rejeita candidatos que falham crise e robustez.",
        es: "El laboratorio rechaza candidatos que fallan crisis y robustez.",
        fr: "Le labo rejette les candidats qui echouent en crise et robustesse.",
        de: "Das Lab verwirft Kandidaten, die Krisen- und Robustheits-Gates verfehlen.",
        it: "Il laboratorio rifiuta candidati che falliscono crisi e robustezza.",
      }),
    },
  ];
}

function proofItems(lang: SiteLang) {
  return [
    t(lang, {
      en: "Timeframe and aggregation visible before judgement.",
      pt: "Timeframe e agregacao visiveis antes de julgar.",
      es: "Timeframe y agregacion visibles antes de juzgar.",
      fr: "Timeframe et agregation visibles avant jugement.",
      de: "Timeframe und Aggregation vor der Beurteilung sichtbar.",
      it: "Timeframe e aggregazione visibili prima del giudizio.",
    }),
    t(lang, {
      en: "Trade thesis, trigger, invalidation, target, and stand-aside condition in one card.",
      pt: "Tese, trigger, invalidacao, alvo e condicao de stand-aside num cartao.",
      es: "Tesis, trigger, invalidacion, objetivo y stand-aside en una tarjeta.",
      fr: "These, trigger, invalidation, objectif et stand-aside dans une carte.",
      de: "These, Trigger, Invalidation, Ziel und Stand-aside in einer Karte.",
      it: "Tesi, trigger, invalidazione, target e stand-aside in una scheda.",
    }),
    t(lang, {
      en: "Live snapshot discipline blocks broker action when data is stale.",
      pt: "Disciplina de snapshot bloqueia acao no broker quando os dados estao stale.",
      es: "Disciplina de snapshot bloquea accion en broker si los datos estan obsoletos.",
      fr: "La discipline snapshot bloque l'action broker quand les donnees sont obsoletes.",
      de: "Snapshot-Disziplin blockiert Broker-Aktion bei veralteten Daten.",
      it: "Disciplina snapshot blocca azione broker con dati obsoleti.",
    }),
    t(lang, {
      en: "Follow-until-close loop keeps the selected market tracked after entry.",
      pt: "Follow until close mantem o mercado escolhido seguido depois da entrada.",
      es: "Follow until close mantiene el mercado elegido seguido despues de entrada.",
      fr: "Follow until close garde le marche choisi suivi apres entree.",
      de: "Follow-until-close verfolgt den gewaehlten Markt nach Entry weiter.",
      it: "Follow until close segue il mercato scelto dopo l'entrata.",
    }),
  ];
}

function workflowItems(lang: SiteLang) {
  return [
    {
      title: t(lang, {
        en: "1. Radar, not noise",
        pt: "1. Radar, nao ruido",
        es: "1. Radar, no ruido",
        fr: "1. Radar, pas bruit",
        de: "1. Radar, kein Laerm",
        it: "1. Radar, non rumore",
      }),
      body: t(lang, {
        en: "Start with the market list: actionable, monitoring, stand aside, or closed.",
        pt: "Comeca pela lista: acionavel, monitorizar, stand aside ou mercado fechado.",
        es: "Empieza por la lista: accionable, monitorizar, stand aside o cerrado.",
        fr: "Commence par la liste: actionnable, monitoring, stand aside ou ferme.",
        de: "Beginne mit der Liste: actionable, monitoring, stand aside oder geschlossen.",
        it: "Parti dalla lista: actionable, monitoring, stand aside o chiuso.",
      }),
    },
    {
      title: t(lang, {
        en: "2. Thesis before trigger",
        pt: "2. Tese antes do trigger",
        es: "2. Tesis antes del trigger",
        fr: "2. These avant trigger",
        de: "2. These vor Trigger",
        it: "2. Tesi prima del trigger",
      }),
      body: t(lang, {
        en: "Every selected market explains context, session, liquidity, trigger, invalidation, and what kills the idea.",
        pt: "Cada mercado explica contexto, sessao, liquidez, trigger, invalidacao e o que mata a ideia.",
        es: "Cada mercado explica contexto, sesion, liquidez, trigger, invalidacion y que mata la idea.",
        fr: "Chaque marche explique contexte, session, liquidite, trigger, invalidation et ce qui tue l'idee.",
        de: "Jeder Markt erklaert Kontext, Session, Liquiditaet, Trigger, Invalidation und was die Idee zerstoert.",
        it: "Ogni mercato spiega contesto, sessione, liquidita, trigger, invalidazione e cosa annulla l'idea.",
      }),
    },
    {
      title: t(lang, {
        en: "3. Broker only after gates",
        pt: "3. Broker so depois dos gates",
        es: "3. Broker solo despues de gates",
        fr: "3. Broker seulement apres gates",
        de: "3. Broker erst nach Gates",
        it: "3. Broker solo dopo i gate",
      }),
      body: t(lang, {
        en: "If live data, risk, execution status, or invalidation are not clean, Syntrake tells you to wait.",
        pt: "Se dados live, risco, execucao ou invalidacao nao estao limpos, Syntrake manda esperar.",
        es: "Si datos live, riesgo, ejecucion o invalidacion no estan limpios, Syntrake indica esperar.",
        fr: "Si donnees live, risque, execution ou invalidation ne sont pas propres, Syntrake dit d'attendre.",
        de: "Wenn Live-Daten, Risiko, Ausfuehrung oder Invalidation nicht sauber sind, sagt Syntrake warten.",
        it: "Se dati live, rischio, esecuzione o invalidazione non sono puliti, Syntrake dice di aspettare.",
      }),
    },
  ];
}

export default async function ForProsPage({
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
    <main className="min-h-screen bg-[#07101c] text-white">
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="overflow-hidden rounded-[34px] border border-slate-800 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_32%),linear-gradient(145deg,#0b1526,#07101c_56%,#0b111d)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.42)] md:p-9">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/80">
                {t(lang, {
                  en: "For traders who hate vague signals",
                  pt: "Para traders que odeiam sinais vagos",
                  es: "Para traders que odian senales vagas",
                  fr: "Pour traders qui detestent les signaux vagues",
                  de: "Fuer Trader, die vage Signale hassen",
                  it: "Per trader che odiano segnali vaghi",
                })}
              </p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight md:text-6xl">
                {t(lang, {
                  en: "A trade idea should survive cross-examination before it reaches the broker.",
                  pt: "Uma ideia de trade deve sobreviver a interrogatorio antes de chegar ao broker.",
                  es: "Una idea de trade debe sobrevivir interrogatorio antes de llegar al broker.",
                  fr: "Une idee de trade doit survivre a l'interrogatoire avant le broker.",
                  de: "Eine Trade-Idee muss Pruefung ueberstehen, bevor sie den Broker erreicht.",
                  it: "Un'idea di trade deve resistere a verifica prima del broker.",
                })}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
                {t(lang, {
                  en: "Syntrake is not a guru feed. It is a live decision desk that forces timeframe, context, trigger, invalidation, risk, stale-data discipline, and follow-through into the workflow.",
                  pt: "Syntrake nao e feed de guru. E uma mesa de decisao live que obriga timeframe, contexto, trigger, invalidacao, risco, dados frescos e continuidade no processo.",
                  es: "Syntrake no es feed de guru. Es una mesa de decision live que fuerza timeframe, contexto, trigger, invalidacion, riesgo, datos frescos y continuidad.",
                  fr: "Syntrake n'est pas un feed de gourou. C'est un desk de decision live qui impose timeframe, contexte, trigger, invalidation, risque, donnees fraiches et continuite.",
                  de: "Syntrake ist kein Guru-Feed. Es ist ein Live-Decision-Desk fuer Timeframe, Kontext, Trigger, Invalidation, Risiko, Frische und Follow-through.",
                  it: "Syntrake non e un feed da guru. E un desk decisionale live per timeframe, contesto, trigger, invalidazione, rischio, dati freschi e continuita.",
                })}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <TrackedLink
                  href={link("/app?mode=trading")}
                  eventName="cta_click"
                  eventData={{ location: "for_pros_traders", target: "trading_app" }}
                  className="inline-flex items-center justify-center rounded-2xl bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_45px_rgba(34,211,238,0.24)] transition hover:bg-cyan-200"
                >
                  {t(lang, {
                    en: "Open trading desk",
                    pt: "Abrir trading desk",
                    es: "Abrir trading desk",
                    fr: "Ouvrir trading desk",
                    de: "Trading Desk oeffnen",
                    it: "Apri trading desk",
                  })}
                </TrackedLink>
                <TrackedLink
                  href={link("/pricing?source=for_pros_traders")}
                  eventName="cta_click"
                  eventData={{ location: "for_pros_traders", target: "pricing" }}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-700 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/50 hover:bg-white/10"
                >
                  {t(lang, {
                    en: "See Pro depth",
                    pt: "Ver profundidade Pro",
                    es: "Ver profundidad Pro",
                    fr: "Voir profondeur Pro",
                    de: "Pro-Tiefe ansehen",
                    it: "Vedi profondita Pro",
                  })}
                </TrackedLink>
              </div>
            </div>

            <div className="rounded-[28px] border border-cyan-300/18 bg-[#07101c]/86 p-4">
              <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      BTCUSD · 5m execution
                    </div>
                    <div className="mt-2 text-2xl font-semibold">Trade thesis, not vibes</div>
                  </div>
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-400/12 px-3 py-1 text-xs font-semibold text-emerald-100">
                    Fresh snapshot
                  </span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    ["Context", "Reclaim / expansion"],
                    ["Trigger", "78163.4"],
                    ["Invalidation", "Under sweep low"],
                    ["Stand aside", "Midrange chop / stale data"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-slate-800 bg-[#07101c] p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {label}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {metricCards(lang).map((item) => (
            <div key={item.label} className="rounded-[24px] border border-slate-800 bg-[#0b1526] p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {item.label}
              </div>
              <div className="mt-2 text-3xl font-semibold text-white">{item.value}</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</div>
            </div>
          ))}
        </div>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[28px] border border-slate-800 bg-[#0b1526] p-6">
            <h2 className="text-2xl font-semibold">
              {t(lang, {
                en: "Built to be criticized by traders.",
                pt: "Construido para ser criticado por traders.",
                es: "Construido para ser criticado por traders.",
                fr: "Construit pour etre critique par des traders.",
                de: "Gebaut, um von Tradern kritisiert zu werden.",
                it: "Costruito per essere criticato dai trader.",
              })}
            </h2>
            <div className="mt-5 space-y-3">
              {proofItems(lang).map((item) => (
                <div key={item} className="rounded-2xl border border-slate-800 bg-[#07101c] px-4 py-3 text-sm leading-6 text-slate-300">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            {workflowItems(lang).map((item) => (
              <div key={item.title} className="rounded-[24px] border border-slate-800 bg-[#0b1526] p-5">
                <div className="text-lg font-semibold text-white">{item.title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">{item.body}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 rounded-[28px] border border-amber-300/20 bg-amber-300/8 p-5 text-sm leading-6 text-amber-50/80">
          {t(lang, {
            en: "Important: Syntrake is decision-support software. It does not promise profits, automate execution, or remove trader responsibility. The value is discipline before action.",
            pt: "Importante: Syntrake e software de apoio a decisao. Nao promete lucros, nao executa automaticamente e nao remove responsabilidade do trader. O valor e disciplina antes da acao.",
            es: "Importante: Syntrake es software de apoyo a decision. No promete beneficios, no ejecuta automaticamente y no elimina responsabilidad del trader. El valor es disciplina antes de actuar.",
            fr: "Important: Syntrake est un logiciel d'aide a la decision. Il ne promet pas de profits, n'execute pas automatiquement et ne retire pas la responsabilite du trader. La valeur est la discipline avant l'action.",
            de: "Wichtig: Syntrake ist Decision-Support-Software. Es verspricht keine Gewinne, fuehrt nicht automatisch aus und nimmt dem Trader keine Verantwortung ab. Der Wert ist Disziplin vor Aktion.",
            it: "Importante: Syntrake e software di supporto decisionale. Non promette profitti, non esegue automaticamente e non rimuove responsabilita del trader. Il valore e disciplina prima dell'azione.",
          })}
        </div>
      </section>
    </main>
  );
}

import type { WeeklyAdvisorData, Locale } from "../lib/weeklyAdvisor";

export function WeeklyAdvisorView({
  data,
  isPro,
  locale,
}: {
  data: WeeklyAdvisorData;
  isPro: boolean;
  locale: Locale;
}) {
  const t = {
    en: {
      title: "THIS WEEK",
      market: "Market Stance",
      crypto: "Crypto Stance",
      whyTitle: "Why this stance",
      proOnly: "Unlock full weekly guidance",
      teaser: "This week rewards selectivity over urgency.",
      cta: "Become a member",
      pricingHref: "/pricing",
    },
    pt: {
      title: "ESTA SEMANA",
      market: "Postura do mercado",
      crypto: "Postura cripto",
      whyTitle: "Porque",
      proOnly: "Desbloqueia a visão semanal completa",
      teaser: "Esta semana recompensa seletividade, não urgência.",
      cta: "Tornar-me membro",
      pricingHref: "/pt/pricing",
    },
  }[locale];

  return (
    <section className="rounded-3xl border border-border-soft bg-white p-8 shadow-soft">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold text-ink-500">{t.title}</p>
        <p className="text-xs text-ink-500">{data.updatedAt}</p>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-lg font-semibold">
          {t.market}:{" "}
          {isPro ? data.marketStance : <span className="opacity-40">—</span>}
        </p>

        <p className="text-lg font-semibold">
          {t.crypto}:{" "}
          {isPro ? data.cryptoStance : <span className="opacity-40">—</span>}
        </p>
      </div>

      {!isPro ? (
        <div className="mt-6 rounded-2xl border border-border-soft bg-canvas-50 p-4">
          <p className="text-sm text-ink-700 italic">{t.teaser}</p>
          <p className="mt-3 text-sm font-semibold text-ink-900">{t.proOnly}</p>

          <a
            href={t.pricingHref}
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-signal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-signal-800 shadow-soft"
          >
            {t.cta}
          </a>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <p className="text-sm font-semibold">{t.whyTitle}</p>

            <ul className="mt-2 space-y-1 text-sm text-ink-700">
              {data.why.map((item) => (
                <li key={item}>– {item}</li>
              ))}
            </ul>
          </div>

          <div className="mt-6 border-t border-border-soft pt-4">
            <p className="text-sm italic text-ink-700">{data.guidance}</p>
          </div>
        </>
      )}
    </section>
  );
}
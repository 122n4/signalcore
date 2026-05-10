import Link from "next/link";
import React from "react";

type ProofRailStat = {
  label: string;
  value: string;
  detail: string;
};

type ProofRailCard = {
  title: string;
  body: string;
  bullets?: string[];
};

type ProofRailLink = {
  label: string;
  href: string;
  tone?: "primary" | "secondary";
};

type ProofRailProps = {
  eyebrow: string;
  title: string;
  body: string;
  stats: ProofRailStat[];
  cards?: ProofRailCard[];
  links?: ProofRailLink[];
  footnote?: string;
  theme?: "dark" | "light";
};

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function ProofRail({
  eyebrow,
  title,
  body,
  stats,
  cards = [],
  links = [],
  footnote,
  theme = "light",
}: ProofRailProps) {
  const shellClasses =
    theme === "dark"
      ? "border-[#23314c] bg-[linear-gradient(180deg,#111c31_0%,#0d1729_100%)] text-[#eef5ff] shadow-[0_18px_50px_rgba(0,0,0,.28)]"
      : "border-border-soft bg-white text-ink-900 shadow-card";
  const mutedClasses = theme === "dark" ? "text-[#91a3bc]" : "text-ink-700";
  const eyebrowClasses = theme === "dark" ? "text-[#9bc3ff]" : "text-ink-500";
  const statShellClasses =
    theme === "dark"
      ? "border-[#23314c] bg-[#0d182d]"
      : "border-border-soft bg-canvas-50";
  const cardShellClasses =
    theme === "dark"
      ? "border-[#23314c] bg-[#0d182d]"
      : "border-border-soft bg-canvas-50";
  const bulletDotClasses = theme === "dark" ? "bg-[#4f8cff]" : "bg-ink-900";

  return (
    <section className={clsx("rounded-[22px] border p-6", shellClasses)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className={clsx("text-xs font-semibold uppercase tracking-[0.18em]", eyebrowClasses)}>
            {eyebrow}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{title}</div>
          <div className={clsx("mt-3 text-sm leading-6", mutedClasses)}>{body}</div>
        </div>
        {links.length ? (
          <div className="flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={`${link.label}:${link.href}`}
                href={link.href}
                className={clsx(
                  "inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition",
                  link.tone === "primary"
                    ? theme === "dark"
                      ? "bg-[#4f8cff] text-white hover:brightness-110"
                      : "bg-signal-700 text-white hover:bg-signal-800"
                    : theme === "dark"
                      ? "border border-[#31415f] bg-[#0d182d] text-[#eef5ff] hover:border-[#4f8cff]"
                      : "border border-border-soft bg-white text-ink-900 hover:bg-canvas-50",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={`${stat.label}:${stat.value}`} className={clsx("rounded-2xl border p-4", statShellClasses)}>
            <div className={clsx("text-[11px] uppercase tracking-[0.16em]", mutedClasses)}>{stat.label}</div>
            <div className="mt-2 text-xl font-semibold">{stat.value}</div>
            <div className={clsx("mt-2 text-sm leading-6", mutedClasses)}>{stat.detail}</div>
          </div>
        ))}
      </div>

      {cards.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {cards.map((card) => (
            <div key={card.title} className={clsx("rounded-2xl border p-4", cardShellClasses)}>
              <div className="text-sm font-semibold">{card.title}</div>
              <div className={clsx("mt-2 text-sm leading-6", mutedClasses)}>{card.body}</div>
              {card.bullets?.length ? (
                <ul className={clsx("mt-3 space-y-2 text-sm", mutedClasses)}>
                  {card.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className={clsx("mt-2 h-1.5 w-1.5 rounded-full", bulletDotClasses)} />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {footnote ? <div className={clsx("mt-5 text-xs", mutedClasses)}>{footnote}</div> : null}
    </section>
  );
}

"use client";

import React from "react";

import { buildWorkspaceIdentityRailModel } from "@/app/app/workspaceIdentity";
import type { ViewKey } from "@/app/app/navigationModel";
import { pickByLang, type SiteLang } from "@/lib/i18n/siteLanguage";
import type { AutopilotMode } from "@/lib/signalcore/modes";

function statToneClasses(tone: "neutral" | "good" | "warn" | "accent") {
  if (tone === "good") return "border-emerald-400/18 bg-emerald-400/10 text-emerald-100";
  if (tone === "warn") return "border-amber-400/18 bg-amber-400/10 text-amber-100";
  if (tone === "accent") return "border-cyan-300/18 bg-cyan-300/10 text-cyan-100";
  return "border-white/10 bg-white/[0.04] text-white/78";
}

export default function WorkspaceIdentityRail(props: {
  lang: SiteLang;
  mode: AutopilotMode;
  view: ViewKey;
  tier: "free" | "trial" | "pro";
  onNavigate: (href: string) => void;
}) {
  const model = buildWorkspaceIdentityRailModel({
    mode: props.mode,
    view: props.view,
    tier: props.tier,
    lang: props.lang,
  });

  const primaryHref =
    props.mode === "trading"
      ? props.view === "opportunities"
        ? "/app?tab=trading&mode=trading"
        : "/app?tab=opportunities&mode=trading"
      : props.view === "planning"
        ? "/app?tab=daily&mode=investing"
        : "/app?tab=planning&mode=investing";

  const secondaryHref =
    props.mode === "trading" && props.tier !== "free"
      ? "/app?tab=execution&mode=trading"
      : props.mode === "trading"
        ? "/pricing?source=workspace_identity_trading"
        : "/trust?source=workspace_identity_investing";

  const shellClasses =
    model.tone === "trading"
      ? "border-amber-400/14 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_32%),linear-gradient(180deg,rgba(18,27,46,0.96),rgba(10,16,28,0.98))]"
      : "border-emerald-400/14 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_32%),linear-gradient(180deg,rgba(17,31,47,0.96),rgba(10,18,31,0.98))]";

  const badgeClasses =
    model.tone === "trading"
      ? "border-amber-400/18 bg-amber-400/10 text-amber-100"
      : "border-emerald-400/18 bg-emerald-400/10 text-emerald-100";

  return (
    <section className={`rounded-[26px] border p-6 shadow-[0_24px_70px_rgba(0,0,0,0.24)] ${shellClasses}`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${badgeClasses}`}>
            {model.eyebrow}
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-white md:text-4xl">
            {model.headline}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-[15px]">
            {model.summary}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => props.onNavigate(primaryHref)}
              className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#4f8cff,#6db3ff)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(49,115,255,0.22)] transition hover:brightness-110"
            >
              {model.primaryLabel}
            </button>
            <button
              type="button"
              onClick={() => props.onNavigate(secondaryHref)}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              {model.secondaryLabel}
            </button>
          </div>
        </div>

        <div className="grid w-full gap-3 sm:grid-cols-2 lg:max-w-[420px]">
          {model.stats.map((stat) => (
            <div key={stat.label} className={`rounded-2xl border p-4 ${statToneClasses(stat.tone)}`}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{stat.label}</div>
              <div className="mt-2 text-lg font-semibold tracking-tight">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {model.proofPoints.map((point) => (
          <div key={point} className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 text-sm leading-6 text-slate-200">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/42">
              {pickByLang(props.lang, {
                en: "Why this matters",
                pt: "Porque isto importa",
                es: "Por que importa",
                fr: "Pourquoi c est important",
                de: "Warum das zaehlt",
                it: "Perche conta",
              })}
            </div>
            {point}
          </div>
        ))}
      </div>
    </section>
  );
}

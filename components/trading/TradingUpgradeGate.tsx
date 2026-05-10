"use client";

import React from "react";
import Link from "next/link";
import UpgradeModal from "@/components/UpgradeModal";
import {
  buildTradingUpgradeModel,
  type TradingUpgradeSurface,
} from "@/components/trading/tradingUpgradeModel";

type TradingUpgradeGateProps = {
  surface: TradingUpgradeSurface;
};

export default function TradingUpgradeGate({ surface }: TradingUpgradeGateProps) {
  const [open, setOpen] = React.useState(false);
  const model = buildTradingUpgradeModel(surface);

  return (
    <section className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{model.eyebrow}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{model.title}</div>
      <div className="mt-3 max-w-3xl text-sm text-slate-300">{model.body}</div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{model.freeTitle}</div>
          <div className="mt-2 text-sm text-slate-300">{model.freeBody}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{model.trialTitle}</div>
          <div className="mt-2 text-sm text-slate-300">{model.trialBody}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{model.proTitle}</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {model.proBullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-[#4f8cff] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          {model.primaryCta}
        </button>
        <Link
          href={model.pricingHref}
          className="rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
        >
          {model.compareCta}
        </Link>
      </div>

      <UpgradeModal
        open={open}
        onClose={() => setOpen(false)}
        eyebrow={model.eyebrow}
        title={model.modalTitle}
        subtitle={model.modalSubtitle}
        primaryHref={model.pricingHref}
        primaryText={model.primaryCta}
        secondaryHref={model.pricingHref}
        secondaryText={model.compareCta}
        freeTitle={model.freeTitle}
        freeBody={model.freeBody}
        trialTitle={model.trialTitle}
        trialBody={model.trialBody}
        proTitle={model.proTitle}
        proBullets={model.proBullets}
      />
    </section>
  );
}

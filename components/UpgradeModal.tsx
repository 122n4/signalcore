"use client";

import React from "react";

export default function UpgradeModal({
  open,
  onClose,
  title = "Upgrade to Pro",
  subtitle = "Investing stays free forever. Upgrade when you want full trading execution depth.",
  primaryHref = "/pricing",
  primaryText = "See Pro pricing",
  eyebrow = "Upgrade",
  freeTitle = "Free",
  freeBody = "Full Investing + Trading Market Radar in discovery mode.",
  trialTitle,
  trialBody,
  proTitle = "Pro",
  proBullets = [
    "Trade Plan, Journal, and Alerts",
    "Deeper trading continuity and history",
    "Full market and workflow coverage",
    "Advanced safety and discipline layers",
  ],
  secondaryHref,
  secondaryText,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  primaryHref?: string;
  primaryText?: string;
  eyebrow?: string;
  freeTitle?: string;
  freeBody?: string;
  trialTitle?: string;
  trialBody?: string;
  proTitle?: string;
  proBullets?: string[];
  secondaryHref?: string;
  secondaryText?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-neutral-100 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{eyebrow}</div>
            <div className="mt-1 text-sm font-semibold text-neutral-900">{title}</div>
            <div className="text-xs text-neutral-500 mt-0.5">{subtitle}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-sm text-neutral-800">
            <div className="font-semibold">{freeTitle}</div>
            <div className="mt-1 text-neutral-700">{freeBody}</div>
          </div>

          {trialTitle && trialBody ? (
            <div className="rounded-xl border border-neutral-100 bg-[#f7f9ff] p-4 text-sm text-neutral-800">
              <div className="font-semibold">{trialTitle}</div>
              <div className="mt-1 text-neutral-700">{trialBody}</div>
            </div>
          ) : null}

          <div className="rounded-xl border border-neutral-100 bg-white p-4 text-sm text-neutral-800">
            <div className="font-semibold">{proTitle}</div>
            <ul className="mt-1 list-disc pl-5 text-neutral-700 space-y-1">
              {proBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50 p-4 text-xs leading-5 text-sky-950">
            <div className="font-semibold">Why Pro exists</div>
            <p className="mt-1">
              Pro is not more noise. It is the decision-control layer before execution: live verification, risk framing,
              broker preparation, and proof after the click.
            </p>
            <p className="mt-2 text-sky-800">
              Educational decision support only. No profit promises and no automatic broker execution.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-xl bg-neutral-950 px-4 py-2 text-sm font-semibold text-white"
            >
              {primaryText}
            </a>
            {secondaryHref && secondaryText ? (
              <a
                href={secondaryHref}
                className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900"
              >
                {secondaryText}
              </a>
            ) : null}
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-900"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

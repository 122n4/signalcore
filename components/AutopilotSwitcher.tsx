"use client";

import React from "react";
import type { AccessTier } from "@/lib/signalcore/entitlements";
import type { AutopilotMode } from "@/lib/signalcore/modes";
import { AUTOPILOT_MODES, modeLabel } from "@/lib/signalcore/modes";
import UpgradeModal from "@/components/UpgradeModal";

type Props = {
  mode: AutopilotMode;
  disabled?: boolean;
  isPaid?: boolean;
  tier?: AccessTier;
  allowedModes?: AutopilotMode[];
  proHint?: string;
  variant?: "default" | "compact";
  onChange: (m: AutopilotMode) => void | Promise<void>;
};

function classNames(...xs: Array<string | false | undefined | null>) {
  return xs.filter(Boolean).join(" ");
}

export default function AutopilotSwitcher({
  mode,
  disabled,
  isPaid,
  tier = "free",
  allowedModes,
  proHint,
  variant = "default",
  onChange,
}: Props) {
  const paid = Boolean(isPaid);
  const modeAllowance = new Set<AutopilotMode>(allowedModes && allowedModes.length ? allowedModes : AUTOPILOT_MODES);
  const [open, setOpen] = React.useState(false);

  if (variant === "compact") {
    return (
      <div className="rounded-[18px] border border-slate-800/80 bg-[#0d1628] px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Workspace
          </div>
          <div className="flex flex-wrap gap-2">
            {AUTOPILOT_MODES.map((candidateMode) => {
              const active = candidateMode === mode;
              const locked = !modeAllowance.has(candidateMode);
              return (
                <button
                  key={candidateMode}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (locked) {
                      setOpen(true);
                      return;
                    }
                    onChange(candidateMode);
                  }}
                  className={classNames(
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                    disabled ? "opacity-60" : "hover:border-slate-600 hover:bg-[#13213b]",
                    active
                      ? "border-sky-400/45 bg-sky-400/12 text-white"
                      : "border-slate-700/80 bg-[#0f1a2d] text-slate-300",
                    locked ? "opacity-60" : "",
                  )}
                  title={locked ? "Pro required" : undefined}
                >
                  {modeLabel(candidateMode)}
                </button>
              );
            })}
          </div>
        </div>

        <UpgradeModal
          open={open}
          onClose={() => setOpen(false)}
          title="Unlock full trading"
          subtitle="Investing stays free forever. Upgrade when you want execution, risk, journal, alerts, and deeper trading continuity."
          primaryText="Compare trading plans"
        />
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(17,28,49,0.88)_0%,rgba(13,23,41,0.94)_100%)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Choose workspace
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Start calm in Investing. Open Trading when execution depth matters.
          </div>
        </div>

        {proHint ? (
          <div className="rounded-full border border-slate-700/80 bg-[#0f1a2d] px-3 py-1 text-xs font-semibold text-slate-300">
            {proHint}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {AUTOPILOT_MODES.map((candidateMode) => {
          const active = candidateMode === mode;
          const locked = !modeAllowance.has(candidateMode);
          const tierTag =
            !paid && tier === "free"
              ? candidateMode === "investing"
                ? "FREE"
                : "DISCOVERY"
              : !paid && tier === "trial"
                ? "TRIAL"
                : null;

          return (
            <button
              key={candidateMode}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (locked) {
                  setOpen(true);
                  return;
                }
                onChange(candidateMode);
              }}
              className={classNames(
                "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                disabled ? "opacity-60" : "hover:border-slate-600 hover:bg-[#13213b]",
                active
                  ? "border-slate-700 bg-white text-slate-950 shadow-[0_12px_24px_rgba(255,255,255,0.08)]"
                  : "border-slate-700/80 bg-[#0f1a2d] text-slate-200",
                locked ? "opacity-60" : "",
              )}
              title={locked ? "Pro required" : undefined}
            >
              <span className="inline-flex items-center gap-2">
                {modeLabel(candidateMode)}
                {locked ? <span className="text-[10px] uppercase tracking-[0.12em]">PRO</span> : null}
                {tierTag ? <span className="text-[10px] opacity-80">{tierTag}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <UpgradeModal
        open={open}
        onClose={() => setOpen(false)}
        title="Unlock full trading"
        subtitle="Investing stays free forever. Upgrade when you want execution, risk, journal, alerts, and deeper trading continuity."
        primaryText="Compare trading plans"
      />
    </div>
  );
}

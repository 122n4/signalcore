"use client";

import { useMemo, useState } from "react";

import {
  canUseBrowserNotifications,
  getTradingNotificationPermission,
  readTradingNotificationsEnabled,
  requestTradingNotificationPermission,
  writeTradingNotificationsEnabled,
} from "@/lib/trading/browserNotifications";

type TradingNotificationSettingsCardProps = {
  eligibleCount: number;
};

export default function TradingNotificationSettingsCard({
  eligibleCount,
}: TradingNotificationSettingsCardProps) {
  const [enabled, setEnabled] = useState(() => readTradingNotificationsEnabled());
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => getTradingNotificationPermission());

  const statusLabel = useMemo(() => {
    if (!canUseBrowserNotifications()) return "Browser unsupported";
    if (permission === "granted") return enabled ? "Active monitoring on" : "Permission granted";
    if (permission === "denied") return "Blocked by browser";
    return "Permission needed";
  }, [enabled, permission]);

  async function handleRequestPermission() {
    const next = await requestTradingNotificationPermission();
    setPermission(next);
    if (next === "granted") {
      writeTradingNotificationsEnabled(true);
      setEnabled(true);
    }
  }

  function handleToggle() {
    const next = !enabled;
    writeTradingNotificationsEnabled(next);
    setEnabled(next);
  }

  return (
    <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Active notifications
          </div>
          <div className="mt-2 text-xl font-semibold text-white">
            Browser alerts for live setup changes
          </div>
        </div>
        <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 text-sm leading-6 text-slate-300">
        Syntrake will only escalate the strong changes that matter: validated setups, prepare-now upgrades, and clean shifts in execution posture.
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-[#101b30] p-4 text-sm text-slate-300">
        Browser-eligible signals in the current live stack: <span className="font-semibold text-white">{eligibleCount}</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {permission !== "granted" ? (
          <button
            type="button"
            onClick={() => void handleRequestPermission()}
            className="rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
          >
            Enable browser alerts
          </button>
        ) : (
          <button
            type="button"
            onClick={handleToggle}
            className="rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
          >
            {enabled ? "Pause notifications" : "Resume notifications"}
          </button>
        )}
      </div>
    </section>
  );
}

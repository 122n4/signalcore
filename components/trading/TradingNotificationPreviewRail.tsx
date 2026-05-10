import type { TradingNotificationEvent } from "@/lib/trading/notifications";

type TradingNotificationPreviewRailProps = {
  preview: TradingNotificationEvent[];
  hasProAlerts: boolean;
};

export default function TradingNotificationPreviewRail({
  preview,
  hasProAlerts,
}: TradingNotificationPreviewRailProps) {
  const lead = preview[0] ?? null;

  if (!lead) {
    return (
      <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-4 text-sm text-slate-300 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          Signal pulse
        </div>
        <div className="mt-2 text-sm text-slate-300">
          No high-urgency signal is firing right now. Syntrake stays quiet until a clean change deserves attention.
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-4 text-sm text-slate-300 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Signal pulse
          </div>
          <div className="mt-1 text-lg font-semibold text-white">{lead.title}</div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
            lead.severity === "high"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/25 bg-amber-500/10 text-amber-200"
          }`}
        >
          {lead.actionLabel}
        </span>
      </div>
      <div className="mt-2 text-sm leading-6 text-slate-300">{lead.body}</div>
      <div className="mt-3 text-xs text-slate-400">
        {hasProAlerts
          ? "Pro keeps this signal layer actively monitored with browser alerts when the desk escalates."
          : "Free shows the signal. Pro turns it into active monitoring and browser notifications."}
      </div>
    </section>
  );
}

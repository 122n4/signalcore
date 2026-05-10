import Link from "next/link";

import {
  resolveTradingActionGuidance,
  resolveTradingAlertGuidance,
  type TradingWatchlistEntry,
} from "@/lib/trading/state";

type TradingWorkspaceContinuityCardProps = {
  surface: "desk" | "execution" | "alerts";
  entry: TradingWatchlistEntry | null;
  isRefreshing?: boolean;
  snapshotBlocked?: boolean;
  snapshotFootnote?: string | null;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
};

function statusToneClasses(args: {
  isRefreshing?: boolean;
  snapshotBlocked?: boolean;
}) {
  if (args.snapshotBlocked) {
    return "border-rose-500/25 bg-rose-500/10 text-rose-200";
  }

  if (args.isRefreshing) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-200";
  }

  return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
}

function surfaceCopy(surface: "desk" | "execution" | "alerts") {
  if (surface === "execution") {
    return {
      eyebrow: "Execution continuity",
      title: "The cockpit should stay tied to the same live setup.",
      body:
        "Keep the current focus, the next operator step, and the next re-check in one place while the execution frame refreshes.",
    };
  }

  if (surface === "alerts") {
    return {
      eyebrow: "Alert continuity",
      title: "Alerts should explain the next move, not just the state change.",
      body:
        "Keep the live focus, the operator instruction, and the next re-check visible so the queue stays actionable.",
    };
  }

  return {
    eyebrow: "Desk continuity",
    title: "The desk should hold one continuous operator thread.",
    body:
      "Keep the live focus, the operator step, and the next alert cadence visible while the desk rotates underneath.",
  };
}

export default function TradingWorkspaceContinuityCard({
  surface,
  entry,
  isRefreshing = false,
  snapshotBlocked = false,
  snapshotFootnote,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: TradingWorkspaceContinuityCardProps) {
  const copy = surfaceCopy(surface);
  const actionGuidance = entry ? resolveTradingActionGuidance(entry) : null;
  const alertGuidance = entry ? resolveTradingAlertGuidance(entry) : null;
  const statusLabel = snapshotBlocked
    ? "Needs refresh"
    : isRefreshing
      ? "Refreshing"
      : "Continuous";

  const currentFocusTitle = entry?.instrument ?? "No live focus yet";
  const currentFocusBody = entry
    ? `${entry.contextSummary.sessionLabel} | ${entry.contextSummary.coverageLabel}`
    : "Syntrake is waiting for the next clean market to take the lead.";

  const nextStepTitle = actionGuidance?.label ?? (snapshotBlocked ? "Refresh first" : "Stand by");
  const nextStepBody =
    entry?.liveDecision.nextDisciplineStep ||
    actionGuidance?.headline ||
    actionGuidance?.summary ||
    entry?.liveDecision.currentHeadline ||
    "No live operator step is attached to this snapshot yet.";

  const nextRecheckTitle = alertGuidance?.badge ?? "No re-check queued";
  const nextRecheckBody = alertGuidance
    ? `${alertGuidance.recheckWindow}. ${alertGuidance.nextAlertCondition}`
    : "The next alert will appear when a market graduates into a cleaner state.";

  return (
    <section className="rounded-[22px] border border-slate-800/80 bg-[#0d1628] p-5 text-sm text-slate-300 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {copy.eyebrow}
          </div>
          <div className="mt-1 text-lg font-semibold text-white">{copy.title}</div>
          <div className="mt-2 text-sm text-slate-300">{copy.body}</div>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusToneClasses(
            {
              isRefreshing,
              snapshotBlocked,
            },
          )}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Current focus
          </div>
          <div className="mt-2 text-sm font-semibold text-white">{currentFocusTitle}</div>
          <div className="mt-2 text-sm text-slate-300">{currentFocusBody}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Next operator step
          </div>
          <div className="mt-2 text-sm font-semibold text-white">{nextStepTitle}</div>
          <div className="mt-2 text-sm text-slate-300">{nextStepBody}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-[#101b30] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Next re-check
          </div>
          <div className="mt-2 text-sm font-semibold text-white">{nextRecheckTitle}</div>
          <div className="mt-2 text-sm text-slate-300">{nextRecheckBody}</div>
        </div>
      </div>

      {snapshotFootnote ? (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-[#08111f] px-4 py-3 text-xs text-slate-400">
          {snapshotFootnote}
        </div>
      ) : null}

      {primaryHref && primaryLabel ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={primaryHref}
            className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-[#12203a] px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-600"
          >
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center rounded-xl border border-slate-700 bg-[#0f1a2d] px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
